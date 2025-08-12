#!/usr/bin/env bash
# kafka_bootstrap.sh - Bootstrap local Kafka for testing
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
    echo -e "${GREEN}[kafka]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[kafka]${NC} $1"
}

error() {
    echo -e "${RED}[kafka]${NC} $1"
}

# Check if Kafka is already running
if docker ps | grep -q "confluentinc/cp-kafka"; then
    log "Kafka already running"
else
    log "Starting Kafka with docker-compose..."
    
    # Create docker-compose.yml for Kafka
    cat > "$ROOT/docker-compose-kafka.yml" <<'EOF'
version: '3'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    ports:
      - "2181:2181"

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
EOF

    # Start Kafka
    docker-compose -f "$ROOT/docker-compose-kafka.yml" up -d
    
    # Wait for Kafka to be ready
    log "Waiting for Kafka to be ready..."
    for i in {1..30}; do
        if docker exec $(docker ps -q -f "name=kafka") kafka-topics --bootstrap-server localhost:9092 --list >/dev/null 2>&1; then
            log "Kafka is ready"
            break
        fi
        sleep 2
    done
fi

# Create topic if it doesn't exist
TOPIC="${KAFKA_TOPIC:-siem.events.v1}"
log "Creating topic: $TOPIC"

docker exec $(docker ps -q -f "name=kafka") kafka-topics \
    --bootstrap-server localhost:9092 \
    --create \
    --if-not-exists \
    --topic "$TOPIC" \
    --partitions 3 \
    --replication-factor 1 \
    --config retention.ms=86400000 \
    --config segment.ms=3600000 || true

# List topics
log "Available topics:"
docker exec $(docker ps -q -f "name=kafka") kafka-topics \
    --bootstrap-server localhost:9092 \
    --list

log "Kafka bootstrap complete"
log "  Brokers: localhost:9092"
log "  Topic: $TOPIC"
