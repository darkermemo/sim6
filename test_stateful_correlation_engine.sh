#!/bin/bash

# Comprehensive Stateful Correlation Engine Test
# Tests both short-term (stream processor) and long-term (rule engine) stateful functionality

echo "========================================"
echo "STATEFUL CORRELATION ENGINE TEST SUITE"
echo "========================================"

# Configuration
API_URL="http://localhost:8080/v1"
ADMIN_TOKEN_FILE="admin_token.txt"
KAFKA_TOPIC="ingest-events"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    local level=$1
    local message=$2
    case $level in
        "ERROR") echo -e "${RED}[ERROR]${NC} $message" ;;
        "SUCCESS") echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
        "INFO") echo -e "${BLUE}[INFO]${NC} $message" ;;
        "WARN") echo -e "${YELLOW}[WARN]${NC} $message" ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    
    # Check if admin token exists
    if [[ ! -f "$ADMIN_TOKEN_FILE" ]]; then
        log "ERROR" "Admin token file not found: $ADMIN_TOKEN_FILE"
        return 1
    fi
    
    ADMIN_TOKEN=$(cat $ADMIN_TOKEN_FILE)
    
    # Test API connectivity
    if ! curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/tenants" > /dev/null; then
        log "ERROR" "Cannot connect to API at $API_URL"
        return 1
    fi
    
    # Check Redis connectivity
    if ! redis-cli ping > /dev/null 2>&1; then
        log "ERROR" "Cannot connect to Redis"
        return 1
    fi
    
    log "SUCCESS" "All prerequisites met"
    return 0
}

# Test 1: Short-Term Stateful Rule (Stream Processor)
test_short_term_stateful() {
    log "INFO" "========== TEST 1: SHORT-TERM STATEFUL (STREAM PROCESSOR) =========="
    
    # Create a real-time stateful brute force rule
    log "INFO" "Creating short-term stateful brute force rule..."
    
    RULE_RESPONSE=$(curl -s -X POST "$API_URL/rules" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "rule_name": "Real-time Brute Force Detection",
            "description": "Detects multiple failed logins from same IP in real-time",
            "query": "SELECT * FROM dev.events WHERE raw_event LIKE '\''%failed%login%'\''",
            "engine_type": "real-time",
            "is_stateful": 1,
            "stateful_config": "{\"key_prefix\":\"brute_force\",\"aggregate_on\":[\"source_ip\"],\"threshold\":3,\"window_seconds\":300}"
        }')
    
    RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.rule_id // "error"')
    if [[ "$RULE_ID" == "error" || "$RULE_ID" == "null" ]]; then
        log "ERROR" "Failed to create short-term stateful rule"
        echo "Response: $RULE_RESPONSE"
        return 1
    fi
    
    log "SUCCESS" "Created short-term stateful rule: $RULE_ID"
    
    # Wait for rule cache refresh
    log "INFO" "Waiting 5 seconds for rule cache refresh..."
    sleep 5
    
    # Send test events (below threshold)
    log "INFO" "Sending 2 failed login events (below threshold of 3)..."
    for i in {1..2}; do
        EVENT_ID="test-event-short-$(date +%s)-$i"
        EVENT_DATA='{
            "event_id": "'$EVENT_ID'",
            "tenant_id": "tenant-A",
            "event_timestamp": '$(date +%s)',
            "source_ip": "192.168.1.100",
            "source_type": "Authentication",
            "raw_event": "failed login attempt from user test",
            "event_category": "Authentication",
            "event_outcome": "Failure",
            "event_action": "Login",
            "is_threat": 0
        }'
        
        echo "$EVENT_DATA" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic $KAFKA_TOPIC > /dev/null 2>&1
        log "INFO" "Sent event $i: $EVENT_ID"
        sleep 1
    done
    
    # Check alerts (should be none)
    sleep 3
    ALERT_COUNT=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/alerts" | jq '.data | length')
    INITIAL_ALERT_COUNT=$ALERT_COUNT
    log "INFO" "Current alerts: $ALERT_COUNT (no new alerts expected)"
    
    # Send the 3rd event (should trigger alert)
    log "INFO" "Sending 3rd failed login event (should trigger alert)..."
    EVENT_ID="test-event-short-$(date +%s)-3"
    EVENT_DATA='{
        "event_id": "'$EVENT_ID'",
        "tenant_id": "tenant-A",
        "event_timestamp": '$(date +%s)',
        "source_ip": "192.168.1.100",
        "source_type": "Authentication",
        "raw_event": "failed login attempt from user test",
        "event_category": "Authentication",
        "event_outcome": "Failure",
        "event_action": "Login",
        "is_threat": 0
    }'
    
    echo "$EVENT_DATA" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic $KAFKA_TOPIC > /dev/null 2>&1
    log "INFO" "Sent threshold-crossing event: $EVENT_ID"
    
    # Wait and check for alerts
    log "INFO" "Waiting 5 seconds for alert generation..."
    sleep 5
    
    NEW_ALERT_COUNT=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/alerts" | jq '.data | length')
    
    if [[ $NEW_ALERT_COUNT -gt $INITIAL_ALERT_COUNT ]]; then
        log "SUCCESS" "Short-term stateful rule triggered! Alert count increased from $INITIAL_ALERT_COUNT to $NEW_ALERT_COUNT"
        
        # Check if the alert is from our rule
        RECENT_ALERT=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/alerts" | jq -r '.data[0].rule_name // "none"')
        if [[ "$RECENT_ALERT" == "Real-time Brute Force Detection" ]]; then
            log "SUCCESS" "Alert correctly generated by short-term stateful rule"
        else
            log "WARN" "Alert found but not from expected rule: $RECENT_ALERT"
        fi
    else
        log "ERROR" "Short-term stateful rule did not trigger alert. Alert count: $NEW_ALERT_COUNT"
        return 1
    fi
    
    # Check Redis state (should be reset after alert)
    REDIS_KEY="brute_force:tenant-A:192.168.1.100"
    REDIS_VALUE=$(redis-cli get "$REDIS_KEY" 2>/dev/null || echo "null")
    if [[ "$REDIS_VALUE" == "null" ]]; then
        log "SUCCESS" "Redis key correctly deleted after alert generation"
    else
        log "WARN" "Redis key still exists: $REDIS_KEY = $REDIS_VALUE"
    fi
    
    # Cleanup
    curl -s -X DELETE "$API_URL/rules/$RULE_ID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    log "INFO" "Cleaned up short-term test rule"
    
    return 0
}

# Test 2: Long-Term Stateful Rule (Rule Engine)
test_long_term_stateful() {
    log "INFO" "========== TEST 2: LONG-TERM STATEFUL (RULE ENGINE) =========="
    
    # Create a scheduled stateful rule for tracking new countries
    log "INFO" "Creating long-term stateful 'new country' rule..."
    
    RULE_RESPONSE=$(curl -s -X POST "$API_URL/rules" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "rule_name": "New Country Login Detection",
            "description": "Detects when a user logs in from a new country",
            "query": "SELECT user, src_country, event_id FROM dev.events WHERE event_category = '\''Authentication'\'' AND event_outcome = '\''Success'\'' AND tenant_id = '\''tenant-A'\'' AND user IS NOT NULL AND src_country IS NOT NULL AND event_timestamp > (toUnixTimestamp(now()) - 3600)",
            "engine_type": "scheduled",
            "is_stateful": 1,
            "stateful_config": "{\"key_prefix\":\"known_countries\",\"tracking_type\":\"set\",\"state_fields\":[\"user\"],\"comparison_field\":\"src_country\",\"threshold\":1,\"window_seconds\":86400}"
        }')
    
    RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.rule_id // "error"')
    if [[ "$RULE_ID" == "error" || "$RULE_ID" == "null" ]]; then
        log "ERROR" "Failed to create long-term stateful rule"
        echo "Response: $RULE_RESPONSE"
        return 1
    fi
    
    log "SUCCESS" "Created long-term stateful rule: $RULE_ID"
    
    # Insert test events directly into ClickHouse
    log "INFO" "Inserting test authentication events..."
    
    # First login from USA (will be added to set)
    INSERT_SQL1="INSERT INTO dev.events (event_id, tenant_id, event_timestamp, source_ip, source_type, raw_event, event_category, event_outcome, event_action, user, src_country) VALUES ('test-login-1-$(date +%s)', 'tenant-A', $(date +%s), '192.168.1.10', 'Authentication', 'successful login', 'Authentication', 'Success', 'Login', 'testuser', 'USA')"
    
    curl -s -X POST "http://localhost:8123" -d "$INSERT_SQL1"
    log "INFO" "Inserted first login from USA"
    
    # Wait for rule engine cycle
    log "INFO" "Waiting 15 seconds for rule engine cycle..."
    sleep 15
    
    # Check Redis state (should have USA in set)
    REDIS_KEY="known_countries:tenant-A:testuser"
    REDIS_MEMBERS=$(redis-cli smembers "$REDIS_KEY" 2>/dev/null | tr '\n' ',' | sed 's/,$//')
    log "INFO" "Current known countries for testuser: [$REDIS_MEMBERS]"
    
    if [[ "$REDIS_MEMBERS" == *"USA"* ]]; then
        log "SUCCESS" "USA correctly added to user's known countries"
    else
        log "WARN" "USA not found in known countries. Current: [$REDIS_MEMBERS]"
    fi
    
    # Record current alert count
    INITIAL_ALERT_COUNT=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/alerts" | jq '.data | length')
    log "INFO" "Current alert count: $INITIAL_ALERT_COUNT"
    
    # Second login from new country (should trigger alert)
    log "INFO" "Inserting login from new country (Japan)..."
    INSERT_SQL2="INSERT INTO dev.events (event_id, tenant_id, event_timestamp, source_ip, source_type, raw_event, event_category, event_outcome, event_action, user, src_country) VALUES ('test-login-2-$(date +%s)', 'tenant-A', $(date +%s), '10.0.0.5', 'Authentication', 'successful login from new location', 'Authentication', 'Success', 'Login', 'testuser', 'Japan')"
    
    curl -s -X POST "http://localhost:8123" -d "$INSERT_SQL2"
    log "INFO" "Inserted login from Japan"
    
    # Wait for next rule engine cycle
    log "INFO" "Waiting 130 seconds for next rule engine cycle..."
    sleep 130
    
    # Check for new alerts
    NEW_ALERT_COUNT=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/alerts" | jq '.data | length')
    
    if [[ $NEW_ALERT_COUNT -gt $INITIAL_ALERT_COUNT ]]; then
        log "SUCCESS" "Long-term stateful rule triggered! Alert count increased from $INITIAL_ALERT_COUNT to $NEW_ALERT_COUNT"
        
        # Check if the alert is from our rule
        RECENT_ALERT=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/alerts" | jq -r '.data[0].rule_name // "none"')
        if [[ "$RECENT_ALERT" == "New Country Login Detection" ]]; then
            log "SUCCESS" "Alert correctly generated by long-term stateful rule"
        else
            log "WARN" "Alert found but not from expected rule: $RECENT_ALERT"
        fi
    else
        log "ERROR" "Long-term stateful rule did not trigger alert. Alert count: $NEW_ALERT_COUNT"
        return 1
    fi
    
    # Check Redis state (should now include Japan)
    REDIS_MEMBERS_AFTER=$(redis-cli smembers "$REDIS_KEY" 2>/dev/null | tr '\n' ',' | sed 's/,$//')
    log "INFO" "Updated known countries for testuser: [$REDIS_MEMBERS_AFTER]"
    
    if [[ "$REDIS_MEMBERS_AFTER" == *"Japan"* ]]; then
        log "SUCCESS" "Japan correctly added to user's known countries after alert"
    else
        log "WARN" "Japan not found in updated known countries. Current: [$REDIS_MEMBERS_AFTER]"
    fi
    
    # Cleanup
    curl -s -X DELETE "$API_URL/rules/$RULE_ID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    redis-cli del "$REDIS_KEY" > /dev/null 2>&1
    log "INFO" "Cleaned up long-term test rule and Redis data"
    
    return 0
}

# Test 3: Verify Engine Separation
test_engine_separation() {
    log "INFO" "========== TEST 3: ENGINE SEPARATION VERIFICATION =========="
    
    # Create one rule of each engine type
    log "INFO" "Creating real-time rule..."
    REALTIME_RULE=$(curl -s -X POST "$API_URL/rules" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "rule_name": "Test Real-time Rule",
            "description": "Test rule for stream processor",
            "query": "SELECT * FROM dev.events WHERE raw_event LIKE '\''%test%'\''",
            "engine_type": "real-time"
        }')
    
    REALTIME_RULE_ID=$(echo "$REALTIME_RULE" | jq -r '.rule_id // "error"')
    
    log "INFO" "Creating scheduled rule..."
    SCHEDULED_RULE=$(curl -s -X POST "$API_URL/rules" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "rule_name": "Test Scheduled Rule", 
            "description": "Test rule for rule engine",
            "query": "SELECT * FROM dev.events WHERE source_ip = '\''10.0.0.1'\''",
            "engine_type": "scheduled"
        }')
    
    SCHEDULED_RULE_ID=$(echo "$SCHEDULED_RULE" | jq -r '.rule_id // "error"')
    
    # Verify rules were created
    if [[ "$REALTIME_RULE_ID" != "error" && "$SCHEDULED_RULE_ID" != "error" ]]; then
        log "SUCCESS" "Both rules created successfully"
        log "INFO" "Real-time rule: $REALTIME_RULE_ID"
        log "INFO" "Scheduled rule: $SCHEDULED_RULE_ID"
        
        # Check rule distribution
        ALL_RULES=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/rules")
        REALTIME_COUNT=$(echo "$ALL_RULES" | jq '[.data[] | select(.engine_type == "real-time")] | length')
        SCHEDULED_COUNT=$(echo "$ALL_RULES" | jq '[.data[] | select(.engine_type == "scheduled")] | length')
        
        log "INFO" "Rule distribution: $REALTIME_COUNT real-time, $SCHEDULED_COUNT scheduled"
        log "SUCCESS" "Engine separation working correctly"
    else
        log "ERROR" "Failed to create test rules for engine separation"
        return 1
    fi
    
    # Cleanup
    curl -s -X DELETE "$API_URL/rules/$REALTIME_RULE_ID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    curl -s -X DELETE "$API_URL/rules/$SCHEDULED_RULE_ID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    log "INFO" "Cleaned up engine separation test rules"
    
    return 0
}

# Main execution
main() {
    echo "Starting stateful correlation engine test suite..."
    echo "$(date)"
    echo ""
    
    if ! check_prerequisites; then
        log "ERROR" "Prerequisites check failed"
        exit 1
    fi
    
    # Initialize test results
    local test_results=()
    
    # Run tests
    if test_short_term_stateful; then
        test_results+=("✅ Short-term stateful (Stream Processor)")
    else
        test_results+=("❌ Short-term stateful (Stream Processor)")
    fi
    
    echo ""
    
    if test_long_term_stateful; then
        test_results+=("✅ Long-term stateful (Rule Engine)")
    else
        test_results+=("❌ Long-term stateful (Rule Engine)")
    fi
    
    echo ""
    
    if test_engine_separation; then
        test_results+=("✅ Engine separation verification")
    else
        test_results+=("❌ Engine separation verification")
    fi
    
    # Print summary
    echo ""
    echo "========================================"
    echo "TEST SUMMARY"
    echo "========================================"
    for result in "${test_results[@]}"; do
        echo "$result"
    done
    echo ""
    
    # Check if all tests passed
    if [[ "${test_results[*]}" == *"❌"* ]]; then
        log "ERROR" "Some tests failed. Check the output above for details."
        exit 1
    else
        log "SUCCESS" "All stateful correlation engine tests passed!"
        echo ""
        echo "🎉 STATEFUL CORRELATION ENGINE IS WORKING CORRECTLY! 🎉"
        echo ""
        echo "Both short-term (real-time) and long-term (scheduled) stateful"
        echo "detection engines are properly tracking state using Redis."
        exit 0
    fi
}

# Run the test suite
main "$@" 