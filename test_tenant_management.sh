#!/bin/bash

# Tenant Management Verification Script
# Tests the complete tenant lifecycle API (Chunk 4.6)

set -e

echo "========================================"
echo "Tenant Management Verification Test"
echo "========================================"
echo "Date: $(date)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# API base URL
API_URL="http://localhost:8080"

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test results
print_test_result() {
    local test_name="$1"
    local result="$2"
    local details="$3"
    
    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        [ -n "$details" ] && echo "  $details"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC} $test_name"
        [ -n "$details" ] && echo "  $details"
        ((TESTS_FAILED++))
    fi
}

echo "Preparing authentication tokens..."

# Generate SuperAdmin token
echo "Generating SuperAdmin token..."
SUPERADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token superadmin global SuperAdmin 2>/dev/null | grep -A1 'JWT Token' | tail -1)

if [ -z "$SUPERADMIN_TOKEN" ]; then
    echo -e "${RED}Failed to generate SuperAdmin token${NC}"
    exit 1
fi

# Generate regular user token (should NOT work for tenant management)
echo "Generating regular Admin token..."
REGULAR_ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -A1 'JWT Token' | tail -1)

if [ -z "$REGULAR_ADMIN_TOKEN" ]; then
    echo -e "${RED}Failed to generate regular Admin token${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Tokens generated successfully"
echo ""

# Test 1: List existing tenants with SuperAdmin
echo "Step 1: Listing existing tenants with SuperAdmin access..."
TENANTS_RESPONSE=$(curl -s -X GET "$API_URL/v1/tenants" \
    -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
    -H "Content-Type: application/json")

TENANTS_COUNT=$(echo "$TENANTS_RESPONSE" | jq -r '.total // 0')
if [ "$TENANTS_COUNT" -ge 2 ]; then
    print_test_result "List existing tenants" "PASS" "Found $TENANTS_COUNT tenants"
else
    print_test_result "List existing tenants" "FAIL" "Expected at least 2 tenants, got $TENANTS_COUNT"
fi

# Test 2: Try to access tenants with regular admin (should fail)
echo ""
echo "Step 2: Testing access control - Regular Admin should NOT access tenant management..."
UNAUTHORIZED_RESPONSE=$(curl -s -X GET "$API_URL/v1/tenants" \
    -H "Authorization: Bearer $REGULAR_ADMIN_TOKEN" \
    -H "Content-Type: application/json")

ERROR_MESSAGE=$(echo "$UNAUTHORIZED_RESPONSE" | jq -r '.error // ""')
if [[ "$ERROR_MESSAGE" == *"SuperAdmin"* ]]; then
    print_test_result "Access control verification" "PASS" "Regular Admin correctly denied access"
else
    print_test_result "Access control verification" "FAIL" "Regular Admin should not have access to tenant management"
fi

# Test 3: Create a new tenant
echo ""
echo "Step 3: Creating a new tenant 'tenant-C'..."
CREATE_RESPONSE=$(curl -s -X POST "$API_URL/v1/tenants" \
    -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"tenant_name": "Tenant C Organization"}')

TENANT_C_ID=$(echo "$CREATE_RESPONSE" | jq -r '.tenant_id // ""')
CREATE_MESSAGE=$(echo "$CREATE_RESPONSE" | jq -r '.message // ""')

if [[ "$TENANT_C_ID" == tenant-* ]] && [[ "$CREATE_MESSAGE" == *"successfully"* ]]; then
    print_test_result "Create new tenant" "PASS" "Created tenant: $TENANT_C_ID"
else
    print_test_result "Create new tenant" "FAIL" "Failed to create tenant"
    echo "Response: $CREATE_RESPONSE"
fi

# Test 4: Verify the new tenant appears in list
echo ""
echo "Step 4: Verifying new tenant appears in tenant list..."
NEW_TENANTS_RESPONSE=$(curl -s -X GET "$API_URL/v1/tenants" \
    -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
    -H "Content-Type: application/json")

TENANT_C_FOUND=$(echo "$NEW_TENANTS_RESPONSE" | jq -r --arg tid "$TENANT_C_ID" '.tenants[] | select(.tenant_id == $tid) | .tenant_id')
NEW_TOTAL=$(echo "$NEW_TENANTS_RESPONSE" | jq -r '.total // 0')

if [ "$TENANT_C_FOUND" = "$TENANT_C_ID" ]; then
    print_test_result "Verify tenant in list" "PASS" "Tenant-C found in list (Total: $NEW_TOTAL)"
else
    print_test_result "Verify tenant in list" "FAIL" "Tenant-C not found in list"
fi

# Test 5: Get specific tenant details
echo ""
echo "Step 5: Getting specific tenant details for '$TENANT_C_ID'..."
TENANT_DETAILS=$(curl -s -X GET "$API_URL/v1/tenants/$TENANT_C_ID" \
    -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
    -H "Content-Type: application/json")

TENANT_NAME=$(echo "$TENANT_DETAILS" | jq -r '.tenant_name // ""')
TENANT_STATUS=$(echo "$TENANT_DETAILS" | jq -r '.is_active // 0')

if [ "$TENANT_NAME" = "Tenant C Organization" ] && [ "$TENANT_STATUS" = "1" ]; then
    print_test_result "Get tenant details" "PASS" "Retrieved correct tenant details"
else
    print_test_result "Get tenant details" "FAIL" "Incorrect tenant details"
    echo "Response: $TENANT_DETAILS"
fi

# Test 6: Update tenant - deactivate tenant-C
echo ""
echo "Step 6: Deactivating tenant '$TENANT_C_ID' (setting is_active to 0)..."
UPDATE_RESPONSE=$(curl -s -X PUT "$API_URL/v1/tenants/$TENANT_C_ID" \
    -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"is_active": 0}')

UPDATE_MESSAGE=$(echo "$UPDATE_RESPONSE" | jq -r '.message // ""')

if [[ "$UPDATE_MESSAGE" == *"successfully"* ]]; then
    print_test_result "Update tenant status" "PASS" "Tenant deactivated successfully"
else
    print_test_result "Update tenant status" "FAIL" "Failed to update tenant"
    echo "Response: $UPDATE_RESPONSE"
fi

# Test 7: Verify the update took effect
echo ""
echo "Step 7: Verifying tenant deactivation..."
# Wait a moment for ClickHouse to process the ALTER
sleep 2

UPDATED_DETAILS=$(curl -s -X GET "$API_URL/v1/tenants/$TENANT_C_ID" \
    -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
    -H "Content-Type: application/json")

UPDATED_STATUS=$(echo "$UPDATED_DETAILS" | jq -r '.is_active // 1')

if [ "$UPDATED_STATUS" = "0" ]; then
    print_test_result "Verify tenant deactivation" "PASS" "Tenant is_active correctly set to 0"
else
    print_test_result "Verify tenant deactivation" "FAIL" "Tenant is_active still shows: $UPDATED_STATUS"
    echo "Response: $UPDATED_DETAILS"
fi

# Test 8: Update tenant name
echo ""
echo "Step 8: Updating tenant name..."
NAME_UPDATE_RESPONSE=$(curl -s -X PUT "$API_URL/v1/tenants/$TENANT_C_ID" \
    -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"tenant_name": "Updated Tenant C Organization"}')

NAME_UPDATE_MESSAGE=$(echo "$NAME_UPDATE_RESPONSE" | jq -r '.message // ""')

if [[ "$NAME_UPDATE_MESSAGE" == *"successfully"* ]]; then
    print_test_result "Update tenant name" "PASS" "Tenant name updated successfully"
else
    print_test_result "Update tenant name" "FAIL" "Failed to update tenant name"
fi

# Test 9: Verify name update
echo ""
echo "Step 9: Verifying tenant name update..."
sleep 2

FINAL_DETAILS=$(curl -s -X GET "$API_URL/v1/tenants/$TENANT_C_ID" \
    -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
    -H "Content-Type: application/json")

FINAL_NAME=$(echo "$FINAL_DETAILS" | jq -r '.tenant_name // ""')

if [ "$FINAL_NAME" = "Updated Tenant C Organization" ]; then
    print_test_result "Verify tenant name update" "PASS" "Tenant name correctly updated"
else
    print_test_result "Verify tenant name update" "FAIL" "Tenant name not updated. Got: $FINAL_NAME"
fi

# Test 10: Test invalid tenant ID
echo ""
echo "Step 10: Testing error handling for non-existent tenant..."
INVALID_RESPONSE=$(curl -s -X GET "$API_URL/v1/tenants/non-existent-tenant" \
    -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
    -H "Content-Type: application/json")

INVALID_ERROR=$(echo "$INVALID_RESPONSE" | jq -r '.error // ""')

if [[ "$INVALID_ERROR" == *"not found"* ]]; then
    print_test_result "Error handling for invalid tenant" "PASS" "Correctly returned 'not found' error"
else
    print_test_result "Error handling for invalid tenant" "FAIL" "Should return 'not found' error"
fi

# Test 11: Test duplicate tenant name
echo ""
echo "Step 11: Testing duplicate tenant name prevention..."
DUPLICATE_RESPONSE=$(curl -s -X POST "$API_URL/v1/tenants" \
    -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"tenant_name": "Tenant A Organization"}')

DUPLICATE_ERROR=$(echo "$DUPLICATE_RESPONSE" | jq -r '.error // ""')

if [[ "$DUPLICATE_ERROR" == *"already exists"* ]]; then
    print_test_result "Duplicate tenant name prevention" "PASS" "Correctly prevented duplicate tenant name"
else
    print_test_result "Duplicate tenant name prevention" "FAIL" "Should prevent duplicate tenant names"
fi

echo ""
echo "========================================"
echo "Tenant Management Verification Summary"
echo "========================================"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All Tenant Management Tests Passed!${NC}"
    echo ""
    echo "Verified functionality:"
    echo "• ✓ SuperAdmin role enforcement"
    echo "• ✓ Tenant creation with unique IDs"
    echo "• ✓ Tenant listing and retrieval"
    echo "• ✓ Tenant status updates (activation/deactivation)"
    echo "• ✓ Tenant name updates"
    echo "• ✓ Access control (regular users blocked)"
    echo "• ✓ Error handling for invalid operations"
    echo "• ✓ Duplicate name prevention"
    echo ""
    echo "The tenant management system is fully functional and ready for use!"
else
    echo -e "${RED}❌ Some tests failed!${NC}"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"
    echo ""
    echo "Please review the failing tests and fix any issues."
fi

echo "" 