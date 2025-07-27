#!/bin/bash

# Phase 1-4.1 Full Regression Test
# Tests API Core, Data Pipeline, and RBAC functionality

set -e

echo "================================================"
echo "Phase 1-4.1 Full Regression Test"
echo "================================================"
echo

# Configuration
API_URL="http://127.0.0.1:8080/v1"
CLICKHOUSE_URL="http://localhost:8123"
KAFKA_TOPIC="siem-events"

# Test results tracking
PASS="✓"
FAIL="✗"
# Using plain variables instead of associative array for compatibility
result_A1=""
result_A2=""
result_A3=""
result_A4=""
result_A5=""
result_B1=""
result_B2=""
result_B3=""
result_B4=""
result_C1=""
result_C2=""
result_C3=""
result_C4=""
result_C5=""

# Helper functions
print_test() {
    local test_id=$1
    local test_name=$2
    local status=$3
    printf "[%-4s] %-30s %s\n" "$test_id" "$test_name" "$status"
}

check_services() {
    echo "Checking services..."
    
    # Check ClickHouse
    if curl -s "$CLICKHOUSE_URL" > /dev/null; then
        echo "✓ ClickHouse is running"
    else
        echo "✗ ClickHouse is not running"
        exit 1
    fi
    
    # Check API
    if curl -s -f "$API_URL/events" 2>&1 | grep -q "Missing Authorization header"; then
        echo "✓ API is running"
    else
        echo "✗ API is not running"
        exit 1
    fi
    
    echo
}

# Generate test tokens
generate_tokens() {
    echo "Generating test tokens..."
    
    # Generate tokens for different users and tenants
    cd siem_api
    
    # Standard tokens for tenant-A and tenant-B
    TENANT_A_TOKEN=$(cargo run --example generate_token user1 tenant-A 2>/dev/null | grep -A1 "JWT Token" | tail -1)
    TENANT_B_TOKEN=$(cargo run --example generate_token user2 tenant-B 2>/dev/null | grep -A1 "JWT Token" | tail -1)
    
    # RBAC tokens
    ALICE_TOKEN=$(cargo run --example generate_token alice tenant-A Admin 2>/dev/null | grep -A1 "JWT Token" | tail -1)
    BOB_TOKEN=$(cargo run --example generate_token bob tenant-A Analyst 2>/dev/null | grep -A1 "JWT Token" | tail -1)
    
    cd ..
    
    echo "✓ Tokens generated"
    echo
}

# Suite A: API Core Functionality
test_suite_a() {
    echo "================================================"
    echo "Suite A: API Core Functionality"
    echo "================================================"
    
    # A-1: Unauthorized Read
    echo -n "Testing [A-1] Unauthorized Read... "
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/events")
    if [ "$HTTP_STATUS" = "401" ]; then
        result_A1="$PASS"
        echo "PASSED"
    else
        result_A1="$FAIL"
        echo "FAILED (Got $HTTP_STATUS, expected 401)"
    fi
    
    # A-2: Unauthorized Write
    echo -n "Testing [A-2] Unauthorized Write... "
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/events" \
        -H "Content-Type: application/json" \
        -d '[{"message": "test"}]')
    if [ "$HTTP_STATUS" = "401" ]; then
        results["A-2"]="$PASS"
        echo "PASSED"
    else
        results["A-2"]="$FAIL"
        echo "FAILED (Got $HTTP_STATUS, expected 401)"
    fi
    
    # A-3: Invalid Payload
    echo -n "Testing [A-3] Invalid Payload... "
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/events" \
        -H "Authorization: Bearer $TENANT_A_TOKEN" \
        -H "Content-Type: application/json" \
        -d 'not json')
    if [ "$HTTP_STATUS" = "400" ]; then
        results["A-3"]="$PASS"
        echo "PASSED"
    else
        results["A-3"]="$FAIL"
        echo "FAILED (Got $HTTP_STATUS, expected 400)"
    fi
    
    # A-4: Rate Limiting
    echo -n "Testing [A-4] Rate Limiting... "
    RATE_LIMIT_HIT=false
    for i in {1..15}; do
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/events" \
            -H "Authorization: Bearer $TENANT_A_TOKEN" \
            -H "Content-Type: application/json" \
            -d '[{"message": "rate limit test"}]')
        if [ "$HTTP_STATUS" = "429" ]; then
            RATE_LIMIT_HIT=true
            break
        fi
    done
    
    if [ "$RATE_LIMIT_HIT" = true ]; then
        results["A-4"]="$PASS"
        echo "PASSED"
    else
        results["A-4"]="$FAIL"
        echo "FAILED (Rate limit not triggered)"
    fi
    
    # Wait for rate limit to reset
    sleep 2
    
    # A-5: Rate Limit Isolation
    echo -n "Testing [A-5] Rate Limit Isolation... "
    # First exhaust tenant-A's rate limit
    for i in {1..15}; do
        curl -s -o /dev/null -X POST "$API_URL/events" \
            -H "Authorization: Bearer $TENANT_A_TOKEN" \
            -H "Content-Type: application/json" \
            -d '[{"message": "exhaust limit"}]'
    done
    
    # Now try tenant-B
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/events" \
        -H "Authorization: Bearer $TENANT_B_TOKEN" \
        -H "Content-Type: application/json" \
        -d '[{"message": "tenant B test"}]')
    
    if [ "$HTTP_STATUS" = "202" ]; then
        results["A-5"]="$PASS"
        echo "PASSED"
    else
        results["A-5"]="$FAIL"
        echo "FAILED (Got $HTTP_STATUS, expected 202)"
    fi
    
    echo
}

# Suite B: End-to-End Data Pipeline
test_suite_b() {
    echo "================================================"
    echo "Suite B: End-to-End Data Pipeline"
    echo "================================================"
    
    # Clear events table for clean test
    curl -s -X POST "$CLICKHOUSE_URL" --data-binary "TRUNCATE TABLE dev.events" > /dev/null
    
    # B-1: JSON Event Ingestion
    echo -n "Testing [B-1] JSON Event Ingestion... "
    
    # Send JSON event
    curl -s -X POST "$API_URL/events" \
        -H "Authorization: Bearer $TENANT_A_TOKEN" \
        -H "Content-Type: application/json" \
        -d '[{
            "timestamp": "2024-01-19T10:30:00Z",
            "source_ip": "192.168.1.100",
            "event_type": "login",
            "severity": "info",
            "message": "User login successful"
        }]' > /dev/null
    
    # Wait for processing
    sleep 2
    
    # Check if event was stored
    COUNT=$(curl -s -X POST "$CLICKHOUSE_URL" --data-binary \
        "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'tenant-A' AND source_ip = '192.168.1.100' FORMAT TabSeparated" | tr -d '\n')
    
    if [ "$COUNT" -ge "1" ]; then
        results["B-1"]="$PASS"
        echo "PASSED"
    else
        results["B-1"]="$FAIL"
        echo "FAILED (Expected at least 1 event, got $COUNT)"
    fi
    
    # B-2: Syslog Event Ingestion
    echo -n "Testing [B-2] Syslog Event Ingestion... "
    
    # Send Syslog event
    curl -s -X POST "$API_URL/events" \
        -H "Authorization: Bearer $TENANT_A_TOKEN" \
        -H "Content-Type: application/json" \
        -d '[{
            "message": "Jan 19 10:35:00 server01 sshd[1234]: Accepted password for admin from 10.0.0.50 port 22 ssh2"
        }]' > /dev/null
    
    # Wait for processing
    sleep 2
    
    # Check if event was parsed and stored
    COUNT=$(curl -s -X POST "$CLICKHOUSE_URL" --data-binary \
        "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'tenant-A' AND source_ip = '10.0.0.50' FORMAT TabSeparated" | tr -d '\n')
    
    if [ "$COUNT" -ge "1" ]; then
        results["B-2"]="$PASS"
        echo "PASSED"
    else
        results["B-2"]="$FAIL"
        echo "FAILED (Expected at least 1 event, got $COUNT)"
    fi
    
    # B-3: Unparseable Event
    echo -n "Testing [B-3] Unparseable Event... "
    
    # Send unparseable event
    curl -s -X POST "$API_URL/events" \
        -H "Authorization: Bearer $TENANT_A_TOKEN" \
        -H "Content-Type: application/json" \
        -d '[{
            "message": "This is not a valid JSON or Syslog format @#$%^&*()"
        }]' > /dev/null
    
    # Wait for processing
    sleep 2
    
    # Check if event was stored with default values
    COUNT=$(curl -s -X POST "$CLICKHOUSE_URL" --data-binary \
        "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'tenant-A' AND source_ip = '0.0.0.0' AND raw_event LIKE '%not a valid JSON%' FORMAT TabSeparated" | tr -d '\n')
    
    if [ "$COUNT" -ge "1" ]; then
        results["B-3"]="$PASS"
        echo "PASSED"
    else
        results["B-3"]="$FAIL"
        echo "FAILED (Expected at least 1 unparsed event, got $COUNT)"
    fi
    
    # B-4: Tenant Isolation
    echo -n "Testing [B-4] Tenant Isolation... "
    
    # Send event for tenant-B
    curl -s -X POST "$API_URL/events" \
        -H "Authorization: Bearer $TENANT_B_TOKEN" \
        -H "Content-Type: application/json" \
        -d '[{
            "message": "Tenant B specific event",
            "source_ip": "172.16.0.1"
        }]' > /dev/null
    
    # Wait for processing
    sleep 2
    
    # Check tenant-A cannot see tenant-B events
    RESPONSE=$(curl -s -X GET "$API_URL/events" \
        -H "Authorization: Bearer $TENANT_A_TOKEN")
    
    if echo "$RESPONSE" | grep -q "172.16.0.1"; then
        results["B-4"]="$FAIL"
        echo "FAILED (Tenant A can see Tenant B events)"
    else
        results["B-4"]="$PASS"
        echo "PASSED"
    fi
    
    echo
}

# Suite C: RBAC & Authorization
test_suite_c() {
    echo "================================================"
    echo "Suite C: RBAC & Authorization"
    echo "================================================"
    
    # C-1: Admin Access Success
    echo -n "Testing [C-1] Admin Access Success... "
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/users" \
        -H "Authorization: Bearer $ALICE_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "user_id": "charlie",
            "tenant_id": "tenant-A",
            "email": "charlie@example.com",
            "roles": ["Viewer"]
        }')
    
    if [ "$HTTP_STATUS" = "201" ]; then
        results["C-1"]="$PASS"
        echo "PASSED"
    else
        results["C-1"]="$FAIL"
        echo "FAILED (Got $HTTP_STATUS, expected 201)"
    fi
    
    # C-2: Non-Admin Access Failure
    echo -n "Testing [C-2] Non-Admin Access Failure... "
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/users" \
        -H "Authorization: Bearer $BOB_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "user_id": "david",
            "tenant_id": "tenant-A",
            "email": "david@example.com",
            "roles": ["Viewer"]
        }')
    
    if [ "$HTTP_STATUS" = "403" ]; then
        results["C-2"]="$PASS"
        echo "PASSED"
    else
        results["C-2"]="$FAIL"
        echo "FAILED (Got $HTTP_STATUS, expected 403)"
    fi
    
    # C-3: General Access
    echo -n "Testing [C-3] General Access... "
    
    # Test Alice
    ALICE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/events" \
        -H "Authorization: Bearer $ALICE_TOKEN")
    
    # Test Bob
    BOB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/events" \
        -H "Authorization: Bearer $BOB_TOKEN")
    
    if [ "$ALICE_STATUS" = "200" ] && [ "$BOB_STATUS" = "200" ]; then
        results["C-3"]="$PASS"
        echo "PASSED"
    else
        results["C-3"]="$FAIL"
        echo "FAILED (Alice: $ALICE_STATUS, Bob: $BOB_STATUS, expected 200 for both)"
    fi
    
    # C-4: Self-Read Access
    echo -n "Testing [C-4] Self-Read Access... "
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/users/bob" \
        -H "Authorization: Bearer $BOB_TOKEN")
    
    if [ "$HTTP_STATUS" = "200" ]; then
        results["C-4"]="$PASS"
        echo "PASSED"
    else
        results["C-4"]="$FAIL"
        echo "FAILED (Got $HTTP_STATUS, expected 200)"
    fi
    
    # C-5: Cross-Read Failure
    echo -n "Testing [C-5] Cross-Read Failure... "
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/users/alice" \
        -H "Authorization: Bearer $BOB_TOKEN")
    
    if [ "$HTTP_STATUS" = "403" ]; then
        results["C-5"]="$PASS"
        echo "PASSED"
    else
        results["C-5"]="$FAIL"
        echo "FAILED (Got $HTTP_STATUS, expected 403)"
    fi
    
    echo
}

# Print summary
print_summary() {
    echo "================================================"
    echo "Test Summary"
    echo "================================================"
    echo
    
    echo "Suite A: API Core Functionality"
    print_test "A-1" "Unauthorized Read" "${results[A-1]}"
    print_test "A-2" "Unauthorized Write" "${results[A-2]}"
    print_test "A-3" "Invalid Payload" "${results[A-3]}"
    print_test "A-4" "Rate Limiting" "${results[A-4]}"
    print_test "A-5" "Rate Limit Isolation" "${results[A-5]}"
    echo
    
    echo "Suite B: End-to-End Data Pipeline"
    print_test "B-1" "JSON Event Ingestion" "${results[B-1]}"
    print_test "B-2" "Syslog Event Ingestion" "${results[B-2]}"
    print_test "B-3" "Unparseable Event" "${results[B-3]}"
    print_test "B-4" "Tenant Isolation" "${results[B-4]}"
    echo
    
    echo "Suite C: RBAC & Authorization"
    print_test "C-1" "Admin Access Success" "${results[C-1]}"
    print_test "C-2" "Non-Admin Access Failure" "${results[C-2]}"
    print_test "C-3" "General Access" "${results[C-3]}"
    print_test "C-4" "Self-Read Access" "${results[C-4]}"
    print_test "C-5" "Cross-Read Failure" "${results[C-5]}"
    echo
    
    # Count passes and fails
    TOTAL_TESTS=14
    PASSED_TESTS=0
    for key in "${!results[@]}"; do
        if [ "${results[$key]}" = "$PASS" ]; then
            ((PASSED_TESTS++))
        fi
    done
    
    echo "================================================"
    echo "Overall: $PASSED_TESTS/$TOTAL_TESTS tests passed"
    echo "================================================"
}

# Main execution
main() {
    check_services
    generate_tokens
    test_suite_a
    test_suite_b
    test_suite_c
    print_summary
}

# Run the tests
main 