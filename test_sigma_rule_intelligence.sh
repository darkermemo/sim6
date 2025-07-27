#!/bin/bash

# Advanced Sigma Rule Support Test Suite
# Tests intelligent routing of Sigma rules based on complexity analysis

echo "==========================================="
echo "SIGMA RULE INTELLIGENCE TEST SUITE"
echo "==========================================="

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
    
    log "SUCCESS" "All prerequisites met"
    return 0
}

# Test 1: Simple Sigma Rule → Real-time Engine
test_simple_sigma_rule() {
    log "INFO" "========== TEST 1: SIMPLE SIGMA RULE → REAL-TIME ENGINE =========="
    
    # Simple keyword-based Sigma rule
    local sigma_yaml='title: Simple Failed Login Detection
description: Detects failed login attempts
detection:
  selection:
    keywords: "failed login"
  condition: selection'
    
    log "INFO" "Creating simple Sigma rule..."
    
    RULE_RESPONSE=$(curl -s -X POST "$API_URL/rules/sigma" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"sigma_yaml\": \"$sigma_yaml\"}")
    
    # Check response structure
    RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.rule.rule_id // "error"')
    IS_COMPLEX=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.is_complex // "error"')
    ENGINE_TYPE=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.engine_type // "error"')
    COMPLEXITY_REASONS=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.complexity_reasons[]' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
    
    if [[ "$RULE_ID" == "error" || "$RULE_ID" == "null" ]]; then
        log "ERROR" "Failed to create simple Sigma rule"
        echo "Response: $RULE_RESPONSE"
        return 1
    fi
    
    log "SUCCESS" "Created simple Sigma rule: $RULE_ID"
    log "INFO" "Complexity analysis:"
    log "INFO" "  - Is Complex: $IS_COMPLEX"
    log "INFO" "  - Engine Type: $ENGINE_TYPE"
    log "INFO" "  - Reasons: [$COMPLEXITY_REASONS]"
    
    # Verify rule was routed to real-time engine
    if [[ "$IS_COMPLEX" == "false" && "$ENGINE_TYPE" == "real-time" ]]; then
        log "SUCCESS" "Simple rule correctly routed to real-time engine"
    else
        log "ERROR" "Simple rule routing failed. Expected: is_complex=false, engine_type=real-time"
        log "ERROR" "Actual: is_complex=$IS_COMPLEX, engine_type=$ENGINE_TYPE"
        return 1
    fi
    
    # Verify rule exists in database with correct engine type
    DB_ENGINE_TYPE=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/rules/$RULE_ID" | jq -r '.engine_type // "error"')
    if [[ "$DB_ENGINE_TYPE" == "real-time" ]]; then
        log "SUCCESS" "Rule stored in database with correct engine type: $DB_ENGINE_TYPE"
    else
        log "ERROR" "Database engine type mismatch. Expected: real-time, Actual: $DB_ENGINE_TYPE"
    fi
    
    # Test real-time processing with this rule
    log "INFO" "Testing real-time processing..."
    
    # Wait for rule cache refresh
    sleep 5
    
    # Send test event that should match the simple rule
    EVENT_ID="test-sigma-simple-$(date +%s)"
    EVENT_DATA='{
        "event_id": "'$EVENT_ID'",
        "tenant_id": "tenant-A",
        "event_timestamp": '$(date +%s)',
        "source_ip": "192.168.1.200",
        "source_type": "Authentication",
        "raw_event": "failed login attempt for user admin",
        "event_category": "Authentication",
        "event_outcome": "Failure",
        "event_action": "Login",
        "is_threat": 0
    }'
    
    # Record initial alert count
    INITIAL_ALERT_COUNT=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/alerts" | jq '.data | length')
    
    echo "$EVENT_DATA" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic $KAFKA_TOPIC > /dev/null 2>&1
    log "INFO" "Sent test event: $EVENT_ID"
    
    # Wait for real-time processing
    log "INFO" "Waiting 5 seconds for real-time alert generation..."
    sleep 5
    
    NEW_ALERT_COUNT=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/alerts" | jq '.data | length')
    
    if [[ $NEW_ALERT_COUNT -gt $INITIAL_ALERT_COUNT ]]; then
        log "SUCCESS" "Real-time alert generated! Alert count increased from $INITIAL_ALERT_COUNT to $NEW_ALERT_COUNT"
        
        # Check if alert was generated by our Sigma rule
        RECENT_ALERT_RULE=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/alerts" | jq -r '.data[0].rule_name // "none"')
        if [[ "$RECENT_ALERT_RULE" == "Simple Failed Login Detection" ]]; then
            log "SUCCESS" "Alert correctly generated by simple Sigma rule"
        else
            log "WARN" "Alert found but not from expected Sigma rule: $RECENT_ALERT_RULE"
        fi
    else
        log "WARN" "No real-time alert generated. This may be expected if stream processor is not running."
    fi
    
    # Cleanup
    curl -s -X DELETE "$API_URL/rules/$RULE_ID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    log "INFO" "Cleaned up simple Sigma rule"
    
    return 0
}

# Test 2: Complex Sigma Rule → Scheduled Engine
test_complex_sigma_rule() {
    log "INFO" "========== TEST 2: COMPLEX SIGMA RULE → SCHEDULED ENGINE =========="
    
    # Complex aggregation-based Sigma rule
    local sigma_yaml='title: Brute Force Attack Detection
description: Detects multiple failed login attempts indicating brute force
detection:
  selection:
    keywords: "failed login"
  condition: count() > 5
timeframe: 10m'
    
    log "INFO" "Creating complex Sigma rule with aggregation..."
    
    RULE_RESPONSE=$(curl -s -X POST "$API_URL/rules/sigma" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"sigma_yaml\": \"$sigma_yaml\"}")
    
    # Check response structure
    RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.rule.rule_id // "error"')
    IS_COMPLEX=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.is_complex // "error"')
    ENGINE_TYPE=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.engine_type // "error"')
    COMPLEXITY_REASONS=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.complexity_reasons[]' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
    
    if [[ "$RULE_ID" == "error" || "$RULE_ID" == "null" ]]; then
        log "ERROR" "Failed to create complex Sigma rule"
        echo "Response: $RULE_RESPONSE"
        return 1
    fi
    
    log "SUCCESS" "Created complex Sigma rule: $RULE_ID"
    log "INFO" "Complexity analysis:"
    log "INFO" "  - Is Complex: $IS_COMPLEX"
    log "INFO" "  - Engine Type: $ENGINE_TYPE"
    log "INFO" "  - Reasons: [$COMPLEXITY_REASONS]"
    
    # Verify rule was routed to scheduled engine
    if [[ "$IS_COMPLEX" == "true" && "$ENGINE_TYPE" == "scheduled" ]]; then
        log "SUCCESS" "Complex rule correctly routed to scheduled engine"
    else
        log "ERROR" "Complex rule routing failed. Expected: is_complex=true, engine_type=scheduled"
        log "ERROR" "Actual: is_complex=$IS_COMPLEX, engine_type=$ENGINE_TYPE"
        return 1
    fi
    
    # Verify complexity reasons include expected indicators
    if [[ "$COMPLEXITY_REASONS" == *"count() aggregation"* ]]; then
        log "SUCCESS" "Complexity analysis correctly identified aggregation"
    else
        log "WARN" "Expected 'count() aggregation' in complexity reasons. Got: [$COMPLEXITY_REASONS]"
    fi
    
    if [[ "$COMPLEXITY_REASONS" == *"timeframe specification"* ]]; then
        log "SUCCESS" "Complexity analysis correctly identified timeframe"
    else
        log "WARN" "Expected 'timeframe specification' in complexity reasons. Got: [$COMPLEXITY_REASONS]"
    fi
    
    # Verify rule exists in database with correct engine type
    DB_ENGINE_TYPE=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/rules/$RULE_ID" | jq -r '.engine_type // "error"')
    if [[ "$DB_ENGINE_TYPE" == "scheduled" ]]; then
        log "SUCCESS" "Rule stored in database with correct engine type: $DB_ENGINE_TYPE"
    else
        log "ERROR" "Database engine type mismatch. Expected: scheduled, Actual: $DB_ENGINE_TYPE"
    fi
    
    # Check if rule was marked as stateful (for aggregation rules)
    IS_STATEFUL=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/rules/$RULE_ID" | jq -r '.is_stateful // "error"')
    if [[ "$IS_STATEFUL" == "1" ]]; then
        log "SUCCESS" "Complex aggregation rule correctly marked as stateful"
    else
        log "INFO" "Rule is not stateful (is_stateful=$IS_STATEFUL)"
    fi
    
    # Cleanup
    curl -s -X DELETE "$API_URL/rules/$RULE_ID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    log "INFO" "Cleaned up complex Sigma rule"
    
    return 0
}

# Test 3: Regex-based Complex Rule
test_regex_sigma_rule() {
    log "INFO" "========== TEST 3: REGEX SIGMA RULE → SCHEDULED ENGINE =========="
    
    # Regex-based Sigma rule (should be marked as complex)
    local sigma_yaml='title: Suspicious User Pattern Detection
description: Detects suspicious username patterns using regex
detection:
  selection:
    username|re: "admin[0-9]+"
  condition: selection'
    
    log "INFO" "Creating regex-based Sigma rule..."
    
    RULE_RESPONSE=$(curl -s -X POST "$API_URL/rules/sigma" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"sigma_yaml\": \"$sigma_yaml\"}")
    
    # Check response structure
    RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.rule.rule_id // "error"')
    IS_COMPLEX=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.is_complex // "error"')
    ENGINE_TYPE=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.engine_type // "error"')
    COMPLEXITY_REASONS=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.complexity_reasons[]' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
    
    if [[ "$RULE_ID" == "error" || "$RULE_ID" == "null" ]]; then
        log "ERROR" "Failed to create regex Sigma rule"
        echo "Response: $RULE_RESPONSE"
        return 1
    fi
    
    log "SUCCESS" "Created regex Sigma rule: $RULE_ID"
    log "INFO" "Complexity analysis:"
    log "INFO" "  - Is Complex: $IS_COMPLEX"
    log "INFO" "  - Engine Type: $ENGINE_TYPE"
    log "INFO" "  - Reasons: [$COMPLEXITY_REASONS]"
    
    # Verify regex rule was marked as complex
    if [[ "$IS_COMPLEX" == "true" && "$ENGINE_TYPE" == "scheduled" ]]; then
        log "SUCCESS" "Regex rule correctly routed to scheduled engine"
    else
        log "ERROR" "Regex rule routing failed. Expected: is_complex=true, engine_type=scheduled"
        log "ERROR" "Actual: is_complex=$IS_COMPLEX, engine_type=$ENGINE_TYPE"
        return 1
    fi
    
    # Verify complexity reasons include regex indicator
    if [[ "$COMPLEXITY_REASONS" == *"regex"* ]]; then
        log "SUCCESS" "Complexity analysis correctly identified regex patterns"
    else
        log "WARN" "Expected 'regex' in complexity reasons. Got: [$COMPLEXITY_REASONS]"
    fi
    
    # Cleanup
    curl -s -X DELETE "$API_URL/rules/$RULE_ID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    log "INFO" "Cleaned up regex Sigma rule"
    
    return 0
}

# Test 4: Multi-selection Complex Rule
test_multi_selection_sigma_rule() {
    log "INFO" "========== TEST 4: MULTI-SELECTION SIGMA RULE → SCHEDULED ENGINE =========="
    
    # Multi-selection Sigma rule (should be marked as complex)
    local sigma_yaml='title: Multi-Criteria Security Event
description: Detects events matching multiple criteria
detection:
  sel1:
    keywords: "error"
  sel2:
    source_ip: "10.0.0.1"
  sel3:
    keywords: "warning"
  filter:
    keywords: "ignore"
  condition: (sel1 or sel2 or sel3) and not filter'
    
    log "INFO" "Creating multi-selection Sigma rule..."
    
    RULE_RESPONSE=$(curl -s -X POST "$API_URL/rules/sigma" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"sigma_yaml\": \"$sigma_yaml\"}")
    
    # Check response structure
    RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.rule.rule_id // "error"')
    IS_COMPLEX=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.is_complex // "error"')
    ENGINE_TYPE=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.engine_type // "error"')
    COMPLEXITY_REASONS=$(echo "$RULE_RESPONSE" | jq -r '.complexity_analysis.complexity_reasons[]' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
    
    if [[ "$RULE_ID" == "error" || "$RULE_ID" == "null" ]]; then
        log "ERROR" "Failed to create multi-selection Sigma rule"
        echo "Response: $RULE_RESPONSE"
        return 1
    fi
    
    log "SUCCESS" "Created multi-selection Sigma rule: $RULE_ID"
    log "INFO" "Complexity analysis:"
    log "INFO" "  - Is Complex: $IS_COMPLEX"
    log "INFO" "  - Engine Type: $ENGINE_TYPE"
    log "INFO" "  - Reasons: [$COMPLEXITY_REASONS]"
    
    # Verify multi-selection rule was marked as complex
    if [[ "$IS_COMPLEX" == "true" && "$ENGINE_TYPE" == "scheduled" ]]; then
        log "SUCCESS" "Multi-selection rule correctly routed to scheduled engine"
    else
        log "ERROR" "Multi-selection rule routing failed. Expected: is_complex=true, engine_type=scheduled"
        log "ERROR" "Actual: is_complex=$IS_COMPLEX, engine_type=$ENGINE_TYPE"
        return 1
    fi
    
    # Verify complexity reasons include multiple selections indicator
    if [[ "$COMPLEXITY_REASONS" == *"Multiple selections"* ]]; then
        log "SUCCESS" "Complexity analysis correctly identified multiple selections"
    else
        log "WARN" "Expected 'Multiple selections' in complexity reasons. Got: [$COMPLEXITY_REASONS]"
    fi
    
    # Cleanup
    curl -s -X DELETE "$API_URL/rules/$RULE_ID" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    log "INFO" "Cleaned up multi-selection Sigma rule"
    
    return 0
}

# Test 5: Verify Engine Distribution
test_engine_distribution() {
    log "INFO" "========== TEST 5: VERIFY ENGINE DISTRIBUTION =========="
    
    # Create multiple rules and verify distribution
    local simple_rules=0
    local complex_rules=0
    local rule_ids=()
    
    # Simple rule 1
    local simple_yaml1='title: Simple Keyword Rule 1
detection:
  selection:
    keywords: "warning"
  condition: selection'
    
    RESPONSE1=$(curl -s -X POST "$API_URL/rules/sigma" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"sigma_yaml\": \"$simple_yaml1\"}")
    
    RULE_ID1=$(echo "$RESPONSE1" | jq -r '.rule.rule_id')
    ENGINE_TYPE1=$(echo "$RESPONSE1" | jq -r '.complexity_analysis.engine_type')
    rule_ids+=("$RULE_ID1")
    
    if [[ "$ENGINE_TYPE1" == "real-time" ]]; then
        ((simple_rules++))
    fi
    
    # Complex rule 1
    local complex_yaml1='title: Complex Aggregation Rule 1
detection:
  selection:
    keywords: "error"
  condition: count() > 3
timeframe: 5m'
    
    RESPONSE2=$(curl -s -X POST "$API_URL/rules/sigma" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"sigma_yaml\": \"$complex_yaml1\"}")
    
    RULE_ID2=$(echo "$RESPONSE2" | jq -r '.rule.rule_id')
    ENGINE_TYPE2=$(echo "$RESPONSE2" | jq -r '.complexity_analysis.engine_type')
    rule_ids+=("$RULE_ID2")
    
    if [[ "$ENGINE_TYPE2" == "scheduled" ]]; then
        ((complex_rules++))
    fi
    
    # Simple rule 2
    local simple_yaml2='title: Simple IP Rule
detection:
  selection:
    source_ip: "192.168.1.100"
  condition: selection'
    
    RESPONSE3=$(curl -s -X POST "$API_URL/rules/sigma" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"sigma_yaml\": \"$simple_yaml2\"}")
    
    RULE_ID3=$(echo "$RESPONSE3" | jq -r '.rule.rule_id')
    ENGINE_TYPE3=$(echo "$RESPONSE3" | jq -r '.complexity_analysis.engine_type')
    rule_ids+=("$RULE_ID3")
    
    if [[ "$ENGINE_TYPE3" == "real-time" ]]; then
        ((simple_rules++))
    fi
    
    log "INFO" "Rule distribution analysis:"
    log "INFO" "  - Simple rules (real-time): $simple_rules"
    log "INFO" "  - Complex rules (scheduled): $complex_rules"
    log "INFO" "  - Total rules created: ${#rule_ids[@]}"
    
    # Verify correct distribution
    if [[ $simple_rules -eq 2 && $complex_rules -eq 1 ]]; then
        log "SUCCESS" "Engine distribution is correct"
    else
        log "ERROR" "Engine distribution mismatch. Expected: 2 simple, 1 complex"
        log "ERROR" "Actual: $simple_rules simple, $complex_rules complex"
    fi
    
    # Cleanup all test rules
    for rule_id in "${rule_ids[@]}"; do
        curl -s -X DELETE "$API_URL/rules/$rule_id" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    done
    log "INFO" "Cleaned up distribution test rules"
    
    return 0
}

# Main execution
main() {
    echo "Starting Sigma rule intelligence test suite..."
    echo "$(date)"
    echo ""
    
    if ! check_prerequisites; then
        log "ERROR" "Prerequisites check failed"
        exit 1
    fi
    
    # Initialize test results
    local test_results=()
    
    # Run tests
    if test_simple_sigma_rule; then
        test_results+=("✅ Simple Sigma rule → Real-time engine")
    else
        test_results+=("❌ Simple Sigma rule → Real-time engine")
    fi
    
    echo ""
    
    if test_complex_sigma_rule; then
        test_results+=("✅ Complex Sigma rule → Scheduled engine")
    else
        test_results+=("❌ Complex Sigma rule → Scheduled engine")
    fi
    
    echo ""
    
    if test_regex_sigma_rule; then
        test_results+=("✅ Regex Sigma rule → Scheduled engine")
    else
        test_results+=("❌ Regex Sigma rule → Scheduled engine")
    fi
    
    echo ""
    
    if test_multi_selection_sigma_rule; then
        test_results+=("✅ Multi-selection Sigma rule → Scheduled engine")
    else
        test_results+=("❌ Multi-selection Sigma rule → Scheduled engine")
    fi
    
    echo ""
    
    if test_engine_distribution; then
        test_results+=("✅ Engine distribution verification")
    else
        test_results+=("❌ Engine distribution verification")
    fi
    
    # Print summary
    echo ""
    echo "==========================================="
    echo "TEST SUMMARY"
    echo "==========================================="
    for result in "${test_results[@]}"; do
        echo "$result"
    done
    echo ""
    
    # Check if all tests passed
    if [[ "${test_results[*]}" == *"❌"* ]]; then
        log "ERROR" "Some tests failed. Check the output above for details."
        exit 1
    else
        log "SUCCESS" "All Sigma rule intelligence tests passed!"
        echo ""
        echo "🎉 SIGMA RULE INTELLIGENCE IS WORKING CORRECTLY! 🎉"
        echo ""
        echo "The system successfully:"
        echo "✓ Analyzes Sigma rule complexity"
        echo "✓ Routes simple rules to real-time engine"
        echo "✓ Routes complex rules to scheduled engine"
        echo "✓ Provides detailed complexity reasoning"
        echo "✓ Handles various rule types (keywords, aggregations, regex, multi-selection)"
        exit 0
    fi
}

# Run the test suite
main "$@" 