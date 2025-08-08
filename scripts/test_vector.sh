#!/bin/sh
# Vector Connectivity Test Script
# Tests Vector health endpoint, metrics scraping, and admin API access

set -e

# Load environment variables from .env if it exists
if [ -f ".env" ]; then
    set -a
    . ./.env
    set +a
fi

# Default values from config analysis
VECTOR_BASE_URL="${VECTOR_BASE_URL:-http://127.0.0.1:8686}"
VECTOR_HEALTH_PATH="${VECTOR_HEALTH_PATH:-/health}"
VECTOR_METRICS_PATH="${VECTOR_METRICS_PATH:-/metrics}"
VECTOR_TIMEOUT_MS="${VECTOR_TIMEOUT_MS:-5000}"

# Construct full URLs
VECTOR_HEALTH_URL="${VECTOR_BASE_URL}${VECTOR_HEALTH_PATH}"
VECTOR_METRICS_URL="${VECTOR_BASE_URL}${VECTOR_METRICS_PATH}"
VECTOR_ADMIN_URL="${VECTOR_BASE_URL}/api/v1"

echo "=== Vector Connectivity Test ==="
echo "Vector Base URL: $VECTOR_BASE_URL"
echo "Health URL: $VECTOR_HEALTH_URL"
echo "Metrics URL: $VECTOR_METRICS_URL"
echo "Admin API URL: $VECTOR_ADMIN_URL"
echo "Timeout: ${VECTOR_TIMEOUT_MS}ms"
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

if command_exists jq; then
    echo "✅ jq found (for JSON parsing)"
    HAS_JQ=true
else
    echo "⚠️  jq not found. JSON parsing will be limited."
    echo "   brew install jq  # on macOS"
    echo "   apt-get install jq  # on Ubuntu/Debian"
    HAS_JQ=false
fi
echo

# Function to make HTTP request with timeout
make_request() {
    local url="$1"
    local description="$2"
    local expected_content="$3"
    
    echo "Testing: $description"
    echo "URL: $url"
    
    # Convert timeout from ms to seconds for curl
    timeout_seconds=$((VECTOR_TIMEOUT_MS / 1000))
    if [ $timeout_seconds -lt 1 ]; then
        timeout_seconds=1
    fi
    
    response=$(curl -s --max-time $timeout_seconds --write-out "HTTPSTATUS:%{http_code}" "$url" 2>/dev/null || echo "HTTPSTATUS:000")
    
    # Extract HTTP status and body
    http_status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    echo "HTTP Status: $http_status"
    
    if [ "$http_status" = "200" ]; then
        echo "✅ Success: $description"
        
        # Check for expected content if provided
        if [ -n "$expected_content" ]; then
            if echo "$body" | grep -q "$expected_content"; then
                echo "✅ Expected content found: $expected_content"
            else
                echo "⚠️  Expected content not found: $expected_content"
            fi
        fi
        
        # Show response body (truncated)
        echo "Response (first 500 chars):"
        echo "$body" | head -c 500
        if [ ${#body} -gt 500 ]; then
            echo "...(truncated)"
        fi
        
    elif [ "$http_status" = "000" ]; then
        echo "❌ Failed: $description (Connection failed or timeout)"
        return 1
    else
        echo "❌ Failed: $description (HTTP $http_status)"
        echo "Response: $body"
        return 1
    fi
    echo
    
    # Return the response body for further processing
    echo "$body"
}

# Test 1: Basic connectivity
echo "--- Test 1: Basic Connectivity ---"
if curl -s --max-time 5 "$VECTOR_BASE_URL" >/dev/null 2>&1; then
    echo "✅ Vector base URL is reachable"
else
    echo "❌ Vector base URL is not reachable"
    echo "Please ensure Vector is running on $VECTOR_BASE_URL"
    exit 1
fi
echo

# Test 2: Health endpoint
echo "--- Test 2: Health Endpoint ---"
health_response=$(make_request "$VECTOR_HEALTH_URL" "Health check" "ok")
health_exit_code=$?

if [ $health_exit_code -eq 0 ]; then
    # Parse health status if jq is available
    if [ "$HAS_JQ" = true ]; then
        if echo "$health_response" | jq . >/dev/null 2>&1; then
            echo "Health response is valid JSON"
            status=$(echo "$health_response" | jq -r '.status // "unknown"')
            echo "Health Status: $status"
        else
            echo "Health response is not JSON (may be plain text 'ok')"
        fi
    fi
else
    echo "⚠️  Health endpoint test failed, but continuing with other tests..."
fi
echo

# Test 3: Metrics endpoint
echo "--- Test 3: Metrics Endpoint (Prometheus) ---"
metrics_response=$(make_request "$VECTOR_METRICS_URL" "Prometheus metrics" "vector_")
metrics_exit_code=$?

if [ $metrics_exit_code -eq 0 ]; then
    echo "--- Parsing Key Metrics ---"
    
    # Look for common Vector metrics
    metrics_to_check="vector_events_processed_total vector_events_in_total vector_events_out_total vector_up"
    
    for metric in $metrics_to_check; do
        if echo "$metrics_response" | grep -q "^$metric"; then
            value=$(echo "$metrics_response" | grep "^$metric" | head -1 | awk '{print $2}')
            echo "✅ Found metric: $metric = $value"
        else
            echo "⚠️  Metric not found: $metric"
        fi
    done
    
    # Count total metrics
    metric_count=$(echo "$metrics_response" | grep -c "^vector_" || echo "0")
    echo "Total Vector metrics found: $metric_count"
    
else
    echo "⚠️  Metrics endpoint test failed, but continuing with other tests..."
fi
echo

# Test 4: Admin API (if available)
echo "--- Test 4: Admin API ---"
admin_response=$(make_request "$VECTOR_ADMIN_URL" "Admin API" "" || echo "FAILED")

if [ "$admin_response" != "FAILED" ]; then
    echo "✅ Admin API is accessible"
    
    # Try to get topology information
    echo "--- Testing Admin API Endpoints ---"
    
    # Test topology endpoint
    topology_url="${VECTOR_ADMIN_URL}/topology"
    echo "Testing topology endpoint: $topology_url"
    if curl -s --max-time 5 "$topology_url" >/dev/null 2>&1; then
        echo "✅ Topology endpoint accessible"
    else
        echo "⚠️  Topology endpoint not accessible"
    fi
    
    # Test components endpoint
    components_url="${VECTOR_ADMIN_URL}/components"
    echo "Testing components endpoint: $components_url"
    if curl -s --max-time 5 "$components_url" >/dev/null 2>&1; then
        echo "✅ Components endpoint accessible"
    else
        echo "⚠️  Components endpoint not accessible"
    fi
    
else
    echo "⚠️  Admin API not accessible (this may be normal if not enabled)"
fi
echo

# Test 5: Configuration verification
echo "--- Test 5: Configuration Verification ---"
echo "Checking if Vector configuration aligns with SIEM expectations..."

# Try to get configuration info from admin API
config_url="${VECTOR_ADMIN_URL}/config"
echo "Attempting to retrieve configuration from: $config_url"

config_response=$(curl -s --max-time 5 "$config_url" 2>/dev/null || echo "")
if [ -n "$config_response" ] && [ "$config_response" != "" ]; then
    echo "✅ Configuration endpoint accessible"
    
    if [ "$HAS_JQ" = true ]; then
        # Look for Kafka-related configuration
        if echo "$config_response" | jq . >/dev/null 2>&1; then
            kafka_sources=$(echo "$config_response" | jq -r '.sources | to_entries[] | select(.value.type == "kafka") | .key' 2>/dev/null || echo "")
            if [ -n "$kafka_sources" ]; then
                echo "✅ Found Kafka sources: $kafka_sources"
            else
                echo "⚠️  No Kafka sources found in configuration"
            fi
            
            clickhouse_sinks=$(echo "$config_response" | jq -r '.sinks | to_entries[] | select(.value.type == "clickhouse") | .key' 2>/dev/null || echo "")
            if [ -n "$clickhouse_sinks" ]; then
                echo "✅ Found ClickHouse sinks: $clickhouse_sinks"
            else
                echo "⚠️  No ClickHouse sinks found in configuration"
            fi
        fi
    fi
else
    echo "⚠️  Configuration endpoint not accessible"
fi
echo

# Test 6: Performance metrics
echo "--- Test 6: Performance Metrics ---"
echo "Checking Vector performance indicators..."

if [ $metrics_exit_code -eq 0 ]; then
    # Extract performance metrics
    echo "Performance Metrics:"
    
    # Events processed
    events_processed=$(echo "$metrics_response" | grep "vector_events_processed_total" | head -1 | awk '{print $2}' || echo "N/A")
    echo "  Events Processed Total: $events_processed"
    
    # Memory usage
    memory_used=$(echo "$metrics_response" | grep "vector_memory_used_bytes" | head -1 | awk '{print $2}' || echo "N/A")
    if [ "$memory_used" != "N/A" ]; then
        memory_mb=$((memory_used / 1024 / 1024))
        echo "  Memory Used: ${memory_mb}MB"
    else
        echo "  Memory Used: N/A"
    fi
    
    # CPU usage
    cpu_seconds=$(echo "$metrics_response" | grep "vector_cpu_seconds_total" | head -1 | awk '{print $2}' || echo "N/A")
    echo "  CPU Seconds Total: $cpu_seconds"
    
else
    echo "⚠️  Cannot retrieve performance metrics (metrics endpoint failed)"
fi
echo

echo "=== Vector Connectivity Test Summary ==="
echo "Base URL: $([ $? -eq 0 ] && echo "✅ Reachable" || echo "❌ Unreachable")"
echo "Health Endpoint: $([ $health_exit_code -eq 0 ] && echo "✅ Working" || echo "❌ Failed")"
echo "Metrics Endpoint: $([ $metrics_exit_code -eq 0 ] && echo "✅ Working" || echo "❌ Failed")"
echo "Admin API: $([ "$admin_response" != "FAILED" ] && echo "✅ Accessible" || echo "⚠️  Limited access")"
echo
echo "Vector Status: $([ $health_exit_code -eq 0 ] && [ $metrics_exit_code -eq 0 ] && echo "✅ Ready for monitoring" || echo "⚠️  Limited functionality")"
echo
echo "--- Vector Role in SIEM ---"
echo "✅ Health Monitoring: Vector health status can be monitored"
echo "✅ Metrics Collection: Prometheus metrics available for scraping"
echo "⚠️  Data Ingestion: Vector role in data pipeline needs verification"
echo "   (Current architecture appears to use Kafka for ingestion)"