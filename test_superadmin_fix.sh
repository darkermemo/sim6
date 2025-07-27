#!/bin/bash

# Test SuperAdmin permissions fix
set -e

API_URL="http://localhost:8080"

# Generate fresh SuperAdmin token with global tenant access
echo "Generating SuperAdmin token..."
SUPERADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token superadmin global SuperAdmin 2>/dev/null | grep -A1 'JWT Token' | tail -1)

if [ -z "$SUPERADMIN_TOKEN" ]; then
    echo "❌ Failed to generate SuperAdmin token"
    exit 1
fi

echo "✅ SuperAdmin token generated: ${SUPERADMIN_TOKEN:0:20}..."
echo ""

# Test 1: List tenants (should work)
echo "Test 1: Testing SuperAdmin access to tenant management..."
RESPONSE=$(curl -s -X GET "$API_URL/api/v1/tenants" \
    -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
    -H "Content-Type: application/json")

echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q '"tenants"'; then
    echo "✅ SuperAdmin can access tenant management endpoint"
else
    echo "❌ SuperAdmin cannot access tenant management endpoint"
    echo "Response: $RESPONSE"
fi

echo ""

# Test 2: Try with regular Admin token (should fail)
echo "Test 2: Testing regular Admin access (should be denied)..."
ADMIN_TOKEN=$(cd siem_api && cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -A1 'JWT Token' | tail -1)

RESPONSE=$(curl -s -X GET "$API_URL/api/v1/tenants" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json")

echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q 'SuperAdmin'; then
    echo "✅ Regular Admin correctly denied access"
else
    echo "❌ Regular Admin should be denied access"
    echo "Response: $RESPONSE"
fi

echo ""
echo "SuperAdmin permissions test completed!"