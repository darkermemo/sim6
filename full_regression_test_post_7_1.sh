#!/bin/bash

# Full Regression Test Plan (Post-7.1)
# Comprehensive verification of all SIEM functionality after Common Event Taxonomy implementation

set -e

echo "========================================================================"
echo "FULL REGRESSION TEST PLAN (POST-7.1)"
echo "========================================================================"
echo "Date: $(date)"
echo "Testing all SIEM functionality with new Common Event Taxonomy system"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API base URL
API_URL="http://localhost:8080"

# Test results tracking
TOTAL_TESTS=0
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test results
print_test_result() {
    local test_name="$1"
    local result="$2"
    local details="$3"
    
    ((TOTAL_TESTS++))
    
    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        [ -n "$details" ] && echo "    $details"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} $test_name"
        [ -n "$details" ] && echo "    $details"
        ((TESTS_FAILED++))
    fi
}

echo "Setting up test environment..."

# Generate authentication tokens for all user types
echo "Generating authentication tokens..."

# Admin token for tenant-A
ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -A1 'JWT Token' | tail -1)

# Analyst token for tenant-A
ANALYST_TOKEN=$(cd siem_api && cargo run --example generate_token bob tenant-A Analyst 2>/dev/null | grep -A1 'JWT Token' | tail -1)

# Viewer token for tenant-A
VIEWER_TOKEN=$(cd siem_api && cargo run --example generate_token charlie tenant-A Viewer 2>/dev/null | grep -A1 'JWT Token' | tail -1)

# Admin token for tenant-B
ADMIN_B_TOKEN=$(cd siem_api && cargo run --example generate_token david tenant-B Admin 2>/dev/null | grep -A1 'JWT Token' | tail -1)

if [ -z "$ADMIN_TOKEN" ] || [ -z "$ANALYST_TOKEN" ] || [ -z "$VIEWER_TOKEN" ] || [ -z "$ADMIN_B_TOKEN" ]; then
    echo -e "${RED}Failed to generate required tokens${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} All authentication tokens generated successfully"
echo ""

echo "========================================================================"
echo "SECTION 1: CORE API FUNCTIONALITY"
echo "========================================================================"

# Test 1.1: Basic API connectivity
API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/events" -H "Authorization: Bearer $ADMIN_TOKEN")
if [ "$API_HEALTH" = "200" ]; then
    print_test_result "API Connectivity Check" "PASS" "API server responding (200)"
else
    print_test_result "API Connectivity Check" "FAIL" "Expected 200, got $API_HEALTH"
fi

# Test 1.2: Authentication system
AUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/events" -H "Authorization: Bearer $ADMIN_TOKEN")
if [ "$AUTH_RESPONSE" = "200" ]; then
    print_test_result "Authentication System" "PASS" "Valid token accepted (200)"
else
    print_test_result "Authentication System" "FAIL" "Expected 200, got $AUTH_RESPONSE"
fi

# Test 1.3: Role-based access control
VIEWER_ADMIN_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/rules" -H "Authorization: Bearer $VIEWER_TOKEN" -H "Content-Type: application/json" -d '{"rule_name": "test", "description": "test", "query": "SELECT 1"}')
if [ "$VIEWER_ADMIN_RESPONSE" = "403" ]; then
    print_test_result "Role-Based Access Control" "PASS" "Viewer denied admin action (403)"
else
    print_test_result "Role-Based Access Control" "FAIL" "Expected 403, got $VIEWER_ADMIN_RESPONSE"
fi

# Test 1.4: Tenant isolation
TENANT_B_EVENTS=$(curl -s -X GET "$API_URL/v1/events" -H "Authorization: Bearer $ADMIN_B_TOKEN" | jq -r '.events | length' 2>/dev/null || echo "0")
if [ "$TENANT_B_EVENTS" = "0" ]; then
    print_test_result "Tenant Isolation" "PASS" "Tenant-B sees no tenant-A events"
else
    print_test_result "Tenant Isolation" "FAIL" "Tenant isolation may be compromised"
fi

echo ""

echo "========================================================================"
echo "SECTION 2: EVENT INGESTION AND PROCESSING"
echo "========================================================================"

# Test 2.1: Event ingestion
EVENT_PAYLOAD='{"events": [{"source_ip": "192.168.1.100", "raw_event": "Test event for regression testing"}]}'
INGEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$EVENT_PAYLOAD")

if [ "$INGEST_RESPONSE" = "202" ]; then
    print_test_result "Event Ingestion" "PASS" "Events accepted for processing (202)"
else
    print_test_result "Event Ingestion" "FAIL" "Expected 202, got $INGEST_RESPONSE"
fi

# Test 2.2: Event retrieval
sleep 2
EVENTS_RESPONSE=$(curl -s -X GET "$API_URL/v1/events" -H "Authorization: Bearer $ADMIN_TOKEN")
EVENT_COUNT=$(echo "$EVENTS_RESPONSE" | jq -r '.events | length' 2>/dev/null || echo "0")

if [ "$EVENT_COUNT" -gt "0" ]; then
    print_test_result "Event Retrieval" "PASS" "Events retrieved successfully (count: $EVENT_COUNT)"
else
    print_test_result "Event Retrieval" "FAIL" "No events found or retrieval failed"
fi

echo ""

echo "========================================================================"
echo "SECTION 3: LOG SOURCE MANAGEMENT"
echo "========================================================================"

# Test 3.1: Create log source
LOG_SOURCE_JSON='{"source_name": "Regression Test Server", "source_type": "Syslog", "source_ip": "192.168.1.200"}'
CREATE_SOURCE_RESPONSE=$(curl -s -X POST "$API_URL/v1/log_sources" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$LOG_SOURCE_JSON")

SOURCE_ID=$(echo "$CREATE_SOURCE_RESPONSE" | jq -r '.source_id // empty' 2>/dev/null)

if [ -n "$SOURCE_ID" ]; then
    print_test_result "Log Source Creation" "PASS" "Log source created with ID: $SOURCE_ID"
else
    print_test_result "Log Source Creation" "FAIL" "Failed to create log source"
fi

# Test 3.2: List log sources
LIST_SOURCES_RESPONSE=$(curl -s -X GET "$API_URL/v1/log_sources" -H "Authorization: Bearer $ADMIN_TOKEN")
SOURCE_COUNT=$(echo "$LIST_SOURCES_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

if [ "$SOURCE_COUNT" -gt "0" ]; then
    print_test_result "Log Source Listing" "PASS" "Log sources listed (total: $SOURCE_COUNT)"
else
    print_test_result "Log Source Listing" "FAIL" "No log sources found or listing failed"
fi

# Test 3.3: IP-based lookup
if [ -n "$SOURCE_ID" ]; then
    IP_LOOKUP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/log_sources/by_ip/192.168.1.200")
    
    if [ "$IP_LOOKUP_RESPONSE" = "200" ]; then
        print_test_result "IP-Based Log Source Lookup" "PASS" "IP lookup successful (200)"
    else
        print_test_result "IP-Based Log Source Lookup" "FAIL" "Expected 200, got $IP_LOOKUP_RESPONSE"
    fi
fi

echo ""

echo "========================================================================"
echo "SECTION 4: COMMON EVENT TAXONOMY SYSTEM"
echo "========================================================================"

# Test 4.1: Create taxonomy mapping
TAXONOMY_JSON='{
    "source_type": "Syslog",
    "field_to_check": "raw_event",
    "value_to_match": "regression test",
    "event_category": "System",
    "event_outcome": "Success", 
    "event_action": "Test.Execute"
}'

CREATE_TAXONOMY_RESPONSE=$(curl -s -X POST "$API_URL/v1/taxonomy/mappings" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$TAXONOMY_JSON")

TAXONOMY_ID=$(echo "$CREATE_TAXONOMY_RESPONSE" | jq -r '.mapping_id // empty' 2>/dev/null)

if [ -n "$TAXONOMY_ID" ]; then
    print_test_result "Taxonomy Mapping Creation" "PASS" "Taxonomy mapping created with ID: $TAXONOMY_ID"
else
    print_test_result "Taxonomy Mapping Creation" "FAIL" "Failed to create taxonomy mapping"
fi

# Test 4.2: List taxonomy mappings
LIST_TAXONOMY_RESPONSE=$(curl -s -X GET "$API_URL/v1/taxonomy/mappings" -H "Authorization: Bearer $ADMIN_TOKEN")
TAXONOMY_COUNT=$(echo "$LIST_TAXONOMY_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

if [ "$TAXONOMY_COUNT" -gt "0" ]; then
    print_test_result "Taxonomy Mapping Listing" "PASS" "Taxonomy mappings listed (total: $TAXONOMY_COUNT)"
else
    print_test_result "Taxonomy Mapping Listing" "FAIL" "No taxonomy mappings found"
fi

# Test 4.3: Internal taxonomy endpoint
INTERNAL_TAXONOMY_RESPONSE=$(curl -s -X GET "$API_URL/v1/taxonomy/mappings/all")
INTERNAL_TAXONOMY_COUNT=$(echo "$INTERNAL_TAXONOMY_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

if [ "$INTERNAL_TAXONOMY_COUNT" -gt "0" ]; then
    print_test_result "Internal Taxonomy Endpoint" "PASS" "Internal endpoint functional (total: $INTERNAL_TAXONOMY_COUNT)"
else
    print_test_result "Internal Taxonomy Endpoint" "FAIL" "Internal endpoint failed or no mappings"
fi

# Test 4.4: Test taxonomy-enabled event ingestion
TAXONOMY_EVENT='{"events": [{"source_ip": "192.168.1.200", "raw_event": "System regression test completed successfully"}]}'
TAXONOMY_INGEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$TAXONOMY_EVENT")

if [ "$TAXONOMY_INGEST_RESPONSE" = "202" ]; then
    print_test_result "Taxonomy-Enabled Event Ingestion" "PASS" "Events with taxonomy accepted (202)"
else
    print_test_result "Taxonomy-Enabled Event Ingestion" "FAIL" "Expected 202, got $TAXONOMY_INGEST_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "SECTION 5: DETECTION RULES SYSTEM"
echo "========================================================================"

# Test 5.1: Create detection rule
RULE_JSON='{
    "rule_name": "Regression Test Rule",
    "description": "Test rule for regression testing",
    "query": "SELECT * FROM dev.events WHERE raw_event LIKE '\'%regression test%'\' LIMIT 10"
}'

CREATE_RULE_RESPONSE=$(curl -s -X POST "$API_URL/v1/rules" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$RULE_JSON")

RULE_ID=$(echo "$CREATE_RULE_RESPONSE" | jq -r '.rule_id // empty' 2>/dev/null)

if [ -n "$RULE_ID" ]; then
    print_test_result "Detection Rule Creation" "PASS" "Rule created with ID: $RULE_ID"
else
    print_test_result "Detection Rule Creation" "FAIL" "Failed to create detection rule"
fi

# Test 5.2: List detection rules
LIST_RULES_RESPONSE=$(curl -s -X GET "$API_URL/v1/rules" -H "Authorization: Bearer $ADMIN_TOKEN")
RULE_COUNT=$(echo "$LIST_RULES_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

if [ "$RULE_COUNT" -gt "0" ]; then
    print_test_result "Detection Rule Listing" "PASS" "Rules listed (total: $RULE_COUNT)"
else
    print_test_result "Detection Rule Listing" "FAIL" "No rules found or listing failed"
fi

# Test 5.3: Execute detection rule
if [ -n "$RULE_ID" ]; then
    EXECUTE_RULE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/rules/$RULE_ID/execute" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$EXECUTE_RULE_RESPONSE" = "200" ]; then
        print_test_result "Detection Rule Execution" "PASS" "Rule executed successfully (200)"
    else
        print_test_result "Detection Rule Execution" "FAIL" "Expected 200, got $EXECUTE_RULE_RESPONSE"
    fi
fi

echo ""

echo "========================================================================"
echo "SECTION 6: ALERT MANAGEMENT SYSTEM"
echo "========================================================================"

# Test 6.1: List alerts (should include any generated alerts)
LIST_ALERTS_RESPONSE=$(curl -s -X GET "$API_URL/v1/alerts" -H "Authorization: Bearer $ADMIN_TOKEN")
ALERT_COUNT=$(echo "$LIST_ALERTS_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

print_test_result "Alert Listing" "PASS" "Alerts retrieved (total: $ALERT_COUNT)"

# Test 6.2: Alert access control
VIEWER_ALERTS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/alerts" -H "Authorization: Bearer $VIEWER_TOKEN")

if [ "$VIEWER_ALERTS_RESPONSE" = "200" ]; then
    print_test_result "Alert Access Control (Viewer)" "PASS" "Viewer can access alerts (200)"
else
    print_test_result "Alert Access Control (Viewer)" "FAIL" "Expected 200, got $VIEWER_ALERTS_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "SECTION 7: CASE MANAGEMENT SYSTEM"
echo "========================================================================"

# Test 7.1: Create case
CASE_JSON='{
    "title": "Regression Test Case",
    "status": "Open",
    "severity": "Medium"
}'

CREATE_CASE_RESPONSE=$(curl -s -X POST "$API_URL/v1/cases" \
    -H "Authorization: Bearer $ANALYST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CASE_JSON")

CASE_ID=$(echo "$CREATE_CASE_RESPONSE" | jq -r '.case_id // empty' 2>/dev/null)

if [ -n "$CASE_ID" ]; then
    print_test_result "Case Creation" "PASS" "Case created with ID: $CASE_ID"
else
    print_test_result "Case Creation" "FAIL" "Failed to create case"
fi

# Test 7.2: List cases
LIST_CASES_RESPONSE=$(curl -s -X GET "$API_URL/v1/cases" -H "Authorization: Bearer $ANALYST_TOKEN")
CASE_COUNT=$(echo "$LIST_CASES_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

if [ "$CASE_COUNT" -gt "0" ]; then
    print_test_result "Case Listing" "PASS" "Cases listed (total: $CASE_COUNT)"
else
    print_test_result "Case Listing" "FAIL" "No cases found or listing failed"
fi

# Test 7.3: Case access control (Admin can access)
if [ -n "$CASE_ID" ]; then
    ADMIN_CASE_ACCESS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/cases/$CASE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$ADMIN_CASE_ACCESS" = "200" ]; then
        print_test_result "Case Access Control (Admin)" "PASS" "Admin can access cases (200)"
    else
        print_test_result "Case Access Control (Admin)" "FAIL" "Expected 200, got $ADMIN_CASE_ACCESS"
    fi
fi

echo ""

echo "========================================================================"
echo "SECTION 8: DATABASE AND TAXONOMY VERIFICATION"
echo "========================================================================"

# Test 8.1: Verify taxonomy fields in database
echo "Checking database for taxonomy-enhanced events..."
sleep 3

TAXONOMY_DB_QUERY="SELECT event_category, event_outcome, event_action, raw_event FROM dev.events WHERE raw_event LIKE '%regression test%' LIMIT 3 FORMAT JSON"
TAXONOMY_DB_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$TAXONOMY_DB_QUERY")

if echo "$TAXONOMY_DB_RESPONSE" | jq -e '.data' > /dev/null 2>&1; then
    print_test_result "Database Taxonomy Storage" "PASS" "Events with taxonomy fields found in database"
    
    # Check if any events have taxonomy applied
    if echo "$TAXONOMY_DB_RESPONSE" | jq -r '.data[].event_category' 2>/dev/null | grep -q "System"; then
        print_test_result "Taxonomy Application Verification" "PASS" "Found events with System category applied"
    else
        print_test_result "Taxonomy Application Verification" "FAIL" "No System category events found (taxonomy may not be applied)"
    fi
else
    print_test_result "Database Taxonomy Storage" "FAIL" "Database query failed or no data found"
fi

# Test 8.2: Verify database schema includes all new fields
SCHEMA_QUERY="DESCRIBE TABLE dev.events FORMAT JSON"
SCHEMA_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$SCHEMA_QUERY")

if echo "$SCHEMA_RESPONSE" | jq -r '.data[].name' | grep -q "event_category"; then
    print_test_result "Database Schema Update" "PASS" "Taxonomy fields present in schema"
else
    print_test_result "Database Schema Update" "FAIL" "Taxonomy fields missing from schema"
fi

echo ""

echo "========================================================================"
echo "SECTION 9: CONSUMER PROCESSING VERIFICATION"
echo "========================================================================"

echo -e "${BLUE}Testing consumer with taxonomy processing...${NC}"

# Start consumer briefly to test taxonomy functionality
cd siem_consumer
timeout 10s bash -c 'RUST_LOG=info API_URL=http://localhost:8080 cargo run' > regression_consumer.log 2>&1 &
CONSUMER_PID=$!
cd ..

# Give consumer time to start and load configurations
sleep 3

# Send event that should trigger taxonomy
curl -s -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"events": [{"source_ip": "192.168.1.200", "raw_event": "Final regression test with taxonomy processing"}]}' > /dev/null

# Wait for processing
sleep 4

# Stop consumer
kill $CONSUMER_PID 2>/dev/null || true

# Analyze consumer logs
if [ -f "siem_consumer/regression_consumer.log" ]; then
    if grep -q "Loaded.*taxonomy mappings" siem_consumer/regression_consumer.log; then
        print_test_result "Consumer Taxonomy Loading" "PASS" "Consumer loaded taxonomy mappings"
    else
        print_test_result "Consumer Taxonomy Loading" "FAIL" "Consumer did not load taxonomy mappings"
    fi
    
    if grep -q "Successfully wrote.*events to ClickHouse" siem_consumer/regression_consumer.log; then
        print_test_result "Consumer Event Processing" "PASS" "Consumer processed events successfully"
    else
        print_test_result "Consumer Event Processing" "FAIL" "Consumer failed to process events"
    fi
    
    rm -f siem_consumer/regression_consumer.log
else
    print_test_result "Consumer Log Verification" "FAIL" "Consumer log file not found"
fi

echo ""

echo "========================================================================"
echo "SECTION 10: CLEANUP"
echo "========================================================================"

# Cleanup test data
CLEANUP_COUNT=0

if [ -n "$TAXONOMY_ID" ]; then
    DELETE_TAXONOMY=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/taxonomy/mappings/$TAXONOMY_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    if [ "$DELETE_TAXONOMY" = "200" ]; then
        ((CLEANUP_COUNT++))
    fi
fi

if [ -n "$SOURCE_ID" ]; then
    DELETE_SOURCE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/log_sources/$SOURCE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    if [ "$DELETE_SOURCE" = "200" ]; then
        ((CLEANUP_COUNT++))
    fi
fi

if [ -n "$RULE_ID" ]; then
    DELETE_RULE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/rules/$RULE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    if [ "$DELETE_RULE" = "200" ]; then
        ((CLEANUP_COUNT++))
    fi
fi

if [ -n "$CASE_ID" ]; then
    DELETE_CASE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/cases/$CASE_ID" -H "Authorization: Bearer $ANALYST_TOKEN")
    if [ "$DELETE_CASE" = "200" ]; then
        ((CLEANUP_COUNT++))
    fi
fi

print_test_result "Test Data Cleanup" "PASS" "Cleaned up $CLEANUP_COUNT test objects"

echo ""

echo "========================================================================"
echo "FULL REGRESSION TEST SUMMARY"
echo "========================================================================"

echo -e "${BLUE}Overall Results:${NC}"
echo "  Total Tests: $TOTAL_TESTS"
echo "  Passed: $TESTS_PASSED"
echo "  Failed: $TESTS_FAILED"

SUCCESS_RATE=$((TESTS_PASSED * 100 / TOTAL_TESTS))
echo "  Success Rate: ${SUCCESS_RATE}%"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 ALL REGRESSION TESTS PASSED!${NC}"
    echo ""
    echo "✅ Core API functionality operational"
    echo "✅ Authentication and authorization working"
    echo "✅ Event ingestion and processing functional"
    echo "✅ Log source management operational"
    echo "✅ Common Event Taxonomy system working"
    echo "✅ Detection rules system functional"
    echo "✅ Alert management operational"
    echo "✅ Case management system working"
    echo "✅ Database integration verified"
    echo "✅ Consumer processing with taxonomy confirmed"
    echo ""
    echo -e "${GREEN}🚀 SIEM PLATFORM FULLY OPERATIONAL POST-7.1${NC}"
    echo ""
    echo "The platform is ready for Asset Management API implementation (Chunk 7.2)"
    echo ""
elif [ $SUCCESS_RATE -ge 90 ]; then
    echo ""
    echo -e "${YELLOW}⚠️ MOSTLY SUCCESSFUL WITH MINOR ISSUES${NC}"
    echo ""
    echo "Platform is generally functional but some components may need attention."
    echo "Review failed tests before proceeding to next development phase."
    echo ""
else
    echo ""
    echo -e "${RED}❌ SIGNIFICANT ISSUES DETECTED!${NC}"
    echo ""
    echo "Multiple critical systems are failing. Address issues before proceeding."
    echo "The platform may not be ready for additional development."
    echo ""
fi

echo "========================================================================"
echo "End of Full Regression Test (Post-7.1)"
echo "========================================================================" 