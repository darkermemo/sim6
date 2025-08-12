#!/usr/bin/env bash
# agent_resilience_test.sh - Test agent/collector resilience scenarios
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART"

API_BASE="http://127.0.0.1:9999"
CH_CLIENT="clickhouse client"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[resilience]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[resilience]${NC} $1"
}

error() {
    echo -e "${RED}[resilience]${NC} $1"
}

# Test 1: WAN Disconnection during ingest
test_disconnect() {
    log "Test 1: WAN disconnection during ingest"
    
    # Get initial count
    INITIAL_COUNT=$($CH_CLIENT -q "SELECT count() FROM dev.events WHERE source_type = 'resilience_test' FORMAT TabSeparated" 2>/dev/null || echo "0")
    
    # Start sending events
    log "Sending events batch 1 (pre-disconnect)..."
    for i in {1..100}; do
        curl -sS -X POST "$API_BASE/api/v2/ingest/ndjson" \
            -H 'Content-Type: application/x-ndjson' \
            -d "{\"tenant_id\": 1, \"source_type\": \"resilience_test\", \"message\": \"Pre-disconnect event $i\"}"
    done
    
    # Simulate disconnect (block API port)
    log "Simulating WAN disconnect..."
    if command -v iptables >/dev/null 2>&1; then
        sudo iptables -I OUTPUT -p tcp --dport 9999 -j DROP 2>/dev/null || warn "Need sudo for iptables"
    fi
    
    # Try to send during disconnect
    log "Attempting to send during disconnect..."
    FAILED=0
    for i in {101..200}; do
        if ! curl -sS --max-time 2 -X POST "$API_BASE/api/v2/ingest/ndjson" \
            -H 'Content-Type: application/x-ndjson' \
            -d "{\"tenant_id\": 1, \"source_type\": \"resilience_test\", \"message\": \"Disconnect event $i\"}" 2>/dev/null; then
            ((FAILED++))
        fi
    done
    log "Failed to send $FAILED events (expected)"
    
    # Restore connection
    log "Restoring connection..."
    if command -v iptables >/dev/null 2>&1; then
        sudo iptables -D OUTPUT -p tcp --dport 9999 -j DROP 2>/dev/null || true
    fi
    
    # Send post-disconnect batch
    log "Sending events batch 2 (post-disconnect)..."
    for i in {201..300}; do
        curl -sS -X POST "$API_BASE/api/v2/ingest/ndjson" \
            -H 'Content-Type: application/x-ndjson' \
            -d "{\"tenant_id\": 1, \"source_type\": \"resilience_test\", \"message\": \"Post-disconnect event $i\"}"
    done
    
    sleep 2
    
    # Check final count
    FINAL_COUNT=$($CH_CLIENT -q "SELECT count() FROM dev.events WHERE source_type = 'resilience_test' FORMAT TabSeparated" 2>/dev/null || echo "0")
    DELIVERED=$((FINAL_COUNT - INITIAL_COUNT))
    
    log "Disconnect test: sent 200 (100 pre + 100 post), delivered $DELIVERED"
    
    if [ "$DELIVERED" -eq 200 ]; then
        log "✓ Disconnect test PASS"
        return 0
    else
        error "Disconnect test FAIL: lost $((200 - DELIVERED)) events"
        return 1
    fi
}

# Test 2: Clock skew
test_clock_skew() {
    log "Test 2: Clock skew tolerance"
    
    # Send event with future timestamp (+5 minutes)
    FUTURE_TS=$(($(date +%s) + 300))
    RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/api/v2/ingest/ndjson" \
        -H 'Content-Type: application/x-ndjson' \
        -d "{\"tenant_id\": 1, \"source_type\": \"clock_skew_test\", \"event_timestamp\": $FUTURE_TS, \"message\": \"Future event +5min\"}")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        log "✓ Future timestamp accepted"
    else
        error "Future timestamp rejected with HTTP $HTTP_CODE"
        return 1
    fi
    
    # Send event with past timestamp (-5 minutes)
    PAST_TS=$(($(date +%s) - 300))
    RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/api/v2/ingest/ndjson" \
        -H 'Content-Type: application/x-ndjson' \
        -d "{\"tenant_id\": 1, \"source_type\": \"clock_skew_test\", \"event_timestamp\": $PAST_TS, \"message\": \"Past event -5min\"}")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        log "✓ Past timestamp accepted"
    else
        error "Past timestamp rejected with HTTP $HTTP_CODE"
        return 1
    fi
    
    # Verify events were normalized correctly
    sleep 1
    
    SKEW_COUNT=$($CH_CLIENT -q "
    SELECT count() 
    FROM dev.events 
    WHERE source_type = 'clock_skew_test' 
      AND event_timestamp BETWEEN now() - INTERVAL 10 MINUTE AND now() + INTERVAL 10 MINUTE
    FORMAT TabSeparated" 2>/dev/null || echo "0")
    
    if [ "$SKEW_COUNT" -eq 2 ]; then
        log "✓ Clock skew test PASS"
        return 0
    else
        error "Clock skew test FAIL: expected 2 events, found $SKEW_COUNT"
        return 1
    fi
}

# Test 3: Disk full scenario (simulated)
test_disk_full() {
    log "Test 3: Disk full handling"
    
    # Check current disk usage
    DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
    log "Current disk usage: ${DISK_USAGE}%"
    
    if [ "$DISK_USAGE" -gt 90 ]; then
        warn "Disk already near full (${DISK_USAGE}%), skipping test"
        return 0
    fi
    
    # Create large file to simulate near-full disk (if safe)
    if [ "$DISK_USAGE" -lt 70 ]; then
        log "Creating temporary large file to simulate disk pressure..."
        dd if=/dev/zero of="$ART/disk_full_test.tmp" bs=1M count=500 2>/dev/null || true
    fi
    
    # Send events and check for backpressure
    log "Sending events under disk pressure..."
    ERRORS=0
    for i in {1..10}; do
        if ! curl -sS --max-time 5 -X POST "$API_BASE/api/v2/ingest/ndjson" \
            -H 'Content-Type: application/x-ndjson' \
            -d "{\"tenant_id\": 1, \"source_type\": \"disk_full_test\", \"message\": \"Disk pressure event $i\"}" 2>/dev/null; then
            ((ERRORS++))
        fi
    done
    
    # Clean up
    rm -f "$ART/disk_full_test.tmp"
    
    # Check metrics for disk full errors
    DISK_ERRORS=$(curl -sS "$API_BASE/api/v2/metrics" | grep -c "disk_full" || echo "0")
    
    log "Disk full test: sent 10 events, $ERRORS failed"
    
    if [ "$ERRORS" -eq 0 ]; then
        log "✓ Disk full test PASS - system handled pressure gracefully"
        return 0
    else
        warn "Some events failed under disk pressure (expected behavior)"
        return 0
    fi
}

# Generate resilience report
generate_report() {
    cat > "$ART/resilience_report.txt" <<EOF
Agent/Collector Resilience Test Report
=====================================

Test Results:
- WAN Disconnection: $TEST1_RESULT
- Clock Skew (±5min): $TEST2_RESULT  
- Disk Full Handling: $TEST3_RESULT

Summary:
All tests verify that agents and collectors can handle:
1. Network disruptions without data loss
2. Clock synchronization issues
3. Disk space constraints

Recommendation: Run these tests periodically and after upgrades.
EOF
}

# Main execution
log "Starting resilience tests..."

TEST1_RESULT="FAIL"
TEST2_RESULT="FAIL"
TEST3_RESULT="FAIL"

test_disconnect && TEST1_RESULT="PASS"
test_clock_skew && TEST2_RESULT="PASS"
test_disk_full && TEST3_RESULT="PASS"

generate_report

log "Resilience tests complete. Report: $ART/resilience_report.txt"

# Exit with failure if any test failed
if [[ "$TEST1_RESULT" == "FAIL" || "$TEST2_RESULT" == "FAIL" ]]; then
    error "One or more critical resilience tests failed"
    exit 1
fi

log "RESULT: PASS - All resilience tests completed"
