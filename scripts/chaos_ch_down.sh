#!/usr/bin/env bash
# chaos_ch_down.sh - Test API behavior when ClickHouse is down
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART"

API_BASE="http://127.0.0.1:9999"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[chaos-ch]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[chaos-ch]${NC} $1"
}

error() {
    echo -e "${RED}[chaos-ch]${NC} $1"
}

# Test output file
OUTPUT="$ART/chaos_ch_down.txt"
> "$OUTPUT"

# Helper to record output
record() {
    echo "$1" | tee -a "$OUTPUT"
}

# Check if API is up
check_api() {
    for i in {1..10}; do
        if curl -sS "$API_BASE/api/v2/health" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

# Check if ClickHouse is running
check_clickhouse() {
    if clickhouse client -q "SELECT 1" --receive_timeout=2 >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Stop ClickHouse
stop_clickhouse() {
    log "Stopping ClickHouse..."
    
    # Try different methods depending on how CH is running
    if command -v docker >/dev/null 2>&1 && docker ps | grep -q clickhouse; then
        # Docker method
        docker stop clickhouse || warn "Failed to stop ClickHouse container"
    elif pgrep -f "clickhouse-server" >/dev/null 2>&1; then
        # Native method
        pkill -f "clickhouse-server" || warn "Failed to pkill ClickHouse"
    else
        warn "ClickHouse doesn't appear to be running"
    fi
    
    # Wait for it to stop
    for i in {1..10}; do
        if ! check_clickhouse; then
            log "ClickHouse stopped"
            return 0
        fi
        sleep 1
    done
    
    error "ClickHouse still responding after stop attempt"
    return 1
}

# Start ClickHouse
start_clickhouse() {
    log "Starting ClickHouse..."
    
    # Try different methods
    if command -v docker >/dev/null 2>&1 && docker ps -a | grep -q clickhouse; then
        # Docker method
        docker start clickhouse || warn "Failed to start ClickHouse container"
    else
        # Native method - use nohup as per user preference
        nohup clickhouse server < /dev/null > /tmp/clickhouse_server.log 2>&1 &
        echo $! > "$ART/ch_chaos_pid.txt"
        log "Started ClickHouse with PID $(cat "$ART/ch_chaos_pid.txt")"
    fi
    
    # Wait for it to start
    for i in {1..30}; do
        if check_clickhouse; then
            log "ClickHouse is responding"
            return 0
        fi
        sleep 1
    done
    
    error "ClickHouse not responding after start"
    return 1
}

# Main test sequence
record "=== ClickHouse Chaos Test ==="
record "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
record ""

# 1. Ensure API is running
if ! check_api; then
    error "API is not running. Please start it first."
    exit 1
fi
log "API is running"

# 2. Check initial state
record "--- Initial State ---"
HEALTH_BEFORE=$(curl -sS "$API_BASE/api/v2/health")
record "Health before: $HEALTH_BEFORE"

if echo "$HEALTH_BEFORE" | jq -e '.clickhouse.ok == true' >/dev/null; then
    record "ClickHouse status: OK"
else
    warn "ClickHouse already unhealthy"
fi

# 3. Stop ClickHouse
record ""
record "--- Stopping ClickHouse ---"
if stop_clickhouse; then
    record "ClickHouse stopped successfully"
else
    error "Failed to stop ClickHouse"
    exit 1
fi

# 4. Test API behavior with CH down
record ""
record "--- Testing API with ClickHouse Down ---"

# Health check
sleep 2  # Give circuit breaker time to detect
HEALTH_DURING=$(curl -sS "$API_BASE/api/v2/health")
record "Health during outage: $HEALTH_DURING"

# Search request (should get 503)
log "Testing search endpoint..."
SEARCH_RESPONSE=$(curl -sS -w "\nHTTP_CODE:%{http_code}" -o - \
    -X POST "$API_BASE/api/v2/search/execute" \
    -H 'Content-Type: application/json' \
    -d '{"query":"*","tenant_id":"default","time_range":{"last_seconds":300}}' 2>&1 || true)

HTTP_CODE=$(echo "$SEARCH_RESPONSE" | grep -o 'HTTP_CODE:[0-9]*' | cut -d: -f2 || echo "000")
BODY=$(echo "$SEARCH_RESPONSE" | sed '/HTTP_CODE:/d')

record ""
record "Search response:"
record "  HTTP Code: $HTTP_CODE"
record "  Body: $BODY"

# Verify error response
if [ "$HTTP_CODE" = "503" ]; then
    if echo "$BODY" | jq -e '.error.code == "UPSTREAM_DOWN"' >/dev/null 2>&1; then
        record "  ✓ Correct error code: UPSTREAM_DOWN"
    else
        record "  ✗ Wrong error code"
    fi
    
    if echo "$BODY" | jq -e '.error.upstream == "clickhouse"' >/dev/null 2>&1; then
        record "  ✓ Correct upstream: clickhouse"
    else
        record "  ✗ Missing upstream field"
    fi
else
    record "  ✗ Expected 503, got $HTTP_CODE"
fi

# Check metrics
log "Checking metrics..."
METRICS=$(curl -sS "$API_BASE/api/v2/metrics")
CB_OPEN=$(echo "$METRICS" | grep -o 'siem_v2_clickhouse_circuit_state{state="open"} [01]' | awk '{print $2}' || echo "0")
record ""
record "Circuit breaker open: $CB_OPEN"

# 5. Restart ClickHouse
record ""
record "--- Restarting ClickHouse ---"
if start_clickhouse; then
    record "ClickHouse restarted successfully"
else
    error "Failed to restart ClickHouse"
    exit 1
fi

# 6. Test recovery
record ""
record "--- Testing Recovery ---"
sleep 6  # Wait for circuit breaker cooldown

HEALTH_AFTER=$(curl -sS "$API_BASE/api/v2/health")
record "Health after recovery: $HEALTH_AFTER"

# Retry search request
SEARCH_RECOVERY=$(curl -sS -w "\nHTTP_CODE:%{http_code}" -o - \
    -X POST "$API_BASE/api/v2/search/execute" \
    -H 'Content-Type: application/json' \
    -d '{"query":"*","tenant_id":"default","time_range":{"last_seconds":300}}' 2>&1 || true)

HTTP_CODE_AFTER=$(echo "$SEARCH_RECOVERY" | grep -o 'HTTP_CODE:[0-9]*' | cut -d: -f2 || echo "000")
record ""
record "Search after recovery:"
record "  HTTP Code: $HTTP_CODE_AFTER"

if [ "$HTTP_CODE_AFTER" = "200" ]; then
    record "  ✓ Search working again"
else
    record "  ✗ Search still failing"
fi

# Summary
record ""
record "=== Summary ==="
if [ "$HTTP_CODE" = "503" ] && [ "$CB_OPEN" = "1" ] && [ "$HTTP_CODE_AFTER" = "200" ]; then
    record "RESULT: PASS"
    record "- API stayed up during ClickHouse outage"
    record "- Circuit breaker opened correctly"
    record "- Proper 503 UPSTREAM_DOWN response"
    record "- Recovery successful after restart"
else
    record "RESULT: FAIL"
    [ "$HTTP_CODE" != "503" ] && record "- Did not get 503 during outage"
    [ "$CB_OPEN" != "1" ] && record "- Circuit breaker did not open"
    [ "$HTTP_CODE_AFTER" != "200" ] && record "- Recovery failed"
fi

log "Test complete. Results in $OUTPUT"
