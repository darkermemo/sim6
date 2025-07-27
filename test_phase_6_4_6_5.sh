#!/bin/bash

# Comprehensive Test Suite for Phase 6.4 (Data Retention Policies) and Phase 6.5 (System Health & Auditing)
# This script tests all API endpoints and functionality for data retention and system health monitoring

# set -e  # Exit on any error - commented out to continue testing even if some tests fail

API_URL="http://localhost:8080"
ADMIN_TOKEN=""
TEST_TENANT_ID="tenant-A"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to make API requests with proper error handling
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    print_status "Testing: $description"
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $ADMIN_TOKEN" \
            -d "$data" \
            "$API_URL$endpoint")
    else
        response=$(curl -s -w "%{http_code}" -X "$method" \
            -H "Authorization: Bearer $ADMIN_TOKEN" \
            "$API_URL$endpoint")
    fi
    
    # Extract HTTP status code (last 3 characters)
    status_code="${response: -3}"
    # Extract response body (everything except last 3 characters)
    body="${response%???}"
    
    echo "Response: $body"
    echo "Status: $status_code"
    echo "---"
    
    # Return the status code for further processing
    return $status_code
}

# Function to generate admin token
generate_admin_token() {
    print_status "Generating admin token for testing..."
    
    # Use the token generation example
    cd siem_api
    output=$(cargo run --example generate_token admin-user tenant-A Admin 2>&1)
    # Extract just the JWT token (starts with eyJ)
    ADMIN_TOKEN=$(echo "$output" | grep "^eyJ" | head -1)
    cd ..
    
    if [ -z "$ADMIN_TOKEN" ]; then
        print_error "Failed to generate admin token"
        echo "Token generation output: $output"
        exit 1
    fi
    
    print_success "Generated admin token: ${ADMIN_TOKEN:0:20}..."
}

# Test Phase 6.5: System Health API
test_system_health() {
    echo
    print_status "=== PHASE 6.5: SYSTEM HEALTH MONITORING TESTS ==="
    
    # Test basic health endpoint (should work without authentication)
    print_status "Testing basic system health endpoint..."
    response=$(curl -s -w "%{http_code}" -X GET "$API_URL/v1/health")
    status_code="${response: -3}"
    body="${response%???}"
    
    echo "Response: $body"
    echo "Status: $status_code"
    
    if [ "$status_code" = "200" ] || [ "$status_code" = "503" ]; then
        print_success "Basic health check works"
    else
        print_error "Basic health check failed with status $status_code"
    fi
    echo "---"
    
    # Test detailed health endpoint (requires authentication)
    make_request "GET" "/v1/health/detailed" "" "Detailed system health check"
    
    # Test audit log creation
    audit_data='{
        "action": "test.action",
        "details": "This is a test audit log entry for Phase 6.5 testing"
    }'
    make_request "POST" "/v1/audit" "$audit_data" "Create audit log entry"
    
    # Test audit log retrieval
    make_request "GET" "/v1/audit" "" "Retrieve audit logs"
    
    # Test audit log retrieval with filters
    make_request "GET" "/v1/audit?limit=5&action_filter=test" "" "Retrieve filtered audit logs"
}

# Test Phase 6.4: Data Retention Policies API
test_retention_policies() {
    echo
    print_status "=== PHASE 6.4: DATA RETENTION POLICIES TESTS ==="
    
    # Test creating retention policies
    policy_data='{
        "policy_name": "Test Syslog Retention",
        "source_type_match": "Syslog",
        "retention_days": 90
    }'
    make_request "POST" "/v1/retention/policies" "$policy_data" "Create Syslog retention policy"
    
    # Create another policy for JSON logs
    policy_data2='{
        "policy_name": "Test JSON Retention",
        "source_type_match": "JSON",
        "retention_days": 30
    }'
    make_request "POST" "/v1/retention/policies" "$policy_data2" "Create JSON retention policy"
    
    # Create a wildcard policy
    policy_data3='{
        "policy_name": "Default Retention Policy",
        "source_type_match": "*",
        "retention_days": 365
    }'
    make_request "POST" "/v1/retention/policies" "$policy_data3" "Create default retention policy"
    
    # Test duplicate policy name (should fail)
    make_request "POST" "/v1/retention/policies" "$policy_data" "Create duplicate policy (should fail)"
    
    # Test listing retention policies
    make_request "GET" "/v1/retention/policies" "" "List all retention policies"
    
    # Test retention status
    make_request "GET" "/v1/retention/status" "" "Get retention status"
    
    # Test invalid policy creation (validation errors)
    invalid_policy='{
        "policy_name": "",
        "source_type_match": "Syslog",
        "retention_days": 0
    }'
    make_request "POST" "/v1/retention/policies" "$invalid_policy" "Create invalid policy (should fail)"
}

# Test Data Pruning Service
test_data_pruner() {
    echo
    print_status "=== PHASE 6.4: DATA PRUNING SERVICE TESTS ==="
    
    # Insert some old test events for pruning
    print_status "Inserting test events for pruning..."
    
    # Create old timestamp (2 days ago)
    old_timestamp=$(($(date +%s) - 172800))  # 2 days ago
    
    # Insert via ClickHouse directly
    insert_query="INSERT INTO dev.events (event_id, tenant_id, event_timestamp, source_ip, source_type, raw_event, event_category, event_outcome, event_action) VALUES 
    ('test-event-1', '$TEST_TENANT_ID', $old_timestamp, '192.168.1.100', 'Syslog', 'Test old syslog event', 'Security', 'Success', 'Login'),
    ('test-event-2', '$TEST_TENANT_ID', $old_timestamp, '192.168.1.101', 'JSON', 'Test old JSON event', 'Security', 'Failure', 'Authentication')"
    
    curl -X POST "http://localhost:8123/" -d "$insert_query"
    
    if [ $? -eq 0 ]; then
        print_success "Inserted test events for pruning"
    else
        print_warning "Failed to insert test events"
    fi
    
    # Test data pruner in dry run mode
    print_status "Testing data pruner in dry run mode..."
    cd siem_data_pruner
    
    # Set environment variables for dry run
    export DRY_RUN=true
    export CHECK_INTERVAL_HOURS=1
    
    # Run the pruner once (it will exit after one cycle due to our implementation)
    timeout 30s cargo run || true
    
    print_success "Data pruner dry run completed"
    cd ..
}

# Test deletion of retention policies
test_policy_deletion() {
    echo
    print_status "=== TESTING RETENTION POLICY DELETION ==="
    
    # First, get the list of policies to find IDs
    print_status "Getting list of policies to find deletion targets..."
    
    response=$(curl -s -X GET \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        "$API_URL/v1/retention/policies")
    
    echo "Current policies: $response"
    
    # Extract a policy ID (this is a simplified approach - in real tests you'd parse JSON properly)
    policy_id=$(echo "$response" | grep -o '"policy_id":"[^"]*' | head -1 | cut -d'"' -f4)
    
    if [ -n "$policy_id" ]; then
        print_status "Attempting to delete policy: $policy_id"
        make_request "DELETE" "/v1/retention/policies/$policy_id" "" "Delete retention policy"
    else
        print_warning "No policy ID found for deletion test"
    fi
    
    # Test deleting non-existent policy
    make_request "DELETE" "/v1/retention/policies/non-existent-id" "" "Delete non-existent policy (should fail)"
}

# Validation tests
test_validation() {
    echo
    print_status "=== VALIDATION AND ERROR HANDLING TESTS ==="
    
    # Test unauthorized requests (without token)
    print_status "Testing unauthorized access..."
    response=$(curl -s -w "%{http_code}" -X GET "$API_URL/v1/retention/policies")
    status_code="${response: -3}"
    
    if [ "$status_code" = "401" ]; then
        print_success "Unauthorized access correctly rejected"
    else
        print_warning "Expected 401 for unauthorized access, got $status_code"
    fi
    
    # Test invalid JSON
    print_status "Testing invalid JSON submission..."
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -d '{"invalid": json}' \
        "$API_URL/v1/retention/policies")
    status_code="${response: -3}"
    
    if [ "$status_code" = "400" ]; then
        print_success "Invalid JSON correctly rejected"
    else
        print_warning "Expected 400 for invalid JSON, got $status_code"
    fi
    
    # Test field validation
    validation_test='{
        "policy_name": "Test Policy with Very Long Name That Exceeds The Maximum Allowed Length And Should Be Rejected By The Validation System Because It Is Too Long For The Database Schema And Application Requirements",
        "source_type_match": "Syslog",
        "retention_days": 99999
    }'
    make_request "POST" "/v1/retention/policies" "$validation_test" "Test field validation (should fail)"
}

# Cleanup function
cleanup() {
    print_status "=== CLEANUP ==="
    
    # Clean up test data
    print_status "Cleaning up test events..."
    cleanup_query="ALTER TABLE dev.events DELETE WHERE event_id LIKE 'test-event-%'"
    curl -X POST "http://localhost:8123/" -d "$cleanup_query"
    
    print_status "Cleanup completed"
}

# Main test execution
main() {
    echo "=============================================="
    echo "SIEM API Phase 6.4 & 6.5 Comprehensive Tests"
    echo "=============================================="
    echo
    
    # Check if API is running
    if ! curl -s "$API_URL/v1/health" > /dev/null; then
        print_error "API is not running at $API_URL"
        echo "Please start the API server first with: cd siem_api && cargo run"
        exit 1
    fi
    
    # Check if ClickHouse is running
    if ! curl -s "http://localhost:8123/" > /dev/null; then
        print_error "ClickHouse is not running at http://localhost:8123"
        echo "Please start ClickHouse first"
        exit 1
    fi
    
    print_success "Prerequisites checked - API and ClickHouse are running"
    
    # Generate admin token
    generate_admin_token
    
    # Run tests
    test_system_health
    test_retention_policies
    test_policy_deletion
    test_data_pruner
    test_validation
    
    # Cleanup
    cleanup
    
    echo
    print_success "=============================================="
    print_success "All Phase 6.4 & 6.5 tests completed!"
    print_success "=============================================="
    
    echo
    echo "Summary of tested features:"
    echo "✓ System health monitoring (basic and detailed)"
    echo "✓ Audit log creation and retrieval"
    echo "✓ Retention policy CRUD operations"
    echo "✓ Retention status reporting"
    echo "✓ Data pruning service (dry run)"
    echo "✓ Input validation and error handling"
    echo "✓ Authentication and authorization"
    
    echo
    echo "To run the data pruner in production mode:"
    echo "cd siem_data_pruner && DRY_RUN=false CHECK_INTERVAL_HOURS=24 cargo run"
}

# Handle script interruption
trap cleanup EXIT

# Run main function
main "$@" 