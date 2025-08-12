#!/usr/bin/env bash
# kafka_consume_proof.sh - Test Kafka consumer functionality
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
    echo -e "${GREEN}[consume]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[consume]${NC} $1"
}

error() {
    echo -e "${RED}[consume]${NC} $1"
}

# Ensure API is running with Kafka consumer
if [ -z "${KAFKA_BROKERS:-}" ]; then
    error "KAFKA_BROKERS not set. Kafka consumer won't start."
    exit 1
fi

# Check API health
if ! curl -fsS "$API_BASE/api/v2/health" >/dev/null 2>&1; then
    error "API not running. Start it with KAFKA_BROKERS set."
    exit 1
fi

# Get initial counts
log "Getting initial event counts..."
INITIAL_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.events 
WHERE source_type = 'kafka_test' 
  AND event_timestamp >= toUnixTimestamp(now() - INTERVAL 1 HOUR)
FORMAT TabSeparated
" 2>/dev/null || echo "0")

log "Initial event count: $INITIAL_COUNT"

# Wait for consumer to process
log "Waiting for Kafka consumer to process events..."
sleep 10

# Check progress periodically
for i in {1..6}; do
    CURRENT_COUNT=$($CH_CLIENT -q "
    SELECT count() 
    FROM dev.events 
    WHERE source_type = 'kafka_test' 
      AND event_timestamp >= toUnixTimestamp(now() - INTERVAL 1 HOUR)
    FORMAT TabSeparated
    " 2>/dev/null || echo "0")
    
    log "Check $i: $CURRENT_COUNT events processed"
    
    if [ "$CURRENT_COUNT" -ge 950 ]; then
        log "Target reached!"
        break
    fi
    
    sleep 5
done

# Final counts
log "Getting final counts..."

# Events count
EVENTS_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.events 
WHERE source_type = 'kafka_test' 
  AND event_timestamp >= toUnixTimestamp(now() - INTERVAL 1 HOUR)
FORMAT TabSeparated
" 2>/dev/null || echo "0")

echo "$EVENTS_COUNT" > "$ART/events_count.tsv"

# Quarantine count
QUARANTINE_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.events_quarantine 
WHERE source = 'kafka' 
  AND created_at >= now() - INTERVAL 1 HOUR
FORMAT TabSeparated
" 2>/dev/null || echo "0")

echo "$QUARANTINE_COUNT" > "$ART/quarantine_count.tsv"

# DLQ count
DLQ_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.ingest_dlq 
WHERE reason = 'invalid_json' 
  AND received_at >= now64(3) - INTERVAL 1 HOUR
FORMAT TabSeparated
" 2>/dev/null || echo "0")

echo "$DLQ_COUNT" > "$ART/dlq_count.tsv"

log "Results:"
log "  Events: $EVENTS_COUNT (expected ≥950)"
log "  Quarantine: $QUARANTINE_COUNT (expected ≈50)"
log "  DLQ: $DLQ_COUNT (expected ≥1)"

# Check Kafka status endpoint
log "Checking Kafka streaming status..."
curl -sS "$API_BASE/api/v2/admin/streaming/kafka/status" > "$ART/streaming_status.json"

# Verify status
if jq -e '.running == true' "$ART/streaming_status.json" >/dev/null 2>&1; then
    log "✓ Kafka consumer is running"
    
    # Check topic
    TOPIC=$(jq -r '.topic // ""' "$ART/streaming_status.json")
    if [ "$TOPIC" = "${KAFKA_TOPIC:-siem.events.v1}" ]; then
        log "✓ Correct topic: $TOPIC"
    else
        error "Wrong topic: $TOPIC"
    fi
    
    # Check lag
    TOTAL_LAG=$(jq '[.assignments[].lag] | add // 0' "$ART/streaming_status.json")
    log "Total lag across partitions: $TOTAL_LAG"
else
    error "Kafka consumer not running"
    jq '.' "$ART/streaming_status.json"
    exit 1
fi

# Check metrics
log "Checking Kafka metrics..."
curl -sS "$API_BASE/api/v2/metrics" | grep -E "siem_v2_(ingest_kafka|kafka_)" > "$ART/kafka_metrics.txt" || true

if grep -q "siem_v2_ingest_kafka_total" "$ART/kafka_metrics.txt"; then
    log "✓ Kafka ingest metrics found"
else
    warn "Kafka ingest metrics not found"
fi

if grep -q "siem_v2_kafka_commits_total" "$ART/kafka_metrics.txt"; then
    log "✓ Kafka commit metrics found"
else
    warn "Kafka commit metrics not found"
fi

# Summary
log "Kafka consumer test complete. Artifacts:"
log "  - $ART/events_count.tsv"
log "  - $ART/quarantine_count.tsv"
log "  - $ART/dlq_count.tsv"
log "  - $ART/streaming_status.json"
log "  - $ART/kafka_metrics.txt"

# Validation
if [ "$EVENTS_COUNT" -ge 950 ]; then
    log "RESULT: PASS - Kafka consumer working correctly"
    exit 0
else
    error "RESULT: FAIL - Not enough events processed ($EVENTS_COUNT < 950)"
    exit 1
fi
