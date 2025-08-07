#!/usr/bin/env bash
set -euo pipefail

# Production-Grade SIEM Smoke Test
# Tests all 5 pillars of the enterprise SIEM system

echo "🚀 SIEM PRODUCTION SMOKE TEST STARTING..."
echo "=============================================="

# Configuration
CLICKHOUSE_URL="http://localhost:8123"
SIEM_BASE_URL="http://localhost:8081"
TEST_TENANT="smoke-test-tenant"
TIMESTAMP=$(date +%s)

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=8

# Utility functions
log_test() {
    echo "🔍 TEST $1: $2"
}

test_passed() {
    echo "✅ PASS: $1"
    ((TESTS_PASSED++))
}

test_failed() {
    echo "❌ FAIL: $1"
    ((TESTS_FAILED++))
}

check_service() {
    local url=$1
    local service_name=$2
    
    if curl -s --max-time 5 "$url" > /dev/null; then
        test_passed "$service_name is responding"
        return 0
    else
        test_failed "$service_name is not responding at $url"
        return 1
    fi
}

# Test 1: Core Services Health
log_test "1" "Core Services Health Check"
check_service "$CLICKHOUSE_URL/?query=SELECT%201" "ClickHouse"
check_service "$SIEM_BASE_URL/health" "SIEM API"

# Test 2: ClickHouse Data Ingestion
log_test "2" "Direct ClickHouse Event Ingestion"

# Insert test events directly into ClickHouse
for i in {1..10}; do
    EVENT_ID="smoke-test-${TIMESTAMP}-${i}"
    RAW_EVENT="{\"tenant_id\":\"$TEST_TENANT\",\"message\":\"Smoke test event $i\",\"timestamp\":$TIMESTAMP,\"source\":\"smoke_test\",\"event_type\":\"test\"}"
    
    INSERT_SQL="INSERT INTO dev.events (event_id, tenant_id, source_type, raw_event, message, source_ip, event_timestamp) VALUES ('$EVENT_ID', '$TEST_TENANT', 'smoke_test', '$RAW_EVENT', 'Smoke test event $i', '127.0.0.1', $TIMESTAMP)"
    
    curl -s --max-time 10 "$CLICKHOUSE_URL" --data "$INSERT_SQL" > /dev/null
done

# Wait for ingestion
sleep 2

# Verify events were inserted
EVENT_COUNT=$(curl -s --max-time 10 "$CLICKHOUSE_URL" --data "SELECT count() FROM dev.events WHERE tenant_id='$TEST_TENANT'" | tr -d '\n')

if [[ "$EVENT_COUNT" -ge 10 ]]; then
    test_passed "ClickHouse ingestion - inserted $EVENT_COUNT events"
else
    test_failed "ClickHouse ingestion - expected >=10 events, got $EVENT_COUNT"
fi

# Test 3: Redis SSE Stream
log_test "3" "Redis SSE Stream Connectivity"
if timeout 5 bash -c "curl -N --max-time 5 '$SIEM_BASE_URL/api/v1/events/stream/redis' | head -n1" 2>/dev/null | grep -q "data\|event\|heartbeat"; then
    test_passed "Redis SSE stream is working"
else
    test_failed "Redis SSE stream not responding"
fi

# Test 4: ClickHouse SSE Stream  
log_test "4" "ClickHouse SSE Stream Connectivity"
if timeout 5 bash -c "curl -N --max-time 5 '$SIEM_BASE_URL/api/v1/events/stream/ch' | head -n1" 2>/dev/null | grep -q "data\|event"; then
    test_passed "ClickHouse SSE stream is working"
else
    test_failed "ClickHouse SSE stream not responding"
fi

# Test 5: EPS Metrics Endpoint
log_test "5" "EPS Metrics Endpoint"
EPS_RESPONSE=$(curl -s --max-time 10 "$SIEM_BASE_URL/dev/metrics/eps")

if echo "$EPS_RESPONSE" | jq -e '.global_eps' > /dev/null 2>&1; then
    GLOBAL_EPS=$(echo "$EPS_RESPONSE" | jq -r '.global_eps')
    test_passed "EPS endpoint working - Global EPS: $GLOBAL_EPS"
else
    test_failed "EPS endpoint not returning valid JSON"
fi

# Test 6: Events Search API
log_test "6" "Events Search API"
SEARCH_RESPONSE=$(curl -s --max-time 10 "$SIEM_BASE_URL/api/v1/events/search?limit=5")

if echo "$SEARCH_RESPONSE" | jq -e '.events' > /dev/null 2>&1; then
    EVENT_COUNT=$(echo "$SEARCH_RESPONSE" | jq '.events | length')
    test_passed "Events search API working - returned $EVENT_COUNT events"
else
    test_failed "Events search API not returning valid response"
fi

# Test 7: Web UI Pages
log_test "7" "Web UI Pages Accessibility"
UI_PAGES=("/dev" "/dev/events" "/dev/rules" "/dev/alerts" "/dev/stream" "/dev/settings")
UI_PASSED=0

for page in "${UI_PAGES[@]}"; do
    if curl -s --max-time 5 "$SIEM_BASE_URL$page" | grep -q "<html\|<title"; then
        ((UI_PASSED++))
    fi
done

if [[ $UI_PASSED -eq ${#UI_PAGES[@]} ]]; then
    test_passed "All $UI_PASSED UI pages accessible"
else
    test_failed "Only $UI_PASSED/${#UI_PAGES[@]} UI pages accessible"
fi

# Test 8: End-to-End Data Flow
log_test "8" "End-to-End Data Flow Verification"

# Insert a unique test event
E2E_EVENT_ID="e2e-test-${TIMESTAMP}"
E2E_RAW_EVENT="{\"tenant_id\":\"$TEST_TENANT\",\"message\":\"End-to-end test event\",\"timestamp\":$TIMESTAMP,\"source\":\"e2e_test\",\"unique_id\":\"$E2E_EVENT_ID\"}"

INSERT_SQL="INSERT INTO dev.events (event_id, tenant_id, source_type, raw_event, message, source_ip, event_timestamp) VALUES ('$E2E_EVENT_ID', '$TEST_TENANT', 'e2e_test', '$E2E_RAW_EVENT', 'End-to-end test event', '127.0.0.1', $TIMESTAMP)"

curl -s --max-time 10 "$CLICKHOUSE_URL" --data "$INSERT_SQL" > /dev/null

# Wait for event to be available
sleep 3

# Search for the event via API
SEARCH_RESULT=$(curl -s --max-time 10 "$SIEM_BASE_URL/api/v1/events/search?query=e2e-test&limit=10")

if echo "$SEARCH_RESULT" | jq -e ".events[] | select(.event_id == \"$E2E_EVENT_ID\")" > /dev/null 2>&1; then
    test_passed "End-to-end data flow working - event found via search API"
else
    test_failed "End-to-end data flow broken - event not found via search API"
fi

# Cleanup test data
echo ""
echo "🧹 Cleaning up test data..."
CLEANUP_SQL="DELETE FROM dev.events WHERE tenant_id='$TEST_TENANT'"
curl -s --max-time 10 "$CLICKHOUSE_URL" --data "$CLEANUP_SQL" > /dev/null

# Final Results
echo ""
echo "=============================================="
echo "🎯 SMOKE TEST RESULTS:"
echo "=============================================="
echo "✅ Tests Passed: $TESTS_PASSED"
echo "❌ Tests Failed: $TESTS_FAILED"
echo "📊 Total Tests: $TOTAL_TESTS"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo ""
    echo "🎉 ALL TESTS PASSED! SIEM SYSTEM IS PRODUCTION-READY!"
    echo "✅ Dual SSE streams working"
    echo "✅ ClickHouse ingestion working"  
    echo "✅ EPS metrics working"
    echo "✅ Search API working"
    echo "✅ Web UI accessible"
    echo "✅ End-to-end data flow verified"
    echo ""
    echo "🌐 Access your production SIEM:"
    echo "   📊 Dashboard: $SIEM_BASE_URL/dev"
    echo "   📡 Live Stream: $SIEM_BASE_URL/dev/stream"
    echo "   🔍 Events: $SIEM_BASE_URL/dev/events"
    echo "   ⚡ Rules: $SIEM_BASE_URL/dev/rules"
    echo ""
    exit 0
else
    echo ""
    echo "💥 SMOKE TEST FAILED!"
    echo "⚠️  Please check the failed tests above"
    echo "🔧 System requires fixes before production deployment"
    echo ""
    exit 1
fi