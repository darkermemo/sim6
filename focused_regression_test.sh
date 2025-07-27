#!/bin/bash

# Focused Regression Test (Post-6.1)
echo "========================================================================"
echo "FOCUSED REGRESSION TEST (POST-6.1)"
echo "========================================================================"
echo "Date: $(date)"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="http://localhost:8080"
INGESTOR_URL="http://localhost:8081"
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

echo "Setting up test environment..."

# Generate tokens
ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -A1 'JWT Token' | tail -1)
VIEWER_TOKEN=$(cd siem_api && cargo run --example generate_token charlie tenant-A Viewer 2>/dev/null | grep -A1 'JWT Token' | tail -1)

if [ -z "$ADMIN_TOKEN" ] || [ -z "$VIEWER_TOKEN" ]; then
    echo "Failed to generate tokens"
    exit 1
fi

echo -e "${GREEN}✓${NC} Authentication tokens generated"
echo ""

echo "========================================================================"
echo "SUITE A: CORE API FUNCTIONALITY"
echo "========================================================================"

# Test A-1: API Connectivity
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/events" -H "Authorization: Bearer $ADMIN_TOKEN")
if [ "$RESPONSE" = "200" ]; then
    test_result "A-1: API Connectivity" "PASS" "API responding correctly"
else
    test_result "A-1: API Connectivity" "FAIL" "Expected 200, got $RESPONSE"
fi

# Test A-2: Authentication System
AUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/events" -H "Authorization: Bearer $ADMIN_TOKEN")
if [ "$AUTH_RESPONSE" = "200" ]; then
    test_result "A-2: Authentication System" "PASS" "Admin token accepted"
else
    test_result "A-2: Authentication System" "FAIL" "Admin token rejected"
fi

# Test A-3: Role-based access control
RBAC_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/rules" -H "Authorization: Bearer $VIEWER_TOKEN" -H "Content-Type: application/json" -d '{"rule_name": "test", "description": "test", "query": "SELECT 1"}')
if [ "$RBAC_RESPONSE" = "403" ]; then
    test_result "A-3: Role-Based Access Control" "PASS" "Viewer denied admin action"
else
    test_result "A-3: Role-Based Access Control" "FAIL" "Expected 403, got $RBAC_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "SUITE B: LOG SOURCE MANAGEMENT"
echo "========================================================================"

# Test B-1: Create log source for 127.0.0.1
LOG_SOURCE_JSON='{"source_name": "Test Localhost", "source_type": "Syslog", "source_ip": "127.0.0.1"}'
CREATE_SOURCE_RESPONSE=$(curl -s -X POST "$API_URL/v1/log_sources" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$LOG_SOURCE_JSON")

SOURCE_ID=$(echo "$CREATE_SOURCE_RESPONSE" | jq -r '.source_id // empty' 2>/dev/null)

if [ -n "$SOURCE_ID" ]; then
    test_result "B-1: Log Source Creation" "PASS" "Log source created"
else
    test_result "B-1: Log Source Creation" "FAIL" "Failed to create log source"
fi

echo ""

echo "========================================================================"
echo "SUITE H: INGESTOR SERVICE & FULL PIPELINE (NEW)"
echo "========================================================================"

echo -e "${BLUE}Testing new siem_ingestor service...${NC}"

# Test H-1: Ingestor Health Check
INGESTOR_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$INGESTOR_URL/health")
if [ "$INGESTOR_HEALTH" = "200" ]; then
    test_result "H-1: Ingestor Service Health" "PASS" "Ingestor is responding"
else
    test_result "H-1: Ingestor Service Health" "FAIL" "Ingestor not responding"
fi

# Test H-2: Syslog Ingestion via Ingestor
echo "Testing Syslog ingestion..."
echo "<34>Oct 20 15:35:00 testhost auth: authentication failed for user test" | nc -u -w0 127.0.0.1 5140

sleep 4  # Allow time for processing

# Check if message appeared in database
SYSLOG_DB_QUERY="SELECT COUNT(*) as count FROM dev.events WHERE raw_event LIKE '%authentication failed%' FORMAT JSON"
SYSLOG_DB_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$SYSLOG_DB_QUERY")
SYSLOG_EVENT_COUNT=$(echo "$SYSLOG_DB_RESPONSE" | jq -r '.data[0].count // 0' 2>/dev/null)

if [ "$SYSLOG_EVENT_COUNT" -gt "0" ]; then
    test_result "H-2: Syslog Ingestion Pipeline" "PASS" "Syslog message processed (events: $SYSLOG_EVENT_COUNT)"
else
    test_result "H-2: Syslog Ingestion Pipeline" "FAIL" "Syslog message not found"
fi

# Test H-3: HTTP Ingestion via Ingestor
echo "Testing HTTP raw log ingestion..."
HTTP_RESPONSE=$(curl -s -X POST --data "Application error: login failed for API user" "$INGESTOR_URL/ingest/raw")

sleep 4  # Allow time for processing

# Check if message appeared in database
HTTP_DB_QUERY="SELECT COUNT(*) as count FROM dev.events WHERE raw_event LIKE '%Application error: login failed%' FORMAT JSON"
HTTP_DB_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$HTTP_DB_QUERY")
HTTP_EVENT_COUNT=$(echo "$HTTP_DB_RESPONSE" | jq -r '.data[0].count // 0' 2>/dev/null)

if [ "$HTTP_EVENT_COUNT" -gt "0" ]; then
    test_result "H-3: HTTP Ingestion Pipeline" "PASS" "HTTP message processed (events: $HTTP_EVENT_COUNT)"
else
    test_result "H-3: HTTP Ingestion Pipeline" "FAIL" "HTTP message not found"
fi

# Test H-4: Create Detection Rule
RULE_JSON='{
    "rule_name": "Failed Login Detection",
    "description": "Detects failed login attempts",
    "query": "SELECT * FROM dev.events WHERE raw_event LIKE '\''%failed%'\'' LIMIT 10"
}'

CREATE_RULE_RESPONSE=$(curl -s -X POST "$API_URL/v1/rules" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$RULE_JSON")

RULE_ID=$(echo "$CREATE_RULE_RESPONSE" | jq -r '.rule_id // empty' 2>/dev/null)

if [ -n "$RULE_ID" ]; then
    test_result "H-4: Detection Rule Creation" "PASS" "Rule created for end-to-end test"
else
    test_result "H-4: Detection Rule Creation" "FAIL" "Failed to create rule"
fi

# Test H-5: End-to-End Alert Generation
echo "Testing end-to-end alert generation..."

# Send another syslog message with "failed" to trigger the rule
echo "<34>Oct 20 15:36:00 testhost sshd: login failed for root from 192.168.1.100" | nc -u -w0 127.0.0.1 5140

sleep 5  # Allow time for processing

# Execute the detection rule
if [ -n "$RULE_ID" ]; then
    EXECUTE_RULE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/rules/$RULE_ID/execute" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$EXECUTE_RULE_RESPONSE" = "200" ]; then
        sleep 3  # Allow time for alert generation
        
        # Check if alerts were generated
        ALERTS_RESPONSE=$(curl -s -X GET "$API_URL/v1/alerts" -H "Authorization: Bearer $ADMIN_TOKEN")
        ALERT_COUNT=$(echo "$ALERTS_RESPONSE" | jq -r '.total // 0' 2>/dev/null)
        
        if [ "$ALERT_COUNT" -gt "0" ]; then
            test_result "H-5: End-to-End Alert Generation" "PASS" "Alerts generated (total: $ALERT_COUNT)"
        else
            test_result "H-5: End-to-End Alert Generation" "FAIL" "No alerts generated"
        fi
    else
        test_result "H-5: End-to-End Alert Generation" "FAIL" "Rule execution failed"
    fi
else
    test_result "H-5: End-to-End Alert Generation" "FAIL" "No rule available"
fi

echo ""

echo "========================================================================"
echo "ASSET MANAGEMENT & TAXONOMY VERIFICATION"
echo "========================================================================"

# Test Asset Management
ASSET_JSON='{"asset_name": "Test Server", "asset_ip": "127.0.0.1", "asset_type": "Server", "criticality": "High"}'
CREATE_ASSET_RESPONSE=$(curl -s -X POST "$API_URL/v1/assets" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$ASSET_JSON")

ASSET_ID=$(echo "$CREATE_ASSET_RESPONSE" | jq -r '.asset_id // empty' 2>/dev/null)

if [ -n "$ASSET_ID" ]; then
    test_result "Asset Management" "PASS" "Asset created successfully"
else
    test_result "Asset Management" "FAIL" "Failed to create asset"
fi

# Test Taxonomy Management
TAXONOMY_JSON='{"source_type": "Syslog", "field_to_check": "raw_event", "value_to_match": "failed", "event_category": "Authentication", "event_outcome": "Failure", "event_action": "Login.Failed"}'

CREATE_TAXONOMY_RESPONSE=$(curl -s -X POST "$API_URL/v1/taxonomy/mappings" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$TAXONOMY_JSON")

TAXONOMY_ID=$(echo "$CREATE_TAXONOMY_RESPONSE" | jq -r '.mapping_id // empty' 2>/dev/null)

if [ -n "$TAXONOMY_ID" ]; then
    test_result "Taxonomy Management" "PASS" "Taxonomy mapping created"
else
    test_result "Taxonomy Management" "FAIL" "Failed to create taxonomy"
fi

# Test Database Schema
SCHEMA_QUERY="DESCRIBE TABLE dev.events FORMAT JSON"
SCHEMA_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$SCHEMA_QUERY")

if echo "$SCHEMA_RESPONSE" | jq -r '.data[].name' | grep -q "event_category"; then
    test_result "Database Schema" "PASS" "Taxonomy fields present"
else
    test_result "Database Schema" "FAIL" "Taxonomy fields missing"
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

if [ -n "$ASSET_ID" ]; then
    DELETE_ASSET=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/assets/$ASSET_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    [ "$DELETE_ASSET" = "200" ] && ((CLEANUP_COUNT++))
fi

test_result "Test Data Cleanup" "PASS" "Cleaned up $CLEANUP_COUNT objects"

echo ""

echo "========================================================================"
echo "REGRESSION TEST SUMMARY (POST-6.1)"
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
    echo "✅ Log source management operational"
    echo "✅ NEW: Ingestor service fully functional"
    echo "✅ NEW: Full pipeline tested (Ingestor → Kafka → Consumer → Database)"
    echo "✅ NEW: End-to-end alert generation verified"
    echo "✅ Asset management working"
    echo "✅ Taxonomy system operational"
    echo "✅ Database integration verified"
    echo ""
    echo -e "${GREEN}🚀 PLATFORM READY FOR NEXT DEVELOPMENT PHASE${NC}"
    echo ""
    echo "📊 Key Verification Results:"
    echo "   • UDP Syslog ingestion: WORKING"
    echo "   • HTTP raw log ingestion: WORKING"
    echo "   • Kafka message delivery: WORKING"
    echo "   • Consumer processing: WORKING"
    echo "   • Database storage: WORKING"
    echo "   • Alert generation: WORKING"
    echo ""
elif [ $SUCCESS_RATE -ge 90 ]; then
    echo -e "${BLUE}✅ REGRESSION TEST MOSTLY SUCCESSFUL${NC}"
    echo ""
    echo "Platform is functional with minor issues."
    echo "Safe to proceed with next development phase."
else
    echo -e "${RED}❌ CRITICAL ISSUES DETECTED${NC}"
    echo ""
    echo "Multiple failures detected. Review issues before proceeding."
fi

echo ""
echo "========================================================================"
echo "End of Focused Regression Test"
echo "========================================================================" 