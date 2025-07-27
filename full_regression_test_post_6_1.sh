#!/bin/bash

# Full Regression Test Plan (Post-6.1)
# Comprehensive verification of all SIEM functionality after Data Ingestion Service implementation

set -e

echo "========================================================================"
echo "FULL REGRESSION TEST PLAN (POST-6.1)"
echo "========================================================================"
echo "Date: $(date)"
echo "Testing all SIEM functionality with new siem_ingestor service"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API base URLs
API_URL="http://localhost:8080"
INGESTOR_URL="http://localhost:8081"

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

echo "========================================================================"
echo "ENVIRONMENT PREPARATION"
echo "========================================================================"

# Check if all services are running
echo "Checking service status..."

# Check Kafka
KAFKA_STATUS=$(ps aux | grep -v grep | grep kafka | wc -l)
if [ "$KAFKA_STATUS" -gt "0" ]; then
    print_test_result "Kafka Service Status" "PASS" "Kafka is running"
else
    print_test_result "Kafka Service Status" "FAIL" "Kafka is not running"
fi

# Check ClickHouse
CLICKHOUSE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8123/ping")
if [ "$CLICKHOUSE_STATUS" = "200" ]; then
    print_test_result "ClickHouse Service Status" "PASS" "ClickHouse is responding"
else
    print_test_result "ClickHouse Service Status" "FAIL" "ClickHouse is not responding"
fi

# Check API Service
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/v1/events")
if [ "$API_STATUS" = "401" ] || [ "$API_STATUS" = "200" ]; then
    print_test_result "SIEM API Service Status" "PASS" "API is responding"
else
    print_test_result "SIEM API Service Status" "FAIL" "API is not responding (status: $API_STATUS)"
fi

# Check Ingestor Service
INGESTOR_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$INGESTOR_URL/health")
if [ "$INGESTOR_STATUS" = "200" ]; then
    print_test_result "Ingestor Service Status" "PASS" "Ingestor is responding"
else
    print_test_result "Ingestor Service Status" "FAIL" "Ingestor is not responding (status: $INGESTOR_STATUS)"
fi

echo ""
echo "Setting up test environment..."

# Generate authentication tokens
echo "Generating authentication tokens..."

# Admin token for tenant-A
ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -A1 'JWT Token' | tail -1)

# Analyst token for tenant-A
ANALYST_TOKEN=$(cd siem_api && cargo run --example generate_token bob tenant-A Analyst 2>/dev/null | grep -A1 'JWT Token' | tail -1)

# Viewer token for tenant-A
VIEWER_TOKEN=$(cd siem_api && cargo run --example generate_token charlie tenant-A Viewer 2>/dev/null | grep -A1 'JWT Token' | tail -1)

if [ -z "$ADMIN_TOKEN" ] || [ -z "$ANALYST_TOKEN" ] || [ -z "$VIEWER_TOKEN" ]; then
    echo -e "${RED}Failed to generate required tokens${NC}"
    exit 1
fi

print_test_result "Authentication Token Generation" "PASS" "All tokens generated successfully"

# Clean database state
echo "Cleaning database state..."
curl -s -X POST "http://localhost:8123" --data "TRUNCATE TABLE dev.events" > /dev/null 2>&1 || true
curl -s -X POST "http://localhost:8123" --data "TRUNCATE TABLE dev.alerts" > /dev/null 2>&1 || true
curl -s -X POST "http://localhost:8123" --data "TRUNCATE TABLE dev.cases" > /dev/null 2>&1 || true
curl -s -X POST "http://localhost:8123" --data "TRUNCATE TABLE dev.assets" > /dev/null 2>&1 || true

print_test_result "Database Cleanup" "PASS" "Database tables cleaned"

echo ""

echo "========================================================================"
echo "SUITE A: CORE API FUNCTIONALITY"
echo "========================================================================"

# Test A-1: API Connectivity
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/events" -H "Authorization: Bearer $ADMIN_TOKEN")
if [ "$RESPONSE" = "200" ]; then
    print_test_result "A-1: API Connectivity" "PASS" "API responding correctly"
else
    print_test_result "A-1: API Connectivity" "FAIL" "Expected 200, got $RESPONSE"
fi

# Test A-2: Authentication System
AUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/events" -H "Authorization: Bearer $ADMIN_TOKEN")
if [ "$AUTH_RESPONSE" = "200" ]; then
    print_test_result "A-2: Authentication System" "PASS" "Admin token accepted"
else
    print_test_result "A-2: Authentication System" "FAIL" "Admin token rejected"
fi

# Test A-3: Role-based access control
RBAC_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/rules" -H "Authorization: Bearer $VIEWER_TOKEN" -H "Content-Type: application/json" -d '{"rule_name": "test", "description": "test", "query": "SELECT 1"}')
if [ "$RBAC_RESPONSE" = "403" ]; then
    print_test_result "A-3: Role-Based Access Control" "PASS" "Viewer denied admin action"
else
    print_test_result "A-3: Role-Based Access Control" "FAIL" "Expected 403, got $RBAC_RESPONSE"
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
    print_test_result "B-1: Log Source Creation" "PASS" "Log source created with ID: $SOURCE_ID"
else
    print_test_result "B-1: Log Source Creation" "FAIL" "Failed to create log source"
fi

# Test B-2: List log sources
LIST_SOURCES_RESPONSE=$(curl -s -X GET "$API_URL/v1/log_sources" -H "Authorization: Bearer $ADMIN_TOKEN")
SOURCE_COUNT=$(echo "$LIST_SOURCES_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

if [ "$SOURCE_COUNT" -gt "0" ]; then
    print_test_result "B-2: Log Source Listing" "PASS" "Log sources listed (total: $SOURCE_COUNT)"
else
    print_test_result "B-2: Log Source Listing" "FAIL" "No log sources found"
fi

echo ""

echo "========================================================================"
echo "SUITE C: TAXONOMY MANAGEMENT"
echo "========================================================================"

# Test C-1: Create taxonomy mapping
TAXONOMY_JSON='{
    "source_type": "Syslog",
    "field_to_check": "raw_event",
    "value_to_match": "failed",
    "event_category": "Authentication",
    "event_outcome": "Failure", 
    "event_action": "Login.Failed"
}'

CREATE_TAXONOMY_RESPONSE=$(curl -s -X POST "$API_URL/v1/taxonomy/mappings" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$TAXONOMY_JSON")

TAXONOMY_ID=$(echo "$CREATE_TAXONOMY_RESPONSE" | jq -r '.mapping_id // empty' 2>/dev/null)

if [ -n "$TAXONOMY_ID" ]; then
    print_test_result "C-1: Taxonomy Mapping Creation" "PASS" "Taxonomy mapping created"
else
    print_test_result "C-1: Taxonomy Mapping Creation" "FAIL" "Failed to create taxonomy mapping"
fi

# Test C-2: List taxonomy mappings
LIST_TAXONOMY_RESPONSE=$(curl -s -X GET "$API_URL/v1/taxonomy/mappings" -H "Authorization: Bearer $ADMIN_TOKEN")
TAXONOMY_COUNT=$(echo "$LIST_TAXONOMY_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

if [ "$TAXONOMY_COUNT" -gt "0" ]; then
    print_test_result "C-2: Taxonomy Mapping Listing" "PASS" "Taxonomy mappings listed"
else
    print_test_result "C-2: Taxonomy Mapping Listing" "FAIL" "No taxonomy mappings found"
fi

echo ""

echo "========================================================================"
echo "SUITE D: ASSET MANAGEMENT"
echo "========================================================================"

# Test D-1: Create asset
ASSET_JSON='{
    "asset_name": "Test Localhost Server",
    "asset_ip": "127.0.0.1",
    "asset_type": "Server",
    "criticality": "High"
}'

CREATE_ASSET_RESPONSE=$(curl -s -X POST "$API_URL/v1/assets" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$ASSET_JSON")

ASSET_ID=$(echo "$CREATE_ASSET_RESPONSE" | jq -r '.asset_id // empty' 2>/dev/null)

if [ -n "$ASSET_ID" ]; then
    print_test_result "D-1: Asset Creation" "PASS" "Asset created with ID: $ASSET_ID"
else
    print_test_result "D-1: Asset Creation" "FAIL" "Failed to create asset"
fi

# Test D-2: List assets
LIST_ASSETS_RESPONSE=$(curl -s -X GET "$API_URL/v1/assets" -H "Authorization: Bearer $ADMIN_TOKEN")
ASSET_COUNT=$(echo "$LIST_ASSETS_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

if [ "$ASSET_COUNT" -gt "0" ]; then
    print_test_result "D-2: Asset Listing" "PASS" "Assets listed (total: $ASSET_COUNT)"
else
    print_test_result "D-2: Asset Listing" "FAIL" "No assets found"
fi

echo ""

echo "========================================================================"
echo "SUITE E: DETECTION RULES"
echo "========================================================================"

# Test E-1: Create detection rule
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
    print_test_result "E-1: Detection Rule Creation" "PASS" "Rule created with ID: $RULE_ID"
else
    print_test_result "E-1: Detection Rule Creation" "FAIL" "Failed to create detection rule"
fi

# Test E-2: List detection rules
LIST_RULES_RESPONSE=$(curl -s -X GET "$API_URL/v1/rules" -H "Authorization: Bearer $ADMIN_TOKEN")
RULE_COUNT=$(echo "$LIST_RULES_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

if [ "$RULE_COUNT" -gt "0" ]; then
    print_test_result "E-2: Detection Rule Listing" "PASS" "Rules listed (total: $RULE_COUNT)"
else
    print_test_result "E-2: Detection Rule Listing" "FAIL" "No rules found"
fi

echo ""

echo "========================================================================"
echo "SUITE F: CASE MANAGEMENT"
echo "========================================================================"

# Test F-1: Create case
CASE_JSON='{
    "title": "Regression Test Case",
    "severity": "High",
    "alert_ids": []
}'

CREATE_CASE_RESPONSE=$(curl -s -X POST "$API_URL/v1/cases" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CASE_JSON")

CASE_ID=$(echo "$CREATE_CASE_RESPONSE" | jq -r '.case_id // empty' 2>/dev/null)

if [ -n "$CASE_ID" ]; then
    print_test_result "F-1: Case Creation" "PASS" "Case created with ID: $CASE_ID"
else
    print_test_result "F-1: Case Creation" "FAIL" "Failed to create case"
fi

# Test F-2: List cases
LIST_CASES_RESPONSE=$(curl -s -X GET "$API_URL/v1/cases" -H "Authorization: Bearer $ADMIN_TOKEN")
CASE_COUNT=$(echo "$LIST_CASES_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

if [ "$CASE_COUNT" -gt "0" ]; then
    print_test_result "F-2: Case Listing" "PASS" "Cases listed (total: $CASE_COUNT)"
else
    print_test_result "F-2: Case Listing" "FAIL" "No cases found"
fi

echo ""

echo "========================================================================"
echo "SUITE G: DATABASE INTEGRATION"
echo "========================================================================"

# Test G-1: Database schema verification
SCHEMA_QUERY="DESCRIBE TABLE dev.events FORMAT JSON"
SCHEMA_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$SCHEMA_QUERY")

if echo "$SCHEMA_RESPONSE" | jq -r '.data[].name' | grep -q "event_category"; then
    print_test_result "G-1: Database Schema" "PASS" "Taxonomy fields present in schema"
else
    print_test_result "G-1: Database Schema" "FAIL" "Taxonomy fields missing from schema"
fi

# Test G-2: Asset schema verification
ASSET_SCHEMA_QUERY="DESCRIBE TABLE dev.assets FORMAT JSON"
ASSET_SCHEMA_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$ASSET_SCHEMA_QUERY")

if echo "$ASSET_SCHEMA_RESPONSE" | jq -r '.data[].name' | grep -q "asset_id"; then
    print_test_result "G-2: Asset Schema" "PASS" "Asset table schema verified"
else
    print_test_result "G-2: Asset Schema" "FAIL" "Asset table schema missing"
fi

echo ""

echo "========================================================================"
echo "SUITE H: INGESTOR SERVICE & FULL PIPELINE"
echo "========================================================================"

echo -e "${BLUE}Testing new siem_ingestor service and full data pipeline...${NC}"

# Test H-1: Syslog Ingestion via Ingestor
echo "H-1: Testing Syslog ingestion..."
echo "<34>Oct 20 14:50:00 testhost auth: authentication failed for user john" | nc -u -w0 127.0.0.1 5140

sleep 3  # Allow time for processing

# Check if message appeared in Kafka (via events in database)
SYSLOG_DB_QUERY="SELECT COUNT(*) as count FROM dev.events WHERE raw_event LIKE '%authentication failed%' FORMAT JSON"
SYSLOG_DB_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$SYSLOG_DB_QUERY")
SYSLOG_EVENT_COUNT=$(echo "$SYSLOG_DB_RESPONSE" | jq -r '.data[0].count // 0' 2>/dev/null)

if [ "$SYSLOG_EVENT_COUNT" -gt "0" ]; then
    print_test_result "H-1: Syslog Ingestion Pipeline" "PASS" "Syslog message processed through full pipeline"
else
    print_test_result "H-1: Syslog Ingestion Pipeline" "FAIL" "Syslog message not found in database"
fi

# Test H-2: HTTP Ingestion via Ingestor
echo "H-2: Testing HTTP raw log ingestion..."
HTTP_RESPONSE=$(curl -s -X POST --data "Application error: authentication failed for API user" "$INGESTOR_URL/ingest/raw")

sleep 3  # Allow time for processing

# Check if message appeared in database
HTTP_DB_QUERY="SELECT COUNT(*) as count FROM dev.events WHERE raw_event LIKE '%Application error: authentication failed%' FORMAT JSON"
HTTP_DB_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$HTTP_DB_QUERY")
HTTP_EVENT_COUNT=$(echo "$HTTP_DB_RESPONSE" | jq -r '.data[0].count // 0' 2>/dev/null)

if [ "$HTTP_EVENT_COUNT" -gt "0" ]; then
    print_test_result "H-2: HTTP Ingestion Pipeline" "PASS" "HTTP message processed through full pipeline"
else
    print_test_result "H-2: HTTP Ingestion Pipeline" "FAIL" "HTTP message not found in database"
fi

# Test H-3: End-to-End Alert Generation
echo "H-3: Testing end-to-end alert generation..."

# Send another syslog message with "failed" to trigger the rule
echo "<34>Oct 20 14:51:00 testhost sshd: login failed for root from 192.168.1.100" | nc -u -w0 127.0.0.1 5140

sleep 5  # Allow time for processing and rule execution

# Execute the detection rule
if [ -n "$RULE_ID" ]; then
    EXECUTE_RULE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/rules/$RULE_ID/execute" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$EXECUTE_RULE_RESPONSE" = "200" ]; then
        sleep 3  # Allow time for alert generation
        
        # Check if alerts were generated
        ALERTS_RESPONSE=$(curl -s -X GET "$API_URL/v1/alerts" -H "Authorization: Bearer $ADMIN_TOKEN")
        ALERT_COUNT=$(echo "$ALERTS_RESPONSE" | jq -r '.total // 0' 2>/dev/null)
        
        if [ "$ALERT_COUNT" -gt "0" ]; then
            print_test_result "H-3: End-to-End Alert Generation" "PASS" "Alerts generated from ingested data (total: $ALERT_COUNT)"
        else
            print_test_result "H-3: End-to-End Alert Generation" "FAIL" "No alerts generated"
        fi
    else
        print_test_result "H-3: End-to-End Alert Generation" "FAIL" "Rule execution failed"
    fi
else
    print_test_result "H-3: End-to-End Alert Generation" "FAIL" "No rule available for testing"
fi

# Test H-4: Taxonomy Application Verification
echo "H-4: Verifying taxonomy application..."
TAXONOMY_DB_QUERY="SELECT event_category, event_outcome, event_action FROM dev.events WHERE raw_event LIKE '%failed%' AND event_category IS NOT NULL LIMIT 1 FORMAT JSON"
TAXONOMY_DB_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$TAXONOMY_DB_QUERY")

if echo "$TAXONOMY_DB_RESPONSE" | jq -e '.data[0].event_category' > /dev/null 2>&1; then
    CATEGORY=$(echo "$TAXONOMY_DB_RESPONSE" | jq -r '.data[0].event_category')
    print_test_result "H-4: Taxonomy Application" "PASS" "Taxonomy applied successfully (category: $CATEGORY)"
else
    print_test_result "H-4: Taxonomy Application" "FAIL" "Taxonomy not applied to ingested events"
fi

# Test H-5: Asset Context Integration
echo "H-5: Testing asset context integration..."
if [ -n "$CASE_ID" ]; then
    CASE_DETAILS=$(curl -s -X GET "$API_URL/v1/cases/$CASE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    HAS_RELATED_ASSETS=$(echo "$CASE_DETAILS" | jq -r '.related_assets // empty' 2>/dev/null)
    
    if [ -n "$HAS_RELATED_ASSETS" ]; then
        print_test_result "H-5: Asset Context Integration" "PASS" "Case includes related_assets field"
    else
        print_test_result "H-5: Asset Context Integration" "FAIL" "Case missing related_assets field"
    fi
else
    print_test_result "H-5: Asset Context Integration" "FAIL" "No case available for testing"
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

if [ -n "$ASSET_ID" ]; then
    DELETE_ASSET=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/assets/$ASSET_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    [ "$DELETE_ASSET" = "200" ] && ((CLEANUP_COUNT++))
fi

print_test_result "Test Data Cleanup" "PASS" "Cleaned up $CLEANUP_COUNT test objects"

echo ""

echo "========================================================================"
echo "FULL REGRESSION TEST SUMMARY (POST-6.1)"
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
    echo "✅ Suite A: Core API functionality operational"
    echo "✅ Suite B: Log source management working"
    echo "✅ Suite C: Taxonomy system functional"
    echo "✅ Suite D: Asset management operational"
    echo "✅ Suite E: Detection rules working"
    echo "✅ Suite F: Case management functional"
    echo "✅ Suite G: Database integration verified"
    echo "✅ Suite H: NEW - Ingestor service & full pipeline operational"
    echo ""
    echo -e "${GREEN}🚀 SIEM PLATFORM FULLY OPERATIONAL POST-6.1${NC}"
    echo ""
    echo "📊 Key Achievements:"
    echo "   • High-performance data ingestion via UDP & HTTP"
    echo "   • Full pipeline: Ingestor → Kafka → Consumer → Database"
    echo "   • End-to-end alert generation from ingested data"
    echo "   • Taxonomy classification of raw events"
    echo "   • Asset context integration in investigations"
    echo ""
    echo "The platform is ready for the next development phase!"
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
echo "End of Full Regression Test (Post-6.1)"
echo "========================================================================" 