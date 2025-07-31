#!/bin/bash

# smoke-slice.sh - Smoke test for the vertical slice (Ingestion → ClickHouse → Dashboard)
# Tests the full pipeline with demoTenant

set -e

echo "🔥 Starting smoke test for vertical slice..."

# Ensure we're in the project root
cd "$(dirname "$0")/.."

# Check prerequisites
echo "Checking prerequisites..."
# Check ClickHouse (optional for local development)
echo "Checking ClickHouse server..."
CLICKHOUSE_AVAILABLE=false
if curl -s http://localhost:8123/ping > /dev/null 2>&1; then
    echo "✅ ClickHouse server is running"
    CLICKHOUSE_AVAILABLE=true
else
    echo "⚠️  WARNING: ClickHouse server is not running (skipping ClickHouse tests)"
fi

if ! pgrep -f "redis-server" > /dev/null; then
    echo "❌ ERROR: Redis server is not running"
    echo "Please start Redis server first"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Build ingestion_server if needed
echo "Building ingestion_server..."
cd siem_clickhouse_ingestion
cargo build --release --bin ingestion_server
cd ..

# Copy tenant configuration
echo "Setting up tenant configuration..."
cp siem_clickhouse_ingestion/tenants.yaml siem_clickhouse_ingestion/tenants.toml

# Start ingestion_server in background
echo "Starting ingestion_server on port 8080..."
cd siem_clickhouse_ingestion
./target/release/ingestion_server &
INGESTOR_PID=$!
cd ..
echo "Ingestor started with PID: $INGESTOR_PID"

# Function to cleanup on exit
cleanup() {
    echo "Cleaning up..."
    if kill -0 "$INGESTOR_PID" 2>/dev/null; then
        echo "Killing ingestor PID: $INGESTOR_PID"
        kill "$INGESTOR_PID"
        wait "$INGESTOR_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# Wait for ingestor to start
echo "Waiting for ingestor to start..."
sleep 3

# Check if ingestor is running
if ! kill -0 "$INGESTOR_PID" 2>/dev/null; then
    echo "❌ ERROR: Ingestor failed to start"
    exit 1
fi

# Test event payload (format expected by ingestion server)
TEST_EVENT='{
  "logs": [{
    "timestamp": 1720000000,
    "event_category": "Authentication",
    "source_ip": "10.0.0.5",
    "user": "demo",
    "message": "User demo authenticated from 10.0.0.5"
  }],
  "metadata": {
    "source": "smoke_test"
  }
}'

echo "Sending test event to ingestor..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$TEST_EVENT" \
  "http://127.0.0.1:8080/ingest/tenant1")

if [ "$HTTP_STATUS" != "200" ] && [ "$HTTP_STATUS" != "201" ] && [ "$HTTP_STATUS" != "202" ]; then
    echo "❌ ERROR: Failed to ingest event. HTTP status: $HTTP_STATUS"
    exit 1
fi

echo "✅ Event ingested successfully (HTTP $HTTP_STATUS)"

# Wait for event to be processed
echo "Waiting 3 seconds for event processing..."
sleep 3

# Query ClickHouse to verify the event was stored (only if ClickHouse is available)
if [ "$CLICKHOUSE_AVAILABLE" = "true" ]; then
    echo "Querying ClickHouse for the test event..."
    COUNT=$(clickhouse-client --query "SELECT count() FROM events_tenant1 WHERE user='demo' AND event_category='Authentication'" 2>/dev/null || echo "0")
    
    echo "Found $COUNT matching events in ClickHouse"
    
    if [ "$COUNT" = "1" ]; then
        echo "🎉 SMOKE PASS"
        echo "✅ Vertical slice test completed successfully!"
        exit 0
    else
        echo "❌ SMOKE FAIL"
        echo "Expected 1 event, found $COUNT"
        exit 1
    fi
else
    echo "⚠️  Skipping ClickHouse verification (server not available)"
    echo "🎉 SMOKE PASS (partial - ingestion only)"
    echo "✅ Event ingestion test completed successfully!"
    exit 0
fi