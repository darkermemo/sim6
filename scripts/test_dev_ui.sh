#!/bin/sh
# Dev UI Smoke Test Script
# Tests all /dev routes for proper HTML responses and basic functionality

set -e

# Load environment variables from .env if it exists
if [ -f ".env" ]; then
    set -a
    . ./.env
    set +a
fi

# Default values from config analysis
SIEM_DEV_UI_URL="${SIEM_DEV_UI_URL:-http://localhost:9999}"

echo "=== Dev UI Smoke Test ==="
echo "SIEM Dev UI URL: $SIEM_DEV_UI_URL"
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
echo

# Define HTML test routes with expected markers
# Format: "route:expected_title:expected_content1:expected_content2"
html_routes="/dev:SIEM_Analytics_Dashboard:Analytics:Dashboard /dev/events:Advanced_Event_Search:Event_Search:events-table /dev/rules:Enhanced_Correlation_Rules:Correlation_Rules:rules /dev/metrics/live:Live_Metrics:Live_Metrics:metrics"

# Define JSON test routes with expected fields
# Format: "route:expected_field1:expected_field2"
json_routes="/dev/health:overall_status:timestamp
/dev/metrics/eps:global:timestamp"

# Function to test a JSON route
test_json_route() {
    local route="$1"
    local expected_field1="$2"
    local expected_field2="$3"
    
    local url="${SIEM_DEV_UI_URL}${route}"
    
    echo "--- Testing JSON Route: $route ---"
    echo "URL: $url"
    echo "Expected fields: $expected_field1, $expected_field2"
    
    # Make request
    response=$(curl -s --write-out "HTTPSTATUS:%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "HTTPSTATUS:000")
    
    # Extract HTTP status and body
    http_status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    echo "HTTP Status: $http_status"
    
    # Check HTTP status
    if [ "$http_status" != "200" ]; then
        echo "❌ Failed: HTTP $http_status"
        if [ -n "$body" ]; then
            echo "Response: $(echo "$body" | head -c 200)..."
        fi
        return 1
    fi
    
    echo "✅ HTTP 200 OK"
    
    # Check if response is valid JSON
    if echo "$body" | jq . >/dev/null 2>&1; then
        echo "✅ Valid JSON response"
    else
        echo "❌ Not a valid JSON response"
        echo "Response start: $(echo "$body" | head -c 100)..."
        return 1
    fi
    
    # Check for expected fields
    fields_found=0
    total_fields=0
    
    for field in "$expected_field1" "$expected_field2"; do
        if [ -n "$field" ] && [ "$field" != "" ]; then
            total_fields=$((total_fields + 1))
            if echo "$body" | jq -e "has(\"$field\")" >/dev/null 2>&1; then
                echo "✅ Expected field found: $field"
                fields_found=$((fields_found + 1))
            else
                echo "⚠️  Expected field not found: $field"
            fi
        fi
    done
    
    # Check response size
    response_size=$(echo "$body" | wc -c)
    echo "Response size: $response_size bytes"
    
    if [ "$response_size" -lt 10 ]; then
        echo "⚠️  Very small response (possible error)"
    else
        echo "✅ Reasonable response size"
    fi
    
    echo
    
    # Overall assessment for this route
    if [ "$http_status" = "200" ] && [ $fields_found -gt 0 ]; then
        echo "JSON Route $route: ✅ WORKING"
        return 0
    else
        echo "JSON Route $route: ❌ ISSUES DETECTED"
        return 1
    fi
}

# Function to test a single HTML route
test_route() {
    local route="$1"
    local expected_title="$2"
    local expected_content1="$3"
    local expected_content2="$4"
    
    local url="${SIEM_DEV_UI_URL}${route}"
    
    echo "--- Testing Route: $route ---"
    echo "URL: $url"
    echo "Expected title: $expected_title"
    echo "Expected content: $expected_content1, $expected_content2"
    
    # Make request
    response=$(curl -s --write-out "HTTPSTATUS:%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "HTTPSTATUS:000")
    
    # Extract HTTP status and body
    http_status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    echo "HTTP Status: $http_status"
    
    # Check HTTP status
    if [ "$http_status" != "200" ]; then
        echo "❌ Failed: HTTP $http_status"
        if [ -n "$body" ]; then
            echo "Response: $(echo "$body" | head -c 200)..."
        fi
        return 1
    fi
    
    echo "✅ HTTP 200 OK"
    
    # Check if response is HTML
    if echo "$body" | grep -qi "<html\|<HTML\|<!DOCTYPE"; then
        echo "✅ Valid HTML response"
    else
        echo "❌ Not a valid HTML response"
        echo "Response start: $(echo "$body" | head -c 100)..."
        return 1
    fi
    
    # Check for basic HTML structure
    html_structure_ok=true
    
    if echo "$body" | grep -qi "<head"; then
        echo "✅ HTML head section found"
    else
        echo "⚠️  HTML head section not found"
        html_structure_ok=false
    fi
    
    if echo "$body" | grep -qi "<body"; then
        echo "✅ HTML body section found"
    else
        echo "⚠️  HTML body section not found"
        html_structure_ok=false
    fi
    
    # Extract and check title
    title=$(echo "$body" | grep -i "<title>" | sed 's/.*<title>\(.*\)<\/title>.*/\1/' | head -1)
    if [ -n "$title" ]; then
        echo "✅ Page title found: $title"
        
        # Check if title contains expected content
        if echo "$title" | grep -qi "$expected_title"; then
            echo "✅ Title contains expected content: $expected_title"
        else
            echo "⚠️  Title does not contain expected content: $expected_title"
        fi
    else
        echo "⚠️  No page title found"
    fi
    
    # Check for expected content markers
    content_checks_passed=0
    total_content_checks=0
    
    for content in "$expected_content1" "$expected_content2"; do
        if [ -n "$content" ] && [ "$content" != "" ]; then
            total_content_checks=$((total_content_checks + 1))
            if echo "$body" | grep -qi "$content"; then
                echo "✅ Expected content found: $content"
                content_checks_passed=$((content_checks_passed + 1))
            else
                echo "⚠️  Expected content not found: $content"
            fi
        fi
    done
    
    # Check for common UI elements
    echo "Checking for common UI elements:"
    
    # Navigation elements
    if echo "$body" | grep -qi "nav\|menu\|navigation"; then
        echo "  ✅ Navigation elements found"
    else
        echo "  ⚠️  No navigation elements found"
    fi
    
    # Form elements (if applicable)
    if echo "$body" | grep -qi "<form\|<input\|<button"; then
        echo "  ✅ Interactive elements found"
    else
        echo "  ⚠️  No interactive elements found"
    fi
    
    # CSS/styling
    if echo "$body" | grep -qi "<style\|<link.*css\|class=\|id="; then
        echo "  ✅ Styling elements found"
    else
        echo "  ⚠️  No styling elements found"
    fi
    
    # JavaScript (should be minimal for server-side rendered pages)
    js_count=$(echo "$body" | grep -ci "<script" || echo "0")
    echo "  JavaScript blocks found: $js_count"
    if [ "$js_count" -gt 10 ]; then
        echo "  ⚠️  High JavaScript usage (expected minimal for SSR)"
    else
        echo "  ✅ Appropriate JavaScript usage for SSR"
    fi
    
    # Check response size
    response_size=$(echo "$body" | wc -c)
    echo "Response size: $response_size bytes"
    
    if [ "$response_size" -lt 100 ]; then
        echo "⚠️  Very small response (possible error page)"
    elif [ "$response_size" -gt 100000 ]; then
        echo "⚠️  Very large response (possible performance issue)"
    else
        echo "✅ Reasonable response size"
    fi
    
    # Performance check
    echo "Testing response time..."
    start_time=$(date +%s%N)
    curl -s --max-time 10 "$url" >/dev/null 2>&1
    end_time=$(date +%s%N)
    
    duration_ms=$(((end_time - start_time) / 1000000))
    echo "Response time: ${duration_ms}ms"
    
    if [ $duration_ms -lt 1000 ]; then
        echo "✅ Fast response (<1s)"
    elif [ $duration_ms -lt 3000 ]; then
        echo "✅ Acceptable response (<3s)"
    else
        echo "⚠️  Slow response (>3s)"
    fi
    
    echo
    
    # Overall assessment for this route
    if [ "$http_status" = "200" ] && [ "$html_structure_ok" = true ] && [ $content_checks_passed -gt 0 ]; then
        echo "Route $route: ✅ WORKING"
        return 0
    else
        echo "Route $route: ❌ ISSUES DETECTED"
        return 1
    fi
}

# Function to test for 404 errors on invalid routes
test_404_routes() {
    echo "--- Testing 404 Error Handling ---"
    
    invalid_routes="/dev/nonexistent /dev/invalid/path /dev/events/invalid"
    
    for route in $invalid_routes; do
        url="${SIEM_DEV_UI_URL}${route}"
        echo "Testing invalid route: $route"
        
        response=$(curl -s --write-out "HTTPSTATUS:%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "HTTPSTATUS:000")
        http_status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
        
        echo "  HTTP Status: $http_status"
        
        if [ "$http_status" = "404" ]; then
            echo "  ✅ Proper 404 response"
        elif [ "$http_status" = "200" ]; then
            echo "  ⚠️  Returns 200 (may have catch-all routing)"
        else
            echo "  ⚠️  Unexpected status: $http_status"
        fi
    done
    
    echo
}

# Function to check for JavaScript errors (basic)
check_js_errors() {
    echo "--- Basic JavaScript Error Check ---"
    echo "Checking for common JavaScript error patterns in HTML..."
    
    for route_info in $test_routes; do
        if [ -z "$route_info" ]; then continue; fi
        
        route=$(echo "$route_info" | cut -d: -f1)
        url="${SIEM_DEV_UI_URL}${route}"
        
        echo "Checking $route for JS errors..."
        
        response=$(curl -s "$url" 2>/dev/null || echo "")
        
        # Check for common error patterns
        if echo "$response" | grep -qi "javascript error\|uncaught\|undefined is not a function\|cannot read property"; then
            echo "  ⚠️  Potential JavaScript errors detected"
        else
            echo "  ✅ No obvious JavaScript errors"
        fi
        
        # Check for inline error handlers
        if echo "$response" | grep -qi "onerror\|window.onerror"; then
            echo "  ✅ Error handling found"
        else
            echo "  ⚠️  No error handling detected"
        fi
    done
    
    echo
}

# Function to test API endpoints that the UI might depend on
test_api_dependencies() {
    echo "--- Testing API Dependencies ---"
    echo "Checking API endpoints that the Dev UI might depend on..."
    
    api_endpoints="
    /api/v1/events:Events API
    /api/v1/health:Health API
    /api/v1/metrics:Metrics API
    /health:Basic Health
    "
    
    for endpoint_info in $api_endpoints; do
        if [ -z "$endpoint_info" ]; then continue; fi
        
        endpoint=$(echo "$endpoint_info" | cut -d: -f1)
        name=$(echo "$endpoint_info" | cut -d: -f2)
        url="${SIEM_DEV_UI_URL}${endpoint}"
        
        echo "Testing $name ($endpoint)..."
        
        response=$(curl -s --write-out "HTTPSTATUS:%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "HTTPSTATUS:000")
        http_status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
        
        echo "  HTTP Status: $http_status"
        
        if [ "$http_status" = "200" ]; then
            echo "  ✅ API endpoint accessible"
        else
            echo "  ⚠️  API endpoint not accessible (may affect UI functionality)"
        fi
    done
    
    echo
}

# Main test execution
echo "Starting Dev UI smoke tests..."
echo

# Test HTML routes
passed_routes=0
total_routes=0

echo "=== Testing HTML Routes ==="
for route_info in $html_routes; do
    if [ -z "$route_info" ]; then continue; fi
    
    route=$(echo "$route_info" | cut -d: -f1)
    expected_title=$(echo "$route_info" | cut -d: -f2)
    expected_content1=$(echo "$route_info" | cut -d: -f3)
    expected_content2=$(echo "$route_info" | cut -d: -f4)
    
    total_routes=$((total_routes + 1))
    
    if test_route "$route" "$expected_title" "$expected_content1" "$expected_content2"; then
        passed_routes=$((passed_routes + 1))
    fi
done

echo "=== Testing JSON Routes ==="
for route_info in $json_routes; do
    if [ -z "$route_info" ]; then continue; fi
    
    route=$(echo "$route_info" | cut -d: -f1)
    expected_field1=$(echo "$route_info" | cut -d: -f2)
    expected_field2=$(echo "$route_info" | cut -d: -f3)
    
    total_routes=$((total_routes + 1))
    
    if test_json_route "$route" "$expected_field1" "$expected_field2"; then
        passed_routes=$((passed_routes + 1))
    fi
done

# Test 404 handling
test_404_routes

# Check for JavaScript errors
check_js_errors

# Test API dependencies
test_api_dependencies

echo "=== Dev UI Smoke Test Summary ==="
echo "Routes tested: $total_routes"
echo "Routes working: $passed_routes"
echo "Routes with issues: $((total_routes - passed_routes))"
echo

# Detailed results
echo "--- Detailed Results ---"
for route_info in $test_routes; do
    if [ -z "$route_info" ]; then continue; fi
    
    route=$(echo "$route_info" | cut -d: -f1)
    
    # Re-test quickly for status
    url="${SIEM_DEV_UI_URL}${route}"
    response=$(curl -s --write-out "HTTPSTATUS:%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "HTTPSTATUS:000")
    http_status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    if [ "$http_status" = "200" ]; then
        echo "$route: ✅ Working"
    else
        echo "$route: ❌ Failed (HTTP $http_status)"
    fi
done

echo

# Overall assessment
if [ $passed_routes -eq $total_routes ]; then
    echo "Overall Dev UI Status: ✅ FULLY FUNCTIONAL"
    echo "✅ All routes return proper HTML responses"
    echo "✅ Basic UI structure is intact"
    echo "✅ Server-side rendering is working"
    exit_code=0
elif [ $passed_routes -gt 0 ]; then
    echo "Overall Dev UI Status: ⚠️  PARTIALLY FUNCTIONAL"
    echo "Some routes are working, but issues detected on others."
    echo "Working routes: $passed_routes/$total_routes"
    exit_code=1
else
    echo "Overall Dev UI Status: ❌ NOT FUNCTIONAL"
    echo "No routes are working properly."
    exit_code=1
fi

echo
echo "--- Recommendations ---"
if [ $passed_routes -lt $total_routes ]; then
    echo "❌ Fix failing routes"
    echo "  - Check server logs for errors"
    echo "  - Verify route handlers are properly configured"
    echo "  - Ensure templates/views are available"
fi

echo "⚠️  Consider adding:"
echo "  - Client-side error reporting"
echo "  - Performance monitoring"
echo "  - Accessibility improvements"
echo "  - Progressive enhancement"

if [ $exit_code -eq 0 ]; then
    echo "✅ Dev UI is ready for development use"
    echo "✅ Server-side rendering provides good baseline functionality"
fi

exit $exit_code