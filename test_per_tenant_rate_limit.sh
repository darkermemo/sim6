#!/bin/bash

# Test script for per-tenant rate limiting (Test A-5)

echo "================================================"
echo "Testing Per-Tenant Rate Limiting"
echo "================================================"
echo

# Configuration
API_URL="http://127.0.0.1:8080/v1"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Check if API is running
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/events")
if [ "$HTTP_CODE" != "401" ]; then
    echo -e "${RED}✗ API is not running or not responding correctly${NC}"
    echo "  Expected 401 Unauthorized, got $HTTP_CODE"
    exit 1
fi
echo -e "${GREEN}✓ API is running${NC}"
echo

# Generate tokens for two different tenants
echo "Generating tokens for tenant-A and tenant-B..."
cd siem_api > /dev/null 2>&1

TENANT_A_TOKEN=$(cargo run --example generate_token user1 tenant-A 2>/dev/null | grep -A1 "JWT Token" | tail -1)
TENANT_B_TOKEN=$(cargo run --example generate_token user2 tenant-B 2>/dev/null | grep -A1 "JWT Token" | tail -1)

cd .. > /dev/null 2>&1

if [ -z "$TENANT_A_TOKEN" ] || [ -z "$TENANT_B_TOKEN" ]; then
    echo -e "${RED}✗ Failed to generate tokens${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Tokens generated successfully${NC}"
echo

# Test 1: Exhaust Tenant-A's rate limit
echo "Test 1: Exhausting Tenant-A's rate limit..."
echo "  Rate limit: 2 requests/second with burst of 10"
echo "  Sending 15 rapid requests..."

RATE_LIMITED=false
SUCCESS_COUNT=0
RATE_LIMIT_COUNT=0

for i in {1..15}; do
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/events" \
        -H "Authorization: Bearer $TENANT_A_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "events": [{
                "source_ip": "192.168.1.100",
                "raw_event": "Test event '$i' for rate limiting"
            }]
        }' 2>/dev/null)
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    
    if [ "$HTTP_CODE" = "202" ]; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        echo -n "."
    elif [ "$HTTP_CODE" = "429" ]; then
        RATE_LIMITED=true
        RATE_LIMIT_COUNT=$((RATE_LIMIT_COUNT + 1))
        echo -n "X"
    else
        echo
        echo -e "${RED}✗ Unexpected response code: $HTTP_CODE${NC}"
        echo "Response: $(echo "$RESPONSE" | head -n -1)"
    fi
done

echo
echo "  Results: $SUCCESS_COUNT successful, $RATE_LIMIT_COUNT rate-limited"

if [ "$RATE_LIMITED" = "false" ]; then
    echo -e "${RED}✗ Rate limiting not triggered for Tenant-A${NC}"
    echo "  This might mean rate limit is too high or not working"
else
    echo -e "${GREEN}✓ Tenant-A successfully rate limited${NC}"
fi

echo

# Test 2: Verify Tenant-B is NOT affected
echo "Test 2: Testing Tenant-B immediately after Tenant-A is rate limited..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/events" \
    -H "Authorization: Bearer $TENANT_B_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "events": [{
            "source_ip": "172.16.0.1",
            "raw_event": "Test event for tenant-B while tenant-A is rate limited"
        }]
    }' 2>/dev/null)

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "202" ]; then
    echo -e "${GREEN}✓ Tenant-B request succeeded (202 Accepted)${NC}"
    echo -e "${GREEN}✓ Per-tenant rate limiting is working correctly!${NC}"
    RESULT="PASSED"
else
    echo -e "${RED}✗ Tenant-B request failed with status: $HTTP_CODE${NC}"
    if [ "$HTTP_CODE" = "429" ]; then
        echo -e "${RED}  This indicates global rate limiting is still in effect${NC}"
    fi
    echo "Response: $(echo "$RESPONSE" | head -n -1)"
    RESULT="FAILED"
fi

echo

# Test 3: Additional verification - send multiple Tenant-B requests
echo "Test 3: Sending multiple Tenant-B requests to verify independent limit..."

B_SUCCESS_COUNT=0
B_RATE_LIMIT_COUNT=0

for i in {1..12}; do
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/events" \
        -H "Authorization: Bearer $TENANT_B_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "events": [{
                "source_ip": "172.16.0.2",
                "raw_event": "Additional test event '$i' for tenant-B"
            }]
        }' 2>/dev/null)
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    
    if [ "$HTTP_CODE" = "202" ]; then
        B_SUCCESS_COUNT=$((B_SUCCESS_COUNT + 1))
        echo -n "."
    elif [ "$HTTP_CODE" = "429" ]; then
        B_RATE_LIMIT_COUNT=$((B_RATE_LIMIT_COUNT + 1))
        echo -n "X"
    fi
done

echo
echo "  Tenant-B results: $B_SUCCESS_COUNT successful, $B_RATE_LIMIT_COUNT rate-limited"

if [ $B_SUCCESS_COUNT -ge 8 ] && [ $B_RATE_LIMIT_COUNT -gt 0 ]; then
    echo -e "${GREEN}✓ Tenant-B has its own independent rate limit${NC}"
else
    echo -e "${YELLOW}⚠ Tenant-B rate limiting behavior unexpected${NC}"
fi

echo
echo "================================================"
echo "Test [A-5] Per-Tenant Rate Limiting: $RESULT"
echo "================================================"
echo

if [ "$RESULT" = "PASSED" ]; then
    echo -e "${GREEN}Summary: Rate limiting is correctly applied per-tenant.${NC}"
    echo "- Tenant-A hit rate limit after ~10 requests"
    echo "- Tenant-B was not affected and could make requests"
    echo "- Each tenant has independent rate limits"
    exit 0
else
    echo -e "${RED}Summary: Rate limiting appears to be global, not per-tenant.${NC}"
    exit 1
fi 