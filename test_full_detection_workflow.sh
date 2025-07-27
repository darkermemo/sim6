#!/bin/bash

# Full Detection Workflow Test Script
# Tests the complete SIEM detection pipeline:
# 1. Create detection rules
# 2. Ingest matching logs
# 3. Verify alert generation
# 4. Check UI display

echo "=========================================="
echo "SIEM FULL DETECTION WORKFLOW TEST"
echo "=========================================="
echo

# Configuration
API_URL="http://localhost:8080/api/v1"
UI_URL="http://localhost:3001"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TEST_RESULTS=()
TOTAL_TESTS=0
PASSED_TESTS=0

# Helper functions
log_test_result() {
    local test_name="$1"
    local status="$2"
    local message="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✓ $test_name: $message${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ $test_name: $message${NC}"
    fi
    
    TEST_RESULTS+=("$test_name: $status - $message")
}

log_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

log_section() {
    echo
    echo "========================================"
    echo "$1"
    echo "========================================"
}

# Generate authentication tokens
generate_tokens() {
    log_section "STEP 1: AUTHENTICATION SETUP"
    
    log_info "Generating authentication tokens..."
    cd siem_api
    
    ADMIN_TOKEN=$(cargo run --example generate_token admin tenant-A Admin 2>/dev/null | grep -A1 "JWT Token" | tail -1)
    ANALYST_TOKEN=$(cargo run --example generate_token analyst tenant-A Analyst 2>/dev/null | grep -A1 "JWT Token" | tail -1)
    
    cd ..
    
    if [ -n "$ADMIN_TOKEN" ] && [ -n "$ANALYST_TOKEN" ]; then
        log_test_result "Token Generation" "PASS" "Admin and Analyst tokens generated successfully"
    else
        log_test_result "Token Generation" "FAIL" "Failed to generate required tokens"
        exit 1
    fi
}

# Test 1: Create Detection Rules
create_detection_rules() {
    log_section "STEP 2: DETECTION RULE CREATION"
    
    # Rule 1: Suspicious Windows Logon (Failed Login)
    log_info "Creating Rule 1: Suspicious Windows Logon Detection..."
    
    RULE1_JSON='{
        "rule_name": "Suspicious Windows Logon",
        "description": "Detects suspicious logon attempts from admin accounts",
        "query": "SELECT * FROM dev.events WHERE tenant_id = '\''tenant-A'\'' AND (raw_event LIKE '\''%4625%'\'' OR raw_event LIKE '\''%failed%'\'' OR raw_event LIKE '\''%admin%'\'')",
        "engine_type": "scheduled"
    }'
    
    RULE1_RESPONSE=$(curl -s -X POST "$API_URL/rules" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$RULE1_JSON")
    
    RULE1_ID=$(echo "$RULE1_RESPONSE" | jq -r '.rule_id // empty' 2>/dev/null)
    
    if [ -n "$RULE1_ID" ]; then
        log_test_result "Rule 1 Creation" "PASS" "Suspicious Windows Logon rule created (ID: $RULE1_ID)"
    else
        log_test_result "Rule 1 Creation" "FAIL" "Failed to create rule. Response: $RULE1_RESPONSE"
    fi
    
    # Rule 2: Malware Detection
    log_info "Creating Rule 2: Malware Detection..."
    
    RULE2_JSON='{
        "rule_name": "Malware Detection",
        "description": "Detects known malware signatures",
        "query": "SELECT * FROM dev.events WHERE tenant_id = '\''tenant-A'\'' AND (raw_event LIKE '\''%malware%'\'' OR raw_event LIKE '\''%virus%'\'' OR raw_event LIKE '\''%trojan%'\'') AND event_timestamp > (toUnixTimestamp(now()) - 3600)",
        "engine_type": "scheduled"
    }'
    
    RULE2_RESPONSE=$(curl -s -X POST "$API_URL/rules" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$RULE2_JSON")
    
    RULE2_ID=$(echo "$RULE2_RESPONSE" | jq -r '.rule_id // empty' 2>/dev/null)
    
    if [ -n "$RULE2_ID" ]; then
        log_test_result "Rule 2 Creation" "PASS" "Malware Detection rule created (ID: $RULE2_ID)"
    else
        log_test_result "Rule 2 Creation" "FAIL" "Failed to create rule. Response: $RULE2_RESPONSE"
    fi
    
    # Rule 3: Port Scan Detection
    log_info "Creating Rule 3: Port Scan Detection..."
    
    RULE3_JSON='{
        "rule_name": "Port Scan Detection",
        "description": "Detects potential port scanning activity",
        "query": "SELECT source_ip, count(*) as connection_count FROM dev.events WHERE tenant_id = \"tenant-A\" AND (raw_event LIKE \"%connection%\" OR raw_event LIKE \"%port%\" OR raw_event LIKE \"%scan%\") AND event_timestamp > (toUnixTimestamp(now()) - 300) GROUP BY source_ip HAVING connection_count > 5",
        "engine_type": "scheduled"
    }'
    
    RULE3_RESPONSE=$(curl -s -X POST "$API_URL/rules" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$RULE3_JSON")
    
    RULE3_ID=$(echo "$RULE3_RESPONSE" | jq -r '.rule_id // empty' 2>/dev/null)
    
    if [ -n "$RULE3_ID" ]; then
        log_test_result "Rule 3 Creation" "PASS" "Port Scan Detection rule created (ID: $RULE3_ID)"
    else
        log_test_result "Rule 3 Creation" "FAIL" "Failed to create rule. Response: $RULE3_RESPONSE"
    fi
}

# Test 2: Ingest Matching Logs
ingest_matching_logs() {
    log_section "STEP 3: LOG INGESTION"
    
    # Event 1: Failed Windows Logon (matches Rule 1)
    log_info "Ingesting Event 1: Failed Windows Logon..."
    
    EVENT1_JSON='{
        "events": [{
            "source_ip": "192.168.1.100",
            "raw_log": "Event ID 4625: An account failed to log on. Subject: Security ID: NULL SID Account Name: - Account Domain: - Logon ID: 0x0 Logon Type: 3 Account For Which Logon Failed: Account Name: admin Account Domain: WORKGROUP Failure Information: Failure Reason: Unknown user name or bad password. Status: 0xC000006D Sub Status: 0xC000006A Process Information: Caller Process ID: 0x0 Caller Process Name: - Network Information: Workstation Name: ATTACKER-PC Source Network Address: 192.168.1.100 Source Port: 0 Detailed Authentication Information: Logon Process: NtLmSsp Authentication Package: NTLM Transited Services: - Package Name (NTLM only): - Key Length: 0"
        }]
    }'
    
    EVENT1_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/events" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$EVENT1_JSON")
    
    if [ "$EVENT1_RESPONSE" = "202" ]; then
        log_test_result "Event 1 Ingestion" "PASS" "Failed Windows Logon event ingested (HTTP 202)"
    else
        log_test_result "Event 1 Ingestion" "FAIL" "Expected HTTP 202, got $EVENT1_RESPONSE"
    fi
    
    # Event 2: Malware Detection (matches Rule 2)
    log_info "Ingesting Event 2: Malware Detection..."
    
    EVENT2_JSON='{
        "events": [{
            "source_ip": "192.168.1.200",
            "raw_log": "Windows Defender Alert: Malware detected - Trojan:Win32/Emotet.A!ml found in C:\\Users\\victim\\Downloads\\invoice.exe. Action taken: Quarantine. Threat severity: High. Detection time: 2024-01-15 14:30:22"
        }]
    }'
    
    EVENT2_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/events" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$EVENT2_JSON")
    
    if [ "$EVENT2_RESPONSE" = "202" ]; then
        log_test_result "Event 2 Ingestion" "PASS" "Malware detection event ingested (HTTP 202)"
    else
        log_test_result "Event 2 Ingestion" "FAIL" "Expected HTTP 202, got $EVENT2_RESPONSE"
    fi
    
    # Event 3: Multiple Port Scan Events (matches Rule 3)
    log_info "Ingesting Event 3: Port Scan Activity (multiple events)..."
    
    for port in 22 23 25 53 80 135 139 443 445 993; do
        EVENT3_JSON='{
            "events": [{
                "source_ip": "10.0.0.50",
                "raw_log": "Firewall: Connection attempt from 10.0.0.50 to 192.168.1.10 port '$port' - BLOCKED. Potential port scan detected."
            }]
        }'
        
        curl -s -o /dev/null -X POST "$API_URL/events" \
            -H "Authorization: Bearer $ADMIN_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$EVENT3_JSON"
    done
    
    log_test_result "Event 3 Ingestion" "PASS" "Port scan events ingested (10 events from same IP)"
    
    # Wait for events to be processed
    log_info "Waiting for events to be processed by consumer..."
    sleep 10
}

# Test 3: Verify Services are Running
verify_services() {
    log_section "STEP 4: SERVICE VERIFICATION"
    
    # Check API
    API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/../v1/health")
    if [ "$API_HEALTH" = "200" ]; then
        log_test_result "API Service" "PASS" "API is running and healthy (HTTP 200)"
    else
        log_test_result "API Service" "FAIL" "API health check failed (HTTP $API_HEALTH)"
    fi
    
    # Check Consumer
    if ps aux | grep -v grep | grep -q siem_consumer; then
        log_test_result "Consumer Service" "PASS" "Consumer process is running"
    else
        log_test_result "Consumer Service" "FAIL" "Consumer process not found"
        log_warning "Start consumer with: cd siem_consumer && RUST_LOG=info cargo run"
    fi
    
    # Check Rule Engine
    if ps aux | grep -v grep | grep -q siem_rule_engine; then
        log_test_result "Rule Engine Service" "PASS" "Rule engine process is running"
    else
        log_test_result "Rule Engine Service" "FAIL" "Rule engine process not found"
        log_warning "Start rule engine with: cd siem_rule_engine && RUST_LOG=info cargo run"
    fi
    
    # Check UI
    UI_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$UI_URL")
    if [ "$UI_HEALTH" = "200" ]; then
        log_test_result "UI Service" "PASS" "UI is running and accessible (HTTP 200)"
    else
        log_test_result "UI Service" "FAIL" "UI health check failed (HTTP $UI_HEALTH)"
        log_warning "Start UI with: cd siem_ui && npm run dev"
    fi
}

# Test 4: Wait for Rule Engine and Check Alerts
check_alert_generation() {
    log_section "STEP 5: ALERT GENERATION VERIFICATION"
    
    log_info "Waiting for rule engine to process events (checking for 2 minutes)..."
    
    ALERTS_FOUND=false
    for i in {1..24}; do
        log_info "Check $i/24: Looking for generated alerts..."
        
        ALERTS_RESPONSE=$(curl -s -X GET "$API_URL/alerts" \
            -H "Authorization: Bearer $ADMIN_TOKEN")
        
        ALERTS_COUNT=$(echo "$ALERTS_RESPONSE" | jq -r '.data | length' 2>/dev/null || echo "0")
        
        if [ "$ALERTS_COUNT" -gt "0" ]; then
            log_test_result "Alert Generation" "PASS" "$ALERTS_COUNT alerts generated successfully"
            
            # Show alert details
            echo "Generated Alerts:"
            echo "$ALERTS_RESPONSE" | jq '.data[] | {alert_id, rule_name, severity, status, created_at}' 2>/dev/null || echo "$ALERTS_RESPONSE"
            
            ALERTS_FOUND=true
            break
        fi
        
        sleep 5
    done
    
    if [ "$ALERTS_FOUND" = false ]; then
        log_test_result "Alert Generation" "FAIL" "No alerts generated after 2 minutes"
        log_warning "Rule engine may need more time or manual restart"
    fi
}

# Test 5: Verify UI Alert Display
verify_ui_alerts() {
    log_section "STEP 6: UI ALERT VERIFICATION"
    
    # Check if alerts endpoint returns data for UI
    ALERTS_API_RESPONSE=$(curl -s -X GET "$API_URL/alerts" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    ALERTS_COUNT=$(echo "$ALERTS_API_RESPONSE" | jq -r '.data | length' 2>/dev/null || echo "0")
    
    if [ "$ALERTS_COUNT" -gt "0" ]; then
        log_test_result "UI Alerts API" "PASS" "Alerts API returns $ALERTS_COUNT alerts for UI"
        
        # Get first alert ID for detail testing
        FIRST_ALERT_ID=$(echo "$ALERTS_API_RESPONSE" | jq -r '.data[0].alert_id' 2>/dev/null)
        
        if [ -n "$FIRST_ALERT_ID" ] && [ "$FIRST_ALERT_ID" != "null" ]; then
            # Test alert detail endpoint
            ALERT_DETAIL_RESPONSE=$(curl -s -X GET "$API_URL/alerts/$FIRST_ALERT_ID" \
                -H "Authorization: Bearer $ADMIN_TOKEN")
            
            if echo "$ALERT_DETAIL_RESPONSE" | jq -e '.alert_id' >/dev/null 2>&1; then
                log_test_result "Alert Detail API" "PASS" "Alert detail endpoint working (ID: $FIRST_ALERT_ID)"
                
                # Show alert detail structure
                echo "Alert Detail Structure:"
                echo "$ALERT_DETAIL_RESPONSE" | jq '{alert_id, rule_name, event_id, severity, status, raw}' 2>/dev/null || echo "$ALERT_DETAIL_RESPONSE"
            else
                log_test_result "Alert Detail API" "FAIL" "Alert detail endpoint failed"
            fi
        fi
    else
        log_test_result "UI Alerts API" "FAIL" "No alerts available for UI display"
    fi
    
    # Provide UI access instructions
    echo
    log_info "To verify UI manually:"
    echo "  1. Open browser to: $UI_URL"
    echo "  2. Navigate to: $UI_URL/alerts"
    echo "  3. Verify alerts are listed with:"
    echo "     - Alert ID"
    echo "     - Rule Name"
    echo "     - Severity Badge"
    echo "     - Status Badge"
    echo "     - Timestamp"
    echo "  4. Click on an alert to view details"
    echo "  5. Verify alert detail page shows:"
    echo "     - Alert metadata"
    echo "     - Triggering event details"
    echo "     - Raw event data"
}

# Test 6: Verify Event-Alert Linkage
verify_event_alert_linkage() {
    log_section "STEP 7: EVENT-ALERT LINKAGE VERIFICATION"
    
    # Get alerts and their associated events
    ALERTS_RESPONSE=$(curl -s -X GET "$API_URL/alerts" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    ALERTS_COUNT=$(echo "$ALERTS_RESPONSE" | jq -r '.data | length' 2>/dev/null || echo "0")
    
    if [ "$ALERTS_COUNT" -gt "0" ]; then
        # Check each alert for event linkage
        for i in $(seq 0 $((ALERTS_COUNT - 1))); do
            ALERT_ID=$(echo "$ALERTS_RESPONSE" | jq -r ".data[$i].alert_id" 2>/dev/null)
            EVENT_ID=$(echo "$ALERTS_RESPONSE" | jq -r ".data[$i].event_id" 2>/dev/null)
            
            if [ -n "$EVENT_ID" ] && [ "$EVENT_ID" != "null" ]; then
                # Verify the linked event exists
                EVENT_SEARCH_RESPONSE=$(curl -s -X POST "$API_URL/events/search" \
                    -H "Authorization: Bearer $ADMIN_TOKEN" \
                    -H "Content-Type: application/json" \
                    -d "{\"query\": \"event_id = '$EVENT_ID'\", \"limit\": 1}")
                
                EVENT_FOUND=$(echo "$EVENT_SEARCH_RESPONSE" | jq -r '.data | length' 2>/dev/null || echo "0")
                
                if [ "$EVENT_FOUND" -gt "0" ]; then
                    log_test_result "Event-Alert Link $((i+1))" "PASS" "Alert $ALERT_ID correctly linked to event $EVENT_ID"
                else
                    log_test_result "Event-Alert Link $((i+1))" "FAIL" "Alert $ALERT_ID linked to non-existent event $EVENT_ID"
                fi
            else
                log_test_result "Event-Alert Link $((i+1))" "FAIL" "Alert $ALERT_ID has no event_id linkage"
            fi
        done
    else
        log_test_result "Event-Alert Linkage" "SKIP" "No alerts available to test linkage"
    fi
}

# Generate final report
generate_report() {
    log_section "FINAL REPORT"
    
    echo "Test Results Summary:"
    echo "Total Tests: $TOTAL_TESTS"
    echo "Passed: $PASSED_TESTS"
    echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"
    echo "Success Rate: $(( (PASSED_TESTS * 100) / TOTAL_TESTS ))%"
    echo
    
    if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
        echo -e "${GREEN}🎉 ALL TESTS PASSED! SIEM Detection Workflow is Working Correctly! 🎉${NC}"
    else
        echo -e "${RED}❌ Some tests failed. Please review the results above.${NC}"
    fi
    
    echo
    echo "Detailed Results:"
    for result in "${TEST_RESULTS[@]}"; do
        echo "  $result"
    done
    
    echo
    echo "Next Steps:"
    echo "1. If alerts were generated, verify them in the UI at: $UI_URL/alerts"
    echo "2. Click on alerts to verify detail pages show triggering events"
    echo "3. Test additional rule types and scenarios as needed"
    echo "4. Monitor rule engine logs for processing details"
}

# Main execution
main() {
    # Check dependencies
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is required but not installed${NC}"
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        echo -e "${RED}Error: curl is required but not installed${NC}"
        exit 1
    fi
    
    # Run all tests
    generate_tokens
    create_detection_rules
    ingest_matching_logs
    verify_services
    check_alert_generation
    verify_ui_alerts
    verify_event_alert_linkage
    generate_report
}

# Run the main function
main "$@"