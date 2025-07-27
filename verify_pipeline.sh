#!/bin/bash

echo "========================================================================"
echo "PIPELINE VERIFICATION SCRIPT"
echo "========================================================================"

# Generate unique test message
TIMESTAMP=$(date +%s)
TEST_MESSAGE="PIPELINE_TEST_${TIMESTAMP}_UNIQUE"

echo "1. Testing Ingestor Health:"
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8081/health")
if [ "$HEALTH_STATUS" = "200" ]; then
    echo "   ✓ Ingestor service is healthy"
else
    echo "   ✗ Ingestor service health check failed (status: $HEALTH_STATUS)"
    exit 1
fi

echo ""
echo "2. Testing HTTP Ingestion:"
HTTP_RESPONSE=$(curl -s -X POST --data "$TEST_MESSAGE" "http://localhost:8081/ingest/raw")
echo "   Response: $HTTP_RESPONSE"

echo ""
echo "3. Testing UDP Syslog Ingestion:"
echo "<34>Oct 20 16:00:00 testhost auth: $TEST_MESSAGE" | nc -u -w0 127.0.0.1 5140
echo "   ✓ UDP message sent"

echo ""
echo "4. Waiting for processing (10 seconds)..."
sleep 10

echo ""
echo "5. Checking database for messages:"

# Check for HTTP message
HTTP_COUNT=$(curl -s -X POST "http://localhost:8123" --data "SELECT COUNT(*) as count FROM dev.events WHERE raw_event LIKE '%$TEST_MESSAGE%' FORMAT JSON" | jq -r '.data[0].count // 0' 2>/dev/null)

echo "   Messages containing '$TEST_MESSAGE': $HTTP_COUNT"

if [ "$HTTP_COUNT" -gt "0" ]; then
    echo "   ✓ PIPELINE IS WORKING - Messages found in database!"
    
    # Show recent events
    echo ""
    echo "6. Recent events in database:"
    curl -s -X POST "http://localhost:8123" --data "SELECT raw_event, event_category, created_at FROM dev.events ORDER BY created_at DESC LIMIT 5 FORMAT JSONEachRow" | while read line; do
        if [ -n "$line" ]; then
            echo "   - $(echo $line | jq -r '.raw_event // "N/A"') [$(echo $line | jq -r '.event_category // "Unknown"')]"
        fi
    done
else
    echo "   ✗ PIPELINE ISSUE - No messages found in database"
    
    echo ""
    echo "   Diagnostic information:"
    echo "   - Checking if consumer is running:"
    ps aux | grep siem_consumer | grep -v grep | wc -l | xargs -I {} echo "     Consumer processes: {}"
    
    echo "   - Checking recent events in database:"
    TOTAL_EVENTS=$(curl -s -X POST "http://localhost:8123" --data "SELECT COUNT(*) as count FROM dev.events FORMAT JSON" | jq -r '.data[0].count // 0' 2>/dev/null)
    echo "     Total events in database: $TOTAL_EVENTS"
    
    echo ""
    echo "   Possible issues:"
    echo "   - Consumer may not be processing messages"
    echo "   - Kafka connectivity issues"
    echo "   - Database connection problems"
fi

echo ""
echo "========================================================================"
echo "End of Pipeline Verification"
echo "========================================================================" 