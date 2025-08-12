#!/bin/sh
# Master Test Runner Script
# Executes all integration tests in logical order

set -e

# Colors for output (if terminal supports them)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "${BLUE}=== SIEM Integration Test Suite ===${NC}"
echo "Project root: $PROJECT_ROOT"
echo "Script directory: $SCRIPT_DIR"
echo "Timestamp: $(date)"
echo

# Change to project root
cd "$PROJECT_ROOT"

# Load environment variables if available
if [ -f ".env" ]; then
    echo "${BLUE}Loading environment variables from .env${NC}"
    set -a
    . ./.env
    set +a
    echo "✅ Environment loaded"
else
    echo "${YELLOW}⚠️  No .env file found, using defaults${NC}"
fi
echo

# Function to run a test script
run_test() {
    local script_name="$1"
    local description="$2"
    local script_path="$SCRIPT_DIR/$script_name"
    
    echo "${BLUE}--- $description ---${NC}"
    echo "Running: $script_name"
    echo "Path: $script_path"
    echo
    
    if [ ! -f "$script_path" ]; then
        echo "${RED}❌ Script not found: $script_path${NC}"
        return 1
    fi
    
    if [ ! -x "$script_path" ]; then
        echo "${YELLOW}⚠️  Making script executable${NC}"
        chmod +x "$script_path"
    fi
    
    # Run the test script
    start_time=$(date +%s)
    
    if "$script_path"; then
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        echo "${GREEN}✅ $description: PASSED (${duration}s)${NC}"
        echo
        return 0
    else
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        echo "${RED}❌ $description: FAILED (${duration}s)${NC}"
        echo
        return 1
    fi
}

# Function to run optional test (doesn't fail overall suite)
run_optional_test() {
    local script_name="$1"
    local description="$2"
    
    echo "${BLUE}--- $description (Optional) ---${NC}"
    
    if run_test "$script_name" "$description"; then
        return 0
    else
        echo "${YELLOW}⚠️  Optional test failed, continuing...${NC}"
        echo
        return 1
    fi
}

# Test execution plan
echo "${BLUE}=== Test Execution Plan ===${NC}"
echo "1. ClickHouse connectivity and schema validation"
echo "2. Kafka connectivity and message flow"
echo "3. Redis connectivity and operations"
echo "4. Vector health and metrics (optional)"
echo "5. Health and metrics endpoints"
echo "6. EPS calculation endpoint"
echo "7. Dev UI smoke tests"
echo "8. SSE streaming functionality"
echo "9. Full end-to-end pipeline test"
echo

# Prompt for confirmation (can be skipped with --auto flag)
if [ "$1" != "--auto" ] && [ "$1" != "-a" ]; then
    printf "${YELLOW}Continue with test execution? [y/N]: ${NC}"
    read -r response
    case "$response" in
        [yY][eE][sS]|[yY])
            echo "${GREEN}Starting tests...${NC}"
            ;;
        *)
            echo "${YELLOW}Test execution cancelled.${NC}"
            exit 0
            ;;
    esac
fi
echo

# Initialize counters
total_tests=0
passed_tests=0
failed_tests=0
skipped_tests=0

# Test 1: ClickHouse
echo "${BLUE}🔍 Phase 1: Database Layer Testing${NC}"
total_tests=$((total_tests + 1))
if run_test "test_clickhouse.sh" "ClickHouse Connectivity"; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Test 2: Kafka
echo "${BLUE}📨 Phase 2: Message Queue Testing${NC}"
total_tests=$((total_tests + 1))
if run_test "test_kafka.sh" "Kafka Connectivity"; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Test 3: Redis
echo "${BLUE}🔄 Phase 3: Cache/Stream Testing${NC}"
total_tests=$((total_tests + 1))
if run_test "test_redis.sh" "Redis Connectivity"; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Test 4: Vector (optional)
echo "${BLUE}📊 Phase 4: Vector Integration (Optional)${NC}"
total_tests=$((total_tests + 1))
if run_optional_test "test_vector.sh" "Vector Health and Metrics"; then
    passed_tests=$((passed_tests + 1))
else
    skipped_tests=$((skipped_tests + 1))
fi

# Test 5: Health and Metrics
echo "${BLUE}🏥 Phase 5: Health Monitoring${NC}"
total_tests=$((total_tests + 1))
if run_test "test_health_and_metrics.sh" "Health and Metrics Endpoints"; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Test 6: EPS
echo "${BLUE}📈 Phase 6: Performance Metrics${NC}"
total_tests=$((total_tests + 1))
if run_test "test_eps.sh" "EPS Calculation Endpoint"; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Test 7: Dev UI
echo "${BLUE}🖥️  Phase 7: User Interface${NC}"
total_tests=$((total_tests + 1))
if run_test "test_dev_ui.sh" "Dev UI Smoke Tests"; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Test 8: SSE
echo "${BLUE}🔄 Phase 8: Real-time Streaming${NC}"
total_tests=$((total_tests + 1))
if run_test "test_sse.sh" "SSE Streaming"; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Test 9: Full Pipeline (only if core components are working)
echo "${BLUE}🔗 Phase 9: End-to-End Integration${NC}"
if [ $failed_tests -eq 0 ] || [ $failed_tests -le 2 ]; then
    total_tests=$((total_tests + 1))
    if run_test "test_full_pipeline.sh" "Full Pipeline E2E"; then
        passed_tests=$((passed_tests + 1))
    else
        failed_tests=$((failed_tests + 1))
    fi
else
    echo "${YELLOW}⚠️  Skipping full pipeline test due to multiple component failures${NC}"
    skipped_tests=$((skipped_tests + 1))
fi

echo
echo "${BLUE}=== Test Suite Summary ===${NC}"
echo "Total tests: $total_tests"
echo "${GREEN}Passed: $passed_tests${NC}"
echo "${RED}Failed: $failed_tests${NC}"
echo "${YELLOW}Skipped: $skipped_tests${NC}"
echo

# Calculate success rate
if [ $total_tests -gt 0 ]; then
    success_rate=$(( (passed_tests * 100) / total_tests ))
    echo "Success rate: ${success_rate}%"
else
    success_rate=0
    echo "Success rate: N/A"
fi

echo
echo "${BLUE}=== Component Status Overview ===${NC}"
echo "Database (ClickHouse): $([ -f "$SCRIPT_DIR/.clickhouse_test_passed" ] && echo "${GREEN}✅ Working${NC}" || echo "${RED}❌ Issues${NC}")"
echo "Message Queue (Kafka): $([ -f "$SCRIPT_DIR/.kafka_test_passed" ] && echo "${GREEN}✅ Working${NC}" || echo "${RED}❌ Issues${NC}")"
echo "Cache/Streams (Redis): $([ -f "$SCRIPT_DIR/.redis_test_passed" ] && echo "${GREEN}✅ Working${NC}" || echo "${RED}❌ Issues${NC}")"
echo "Monitoring (Vector): $([ -f "$SCRIPT_DIR/.vector_test_passed" ] && echo "${GREEN}✅ Working${NC}" || echo "${YELLOW}⚠️  Optional${NC}")"
echo "Health Endpoints: $([ -f "$SCRIPT_DIR/.health_test_passed" ] && echo "${GREEN}✅ Working${NC}" || echo "${RED}❌ Issues${NC}")"
echo "EPS Metrics: $([ -f "$SCRIPT_DIR/.eps_test_passed" ] && echo "${GREEN}✅ Working${NC}" || echo "${RED}❌ Issues${NC}")"
echo "Dev UI: $([ -f "$SCRIPT_DIR/.ui_test_passed" ] && echo "${GREEN}✅ Working${NC}" || echo "${RED}❌ Issues${NC}")"
echo "SSE Streaming: $([ -f "$SCRIPT_DIR/.sse_test_passed" ] && echo "${GREEN}✅ Working${NC}" || echo "${RED}❌ Issues${NC}")"
echo "E2E Pipeline: $([ -f "$SCRIPT_DIR/.pipeline_test_passed" ] && echo "${GREEN}✅ Working${NC}" || echo "${RED}❌ Issues${NC}")"

echo
echo "${BLUE}=== Recommendations ===${NC}"

if [ $success_rate -ge 90 ]; then
    echo "${GREEN}🎉 Excellent! System is highly functional.${NC}"
    echo "✅ Ready for development and testing"
    echo "✅ All critical components are working"
elif [ $success_rate -ge 70 ]; then
    echo "${YELLOW}⚠️  Good foundation with some issues to address.${NC}"
    echo "✅ Core functionality is working"
    echo "⚠️  Some components need attention"
elif [ $success_rate -ge 50 ]; then
    echo "${YELLOW}⚠️  Partial functionality - significant work needed.${NC}"
    echo "⚠️  Multiple components have issues"
    echo "❌ Not ready for reliable development"
else
    echo "${RED}❌ Major issues detected - system needs significant fixes.${NC}"
    echo "❌ Multiple critical components are failing"
    echo "❌ Requires immediate attention"
fi

echo
echo "${BLUE}=== Next Steps ===${NC}"
if [ $failed_tests -gt 0 ]; then
    echo "1. Review failed test outputs above"
    echo "2. Check service logs for error details"
    echo "3. Verify configuration files (.env, config.toml)"
    echo "4. Ensure all services are running"
    echo "5. Re-run individual tests after fixes"
else
    echo "1. System is ready for development"
    echo "2. Consider setting up continuous monitoring"
    echo "3. Add these tests to CI/CD pipeline"
    echo "4. Document any configuration requirements"
fi

echo
echo "${BLUE}=== Test Artifacts ===${NC}"
echo "Test logs: Check individual script outputs above"
echo "Configuration: .env, config.toml"
echo "Reports: reports/integration_status.md, reports/integration_findings.json"

echo
echo "${BLUE}Test suite completed at $(date)${NC}"

# Set exit code based on results
if [ $failed_tests -eq 0 ]; then
    echo "${GREEN}🎉 All tests passed!${NC}"
    exit 0
elif [ $success_rate -ge 70 ]; then
    echo "${YELLOW}⚠️  Some tests failed, but system is mostly functional${NC}"
    exit 1
else
    echo "${RED}❌ Multiple critical tests failed${NC}"
    exit 2
fi