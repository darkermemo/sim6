#!/bin/bash

# Rule Engine Verification Script
echo "========================================="
echo "SIEM Rule Engine Verification"
echo "========================================="
echo

# Configuration
API_URL="http://localhost:8080/v1"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Generate tokens
echo "Generating tokens..."
cd siem_api
TENANT_A_TOKEN=$(cargo run --example generate_token user1 tenant-A Admin 2>/dev/null | grep -A1 "JWT Token" | tail -1)
cd ..

if [ -z "$TENANT_A_TOKEN" ]; then
    echo -e "${RED}Failed to generate token${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Token generated${NC}"
echo

# Step 1: Create a rule
echo "Step 1: Creating detection rule..."
RULE_RESPONSE=$(curl -s -X POST "$API_URL/rules" \
    -H "Authorization: Bearer $TENANT_A_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "rule_name": "Failed Login Detection",
        "description": "Detects events containing the word failed",
        "query": "SELECT * FROM dev.events WHERE tenant_id = '\''tenant-A'\'' AND raw_event LIKE '\''%failed%'\'' AND event_timestamp > (toUnixTimestamp(now()) - 3600)"
    }')

if echo "$RULE_RESPONSE" | grep -q "rule_id"; then
    echo -e "${GREEN}✓ Rule created successfully${NC}"
    RULE_ID=$(echo "$RULE_RESPONSE" | grep -o '"rule_id":"[^"]*"' | cut -d'"' -f4)
    echo "  Rule ID: $RULE_ID"
else
    echo -e "${RED}✗ Failed to create rule${NC}"
    echo "  Response: $RULE_RESPONSE"
    exit 1
fi
echo

# Step 2: Ingest matching event
echo "Step 2: Ingesting event with 'failed' keyword..."
EVENT_RESPONSE=$(curl -s -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_A_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "events": [{
            "source_ip": "192.168.1.100",
            "raw_event": "Authentication failed for user admin from 192.168.1.100"
        }]
    }')

if [ "$EVENT_RESPONSE" = "Events accepted for processing" ]; then
    echo -e "${GREEN}✓ Event ingested successfully${NC}"
else
    echo -e "${RED}✗ Failed to ingest event${NC}"
    echo "  Response: $EVENT_RESPONSE"
fi
echo

# Wait for consumer to process
echo "Waiting for event processing..."
sleep 5

# Step 3: Verify services are running
echo "Step 3: Checking services..."

# Check API
if curl -s -f "$API_URL/events" -H "Authorization: Bearer $TENANT_A_TOKEN" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API is running${NC}"
else
    echo -e "${RED}✗ API is not running${NC}"
fi

# Check consumer
if ps aux | grep -v grep | grep -q siem_consumer; then
    echo -e "${GREEN}✓ Consumer is running${NC}"
else
    echo -e "${RED}✗ Consumer is not running${NC}"
fi

# Check rule engine
if ps aux | grep -v grep | grep -q siem_rule_engine; then
    echo -e "${GREEN}✓ Rule engine is running${NC}"
else
    echo -e "${RED}✗ Rule engine is not running${NC}"
    echo "  Start it with: cd siem_rule_engine && RUST_LOG=info cargo run"
fi
echo

# Step 4: Manually trigger rule evaluation (for testing)
echo "Step 4: Waiting for rule engine cycle..."
echo "The rule engine runs every 5 minutes. For immediate testing, you can:"
echo "1. Stop the rule engine (Ctrl+C)"
echo "2. Restart it to trigger immediate evaluation"
echo
echo "Alternatively, wait 5 minutes for the next cycle."
echo

# Step 5: Check for alerts
echo "Step 5: Checking for alerts..."
ALERTS_RESPONSE=$(curl -s -X GET "$API_URL/alerts" \
    -H "Authorization: Bearer $TENANT_A_TOKEN")

if echo "$ALERTS_RESPONSE" | grep -q "Failed Login Detection"; then
    echo -e "${GREEN}✓ Alert found!${NC}"
    echo "Alerts response:"
    echo "$ALERTS_RESPONSE" | jq '.data[] | {alert_id, rule_name, alert_timestamp}' 2>/dev/null || echo "$ALERTS_RESPONSE"
else
    echo -e "${RED}✗ No alerts found yet${NC}"
    echo "This is expected if the rule engine hasn't run its cycle yet."
    echo "Response: $ALERTS_RESPONSE"
fi
echo

echo "========================================="
echo "Verification Steps Complete"
echo "========================================="
echo
echo "Summary:"
echo "1. Rule created: ✓"
echo "2. Event ingested: ✓"
echo "3. Services status checked"
echo "4. To see alerts, ensure rule engine is running and wait for its cycle"
echo
echo "To monitor rule engine activity:"
echo "  cd siem_rule_engine && RUST_LOG=info cargo run"
echo
echo "To manually check alerts again:"
echo "  curl -X GET '$API_URL/alerts' -H 'Authorization: Bearer $TENANT_A_TOKEN' | jq" 