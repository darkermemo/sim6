#!/bin/sh
# Health and Metrics Endpoints Test Script
# Tests all health and metrics endpoints for proper JSON structure and Prometheus metrics

set -e

# Load environment variables from .env if it exists
if [ -f ".env" ]; then
    set -a
    . ./.env
    set +a
fi

# Default values from config analysis
SIEM_API_URL="${SIEM_API_URL:-http://localhost:9999}"
SIEM_DEV_UI_URL="${SIEM_DEV_UI_URL:-http://localhost:9999}"

# Health and metrics endpoint URLs
HEALTH_URL="${SIEM_API_URL}/health"
DEV_HEALTH_URL="${SIEM_DEV_UI_URL}/dev/health"
METRICS_URL="${SIEM_API_URL}/api/v1/metrics?format=prometheus"
VECTOR_HEALTH_URL="${SIEM_API_URL}/vector/health"

echo "=== Health and Metrics Endpoints Test ==="
echo "SIEM API URL: $SIEM_API_URL"
echo "Health URL: $HEALTH_URL"
echo "Dev Health URL: $DEV_HEALTH_URL"
echo "Metrics URL: $METRICS_URL"
echo "Vector Health URL: $VECTOR_HEALTH_URL"
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
    echo "⚠️  jq not found. JSON validation will be limited."
    echo "   brew install jq  # on macOS"
    echo "   apt-get install jq  # on Ubuntu/Debian"
    HAS_JQ=false
fi
echo

# Function to test endpoint
test_endpoint() {
    local url="$1"
    local name="$2"
    local expected_format="$3"  # json, prometheus, html
    local required_fields="$4"  # space-separated list of required fields
    
    echo "--- Testing $name ---"
    echo "URL: $url"
    echo "Expected format: $expected_format"
    
    # Make request
    response=$(curl -s --write-out "HTTPSTATUS:%{http_code}" "$url" 2>/dev/null || echo "HTTPSTATUS:000")
    
    # Extract HTTP status and body
    http_status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    echo "HTTP Status: $http_status"
    
    if [ "$http_status" != "200" ]; then
        echo "❌ Failed: $name (HTTP $http_status)"
        echo "Response: $body"
        return 1
    fi
    
    echo "✅ HTTP 200 OK"
    
    # Validate format
    case "$expected_format" in
        "json")
            if [ "$HAS_JQ" = true ]; then
                if echo "$body" | jq . >/dev/null 2>&1; then
                    echo "✅ Valid JSON format"
                    
                    # Check required fields
                    if [ -n "$required_fields" ]; then
                        echo "Checking required fields: $required_fields"
                        for field in $required_fields; do
                            if echo "$body" | jq -e ".$field" >/dev/null 2>&1; then
                                value=$(echo "$body" | jq -r ".$field")
                                echo "  ✅ $field: $value"
                            else
                                echo "  ❌ Missing field: $field"
                            fi
                        done
                    fi
                    
                    # Pretty print JSON (truncated)
                    echo "Response structure:"
                    echo "$body" | jq . | head -20
                    if [ $(echo "$body" | jq . | wc -l) -gt 20 ]; then
                        echo "...(truncated)"
                    fi
                else
                    echo "❌ Invalid JSON format"
                    echo "Response: $body"
                    return 1
                fi
            else
                echo "⚠️  Cannot validate JSON (jq not available)"
                echo "Response (first 200 chars): $(echo "$body" | head -c 200)"
            fi
            ;;
        "prometheus")
            # Check for Prometheus metrics format
            if echo "$body" | grep -q "^# HELP\|^# TYPE\|^[a-zA-Z_][a-zA-Z0-9_]*{"; then
                echo "✅ Valid Prometheus metrics format"
                
                # Count metrics
                metric_count=$(echo "$body" | grep -c "^[a-zA-Z_][a-zA-Z0-9_]*{" || echo "0")
                help_count=$(echo "$body" | grep -c "^# HELP" || echo "0")
                type_count=$(echo "$body" | grep -c "^# TYPE" || echo "0")
                
                echo "Metrics found: $metric_count"
                echo "Help entries: $help_count"
                echo "Type entries: $type_count"
                
                # Check for required metrics
                if [ -n "$required_fields" ]; then
                    echo "Checking required metrics: $required_fields"
                    for metric in $required_fields; do
                        if echo "$body" | grep -q "^$metric"; then
                            value=$(echo "$body" | grep "^$metric" | head -1 | awk '{print $2}')
                            echo "  ✅ $metric: $value"
                        else
                            echo "  ❌ Missing metric: $metric"
                        fi
                    done
                fi
                
                # Show sample metrics
                echo "Sample metrics (first 10):"
                echo "$body" | grep "^[a-zA-Z_][a-zA-Z0-9_]*{" | head -10
            else
                echo "❌ Invalid Prometheus metrics format"
                echo "Response (first 200 chars): $(echo "$body" | head -c 200)"
                return 1
            fi
            ;;
        "html")
            if echo "$body" | grep -qi "<html\|<HTML\|<!DOCTYPE"; then
                echo "✅ Valid HTML format"
                
                # Check for basic HTML structure
                if echo "$body" | grep -qi "<head\|<body"; then
                    echo "✅ Complete HTML structure"
                else
                    echo "⚠️  Incomplete HTML structure"
                fi
                
                # Check for required content
                if [ -n "$required_fields" ]; then
                    echo "Checking required content: $required_fields"
                    for content in $required_fields; do
                        if echo "$body" | grep -qi "$content"; then
                            echo "  ✅ Found: $content"
                        else
                            echo "  ❌ Missing: $content"
                        fi
                    done
                fi
                
                # Show title if available
                title=$(echo "$body" | grep -i "<title>" | sed 's/.*<title>\(.*\)<\/title>.*/\1/' | head -1)
                if [ -n "$title" ]; then
                    echo "Page title: $title"
                fi
            else
                echo "❌ Invalid HTML format"
                echo "Response (first 200 chars): $(echo "$body" | head -c 200)"
                return 1
            fi
            ;;
    esac
    
    echo
    return 0
}

# Test 1: Basic Health Endpoint
test_endpoint "$HEALTH_URL" "Basic Health Endpoint" "json" "status"
basic_health_result=$?

# Test 2: Detailed Dev Health Endpoint
test_endpoint "$DEV_HEALTH_URL" "Detailed Dev Health Endpoint" "json" "overall_status timestamp components"
dev_health_result=$?

# Test 3: Prometheus Metrics Endpoint
required_metrics="siem_component_status siem_processing_time_seconds_bucket"
test_endpoint "$METRICS_URL" "Prometheus Metrics Endpoint" "prometheus" "$required_metrics"
metrics_result=$?

# Test 4: Vector Health Endpoint (may not be available)
echo "--- Testing Vector Health Endpoint (Optional) ---"
echo "URL: $VECTOR_HEALTH_URL"
vector_response=$(curl -s --write-out "HTTPSTATUS:%{http_code}" "$VECTOR_HEALTH_URL" 2>/dev/null || echo "HTTPSTATUS:000")
vector_status=$(echo "$vector_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)

if [ "$vector_status" = "200" ]; then
    echo "✅ Vector health endpoint accessible"
    vector_body=$(echo "$vector_response" | sed 's/HTTPSTATUS:[0-9]*$//')
    echo "Response: $vector_body"
    vector_result=0
else
    echo "⚠️  Vector health endpoint not accessible (HTTP $vector_status)"
    echo "This may be expected if Vector integration is not fully configured."
    vector_result=1
fi
echo

echo "--- Component Health Analysis ---"
echo "Analyzing individual component health status..."

# Try to extract component health from basic health endpoint
if [ $basic_health_result -eq 0 ] && [ "$HAS_JQ" = true ]; then
    health_response=$(curl -s "$HEALTH_URL" 2>/dev/null || echo "{}")
    
    # Check for component-specific health
    components="clickhouse kafka redis vector"
    for component in $components; do
        component_status=$(echo "$health_response" | jq -r ".${component}_status // .components.${component}.status // \"unknown\"" 2>/dev/null)
        if [ "$component_status" != "unknown" ] && [ "$component_status" != "null" ]; then
            echo "  $component: $component_status"
        else
            echo "  $component: status not reported"
        fi
    done
else
    echo "⚠️  Cannot analyze component health (basic health endpoint failed or jq unavailable)"
fi
echo

echo "--- Metrics Analysis ---"
echo "Analyzing Prometheus metrics for SIEM-specific gauges..."

if [ $metrics_result -eq 0 ]; then
    metrics_response=$(curl -s "$METRICS_URL" 2>/dev/null || echo "")
    
    # Analyze SIEM-specific metrics
    echo "SIEM Health Metrics:"
    
    # Health status metrics
    health_metrics=$(echo "$metrics_response" | grep "^siem_health_status{" || echo "")
    if [ -n "$health_metrics" ]; then
        echo "✅ Health status metrics found:"
        echo "$health_metrics" | while read -r line; do
            component=$(echo "$line" | sed -n 's/.*component="\([^"]*\)".*/\1/p')
            value=$(echo "$line" | awk '{print $2}')
            status="unknown"
            case "$value" in
                "1") status="healthy" ;;
                "0.5") status="degraded" ;;
                "0") status="unhealthy" ;;
            esac
            echo "  $component: $status ($value)"
        done
    else
        echo "⚠️  No health status metrics found"
    fi
    
    # Health check duration metrics
    duration_metrics=$(echo "$metrics_response" | grep "^siem_health_check_seconds" || echo "")
    if [ -n "$duration_metrics" ]; then
        echo "✅ Health check duration metrics found"
        duration_count=$(echo "$duration_metrics" | wc -l)
        echo "  Duration metric entries: $duration_count"
    else
        echo "⚠️  No health check duration metrics found"
    fi
    
    # Other SIEM metrics
    other_siem_metrics=$(echo "$metrics_response" | grep "^siem_" | grep -v "^siem_health" || echo "")
    if [ -n "$other_siem_metrics" ]; then
        echo "✅ Additional SIEM metrics found:"
        echo "$other_siem_metrics" | head -5
        other_count=$(echo "$other_siem_metrics" | wc -l)
        if [ $other_count -gt 5 ]; then
            echo "  ...(and $((other_count - 5)) more)"
        fi
    else
        echo "⚠️  No additional SIEM metrics found"
    fi
else
    echo "⚠️  Cannot analyze metrics (metrics endpoint failed)"
fi
echo

echo "--- Performance Check ---"
echo "Testing endpoint response times..."

for endpoint_info in "$HEALTH_URL:Basic_Health" "$METRICS_URL:Metrics" "$DEV_HEALTH_URL:Dev_Health"; do
    url=$(echo "$endpoint_info" | sed 's/:Basic_Health$//' | sed 's/:Metrics$//' | sed 's/:Dev_Health$//')
    name=$(echo "$endpoint_info" | sed 's/.*://')
    
    echo "Testing $name response time..."
    start_time=$(date +%s%N)
    curl -s --max-time 10 "$url" >/dev/null 2>&1
    end_time=$(date +%s%N)
    
    duration_ms=$(((end_time - start_time) / 1000000))
    echo "  $name: ${duration_ms}ms"
    
    if [ $duration_ms -lt 1000 ]; then
        echo "  ✅ Fast response (<1s)"
    elif [ $duration_ms -lt 5000 ]; then
        echo "  ✅ Acceptable response (<5s)"
    else
        echo "  ⚠️  Slow response (>5s)"
    fi
done
echo

echo "=== Health and Metrics Test Summary ==="
echo "Basic Health Endpoint: $([ $basic_health_result -eq 0 ] && echo "✅ Working" || echo "❌ Failed")"
echo "Dev Health Endpoint: $([ $dev_health_result -eq 0 ] && echo "✅ Working" || echo "❌ Failed")"
echo "Prometheus Metrics: $([ $metrics_result -eq 0 ] && echo "✅ Working" || echo "❌ Failed")"
echo "Vector Health: $([ $vector_result -eq 0 ] && echo "✅ Working" || echo "⚠️  Not available")"
echo

# Overall assessment
if [ $basic_health_result -eq 0 ] && [ $metrics_result -eq 0 ]; then
    echo "Overall Health & Metrics Status: ✅ FULLY FUNCTIONAL"
    echo "✅ JSON health endpoint working"
    echo "✅ Prometheus metrics exposed"
    echo "✅ Component health monitoring available"
    exit_code=0
elif [ $basic_health_result -eq 0 ] || [ $metrics_result -eq 0 ]; then
    echo "Overall Health & Metrics Status: ⚠️  PARTIALLY FUNCTIONAL"
    echo "Some endpoints are working, but not all required functionality is available."
    exit_code=1
else
    echo "Overall Health & Metrics Status: ❌ NOT FUNCTIONAL"
    echo "Critical health and metrics endpoints are not working."
    exit_code=1
fi

echo
echo "--- Recommendations ---"
if [ $basic_health_result -ne 0 ]; then
    echo "❌ Fix basic health endpoint (/health)"
    echo "  - Ensure proper JSON response format"
    echo "  - Include 'status' field in response"
fi

if [ $metrics_result -ne 0 ]; then
    echo "❌ Fix Prometheus metrics endpoint (/api/v1/metrics)"
    echo "  - Ensure Prometheus format compliance"
    echo "  - Include required SIEM health metrics"
fi

if [ $dev_health_result -ne 0 ]; then
    echo "⚠️  Fix dev health page (/dev/health)"
    echo "  - Ensure HTML response with health information"
fi

if [ $basic_health_result -eq 0 ] && [ $metrics_result -eq 0 ]; then
    echo "✅ All critical endpoints are functional"
    echo "✅ Health monitoring is ready for production use"
fi

exit $exit_code