#!/usr/bin/env bash
# kafka_ingest_producer.sh - Produce test events to Kafka
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[producer]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[producer]${NC} $1"
}

error() {
    echo -e "${RED}[producer]${NC} $1"
}

# Configuration
BROKERS="${KAFKA_BROKERS:-localhost:9092}"
TOPIC="${KAFKA_TOPIC:-siem.events.v1}"
NUM_EVENTS="${NUM_EVENTS:-1000}"

log "Producing $NUM_EVENTS events to topic: $TOPIC"

# Generate test events (mix of valid and invalid)
cat > "$ART/kafka_test_events.json" <<EOF
EOF

# Generate events for two tenants
for i in $(seq 1 $NUM_EVENTS); do
    TENANT=$((($i % 2) + 1))
    
    # 5% invalid events
    if [ $((i % 20)) -eq 0 ]; then
        # Invalid JSON
        echo "{invalid json tenant_id: $TENANT" >> "$ART/kafka_test_events.json"
    else
        # Valid event
        TIMESTAMP=$(date +%s)
        SOURCE_TYPE="kafka_test"
        SEVERITY=$(shuf -e "info" "warning" "error" "critical" | head -1)
        SOURCE_IP="10.0.$((i % 256)).$((i % 100))"
        
        cat >> "$ART/kafka_test_events.json" <<EOF
{"tenant_id": $TENANT, "source_id": "kafka-src-$TENANT", "source_type": "$SOURCE_TYPE", "event_timestamp": $TIMESTAMP, "message": "Test event $i from Kafka", "severity": "$SEVERITY", "source_ip": "$SOURCE_IP", "event_category": "test"}
EOF
    fi
done

# Check if we're in Docker or native
if command -v kafka-console-producer >/dev/null 2>&1; then
    # Native Kafka installation
    log "Using native kafka-console-producer"
    kafka-console-producer \
        --bootstrap-server "$BROKERS" \
        --topic "$TOPIC" \
        < "$ART/kafka_test_events.json"
else
    # Use Docker
    log "Using Docker kafka-console-producer"
    docker exec -i $(docker ps -q -f "name=kafka") kafka-console-producer \
        --bootstrap-server localhost:9092 \
        --topic "$TOPIC" \
        < "$ART/kafka_test_events.json"
fi

log "Produced $NUM_EVENTS events successfully"

# Check topic status
log "Topic status:"
if command -v kafka-run-class >/dev/null 2>&1; then
    kafka-run-class kafka.tools.GetOffsetShell \
        --broker-list "$BROKERS" \
        --topic "$TOPIC" \
        --time -1 || true
else
    docker exec $(docker ps -q -f "name=kafka") kafka-run-class kafka.tools.GetOffsetShell \
        --broker-list localhost:9092 \
        --topic "$TOPIC" \
        --time -1 || true
fi

log "Producer test complete. Events written to:"
log "  - $ART/kafka_test_events.json"
