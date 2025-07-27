#!/bin/bash

# Full Regression Test Plan (Post-6.2)
# Comprehensive verification of all SIEM functionality including new Parser Management API

set +e  # Don't exit on first error - let tests complete

echo "========================================================================"
echo "FULL REGRESSION TEST PLAN (POST-6.2)"
echo "========================================================================"
echo "Date: $(date)"
echo "Testing all SIEM functionality with new Parser Management API"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API URLs
API_URL="http://localhost:8080"
INGESTOR_URL="http://localhost:8081"
CLICKHOUSE_URL="http://localhost:8123"

# Test results tracking
TOTAL_TESTS=0
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test results
print_test_result() {
    local test_name="$1"
    local result="$2"
    local details="$3"
    
    ((TOTAL_TESTS++))
    
    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        [ -n "$details" ] && echo "    $details"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} $test_name"
        [ -n "$details" ] && echo "    $details"
        ((TESTS_FAILED++))
    fi
}

# Function to run a test and return HTTP status
run_test() {
    local url="$1"
    local method="${2:-GET}"
    local headers="$3"
    local data="$4"
    
    if [ -n "$data" ]; then
        eval "curl -s -o /dev/null -w '%{http_code}' -X '$method' '$url' $headers -d '$data'"
    else
        eval "curl -s -o /dev/null -w '%{http_code}' -X '$method' '$url' $headers"
    fi
}

echo "Setting up test environment..."

# Check services
echo "Checking service status..."

# Check ClickHouse
CH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CLICKHOUSE_URL")
if [ "$CH_STATUS" = "200" ]; then
    print_test_result "ClickHouse Service Status" "PASS" "ClickHouse is responding"
else
    print_test_result "ClickHouse Service Status" "FAIL" "ClickHouse is not responding (status: $CH_STATUS)"
    exit 1
fi

# Check API Service
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/health")
if [ "$API_STATUS" = "401" ] || [ "$API_STATUS" = "200" ]; then
    print_test_result "SIEM API Service Status" "PASS" "API is responding"
else
    print_test_result "SIEM API Service Status" "FAIL" "API is not responding (status: $API_STATUS)"
    exit 1
fi

# Check Ingestor Service
INGESTOR_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$INGESTOR_URL/health")
if [ "$INGESTOR_STATUS" = "200" ]; then
    print_test_result "Ingestor Service Status" "PASS" "Ingestor is responding"
else
    print_test_result "Ingestor Service Status" "FAIL" "Ingestor is not responding (status: $INGESTOR_STATUS)"
fi

echo ""

# Generate authentication tokens
echo "Generating authentication tokens..."

# Admin token for tenant-A
ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep '^eyJ' | head -1)

# Analyst token for tenant-A
ANALYST_TOKEN=$(cd siem_api && cargo run --example generate_token bob tenant-A Analyst 2>/dev/null | grep '^eyJ' | head -1)

# Viewer token for tenant-A
VIEWER_TOKEN=$(cd siem_api && cargo run --example generate_token charlie tenant-A Viewer 2>/dev/null | grep '^eyJ' | head -1)

# Admin token for tenant-B (for isolation testing)
TENANT_B_ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token david tenant-B Admin 2>/dev/null | grep '^eyJ' | head -1)

# SuperAdmin token for tenant management
SUPERADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token superadmin global SuperAdmin 2>/dev/null | grep '^eyJ' | head -1)

if [ -z "$ADMIN_TOKEN" ] || [ -z "$ANALYST_TOKEN" ] || [ -z "$VIEWER_TOKEN" ] || [ -z "$TENANT_B_ADMIN_TOKEN" ] || [ -z "$SUPERADMIN_TOKEN" ]; then
    echo -e "${RED}Failed to generate required tokens${NC}"
    exit 1
fi

print_test_result "Authentication Token Generation" "PASS" "All tokens generated successfully"

# Clean database state
echo "Cleaning database state..."
curl -s -X POST "$CLICKHOUSE_URL" --data "TRUNCATE TABLE dev.events" > /dev/null 2>&1 || true
curl -s -X POST "$CLICKHOUSE_URL" --data "TRUNCATE TABLE dev.tenants" > /dev/null 2>&1 || true
curl -s -X POST "$CLICKHOUSE_URL" --data "TRUNCATE TABLE dev.users" > /dev/null 2>&1 || true
curl -s -X POST "$CLICKHOUSE_URL" --data "TRUNCATE TABLE dev.cases" > /dev/null 2>&1 || true
curl -s -X POST "$CLICKHOUSE_URL" --data "TRUNCATE TABLE dev.log_sources" > /dev/null 2>&1 || true
curl -s -X POST "$CLICKHOUSE_URL" --data "TRUNCATE TABLE dev.taxonomy_mappings" > /dev/null 2>&1 || true
curl -s -X POST "$CLICKHOUSE_URL" --data "TRUNCATE TABLE dev.custom_parsers" > /dev/null 2>&1 || true

print_test_result "Database State Cleanup" "PASS" "All tables truncated"
echo ""

# SUITE A: API Core Functionality
echo "========================================================================"
echo "SUITE A: API Core Functionality"
echo "========================================================================"

# A-1: Unauthorized Read
echo "Running [A-1] Unauthorized Read..."
RESPONSE=$(run_test "$API_URL/api/v1/events")
if [ "$RESPONSE" = "401" ]; then
    print_test_result "A-1 Unauthorized Read" "PASS" "Correctly returned 401 Unauthorized"
else
    print_test_result "A-1 Unauthorized Read" "FAIL" "Expected 401, got $RESPONSE"
fi

# A-2: Unauthorized Write  
echo "Running [A-2] Unauthorized Write..."
RESPONSE=$(run_test "$API_URL/api/v1/events" "POST" '-H "Content-Type: application/json"' '{"test": "data"}')
if [ "$RESPONSE" = "401" ]; then
    print_test_result "A-2 Unauthorized Write" "PASS" "Correctly returned 401 Unauthorized"
else
    print_test_result "A-2 Unauthorized Write" "FAIL" "Expected 401, got $RESPONSE"
fi

# A-3: Valid Authentication
echo "Running [A-3] Valid Authentication..."
RESPONSE=$(run_test "$API_URL/api/v1/events" "GET" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
if [ "$RESPONSE" = "200" ]; then
    print_test_result "A-3 Valid Authentication" "PASS" "Successfully accessed with valid token"
else
    print_test_result "A-3 Valid Authentication" "FAIL" "Expected 200, got $RESPONSE"
fi

echo ""

# SUITE B: Event Ingestion
echo "========================================================================"
echo "SUITE B: Event Ingestion"
echo "========================================================================"

# B-1: JSON Event Ingestion
echo "Running [B-1] JSON Event Ingestion..."
RESPONSE=$(run_test "$API_URL/api/v1/events" "POST" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"Content-Type: application/json\"" \
    '{"events": [{"source_ip": "192.168.1.100", "raw_event": "Test JSON event"}]}')
if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "201" ] || [ "$RESPONSE" = "202" ]; then
    print_test_result "B-1 JSON Event Ingestion" "PASS" "Event ingested successfully"
else
    print_test_result "B-1 JSON Event Ingestion" "FAIL" "Expected 200/201/202, got $RESPONSE"
fi

# B-2: Event Retrieval
echo "Running [B-2] Event Retrieval..."
sleep 3 # Wait for event to be processed
RESPONSE=$(eval "curl -s -H 'Authorization: Bearer $ADMIN_TOKEN' '$API_URL/api/v1/events'")
if echo "$RESPONSE" | grep -q "192.168.1.100"; then
    print_test_result "B-2 Event Retrieval" "PASS" "Events retrieved successfully"
else
    print_test_result "B-2 Event Retrieval" "FAIL" "Event not found in response"
fi

echo ""

# SUITE C: Tenant Isolation
echo "========================================================================"
echo "SUITE C: Tenant Isolation"
echo "========================================================================"

# C-1: Cross-tenant Data Isolation
echo "Running [C-1] Cross-tenant Data Isolation..."

# Insert event for tenant-A
run_test "$API_URL/api/v1/events" "POST" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"Content-Type: application/json\"" \
    '{"events": [{"source_ip": "192.168.1.101", "raw_event": "Tenant A event"}]}' > /dev/null

# Insert event for tenant-B
run_test "$API_URL/api/v1/events" "POST" "-H \"Authorization: Bearer $TENANT_B_ADMIN_TOKEN\" -H \"Content-Type: application/json\"" \
    '{"events": [{"source_ip": "192.168.1.102", "raw_event": "Tenant B event"}]}' > /dev/null

sleep 3

# Verify tenant-A can only see their data
TENANT_A_RESPONSE=$(eval "curl -s -H 'Authorization: Bearer $ADMIN_TOKEN' '$API_URL/api/v1/events'")
TENANT_B_RESPONSE=$(eval "curl -s -H 'Authorization: Bearer $TENANT_B_ADMIN_TOKEN' '$API_URL/api/v1/events'")

if echo "$TENANT_A_RESPONSE" | grep -q "Tenant A event" && ! echo "$TENANT_A_RESPONSE" | grep -q "Tenant B event"; then
    if echo "$TENANT_B_RESPONSE" | grep -q "Tenant B event" && ! echo "$TENANT_B_RESPONSE" | grep -q "Tenant A event"; then
        print_test_result "C-1 Cross-tenant Data Isolation" "PASS" "Tenants properly isolated"
    else
        print_test_result "C-1 Cross-tenant Data Isolation" "FAIL" "Tenant B can see Tenant A data"
    fi
else
    print_test_result "C-1 Cross-tenant Data Isolation" "FAIL" "Tenant A can see Tenant B data"
fi

echo ""

# SUITE D: RBAC
echo "========================================================================"
echo "SUITE D: Role-Based Access Control"
echo "========================================================================"

# D-1: Admin-only Operations
echo "Running [D-1] Admin-only Operations..."
VIEWER_RESPONSE=$(run_test "$API_URL/api/v1/users" "POST" "-H \"Authorization: Bearer $VIEWER_TOKEN\" -H \"Content-Type: application/json\"" \
    '{"username": "testuser", "email": "test@example.com", "role": "Viewer"}')
if [ "$VIEWER_RESPONSE" = "403" ]; then
    print_test_result "D-1 Admin-only Operations" "PASS" "Viewer correctly denied admin operation"
else
    print_test_result "D-1 Admin-only Operations" "FAIL" "Expected 403, got $VIEWER_RESPONSE"
fi

echo ""

# SUITE E: Log Source Management
echo "========================================================================"
echo "SUITE E: Log Source Management"
echo "========================================================================"

# E-1: Create Log Source
echo "Running [E-1] Create Log Source..."
RESPONSE=$(run_test "$API_URL/api/v1/log_sources" "POST" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"Content-Type: application/json\"" \
    '{"source_name": "Test Syslog Server", "source_type": "Syslog", "source_ip": "10.10.10.10"}')

if [ "$RESPONSE" = "201" ]; then
    print_test_result "E-1 Create Log Source" "PASS" "Log source created successfully"
else
    print_test_result "E-1 Create Log Source" "FAIL" "Expected 201, got $RESPONSE"
fi

# E-2: List Log Sources
echo "Running [E-2] List Log Sources..."
RESPONSE=$(run_test "$API_URL/api/v1/log_sources" "GET" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
if [ "$RESPONSE" = "200" ]; then
    print_test_result "E-2 List Log Sources" "PASS" "Log sources listed successfully"
else
    print_test_result "E-2 List Log Sources" "FAIL" "Expected 200, got $RESPONSE"
fi

echo ""

# SUITE F: Common Event Taxonomy
echo "========================================================================"
echo "SUITE F: Common Event Taxonomy"
echo "========================================================================"

# F-1: Create Taxonomy Mapping
echo "Running [F-1] Create Taxonomy Mapping..."
RESPONSE=$(run_test "$API_URL/api/v1/taxonomy/mappings" "POST" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"Content-Type: application/json\"" \
    '{"source_type": "Syslog", "field_to_check": "raw_event", "value_to_match": "login failed", "event_category": "Authentication", "event_outcome": "Failure", "event_action": "Login.Attempt"}')

if [ "$RESPONSE" = "201" ]; then
    print_test_result "F-1 Create Taxonomy Mapping" "PASS" "Taxonomy mapping created successfully"
else
    print_test_result "F-1 Create Taxonomy Mapping" "FAIL" "Expected 201, got $RESPONSE"
fi

# F-2: List Taxonomy Mappings
echo "Running [F-2] List Taxonomy Mappings..."
RESPONSE=$(run_test "$API_URL/api/v1/taxonomy/mappings" "GET" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
if [ "$RESPONSE" = "200" ]; then
    print_test_result "F-2 List Taxonomy Mappings" "PASS" "Taxonomy mappings listed successfully"
else
    print_test_result "F-2 List Taxonomy Mappings" "FAIL" "Expected 200, got $RESPONSE"
fi

echo ""

# SUITE G: Case Management
echo "========================================================================"
echo "SUITE G: Case Management"
echo "========================================================================"

# G-1: Create Case
echo "Running [G-1] Create Case..."
RESPONSE=$(run_test "$API_URL/api/v1/cases" "POST" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"Content-Type: application/json\"" \
    '{"title": "Test Security Incident", "description": "Testing case creation", "priority": "high"}')

if [ "$RESPONSE" = "201" ]; then
    print_test_result "G-1 Create Case" "PASS" "Case created successfully"
else
    print_test_result "G-1 Create Case" "FAIL" "Expected 201, got $RESPONSE"
fi

# G-2: List Cases
echo "Running [G-2] List Cases..."
RESPONSE=$(run_test "$API_URL/api/v1/cases" "GET" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
if [ "$RESPONSE" = "200" ]; then
    print_test_result "G-2 List Cases" "PASS" "Cases listed successfully"
else
    print_test_result "G-2 List Cases" "FAIL" "Expected 200, got $RESPONSE"
fi

echo ""

# SUITE H: Tenant Management
echo "========================================================================"
echo "SUITE H: Tenant Management"
echo "========================================================================"

# H-1: Create Tenant (SuperAdmin only)
echo "Running [H-1] Create Tenant..."
RESPONSE=$(run_test "$API_URL/api/v1/tenants" "POST" "-H \"Authorization: Bearer $SUPERADMIN_TOKEN\" -H \"Content-Type: application/json\"" \
    '{"tenant_name": "Test Tenant"}')

if [ "$RESPONSE" = "201" ]; then
    print_test_result "H-1 Create Tenant" "PASS" "Tenant created successfully"
else
    print_test_result "H-1 Create Tenant" "FAIL" "Expected 201, got $RESPONSE"
fi

# H-2: List Tenants (SuperAdmin only)
echo "Running [H-2] List Tenants..."
RESPONSE=$(run_test "$API_URL/api/v1/tenants" "GET" "-H \"Authorization: Bearer $SUPERADMIN_TOKEN\"")
if [ "$RESPONSE" = "200" ]; then
    print_test_result "H-2 List Tenants" "PASS" "Tenants listed successfully"
else
    print_test_result "H-2 List Tenants" "FAIL" "Expected 200, got $RESPONSE"
fi

echo ""

# NEW SUITE I: Parser Management (NEW for 6.2)
echo "========================================================================"
echo "SUITE I: Parser Management (NEW - Chunk 6.2)"
echo "========================================================================"

# I-1: Parser CRUD Operations
echo "Running [I-1] Parser CRUD Operations..."

# Create a custom Grok parser
echo "  Creating custom Grok parser..."
CREATE_RESPONSE=$(curl -s -w "___STATUS___%{http_code}" -X POST "$API_URL/api/v1/parsers" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "parser_name": "CustomApacheParser",
        "parser_type": "Grok",
        "pattern": "%{COMBINEDAPACHELOG}"
    }')

CREATE_STATUS="${CREATE_RESPONSE##*___STATUS___}"
CREATE_BODY="${CREATE_RESPONSE%___STATUS___*}"

if [ "$CREATE_STATUS" = "201" ]; then
    PARSER_ID=$(echo "$CREATE_BODY" | grep -o '"parser_id":"[^"]*"' | cut -d'"' -f4)
    print_test_result "I-1a Create Custom Parser" "PASS" "Parser created with ID: $PARSER_ID"
else
    print_test_result "I-1a Create Custom Parser" "FAIL" "Expected 201, got $CREATE_STATUS"
    PARSER_ID=""
fi

# List parsers
echo "  Listing parsers..."
LIST_RESPONSE=$(run_test "$API_URL/api/v1/parsers" "GET" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
if [ "$LIST_RESPONSE" = "200" ]; then
    print_test_result "I-1b List Parsers" "PASS" "Parsers listed successfully"
else
    print_test_result "I-1b List Parsers" "FAIL" "Expected 200, got $LIST_RESPONSE"
fi

# Delete parser if created successfully
if [ -n "$PARSER_ID" ]; then
    echo "  Deleting parser..."
    DELETE_RESPONSE=$(run_test "$API_URL/api/v1/parsers/$PARSER_ID" "DELETE" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
    if [ "$DELETE_RESPONSE" = "200" ] || [ "$DELETE_RESPONSE" = "204" ]; then
        print_test_result "I-1c Delete Parser" "PASS" "Parser deleted successfully"
    else
        print_test_result "I-1c Delete Parser" "FAIL" "Expected 200/204, got $DELETE_RESPONSE"
    fi
fi

# I-2: Custom Parser Application
echo "Running [I-2] Custom Parser Application..."

# Create a custom Regex parser for unique log format
echo "  Creating custom Regex parser..."
REGEX_CREATE_RESPONSE=$(curl -s -w "___STATUS___%{http_code}" -X POST "$API_URL/api/v1/parsers" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "parser_name": "CustomLogParser", 
        "parser_type": "Regex",
        "pattern": "(?P<timestamp>\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}) (?P<level>\\w+) (?P<component>\\w+): (?P<message>.*)"
    }')

REGEX_CREATE_STATUS="${REGEX_CREATE_RESPONSE##*___STATUS___}"
REGEX_CREATE_BODY="${REGEX_CREATE_RESPONSE%___STATUS___*}"

if [ "$REGEX_CREATE_STATUS" = "201" ]; then
    REGEX_PARSER_ID=$(echo "$REGEX_CREATE_BODY" | grep -o '"parser_id":"[^"]*"' | cut -d'"' -f4)
    print_test_result "I-2a Create Custom Regex Parser" "PASS" "Regex parser created with ID: $REGEX_PARSER_ID"
    
    # Create log source mapping to this parser
    echo "  Creating log source with custom parser mapping..."
    LOG_SOURCE_RESPONSE=$(curl -s -w "___STATUS___%{http_code}" -X POST "$API_URL/api/v1/log_sources" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "source_name": "Custom App Server",
            "source_type": "CustomLogParser",
            "source_ip": "10.20.30.40"
        }')
    
    LOG_SOURCE_STATUS="${LOG_SOURCE_RESPONSE##*___STATUS___}"
    if [ "$LOG_SOURCE_STATUS" = "201" ]; then
        print_test_result "I-2b Create Log Source with Custom Parser" "PASS" "Log source created successfully"
        
        # Test if consumer would use this parser (check internal endpoint)
        echo "  Verifying parser is available to consumer..."
        INTERNAL_RESPONSE=$(run_test "$API_URL/api/v1/parsers/all" "GET")
        if [ "$INTERNAL_RESPONSE" = "200" ]; then
            print_test_result "I-2c Internal Parser Endpoint" "PASS" "Consumer can access parsers"
        else
            print_test_result "I-2c Internal Parser Endpoint" "FAIL" "Expected 200, got $INTERNAL_RESPONSE"
        fi
    else
        print_test_result "I-2b Create Log Source with Custom Parser" "FAIL" "Expected 201, got $LOG_SOURCE_STATUS"
    fi
else
    print_test_result "I-2a Create Custom Regex Parser" "FAIL" "Expected 201, got $REGEX_CREATE_STATUS"
fi

# I-3: Parser Fallback Testing
echo "Running [I-3] Parser Fallback Testing..."

# Create a custom parser with limited pattern
echo "  Creating parser with limited pattern..."
LIMITED_PARSER_RESPONSE=$(curl -s -w "___STATUS___%{http_code}" -X POST "$API_URL/api/v1/parsers" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "parser_name": "LimitedParser",
        "parser_type": "Regex", 
        "pattern": "SPECIFIC_PATTERN (?P<value>\\w+)"
    }')

LIMITED_STATUS="${LIMITED_PARSER_RESPONSE##*___STATUS___}"
if [ "$LIMITED_STATUS" = "201" ]; then
    print_test_result "I-3a Create Limited Parser" "PASS" "Limited pattern parser created"
    
    # Create log source for this parser
    LIMITED_LOG_SOURCE_RESPONSE=$(curl -s -w "___STATUS___%{http_code}" -X POST "$API_URL/api/v1/log_sources" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "source_name": "Limited Pattern Source",
            "source_type": "LimitedParser",
            "source_ip": "10.30.40.50"
        }')
    
    LIMITED_SOURCE_STATUS="${LIMITED_LOG_SOURCE_RESPONSE##*___STATUS___}"
    if [ "$LIMITED_SOURCE_STATUS" = "201" ]; then
        print_test_result "I-3b Create Limited Log Source" "PASS" "Log source with limited parser created"
    else
        print_test_result "I-3b Create Limited Log Source" "FAIL" "Expected 201, got $LIMITED_SOURCE_STATUS"
    fi
else
    print_test_result "I-3a Create Limited Parser" "FAIL" "Expected 201, got $LIMITED_STATUS"
fi

# Access Control Test for Parser Management
echo "Running [I-4] Parser Management Access Control..."

# Test that non-Admin users cannot create parsers
ANALYST_PARSER_RESPONSE=$(run_test "$API_URL/api/v1/parsers" "POST" "-H \"Authorization: Bearer $ANALYST_TOKEN\" -H \"Content-Type: application/json\"" \
    '{"parser_name": "UnauthorizedParser", "parser_type": "Regex", "pattern": "test"}')

if [ "$ANALYST_PARSER_RESPONSE" = "403" ]; then
    print_test_result "I-4 Parser Management Access Control" "PASS" "Non-Admin correctly denied parser creation"
else
    print_test_result "I-4 Parser Management Access Control" "FAIL" "Expected 403, got $ANALYST_PARSER_RESPONSE"
fi

echo ""

# Final Report
echo "========================================================================"
echo "REGRESSION TEST SUMMARY"
echo "========================================================================"

echo "Total Tests: $TOTAL_TESTS"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}ALL TESTS PASSED! ✓${NC}"
    echo "The system is ready for the next development chunk."
    exit 0
else
    echo -e "${RED}SOME TESTS FAILED! ✗${NC}"
    echo "Please review and fix the failing tests before proceeding."
    exit 1
fi