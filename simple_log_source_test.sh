#!/bin/bash

# Simple Log Source Management Test
echo "========================================================================"
echo "Log Source Management Simple Verification"
echo "========================================================================"

# Generate token
ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -A1 'JWT Token' | tail -1)

echo "✓ Generated Admin token"

# Test 1: List log sources
echo "Testing log source listing..."
LIST_RESULT=$(curl -s -X GET "http://localhost:8080/v1/log_sources" -H "Authorization: Bearer $ADMIN_TOKEN")
echo "List result: $LIST_RESULT"

# Test 2: Create log source
echo "Testing log source creation..."
CREATE_RESULT=$(curl -s -X POST "http://localhost:8080/v1/log_sources" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"source_name": "Test Syslog Server", "source_type": "Syslog", "source_ip": "10.10.10.10"}')
echo "Create result: $CREATE_RESULT"

SOURCE_ID=$(echo "$CREATE_RESULT" | jq -r '.source_id // empty' 2>/dev/null)
echo "Source ID: $SOURCE_ID"

# Test 3: Lookup by IP
echo "Testing IP-based lookup..."
LOOKUP_RESULT=$(curl -s -X GET "http://localhost:8080/v1/log_sources/by_ip/10.10.10.10")
echo "Lookup result: $LOOKUP_RESULT"

# Test 4: Send events
echo "Testing event ingestion with configured source..."
CONFIGURED_EVENT='{"events": [{"source_ip": "10.10.10.10", "raw_event": "<134>Oct 11 22:14:15 mymachine su: configured event"}]}'
EVENT_RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:8080/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CONFIGURED_EVENT")
echo "Configured event ingestion result: $EVENT_RESULT"

echo "Testing event ingestion with unconfigured source..."
UNCONFIGURED_EVENT='{"events": [{"source_ip": "10.10.10.11", "raw_event": "<134>Oct 11 22:14:15 anothermachine su: unconfigured event"}]}'
UNCONFIG_RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:8080/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$UNCONFIGURED_EVENT")
echo "Unconfigured event ingestion result: $UNCONFIG_RESULT"

# Test 5: Consumer test (simplified)
echo "Testing consumer with log source lookup..."
cd siem_consumer
timeout 15s bash -c 'RUST_LOG=info API_URL=http://localhost:8080 cargo run' > consumer_test.log 2>&1 &
CONSUMER_PID=$!
cd ..

# Give consumer time to start and fetch log source configurations
sleep 5

# Send test events
echo "Sending test events to trigger consumer processing..."
curl -s -X POST "http://localhost:8080/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"events": [{"source_ip": "10.10.10.10", "raw_event": "<134>Oct 11 22:15:15 mymachine test: configured source event"}]}' > /dev/null

curl -s -X POST "http://localhost:8080/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"events": [{"source_ip": "10.10.10.11", "raw_event": "<134>Oct 11 22:15:15 anothermachine test: unconfigured source event"}]}' > /dev/null

# Wait for processing
sleep 5

# Stop consumer
kill $CONSUMER_PID 2>/dev/null || true

echo "Consumer log analysis:"
if [ -f "siem_consumer/consumer_test.log" ]; then
    echo "--- Last 20 lines of consumer log ---"
    tail -20 siem_consumer/consumer_test.log
    
    echo ""
    echo "Checking for specific patterns..."
    if grep -q "Found configuration for 10.10.10.10" siem_consumer/consumer_test.log; then
        echo "✓ Consumer found configuration for 10.10.10.10"
    else
        echo "✗ Consumer did not find configuration for 10.10.10.10"
    fi
    
    if grep -q "No configuration found for 10.10.10.11" siem_consumer/consumer_test.log || \
       grep -q "trying all parsers" siem_consumer/consumer_test.log; then
        echo "✓ Consumer correctly handled unconfigured source"
    else
        echo "✗ Consumer did not properly handle unconfigured source"
    fi
    
    rm -f siem_consumer/consumer_test.log
else
    echo "✗ Consumer log file not found"
fi

# Cleanup
if [ -n "$SOURCE_ID" ]; then
    echo "Cleaning up: deleting test log source..."
    DELETE_RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "http://localhost:8080/v1/log_sources/$SOURCE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    echo "Delete result: $DELETE_RESULT"
fi

echo ""
echo "========================================================================"
echo "Log Source Management Verification Complete"
echo "========================================================================" 