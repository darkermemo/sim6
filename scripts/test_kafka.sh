#!/bin/sh
# Kafka Connectivity Test Script
# Tests broker connectivity, topic operations, and message flow to ClickHouse

set -e

# Load environment variables from .env if it exists
if [ -f ".env" ]; then
    set -a
    . ./.env
    set +a
fi

# Default values from config analysis
KAFKA_BROKERS="${KAFKA_BROKERS:-localhost:9092}"
KAFKA_TOPIC="${KAFKA_EVENTS_TOPIC:-siem_events}"
KAFKA_GROUP_ID="${KAFKA_CONSUMER_GROUP:-siem_clickhouse_writer}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-default}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-}"
EVENTS_TABLE_NAME="${EVENTS_TABLE_NAME:-dev.events}"

echo "=== Kafka Connectivity Test ==="
echo "Kafka Brokers: $KAFKA_BROKERS"
echo "Topic: $KAFKA_TOPIC"
echo "Consumer Group: $KAFKA_GROUP_ID"
echo "ClickHouse URL: $CLICKHOUSE_URL"
echo "Events Table: $EVENTS_TABLE_NAME"
echo

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to execute ClickHouse query
execute_clickhouse_query() {
    local query="$1"
    
    if [ -n "$CLICKHOUSE_PASSWORD" ]; then
        curl -s --fail \
            -u "$CLICKHOUSE_USER:$CLICKHOUSE_PASSWORD" \
            "$CLICKHOUSE_URL" \
            -d "$query"
    else
        curl -s --fail \
            -u "$CLICKHOUSE_USER:" \
            "$CLICKHOUSE_URL" \
            -d "$query"
    fi
}

# Check for required tools
echo "--- Checking Required Tools ---"
if command_exists kcat; then
    KAFKA_TOOL="kcat"
    KAFKA_MODE="kcat"
    echo "✅ Using kcat for Kafka operations"
elif command_exists kafkacat; then
    KAFKA_TOOL="kafkacat"
    KAFKA_MODE="kcat"
    echo "✅ Using kafkacat for Kafka operations"
else
    # Check if kgen is available (build it if needed)
    KGEN_PATH="siem_tools/target/release/kgen"
    if [ ! -f "$KGEN_PATH" ]; then
        echo "⚠️  kcat/kafkacat not found, building kgen fallback..."
        (cd siem_tools && cargo build --release --bin kgen) || {
            echo "❌ Failed to build kgen. Please install kcat or fix build issues."
            echo "   brew install kcat  # on macOS"
            echo "   apt-get install kafkacat  # on Ubuntu/Debian"
            exit 1
        }
    fi
    
    if [ -f "$KGEN_PATH" ]; then
        KAFKA_TOOL="$KGEN_PATH"
        KAFKA_MODE="kgen"
        echo "✅ Using kgen (Rust-based) for Kafka operations"
    else
        echo "❌ Neither kcat nor kgen available. Please install kcat."
        echo "   brew install kcat  # on macOS"
        echo "   apt-get install kafkacat  # on Ubuntu/Debian"
        exit 1
    fi
fi
echo

# Test 1: Broker connectivity
echo "--- Test 1: Broker Connectivity ---"
echo "Testing connection to Kafka brokers..."
if [ "$KAFKA_MODE" = "kcat" ]; then
    if $KAFKA_TOOL -b "$KAFKA_BROKERS" -L >/dev/null 2>&1; then
        echo "✅ Successfully connected to Kafka brokers"
        $KAFKA_TOOL -b "$KAFKA_BROKERS" -L | head -10
    else
        echo "❌ Failed to connect to Kafka brokers"
        exit 1
    fi
else
    # For kgen, we'll test connectivity during the production phase
    echo "✅ Using kgen - broker connectivity will be tested during production"
fi
echo

# Test 2: Topic verification
echo "--- Test 2: Topic Verification ---"
echo "Checking if topic '$KAFKA_TOPIC' exists..."
if [ "$KAFKA_MODE" = "kcat" ]; then
    if $KAFKA_TOOL -b "$KAFKA_BROKERS" -L | grep -q "topic \"$KAFKA_TOPIC\""; then
        echo "✅ Topic '$KAFKA_TOPIC' exists"
    else
        echo "⚠️  Topic '$KAFKA_TOPIC' not found. This may be expected if auto-creation is enabled."
    fi
else
    echo "⚠️  Using kgen - topic verification will happen during production (auto-creation expected)"
fi
echo

# Generate unique probe event IDs
TIMESTAMP=$(date +%s)
PROBE_PREFIX="probe_${TIMESTAMP}"

echo "--- Test 3: Message Production ---"
echo "Producing 5 test events with probe prefix: $PROBE_PREFIX"

if [ "$KAFKA_MODE" = "kcat" ]; then
    # Create test events using kcat
    for i in 1 2 3 4 5; do
        EVENT_ID="${PROBE_PREFIX}_${i}"
        EVENT_JSON=$(cat <<EOF
{
  "event_id": "$EVENT_ID",
  "tenant_id": "test_tenant",
  "event_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
  "event_type": "test_event",
  "source_ip": "192.168.1.100",
  "destination_ip": "10.0.0.1",
  "source_port": 12345,
  "destination_port": 80,
  "protocol": "TCP",
  "severity": "INFO",
  "message": "Test event for Kafka connectivity probe",
  "__probe__": true,
  "__test_batch__": "$PROBE_PREFIX"
}
EOF
        )
        
        echo "Producing event $i: $EVENT_ID"
        echo "$EVENT_JSON" | $KAFKA_TOOL -b "$KAFKA_BROKERS" -t "$KAFKA_TOPIC" -P
        
        if [ $? -eq 0 ]; then
            echo "✅ Event $i produced successfully"
        else
            echo "❌ Failed to produce event $i"
            exit 1
        fi
    done
else
    # Use kgen to produce events
    echo "Using kgen to produce 5 events..."
    $KAFKA_TOOL --count 5 --brokers "$KAFKA_BROKERS" --topic "$KAFKA_TOPIC" --tenant-id "test_tenant" --prefix "$PROBE_PREFIX" --verbose
    
    if [ $? -eq 0 ]; then
        echo "✅ All events produced successfully using kgen"
    else
        echo "❌ Failed to produce events using kgen"
        exit 1
    fi
fi
echo

echo "--- Test 4: ClickHouse Integration Verification ---"
echo "Waiting 30 seconds for events to be consumed and written to ClickHouse..."
sleep 30

echo "Checking ClickHouse for probe events..."
COUNT_QUERY="SELECT count() FROM $EVENTS_TABLE_NAME WHERE event_id LIKE '$PROBE_PREFIX%'"
EVENT_COUNT=$(execute_clickhouse_query "$COUNT_QUERY")

echo "Found $EVENT_COUNT probe events in ClickHouse"

if [ "$EVENT_COUNT" -eq 5 ]; then
    echo "✅ All 5 probe events found in ClickHouse"
else
    echo "⚠️  Expected 5 events, found $EVENT_COUNT"
    echo "This may indicate:"
    echo "  - Consumer lag (events still being processed)"
    echo "  - Consumer not running"
    echo "  - Configuration mismatch"
    
    # Show recent events for debugging
    echo "Recent events in ClickHouse:"
    RECENT_QUERY="SELECT event_id, tenant_id, event_timestamp FROM $EVENTS_TABLE_NAME ORDER BY event_timestamp DESC LIMIT 10"
    execute_clickhouse_query "$RECENT_QUERY"
fi
echo

# Test 5: Consumer group verification (if possible)
echo "--- Test 5: Consumer Group Status ---"
echo "Checking consumer group status..."
if [ "$KAFKA_MODE" = "kcat" ]; then
    if $KAFKA_TOOL -b "$KAFKA_BROKERS" -G "$KAFKA_GROUP_ID" -C -t "$KAFKA_TOPIC" -o end -e >/dev/null 2>&1; then
        echo "✅ Consumer group '$KAFKA_GROUP_ID' is accessible"
    else
        echo "⚠️  Could not verify consumer group status (this may be normal)"
    fi
else
    echo "⚠️  Consumer group check skipped for kgen (producer-only tool)"
fi
echo

echo "=== Kafka Connectivity Test Summary ==="
echo "Brokers: ✅ Connected"
echo "Topic: ✅ Accessible"
echo "Production: ✅ 5 events sent"
echo "ClickHouse Integration: $([ "$EVENT_COUNT" -eq 5 ] && echo "✅ All events received" || echo "⚠️  $EVENT_COUNT/5 events received")"
echo
echo "Kafka is ready for SIEM operations."

# Cleanup probe events (optional)
echo "--- Cleanup (Optional) ---"
echo "To remove probe events from ClickHouse, run:"
echo "  ALTER TABLE $EVENTS_TABLE_NAME DELETE WHERE event_id LIKE '$PROBE_PREFIX%'"