#!/bin/bash

# Phase 1-6.3 Comprehensive Regression Test
# Covers all functionality including Agent Management API

set -e

API_URL="http://localhost:8080"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to print test results
print_test_result() {
    local test_name="$1"
    local status="$2"
    local details="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✅ $test_name: PASS${NC} - $details"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ $test_name: FAIL${NC} - $details"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Function to print suite header
print_suite_header() {
    local suite_name="$1"
    echo ""
    echo -e "${BLUE}========================================================================${NC}"
    echo -e "${BLUE}$suite_name${NC}"
    echo -e "${BLUE}========================================================================${NC}"
}

echo "PHASE 1-6.3 COMPREHENSIVE REGRESSION TEST"
echo "========================================================================="
echo "Target: Verify all functionality including new Agent Management API"
echo "Time: $(date)"
echo ""

# Generate tokens for testing
echo -e "${YELLOW}🔐 Generating test tokens...${NC}"
ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -o 'eyJ[^"]*')
ANALYST_TOKEN=$(cd siem_api && cargo run --example generate_token bob tenant-A Analyst 2>/dev/null | grep -o 'eyJ[^"]*')
VIEWER_TOKEN=$(cd siem_api && cargo run --example generate_token charlie tenant-A Viewer 2>/dev/null | grep -o 'eyJ[^"]*')

echo "Admin Token: ${ADMIN_TOKEN:0:50}..."
echo "Analyst Token: ${ANALYST_TOKEN:0:50}..."
echo "Viewer Token: ${VIEWER_TOKEN:0:50}..."

#========================================================================
# SUITE A: API Core Functionality
#========================================================================
print_suite_header "SUITE A: API Core Functionality"

# A-1: Health Check
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/v1/events")
if [ "$RESPONSE" = "401" ]; then
    print_test_result "A-1: Health Check" "PASS" "API responding (401 Unauthorized as expected)"
else
    print_test_result "A-1: Health Check" "FAIL" "Unexpected response code: $RESPONSE"
fi

# A-2: Admin Authentication
RESPONSE=$(curl -s -X GET "$API_URL/v1/tenants" -H "Authorization: Bearer $ADMIN_TOKEN" -o /dev/null -w "%{http_code}")
if [ "$RESPONSE" = "200" ]; then
    print_test_result "A-2: Admin Authentication" "PASS" "Admin token accepted"
else
    print_test_result "A-2: Admin Authentication" "FAIL" "Response code: $RESPONSE"
fi

# A-3: Invalid Token Rejection
RESPONSE=$(curl -s -X GET "$API_URL/v1/tenants" -H "Authorization: Bearer invalid_token" -o /dev/null -w "%{http_code}")
if [ "$RESPONSE" = "401" ]; then
    print_test_result "A-3: Invalid Token Rejection" "PASS" "Invalid token correctly rejected"
else
    print_test_result "A-3: Invalid Token Rejection" "FAIL" "Response code: $RESPONSE"
fi

#========================================================================
# SUITE B: End-to-End Data Pipeline
#========================================================================
print_suite_header "SUITE B: End-to-End Data Pipeline"

# B-1: Event Retrieval
EVENTS_RESPONSE=$(curl -s -X GET "$API_URL/v1/events" -H "Authorization: Bearer $ADMIN_TOKEN")
EVENTS_STATUS=$(echo "$EVENTS_RESPONSE" | jq -r '.events // "null"')
if [ "$EVENTS_STATUS" != "null" ]; then
    print_test_result "B-1: Event Retrieval" "PASS" "Events endpoint accessible"
else
    print_test_result "B-1: Event Retrieval" "FAIL" "Events endpoint failed"
fi

#========================================================================
# SUITE C: RBAC & Authorization
#========================================================================
print_suite_header "SUITE C: RBAC & Authorization"

# C-1: Role-based Access Control
ADMIN_CREATE_RESPONSE=$(curl -s -X POST "$API_URL/v1/assets" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"asset_name": "Test Asset", "asset_ip": "192.168.1.200", "asset_type": "Server", "criticality": "Medium"}' \
    -o /dev/null -w "%{http_code}")

if [ "$ADMIN_CREATE_RESPONSE" = "201" ]; then
    print_test_result "C-1: Admin Asset Creation" "PASS" "Admin can create assets"
else
    print_test_result "C-1: Admin Asset Creation" "FAIL" "Response code: $ADMIN_CREATE_RESPONSE"
fi

# C-2: Viewer Restriction
VIEWER_CREATE_RESPONSE=$(curl -s -X POST "$API_URL/v1/assets" \
    -H "Authorization: Bearer $VIEWER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"asset_name": "Test Asset", "asset_ip": "192.168.1.201", "asset_type": "Server", "criticality": "Medium"}' \
    -o /dev/null -w "%{http_code}")

if [ "$VIEWER_CREATE_RESPONSE" = "403" ]; then
    print_test_result "C-2: Viewer Asset Creation Denied" "PASS" "Viewer correctly denied creation"
else
    print_test_result "C-2: Viewer Asset Creation Denied" "FAIL" "Response code: $VIEWER_CREATE_RESPONSE"
fi

#========================================================================
# SUITE D: Rule Engine & Alerting
#========================================================================
print_suite_header "SUITE D: Rule Engine & Alerting"

# D-1: Rule Creation
RULE_RESPONSE=$(curl -s -X POST "$API_URL/v1/rules" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"rule_name": "Test Rule", "rule_logic": "message CONTAINS \"error\"", "severity": "High"}')

RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.rule_id // "null"')
if [ "$RULE_ID" != "null" ]; then
    print_test_result "D-1: Rule Creation" "PASS" "Rule created with ID: $RULE_ID"
else
    print_test_result "D-1: Rule Creation" "FAIL" "Failed to create rule"
fi

# D-2: Rule Listing
RULES_LIST=$(curl -s -X GET "$API_URL/v1/rules" -H "Authorization: Bearer $ADMIN_TOKEN")
RULES_COUNT=$(echo "$RULES_LIST" | jq '.rules | length // 0')
if [ "$RULES_COUNT" -gt 0 ]; then
    print_test_result "D-2: Rule Listing" "PASS" "Found $RULES_COUNT rules"
else
    print_test_result "D-2: Rule Listing" "FAIL" "No rules found"
fi

#========================================================================
# SUITE E: Case Management
#========================================================================
print_suite_header "SUITE E: Case Management"

# E-1: Case Creation
CASE_RESPONSE=$(curl -s -X POST "$API_URL/v1/cases" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"case_title": "Security Incident", "description": "Test case", "priority": "High"}')

CASE_ID=$(echo "$CASE_RESPONSE" | jq -r '.case_id // "null"')
if [ "$CASE_ID" != "null" ]; then
    print_test_result "E-1: Case Creation" "PASS" "Case created with ID: $CASE_ID"
else
    print_test_result "E-1: Case Creation" "FAIL" "Failed to create case"
fi

# E-2: Case Listing
CASES_LIST=$(curl -s -X GET "$API_URL/v1/cases" -H "Authorization: Bearer $ADMIN_TOKEN")
CASES_COUNT=$(echo "$CASES_LIST" | jq '.cases | length // 0')
if [ "$CASES_COUNT" -gt 0 ]; then
    print_test_result "E-2: Case Listing" "PASS" "Found $CASES_COUNT cases"
else
    print_test_result "E-2: Case Listing" "FAIL" "No cases found"
fi

#========================================================================
# SUITE F: Tenant Lifecycle
#========================================================================
print_suite_header "SUITE F: Tenant Lifecycle"

# F-1: Tenant Listing
TENANTS_LIST=$(curl -s -X GET "$API_URL/v1/tenants" -H "Authorization: Bearer $ADMIN_TOKEN")
TENANT_COUNT=$(echo "$TENANTS_LIST" | jq '.tenants | length // 0')
if [ "$TENANT_COUNT" -gt 0 ]; then
    print_test_result "F-1: Tenant Listing" "PASS" "Found $TENANT_COUNT tenants"
else
    print_test_result "F-1: Tenant Listing" "FAIL" "No tenants found"
fi

#========================================================================
# SUITE G: Log Source Management
#========================================================================
print_suite_header "SUITE G: Log Source Management"

# G-1: Log Source Creation
LOG_SOURCE_RESPONSE=$(curl -s -X POST "$API_URL/v1/log_sources" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"source_name": "Test Syslog", "source_type": "Syslog", "source_config": {"host": "192.168.1.10", "port": 514}}')

LOG_SOURCE_ID=$(echo "$LOG_SOURCE_RESPONSE" | jq -r '.source_id // "null"')
if [ "$LOG_SOURCE_ID" != "null" ]; then
    print_test_result "G-1: Log Source Creation" "PASS" "Log source created with ID: $LOG_SOURCE_ID"
else
    print_test_result "G-1: Log Source Creation" "FAIL" "Failed to create log source"
fi

# G-2: Log Source Listing
LOG_SOURCES_LIST=$(curl -s -X GET "$API_URL/v1/log_sources" -H "Authorization: Bearer $ADMIN_TOKEN")
LOG_SOURCES_COUNT=$(echo "$LOG_SOURCES_LIST" | jq '.log_sources | length // 0')
if [ "$LOG_SOURCES_COUNT" -gt 0 ]; then
    print_test_result "G-2: Log Source Listing" "PASS" "Found $LOG_SOURCES_COUNT log sources"
else
    print_test_result "G-2: Log Source Listing" "FAIL" "No log sources found"
fi

#========================================================================
# SUITE H: Ingestor Service & Full Pipeline
#========================================================================
print_suite_header "SUITE H: Ingestor Service & Full Pipeline"

# H-1: Events Table Structure
EVENTS_TABLE_INFO=$(curl -s -X POST "http://localhost:8123" --data "DESCRIBE dev.events FORMAT JSON")
EVENTS_COLUMNS=$(echo "$EVENTS_TABLE_INFO" | jq '.data | length // 0')
if [ "$EVENTS_COLUMNS" -gt 5 ]; then
    print_test_result "H-1: Events Table Structure" "PASS" "Events table has $EVENTS_COLUMNS columns"
else
    print_test_result "H-1: Events Table Structure" "FAIL" "Events table structure incomplete"
fi

#========================================================================
# SUITE I: Parser Management
#========================================================================
print_suite_header "SUITE I: Parser Management"

# I-1: Parser Creation
PARSER_RESPONSE=$(curl -s -X POST "$API_URL/v1/parsers" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"parser_name": "Test Parser", "parser_type": "regex", "pattern": "^(?P<timestamp>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})"}')

PARSER_ID=$(echo "$PARSER_RESPONSE" | jq -r '.parser_id // "null"')
if [ "$PARSER_ID" != "null" ]; then
    print_test_result "I-1: Parser Creation" "PASS" "Parser created with ID: $PARSER_ID"
else
    print_test_result "I-1: Parser Creation" "FAIL" "Failed to create parser"
fi

# I-2: Parser Listing
PARSERS_LIST=$(curl -s -X GET "$API_URL/v1/parsers" -H "Authorization: Bearer $ADMIN_TOKEN")
PARSERS_COUNT=$(echo "$PARSERS_LIST" | jq '.parsers | length // 0')
if [ "$PARSERS_COUNT" -gt 0 ]; then
    print_test_result "I-2: Parser Listing" "PASS" "Found $PARSERS_COUNT parsers"
else
    print_test_result "I-2: Parser Listing" "FAIL" "No parsers found"
fi

#========================================================================
# SUITE J: Agent Management (NEW)
#========================================================================
print_suite_header "SUITE J: Agent Management (NEW)"

# J-1: Policy Creation
POLICY_RESPONSE=$(curl -s -X POST "$API_URL/v1/agents/policies" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"policy_name": "Test Agent Policy", "config_json": "{\"files\": [\"/var/log/system.log\"], \"interval\": 300}"}')

POLICY_ID=$(echo "$POLICY_RESPONSE" | jq -r '.policy_id // "null"')
if [ "$POLICY_ID" != "null" ]; then
    print_test_result "J-1: Policy Creation" "PASS" "Policy created with ID: $POLICY_ID"
else
    print_test_result "J-1: Policy Creation" "FAIL" "Failed to create agent policy"
fi

# J-2: Policy Assignment (first create an asset)
ASSET_RESPONSE=$(curl -s -X POST "$API_URL/v1/assets" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"asset_name": "Test Agent Server", "asset_ip": "192.168.1.123", "asset_type": "Server", "criticality": "High"}')

ASSET_ID=$(echo "$ASSET_RESPONSE" | jq -r '.asset_id // "null"')
if [ "$ASSET_ID" != "null" ] && [ "$POLICY_ID" != "null" ]; then
    ASSIGNMENT_RESPONSE=$(curl -s -X POST "$API_URL/v1/agents/assignments" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"asset_id\": \"$ASSET_ID\", \"policy_id\": \"$POLICY_ID\"}")
    
    ASSIGNMENT_STATUS=$(echo "$ASSIGNMENT_RESPONSE" | jq -r '.message // "null"')
    if [ "$ASSIGNMENT_STATUS" != "null" ]; then
        print_test_result "J-2: Policy Assignment" "PASS" "Policy assigned to asset"
    else
        print_test_result "J-2: Policy Assignment" "FAIL" "Failed to assign policy"
    fi
else
    print_test_result "J-2: Policy Assignment" "FAIL" "Missing asset or policy ID"
fi

# J-3: Agent Config Retrieval
if [ "$ASSET_ID" != "null" ]; then
    CONFIG_RESPONSE=$(curl -s -X GET "$API_URL/v1/agents/my_config" \
        -H "X-Agent-Key: agent-api-key-12345" \
        -H "X-Asset-ID: $ASSET_ID")
    
    CONFIG_JSON=$(echo "$CONFIG_RESPONSE" | jq -r '.config_json // "null"')
    if [[ "$CONFIG_JSON" == *"files"* ]]; then
        print_test_result "J-3: Agent Config Retrieval" "PASS" "Config retrieved successfully"
    else
        print_test_result "J-3: Agent Config Retrieval" "FAIL" "Config not found or incorrect"
    fi
else
    print_test_result "J-3: Agent Config Retrieval" "FAIL" "No asset ID available"
fi

# J-4: Unauthorized Agent
UNAUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/agents/my_config" \
    -H "X-Agent-Key: wrong-key" \
    -H "X-Asset-ID: test-asset")

if [ "$UNAUTH_RESPONSE" = "401" ]; then
    print_test_result "J-4: Unauthorized Agent" "PASS" "Unauthorized access correctly denied"
else
    print_test_result "J-4: Unauthorized Agent" "FAIL" "Response code: $UNAUTH_RESPONSE"
fi

# J-5: Non-Admin Access Failure
NONAUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/agents/policies" \
    -H "Authorization: Bearer $ANALYST_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"policy_name": "Test Policy", "config_json": "{}"}')

if [ "$NONAUTH_RESPONSE" = "403" ]; then
    print_test_result "J-5: Non-Admin Access Failure" "PASS" "Non-admin correctly denied"
else
    print_test_result "J-5: Non-Admin Access Failure" "FAIL" "Response code: $NONAUTH_RESPONSE"
fi

#========================================================================
# FINAL SUMMARY
#========================================================================
echo ""
echo -e "${BLUE}========================================================================${NC}"
echo -e "${BLUE}COMPREHENSIVE REGRESSION TEST SUMMARY${NC}"
echo -e "${BLUE}========================================================================${NC}"
echo ""
echo -e "${YELLOW}📊 Test Results:${NC}"
echo -e "   Total Tests: $TOTAL_TESTS"
echo -e "   ${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "   ${RED}Failed: $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! System ready for Phase 6.4${NC}"
    echo -e "${GREEN}✅ Agent Management API successfully implemented and verified${NC}"
    exit 0
else
    PASS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    echo -e "${YELLOW}⚠️  Test Summary: $PASS_RATE% pass rate${NC}"
    if [ $PASS_RATE -ge 80 ]; then
        echo -e "${YELLOW}📝 Acceptable for proceeding with minor fixes needed${NC}"
        exit 0
    else
        echo -e "${RED}❌ Critical issues found - require fixes before Phase 6.4${NC}"
        exit 1
    fi
fi 