#!/usr/bin/env bash
set -euo pipefail

# API Contract Test Suite for SIEM v2 Search APIs
# Tests all search endpoints with real requests and validates responses

API="${API_BASE:-http://127.0.0.1:9999/api/v2}"
TENANT="${TENANT_ID:-default}"
TIMESTAMP=$(date +%s)
RESULTS_DIR="target/test-artifacts/api-contract/search"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create results directory
mkdir -p "$RESULTS_DIR"

# Test counter
TOTAL=0
PASSED=0
FAILED=0

# Helper function to run a test
run_test() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local body="$4"
    local expected_status="${5:-200}"
    
    TOTAL=$((TOTAL + 1))
    
    echo -n "Testing $name... "
    
    local output_file="$RESULTS_DIR/${name//[^a-zA-Z0-9]/_}.json"
    local status_code
    
    if [ "$method" = "GET" ]; then
        status_code=$(curl -s -w "%{http_code}" -o "$output_file" \
            -H "Content-Type: application/json" \
            "$API$endpoint")
    else
        status_code=$(curl -s -w "%{http_code}" -o "$output_file" \
            -X "$method" \
            -H "Content-Type: application/json" \
            -d "$body" \
            "$API$endpoint")
    fi
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓${NC} ($status_code)"
        PASSED=$((PASSED + 1))
        
        # Pretty print the response
        if command -v jq >/dev/null 2>&1; then
            jq . "$output_file" > "${output_file}.pretty" 2>/dev/null || true
        fi
    else
        echo -e "${RED}✗${NC} (expected $expected_status, got $status_code)"
        FAILED=$((FAILED + 1))
        echo "Response saved to: $output_file"
    fi
}

# Test SSE endpoint
test_sse() {
    local name="$1"
    local endpoint="$2"
    local body="$3"
    
    TOTAL=$((TOTAL + 1))
    
    echo -n "Testing $name (SSE)... "
    
    local output_file="$RESULTS_DIR/${name//[^a-zA-Z0-9]/_}.txt"
    
    # Test SSE for 3 seconds and capture first 20 lines
    timeout 3s curl -N -H 'Accept: text/event-stream' \
        -H 'Content-Type: application/json' \
        -X POST "$API$endpoint" \
        -d "$body" 2>/dev/null | head -20 > "$output_file" || true
    
    if grep -q "event:" "$output_file"; then
        echo -e "${GREEN}✓${NC} (SSE working)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗${NC} (no SSE events)"
        FAILED=$((FAILED + 1))
    fi
}

echo "=== SIEM v2 API Contract Tests ==="
echo "API Base: $API"
echo "Tenant: $TENANT"
echo "Results: $RESULTS_DIR"
echo ""

# 1. Search Compile/Execute/Estimate/Facets/Timeline
echo "## 1. Core Search APIs"

run_test "search_compile" "POST" "/search/compile" '{
    "tenant_id": "'$TENANT'",
    "time": {"last_seconds": 600},
    "q": "severity:high AND event_type:login",
    "options": {
        "coerce_types": true,
        "default_field": "message"
    }
}'

run_test "search_execute" "POST" "/search/execute" '{
    "tenant_id": "'$TENANT'",
    "time": {"last_seconds": 600},
    "q": "severity:high",
    "select": ["event_timestamp", "severity", "event_type", "message"],
    "sort": [{"field": "event_timestamp", "dir": "desc"}],
    "limit": 10
}'

run_test "search_execute_with_cursor" "POST" "/search/execute" '{
    "tenant_id": "'$TENANT'",
    "time": {"last_seconds": 3600},
    "q": "*",
    "limit": 5,
    "cursor": null
}'

run_test "search_estimate" "POST" "/search/estimate" '{
    "tenant_id": "'$TENANT'",
    "time": {"last_seconds": 86400},
    "q": "*"
}'

run_test "search_facets" "POST" "/search/facets" '{
    "tenant_id": "'$TENANT'",
    "time": {"last_seconds": 3600},
    "q": "*",
    "facets": [
        {"field": "severity", "limit": 10, "order_by": "count_desc"},
        {"field": "event_type", "limit": 10},
        {"field": "host", "limit": 5}
    ]
}'

run_test "search_timeline" "POST" "/search/timeline" '{
    "tenant_id": "'$TENANT'",
    "time": {"last_seconds": 3600},
    "q": "*",
    "interval_ms": 300000
}'

# 2. Streaming (SSE)
echo -e "\n## 2. Streaming APIs"

test_sse "search_tail" "/search/tail" '{
    "tenant_id": "'$TENANT'",
    "time": {"last_seconds": 60},
    "q": "*",
    "select": ["event_timestamp", "message", "severity"],
    "stream_id": "test-stream-'$TIMESTAMP'"
}'

# 3. Schema & Grammar
echo -e "\n## 3. Schema APIs"

run_test "schema_fields" "GET" "/schema/fields?tenant_id=$TENANT"
run_test "schema_enums" "GET" "/schema/enums?tenant_id=$TENANT"
run_test "search_grammar" "GET" "/search/grammar"

# 4. Saved Searches CRUD
echo -e "\n## 4. Saved Searches"

# Create saved search
SAVED_ID=$(curl -s -X POST "$API/search/saved" \
    -H "Content-Type: application/json" \
    -d '{
        "tenant_id": "'$TENANT'",
        "name": "Test Saved Search '$TIMESTAMP'",
        "q": "severity:high",
        "time": {"last_seconds": 3600},
        "select": ["event_timestamp", "severity", "message"],
        "owner": "test-user"
    }' | jq -r '.saved_search_id // empty' 2>/dev/null || echo "")

if [ -n "$SAVED_ID" ]; then
    run_test "saved_search_create" "POST" "/search/saved" '{"status": "created"}'
    
    run_test "saved_search_get" "GET" "/search/saved/$SAVED_ID"
    run_test "saved_search_list" "GET" "/search/saved?tenant_id=$TENANT&limit=10"
    
    run_test "saved_search_update" "PATCH" "/search/saved/$SAVED_ID" '{
        "name": "Updated Test Search"
    }'
    
    # Pin the search
    PIN_ID=$(curl -s -X POST "$API/search/pins" \
        -H "Content-Type: application/json" \
        -d '{"tenant_id": "'$TENANT'", "saved_search_id": "'$SAVED_ID'"}' \
        | jq -r '.pin_id // empty' 2>/dev/null || echo "")
    
    if [ -n "$PIN_ID" ]; then
        run_test "pin_create" "POST" "/search/pins" '{"status": "created"}'
        run_test "pins_list" "GET" "/search/pins?tenant_id=$TENANT"
        run_test "pin_delete" "DELETE" "/search/pins/$PIN_ID"
    fi
    
    run_test "saved_search_delete" "DELETE" "/search/saved/$SAVED_ID"
else
    echo -e "${YELLOW}⚠${NC}  Skipping saved search tests (creation failed)"
fi

# 5. Templates
echo -e "\n## 5. Search Templates"

run_test "template_create" "POST" "/search/templates" '{
    "name": "Failed Logins Template",
    "q": "event_type:login AND outcome:failed",
    "doc": "Use this to find failed login attempts",
    "defaults": {
        "time": {"last_seconds": 3600}
    }
}'

run_test "templates_list" "GET" "/search/templates"

# 6. History
echo -e "\n## 6. Search History"

run_test "history_list" "GET" "/search/history?tenant_id=$TENANT&limit=10"

# 7. Exports
echo -e "\n## 7. Search Exports"

EXPORT_ID=$(curl -s -X POST "$API/search/exports" \
    -H "Content-Type: application/json" \
    -d '{
        "tenant_id": "'$TENANT'",
        "time": {"last_seconds": 3600},
        "q": "*",
        "select": ["event_timestamp", "severity", "message"],
        "format": "csv",
        "max_rows": 100
    }' | jq -r '.export_id // empty' 2>/dev/null || echo "")

if [ -n "$EXPORT_ID" ]; then
    run_test "export_create" "POST" "/search/exports" '{"status": "created"}'
    run_test "export_status" "GET" "/search/exports/$EXPORT_ID"
    run_test "export_delete" "DELETE" "/search/exports/$EXPORT_ID"
else
    echo -e "${YELLOW}⚠${NC}  Skipping export tests (creation failed)"
fi

# 8. Autocomplete
echo -e "\n## 8. Autocomplete APIs"

run_test "suggest_fields" "GET" "/search/suggest/fields?tenant_id=$TENANT&prefix=se"
run_test "suggest_values" "GET" "/search/suggest/values?tenant_id=$TENANT&field=severity&prefix=h&limit=10"
run_test "suggest_tokens" "GET" "/search/suggest/tokens?prefix=sev"

# 9. Error Cases
echo -e "\n## 9. Error Handling"

run_test "error_invalid_query" "POST" "/search/compile" '{
    "tenant_id": "'$TENANT'",
    "time": {"last_seconds": 600},
    "q": "invalid::syntax>>>"
}' 422

run_test "error_missing_tenant" "POST" "/search/execute" '{
    "time": {"last_seconds": 600},
    "q": "*"
}' 400

run_test "error_invalid_time" "POST" "/search/execute" '{
    "tenant_id": "'$TENANT'",
    "time": {"from": 2000000000, "to": 1000000000},
    "q": "*"
}' 400

# Summary
echo -e "\n=== Test Summary ==="
echo "Total Tests: $TOTAL"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Results saved to: $RESULTS_DIR"

# Generate summary report
cat > "$RESULTS_DIR/summary.json" <<EOF
{
    "timestamp": $TIMESTAMP,
    "api_base": "$API",
    "tenant": "$TENANT",
    "total": $TOTAL,
    "passed": $PASSED,
    "failed": $FAILED,
    "success_rate": $(echo "scale=2; $PASSED * 100 / $TOTAL" | bc)
}
EOF

# Exit with failure if any tests failed
if [ $FAILED -gt 0 ]; then
    exit 1
fi

echo -e "\n${GREEN}All tests passed!${NC}"
