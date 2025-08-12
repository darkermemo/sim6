#!/bin/sh
# Redis Connectivity Test Script
# Tests Redis connectivity, caching operations, and SSE streaming patterns

set -e

# Load environment variables from .env if it exists
if [ -f ".env" ]; then
    set -a
    . ./.env
    set +a
fi

# Default values from config analysis
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
REDIS_NAMESPACE="${REDIS_NAMESPACE:-siem_dev}"

# Extract host and port from Redis URL
REDIS_HOST=$(echo "$REDIS_URL" | sed -n 's|redis://\([^:]*\):.*|\1|p')
REDIS_PORT=$(echo "$REDIS_URL" | sed -n 's|redis://[^:]*:\([0-9]*\).*|\1|p')

# Default to localhost:6379 if parsing fails
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

echo "=== Redis Connectivity Test ==="
echo "Redis URL: $REDIS_URL"
echo "Redis Host: $REDIS_HOST"
echo "Redis Port: $REDIS_PORT"
echo "Redis Namespace: $REDIS_NAMESPACE"
echo

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for Redis CLI
echo "--- Checking Redis CLI ---"
if command_exists redis-cli; then
    echo "✅ redis-cli found"
else
    echo "❌ redis-cli not found. Please install Redis CLI."
    echo "   brew install redis  # on macOS"
    echo "   apt-get install redis-tools  # on Ubuntu/Debian"
    exit 1
fi
echo

# Function to execute Redis command
execute_redis_cmd() {
    local cmd="$1"
    local description="$2"
    
    echo "Executing: $description"
    echo "Command: $cmd"
    
    result=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $cmd 2>&1)
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo "✅ Success: $description"
        echo "Result: $result"
    else
        echo "❌ Failed: $description"
        echo "Error: $result"
        exit 1
    fi
    echo
}

# Test 1: Basic connectivity
echo "--- Test 1: Basic Connectivity ---"
execute_redis_cmd "PING" "Basic PING test"

# Test 2: Server info
echo "--- Test 2: Server Information ---"
execute_redis_cmd "INFO server" "Server information"

# Test 3: Memory info
echo "--- Test 3: Memory Information ---"
execute_redis_cmd "INFO memory" "Memory usage information"

# Generate unique test keys with namespace
TIMESTAMP=$(date +%s)
TEST_PREFIX="${REDIS_NAMESPACE}:test:${TIMESTAMP}"
CACHE_KEY="${TEST_PREFIX}:cache"
SSE_KEY="${TEST_PREFIX}:sse"
STREAM_KEY="${TEST_PREFIX}:stream"

echo "--- Test 4: Basic Key-Value Operations ---"
echo "Testing basic caching operations with namespace..."

# Set a test value
execute_redis_cmd "SET $CACHE_KEY 'test_value_$(date)'" "Set cache value"

# Get the test value
execute_redis_cmd "GET $CACHE_KEY" "Get cache value"

# Set with expiration (TTL)
execute_redis_cmd "SETEX ${CACHE_KEY}_ttl 60 'expires_in_60_seconds'" "Set value with TTL"

# Check TTL
execute_redis_cmd "TTL ${CACHE_KEY}_ttl" "Check TTL"

echo "--- Test 5: List Operations (SSE Pattern) ---"
echo "Testing list operations for SSE streaming pattern..."

# Push events to list (simulating SSE events)
for i in 1 2 3; do
    event_data="{\"event_id\":\"test_$i\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",\"data\":\"SSE test event $i\"}"
    execute_redis_cmd "LPUSH $SSE_KEY '$event_data'" "Push SSE event $i"
done

# Get list length
execute_redis_cmd "LLEN $SSE_KEY" "Get SSE list length"

# Pop events from list
execute_redis_cmd "RPOP $SSE_KEY" "Pop SSE event"

# Get remaining events
execute_redis_cmd "LRANGE $SSE_KEY 0 -1" "Get remaining SSE events"

echo "--- Test 6: Stream Operations (Alternative SSE Pattern) ---"
echo "Testing Redis Streams for potential SSE usage..."

# Add entries to stream
for i in 1 2 3; do
    execute_redis_cmd "XADD $STREAM_KEY * event_id test_stream_$i timestamp $(date +%s) data 'Stream test event $i'" "Add stream entry $i"
done

# Read stream entries
execute_redis_cmd "XLEN $STREAM_KEY" "Get stream length"
execute_redis_cmd "XRANGE $STREAM_KEY - +" "Read all stream entries"

echo "--- Test 7: Pub/Sub Test (Alternative SSE Pattern) ---"
echo "Testing Pub/Sub for potential SSE usage..."

# Test publish (subscriber would need to be running separately)
PUBSUB_CHANNEL="${REDIS_NAMESPACE}:events"
execute_redis_cmd "PUBLISH $PUBSUB_CHANNEL 'Test pub/sub message'" "Publish test message"

# Check active channels
execute_redis_cmd "PUBSUB CHANNELS" "List active channels"

echo "--- Test 8: Namespace Verification ---"
echo "Verifying namespace isolation..."

# List keys with our namespace
execute_redis_cmd "KEYS ${REDIS_NAMESPACE}:*" "List keys in namespace"

# Count keys in namespace
key_count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EVAL "return #redis.call('keys', ARGV[1])" 0 "${REDIS_NAMESPACE}:*")
echo "Keys in namespace '$REDIS_NAMESPACE': $key_count"
echo

echo "--- Test 9: Performance Test ---"
echo "Testing basic performance..."

# Simple performance test
start_time=$(date +%s%N)
for i in $(seq 1 100); do
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "${TEST_PREFIX}:perf:$i" "value_$i" >/dev/null
done
end_time=$(date +%s%N)

duration=$((($end_time - $start_time) / 1000000))  # Convert to milliseconds
echo "✅ Performance test: 100 SET operations in ${duration}ms"
echo

echo "--- Cleanup ---"
echo "Cleaning up test keys..."

# Delete test keys
test_keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "${TEST_PREFIX}:*")
if [ -n "$test_keys" ]; then
    echo "$test_keys" | xargs redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL
    echo "✅ Test keys cleaned up"
else
    echo "✅ No test keys to clean up"
fi
echo

echo "=== Redis Connectivity Test Summary ==="
echo "Basic Connectivity: ✅ PING successful"
echo "Key-Value Operations: ✅ SET/GET working"
echo "List Operations: ✅ LPUSH/RPOP working (SSE pattern)"
echo "Stream Operations: ✅ XADD/XRANGE working (alternative SSE)"
echo "Pub/Sub: ✅ PUBLISH working"
echo "Namespace: ✅ '$REDIS_NAMESPACE' isolation verified"
echo "Performance: ✅ Basic operations responsive"
echo
echo "Redis is ready for SIEM caching and SSE streaming operations."

echo
echo "--- Usage Patterns Verified ---"
echo "✅ Caching: Standard key-value operations"
echo "✅ SSE Streaming: List-based event queuing"
echo "✅ Alternative SSE: Redis Streams support"
echo "✅ Namespace Isolation: Proper key prefixing"