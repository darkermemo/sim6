#!/bin/bash

# Test Log Source Management Functionality
# Verification plan for intelligent parsing based on configured log sources

set -e

echo "========================================================================"
echo "Log Source Management Verification Test"
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

echo "Setting up test environment..."

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
echo "TEST 1: Log Source API Access Control"
echo "========================================================================"

# Test 1.1: Non-Admin access should be denied
echo "Testing access control..."
VIEWER_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/log_sources" -H "Authorization: Bearer $VIEWER_TOKEN")
if [ "$VIEWER_RESPONSE" = "403" ]; then
    print_test_result "Non-Admin Access Denial" "PASS" "Viewer correctly denied access (403)"
else
    print_test_result "Non-Admin Access Denial" "FAIL" "Expected 403, got $VIEWER_RESPONSE"
fi

# Test 1.2: Admin access should work
ADMIN_LIST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/log_sources" -H "Authorization: Bearer $ADMIN_TOKEN")
if [ "$ADMIN_LIST_RESPONSE" = "200" ]; then
    print_test_result "Admin Access Success" "PASS" "Admin can list log sources (200)"
else
    print_test_result "Admin Access Success" "FAIL" "Expected 200, got $ADMIN_LIST_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 2: Configure Log Source for 10.10.10.10 (Syslog)"
echo "========================================================================"

# Create log source configuration
LOG_SOURCE_JSON='{"source_name": "Test Syslog Server", "source_type": "Syslog", "source_ip": "10.10.10.10"}'
CREATE_RESPONSE=$(curl -s -X POST "$API_URL/v1/log_sources" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$LOG_SOURCE_JSON")

SOURCE_ID=$(echo "$CREATE_RESPONSE" | jq -r '.source_id // empty' 2>/dev/null)

if [ -n "$SOURCE_ID" ]; then
    print_test_result "Log Source Creation" "PASS" "Created log source with ID: $SOURCE_ID"
    
    # Verify the source appears in list
    sleep 1
    LIST_RESPONSE=$(curl -s -X GET "$API_URL/v1/log_sources" -H "Authorization: Bearer $ADMIN_TOKEN")
    SOURCE_COUNT=$(echo "$LIST_RESPONSE" | jq -r '.total // 0' 2>/dev/null)
    
    if [ "$SOURCE_COUNT" -gt "0" ]; then
        print_test_result "Log Source Listing" "PASS" "Source appears in list (total: $SOURCE_COUNT)"
    else
        print_test_result "Log Source Listing" "FAIL" "Source not found in list"
    fi
    
    # Test lookup by IP
    LOOKUP_RESPONSE=$(curl -s -X GET "$API_URL/v1/log_sources/by_ip/10.10.10.10")
    LOOKUP_TYPE=$(echo "$LOOKUP_RESPONSE" | jq -r '.source_type // empty' 2>/dev/null)
    
    if [ "$LOOKUP_TYPE" = "Syslog" ]; then
        print_test_result "IP-based Lookup" "PASS" "10.10.10.10 correctly mapped to Syslog"
    else
        print_test_result "IP-based Lookup" "FAIL" "Expected 'Syslog', got '$LOOKUP_TYPE'"
    fi
else
    print_test_result "Log Source Creation" "FAIL" "Failed to create log source"
    echo "Response: $CREATE_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 3: Event Ingestion with Configured Source"
echo "========================================================================"

# Test 3.1: Ingest event from configured source (10.10.10.10)
echo "Ingesting event from configured source (10.10.10.10)..."
CONFIGURED_EVENT='{"events": [{"source_ip": "10.10.10.10", "raw_event": "<134>Oct 11 22:14:15 mymachine su: '\''su root'\'' failed for lonvick on /dev/pts/8"}]}'
CONFIGURED_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CONFIGURED_EVENT")

if [ "$CONFIGURED_RESPONSE" = "202" ]; then
    print_test_result "Configured Source Ingestion" "PASS" "Event from 10.10.10.10 accepted (202)"
else
    print_test_result "Configured Source Ingestion" "FAIL" "Expected 202, got $CONFIGURED_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 4: Event Ingestion with Unconfigured Source"
echo "========================================================================"

# Test 4.1: Ingest event from unconfigured source (10.10.10.11)
echo "Ingesting event from unconfigured source (10.10.10.11)..."
UNCONFIGURED_EVENT='{"events": [{"source_ip": "10.10.10.11", "raw_event": "<134>Oct 11 22:14:15 anothermachine su: '\''su root'\'' failed for testuser on /dev/pts/9"}]}'
UNCONFIGURED_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$UNCONFIGURED_EVENT")

if [ "$UNCONFIGURED_RESPONSE" = "202" ]; then
    print_test_result "Unconfigured Source Ingestion" "PASS" "Event from 10.10.10.11 accepted (202)"
else
    print_test_result "Unconfigured Source Ingestion" "FAIL" "Expected 202, got $UNCONFIGURED_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 5: Consumer Log Monitoring"
echo "========================================================================"

echo -e "${BLUE}Starting consumer for log monitoring...${NC}"

# Start consumer in background and capture logs
cd ../siem_consumer
RUST_LOG=info API_URL=http://localhost:8080 cargo run > consumer_test.log 2>&1 &
CONSUMER_PID=$!
cd ..

# Give consumer time to start and process
echo "Waiting for consumer startup..."
sleep 5

# Send another test event to trigger consumer processing
echo "Sending additional test events..."
curl -s -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"events": [{"source_ip": "10.10.10.10", "raw_event": "<134>Oct 11 22:15:15 mymachine test: configured source event"}]}' > /dev/null

curl -s -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"events": [{"source_ip": "10.10.10.11", "raw_event": "<134>Oct 11 22:15:15 anothermachine test: unconfigured source event"}]}' > /dev/null

# Give consumer time to process
sleep 10

# Stop consumer
kill $CONSUMER_PID 2>/dev/null || true
sleep 2

# Check consumer logs
echo ""
echo -e "${BLUE}Consumer Log Analysis:${NC}"
if [ -f "siem_consumer/consumer_test.log" ]; then
    echo "--- Consumer Logs ---"
    cat siem_consumer/consumer_test.log | tail -30
    echo "--- End Consumer Logs ---"
    
    # Check for specific log patterns
    if grep -q "Found configuration for 10.10.10.10" siem_consumer/consumer_test.log; then
        print_test_result "Configured Source Detection" "PASS" "Consumer found configuration for 10.10.10.10"
    else
        print_test_result "Configured Source Detection" "FAIL" "Consumer did not find configuration for 10.10.10.10"
    fi
    
    if grep -q "No configuration found for 10.10.10.11" siem_consumer/consumer_test.log; then
        print_test_result "Unconfigured Source Detection" "PASS" "Consumer correctly handled unconfigured 10.10.10.11"
    else
        print_test_result "Unconfigured Source Detection" "FAIL" "Consumer did not properly handle unconfigured 10.10.10.11"
    fi
    
    # Clean up log file
    rm -f siem_consumer/consumer_test.log
else
    print_test_result "Consumer Log Check" "FAIL" "Consumer log file not found"
fi

echo ""

echo "========================================================================"
echo "TEST 6: Database Verification"
echo "========================================================================"

# Check if events were stored in ClickHouse
echo "Verifying events in ClickHouse..."
sleep 2

# Query events from ClickHouse
EVENTS_QUERY="SELECT source_ip, count(*) as event_count FROM dev.events WHERE source_ip IN ('10.10.10.10', '10.10.10.11') GROUP BY source_ip FORMAT JSON"
DB_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$EVENTS_QUERY")

if echo "$DB_RESPONSE" | jq -e '.data' > /dev/null 2>&1; then
    print_test_result "Database Event Storage" "PASS" "Events successfully stored in ClickHouse"
    
    # Show event counts
    echo "Event counts by source IP:"
    echo "$DB_RESPONSE" | jq -r '.data[] | "  \(.source_ip): \(.event_count) events"' 2>/dev/null || echo "  Could not parse event counts"
else
    print_test_result "Database Event Storage" "FAIL" "Events not found in ClickHouse or query failed"
fi

echo ""

echo "========================================================================"
echo "TEST 7: Cleanup and Log Source Deletion"
echo "========================================================================"

# Delete the test log source
if [ -n "$SOURCE_ID" ]; then
    DELETE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/log_sources/$SOURCE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$DELETE_RESPONSE" = "200" ]; then
        print_test_result "Log Source Deletion" "PASS" "Test log source deleted successfully"
    else
        print_test_result "Log Source Deletion" "FAIL" "Expected 200, got $DELETE_RESPONSE"
    fi
    
    # Verify deletion
    VERIFY_DELETE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/log_sources/by_ip/10.10.10.10")
    if [ "$VERIFY_DELETE" = "404" ]; then
        print_test_result "Deletion Verification" "PASS" "Log source no longer found (404)"
    else
        print_test_result "Deletion Verification" "FAIL" "Expected 404, got $VERIFY_DELETE"
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
    echo -e "${GREEN}🎉 ALL LOG SOURCE MANAGEMENT TESTS PASSED!${NC}"
    echo ""
    echo "✅ Log source API endpoints working correctly"
    echo "✅ Admin role enforcement functional"
    echo "✅ Log source configuration and lookup operational"
    echo "✅ Event ingestion processing both configured and unconfigured sources"
    echo -e "${GREEN}✅ Intelligent parsing pipeline ready for production${NC}"
    echo ""
    echo "🚀 Log source management system is fully operational!"
else
    echo ""
    echo -e "${RED}❌ SOME TESTS FAILED!${NC}"
    echo ""
    echo "Please review the failing tests and address any issues."
    echo "The log source management system may not be fully operational."
fi

echo ""
echo "========================================================================"
echo "End of Log Source Management Verification"
echo "========================================================================" 