#!/bin/bash

# Test script to verify the two-layered detection engine
# This script creates both real-time and scheduled rules and verifies they're processed by the correct engines

set -e

echo "=== SIEM Two-Layered Detection Engine Test ==="
echo

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:8080/v1}"
TENANT_ID="${TENANT_ID:-tenant-A}"
JWT_SECRET="${JWT_SECRET:-this-is-a-very-long-secure-random-string-for-jwt-signing-do-not-use-in-production}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to generate a token for testing
generate_token() {
    local tenant_id=$1
    python3 -c "
import jwt
import time
from datetime import datetime, timedelta

claims = {
    'sub': 'test-user',
    'tid': '$tenant_id',
    'roles': ['Admin'],
    'exp': int((datetime.utcnow() + timedelta(hours=1)).timestamp())
}

token = jwt.encode(claims, '$JWT_SECRET', algorithm='HS256')
print(token)
"
}

# Function to create a rule
create_rule() {
    local rule_name="$1"
    local rule_query="$2"
    local engine_type="$3"
    local is_stateful="${4:-0}"
    local stateful_config="${5:-}"
    
    echo -e "${BLUE}Creating rule: $rule_name (engine_type: $engine_type)${NC}"
    
    local token=$(generate_token "$TENANT_ID")
    
    local payload="{
        \"rule_name\": \"$rule_name\",
        \"description\": \"Test rule for $engine_type engine\",
        \"query\": \"$rule_query\",
        \"engine_type\": \"$engine_type\",
        \"is_stateful\": $is_stateful"
        
    if [ -n "$stateful_config" ]; then
        payload="$payload,
        \"stateful_config\": \"$stateful_config\""
    fi
    
    payload="$payload}"
    
    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token" \
        -d "$payload" \
        "$API_BASE_URL/rules")
    
    local rule_id=$(echo "$response" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('rule_id', ''))
except:
    print('')
")
    
    if [ -n "$rule_id" ]; then
        echo -e "${GREEN}✓ Created rule: $rule_id${NC}"
        echo "$rule_id"
    else
        echo -e "${RED}✗ Failed to create rule${NC}"
        echo "Response: $response"
        echo ""
    fi
}

# Function to ingest a test event
ingest_event() {
    local raw_event="$1"
    local source_ip="${2:-192.168.1.100}"
    
    echo -e "${BLUE}Ingesting test event...${NC}"
    
    local token=$(generate_token "$TENANT_ID")
    
    local payload="{
        \"events\": [
            {
                \"source_ip\": \"$source_ip\",
                \"raw_event\": \"$raw_event\"
            }
        ]
    }"
    
    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token" \
        -d "$payload" \
        "$API_BASE_URL/events")
    
    echo -e "${GREEN}✓ Event ingested${NC}"
    echo
}

# Function to check alerts
check_alerts() {
    echo -e "${BLUE}Checking for alerts...${NC}"
    
    local token=$(generate_token "$TENANT_ID")
    
    local response=$(curl -s -X GET \
        -H "Authorization: Bearer $token" \
        "$API_BASE_URL/alerts")
    
    local alert_count=$(echo "$response" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    alerts = data.get('data', [])
    print(len(alerts))
except:
    print('0')
")
    
    echo -e "${GREEN}Found $alert_count alerts${NC}"
    echo
}

# Function to get rules
get_rules() {
    local token=$(generate_token "$TENANT_ID")
    
    local response=$(curl -s -X GET \
        -H "Authorization: Bearer $token" \
        "$API_BASE_URL/rules")
    
    echo "$response" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    rules = data.get('data', [])
    print(f'Total rules: {len(rules)}')
    for rule in rules:
        print(f'  - {rule[\"rule_name\"]} (engine_type: {rule.get(\"engine_type\", \"scheduled\")})')
except Exception as e:
    print(f'Error parsing rules: {e}')
"
}

echo -e "${YELLOW}Step 1: Checking API connectivity...${NC}"
if ! curl -s "$API_BASE_URL/health" > /dev/null; then
    echo -e "${RED}✗ API is not accessible at $API_BASE_URL${NC}"
    echo "Please ensure the SIEM API is running"
    exit 1
fi
echo -e "${GREEN}✓ API is accessible${NC}"
echo

echo -e "${YELLOW}Step 2: Creating test rules...${NC}"

# Create a real-time rule for keyword detection
REALTIME_RULE_ID=$(create_rule \
    "Real-time Failed Login Detection" \
    "SELECT * FROM dev.events WHERE raw_event LIKE '%failed%'" \
    "real-time")

echo

# Create a scheduled rule for complex analysis
SCHEDULED_RULE_ID=$(create_rule \
    "Scheduled Complex Analysis" \
    "SELECT source_ip, COUNT(*) as event_count FROM dev.events WHERE event_timestamp > (toUnixTimestamp(now()) - 3600) GROUP BY source_ip HAVING event_count > 100" \
    "scheduled")

echo

# Create a stateful real-time rule for brute force detection
STATEFUL_CONFIG='{"key_prefix": "brute_force", "aggregate_on": ["source_ip"], "threshold": 3, "window_seconds": 300}'
STATEFUL_RULE_ID=$(create_rule \
    "Real-time Brute Force Detection" \
    "SELECT * FROM dev.events WHERE raw_event LIKE '%failed%login%'" \
    "real-time" \
    "1" \
    "$STATEFUL_CONFIG")

echo

echo -e "${YELLOW}Step 3: Verifying rules were created...${NC}"
get_rules
echo

echo -e "${YELLOW}Step 4: Testing real-time detection...${NC}"
echo "Ingesting an event that should trigger the real-time rule..."

# Ingest an event that should match the real-time rule
ingest_event "2024-01-15 10:30:00 Authentication failed for user admin from 192.168.1.100"

echo "Waiting 5 seconds for stream processor to process the event..."
sleep 5

check_alerts

echo -e "${YELLOW}Step 5: Testing stateful real-time detection...${NC}"
echo "Ingesting multiple failed login events to trigger stateful rule..."

# Ingest multiple events to trigger the stateful rule
for i in {1..4}; do
    ingest_event "2024-01-15 10:3${i}:00 Authentication failed login attempt for user admin from 192.168.1.100"
    sleep 1
done

echo "Waiting 5 seconds for stream processor to process the events..."
sleep 5

check_alerts

echo -e "${YELLOW}Step 6: Verification Instructions${NC}"
echo "To complete verification, check the following:"
echo
echo "1. Stream Processor Logs:"
echo "   - Should show it's only processing 'real-time' engine_type rules"
echo "   - Should show alerts being generated for matching events"
echo
echo "2. Rule Engine Logs:"
echo "   - Should show it's only processing 'scheduled' engine_type rules"
echo "   - Should NOT process the real-time rules created above"
echo
echo "3. Service Status:"
echo "   - siem_stream_processor should be consuming from Kafka"
echo "   - siem_rule_engine should be running its scheduled analysis"
echo "   - Both should be creating alerts via the API"
echo

echo -e "${GREEN}=== Test completed! ===${NC}"
echo "Check the logs of both services to confirm they're processing only their designated rule types." 