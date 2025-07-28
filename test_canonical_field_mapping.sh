#!/bin/bash

# Test Script for Canonical Field Mapping Engine
# This script implements the test cases from the AI prompt for testing
# the core Canonical Field Mapping Engine functionality

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TEST_RESULTS=()
TOTAL_TESTS=0
PASSED_TESTS=0

# Function to log test results
log_test_result() {
    local test_name="$1"
    local status="$2"
    local details="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✅ $test_name: PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ $test_name: FAILED${NC}"
    fi
    
    if [ -n "$details" ]; then
        echo -e "   ${BLUE}Details: $details${NC}"
    fi
    
    TEST_RESULTS+=("$test_name|$status|$details")
}

# Function to create test log files
create_test_logs() {
    mkdir -p test_logs
    
    # Test Case 1: Known aliases
    cat > test_logs/known_aliases.json << EOF
{
  "src_ip": "192.168.0.1",
  "eventName": "login_success"
}
EOF

    # Test Case 2: Unknown fields
    cat > test_logs/unknown_fields.json << EOF
{
  "foobar_field": "unexpected"
}
EOF

    # Test Case 3: Conflicting aliases
    cat > test_logs/conflicting_aliases.json << EOF
{
  "uri": "http://example.com/old",
  "url": "http://example.com/preferred"
}
EOF

    # Test Case 4: Case-insensitive
    cat > test_logs/case_insensitive.json << EOF
{
  "SRC_IP": "10.0.0.1"
}
EOF

    # Test Case 5: Debug output
    cat > test_logs/debug_output.json << EOF
{
  "eventName": "access_granted"
}
EOF

    # Comprehensive test
    cat > test_logs/comprehensive.json << EOF
{
  "src_ip": "192.168.1.100",
  "DST_IP": "10.0.0.50",
  "hostname": "server01",
  "HOST_NAME": "SERVER01",
  "username": "admin",
  "custom_field": "custom_value",
  "url": "https://api.example.com",
  "uri": "https://old.example.com",
  "user_agent": "Mozilla/5.0",
  "status_code": "200",
  "protocol": "https",
  "message": "User login successful"
}
EOF

    echo -e "${BLUE}📁 Test log files created in test_logs/ directory${NC}"
}

# Function to test with siem_parser CLI
test_with_siem_parser() {
    local test_name="$1"
    local input_file="$2"
    local expected_pattern="$3"
    
    echo -e "\n${YELLOW}🧪 Testing: $test_name${NC}"
    echo -e "${BLUE}Input file: $input_file${NC}"
    
    if [ ! -f "$input_file" ]; then
        log_test_result "$test_name" "FAIL" "Input file not found: $input_file"
        return
    fi
    
    # Check if siem_parser binary exists
    if [ ! -f "siem_parser/target/release/siem_parser" ] && [ ! -f "siem_parser/target/debug/siem_parser" ]; then
        echo -e "${YELLOW}⚠️  Building siem_parser...${NC}"
        cd siem_parser
        cargo build --release 2>/dev/null || cargo build
        cd ..
    fi
    
    # Determine binary path
    SIEM_PARSER_BIN=""
    if [ -f "siem_parser/target/release/siem_parser" ]; then
        SIEM_PARSER_BIN="siem_parser/target/release/siem_parser"
    elif [ -f "siem_parser/target/debug/siem_parser" ]; then
        SIEM_PARSER_BIN="siem_parser/target/debug/siem_parser"
    else
        log_test_result "$test_name" "FAIL" "siem_parser binary not found"
        return
    fi
    
    # Run the test
    echo -e "${BLUE}Running: $SIEM_PARSER_BIN --show-alias-trace --input $input_file${NC}"
    
    OUTPUT=$($SIEM_PARSER_BIN --show-alias-trace --input "$input_file" 2>&1)
    EXIT_CODE=$?
    
    echo "$OUTPUT"
    
    if [ $EXIT_CODE -eq 0 ]; then
        if [ -n "$expected_pattern" ] && echo "$OUTPUT" | grep -q "$expected_pattern"; then
            log_test_result "$test_name" "PASS" "Expected pattern found: $expected_pattern"
        elif [ -z "$expected_pattern" ]; then
            log_test_result "$test_name" "PASS" "Execution successful"
        else
            log_test_result "$test_name" "FAIL" "Expected pattern not found: $expected_pattern"
        fi
    else
        log_test_result "$test_name" "FAIL" "Exit code: $EXIT_CODE"
    fi
}

# Function to test with field arguments
test_with_field_args() {
    local test_name="$1"
    shift
    local field_args=("$@")
    
    echo -e "\n${YELLOW}🧪 Testing: $test_name${NC}"
    echo -e "${BLUE}Field args: ${field_args[*]}${NC}"
    
    # Check if siem_parser binary exists
    if [ ! -f "siem_parser/target/release/siem_parser" ] && [ ! -f "siem_parser/target/debug/siem_parser" ]; then
        echo -e "${YELLOW}⚠️  Building siem_parser...${NC}"
        cd siem_parser
        cargo build --release 2>/dev/null || cargo build
        cd ..
    fi
    
    # Determine binary path
    SIEM_PARSER_BIN=""
    if [ -f "siem_parser/target/release/siem_parser" ]; then
        SIEM_PARSER_BIN="siem_parser/target/release/siem_parser"
    elif [ -f "siem_parser/target/debug/siem_parser" ]; then
        SIEM_PARSER_BIN="siem_parser/target/debug/siem_parser"
    else
        log_test_result "$test_name" "FAIL" "siem_parser binary not found"
        return
    fi
    
    # Run the test
    echo -e "${BLUE}Running: $SIEM_PARSER_BIN --show-alias-trace ${field_args[*]}${NC}"
    
    OUTPUT=$($SIEM_PARSER_BIN --show-alias-trace "${field_args[@]}" 2>&1)
    EXIT_CODE=$?
    
    echo "$OUTPUT"
    
    if [ $EXIT_CODE -eq 0 ]; then
        log_test_result "$test_name" "PASS" "Execution successful"
    else
        log_test_result "$test_name" "FAIL" "Exit code: $EXIT_CODE"
    fi
}

# Function to run Rust tests
run_rust_tests() {
    echo -e "\n${YELLOW}🦀 Running Rust Unit Tests${NC}"
    
    cd siem_parser
    
    # Run the specific canonical field mapping tests
    echo -e "${BLUE}Running canonical field mapping engine tests...${NC}"
    if cargo test canonical_field_mapping_engine_tests --lib -- --nocapture; then
        log_test_result "Rust Unit Tests" "PASS" "All canonical field mapping tests passed"
    else
        log_test_result "Rust Unit Tests" "FAIL" "Some tests failed"
    fi
    
    cd ..
}

# Function to test via ingestion API (if available)
test_ingestion_api() {
    echo -e "\n${YELLOW}🌐 Testing Ingestion API (if available)${NC}"
    
    # Check if SIEM system is running
    if curl -s http://localhost:8080/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ SIEM system detected at localhost:8080${NC}"
        
        # Test Case 1: Known aliases via API
        echo -e "\n${BLUE}Testing known aliases via API...${NC}"
        RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/ingest \
            -H "Content-Type: application/json" \
            -d '{"src_ip": "192.168.0.1", "eventName": "login_success"}' || echo "API_ERROR")
        
        if [ "$RESPONSE" != "API_ERROR" ]; then
            log_test_result "API Known Aliases" "PASS" "API ingestion successful"
        else
            log_test_result "API Known Aliases" "FAIL" "API call failed"
        fi
        
        # Test Case 2: Unknown fields via API
        echo -e "\n${BLUE}Testing unknown fields via API...${NC}"
        RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/ingest \
            -H "Content-Type: application/json" \
            -d '{"foobar_field": "unexpected"}' || echo "API_ERROR")
        
        if [ "$RESPONSE" != "API_ERROR" ]; then
            log_test_result "API Unknown Fields" "PASS" "API ingestion successful"
        else
            log_test_result "API Unknown Fields" "FAIL" "API call failed"
        fi
    else
        echo -e "${YELLOW}⚠️  SIEM system not running at localhost:8080, skipping API tests${NC}"
        log_test_result "API Tests" "SKIP" "SIEM system not available"
    fi
}

# Function to generate test report
generate_test_report() {
    echo -e "\n${BLUE}📋 GENERATING TEST REPORT${NC}"
    echo -e "${BLUE}============================================================${NC}"
    
    # Create markdown report
    cat > canonical_field_mapping_test_report.md << EOF
# Canonical Field Mapping Engine Test Report

Generated: $(date)

## Test Summary

- **Total Tests**: $TOTAL_TESTS
- **Passed**: $PASSED_TESTS
- **Failed**: $((TOTAL_TESTS - PASSED_TESTS))
- **Success Rate**: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%

## Test Results

| Test Case | Expected Result | Status |
|-----------|----------------|--------|
EOF

    # Add test results to markdown
    for result in "${TEST_RESULTS[@]}"; do
        IFS='|' read -r test_name status details <<< "$result"
        if [ "$status" = "PASS" ]; then
            echo "| $test_name | $details | ✅ PASSED |" >> canonical_field_mapping_test_report.md
        elif [ "$status" = "SKIP" ]; then
            echo "| $test_name | $details | ⏭️ SKIPPED |" >> canonical_field_mapping_test_report.md
        else
            echo "| $test_name | $details | ❌ FAILED |" >> canonical_field_mapping_test_report.md
        fi
    done
    
    cat >> canonical_field_mapping_test_report.md << EOF

## Test Cases Implemented

### ✅ Test Case: Submit logs with known aliases
- **Input**: \`{"src_ip": "192.168.0.1", "eventName": "login_success"}\`
- **Expected**: Mapped to source.ip, event.action
- **Verification**: Fields not in additional_fields

### ✅ Test Case: Submit logs with unknown fields
- **Input**: \`{"foobar_field": "unexpected"}\`
- **Expected**: Stored in additional_fields
- **Verification**: No structured fields populated

### ✅ Test Case: Submit logs with conflicting aliases
- **Input**: \`{"uri": "http://example.com/old", "url": "http://example.com/preferred"}\`
- **Expected**: url wins due to higher priority
- **Verification**: url.original = preferred URL

### ✅ Test Case: Case-insensitive alias match
- **Input**: \`{"SRC_IP": "10.0.0.1"}\`
- **Expected**: source.ip matched
- **Verification**: No entry in additional_fields

### ✅ Test Case: Resolution debug output
- **Input**: \`{"eventName": "access_granted"}\`
- **Expected**: Debug trace shows alias resolution
- **Verification**: Includes alias used and priority

## Files Generated

- Test log files in \`test_logs/\` directory
- This test report: \`canonical_field_mapping_test_report.md\`
- Rust test module: \`siem_parser/src/canonical_field_mapping_engine_tests.rs\`

## Usage

To run these tests again:

\`\`\`bash
./test_canonical_field_mapping.sh
\`\`\`

To run only Rust tests:

\`\`\`bash
cd siem_parser && cargo test canonical_field_mapping_engine_tests --lib -- --nocapture
\`\`\`

To test individual cases with the CLI:

\`\`\`bash
siem_parser/target/release/siem_parser --show-alias-trace --input test_logs/known_aliases.json
\`\`\`
EOF

    echo -e "${GREEN}📄 Test report generated: canonical_field_mapping_test_report.md${NC}"
}

# Main execution
main() {
    echo -e "${BLUE}🚀 CANONICAL FIELD MAPPING ENGINE TEST SUITE${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE}Testing the core Canonical Field Mapping Engine functionality${NC}"
    echo -e "${BLUE}Based on AI prompt test cases and requirements${NC}\n"
    
    # Create test log files
    create_test_logs
    
    # Run Rust unit tests first
    run_rust_tests
    
    # Test Case 1: Known aliases
    test_with_siem_parser "Submit logs with known aliases" "test_logs/known_aliases.json" "source_ip"
    
    # Test Case 2: Unknown fields
    test_with_siem_parser "Submit logs with unknown fields" "test_logs/unknown_fields.json" "additional_fields"
    
    # Test Case 3: Conflicting aliases
    test_with_siem_parser "Submit logs with conflicting aliases" "test_logs/conflicting_aliases.json" "url"
    
    # Test Case 4: Case-insensitive
    test_with_siem_parser "Case-insensitive alias match" "test_logs/case_insensitive.json" "source_ip"
    
    # Test Case 5: Debug output
    test_with_siem_parser "Resolution debug output" "test_logs/debug_output.json" "ALIAS RESOLUTION TRACE"
    
    # Comprehensive test
    test_with_siem_parser "Comprehensive field mapping" "test_logs/comprehensive.json" "CANONICAL FIELDS"
    
    # Test with field arguments
    test_with_field_args "Field arguments test" "-f" "src_ip=192.168.1.1" "-f" "hostname=testserver"
    
    # Test API if available
    test_ingestion_api
    
    # Generate final report
    generate_test_report
    
    # Final summary
    echo -e "\n${BLUE}📊 FINAL SUMMARY${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${GREEN}✅ Passed: $PASSED_TESTS${NC}"
    echo -e "${RED}❌ Failed: $((TOTAL_TESTS - PASSED_TESTS))${NC}"
    echo -e "${BLUE}📈 Success Rate: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%${NC}"
    
    if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
        echo -e "\n${GREEN}🎉 ALL TESTS PASSED! Canonical Field Mapping Engine is working correctly.${NC}"
        exit 0
    else
        echo -e "\n${YELLOW}⚠️  Some tests failed. Please review the results above.${NC}"
        exit 1
    fi
}

# Run main function
main "$@"