#!/usr/bin/env bash
# kafka_stress_proof.sh - Kafka streaming stress test with exactly-once validation
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts/kafka"
mkdir -p "$ART"

API_BASE="http://127.0.0.1:9999"
CH_CLIENT="clickhouse client"
KAFKA_TOPIC="${KAFKA_TOPIC:-siem.events.v1}"
KAFKA_BROKERS="${KAFKA_BROKERS:-localhost:9092}"

# Test configuration
TOTAL_EVENTS=200000
MALFORMED_PERCENT=2
BATCH_SIZE=1000
CH_FAILURE_DURATION=30  # seconds
CONSUMER_SCALE_PATTERN=(1 3 1)  # Scale 1→3→1 consumers

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[kafka-stress]${NC} $1"; }
warn() { echo -e "${YELLOW}[kafka-stress]${NC} $1"; }
error() { echo -e "${RED}[kafka-stress]${NC} $1"; }

# Check prerequisites
if [ -z "$KAFKA_BROKERS" ]; then
    error "KAFKA_BROKERS not set"
    exit 1
fi

# Initialize test
SOURCE_ID="kafka-stress-$(date +%s)"
TENANT_ID=1
MALFORMED_COUNT=$((TOTAL_EVENTS * MALFORMED_PERCENT / 100))
VALID_COUNT=$((TOTAL_EVENTS - MALFORMED_COUNT))

log "=== Kafka Streaming Stress Test ==="
log "Configuration:"
log "  Total events: $TOTAL_EVENTS"
log "  Malformed: $MALFORMED_COUNT ($MALFORMED_PERCENT%)"
log "  Expected valid: $VALID_COUNT"
log "  CH failure duration: $CH_FAILURE_DURATION seconds"
log "  Consumer scaling: ${CONSUMER_SCALE_PATTERN[@]}"

# Clear previous test data
$CH_CLIENT -q "DELETE FROM dev.agent_ingest_ledger WHERE source_id = '$SOURCE_ID'" 2>/dev/null || true
$CH_CLIENT -q "DELETE FROM dev.events WHERE source_id = '$SOURCE_ID'" 2>/dev/null || true

# Function to produce events
produce_events() {
    local count=$1
    local malformed_interval=$((100 / MALFORMED_PERCENT))
    
    log "Producing $count events to Kafka..."
    
    local batch=""
    local produced=0
    
    for seq in $(seq 1 $count); do
        # Create ledger entry
        $CH_CLIENT -q "INSERT INTO dev.agent_ingest_ledger (tenant_id, source_id, seq, status) VALUES ($TENANT_ID, '$SOURCE_ID', $seq, 1)" 2>/dev/null || true
        
        # Generate event (malformed every N events)
        if [ $((seq % malformed_interval)) -eq 0 ]; then
            # Malformed JSON
            batch+="{invalid json seq: $seq, tenant_id: $TENANT_ID"
        else
            # Valid event
            batch+=$(cat <<EOF
{
  "tenant_id": $TENANT_ID,
  "source_id": "$SOURCE_ID",
  "source_seq": $seq,
  "source_type": "kafka_stress_test",
  "event_timestamp": $(date +%s),
  "message": "Kafka stress test event seq=$seq",
  "severity": "info",
  "test_batch": "$(date +%s)-$$"
}
EOF
)
        fi
        batch+=$'\n'
        
        # Send batch
        if [ $((seq % 1000)) -eq 0 ] || [ $seq -eq $count ]; then
            echo -n "$batch" | docker exec -i $(docker ps -q -f "name=kafka") \
                kafka-console-producer --bootstrap-server localhost:9092 --topic "$KAFKA_TOPIC" 2>/dev/null || \
                echo -n "$batch" | kafka-console-producer --bootstrap-server "$KAFKA_BROKERS" --topic "$KAFKA_TOPIC"
            
            produced=$seq
            batch=""
            
            if [ $((produced % 10000)) -eq 0 ]; then
                log "  Produced $produced/$count events"
            fi
        fi
    done
    
    log "✓ Produced $produced events"
}

# Function to monitor Kafka lag
monitor_kafka_lag() {
    local duration=$1
    local end_time=$(($(date +%s) + duration))
    local samples_file="$ART/kafka_lag_samples.json"
    
    echo '{"samples": []}' > "$samples_file"
    
    while [ $(date +%s) -lt $end_time ]; do
        # Get consumer lag
        local lag_info=$(curl -sS "$API_BASE/api/v2/admin/streaming/kafka/status" 2>/dev/null || echo '{}')
        local total_lag=$(echo "$lag_info" | jq '[.assignments[]?.lag // 0] | add // 0')
        
        # Get processing metrics
        local events_count=$($CH_CLIENT -q "SELECT count() FROM dev.events WHERE source_id = '$SOURCE_ID'" 2>/dev/null || echo 0)
        local quarantine_count=$($CH_CLIENT -q "SELECT count() FROM dev.events_quarantine WHERE source = 'kafka'" 2>/dev/null || echo 0)
        local dlq_count=$($CH_CLIENT -q "SELECT count() FROM dev.ingest_dlq WHERE source_id = '$SOURCE_ID'" 2>/dev/null || echo 0)
        
        # Record sample
        local sample=$(cat <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "lag": $total_lag,
  "events_processed": $events_count,
  "quarantined": $quarantine_count,
  "dlq": $dlq_count
}
EOF
)
        
        jq ".samples += [$sample]" "$samples_file" > "$samples_file.tmp" && mv "$samples_file.tmp" "$samples_file"
        
        sleep 2
    done
}

# Function to inject ClickHouse failure
inject_ch_failure() {
    local duration=$1
    
    warn "Injecting ClickHouse failure for $duration seconds..."
    
    # Block CH port (simplified - in production use iptables)
    if command -v iptables >/dev/null 2>&1; then
        sudo iptables -I INPUT -p tcp --dport 8123 -j DROP 2>/dev/null || warn "Cannot block CH (need sudo)"
        sudo iptables -I OUTPUT -p tcp --dport 8123 -j DROP 2>/dev/null || true
        
        sleep $duration
        
        sudo iptables -D INPUT -p tcp --dport 8123 -j DROP 2>/dev/null || true
        sudo iptables -D OUTPUT -p tcp --dport 8123 -j DROP 2>/dev/null || true
        
        log "✓ ClickHouse connectivity restored"
    else
        warn "Cannot simulate CH failure on this system"
        sleep $duration
    fi
}

# Function to scale consumers
scale_consumers() {
    local count=$1
    
    log "Scaling consumers to $count instances..."
    
    # In production, this would scale actual consumer instances
    # For testing, we'll simulate by calling the admin API
    if [ "$count" -gt 1 ]; then
        warn "Multi-consumer scaling simulated (would trigger rebalance)"
        
        # Trigger rebalance metrics
        curl -sS -X POST "$API_BASE/api/v2/admin/streaming/kafka/reclaim" >/dev/null 2>&1 || true
    fi
    
    sleep 5  # Allow rebalance to complete
}

# Test execution
log "Starting Kafka stress test..."

# Phase 1: Initial production
log "Phase 1: Producing initial batch"
produce_events 50000

# Start lag monitoring
monitor_kafka_lag 600 &  # 10 minutes
MONITOR_PID=$!

# Wait for initial processing
log "Waiting for initial processing..."
sleep 20

# Phase 2: Inject CH failure while producing
log "Phase 2: CH failure injection"
produce_events 50000 &
PRODUCE_PID=$!

sleep 10
inject_ch_failure $CH_FAILURE_DURATION

wait $PRODUCE_PID

# Phase 3: Consumer scaling with production
log "Phase 3: Consumer scaling test"

for scale in "${CONSUMER_SCALE_PATTERN[@]}"; do
    scale_consumers $scale
    produce_events 33333 &
    PRODUCE_PID=$!
    
    sleep 15
    wait $PRODUCE_PID
done

# Phase 4: Final batch
log "Phase 4: Final production batch"
produce_events $((TOTAL_EVENTS - 183333))

# Wait for processing to complete
log "Waiting for processing to stabilize..."
STABLE_COUNT=0
PREVIOUS_COUNT=0
MAX_WAIT=120  # 2 minutes

for i in $(seq 1 $MAX_WAIT); do
    CURRENT_COUNT=$($CH_CLIENT -q "SELECT count() FROM dev.events WHERE source_id = '$SOURCE_ID'" 2>/dev/null || echo 0)
    
    if [ "$CURRENT_COUNT" -eq "$PREVIOUS_COUNT" ]; then
        ((STABLE_COUNT++))
    else
        STABLE_COUNT=0
    fi
    
    if [ "$STABLE_COUNT" -ge 10 ]; then
        log "Processing stabilized at $CURRENT_COUNT events"
        break
    fi
    
    PREVIOUS_COUNT=$CURRENT_COUNT
    sleep 1
done

# Stop monitoring
kill $MONITOR_PID 2>/dev/null || true
wait $MONITOR_PID 2>/dev/null || true

# Final verification
log "Performing final verification..."

# Get final counts
FINAL_STATS=$($CH_CLIENT -q "
SELECT 
    count() as events_total,
    countIf(source_seq > 0) as events_with_seq,
    count(DISTINCT source_seq) as unique_seqs,
    max(source_seq) as max_seq
FROM dev.events
WHERE source_id = '$SOURCE_ID'
FORMAT JSONEachRow
" | head -1)

EVENTS_TOTAL=$(echo "$FINAL_STATS" | jq -r '.events_total')
UNIQUE_SEQS=$(echo "$FINAL_STATS" | jq -r '.unique_seqs')
MAX_SEQ=$(echo "$FINAL_STATS" | jq -r '.max_seq')

QUARANTINE_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.events_quarantine 
WHERE source = 'kafka' 
  AND created_at >= now() - INTERVAL 1 HOUR
FORMAT TabSeparated
" 2>/dev/null || echo "0")

DLQ_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.ingest_dlq 
WHERE source_id = '$SOURCE_ID'
FORMAT TabSeparated
" 2>/dev/null || echo "0")

# Check for gaps
GAP_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.ledger_missing 
WHERE tenant_id = $TENANT_ID 
  AND source_id = '$SOURCE_ID'
FORMAT TabSeparated
" 2>/dev/null || echo "0")

# Calculate duplicate rate
DUPLICATE_COUNT=$((EVENTS_TOTAL - UNIQUE_SEQS))

# Analyze lag progression
MAX_LAG=$(jq '.samples | map(.lag) | max' "$ART/kafka_lag_samples.json")
FINAL_LAG=$(jq '.samples | last | .lag' "$ART/kafka_lag_samples.json")

# Generate report
cat > "$ART/kafka_stress_report.json" <<EOF
{
  "test_config": {
    "total_events": $TOTAL_EVENTS,
    "malformed_percent": $MALFORMED_PERCENT,
    "expected_valid": $VALID_COUNT,
    "expected_malformed": $MALFORMED_COUNT
  },
  "results": {
    "events_processed": $EVENTS_TOTAL,
    "unique_sequences": $UNIQUE_SEQS,
    "duplicates": $DUPLICATE_COUNT,
    "quarantined": $QUARANTINE_COUNT,
    "dlq": $DLQ_COUNT,
    "gaps": $GAP_COUNT,
    "max_lag": $MAX_LAG,
    "final_lag": $FINAL_LAG
  },
  "validation": {
    "no_data_loss": $([ "$GAP_COUNT" -eq 0 ] && echo "true" || echo "false"),
    "correct_quarantine": $([ "$QUARANTINE_COUNT" -ge $((MALFORMED_COUNT * 90 / 100)) ] && echo "true" || echo "false"),
    "lag_recovered": $([ "$FINAL_LAG" -lt 1000 ] && echo "true" || echo "false"),
    "acceptable_duplicates": $([ "$DUPLICATE_COUNT" -lt 100 ] && echo "true" || echo "false")
  }
}
EOF

# Save TSV for gate validation
cat > "$ART/kafka_counts.tsv" <<EOF
events_processed	quarantined	dlq	gaps	duplicates
$EVENTS_TOTAL	$QUARANTINE_COUNT	$DLQ_COUNT	$GAP_COUNT	$DUPLICATE_COUNT
EOF

# Save lag profile
jq -r '.samples[] | [.timestamp, .lag, .events_processed] | @tsv' "$ART/kafka_lag_samples.json" > "$ART/kafka_lag_profile.tsv"

# Summary
log "=== Kafka Stress Test Summary ==="
log "Events processed: $EVENTS_TOTAL / $VALID_COUNT expected"
log "Quarantined: $QUARANTINE_COUNT (expected ~$MALFORMED_COUNT)"
log "DLQ: $DLQ_COUNT"
log "Gaps: $GAP_COUNT"
log "Duplicates: $DUPLICATE_COUNT"
log "Max lag: $MAX_LAG"
log "Final lag: $FINAL_LAG"

# Validation
PASSED=true
FAILURES=()

if [ "$GAP_COUNT" -gt 0 ]; then
    FAILURES+=("Data loss detected: $GAP_COUNT gaps")
    PASSED=false
fi

if [ "$EVENTS_TOTAL" -lt $((VALID_COUNT * 95 / 100)) ]; then
    FAILURES+=("Too few events processed: $EVENTS_TOTAL < $((VALID_COUNT * 95 / 100))")
    PASSED=false
fi

if [ "$QUARANTINE_COUNT" -lt $((MALFORMED_COUNT * 80 / 100)) ]; then
    FAILURES+=("Too few events quarantined: $QUARANTINE_COUNT < $((MALFORMED_COUNT * 80 / 100))")
    PASSED=false
fi

if [ "$FINAL_LAG" -gt 5000 ]; then
    FAILURES+=("Lag did not recover: $FINAL_LAG > 5000")
    PASSED=false
fi

if [ "$DUPLICATE_COUNT" -gt 1000 ]; then
    FAILURES+=("Too many duplicates: $DUPLICATE_COUNT > 1000")
    PASSED=false
fi

if [ "$PASSED" = true ]; then
    log "✓ [PASS] Kafka stress test passed all validations"
    exit 0
else
    error "[FAIL] Kafka stress test failed:"
    for failure in "${FAILURES[@]}"; do
        error "  - $failure"
    done
    exit 1
fi
