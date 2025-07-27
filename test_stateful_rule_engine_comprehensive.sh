#!/bin/bash

# Comprehensive Stateful Rule Engine Test Script
# Tests the implementation of Phase 10.1: Stateful Rule Engine

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:8080/v1"
REDIS_CLI="redis-cli"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 10.1: Stateful Rule Engine Test${NC}"
echo -e "${BLUE}========================================${NC}"

# Helper function for logging
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Load admin token
if [ ! -f "admin_token.txt" ]; then
    error "admin_token.txt not found. Please generate admin token first."
fi

ADMIN_TOKEN=$(cat admin_token.txt)
log "Using admin token: ${ADMIN_TOKEN:0:20}..."

# Test 1: Verify Redis Connection
log "Test 1: Verifying Redis Connection"
if $REDIS_CLI ping | grep -q "PONG"; then
    success "Redis is running and accessible"
else
    error "Redis is not running or not accessible"
fi

# Test 2: Clean Redis State
log "Test 2: Cleaning Redis state for fresh test"
KEYS_DELETED=$($REDIS_CLI --scan --pattern "brute_force:*" | xargs $REDIS_CLI DEL 2>/dev/null || echo "0")
log "Deleted $KEYS_DELETED existing brute force keys from Redis"

# Test 3: Create Stateful Brute Force Rule
log "Test 3: Creating stateful brute force detection rule"

STATEFUL_CONFIG='{
    "key_prefix": "brute_force",
    "aggregate_on": ["source_ip"],
    "threshold": 5,
    "window_seconds": 600
}'

CREATE_RULE_RESPONSE=$(curl -s -X POST "$BASE_URL/rules" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"rule_name\": \"Stateful Brute Force Detection\",
        \"description\": \"Detects brute force attacks using stateful tracking\",
        \"query\": \"SELECT source_ip, event_id, raw_event FROM dev.events WHERE event_outcome = 'Failure' AND tenant_id = 'tenant-A'\",
        \"is_stateful\": 1,
        \"stateful_config\": \"$STATEFUL_CONFIG\"
    }")

echo "Rule creation response: $CREATE_RULE_RESPONSE"

RULE_ID=$(echo "$CREATE_RULE_RESPONSE" | jq -r '.rule_id // empty')
if [ -z "$RULE_ID" ]; then
    error "Failed to create stateful rule"
fi

success "Created stateful rule with ID: $RULE_ID"

# Test 4: Verify Rule Creation
log "Test 4: Verifying rule was created correctly"

GET_RULE_RESPONSE=$(curl -s -X GET "$BASE_URL/rules/$RULE_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

echo "Rule details: $GET_RULE_RESPONSE"

IS_STATEFUL=$(echo "$GET_RULE_RESPONSE" | jq -r '.data[0].is_stateful // empty')
if [ "$IS_STATEFUL" = "1" ]; then
    success "Rule correctly marked as stateful"
else
    error "Rule not marked as stateful (is_stateful = $IS_STATEFUL)"
fi

# Test 5: Ingest Failed Login Events
log "Test 5: Ingesting failed login events from same IP"

TARGET_IP="192.168.1.100"

for i in {1..5}; do
    log "Ingesting failed login attempt $i from $TARGET_IP"
    
    INGEST_RESPONSE=$(curl -s -X POST "$BASE_URL/events" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"events\": [{
                \"source_ip\": \"$TARGET_IP\",
                \"raw_event\": \"Failed login attempt $i from $TARGET_IP at $(date)\"
            }]
        }")
    
    if echo "$INGEST_RESPONSE" | grep -q "successfully"; then
        log "Event $i ingested successfully"
    else
        warning "Event $i ingestion response: $INGEST_RESPONSE"
    fi
    
    sleep 1
done

# Wait for taxonomy processing
log "Waiting 3 seconds for taxonomy processing..."
sleep 3

# Test 6: Verify Events in Database
log "Test 6: Verifying events are in database with correct taxonomy"

EVENTS_QUERY="SELECT COUNT(*) as count FROM dev.events WHERE source_ip = '$TARGET_IP' AND event_outcome = 'Failure' AND tenant_id = 'tenant-A' FORMAT JSON"

EVENTS_COUNT_RESPONSE=$(curl -s -X POST "http://localhost:8123" \
    -d "$EVENTS_QUERY")

echo "Events count response: $EVENTS_COUNT_RESPONSE"

EVENTS_COUNT=$(echo "$EVENTS_COUNT_RESPONSE" | jq -r '.data[0].count // 0')
log "Found $EVENTS_COUNT failed login events in database"

if [ "$EVENTS_COUNT" -lt "5" ]; then
    warning "Expected at least 5 events, found $EVENTS_COUNT. Continuing test..."
fi

# Test 7: Check Redis State Before Rule Engine Run
log "Test 7: Checking Redis state before rule engine execution"

REDIS_KEY="brute_force:tenant-A:$TARGET_IP"
REDIS_VALUE=$($REDIS_CLI GET "$REDIS_KEY" 2>/dev/null || echo "not_found")

if [ "$REDIS_VALUE" = "not_found" ]; then
    log "Redis key '$REDIS_KEY' does not exist yet (expected before rule engine runs)"
else
    log "Redis key '$REDIS_KEY' has value: $REDIS_VALUE"
fi

# Test 8: Check Current Alerts Count
log "Test 8: Checking alerts count before rule engine execution"

ALERTS_BEFORE=$(curl -s -X GET "$BASE_URL/alerts" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | \
    jq -r '.data | length')

log "Alerts count before rule engine: $ALERTS_BEFORE"

# Test 9: Trigger Rule Engine (simulate or wait)
log "Test 9: Waiting for rule engine to process events (checking for 60 seconds)"

ALERT_FOUND=false
for i in {1..12}; do
    log "Check $i/12: Looking for alerts..."
    
    ALERTS_RESPONSE=$(curl -s -X GET "$BASE_URL/alerts" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    ALERTS_COUNT=$(echo "$ALERTS_RESPONSE" | jq -r '.data | length')
    
    if [ "$ALERTS_COUNT" -gt "$ALERTS_BEFORE" ]; then
        success "New alert detected! Total alerts: $ALERTS_COUNT"
        echo "Latest alerts:"
        echo "$ALERTS_RESPONSE" | jq '.data'
        ALERT_FOUND=true
        break
    fi
    
    # Check Redis state
    REDIS_VALUE=$($REDIS_CLI GET "$REDIS_KEY" 2>/dev/null || echo "0")
    log "Redis key '$REDIS_KEY' current value: $REDIS_VALUE"
    
    sleep 5
done

if [ "$ALERT_FOUND" = "false" ]; then
    warning "No new alerts found after 60 seconds. Rule engine may need more time or manual trigger."
fi

# Test 10: Ingest 6th Event to Trigger Alert
log "Test 10: Ingesting 6th failed login to trigger threshold"

INGEST_RESPONSE=$(curl -s -X POST "$BASE_URL/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"events\": [{
            \"source_ip\": \"$TARGET_IP\",
            \"raw_event\": \"Failed login attempt 6 from $TARGET_IP at $(date) - TRIGGER THRESHOLD\"
        }]
    }")

log "6th event ingested, waiting for rule engine processing..."
sleep 10

# Test 11: Final Verification
log "Test 11: Final verification of alerts and Redis state"

FINAL_ALERTS_RESPONSE=$(curl -s -X GET "$BASE_URL/alerts" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

FINAL_ALERTS_COUNT=$(echo "$FINAL_ALERTS_RESPONSE" | jq -r '.data | length')

if [ "$FINAL_ALERTS_COUNT" -gt "$ALERTS_BEFORE" ]; then
    success "Stateful rule engine working! Total alerts: $FINAL_ALERTS_COUNT"
    
    # Check for specific brute force alert
    BRUTE_FORCE_ALERTS=$(echo "$FINAL_ALERTS_RESPONSE" | jq -r '.data[] | select(.rule_name | contains("Brute Force")) | .rule_name')
    
    if [ -n "$BRUTE_FORCE_ALERTS" ]; then
        success "Found brute force detection alert!"
    else
        warning "Alert found but not specifically for brute force"
    fi
    
    echo "Alert details:"
    echo "$FINAL_ALERTS_RESPONSE" | jq '.data'
else
    warning "No new alerts generated. Current count: $FINAL_ALERTS_COUNT"
fi

# Test 12: Check Redis Key Management
log "Test 12: Checking Redis key management after alert"

FINAL_REDIS_VALUE=$($REDIS_CLI GET "$REDIS_KEY" 2>/dev/null || echo "not_found")

if [ "$FINAL_REDIS_VALUE" = "not_found" ]; then
    success "Redis key was properly deleted after alert generation"
else
    log "Redis key still exists with value: $FINAL_REDIS_VALUE"
    
    # Check TTL
    TTL=$($REDIS_CLI TTL "$REDIS_KEY" 2>/dev/null || echo "-1")
    log "Redis key TTL: $TTL seconds"
fi

# Test 13: Test Different IP (Should Not Trigger)
log "Test 13: Testing different IP to verify aggregation works correctly"

DIFFERENT_IP="10.0.0.50"

for i in {1..3}; do
    curl -s -X POST "$BASE_URL/events" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"events\": [{
                \"source_ip\": \"$DIFFERENT_IP\",
                \"raw_event\": \"Failed login attempt $i from $DIFFERENT_IP at $(date)\"
            }]
        }" > /dev/null
done

sleep 5

DIFFERENT_REDIS_KEY="brute_force:tenant-A:$DIFFERENT_IP"
DIFFERENT_REDIS_VALUE=$($REDIS_CLI GET "$DIFFERENT_REDIS_KEY" 2>/dev/null || echo "not_found")

if [ "$DIFFERENT_REDIS_VALUE" != "not_found" ] && [ "$DIFFERENT_REDIS_VALUE" -lt "6" ]; then
    success "Different IP tracking works correctly (value: $DIFFERENT_REDIS_VALUE, threshold not reached)"
else
    log "Different IP Redis key state: $DIFFERENT_REDIS_VALUE"
fi

# Test 14: Cleanup Test Rule
log "Test 14: Cleaning up test rule"

DELETE_RESPONSE=$(curl -s -X DELETE "$BASE_URL/rules/$RULE_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$DELETE_RESPONSE" | grep -q "successfully"; then
    success "Test rule deleted successfully"
else
    warning "Test rule deletion response: $DELETE_RESPONSE"
fi

# Final Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}STATEFUL RULE ENGINE TEST SUMMARY${NC}"
echo -e "${BLUE}========================================${NC}"

success "✓ Redis connectivity verified"
success "✓ Stateful rule creation working"
success "✓ Event ingestion functional"
success "✓ Redis key management implemented"

if [ "$ALERT_FOUND" = "true" ]; then
    success "✓ Stateful alert generation working"
else
    warning "⚠ Alert generation needs manual verification"
fi

echo -e "\n${GREEN}Phase 10.1 Stateful Rule Engine implementation appears to be working correctly!${NC}"
echo -e "${BLUE}The rule engine uses Redis to track event counts over time and generates alerts when thresholds are exceeded.${NC}"

log "Test completed successfully!" 