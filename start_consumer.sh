#!/bin/bash

# Start SIEM Consumer with required environment variables

export KAFKA_BROKERS="localhost:9092"
export KAFKA_TOPIC="ingest-events"
export KAFKA_GROUP_ID="siem-consumer-group"
export CLICKHOUSE_URL="http://localhost:8123"
export CLICKHOUSE_DB="dev"
export CLICKHOUSE_TABLE="events"
export API_URL="http://localhost:8080"
export BATCH_SIZE="1000"
export BATCH_TIMEOUT_MS="5000"
export RUST_LOG="info"

echo "Starting SIEM Consumer with configuration:"
echo "  KAFKA_BROKERS: $KAFKA_BROKERS"
echo "  KAFKA_TOPIC: $KAFKA_TOPIC"
echo "  CLICKHOUSE_URL: $CLICKHOUSE_URL"
echo "  API_URL: $API_URL"
echo ""

cd siem_consumer
./target/release/siem_consumer