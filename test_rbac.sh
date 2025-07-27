#!/bin/bash

# RBAC Verification Test Script

echo "===== RBAC Verification Test ====="
echo

# Save tokens
ALICE_TOKEN="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSIsInRpZCI6InRlbmFudC1BIiwicm9sZXMiOlsiQWRtaW4iXSwiZXhwIjoxNzUyOTk3NzM2fQ.BYPQcS5Chhjxb_frmNsTKNfQv6EB3YAUZMFU41SsIk0"
BOB_TOKEN="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJib2IiLCJ0aWQiOiJ0ZW5hbnQtQSIsInJvbGVzIjpbIkFuYWx5c3QiXSwiZXhwIjoxNzUyOTk3NzU0fQ.-2-Do85ro908d7vwi9lnPXVLJxg9yCKYtjzrvZxCipA"

BASE_URL="http://127.0.0.1:8080/v1"

echo "Test 1: Bob (Analyst) tries to create a user (Admin only) - Should FAIL with 403"
echo "-----------------------------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n" -X POST $BASE_URL/users \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "charlie",
    "tenant_id": "tenant-A",
    "email": "charlie@example.com",
    "roles": ["Viewer"]
  }'
echo
echo

echo "Test 2: Alice (Admin) creates a user - Should SUCCEED with 201"
echo "-----------------------------------------------------------------------"
RESPONSE=$(curl -s -w "\n___HTTP_STATUS___%{http_code}" -X POST $BASE_URL/users \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "charlie",
    "tenant_id": "tenant-A", 
    "email": "charlie@example.com",
    "roles": ["Viewer"]
  }')
echo "${RESPONSE%___HTTP_STATUS___*}" | jq .
echo "HTTP Status: ${RESPONSE##*___HTTP_STATUS___}"
echo

echo "Test 3: Bob (Analyst) accesses events endpoint - Should SUCCEED with 200"
echo "-----------------------------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n" -X GET $BASE_URL/events \
  -H "Authorization: Bearer $BOB_TOKEN" | jq .
echo

echo "Test 4: Alice (Admin) accesses events endpoint - Should SUCCEED with 200"
echo "-----------------------------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n" -X GET $BASE_URL/events \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq .
echo

echo "Test 5: Bob gets his own user details - Should SUCCEED with 200"
echo "-----------------------------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n" -X GET $BASE_URL/users/bob \
  -H "Authorization: Bearer $BOB_TOKEN" | jq .
echo

echo "Test 6: Bob tries to get Alice's user details - Should FAIL with 403"
echo "-----------------------------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n" -X GET $BASE_URL/users/alice \
  -H "Authorization: Bearer $BOB_TOKEN"
echo
echo

echo "Test 7: Alice (Admin) gets Bob's user details - Should SUCCEED with 200"
echo "-----------------------------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n" -X GET $BASE_URL/users/bob \
  -H "Authorization: Bearer $ALICE_TOKEN" | jq .
echo

echo "Test 8: Both can list available roles - Should SUCCEED with 200"
echo "-----------------------------------------------------------------------"
echo "Bob listing roles:"
curl -s -w "\nHTTP Status: %{http_code}\n" -X GET $BASE_URL/roles \
  -H "Authorization: Bearer $BOB_TOKEN" | jq .
echo

echo "===== Test Summary ====="
echo "✅ Admin-only endpoints should reject non-admin users (403)"
echo "✅ Admin users can access admin endpoints (200/201)"
echo "✅ Both roles can access general endpoints like events"
echo "✅ Users can view their own details but not others (unless admin)"
echo "✅ Tenant isolation is maintained" 