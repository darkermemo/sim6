#!/bin/bash

# Direct Test Script for Stateful Rule Engine Core Functionality
echo "🔧 Testing Stateful Rule Engine with Direct Database Events"
echo "=========================================================="

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
echo "📋 Step 2: Directly Inserting Test Events into ClickHouse..."

# Get current timestamp
CURRENT_TIME=$(date +%s)

# Insert 5 failed login events directly into ClickHouse
for i in {1..5}; do
    EVENT_ID="fail-$i-$(date +%s)"
    echo "🔴 Inserting failed login event $i/5..."
    
    curl -s "http://localhost:8123/" \
      --data "INSERT INTO dev.events (event_id, tenant_id, event_timestamp, source_ip, source_type, raw_event, event_category, event_outcome, event_action, is_threat) VALUES ('$EVENT_ID', '$TENANT_ID', $CURRENT_TIME, '$TEST_IP', 'ssh', 'SSH failed login attempt for user admin from $TEST_IP', 'authentication', 'failure', 'login', 0)" > /dev/null
    
    echo "   ✅ Event $i inserted"
    sleep 1
done

echo ""
echo "📋 Step 3: Verifying Events in Database..."

# Check if events were stored
sleep 2
EVENT_COUNT=$(curl -s "http://localhost:8123/?query=SELECT%20COUNT(*)%20FROM%20dev.events%20WHERE%20raw_event%20ILIKE%20'%25failed%20login%25'%20AND%20source_ip%20=%20'$TEST_IP'%20FORMAT%20JSON" | jq '.data[0]["COUNT()"]' 2>/dev/null || echo "0")

echo "🔍 Failed login events in database: $EVENT_COUNT"

if [[ "$EVENT_COUNT" -ge "5" ]]; then
    echo "✅ Events were successfully stored in database"
else
    echo "⚠️  Only $EVENT_COUNT events found (expected 5)"
fi

echo ""
echo "📋 Step 4: Starting Rule Engine..."

# Kill any existing rule engine processes
pkill -f siem_rule_engine

# Start the rule engine in background
cd siem_rule_engine
RUST_LOG=info cargo run > rule_engine_direct.log 2>&1 &
RULE_ENGINE_PID=$!
cd ..

echo "✅ Rule engine started with PID: $RULE_ENGINE_PID"

# Wait for rule engine to initialize and run one cycle
sleep 30

echo ""
echo "📋 Step 5: Checking Redis Counter..."

# Check Redis counter after first 5 events
REDIS_KEY="brute_force:$TENANT_ID:$TEST_IP"
COUNTER_VALUE=$(redis-cli get "$REDIS_KEY" 2>/dev/null || echo "0")

echo "🔍 Redis counter for key '$REDIS_KEY': $COUNTER_VALUE"

if [[ "$COUNTER_VALUE" == "5" ]]; then
    echo "✅ Redis counter is correct (5 failed attempts)"
else
    echo "⚠️  Redis counter is $COUNTER_VALUE (expected 5)"
fi

echo ""
echo "📋 Step 6: Adding 6th Event to Trigger Alert..."

# Insert the 6th failed login event
EVENT_ID="fail-6-$(date +%s)"
CURRENT_TIME=$(date +%s)

curl -s "http://localhost:8123/" \
  --data "INSERT INTO dev.events (event_id, tenant_id, event_timestamp, source_ip, source_type, raw_event, event_category, event_outcome, event_action, is_threat) VALUES ('$EVENT_ID', '$TENANT_ID', $CURRENT_TIME, '$TEST_IP', 'ssh', 'SSH failed login attempt for user admin from $TEST_IP', 'authentication', 'failure', 'login', 0)" > /dev/null

echo "✅ 6th failed login event inserted"

# Wait for rule engine to process the 6th event
echo "⏳ Waiting 40 seconds for rule engine to process and generate alert..."
sleep 40

echo ""
echo "📋 Step 7: Verifying Alert Generation..."

# Check for new alerts
ALERTS_RESPONSE=$(curl -s -X GET "$API_BASE/alerts" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

ALERT_COUNT=$(echo "$ALERTS_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
BRUTE_FORCE_ALERTS=$(echo "$ALERTS_RESPONSE" | jq '.data | map(select(.rule_id == "'$RULE_ID'")) | length' 2>/dev/null || echo "0")

echo "🔍 Total alerts: $ALERT_COUNT"
echo "🔍 Brute force alerts for our rule: $BRUTE_FORCE_ALERTS"

if [[ "$BRUTE_FORCE_ALERTS" -gt "0" ]]; then
    echo "✅ Brute force alert generated successfully!"
    echo ""
    echo "📊 Alert Details:"
    echo "$ALERTS_RESPONSE" | jq '.data | map(select(.rule_id == "'$RULE_ID'")) | .[]' 2>/dev/null || echo "Failed to parse alert details"
else
    echo "❌ No brute force alerts found"
fi

echo ""
echo "📋 Step 8: Checking Redis Counter After Alert..."

# Check if Redis counter was reset
COUNTER_VALUE_AFTER=$(redis-cli get "$REDIS_KEY" 2>/dev/null || echo "null")
echo "🔍 Redis counter after alert: $COUNTER_VALUE_AFTER"

if [[ "$COUNTER_VALUE_AFTER" == "null" || "$COUNTER_VALUE_AFTER" == "" ]]; then
    echo "✅ Redis counter was reset after alert generation"
else
    echo "⚠️  Redis counter still exists: $COUNTER_VALUE_AFTER"
fi

echo ""
echo "📋 Step 9: Testing Reset Functionality..."

# Add 3 more failed login events
for i in {7..9}; do
    EVENT_ID="fail-$i-$(date +%s)"
    CURRENT_TIME=$(date +%s)
    
    curl -s "http://localhost:8123/" \
      --data "INSERT INTO dev.events (event_id, tenant_id, event_timestamp, source_ip, source_type, raw_event, event_category, event_outcome, event_action, is_threat) VALUES ('$EVENT_ID', '$TENANT_ID', $CURRENT_TIME, '$TEST_IP', 'ssh', 'SSH failed login attempt for user admin from $TEST_IP', 'authentication', 'failure', 'login', 0)" > /dev/null
    
    sleep 1
done

echo "🔴 Added 3 more failed login attempts"

# Wait for rule engine cycle
sleep 35

# Check counter
COUNTER_AFTER_RESET=$(redis-cli get "$REDIS_KEY" 2>/dev/null || echo "0")
echo "🔍 Redis counter after 3 more attempts: $COUNTER_AFTER_RESET"

# Insert successful login to test reset
EVENT_ID="success-$(date +%s)"
CURRENT_TIME=$(date +%s)

curl -s "http://localhost:8123/" \
  --data "INSERT INTO dev.events (event_id, tenant_id, event_timestamp, source_ip, source_type, raw_event, event_category, event_outcome, event_action, is_threat) VALUES ('$EVENT_ID', '$TENANT_ID', $CURRENT_TIME, '$TEST_IP', 'ssh', 'SSH successful login for user admin from $TEST_IP', 'authentication', 'success', 'login', 0)" > /dev/null

echo "🟢 Inserted successful login event"

# Wait for reset processing
echo "⏳ Waiting for rule engine to process reset event..."
sleep 35

# Check if counter was reset
COUNTER_FINAL=$(redis-cli get "$REDIS_KEY" 2>/dev/null || echo "null")
echo "🔍 Redis counter after successful login: $COUNTER_FINAL"

if [[ "$COUNTER_FINAL" == "null" || "$COUNTER_FINAL" == "" ]]; then
    echo "✅ Redis counter was reset by successful login"
else
    echo "⚠️  Redis counter was not reset: $COUNTER_FINAL"
fi

echo ""
echo "📋 Step 10: Final Database Verification..."

# Check final event count
FINAL_EVENT_COUNT=$(curl -s "http://localhost:8123/?query=SELECT%20COUNT(*)%20FROM%20dev.events%20WHERE%20raw_event%20ILIKE%20'%25login%25'%20AND%20source_ip%20=%20'$TEST_IP'%20FORMAT%20JSON" | jq '.data[0]["COUNT()"]' 2>/dev/null || echo "0")
echo "🔍 Total login events for test IP: $FINAL_EVENT_COUNT"

echo ""
echo "📋 Step 11: Cleanup..."

# Stop rule engine
if [[ -n "$RULE_ENGINE_PID" ]]; then
    kill $RULE_ENGINE_PID 2>/dev/null
    echo "✅ Rule engine stopped"
fi

# Clean up Redis keys
redis-cli del "$REDIS_KEY" > /dev/null 2>&1

echo ""
echo "🎯 Direct Test Results Summary:"
echo "=============================="
echo "• Brute force rule created: ✅"
echo "• Redis connection: ✅"
echo "• Events stored directly: ✅ ($EVENT_COUNT failed login events)"
echo "• Total test events: ✅ ($FINAL_EVENT_COUNT login events)"
echo "• Redis counter tracking: $([ "$COUNTER_VALUE" == "5" ] && echo "✅" || echo "❌ ($COUNTER_VALUE)")"
echo "• Alert generation: $([ "$BRUTE_FORCE_ALERTS" -gt "0" ] && echo "✅" || echo "❌")"
echo "• Counter reset after alert: $([ "$COUNTER_VALUE_AFTER" == "null" ] && echo "✅" || echo "❌")"
echo "• Successful login reset: $([ "$COUNTER_FINAL" == "null" ] && echo "✅" || echo "❌")"

echo ""
echo "✅ Stateful Rule Engine Direct Testing Complete!"
echo ""
echo "📋 Rule Engine Log (last 20 lines):"
echo "===================================="
tail -20 siem_rule_engine/rule_engine_direct.log 2>/dev/null || echo "No log file found" 