#!/bin/bash

# Suite B: End-to-End Data Pipeline Tests Only

echo "================================================"
echo "Suite B: End-to-End Data Pipeline Tests"
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

# Check ClickHouse
if curl -s "$CLICKHOUSE_URL" > /dev/null; then
    echo "✓ ClickHouse is running"
else
    echo "✗ ClickHouse is not running"
    exit 1
fi

# Check API
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/events")
if [ "$HTTP_CODE" = "401" ]; then
    echo "✓ API is running"
else
    echo "✗ API is not running (HTTP status: $HTTP_CODE)"
    exit 1
fi

# Check Kafka
if nc -zv localhost 9092 2>&1 | grep -q "succeeded"; then
    echo "✓ Kafka is running"
else
    echo "⚠️  WARNING: Kafka is not running - tests will likely fail"
fi

# Check consumer
if ps aux | grep -v grep | grep -q siem_consumer; then
    echo "✓ Consumer is running"
else
    echo "⚠️  WARNING: Consumer is not running - attempting to start"
    cd ../siem_consumer && RUST_LOG=info cargo run > consumer.log 2>&1 &
    CONSUMER_PID=$!
    echo "  Started consumer with PID: $CONSUMER_PID"
    sleep 3
    cd ../sim6
fi

echo

# Generate tokens
echo "Generating test tokens..."
cd siem_api > /dev/null 2>&1

TENANT_A_TOKEN=$(cargo run --example generate_token user1 tenant-A 2>/dev/null | grep -A1 "JWT Token" | tail -1)
TENANT_B_TOKEN=$(cargo run --example generate_token user2 tenant-B 2>/dev/null | grep -A1 "JWT Token" | tail -1)

cd .. > /dev/null 2>&1
echo "✓ Tokens generated"
echo

# Clear events table
echo "Clearing events table..."
curl -s -X POST "$CLICKHOUSE_URL" --data-binary "TRUNCATE TABLE dev.events" > /dev/null

# B-1: JSON Event Ingestion
echo -n "Testing [B-1] JSON Event Ingestion... "
curl -s -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_A_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "events": [{
            "source_ip": "192.168.1.100",
            "raw_event": "{\"timestamp\":\"2024-01-19T10:30:00Z\",\"event_type\":\"login\",\"severity\":\"info\",\"message\":\"User login successful\"}"
        }]
    }' > /dev/null

sleep 5  # Increased wait time

COUNT=$(curl -s -X POST "$CLICKHOUSE_URL" --data-binary \
    "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'tenant-A' AND source_ip = '192.168.1.100' FORMAT TabSeparated" | tr -d '\n')

if [ "$COUNT" -ge "1" ]; then
    report_test "B-1" "JSON Event Ingestion" "true"
else
    report_test "B-1" "JSON Event Ingestion" "false"
    echo "  Debug: Expected at least 1 event, got $COUNT"
    echo "  Checking all events for tenant-A:"
    curl -s -X POST "$CLICKHOUSE_URL" --data-binary \
        "SELECT source_ip, raw_event FROM dev.events WHERE tenant_id = 'tenant-A' FORMAT JSONEachRow" | jq .
fi

# B-2: Syslog Event Ingestion
echo -n "Testing [B-2] Syslog Event Ingestion... "
curl -s -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_A_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "events": [{
            "source_ip": "10.0.0.50",
            "raw_event": "Jan 19 10:35:00 server01 sshd[1234]: Accepted password for admin from 10.0.0.50 port 22 ssh2"
        }]
    }' > /dev/null

sleep 5

COUNT=$(curl -s -X POST "$CLICKHOUSE_URL" --data-binary \
    "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'tenant-A' AND source_ip = '10.0.0.50' FORMAT TabSeparated" | tr -d '\n')

if [ "$COUNT" -ge "1" ]; then
    report_test "B-2" "Syslog Event Ingestion" "true"
else
    report_test "B-2" "Syslog Event Ingestion" "false"
    echo "  Debug: Expected at least 1 event, got $COUNT"
fi

# B-3: Unparseable Event
echo -n "Testing [B-3] Unparseable Event... "
curl -s -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_A_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "events": [{
            "source_ip": "0.0.0.0",
            "raw_event": "This is not a valid JSON or Syslog format @#$%^&*()"
        }]
    }' > /dev/null

sleep 5

COUNT=$(curl -s -X POST "$CLICKHOUSE_URL" --data-binary \
    "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'tenant-A' AND source_ip = '0.0.0.0' AND raw_event LIKE '%not a valid JSON%' FORMAT TabSeparated" | tr -d '\n')

if [ "$COUNT" -ge "1" ]; then
    report_test "B-3" "Unparseable Event" "true"
else
    report_test "B-3" "Unparseable Event" "false"
    echo "  Debug: Expected at least 1 unparsed event, got $COUNT"
fi

# B-4: Tenant Isolation
echo -n "Testing [B-4] Tenant Isolation... "
curl -s -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_B_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "events": [{
            "source_ip": "172.16.0.1",
            "raw_event": "Tenant B specific event"
        }]
    }' > /dev/null

sleep 5

RESPONSE=$(curl -s -X GET "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_A_TOKEN")

if echo "$RESPONSE" | grep -q "172.16.0.1"; then
    report_test "B-4" "Tenant Isolation" "false"
    echo "  Debug: Tenant A can see Tenant B events!"
else
    report_test "B-4" "Tenant Isolation" "true"
fi

echo
echo "================================================"
echo "Test Summary: $PASSED_TESTS/$TOTAL_TESTS tests passed"
echo "================================================"
echo

# Show total event count
TOTAL_EVENTS=$(curl -s -X POST "$CLICKHOUSE_URL" --data-binary \
    "SELECT COUNT(*) FROM dev.events FORMAT TabSeparated" | tr -d '\n')
echo "Total events in database: $TOTAL_EVENTS"

# If consumer was started by this script, offer to stop it
if [ ! -z "$CONSUMER_PID" ]; then
    echo
    echo "Consumer was started with PID $CONSUMER_PID"
    echo "Run 'kill $CONSUMER_PID' to stop it when done"
fi 