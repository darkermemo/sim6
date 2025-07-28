#!/bin/bash

# Batch Test Script for Canonical Field Mapping Engine
# Auto-generated test script

set -e

# Colors
GREEN='[0;32m'
RED='[0;31m'
YELLOW='[1;33m'
BLUE='[0;34m'
NC='[0m'

TEST_DIR="test_logs"
PASSED=0
FAILED=0
TOTAL=0

echo -e "${BLUE}🚀 Running Batch Canonical Field Mapping Tests${NC}"
echo -e "${BLUE}================================================${NC}
"

# Function to run a single test
run_test() {
    local test_file="$1"
    local test_name="$2"
    
    echo -e "${YELLOW}Testing: $test_name${NC}"
    echo -e "${BLUE}File: $test_file${NC}"
    
    TOTAL=$((TOTAL + 1))
    
    if [ -f "$test_file" ]; then
        if siem_parser/target/release/siem_parser --show-alias-trace --input "$test_file" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ PASSED${NC}
"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}❌ FAILED${NC}
"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "${RED}❌ FAILED - File not found${NC}
"
        FAILED=$((FAILED + 1))
    fi
}

# Build siem_parser if needed
if [ ! -f "siem_parser/target/release/siem_parser" ]; then
    echo -e "${YELLOW}Building siem_parser...${NC}"
    cd siem_parser && cargo build --release && cd ..
fi


# Test Case 1 Known Aliases Tests
echo -e "${BLUE}Testing Test Case 1 Known Aliases${NC}"
run_test "$TEST_DIR/test_case_1_known_aliases/basic_known_aliases.json" "Basic Known Aliases"
run_test "$TEST_DIR/test_case_1_known_aliases/multiple_known_aliases.json" "Multiple Known Aliases"
run_test "$TEST_DIR/test_case_1_known_aliases/windows_event_style.json" "Windows Event Style"

# Test Case 2 Unknown Fields Tests
echo -e "${BLUE}Testing Test Case 2 Unknown Fields${NC}"
run_test "$TEST_DIR/test_case_2_unknown_fields/basic_unknown_field.json" "Basic Unknown Field"
run_test "$TEST_DIR/test_case_2_unknown_fields/multiple_unknown_fields.json" "Multiple Unknown Fields"
run_test "$TEST_DIR/test_case_2_unknown_fields/mixed_known_unknown.json" "Mixed Known Unknown"

# Test Case 3 Conflicting Aliases Tests
echo -e "${BLUE}Testing Test Case 3 Conflicting Aliases${NC}"
run_test "$TEST_DIR/test_case_3_conflicting_aliases/uri_url_conflict.json" "Uri Url Conflict"
run_test "$TEST_DIR/test_case_3_conflicting_aliases/source_ip_conflicts.json" "Source Ip Conflicts"
run_test "$TEST_DIR/test_case_3_conflicting_aliases/hostname_conflicts.json" "Hostname Conflicts"
run_test "$TEST_DIR/test_case_3_conflicting_aliases/username_conflicts.json" "Username Conflicts"

# Test Case 4 Case Insensitive Tests
echo -e "${BLUE}Testing Test Case 4 Case Insensitive${NC}"
run_test "$TEST_DIR/test_case_4_case_insensitive/uppercase_src_ip.json" "Uppercase Src Ip"
run_test "$TEST_DIR/test_case_4_case_insensitive/mixed_case_aliases.json" "Mixed Case Aliases"
run_test "$TEST_DIR/test_case_4_case_insensitive/camelcase_aliases.json" "Camelcase Aliases"

# Test Case 5 Debug Output Tests
echo -e "${BLUE}Testing Test Case 5 Debug Output${NC}"
run_test "$TEST_DIR/test_case_5_debug_output/debug_eventname.json" "Debug Eventname"
run_test "$TEST_DIR/test_case_5_debug_output/complex_debug_scenario.json" "Complex Debug Scenario"

# Comprehensive Tests Tests
echo -e "${BLUE}Testing Comprehensive Tests${NC}"
run_test "$TEST_DIR/comprehensive_tests/comprehensive_large_scale.json" "Comprehensive Large Scale"
run_test "$TEST_DIR/comprehensive_tests/apache_access_log_style.json" "Apache Access Log Style"
run_test "$TEST_DIR/comprehensive_tests/windows_security_log_style.json" "Windows Security Log Style"
run_test "$TEST_DIR/comprehensive_tests/firewall_log_style.json" "Firewall Log Style"

# Final summary
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}📊 FINAL RESULTS${NC}"
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo -e "${BLUE}📈 Total: $TOTAL${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "
${GREEN}🎉 ALL TESTS PASSED!${NC}"
    exit 0
else
    echo -e "
${YELLOW}⚠️  Some tests failed.${NC}"
    exit 1
fi
