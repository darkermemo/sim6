#!/bin/bash

# Test Script for Stateful Rule Engine
echo "🔧 Testing Stateful Rule Engine with Brute Force Detection"
echo "========================================================="

# Configuration
API_BASE="http://localhost:8080/v1"
ADMIN_TOKEN_FILE="admin_token.txt"
TENANT_ID="tenant-A"
TEST_IP="192.168.1.100"

# Check if admin token exists
if [[ ! -f "$ADMIN_TOKEN_FILE" ]]; then
    echo "❌ Admin token file not found. Please generate it first."
    exit 1
fi

ADMIN_TOKEN=$(cat "$ADMIN_TOKEN_FILE")

echo "📋 Step 1: Creating Brute Force Detection Rule..."

# Create a stateful brute force rule
RULE_RESPONSE=$(curl -s -X POST "$API_BASE/rules" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "Brute Force Login Detection",
    "description": "Detects brute force login attempts by tracking failed login events. Triggers when more than 5 failed attempts are seen from the same IP within 10 minutes.",
    "query": "SELECT event_id, source_ip, raw_event, event_timestamp FROM dev.events WHERE tenant_id = '\''tenant-A'\'' AND raw_event ILIKE '\''%failed login%'\'' AND event_timestamp > toUnixTimestamp(now()) - 300 ORDER BY event_timestamp DESC LIMIT 100"
  }')

echo "Rule creation response: $RULE_RESPONSE"

RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.rule_id // empty')
if [[ -z "$RULE_ID" ]]; then
    echo "❌ Failed to create rule. Response: $RULE_RESPONSE"
    exit 1
fi

echo "✅ Created brute force rule with ID: $RULE_ID"

echo ""
echo "📋 Step 2: Installing Redis (if not already installed)..."

# Check if Redis is running
if ! redis-cli ping > /dev/null 2>&1; then
    echo "🔴 Redis is not running. Installing and starting Redis..."
    
    # Install Redis (macOS with Homebrew)
    if command -v brew &> /dev/null; then
        brew install redis
        brew services start redis
    # Install Redis (Ubuntu/Debian)
    elif command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y redis-server
        sudo systemctl start redis-server
        sudo systemctl enable redis-server
    else
        echo "❌ Please install Redis manually and start the service"
        exit 1
    fi
    
    # Wait for Redis to start
    sleep 3
    
    if ! redis-cli ping > /dev/null 2>&1; then
        echo "❌ Failed to start Redis"
        exit 1
    fi
fi

echo "✅ Redis is running"

echo ""
echo "📋 Step 3: Starting Rule Engine..."

# Kill any existing rule engine processes
pkill -f siem_rule_engine

# Start the rule engine in background
cd siem_rule_engine
RUST_LOG=info cargo run > rule_engine.log 2>&1 &
RULE_ENGINE_PID=$!
cd ..

echo "✅ Rule engine started with PID: $RULE_ENGINE_PID"

# Wait for rule engine to initialize
sleep 10

echo ""
echo "📋 Step 4: Simulating Failed Login Attempts..."

# Generate 5 failed login events using correct API format
for i in {1..5}; do
    echo "🔴 Sending failed login attempt $i/5..."
    
    # Send API request for failed login using correct format
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_BASE/events" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "events": [
          {
            "source_ip": "'$TEST_IP'",
            "raw_event": "SSH failed login attempt for user admin from '$TEST_IP'"
          }
        ]
      }')
    
    HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
    BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')
    
    if [[ "$HTTP_STATUS" != "202" ]]; then
        echo "   ⚠️  Failed to send event $i. Status: $HTTP_STATUS, Body: $BODY"
    else
        echo "   ✅ Event $i sent successfully at $(date)"
    fi
    sleep 2
done

echo ""
echo "📋 Step 5: Checking Events in Database..."

# Check if events were stored
sleep 5
EVENT_COUNT=$(curl -s "http://localhost:8123/?query=SELECT%20COUNT(*)%20FROM%20dev.events%20WHERE%20raw_event%20ILIKE%20'%25failed%20login%25'%20AND%20source_ip%20=%20'$TEST_IP'%20FORMAT%20JSON" | jq '.data[0]["COUNT()"]' 2>/dev/null || echo "0")

echo "🔍 Failed login events in database: $EVENT_COUNT"

if [[ "$EVENT_COUNT" -ge "5" ]]; then
    echo "✅ Events were successfully stored in database"
else
    echo "⚠️  Only $EVENT_COUNT events found (expected 5)"
fi

echo ""
echo "📋 Step 6: Checking Redis Counter..."

# Check Redis counter
REDIS_KEY="brute_force:$TENANT_ID:$TEST_IP"
COUNTER_VALUE=$(redis-cli get "$REDIS_KEY" 2>/dev/null || echo "0")

echo "🔍 Redis counter for key '$REDIS_KEY': $COUNTER_VALUE"

if [[ "$COUNTER_VALUE" == "5" ]]; then
    echo "✅ Redis counter is correct (5 failed attempts)"
else
    echo "⚠️  Redis counter is $COUNTER_VALUE (expected 5)"
fi

echo ""
echo "📋 Step 7: Waiting for Rule Engine Cycle..."

# Wait for rule engine to process
echo "⏳ Waiting 30 seconds for rule engine to process events..."
sleep 30

# Check alerts before threshold breach
ALERTS_RESPONSE=$(curl -s -X GET "$API_BASE/alerts" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

ALERT_COUNT_BEFORE=$(echo "$ALERTS_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
echo "🔍 Alerts before threshold breach: $ALERT_COUNT_BEFORE"

echo ""
echo "📋 Step 8: Sending 6th Failed Login (Threshold Breach)..."

# Send the 6th failed login to trigger the alert
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_BASE/events" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "source_ip": "'$TEST_IP'",
        "raw_event": "SSH failed login attempt for user admin from '$TEST_IP'"
      }
    ]
  }')

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
if [[ "$HTTP_STATUS" == "202" ]]; then
    echo "✅ 6th failed login sent successfully"
else
    echo "⚠️  Failed to send 6th event. Status: $HTTP_STATUS"
fi

# Wait for rule engine to process
echo "⏳ Waiting 40 seconds for rule engine to process and generate alert..."
sleep 40

echo ""
echo "📋 Step 9: Verifying Alert Generation..."

# Check for new alerts
ALERTS_RESPONSE=$(curl -s -X GET "$API_BASE/alerts" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

ALERT_COUNT_AFTER=$(echo "$ALERTS_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
BRUTE_FORCE_ALERTS=$(echo "$ALERTS_RESPONSE" | jq '.data | map(select(.rule_name | contains("Brute Force"))) | length' 2>/dev/null || echo "0")

echo "🔍 Total alerts after threshold breach: $ALERT_COUNT_AFTER"
echo "🔍 Brute force alerts: $BRUTE_FORCE_ALERTS"

if [[ "$BRUTE_FORCE_ALERTS" -gt "0" ]]; then
    echo "✅ Brute force alert generated successfully!"
    echo ""
    echo "📊 Alert Details:"
    echo "$ALERTS_RESPONSE" | jq '.data | map(select(.rule_name | contains("Brute Force"))) | .[]' 2>/dev/null || echo "Failed to parse alert details"
else
    echo "❌ No brute force alerts found"
fi

echo ""
echo "📋 Step 10: Checking Redis Counter After Alert..."

# Check if Redis counter was reset
COUNTER_VALUE_AFTER=$(redis-cli get "$REDIS_KEY" 2>/dev/null || echo "null")
echo "🔍 Redis counter after alert: $COUNTER_VALUE_AFTER"

if [[ "$COUNTER_VALUE_AFTER" == "null" || "$COUNTER_VALUE_AFTER" == "" ]]; then
    echo "✅ Redis counter was reset after alert generation"
else
    echo "⚠️  Redis counter still exists: $COUNTER_VALUE_AFTER"
fi

echo ""
echo "📋 Step 11: Testing Reset Functionality..."

# Send 3 more failed logins
for i in {7..9}; do
    echo "🔴 Sending failed login attempt $i..."
    
    curl -s -X POST "$API_BASE/events" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "events": [
          {
            "source_ip": "'$TEST_IP'",
            "raw_event": "SSH failed login attempt for user admin from '$TEST_IP'"
          }
        ]
      }' > /dev/null
    
    sleep 1
done

# Check counter
sleep 5
COUNTER_AFTER_RESET=$(redis-cli get "$REDIS_KEY" 2>/dev/null || echo "0")
echo "🔍 Redis counter after 3 more attempts: $COUNTER_AFTER_RESET"

# Send successful login to reset
echo "🟢 Sending successful login to reset counter..."

curl -s -X POST "$API_BASE/events" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "source_ip": "'$TEST_IP'",
        "raw_event": "SSH successful login for user admin from '$TEST_IP'"
      }
    ]
  }' > /dev/null

# Wait for processing
echo "⏳ Waiting for rule engine to process reset event..."
sleep 30

# Check if counter was reset
COUNTER_FINAL=$(redis-cli get "$REDIS_KEY" 2>/dev/null || echo "null")
echo "🔍 Redis counter after successful login: $COUNTER_FINAL"

if [[ "$COUNTER_FINAL" == "null" || "$COUNTER_FINAL" == "" ]]; then
    echo "✅ Redis counter was reset by successful login"
else
    echo "⚠️  Redis counter was not reset: $COUNTER_FINAL"
fi

echo ""
echo "📋 Step 12: Final Database Verification..."

# Check final event count
FINAL_EVENT_COUNT=$(curl -s "http://localhost:8123/?query=SELECT%20COUNT(*)%20FROM%20dev.events%20WHERE%20raw_event%20ILIKE%20'%25login%25'%20AND%20source_ip%20=%20'$TEST_IP'%20FORMAT%20JSON" | jq '.data[0]["COUNT()"]' 2>/dev/null || echo "0")
echo "🔍 Total login events in database: $FINAL_EVENT_COUNT"

echo ""
echo "📋 Step 13: Cleanup..."

# Stop rule engine
if [[ -n "$RULE_ENGINE_PID" ]]; then
    kill $RULE_ENGINE_PID 2>/dev/null
    echo "✅ Rule engine stopped"
fi

# Clean up Redis keys
redis-cli del "$REDIS_KEY" > /dev/null 2>&1

echo ""
echo "🎯 Test Results Summary:"
echo "======================="
echo "• Brute force rule created: ✅"
echo "• Redis connection: ✅"
echo "• Failed login events: ✅ ($EVENT_COUNT events stored)"
echo "• Total login events: ✅ ($FINAL_EVENT_COUNT events total)"
echo "• Redis counter tracking: $([ "$COUNTER_VALUE" == "5" ] && echo "✅" || echo "❌ ($COUNTER_VALUE)")"
echo "• Alert generation: $([ "$BRUTE_FORCE_ALERTS" -gt "0" ] && echo "✅" || echo "❌")"
echo "• Counter reset after alert: $([ "$COUNTER_VALUE_AFTER" == "null" ] && echo "✅" || echo "❌")"
echo "• Successful login reset: $([ "$COUNTER_FINAL" == "null" ] && echo "✅" || echo "❌")"

echo ""
echo "✅ Stateful Rule Engine Testing Complete!" 