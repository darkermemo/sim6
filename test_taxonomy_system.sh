#!/bin/bash

# Test Common Event Taxonomy System
# Verification plan for standardized event data classification

set -e

echo "========================================================================"
echo "Common Event Taxonomy Verification Test"
echo "========================================================================"
echo "Date: $(date)"
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

# Generate authentication tokens
echo "Generating authentication tokens..."

# Admin token for tenant-A
ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -A1 'JWT Token' | tail -1)

# Viewer token for tenant-A (should be denied)
VIEWER_TOKEN=$(cd siem_api && cargo run --example generate_token charlie tenant-A Viewer 2>/dev/null | grep -A1 'JWT Token' | tail -1)

if [ -z "$ADMIN_TOKEN" ] || [ -z "$VIEWER_TOKEN" ]; then
    echo -e "${RED}Failed to generate required tokens${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Authentication tokens generated successfully"
echo ""

echo "========================================================================"
echo "TEST 1: Taxonomy API Access Control"
echo "========================================================================"

# Test 1.1: Non-Admin access should be denied
echo "Testing access control..."
VIEWER_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/taxonomy/mappings" -H "Authorization: Bearer $VIEWER_TOKEN")
if [ "$VIEWER_RESPONSE" = "403" ]; then
    print_test_result "Non-Admin Access Denial" "PASS" "Viewer correctly denied access (403)"
else
    print_test_result "Non-Admin Access Denial" "FAIL" "Expected 403, got $VIEWER_RESPONSE"
fi

# Test 1.2: Admin access should work
ADMIN_LIST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/taxonomy/mappings" -H "Authorization: Bearer $ADMIN_TOKEN")
if [ "$ADMIN_LIST_RESPONSE" = "200" ]; then
    print_test_result "Admin Access Success" "PASS" "Admin can list taxonomy mappings (200)"
else
    print_test_result "Admin Access Success" "FAIL" "Expected 200, got $ADMIN_LIST_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 2: Create Taxonomy Mapping for Failed Authentication"
echo "========================================================================"

# Create taxonomy mapping rule as specified in verification plan
MAPPING_JSON='{
    "source_type": "Syslog",
    "field_to_check": "raw_event",
    "value_to_match": "failed for",
    "event_category": "Authentication",
    "event_outcome": "Failure",
    "event_action": "Login.Attempt"
}'

CREATE_RESPONSE=$(curl -s -X POST "$API_URL/v1/taxonomy/mappings" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$MAPPING_JSON")

MAPPING_ID=$(echo "$CREATE_RESPONSE" | jq -r '.mapping_id // empty' 2>/dev/null)

if [ -n "$MAPPING_ID" ]; then
    print_test_result "Taxonomy Mapping Creation" "PASS" "Created mapping with ID: $MAPPING_ID"
    
    # Verify the mapping appears in list
    sleep 1
    LIST_RESPONSE=$(curl -s -X GET "$API_URL/v1/taxonomy/mappings" -H "Authorization: Bearer $ADMIN_TOKEN")
    MAPPING_COUNT=$(echo "$LIST_RESPONSE" | jq -r '.total // 0' 2>/dev/null)
    
    if [ "$MAPPING_COUNT" -gt "0" ]; then
        print_test_result "Taxonomy Mapping Listing" "PASS" "Mapping appears in list (total: $MAPPING_COUNT)"
    else
        print_test_result "Taxonomy Mapping Listing" "FAIL" "Mapping not found in list"
    fi
    
    # Test internal all mappings endpoint
    ALL_MAPPINGS_RESPONSE=$(curl -s -X GET "$API_URL/v1/taxonomy/mappings/all")
    ALL_MAPPING_COUNT=$(echo "$ALL_MAPPINGS_RESPONSE" | jq -r '.total // 0' 2>/dev/null)
    
    if [ "$ALL_MAPPING_COUNT" -gt "0" ]; then
        print_test_result "Internal Mappings Endpoint" "PASS" "Internal endpoint returns mappings (total: $ALL_MAPPING_COUNT)"
    else
        print_test_result "Internal Mappings Endpoint" "FAIL" "Internal endpoint returned no mappings"
    fi
else
    print_test_result "Taxonomy Mapping Creation" "FAIL" "Failed to create taxonomy mapping"
    echo "Response: $CREATE_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 3: Set up Log Source for Testing"
echo "========================================================================"

# Create log source for the test IP
LOG_SOURCE_JSON='{"source_name": "Test Syslog Server", "source_type": "Syslog", "source_ip": "10.10.10.10"}'
LOG_SOURCE_RESPONSE=$(curl -s -X POST "$API_URL/v1/log_sources" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$LOG_SOURCE_JSON")

LOG_SOURCE_ID=$(echo "$LOG_SOURCE_RESPONSE" | jq -r '.source_id // empty' 2>/dev/null)

if [ -n "$LOG_SOURCE_ID" ]; then
    print_test_result "Log Source Creation" "PASS" "Created log source for testing"
else
    print_test_result "Log Source Creation" "FAIL" "Failed to create log source"
fi

echo ""

echo "========================================================================"
echo "TEST 4: Ingest Matching Event (Should Apply Taxonomy)"
echo "========================================================================"

# Ingest event with "failed for" in the raw_event (matches our mapping)
MATCHING_EVENT='{"events": [{"source_ip": "10.10.10.10", "raw_event": "<134>Oct 11 22:14:15 mymachine su: user login failed for alice on /dev/pts/8"}]}'
MATCHING_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$MATCHING_EVENT")

if [ "$MATCHING_RESPONSE" = "202" ]; then
    print_test_result "Matching Event Ingestion" "PASS" "Event with 'failed for' accepted (202)"
else
    print_test_result "Matching Event Ingestion" "FAIL" "Expected 202, got $MATCHING_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 5: Ingest Non-Matching Event (Should Get Default Taxonomy)"
echo "========================================================================"

# Ingest event without "failed for" (should get default Unknown values)
NON_MATCHING_EVENT='{"events": [{"source_ip": "10.10.10.10", "raw_event": "<134>Oct 11 22:14:15 mymachine su: successful login for bob on /dev/pts/9"}]}'
NON_MATCHING_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$NON_MATCHING_EVENT")

if [ "$NON_MATCHING_RESPONSE" = "202" ]; then
    print_test_result "Non-Matching Event Ingestion" "PASS" "Event without 'failed for' accepted (202)"
else
    print_test_result "Non-Matching Event Ingestion" "FAIL" "Expected 202, got $NON_MATCHING_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 6: Consumer Processing and Taxonomy Application"
echo "========================================================================"

echo -e "${BLUE}Starting consumer for taxonomy testing...${NC}"

# Start consumer in background and capture logs
cd siem_consumer
timeout 20s bash -c 'RUST_LOG=info API_URL=http://localhost:8080 cargo run' > consumer_taxonomy_test.log 2>&1 &
CONSUMER_PID=$!
cd ..

# Give consumer time to start and fetch configurations
echo "Waiting for consumer startup and configuration loading..."
sleep 8

# Send test events to trigger consumer processing
echo "Sending test events to trigger taxonomy processing..."
curl -s -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"events": [{"source_ip": "10.10.10.10", "raw_event": "<134>Oct 11 22:15:15 mymachine test: authentication failed for testuser"}]}' > /dev/null

curl -s -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"events": [{"source_ip": "10.10.10.10", "raw_event": "<134>Oct 11 22:15:15 mymachine test: file access successful"}]}' > /dev/null

# Wait for processing
sleep 8

# Stop consumer
kill $CONSUMER_PID 2>/dev/null || true
sleep 2

echo ""
echo -e "${BLUE}Consumer Log Analysis:${NC}"
if [ -f "siem_consumer/consumer_taxonomy_test.log" ]; then
    echo "--- Last 30 lines of consumer log ---"
    tail -30 siem_consumer/consumer_taxonomy_test.log
    echo "--- End Consumer Logs ---"
    
    # Check for specific log patterns
    if grep -q "Loaded.*taxonomy mappings" siem_consumer/consumer_taxonomy_test.log; then
        print_test_result "Taxonomy Mappings Loaded" "PASS" "Consumer loaded taxonomy mappings"
    else
        print_test_result "Taxonomy Mappings Loaded" "FAIL" "Consumer did not load taxonomy mappings"
    fi
    
    if grep -q "Applied taxonomy mapping" siem_consumer/consumer_taxonomy_test.log; then
        print_test_result "Taxonomy Mapping Applied" "PASS" "Consumer applied taxonomy mapping to event"
    else
        print_test_result "Taxonomy Mapping Applied" "FAIL" "Consumer did not apply taxonomy mapping"
    fi
    
    # Clean up log file
    rm -f siem_consumer/consumer_taxonomy_test.log
else
    print_test_result "Consumer Log Check" "FAIL" "Consumer log file not found"
fi

echo ""

echo "========================================================================"
echo "TEST 7: Database Verification - Check Taxonomy Fields"
echo "========================================================================"

echo "Verifying taxonomy fields in ClickHouse..."
sleep 3

# Query events with taxonomy fields
TAXONOMY_QUERY="SELECT source_ip, event_category, event_outcome, event_action, raw_event FROM dev.events WHERE source_ip = '10.10.10.10' AND event_category != '' ORDER BY event_timestamp DESC LIMIT 5 FORMAT JSON"
DB_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$TAXONOMY_QUERY")

if echo "$DB_RESPONSE" | jq -e '.data' > /dev/null 2>&1; then
    print_test_result "Database Taxonomy Storage" "PASS" "Events with taxonomy fields found in ClickHouse"
    
    # Show taxonomy data
    echo "Recent events with taxonomy:"
    echo "$DB_RESPONSE" | jq -r '.data[] | "  IP: \(.source_ip) | Category: \(.event_category) | Outcome: \(.event_outcome) | Action: \(.event_action)"' 2>/dev/null || echo "  Could not parse taxonomy data"
    
    # Check for specific taxonomy values
    if echo "$DB_RESPONSE" | jq -r '.data[].event_category' 2>/dev/null | grep -q "Authentication"; then
        print_test_result "Authentication Category Applied" "PASS" "Found events with Authentication category"
    else
        print_test_result "Authentication Category Applied" "FAIL" "No events found with Authentication category"
    fi
    
    if echo "$DB_RESPONSE" | jq -r '.data[].event_outcome' 2>/dev/null | grep -q "Failure"; then
        print_test_result "Failure Outcome Applied" "PASS" "Found events with Failure outcome"
    else
        print_test_result "Failure Outcome Applied" "FAIL" "No events found with Failure outcome"
    fi
    
else
    print_test_result "Database Taxonomy Storage" "FAIL" "Events with taxonomy not found in ClickHouse or query failed"
    echo "DB Response: $DB_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 8: Verify Default Taxonomy for Non-Matching Events"
echo "========================================================================"

# Query events that should have default "Unknown" values
DEFAULT_QUERY="SELECT event_category, event_outcome, event_action FROM dev.events WHERE source_ip = '10.10.10.10' AND raw_event LIKE '%successful%' LIMIT 1 FORMAT JSON"
DEFAULT_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$DEFAULT_QUERY")

if echo "$DEFAULT_RESPONSE" | jq -e '.data' > /dev/null 2>&1; then
    if echo "$DEFAULT_RESPONSE" | jq -r '.data[].event_category' 2>/dev/null | grep -q "Unknown"; then
        print_test_result "Default Taxonomy Applied" "PASS" "Non-matching events have Unknown taxonomy values"
    else
        print_test_result "Default Taxonomy Applied" "FAIL" "Non-matching events do not have expected default values"
    fi
else
    print_test_result "Default Taxonomy Applied" "FAIL" "Could not verify default taxonomy values"
fi

echo ""

echo "========================================================================"
echo "TEST 9: Cleanup"
echo "========================================================================"

# Delete the test taxonomy mapping
if [ -n "$MAPPING_ID" ]; then
    DELETE_MAPPING_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/taxonomy/mappings/$MAPPING_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$DELETE_MAPPING_RESPONSE" = "200" ]; then
        print_test_result "Taxonomy Mapping Deletion" "PASS" "Test mapping deleted successfully"
    else
        print_test_result "Taxonomy Mapping Deletion" "FAIL" "Expected 200, got $DELETE_MAPPING_RESPONSE"
    fi
fi

# Delete the test log source
if [ -n "$LOG_SOURCE_ID" ]; then
    DELETE_SOURCE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/log_sources/$LOG_SOURCE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$DELETE_SOURCE_RESPONSE" = "200" ]; then
        print_test_result "Log Source Deletion" "PASS" "Test log source deleted successfully"
    else
        print_test_result "Log Source Deletion" "FAIL" "Expected 200, got $DELETE_SOURCE_RESPONSE"
    fi
fi

echo ""

echo "========================================================================"
echo "TEST SUMMARY"
echo "========================================================================"

echo -e "${BLUE}Overall Results:${NC}"
echo "  Total Tests: $TOTAL_TESTS"
echo "  Passed: $TESTS_PASSED"
echo "  Failed: $TESTS_FAILED"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 ALL TAXONOMY SYSTEM TESTS PASSED!${NC}"
    echo ""
    echo "✅ Taxonomy API endpoints working correctly"
    echo "✅ Admin role enforcement functional"
    echo "✅ Taxonomy mapping creation and management operational"
    echo "✅ Event ingestion processing with taxonomy application"
    echo "✅ Consumer applying taxonomy rules correctly"
    echo "✅ Database storing standardized event taxonomy"
    echo -e "${GREEN}✅ Common Event Taxonomy system ready for production${NC}"
    echo ""
    echo "🚀 Event standardization system is fully operational!"
    echo ""
    echo "📋 Now you can write rules like:"
    echo "   • event.category = 'Authentication' AND event.outcome = 'Failure'"
    echo "   • event.category = 'Network' AND event.action = 'Connection.Outbound'"
    echo "   • event.category = 'Process' AND event.outcome = 'Success'"
else
    echo ""
    echo -e "${RED}❌ SOME TESTS FAILED!${NC}"
    echo ""
    echo "Please review the failing tests and address any issues."
    echo "The taxonomy system may not be fully operational."
fi

echo ""
echo "========================================================================"
echo "End of Common Event Taxonomy Verification"
echo "========================================================================" 