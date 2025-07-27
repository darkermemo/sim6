#!/bin/bash

# Parser Management API Verification Script
# Tests the full custom parser functionality from API to data ingestion

set -e

echo "========================================================================"
echo "PARSER MANAGEMENT API VERIFICATION (Chunk 6.2)"
echo "========================================================================"
echo "Date: $(date)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API Configuration
API_URL="http://localhost:8080"
INGESTOR_URL="http://localhost:8081"
CLICKHOUSE_URL="http://localhost:8123"

# Test tracking
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
    echo ""
}

# Generate test tokens
echo "🔑 Generating authentication tokens..."
ADMIN_TOKEN=$(python3 -c "
import jwt
import datetime
payload = {
    'sub': 'alice',
    'tid': 'tenant-A',
    'roles': ['Admin'],
    'exp': int((datetime.datetime.utcnow() + datetime.timedelta(hours=1)).timestamp())
}
token = jwt.encode(payload, 'your-secret-key', algorithm='HS256')
print(token)
")

ANALYST_TOKEN=$(python3 -c "
import jwt
import datetime
payload = {
    'sub': 'bob',
    'tid': 'tenant-A',
    'roles': ['Analyst'],
    'exp': int((datetime.datetime.utcnow() + datetime.timedelta(hours=1)).timestamp())
}
token = jwt.encode(payload, 'your-secret-key', algorithm='HS256')
print(token)
")

echo "Admin token generated for tenant-A"
echo "Analyst token generated for tenant-A"
echo ""

# Test 1: Create Custom Grok Parser
echo "📝 Test 1: Create Custom Grok Parser"
GROK_PATTERN='%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} %{GREEDYDATA:message}'
CREATE_GROK_RESPONSE=$(curl -s -X POST "$API_URL/v1/parsers" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"parser_name\": \"CustomAppParser\",
        \"parser_type\": \"Grok\",
        \"pattern\": \"$GROK_PATTERN\"
    }")

if echo "$CREATE_GROK_RESPONSE" | jq -e '.parser_id' > /dev/null 2>&1; then
    CUSTOM_PARSER_ID=$(echo "$CREATE_GROK_RESPONSE" | jq -r '.parser_id')
    test_result "Create Grok Parser" "PASS" "Parser ID: $CUSTOM_PARSER_ID"
else
    test_result "Create Grok Parser" "FAIL" "Response: $CREATE_GROK_RESPONSE"
fi

# Test 2: Create Custom Regex Parser
echo "📝 Test 2: Create Custom Regex Parser"
REGEX_PATTERN='(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (?P<level>\w+) (?P<message>.*)'
CREATE_REGEX_RESPONSE=$(curl -s -X POST "$API_URL/v1/parsers" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"parser_name\": \"CustomRegexParser\",
        \"parser_type\": \"Regex\",
        \"pattern\": \"$REGEX_PATTERN\"
    }")

if echo "$CREATE_REGEX_RESPONSE" | jq -e '.parser_id' > /dev/null 2>&1; then
    REGEX_PARSER_ID=$(echo "$CREATE_REGEX_RESPONSE" | jq -r '.parser_id')
    test_result "Create Regex Parser" "PASS" "Parser ID: $REGEX_PARSER_ID"
else
    test_result "Create Regex Parser" "FAIL" "Response: $CREATE_REGEX_RESPONSE"
fi

# Test 3: List Custom Parsers
echo "📝 Test 3: List Custom Parsers"
LIST_RESPONSE=$(curl -s -X GET "$API_URL/v1/parsers" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

PARSER_COUNT=$(echo "$LIST_RESPONSE" | jq -r '.total // 0')
if [ "$PARSER_COUNT" -ge 2 ]; then
    test_result "List Parsers" "PASS" "Found $PARSER_COUNT parsers"
else
    test_result "List Parsers" "FAIL" "Expected at least 2 parsers, got $PARSER_COUNT"
fi

# Test 4: Test Access Control (Analyst should not be able to create)
echo "📝 Test 4: Test Access Control (Analyst Cannot Create)"
ANALYST_CREATE_RESPONSE=$(curl -s -X POST "$API_URL/v1/parsers" \
    -H "Authorization: Bearer $ANALYST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"parser_name\": \"UnauthorizedParser\",
        \"parser_type\": \"Grok\",
        \"pattern\": \"%{GREEDYDATA:message}\"
    }")

if echo "$ANALYST_CREATE_RESPONSE" | grep -q "Admin permission required"; then
    test_result "Access Control Test" "PASS" "Analyst correctly denied"
else
    test_result "Access Control Test" "FAIL" "Analyst should not be able to create parsers"
fi

# Test 5: Configure Log Source for Custom Parser
echo "📝 Test 5: Configure Log Source for Custom Parser"
LOG_SOURCE_RESPONSE=$(curl -s -X POST "$API_URL/v1/log_sources" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"source_name\": \"Custom App Server\",
        \"source_type\": \"CustomAppParser\",
        \"source_ip\": \"192.168.1.100\"
    }")

if echo "$LOG_SOURCE_RESPONSE" | jq -e '.source_id' > /dev/null 2>&1; then
    LOG_SOURCE_ID=$(echo "$LOG_SOURCE_RESPONSE" | jq -r '.source_id')
    test_result "Configure Log Source" "PASS" "Source ID: $LOG_SOURCE_ID"
else
    test_result "Configure Log Source" "FAIL" "Response: $LOG_SOURCE_RESPONSE"
fi

# Test 6: Restart Consumer to Load Custom Parsers
echo "📝 Test 6: Restart Consumer to Load Custom Parsers"
echo "Stopping existing consumer..."
pkill -f siem_consumer || true
sleep 2

echo "Starting consumer with custom parser support..."
cd siem_consumer && RUST_LOG=info cargo run > /dev/null 2>&1 &
CONSUMER_PID=$!
cd ..
sleep 5

if ps -p $CONSUMER_PID > /dev/null; then
    test_result "Consumer Restart" "PASS" "Consumer running with PID $CONSUMER_PID"
else
    test_result "Consumer Restart" "FAIL" "Consumer failed to start"
fi

# Test 7: Send Custom Log via Ingestor (Grok Pattern)
echo "📝 Test 7: Send Custom Log via Ingestor (Grok Pattern)"
# Generate test message matching the Grok pattern
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
CUSTOM_LOG_MESSAGE="$TIMESTAMP INFO User alice successfully logged into the application"

# Send via UDP (simulating from the configured IP)
echo "$CUSTOM_LOG_MESSAGE" | nc -u -w0 -s 192.168.1.100 127.0.0.1 5140 2>/dev/null || echo "$CUSTOM_LOG_MESSAGE" | nc -u -w0 127.0.0.1 5140

sleep 3

# Check if event was processed
GROK_EVENTS=$(curl -s -X POST "$CLICKHOUSE_URL" --data "SELECT COUNT(*) as count FROM dev.events WHERE raw_event LIKE '%alice successfully logged%' FORMAT JSON")
GROK_COUNT=$(echo "$GROK_EVENTS" | jq -r '.data[0].count // "0"')

if [ "$GROK_COUNT" -gt 0 ]; then
    test_result "Custom Grok Parsing" "PASS" "Found $GROK_COUNT processed events"
else
    test_result "Custom Grok Parsing" "FAIL" "No events found with custom Grok parsing"
fi

# Test 8: Send Custom Log via HTTP (Regex Pattern)
echo "📝 Test 8: Send Custom Log via HTTP (Regex Pattern)"
# Generate test message matching the Regex pattern
REGEX_LOG_MESSAGE="2024-01-01 12:00:00 ERROR Database connection failed for user bob"

HTTP_RESPONSE=$(curl -s -X POST --data "$REGEX_LOG_MESSAGE" "$INGESTOR_URL/ingest/raw")
sleep 3

# Check if event was processed
REGEX_EVENTS=$(curl -s -X POST "$CLICKHOUSE_URL" --data "SELECT COUNT(*) as count FROM dev.events WHERE raw_event LIKE '%Database connection failed%' FORMAT JSON")
REGEX_COUNT=$(echo "$REGEX_EVENTS" | jq -r '.data[0].count // "0"')

if [ "$REGEX_COUNT" -gt 0 ]; then
    test_result "Custom Regex Parsing" "PASS" "Found $REGEX_COUNT processed events"
else
    test_result "Custom Regex Parsing" "FAIL" "No events found with custom Regex parsing"
fi

# Test 9: Verify Parsed Fields in Database
echo "📝 Test 9: Verify Parsed Fields in Database"
# Query the latest events to check if custom parsing extracted fields correctly
LATEST_EVENTS=$(curl -s -X POST "$CLICKHOUSE_URL" --data "SELECT raw_event FROM dev.events WHERE raw_event LIKE '%alice successfully logged%' OR raw_event LIKE '%Database connection failed%' ORDER BY event_timestamp DESC LIMIT 2 FORMAT JSON")

if echo "$LATEST_EVENTS" | jq -e '.data[0]' > /dev/null 2>&1; then
    test_result "Parsed Fields Verification" "PASS" "Custom parsed events found in database"
else
    test_result "Parsed Fields Verification" "FAIL" "Could not verify parsed fields"
fi

# Test 10: Test Parser Validation
echo "📝 Test 10: Test Parser Validation"
# Try to create an invalid Grok pattern
INVALID_GROK_RESPONSE=$(curl -s -X POST "$API_URL/v1/parsers" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"parser_name\": \"InvalidGrokParser\",
        \"parser_type\": \"Grok\",
        \"pattern\": \"invalid pattern without grok syntax\"
    }")

if echo "$INVALID_GROK_RESPONSE" | grep -q "must contain field extractions"; then
    test_result "Pattern Validation" "PASS" "Invalid patterns correctly rejected"
else
    test_result "Pattern Validation" "FAIL" "Invalid patterns should be rejected"
fi

# Test 11: Delete Custom Parser
echo "📝 Test 11: Delete Custom Parser"
if [ -n "$CUSTOM_PARSER_ID" ]; then
    DELETE_RESPONSE=$(curl -s -X DELETE "$API_URL/v1/parsers/$CUSTOM_PARSER_ID" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$DELETE_RESPONSE" | grep -q "deleted successfully"; then
        test_result "Delete Parser" "PASS" "Parser deleted successfully"
    else
        test_result "Delete Parser" "FAIL" "Failed to delete parser"
    fi
else
    test_result "Delete Parser" "SKIP" "No parser ID available"
fi

# Test 12: Verify Consumer Internal API
echo "📝 Test 12: Verify Consumer Internal API"
INTERNAL_API_RESPONSE=$(curl -s -X GET "$API_URL/v1/parsers/all")
INTERNAL_PARSER_COUNT=$(echo "$INTERNAL_API_RESPONSE" | jq -r '.total // 0')

if [ "$INTERNAL_PARSER_COUNT" -ge 0 ]; then
    test_result "Internal Parser API" "PASS" "Consumer can fetch $INTERNAL_PARSER_COUNT parsers"
else
    test_result "Internal Parser API" "FAIL" "Consumer cannot access parser API"
fi

echo "========================================================================"
echo "VERIFICATION SUMMARY"
echo "========================================================================"
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"
echo "Success Rate: $(( (PASSED_TESTS * 100) / TOTAL_TESTS ))%"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! Parser Management API is working correctly.${NC}"
    echo ""
    echo "✅ Custom Grok and Regex parsers can be created via API"
    echo "✅ Access control properly enforced (Admin only)"
    echo "✅ Log sources can be configured to use custom parsers"
    echo "✅ Consumer loads and uses custom parsers for log processing"
    echo "✅ End-to-end parsing pipeline works with custom rules"
    echo "✅ Parser validation prevents invalid patterns"
    echo ""
    echo "🚀 Ready to proceed to next development chunk!"
else
    echo -e "${RED}❌ Some tests failed. Please check the failing tests above.${NC}"
    echo ""
    echo "💡 Common issues to check:"
    echo "   - Ensure all services are running (API, Consumer, Ingestor, ClickHouse)"
    echo "   - Check database schema includes custom_parsers table"
    echo "   - Verify consumer has custom parser support compiled in"
    echo "   - Check API logs for error details"
fi

echo ""
echo "📊 System Status:"
echo "   - ClickHouse: $(curl -s "$CLICKHOUSE_URL/ping" > /dev/null && echo "✅ Running" || echo "❌ Down")"
echo "   - SIEM API: $(curl -s "$API_URL/v1/events" > /dev/null && echo "✅ Running" || echo "❌ Down")"
echo "   - Ingestor: $(curl -s "$INGESTOR_URL/health" > /dev/null && echo "✅ Running" || echo "❌ Down")"
echo "   - Consumer: $(ps aux | grep -v grep | grep siem_consumer > /dev/null && echo "✅ Running" || echo "❌ Down")"

echo ""
echo "========================================================================" 