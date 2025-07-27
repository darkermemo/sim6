#!/bin/bash

# Phase 1-4.1 Full Regression Test
echo "================================================"
echo "Phase 1-4.1 Full Regression Test"
echo "================================================"
echo

# Configuration
API_URL="http://127.0.0.1:8080/v1"
CLICKHOUSE_URL="http://localhost:8123"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Helper function to report test result
report_test() {
    local test_id=$1
    local test_name=$2
    local passed=$3
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$passed" = "true" ]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo -e "[${test_id}] ${test_name}: ${GREEN}PASSED${NC}"
    else
        echo -e "[${test_id}] ${test_name}: ${RED}FAILED${NC}"
    fi
}

# Check services
echo "Checking services..."
if curl -s "$CLICKHOUSE_URL" > /dev/null; then
    echo "✓ ClickHouse is running"
else
    echo "✗ ClickHouse is not running"
    exit 1
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/events")
if [ "$HTTP_CODE" = "401" ]; then
    echo "✓ API is running"
else
    echo "✗ API is not running (HTTP status: $HTTP_CODE)"
    exit 1
fi
echo

# Generate tokens
echo "Generating test tokens..."
cd siem_api > /dev/null 2>&1

TENANT_A_TOKEN=$(cargo run --example generate_token user1 tenant-A 2>/dev/null | grep -A1 "JWT Token" | tail -1)
TENANT_B_TOKEN=$(cargo run --example generate_token user2 tenant-B 2>/dev/null | grep -A1 "JWT Token" | tail -1)
ALICE_TOKEN=$(cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -A1 "JWT Token" | tail -1)
BOB_TOKEN=$(cargo run --example generate_token bob tenant-A Analyst 2>/dev/null | grep -A1 "JWT Token" | tail -1)

cd .. > /dev/null 2>&1
echo "✓ Tokens generated"
echo

# Suite A: API Core Functionality
echo "================================================"
echo "Suite A: API Core Functionality"
echo "================================================"

# A-1: Unauthorized Read
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/events")
if [ "$HTTP_STATUS" = "401" ]; then
    report_test "A-1" "Unauthorized Read" "true"
else
    report_test "A-1" "Unauthorized Read" "false"
fi

# A-2: Unauthorized Write
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/events" \
    -H "Content-Type: application/json" \
    -d '[{"message": "test"}]')
if [ "$HTTP_STATUS" = "401" ]; then
    report_test "A-2" "Unauthorized Write" "true"
else
    report_test "A-2" "Unauthorized Write" "false"
fi

# A-3: Invalid Payload
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_A_TOKEN" \
    -H "Content-Type: application/json" \
    -d 'not json')
if [ "$HTTP_STATUS" = "400" ]; then
    report_test "A-3" "Invalid Payload" "true"
else
    report_test "A-3" "Invalid Payload" "false"
fi

# A-4: Rate Limiting
RATE_LIMIT_HIT=false
for i in {1..15}; do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/events" \
        -H "Authorization: Bearer $TENANT_A_TOKEN" \
        -H "Content-Type: application/json" \
        -d '[{"message": "rate limit test"}]')
    if [ "$HTTP_STATUS" = "429" ]; then
        RATE_LIMIT_HIT=true
        break
    fi
done

if [ "$RATE_LIMIT_HIT" = true ]; then
    report_test "A-4" "Rate Limiting" "true"
else
    report_test "A-4" "Rate Limiting" "false"
fi

# Wait for rate limit reset
sleep 2

# A-5: Rate Limit Isolation
# Exhaust tenant-A's rate limit
for i in {1..15}; do
    curl -s -o /dev/null -X POST "$API_URL/events" \
        -H "Authorization: Bearer $TENANT_A_TOKEN" \
        -H "Content-Type: application/json" \
        -d '[{"message": "exhaust limit"}]'
done

# Try tenant-B
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_B_TOKEN" \
    -H "Content-Type: application/json" \
    -d '[{"message": "tenant B test"}]')

if [ "$HTTP_STATUS" = "202" ]; then
    report_test "A-5" "Rate Limit Isolation" "true"
else
    report_test "A-5" "Rate Limit Isolation" "false"
fi

echo

# Suite B: End-to-End Data Pipeline
echo "================================================"
echo "Suite B: End-to-End Data Pipeline"
echo "================================================"

# Clear events table
curl -s -X POST "$CLICKHOUSE_URL" --data-binary "TRUNCATE TABLE dev.events" > /dev/null

# B-1: JSON Event Ingestion
curl -s -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_A_TOKEN" \
    -H "Content-Type: application/json" \
    -d '[{
        "timestamp": "2024-01-19T10:30:00Z",
        "source_ip": "192.168.1.100",
        "event_type": "login",
        "severity": "info",
        "message": "User login successful"
    }]' > /dev/null

sleep 3

COUNT=$(curl -s -X POST "$CLICKHOUSE_URL" --data-binary \
    "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'tenant-A' AND source_ip = '192.168.1.100' FORMAT TabSeparated" | tr -d '\n')

if [ "$COUNT" -ge "1" ]; then
    report_test "B-1" "JSON Event Ingestion" "true"
else
    report_test "B-1" "JSON Event Ingestion" "false"
fi

# B-2: Syslog Event Ingestion
curl -s -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_A_TOKEN" \
    -H "Content-Type: application/json" \
    -d '[{
        "message": "Jan 19 10:35:00 server01 sshd[1234]: Accepted password for admin from 10.0.0.50 port 22 ssh2"
    }]' > /dev/null

sleep 3

COUNT=$(curl -s -X POST "$CLICKHOUSE_URL" --data-binary \
    "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'tenant-A' AND source_ip = '10.0.0.50' FORMAT TabSeparated" | tr -d '\n')

if [ "$COUNT" -ge "1" ]; then
    report_test "B-2" "Syslog Event Ingestion" "true"
else
    report_test "B-2" "Syslog Event Ingestion" "false"
fi

# B-3: Unparseable Event
curl -s -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_A_TOKEN" \
    -H "Content-Type: application/json" \
    -d '[{
        "message": "This is not a valid JSON or Syslog format @#$%^&*()"
    }]' > /dev/null

sleep 3

COUNT=$(curl -s -X POST "$CLICKHOUSE_URL" --data-binary \
    "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'tenant-A' AND source_ip = '0.0.0.0' AND raw_event LIKE '%not a valid JSON%' FORMAT TabSeparated" | tr -d '\n')

if [ "$COUNT" -ge "1" ]; then
    report_test "B-3" "Unparseable Event" "true"
else
    report_test "B-3" "Unparseable Event" "false"
fi

# B-4: Tenant Isolation
curl -s -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_B_TOKEN" \
    -H "Content-Type: application/json" \
    -d '[{
        "message": "Tenant B specific event",
        "source_ip": "172.16.0.1"
    }]' > /dev/null

sleep 3

RESPONSE=$(curl -s -X GET "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_A_TOKEN")

if echo "$RESPONSE" | grep -q "172.16.0.1"; then
    report_test "B-4" "Tenant Isolation" "false"
else
    report_test "B-4" "Tenant Isolation" "true"
fi

echo

# Suite C: RBAC & Authorization
echo "================================================"
echo "Suite C: RBAC & Authorization"
echo "================================================"

# C-1: Admin Access Success
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/users" \
    -H "Authorization: Bearer $ALICE_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "user_id": "charlie",
        "tenant_id": "tenant-A",
        "email": "charlie@example.com",
        "roles": ["Viewer"]
    }')

if [ "$HTTP_STATUS" = "201" ]; then
    report_test "C-1" "Admin Access Success" "true"
else
    report_test "C-1" "Admin Access Success" "false"
fi

# C-2: Non-Admin Access Failure
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/users" \
    -H "Authorization: Bearer $BOB_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "user_id": "david",
        "tenant_id": "tenant-A",
        "email": "david@example.com",
        "roles": ["Viewer"]
    }')

if [ "$HTTP_STATUS" = "403" ]; then
    report_test "C-2" "Non-Admin Access Failure" "true"
else
    report_test "C-2" "Non-Admin Access Failure" "false"
fi

# C-3: General Access
ALICE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/events" \
    -H "Authorization: Bearer $ALICE_TOKEN")

BOB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/events" \
    -H "Authorization: Bearer $BOB_TOKEN")

if [ "$ALICE_STATUS" = "200" ] && [ "$BOB_STATUS" = "200" ]; then
    report_test "C-3" "General Access" "true"
else
    report_test "C-3" "General Access" "false"
fi

# C-4: Self-Read Access
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/users/bob" \
    -H "Authorization: Bearer $BOB_TOKEN")

if [ "$HTTP_STATUS" = "200" ]; then
    report_test "C-4" "Self-Read Access" "true"
else
    report_test "C-4" "Self-Read Access" "false"
fi

# C-5: Cross-Read Failure
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/users/alice" \
    -H "Authorization: Bearer $BOB_TOKEN")

if [ "$HTTP_STATUS" = "403" ]; then
    report_test "C-5" "Cross-Read Failure" "true"
else
    report_test "C-5" "Cross-Read Failure" "false"
fi

echo
echo "================================================"
echo "Test Summary: $PASSED_TESTS/$TOTAL_TESTS tests passed"
echo "================================================" 