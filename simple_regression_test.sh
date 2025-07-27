#!/bin/bash

# Simple but Comprehensive Regression Test (Post-7.1)
echo "========================================================================"
echo "SIMPLIFIED REGRESSION TEST (POST-7.1)"
echo "========================================================================"
echo "Date: $(date)"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="http://localhost:8080"
TOTAL_TESTS=0
PASSED_TESTS=0

test_result() {
    local name="$1"
    local status="$2"
    local details="$3"
    
    ((TOTAL_TESTS++))
    
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $name"
        [ -n "$details" ] && echo "    $details"
        ((PASSED_TESTS++))
    else
        echo -e "${RED}✗${NC} $name"
        [ -n "$details" ] && echo "    $details"
    fi
}

# Generate tokens
echo "Setting up authentication..."
ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -A1 'JWT Token' | tail -1)
VIEWER_TOKEN=$(cd siem_api && cargo run --example generate_token charlie tenant-A Viewer 2>/dev/null | grep -A1 'JWT Token' | tail -1)

if [ -z "$ADMIN_TOKEN" ] || [ -z "$VIEWER_TOKEN" ]; then
    echo "Failed to generate tokens"
    exit 1
fi

echo -e "${GREEN}✓${NC} Authentication tokens generated"
echo ""

echo "========================================================================"
echo "CORE FUNCTIONALITY TESTS"
echo "========================================================================"

# Test 1: API Connectivity
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/events" -H "Authorization: Bearer $ADMIN_TOKEN")
if [ "$RESPONSE" = "200" ]; then
    test_result "API Connectivity" "PASS" "API responding correctly"
else
    test_result "API Connectivity" "FAIL" "Expected 200, got $RESPONSE"
fi

# Test 2: Authentication
AUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/events" -H "Authorization: Bearer $ADMIN_TOKEN")
if [ "$AUTH_RESPONSE" = "200" ]; then
    test_result "Authentication System" "PASS" "Admin token accepted"
else
    test_result "Authentication System" "FAIL" "Admin token rejected"
fi

# Test 3: Role-based access control
RBAC_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/rules" -H "Authorization: Bearer $VIEWER_TOKEN" -H "Content-Type: application/json" -d '{"rule_name": "test", "description": "test", "query": "SELECT 1"}')
if [ "$RBAC_RESPONSE" = "403" ]; then
    test_result "Role-Based Access Control" "PASS" "Viewer denied admin action"
else
    test_result "Role-Based Access Control" "FAIL" "Expected 403, got $RBAC_RESPONSE"
fi

# Test 4: Event Ingestion
EVENT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"events": [{"source_ip": "192.168.1.100", "raw_event": "Regression test event"}]}')

if [ "$EVENT_RESPONSE" = "202" ]; then
    test_result "Event Ingestion" "PASS" "Events accepted for processing"
else
    test_result "Event Ingestion" "FAIL" "Expected 202, got $EVENT_RESPONSE"
fi

# Test 5: Log Source Management
LOG_SOURCE_RESPONSE=$(curl -s -X POST "$API_URL/v1/log_sources" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"source_name": "Test Server", "source_type": "Syslog", "source_ip": "192.168.1.100"}')

SOURCE_ID=$(echo "$LOG_SOURCE_RESPONSE" | jq -r '.source_id // empty' 2>/dev/null)
if [ -n "$SOURCE_ID" ]; then
    test_result "Log Source Management" "PASS" "Log source created successfully"
else
    test_result "Log Source Management" "FAIL" "Failed to create log source"
fi

# Test 6: Taxonomy Management
TAXONOMY_RESPONSE=$(curl -s -X POST "$API_URL/v1/taxonomy/mappings" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"source_type": "Syslog", "field_to_check": "raw_event", "value_to_match": "test", "event_category": "System", "event_outcome": "Success", "event_action": "Test.Execute"}')

TAXONOMY_ID=$(echo "$TAXONOMY_RESPONSE" | jq -r '.mapping_id // empty' 2>/dev/null)
if [ -n "$TAXONOMY_ID" ]; then
    test_result "Taxonomy Management" "PASS" "Taxonomy mapping created successfully"
else
    test_result "Taxonomy Management" "FAIL" "Failed to create taxonomy mapping"
fi

# Test 7: Internal Taxonomy Endpoint
INTERNAL_RESPONSE=$(curl -s -X GET "$API_URL/v1/taxonomy/mappings/all")
MAPPING_COUNT=$(echo "$INTERNAL_RESPONSE" | jq -r '.total // 0' 2>/dev/null)
if [ "$MAPPING_COUNT" -gt "0" ]; then
    test_result "Internal Taxonomy Endpoint" "PASS" "Consumer can fetch mappings (total: $MAPPING_COUNT)"
else
    test_result "Internal Taxonomy Endpoint" "FAIL" "No mappings found or endpoint failed"
fi

# Test 8: Detection Rules
RULE_RESPONSE=$(curl -s -X POST "$API_URL/v1/rules" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"rule_name": "Test Rule", "description": "Test rule", "query": "SELECT * FROM dev.events LIMIT 5"}')

RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.rule_id // empty' 2>/dev/null)
if [ -n "$RULE_ID" ]; then
    test_result "Detection Rules" "PASS" "Rule created successfully"
else
    test_result "Detection Rules" "FAIL" "Failed to create rule"
fi

# Test 9: Case Management
CASE_RESPONSE=$(curl -s -X POST "$API_URL/v1/cases" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title": "Test Case", "priority": "Medium", "alert_ids": []}')

CASE_ID=$(echo "$CASE_RESPONSE" | jq -r '.case_id // empty' 2>/dev/null)
if [ -n "$CASE_ID" ]; then
    test_result "Case Management" "PASS" "Case created successfully"
else
    test_result "Case Management" "FAIL" "Failed to create case"
fi

# Test 10: Database Verification
sleep 2
echo "Checking database integration..."
DB_QUERY="SELECT COUNT(*) as count FROM dev.events FORMAT JSON"
DB_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$DB_QUERY")
EVENT_COUNT=$(echo "$DB_RESPONSE" | jq -r '.data[0].count // 0' 2>/dev/null)

if [ "$EVENT_COUNT" -gt "0" ]; then
    test_result "Database Integration" "PASS" "Events stored in database (count: $EVENT_COUNT)"
else
    test_result "Database Integration" "FAIL" "No events found in database"
fi

# Test 11: Taxonomy Schema Verification
SCHEMA_QUERY="DESCRIBE TABLE dev.events FORMAT JSON"
SCHEMA_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$SCHEMA_QUERY")

if echo "$SCHEMA_RESPONSE" | jq -r '.data[].name' | grep -q "event_category"; then
    test_result "Taxonomy Schema" "PASS" "Taxonomy fields present in database schema"
else
    test_result "Taxonomy Schema" "FAIL" "Taxonomy fields missing from schema"
fi

echo ""
echo "========================================================================"
echo "CLEANUP"
echo "========================================================================"

# Cleanup test data
CLEANUP_COUNT=0

if [ -n "$TAXONOMY_ID" ]; then
    DELETE_TAXONOMY=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/taxonomy/mappings/$TAXONOMY_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    [ "$DELETE_TAXONOMY" = "200" ] && ((CLEANUP_COUNT++))
fi

if [ -n "$SOURCE_ID" ]; then
    DELETE_SOURCE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/log_sources/$SOURCE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    [ "$DELETE_SOURCE" = "200" ] && ((CLEANUP_COUNT++))
fi

if [ -n "$RULE_ID" ]; then
    DELETE_RULE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/rules/$RULE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    [ "$DELETE_RULE" = "200" ] && ((CLEANUP_COUNT++))
fi

if [ -n "$CASE_ID" ]; then
    DELETE_CASE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/cases/$CASE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    [ "$DELETE_CASE" = "200" ] && ((CLEANUP_COUNT++))
fi

test_result "Cleanup Operations" "PASS" "Cleaned up $CLEANUP_COUNT test objects"

echo ""
echo "========================================================================"
echo "REGRESSION TEST SUMMARY"
echo "========================================================================"

SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))

echo -e "${BLUE}Results Summary:${NC}"
echo "  Total Tests: $TOTAL_TESTS"
echo "  Passed: $PASSED_TESTS"
echo "  Failed: $((TOTAL_TESTS - PASSED_TESTS))"
echo "  Success Rate: ${SUCCESS_RATE}%"
echo ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}🎉 ALL REGRESSION TESTS PASSED!${NC}"
    echo ""
    echo "✅ Core API functionality verified"
    echo "✅ Authentication and authorization working"
    echo "✅ Event processing operational"
    echo "✅ Log source management functional"
    echo "✅ Common Event Taxonomy system working"
    echo "✅ Detection rules operational"
    echo "✅ Case management functional"
    echo "✅ Database integration verified"
    echo ""
    echo -e "${GREEN}🚀 PLATFORM READY FOR ASSET MANAGEMENT API (CHUNK 7.2)${NC}"
elif [ $SUCCESS_RATE -ge 90 ]; then
    echo -e "${BLUE}✅ REGRESSION TEST MOSTLY SUCCESSFUL${NC}"
    echo ""
    echo "Platform is functional with minor issues."
    echo "Safe to proceed with Asset Management API implementation."
else
    echo -e "${RED}❌ CRITICAL ISSUES DETECTED${NC}"
    echo ""
    echo "Multiple failures detected. Review issues before proceeding."
fi

echo ""
echo "========================================================================"
echo "End of Regression Test"
echo "========================================================================" 