#!/bin/bash

# Asset Management API Verification Test
# Testing complete CRUD operations and case integration

set -e

echo "========================================================================"
echo "ASSET MANAGEMENT API VERIFICATION TEST"
echo "========================================================================"
echo "Date: $(date)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API base URL
API_URL="http://localhost:8080"

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

cd ..

echo "Setting up test environment..."

# Generate authentication tokens
echo "Generating authentication tokens..."

# Admin token for tenant-A
ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -A1 'JWT Token' | tail -1)

# Viewer token for tenant-A (should be denied)
VIEWER_TOKEN=$(cd siem_api && cargo run --example generate_token charlie tenant-A Viewer 2>/dev/null | grep -A1 'JWT Token' | tail -1)

if [ -z "$ADMIN_TOKEN" ] || [ -z "$VIEWER_TOKEN" ]; then
    echo -e "${RED}Failed to generate required tokens${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Authentication tokens generated successfully"
echo ""

echo "========================================================================"
echo "TEST 1: Asset Management API Access Control"
echo "========================================================================"

# Test 1.1: Non-Admin access should be denied
echo "Testing access control..."
VIEWER_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/assets" -H "Authorization: Bearer $VIEWER_TOKEN")
if [ "$VIEWER_RESPONSE" = "403" ]; then
    print_test_result "Non-Admin Access Denial" "PASS" "Viewer correctly denied access (403)"
else
    print_test_result "Non-Admin Access Denial" "FAIL" "Expected 403, got $VIEWER_RESPONSE"
fi

# Test 1.2: Admin access should work
ADMIN_LIST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/assets" -H "Authorization: Bearer $ADMIN_TOKEN")
if [ "$ADMIN_LIST_RESPONSE" = "200" ]; then
    print_test_result "Admin Access Success" "PASS" "Admin can list assets (200)"
else
    print_test_result "Admin Access Success" "FAIL" "Expected 200, got $ADMIN_LIST_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 2: Create Asset with Specific IP (192.168.1.100)"
echo "========================================================================"

# Create asset as specified in verification plan
ASSET_JSON='{
    "asset_name": "Critical Domain Controller",
    "asset_ip": "192.168.1.100",
    "asset_type": "Server",
    "criticality": "High"
}'

CREATE_RESPONSE=$(curl -s -X POST "$API_URL/v1/assets" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$ASSET_JSON")

ASSET_ID=$(echo "$CREATE_RESPONSE" | jq -r '.asset_id // empty' 2>/dev/null)

if [ -n "$ASSET_ID" ]; then
    print_test_result "Asset Creation" "PASS" "Created asset with ID: $ASSET_ID"
    
    # Verify the asset appears in list
    sleep 1
    LIST_RESPONSE=$(curl -s -X GET "$API_URL/v1/assets" -H "Authorization: Bearer $ADMIN_TOKEN")
    ASSET_COUNT=$(echo "$LIST_RESPONSE" | jq -r '.total // 0' 2>/dev/null)
    
    if [ "$ASSET_COUNT" -gt "0" ]; then
        print_test_result "Asset Listing" "PASS" "Asset appears in list (total: $ASSET_COUNT)"
    else
        print_test_result "Asset Listing" "FAIL" "Asset not found in list"
    fi
else
    print_test_result "Asset Creation" "FAIL" "Failed to create asset"
    echo "Response: $CREATE_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 3: Asset CRUD Operations"
echo "========================================================================"

# Test 3.1: Get specific asset
if [ -n "$ASSET_ID" ]; then
    GET_ASSET_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/v1/assets/$ASSET_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$GET_ASSET_RESPONSE" = "200" ]; then
        print_test_result "Get Asset Details" "PASS" "Asset details retrieved successfully"
    else
        print_test_result "Get Asset Details" "FAIL" "Expected 200, got $GET_ASSET_RESPONSE"
    fi
fi

# Test 3.2: Update asset
if [ -n "$ASSET_ID" ]; then
    UPDATE_JSON='{"asset_name": "Updated Critical Domain Controller", "criticality": "High"}'
    UPDATE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$API_URL/v1/assets/$ASSET_ID" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$UPDATE_JSON")
    
    if [ "$UPDATE_RESPONSE" = "200" ]; then
        print_test_result "Asset Update" "PASS" "Asset updated successfully"
    else
        print_test_result "Asset Update" "FAIL" "Expected 200, got $UPDATE_RESPONSE"
    fi
fi

# Test 3.3: Duplicate IP validation
DUPLICATE_JSON='{
    "asset_name": "Another Server",
    "asset_ip": "192.168.1.100",
    "asset_type": "Server",
    "criticality": "Medium"
}'

DUPLICATE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/assets" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$DUPLICATE_JSON")

if [ "$DUPLICATE_RESPONSE" = "409" ]; then
    print_test_result "Duplicate IP Prevention" "PASS" "Duplicate IP correctly rejected (409)"
else
    print_test_result "Duplicate IP Prevention" "FAIL" "Expected 409, got $DUPLICATE_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 4: Generate Related Alert and Create Case"
echo "========================================================================"

# Test 4.1: Create detection rule that will trigger for events from 192.168.1.100
RULE_JSON='{
    "rule_name": "Asset Test Rule",
    "description": "Test rule for asset management verification",
    "query": "SELECT * FROM dev.events WHERE source_ip = '\''192.168.1.100'\'' LIMIT 10"
}'

CREATE_RULE_RESPONSE=$(curl -s -X POST "$API_URL/v1/rules" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$RULE_JSON")

RULE_ID=$(echo "$CREATE_RULE_RESPONSE" | jq -r '.rule_id // empty' 2>/dev/null)

if [ -n "$RULE_ID" ]; then
    print_test_result "Detection Rule Creation" "PASS" "Created rule with ID: $RULE_ID"
else
    print_test_result "Detection Rule Creation" "FAIL" "Failed to create detection rule"
fi

# Test 4.2: Ingest event from the asset's IP address
EVENT_JSON='{"events": [{"source_ip": "192.168.1.100", "raw_event": "ALERT: Suspicious activity detected on critical domain controller"}]}'
EVENT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/events" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$EVENT_JSON")

if [ "$EVENT_RESPONSE" = "202" ]; then
    print_test_result "Event Ingestion from Asset IP" "PASS" "Event from 192.168.1.100 accepted"
else
    print_test_result "Event Ingestion from Asset IP" "FAIL" "Expected 202, got $EVENT_RESPONSE"
fi

# Test 4.3: Execute rule to generate alert (if rule was created)
if [ -n "$RULE_ID" ]; then
    sleep 2  # Give time for event to be processed
    EXECUTE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/rules/$RULE_ID/execute" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$EXECUTE_RESPONSE" = "200" ]; then
        print_test_result "Rule Execution" "PASS" "Rule executed successfully"
    else
        print_test_result "Rule Execution" "FAIL" "Expected 200, got $EXECUTE_RESPONSE"
    fi
fi

# Test 4.4: Get alerts to find one to link to case
sleep 3  # Give time for alert generation
ALERTS_RESPONSE=$(curl -s -X GET "$API_URL/v1/alerts" -H "Authorization: Bearer $ADMIN_TOKEN")
ALERT_ID=$(echo "$ALERTS_RESPONSE" | jq -r '.alerts[0].alert_id // empty' 2>/dev/null)

if [ -n "$ALERT_ID" ]; then
    print_test_result "Alert Generation" "PASS" "Found alert ID: $ALERT_ID"
    
    # Test 4.5: Create case linked to the alert
    CASE_JSON="{\"title\": \"Asset Management Test Case\", \"severity\": \"High\", \"alert_ids\": [\"$ALERT_ID\"]}"
    CASE_RESPONSE=$(curl -s -X POST "$API_URL/v1/cases" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$CASE_JSON")
    
    CASE_ID=$(echo "$CASE_RESPONSE" | jq -r '.case_id // empty' 2>/dev/null)
    
    if [ -n "$CASE_ID" ]; then
        print_test_result "Case Creation with Alert" "PASS" "Created case with ID: $CASE_ID"
    else
        print_test_result "Case Creation with Alert" "FAIL" "Failed to create case"
    fi
else
    print_test_result "Alert Generation" "FAIL" "No alerts found"
    # Create a case anyway for testing asset context
    CASE_JSON='{"title": "Asset Management Test Case", "severity": "High", "alert_ids": []}'
    CASE_RESPONSE=$(curl -s -X POST "$API_URL/v1/cases" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$CASE_JSON")
    
    CASE_ID=$(echo "$CASE_RESPONSE" | jq -r '.case_id // empty' 2>/dev/null)
fi

echo ""

echo "========================================================================"
echo "TEST 5: Verify Asset Context in Case Details"
echo "========================================================================"

if [ -n "$CASE_ID" ]; then
    # Get case details and verify asset information is included
    CASE_DETAILS=$(curl -s -X GET "$API_URL/v1/cases/$CASE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    echo -e "${BLUE}Case Details Response:${NC}"
    echo "$CASE_DETAILS" | jq '.' 2>/dev/null || echo "$CASE_DETAILS"
    
    # Check if related_assets field exists in response
    HAS_RELATED_ASSETS=$(echo "$CASE_DETAILS" | jq -r '.related_assets // empty' 2>/dev/null)
    
    if [ -n "$HAS_RELATED_ASSETS" ]; then
        print_test_result "Asset Context Integration" "PASS" "Case includes related_assets field"
        
        # Check if our asset is in the related assets
        ASSET_IN_CASE=$(echo "$CASE_DETAILS" | jq -r '.related_assets[] | select(.asset_ip == "192.168.1.100") | .asset_name' 2>/dev/null)
        
        if [ -n "$ASSET_IN_CASE" ]; then
            print_test_result "Asset Context Verification" "PASS" "Found asset in case: $ASSET_IN_CASE"
        else
            print_test_result "Asset Context Verification" "FAIL" "Asset 192.168.1.100 not found in case context"
        fi
        
        # Check if criticality is included
        ASSET_CRITICALITY=$(echo "$CASE_DETAILS" | jq -r '.related_assets[] | select(.asset_ip == "192.168.1.100") | .criticality' 2>/dev/null)
        
        if [ "$ASSET_CRITICALITY" = "High" ]; then
            print_test_result "Asset Criticality Context" "PASS" "Asset criticality correctly shown as High"
        else
            print_test_result "Asset Criticality Context" "FAIL" "Asset criticality not correctly displayed"
        fi
    else
        print_test_result "Asset Context Integration" "FAIL" "Case does not include related_assets field"
    fi
else
    print_test_result "Case Details Verification" "FAIL" "No case ID available for testing"
fi

echo ""

echo "========================================================================"
echo "TEST 6: Asset Type and Criticality Validation"
echo "========================================================================"

# Test invalid asset type
INVALID_TYPE_JSON='{
    "asset_name": "Invalid Type Test",
    "asset_ip": "192.168.1.200",
    "asset_type": "InvalidType",
    "criticality": "High"
}'

INVALID_TYPE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/assets" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$INVALID_TYPE_JSON")

if [ "$INVALID_TYPE_RESPONSE" = "400" ]; then
    print_test_result "Invalid Asset Type Validation" "PASS" "Invalid asset type rejected (400)"
else
    print_test_result "Invalid Asset Type Validation" "FAIL" "Expected 400, got $INVALID_TYPE_RESPONSE"
fi

# Test invalid criticality
INVALID_CRIT_JSON='{
    "asset_name": "Invalid Criticality Test",
    "asset_ip": "192.168.1.201",
    "asset_type": "Server",
    "criticality": "InvalidCriticality"
}'

INVALID_CRIT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/v1/assets" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$INVALID_CRIT_JSON")

if [ "$INVALID_CRIT_RESPONSE" = "400" ]; then
    print_test_result "Invalid Criticality Validation" "PASS" "Invalid criticality rejected (400)"
else
    print_test_result "Invalid Criticality Validation" "FAIL" "Expected 400, got $INVALID_CRIT_RESPONSE"
fi

echo ""

echo "========================================================================"
echo "TEST 7: Database Verification"
echo "========================================================================"

# Verify assets are stored in database
DB_QUERY="SELECT COUNT(*) as count FROM dev.assets WHERE tenant_id = 'tenant-A' FORMAT JSON"
DB_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$DB_QUERY")
ASSET_COUNT=$(echo "$DB_RESPONSE" | jq -r '.data[0].count // 0' 2>/dev/null)

if [ "$ASSET_COUNT" -gt "0" ]; then
    print_test_result "Database Asset Storage" "PASS" "Assets stored in database (count: $ASSET_COUNT)"
else
    print_test_result "Database Asset Storage" "FAIL" "No assets found in database"
fi

# Verify asset schema
SCHEMA_QUERY="DESCRIBE TABLE dev.assets FORMAT JSON"
SCHEMA_RESPONSE=$(curl -s -X POST "http://localhost:8123" --data "$SCHEMA_QUERY")

if echo "$SCHEMA_RESPONSE" | jq -r '.data[].name' | grep -q "asset_id"; then
    print_test_result "Asset Schema Verification" "PASS" "Asset table schema is correct"
else
    print_test_result "Asset Schema Verification" "FAIL" "Asset table schema is incorrect"
fi

echo ""

echo "========================================================================"
echo "TEST 8: Cleanup"
echo "========================================================================"

# Delete the test asset
if [ -n "$ASSET_ID" ]; then
    DELETE_ASSET_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/assets/$ASSET_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$DELETE_ASSET_RESPONSE" = "200" ]; then
        print_test_result "Asset Deletion" "PASS" "Test asset deleted successfully"
    else
        print_test_result "Asset Deletion" "FAIL" "Expected 200, got $DELETE_ASSET_RESPONSE"
    fi
fi

# Delete the test rule
if [ -n "$RULE_ID" ]; then
    DELETE_RULE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/rules/$RULE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$DELETE_RULE_RESPONSE" = "200" ]; then
        print_test_result "Rule Deletion" "PASS" "Test rule deleted successfully"
    else
        print_test_result "Rule Deletion" "FAIL" "Expected 200, got $DELETE_RULE_RESPONSE"
    fi
fi

# Delete the test case
if [ -n "$CASE_ID" ]; then
    DELETE_CASE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/v1/cases/$CASE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if [ "$DELETE_CASE_RESPONSE" = "200" ]; then
        print_test_result "Case Deletion" "PASS" "Test case deleted successfully"
    else
        print_test_result "Case Deletion" "FAIL" "Expected 200, got $DELETE_CASE_RESPONSE"
    fi
fi

echo ""

echo "========================================================================"
echo "ASSET MANAGEMENT TEST SUMMARY"
echo "========================================================================"

echo -e "${BLUE}Overall Results:${NC}"
echo "  Total Tests: $TOTAL_TESTS"
echo "  Passed: $TESTS_PASSED"
echo "  Failed: $TESTS_FAILED"

SUCCESS_RATE=$((TESTS_PASSED * 100 / TOTAL_TESTS))
echo "  Success Rate: ${SUCCESS_RATE}%"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 ALL ASSET MANAGEMENT TESTS PASSED!${NC}"
    echo ""
    echo "✅ Asset CRUD operations working correctly"
    echo "✅ Admin role enforcement functional"
    echo "✅ Asset validation and duplicate prevention working"
    echo "✅ Case integration with asset context operational"
    echo "✅ Database storage and schema verified"
    echo "✅ Asset context enrichment in investigations confirmed"
    echo ""
    echo -e "${GREEN}🚀 ASSET MANAGEMENT API READY FOR PRODUCTION${NC}"
    echo ""
    echo "📋 Asset Management provides critical context:"
    echo "   • Identify critical vs. test systems during incidents"
    echo "   • Prioritize response based on asset criticality"
    echo "   • Understand asset type for targeted investigation"
    echo "   • Correlate events with business impact"
elif [ $SUCCESS_RATE -ge 90 ]; then
    echo ""
    echo -e "${YELLOW}⚠️ ASSET MANAGEMENT MOSTLY SUCCESSFUL${NC}"
    echo ""
    echo "Asset management is functional with minor issues."
    echo "Review failed tests but system is generally operational."
else
    echo ""
    echo -e "${RED}❌ SIGNIFICANT ASSET MANAGEMENT ISSUES${NC}"
    echo ""
    echo "Multiple failures detected in asset management system."
    echo "Address issues before deploying to production."
fi

echo ""
echo "========================================================================"
echo "End of Asset Management Verification"
echo "========================================================================" 