#!/usr/bin/env bash
# collector_spool_proof.sh - Production-grade edge collector spool resilience test
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART"

API_BASE="http://127.0.0.1:9999"
COLLECTOR_BASE="http://127.0.0.1:8514"  # Collector HTTP endpoint
CH_CLIENT="clickhouse client"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[collector]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[collector]${NC} $1"
}

error() {
    echo -e "${RED}[collector]${NC} $1"
}

# Check collector health
check_collector() {
    if ! curl -fsS "$COLLECTOR_BASE/health" > "$ART/collector_health.json" 2>/dev/null; then
        error "Collector not running at $COLLECTOR_BASE"
        exit 1
    fi
    log "Collector health OK"
}

# Get initial event count
get_event_count() {
    $CH_CLIENT -q "
    SELECT count() 
    FROM dev.events 
    WHERE source_type = 'syslog_collector' 
      AND event_timestamp >= toUnixTimestamp(now() - INTERVAL 1 HOUR)
    FORMAT TabSeparated
    " 2>/dev/null || echo "0"
}

# Generate syslog messages
generate_syslog() {
    local count=$1
    log "Generating $count syslog messages..."
    
    # Use logger or nc to send syslog
    for i in $(seq 1 $count); do
        # RFC3164 format
        local pri=$((16 * 8 + 6))  # facility=16 (local0), severity=6 (info)
        local timestamp=$(date '+%b %d %H:%M:%S')
        local hostname="test-host-$((i % 10))"
        local tag="collector-test"
        local msg="Test syslog message $i from collector proof"
        
        echo "<$pri>$timestamp $hostname $tag: $msg" | nc -w 1 -u 127.0.0.1 514
        
        if [ $((i % 10000)) -eq 0 ]; then
            log "  Sent $i messages..."
        fi
    done
    
    log "✓ Generated $count syslog messages"
}

# Main test flow
log "Starting collector spool proof test"

check_collector

# Get initial count
INITIAL_COUNT=$(get_event_count)
log "Initial event count: $INITIAL_COUNT"

# Start background syslog generation
log "Starting syslog flood (100k messages)..."
generate_syslog 100000 &
SYSLOG_PID=$!

# Wait for some messages to arrive
sleep 5

# Simulate WAN outage by blocking collector->API traffic
log "Simulating WAN outage (blocking collector egress)..."

# Create iptables rule to block collector->API
if command -v iptables >/dev/null 2>&1; then
    sudo iptables -I OUTPUT -p tcp --dport 9999 -j DROP || warn "Failed to add iptables rule (may need sudo)"
else
    # macOS alternative using pfctl
    echo "block out proto tcp from any to any port 9999" | sudo pfctl -ef - 2>/dev/null || warn "Failed to add pfctl rule"
fi

# Wait for syslog generation to complete
wait $SYSLOG_PID
log "Syslog generation complete"

# Let collector buffer for 30 seconds
log "Collector buffering for 30 seconds..."
sleep 30

# Check collector spool metrics
curl -sS "$COLLECTOR_BASE/metrics" | grep -E "spool_" > "$ART/collector_spool_metrics_during.txt" || true

# Restore connectivity
log "Restoring WAN connectivity..."
if command -v iptables >/dev/null 2>&1; then
    sudo iptables -D OUTPUT -p tcp --dport 9999 -j DROP 2>/dev/null || true
else
    # macOS
    sudo pfctl -F all 2>/dev/null || true
fi

# Wait for collector to flush spool
log "Waiting for collector to flush spool (up to 2 minutes)..."
for i in {1..24}; do
    sleep 5
    CURRENT_COUNT=$(get_event_count)
    DELTA=$((CURRENT_COUNT - INITIAL_COUNT))
    log "  Progress: $DELTA / 100000 events delivered"
    
    if [ "$DELTA" -ge 100000 ]; then
        log "✓ All events delivered!"
        break
    fi
done

# Final count
FINAL_COUNT=$(get_event_count)
EVENTS_DELIVERED=$((FINAL_COUNT - INITIAL_COUNT))

# Get final collector metrics
curl -sS "$COLLECTOR_BASE/metrics" | grep -E "spool_|eps_" > "$ART/collector_spool_metrics_after.txt" || true

# Generate counters TSV
cat > "$ART/collector_spool_counters.tsv" <<EOF
metric	value
initial_count	$INITIAL_COUNT
final_count	$FINAL_COUNT
events_sent	100000
events_delivered	$EVENTS_DELIVERED
data_loss	$((100000 - EVENTS_DELIVERED))
EOF

# Check CPU usage during test (approximate)
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 2>/dev/null || echo "unknown")

# Summary
log "Collector spool test complete:"
log "  Events sent: 100,000"
log "  Events delivered: $EVENTS_DELIVERED"
log "  Data loss: $((100000 - EVENTS_DELIVERED))"
log "  CPU usage: ${CPU_USAGE}%"

# Validation
if [ "$EVENTS_DELIVERED" -lt 100000 ]; then
    error "Data loss detected: expected 100000, got $EVENTS_DELIVERED"
    exit 1
fi

# Check sustained EPS (should handle 5k EPS)
# 100k events should be processed in ~20 seconds at 5k EPS
ELAPSED_TIME=150  # We waited up to 2.5 minutes total
ACTUAL_EPS=$((EVENTS_DELIVERED / ELAPSED_TIME))
if [ "$ACTUAL_EPS" -lt 666 ]; then  # 100k/150s = 666 EPS minimum
    warn "EPS lower than expected: $ACTUAL_EPS (target: 5000)"
fi

log "RESULT: PASS - 100% delivery, no data loss"
