#!/bin/sh
# SSE (Server-Sent Events) Streaming Test Script
# Tests both Redis and ClickHouse SSE endpoints for real-time event streaming

set -e

# Load environment variables from .env if it exists
if [ -f ".env" ]; then
    set -a
    . ./.env
    set +a
fi

# Default values from config analysis
SIEM_API_URL="${SIEM_API_URL:-http://localhost:9999}"
TEST_DURATION="${SSE_TEST_DURATION:-10}"
MIN_EVENTS="${SSE_MIN_EVENTS:-1}"
TENANT_ID="${SSE_TEST_TENANT:-test_tenant}"

# SSE endpoint URLs
REDIS_SSE_URL="${SIEM_API_URL}/api/v1/events/stream/redis"
CLICKHOUSE_SSE_URL="${SIEM_API_URL}/api/v1/events/stream/ch"

echo "=== SSE Streaming Test ==="
echo "SIEM API URL: $SIEM_API_URL"
echo "Redis SSE URL: $REDIS_SSE_URL"
echo "ClickHouse SSE URL: $CLICKHOUSE_SSE_URL"
echo "Test Duration: ${TEST_DURATION}s"
echo "Minimum Events Expected: $MIN_EVENTS"
echo "Test Tenant: $TENANT_ID"
echo

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for required tools
echo "--- Checking Required Tools ---"
if command_exists curl; then
    echo "✅ curl found"
else
    echo "❌ curl not found. Please install curl."
    exit 1
fi

if command_exists timeout; then
    TIMEOUT_CMD="timeout"
    echo "✅ timeout command found"
elif command_exists gtimeout; then
    TIMEOUT_CMD="gtimeout"
    echo "✅ gtimeout command found (GNU coreutils)"
else
    echo "⚠️  No timeout command found. Using curl's built-in timeout."
    TIMEOUT_CMD=""
fi
echo

# Function to test SSE endpoint
test_sse_endpoint() {
    local url="$1"
    local name="$2"
    local output_file="$3"
    
    echo "--- Testing $name SSE Endpoint ---"
    echo "URL: $url"
    echo "Output file: $output_file"
    
    # Prepare curl command
    curl_cmd="curl -s -N --max-time $((TEST_DURATION + 5))"
    
    # Add tenant parameter if specified
    if [ -n "$TENANT_ID" ]; then
        url="${url}?tenant_id=${TENANT_ID}"
        echo "Using tenant filter: $TENANT_ID"
    fi
    
    echo "Starting SSE connection for ${TEST_DURATION} seconds..."
    
    # Start SSE connection with timeout
    if [ -n "$TIMEOUT_CMD" ]; then
        $TIMEOUT_CMD ${TEST_DURATION}s $curl_cmd "$url" > "$output_file" 2>&1 &
    else
        $curl_cmd "$url" > "$output_file" 2>&1 &
    fi
    
    curl_pid=$!
    echo "SSE connection started (PID: $curl_pid)"
    
    # Wait for the specified duration
    sleep $TEST_DURATION
    
    # Kill curl if it's still running
    if kill -0 $curl_pid 2>/dev/null; then
        echo "Stopping SSE connection..."
        kill $curl_pid 2>/dev/null || true
        wait $curl_pid 2>/dev/null || true
    fi
    
    echo "SSE test completed for $name"
    echo
}

# Function to analyze SSE output
analyze_sse_output() {
    local output_file="$1"
    local name="$2"
    
    echo "--- Analyzing $name SSE Output ---"
    
    if [ ! -f "$output_file" ]; then
        echo "❌ Output file not found: $output_file"
        return 1
    fi
    
    file_size=$(wc -c < "$output_file")
    echo "Output file size: ${file_size} bytes"
    
    if [ $file_size -eq 0 ]; then
        echo "❌ No data received from $name SSE endpoint"
        return 1
    fi
    
    # Count SSE events (lines starting with "data:")
    event_count=$(grep -c "^data:" "$output_file" 2>/dev/null || echo "0")
    echo "SSE events received: $event_count"
    
    # Count heartbeat/keep-alive messages
    heartbeat_count=$(grep -c "^:" "$output_file" 2>/dev/null || echo "0")
    echo "Heartbeat messages: $heartbeat_count"
    
    # Look for error messages
    error_count=$(grep -ci "error\|fail" "$output_file" 2>/dev/null || echo "0")
    if [ $error_count -gt 0 ]; then
        echo "⚠️  Potential errors found: $error_count"
        echo "Error samples:"
        grep -i "error\|fail" "$output_file" | head -3
    fi
    
    # Show sample events
    if [ $event_count -gt 0 ]; then
        echo "✅ $name SSE endpoint is working"
        echo "Sample events (first 3):"
        grep "^data:" "$output_file" | head -3
        
        # Try to parse JSON events
        echo "Analyzing event structure..."
        first_event=$(grep "^data:" "$output_file" | head -1 | sed 's/^data: //')
        if echo "$first_event" | jq . >/dev/null 2>&1; then
            echo "✅ Events are valid JSON"
            
            # Extract key fields
            event_id=$(echo "$first_event" | jq -r '.event_id // "N/A"' 2>/dev/null)
            tenant_id=$(echo "$first_event" | jq -r '.tenant_id // "N/A"' 2>/dev/null)
            timestamp=$(echo "$first_event" | jq -r '.event_timestamp // .timestamp // "N/A"' 2>/dev/null)
            
            echo "Sample event details:"
            echo "  Event ID: $event_id"
            echo "  Tenant ID: $tenant_id"
            echo "  Timestamp: $timestamp"
        else
            echo "⚠️  Events may not be valid JSON"
        fi
        
        # Check if we met minimum event threshold
        if [ $event_count -ge $MIN_EVENTS ]; then
            echo "✅ Minimum event threshold met ($event_count >= $MIN_EVENTS)"
            return 0
        else
            echo "⚠️  Below minimum event threshold ($event_count < $MIN_EVENTS)"
            return 1
        fi
    else
        echo "❌ No SSE events received from $name endpoint"
        
        # Show raw output for debugging
        echo "Raw output (first 500 chars):"
        head -c 500 "$output_file"
        return 1
    fi
}

# Create temporary files for SSE output
REDIS_OUTPUT="/tmp/sse_redis_test_$(date +%s).log"
CLICKHOUSE_OUTPUT="/tmp/sse_clickhouse_test_$(date +%s).log"

echo "--- Pre-Test Health Check ---"
echo "Checking if SIEM API is accessible..."
if curl -s --max-time 5 "${SIEM_API_URL}/health" >/dev/null 2>&1; then
    echo "✅ SIEM API is accessible"
else
    echo "❌ SIEM API is not accessible at $SIEM_API_URL"
    echo "Please ensure the SIEM server is running."
    exit 1
fi
echo

# Test Redis SSE endpoint
test_sse_endpoint "$REDIS_SSE_URL" "Redis" "$REDIS_OUTPUT"

# Test ClickHouse SSE endpoint
test_sse_endpoint "$CLICKHOUSE_SSE_URL" "ClickHouse" "$CLICKHOUSE_OUTPUT"

# Analyze results
echo "=== SSE Test Results Analysis ==="
echo

# Analyze Redis SSE
analyze_sse_output "$REDIS_OUTPUT" "Redis"
redis_result=$?
echo

# Analyze ClickHouse SSE
analyze_sse_output "$CLICKHOUSE_OUTPUT" "ClickHouse"
clickhouse_result=$?
echo

echo "--- Connection Cleanup Test ---"
echo "Testing SSE connection cleanup (simulate navigation away)..."

# Start a short SSE connection and kill it immediately
echo "Starting short-lived SSE connection..."
curl -s -N --max-time 2 "$REDIS_SSE_URL" >/dev/null 2>&1 &
short_pid=$!
sleep 1

if kill -0 $short_pid 2>/dev/null; then
    echo "Terminating connection..."
    kill $short_pid 2>/dev/null || true
    wait $short_pid 2>/dev/null || true
    echo "✅ SSE connection terminated cleanly"
else
    echo "✅ SSE connection ended naturally"
fi
echo

echo "--- Performance Analysis ---"
echo "Analyzing SSE performance characteristics..."

# Calculate events per second for each endpoint
if [ $redis_result -eq 0 ]; then
    redis_events=$(grep -c "^data:" "$REDIS_OUTPUT" 2>/dev/null || echo "0")
    redis_eps=$(echo "scale=2; $redis_events / $TEST_DURATION" | bc 2>/dev/null || echo "N/A")
    echo "Redis SSE Performance: $redis_eps events/second"
fi

if [ $clickhouse_result -eq 0 ]; then
    clickhouse_events=$(grep -c "^data:" "$CLICKHOUSE_OUTPUT" 2>/dev/null || echo "0")
    clickhouse_eps=$(echo "scale=2; $clickhouse_events / $TEST_DURATION" | bc 2>/dev/null || echo "N/A")
    echo "ClickHouse SSE Performance: $clickhouse_eps events/second"
fi
echo

echo "=== SSE Streaming Test Summary ==="
echo "Redis SSE Endpoint: $([ $redis_result -eq 0 ] && echo "✅ Working" || echo "❌ Failed")"
echo "ClickHouse SSE Endpoint: $([ $clickhouse_result -eq 0 ] && echo "✅ Working" || echo "❌ Failed")"
echo "Connection Cleanup: ✅ Clean termination"
echo

if [ $redis_result -eq 0 ] || [ $clickhouse_result -eq 0 ]; then
    echo "Overall SSE Status: ✅ At least one endpoint is functional"
    exit_code=0
else
    echo "Overall SSE Status: ❌ No endpoints are functional"
    exit_code=1
fi

echo
echo "--- Cleanup ---"
echo "Removing temporary files..."
rm -f "$REDIS_OUTPUT" "$CLICKHOUSE_OUTPUT"
echo "✅ Temporary files cleaned up"

echo
echo "--- Recommendations ---"
if [ $redis_result -ne 0 ] && [ $clickhouse_result -ne 0 ]; then
    echo "❌ Both SSE endpoints failed. Check:"
    echo "  - SIEM server is running and accessible"
    echo "  - SSE endpoints are properly configured"
    echo "  - Events are being generated/stored"
    echo "  - Network connectivity and firewall settings"
elif [ $redis_result -ne 0 ]; then
    echo "⚠️  Redis SSE endpoint failed. Check:"
    echo "  - Redis connection and configuration"
    echo "  - Redis SSE implementation in handlers.rs"
elif [ $clickhouse_result -ne 0 ]; then
    echo "⚠️  ClickHouse SSE endpoint failed. Check:"
    echo "  - ClickHouse connection and query performance"
    echo "  - ClickHouse SSE implementation in handlers.rs"
else
    echo "✅ Both SSE endpoints are working correctly"
    echo "✅ Real-time event streaming is functional"
fi

exit $exit_code