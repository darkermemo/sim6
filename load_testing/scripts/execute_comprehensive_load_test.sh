#!/bin/bash

# SIEM Comprehensive Load Test Execution Script
# Implements the detailed AI Coder Test Scripts from the requirements
# Executes all load test scenarios with full automation and validation

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOAD_TEST_DIR="${SCRIPT_DIR}/.."
LOG_DIR="${SCRIPT_DIR}/logs/$(date +%Y%m%d_%H%M%S)"
RESULTS_DIR="${SCRIPT_DIR}/results/$(date +%Y%m%d_%H%M%S)"

# Service endpoints
API_URL="${API_URL:-http://localhost:8080}"
INGESTOR_URL="${INGESTOR_URL:-http://localhost:8081}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"

# Test configuration
ADMIN_TOKEN=""
TEST_DURATION="2h"
TARGET_EPS=5000
CONCURRENT_USERS=20

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  echo -e "${BLUE}[INFO]${NC}  ${timestamp} - $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC}  ${timestamp} - $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} ${timestamp} - $message" ;;
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} ${timestamp} - $message" ;;
    esac
    
    echo "${timestamp} [${level}] $message" >> "${LOG_DIR}/test_execution.log"
}

# Create directories
setup_directories() {
    log INFO "Setting up test directories..."
    mkdir -p "${LOG_DIR}" "${RESULTS_DIR}"
    
    # Copy test configurations
    cp -r "${LOAD_TEST_DIR}/k6_tests" "${RESULTS_DIR}/"
    cp -r "${LOAD_TEST_DIR}/monitoring" "${RESULTS_DIR}/"
}

# Generate admin token as per requirements
generate_admin_token() {
    log INFO "Generating admin authentication token..."
    
    # Method 1: Use existing script if available
    if [[ -f "${PROJECT_ROOT}/examples/generate_token.rs" ]]; then
        log INFO "Using Rust token generator..."
        cd "${PROJECT_ROOT}/siem_api/examples"
        ADMIN_TOKEN=$(cargo run --bin generate_token admin-user tenant-A Admin 2>/dev/null || echo "")
    fi
    
    # Method 2: Use API endpoint
    if [[ -z "$ADMIN_TOKEN" ]]; then
        log INFO "Using API endpoint for token generation..."
        ADMIN_TOKEN=$(curl -s -X POST "${API_URL}/v1/auth/token" \
            -H "Content-Type: application/json" \
            -d '{"username":"alice","password":"password123","tenant_id":"tenant-A"}' \
            | jq -r '.token // .access_token // empty' 2>/dev/null || echo "")
    fi
    
    # Method 3: Use pre-generated token from file
    if [[ -z "$ADMIN_TOKEN" && -f "${PROJECT_ROOT}/admin_token.txt" ]]; then
        log INFO "Using pre-generated token from file..."
        ADMIN_TOKEN=$(cat "${PROJECT_ROOT}/admin_token.txt" | tr -d '\n\r')
    fi
    
    if [[ -z "$ADMIN_TOKEN" ]]; then
        log ERROR "Failed to generate admin token. Load testing cannot proceed without authentication."
        exit 1
    fi
    
    log SUCCESS "Admin token generated successfully"
    echo "$ADMIN_TOKEN" > "${RESULTS_DIR}/admin_token.txt"
}

# Setup phase as specified in requirements
setup_phase() {
    log INFO "Executing Setup Phase - Creating Detection Rule and Taxonomy Mapping..."
    
    # Create Detection Rule
    log INFO "Creating detection rule: 'Detect Critical Failure'"
    RULE_RESPONSE=$(curl -s -X POST "${API_URL}/v1/rules" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{
            "rule_name": "Detect Critical Failure",
            "description": "Alerts when a log contains CRITICAL FAILURE.",
            "query": "SELECT * FROM dev.events WHERE raw_event LIKE '\''%CRITICAL FAILURE%'\''"
        }')
    
    RULE_STATUS=$(echo "$RULE_RESPONSE" | jq -r '.status // "error"')
    if [[ "$RULE_STATUS" == "error" ]]; then
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/v1/rules" \
            -H "Authorization: Bearer ${ADMIN_TOKEN}" \
            -H "Content-Type: application/json" \
            -d '{"rule_name": "Detect Critical Failure", "description": "Test rule", "query": "SELECT * FROM dev.events WHERE raw_event LIKE '\''%CRITICAL FAILURE%'\''"}')
        
        if [[ "$HTTP_STATUS" == "201" ]]; then
            log SUCCESS "Detection rule created successfully (HTTP 201)"
        else
            log ERROR "Failed to create detection rule (HTTP $HTTP_STATUS)"
            return 1
        fi
    else
        log SUCCESS "Detection rule created successfully"
    fi
    
    # Create Taxonomy Mapping
    log INFO "Creating taxonomy mapping for CRITICAL FAILURE events"
    TAXONOMY_RESPONSE=$(curl -s -X POST "${API_URL}/v1/taxonomy/mappings" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{
            "source_type": "Syslog",
            "field_to_check": "raw_event",
            "value_to_match": "CRITICAL FAILURE",
            "event_category": "Application",
            "event_outcome": "Failure",
            "event_action": "Error.Critical"
        }')
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/v1/taxonomy/mappings" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{"source_type": "Syslog", "field_to_check": "raw_event", "value_to_match": "CRITICAL FAILURE", "event_category": "Application", "event_outcome": "Failure", "event_action": "Error.Critical"}')
    
    if [[ "$HTTP_STATUS" == "201" ]]; then
        log SUCCESS "Taxonomy mapping created successfully (HTTP 201)"
    else
        log WARN "Taxonomy mapping creation returned HTTP $HTTP_STATUS (may already exist)"
    fi
}

# Start rule engine as required
start_rule_engine() {
    log INFO "Starting siem_rule_engine service..."
    RULE_ENGINE_START_TIME=$(date +%s)
    
    cd "${PROJECT_ROOT}/siem_rule_engine"
    nohup cargo run > "${LOG_DIR}/rule_engine.log" 2>&1 &
    RULE_ENGINE_PID=$!
    
    echo "$RULE_ENGINE_PID" > "${RESULTS_DIR}/rule_engine.pid"
    log INFO "Rule engine started with PID $RULE_ENGINE_PID (startup time: $RULE_ENGINE_START_TIME)"
    
    # Give rule engine time to start
    sleep 10
}

# Start monitoring stack
start_monitoring() {
    log INFO "Starting monitoring stack (Prometheus + Grafana)..."
    
    # Start Prometheus
    if command -v prometheus >/dev/null; then
        prometheus --config.file="${LOAD_TEST_DIR}/monitoring/prometheus_config.yml" \
                  --storage.tsdb.path="${RESULTS_DIR}/prometheus_data" \
                  --web.console.libraries=/usr/share/prometheus/console_libraries \
                  --web.console.templates=/usr/share/prometheus/consoles \
                  --web.enable-lifecycle \
                  > "${LOG_DIR}/prometheus.log" 2>&1 &
        
        PROMETHEUS_PID=$!
        echo "$PROMETHEUS_PID" > "${RESULTS_DIR}/prometheus.pid"
        log SUCCESS "Prometheus started with PID $PROMETHEUS_PID"
    else
        log WARN "Prometheus not found, skipping monitoring setup"
    fi
    
    # Start Grafana if available
    if command -v grafana-server >/dev/null; then
        grafana-server --homepath=/usr/share/grafana \
                      --config="${LOAD_TEST_DIR}/monitoring/grafana.ini" \
                      > "${LOG_DIR}/grafana.log" 2>&1 &
        
        GRAFANA_PID=$!
        echo "$GRAFANA_PID" > "${RESULTS_DIR}/grafana.pid"
        log SUCCESS "Grafana started with PID $GRAFANA_PID"
    else
        log WARN "Grafana not found, monitoring will be limited"
    fi
    
    # Wait for services to start
    sleep 15
}

# Execute ingestion and detection test as specified
execute_combined_test() {
    log INFO "Executing Combined Ingestion and Detection Test..."
    log INFO "This test implements the detailed AI Coder Test Scripts from requirements"
    
    # Start benign traffic (1,000 EPS background load)
    log INFO "Starting benign traffic generation (1,000 EPS for 6 minutes)..."
    k6 run --out prometheus \
        -e INGESTOR_URL="$INGESTOR_URL" \
        -e API_URL="$API_URL" \
        -e TARGET_EPS=1000 \
        -e DURATION=6m \
        "${LOAD_TEST_DIR}/k6_tests/benign_background_load.js" \
        > "${LOG_DIR}/benign_load.log" 2>&1 &
    
    BENIGN_PID=$!
    log INFO "Benign load generator started with PID $BENIGN_PID"
    
    # Wait 2 minutes, then inject attack traffic
    log INFO "Waiting 2 minutes before injecting attack traffic..."
    sleep 120
    
    # Inject specific critical event that should trigger the rule
    log INFO "Injecting critical attack event at 2-minute mark..."
    ATTACK_EVENT='<165>Jul 21 00:27:00 db-server-5 CRITICAL FAILURE: Database connection lost'
    
    # Get ingestor IP (using localhost for testing)
    INGESTOR_IP="localhost"
    INGESTOR_PORT="5140"
    
    # Inject via UDP (netcat)
    echo "$ATTACK_EVENT" | nc -u -w0 "$INGESTOR_IP" "$INGESTOR_PORT" || {
        log WARN "UDP injection failed, trying HTTP endpoint..."
        curl -X POST "${INGESTOR_URL}/ingest/raw" \
             -H "Content-Type: text/plain" \
             -d "$ATTACK_EVENT"
    }
    
    ATTACK_TIME=$(date +%s)
    log SUCCESS "Critical attack event injected at timestamp $ATTACK_TIME"
    
    # Continue background load and wait for rule engine cycle
    log INFO "Waiting for rule engine cycle completion (minimum 5 minutes from engine start)..."
    
    # Calculate time to wait for next rule engine cycle
    CURRENT_TIME=$(date +%s)
    RULE_ENGINE_START_TIME=$(cat "${RESULTS_DIR}/rule_engine_start_time" 2>/dev/null || echo "$CURRENT_TIME")
    TIME_SINCE_START=$((CURRENT_TIME - RULE_ENGINE_START_TIME))
    
    # Rule engine runs every 5 minutes, wait until at least one cycle after attack
    if [[ $TIME_SINCE_START -lt 300 ]]; then
        WAIT_TIME=$((300 - TIME_SINCE_START + 60))  # Extra minute for processing
        log INFO "Waiting $WAIT_TIME seconds for rule engine cycle..."
        sleep "$WAIT_TIME"
    else
        log INFO "Waiting 60 seconds for rule engine to process the attack event..."
        sleep 60
    fi
    
    # Stop benign load
    kill $BENIGN_PID 2>/dev/null || true
    wait $BENIGN_PID 2>/dev/null || true
    log INFO "Benign load generation completed"
}

# Verification phase as specified in requirements
verification_phase() {
    log INFO "Executing Verification Phase - Automated Checks..."
    
    # Verify Event in ClickHouse
    log INFO "Verifying critical failure event in ClickHouse..."
    CLICKHOUSE_QUERY="SELECT * FROM dev.events WHERE raw_event LIKE '%CRITICAL FAILURE%' FORMAT JSON"
    
    CLICKHOUSE_RESULT=$(curl -s --data-urlencode "query=$CLICKHOUSE_QUERY" "$CLICKHOUSE_URL" || echo "")
    
    if [[ -n "$CLICKHOUSE_RESULT" ]]; then
        EVENT_COUNT=$(echo "$CLICKHOUSE_RESULT" | jq -r '.rows // 0' 2>/dev/null || echo "0")
        if [[ "$EVENT_COUNT" -gt 0 ]]; then
            log SUCCESS "✅ Event verification: Found $EVENT_COUNT CRITICAL FAILURE events in ClickHouse"
            
            # Check taxonomy fields
            TAXONOMY_CHECK=$(echo "$CLICKHOUSE_RESULT" | jq -r '.data[0].event_category // "unknown"' 2>/dev/null || echo "unknown")
            if [[ "$TAXONOMY_CHECK" == "Application" ]]; then
                log SUCCESS "✅ Taxonomy verification: Event properly categorized as 'Application'"
            else
                log WARN "⚠️  Taxonomy verification: Event category is '$TAXONOMY_CHECK', expected 'Application'"
            fi
        else
            log ERROR "❌ Event verification: No CRITICAL FAILURE events found in ClickHouse"
            return 1
        fi
    else
        log ERROR "❌ Event verification: Failed to query ClickHouse"
        return 1
    fi
    
    # Verify Alert Generation
    log INFO "Verifying alert generation..."
    ALERTS_RESPONSE=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" "${API_URL}/v1/alerts?tenant_id=tenant-A" || echo "")
    
    if [[ -n "$ALERTS_RESPONSE" ]]; then
        ALERT_COUNT=$(echo "$ALERTS_RESPONSE" | jq -r '.alerts | length // 0' 2>/dev/null || echo "0")
        if [[ "$ALERT_COUNT" -gt 0 ]]; then
            log SUCCESS "✅ Alert verification: Found $ALERT_COUNT alerts generated"
            
            # Check alert details
            RULE_ID_CHECK=$(echo "$ALERTS_RESPONSE" | jq -r '.alerts[0].rule_id // "none"' 2>/dev/null || echo "none")
            if [[ "$RULE_ID_CHECK" != "none" && "$RULE_ID_CHECK" != "null" ]]; then
                log SUCCESS "✅ Alert details verification: Alert linked to rule $RULE_ID_CHECK"
            else
                log WARN "⚠️  Alert details: No rule ID found in alert"
            fi
        else
            log ERROR "❌ Alert verification: No alerts found"
            return 1
        fi
    else
        log ERROR "❌ Alert verification: Failed to query alerts endpoint"
        return 1
    fi
    
    # Check Monitoring Dashboards (if available)
    log INFO "Checking monitoring dashboards..."
    
    # Kafka lag check
    if command -v kafka-consumer-groups.sh >/dev/null; then
        KAFKA_LAG=$(kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group siem_clickhouse_writer --describe 2>/dev/null | grep -v "GROUP" | awk '{sum += $5} END {print sum+0}' || echo "unknown")
        if [[ "$KAFKA_LAG" != "unknown" && "$KAFKA_LAG" -lt 10000 ]]; then
            log SUCCESS "✅ Kafka lag check: Consumer lag is $KAFKA_LAG messages (healthy)"
        else
            log WARN "⚠️  Kafka lag check: Consumer lag is $KAFKA_LAG messages"
        fi
    else
        log WARN "Kafka consumer group tools not available for lag verification"
    fi
    
    # Rule engine CPU check (basic process verification)
    if [[ -f "${RESULTS_DIR}/rule_engine.pid" ]]; then
        RULE_ENGINE_PID=$(cat "${RESULTS_DIR}/rule_engine.pid")
        if ps -p "$RULE_ENGINE_PID" > /dev/null; then
            log SUCCESS "✅ Rule engine status: Process is running (PID $RULE_ENGINE_PID)"
        else
            log ERROR "❌ Rule engine status: Process not found"
        fi
    fi
}

# Execute load test scenarios
execute_scenario_1() {
    log INFO "Executing Scenario 1: Ingestion Load Test"
    k6 run --out prometheus \
        -e INGESTOR_URL="$INGESTOR_URL" \
        -e API_URL="$API_URL" \
        -e TARGET_EPS="$TARGET_EPS" \
        "${LOAD_TEST_DIR}/k6_tests/scenario1_ingestion_load.js" \
        | tee "${LOG_DIR}/scenario1_results.txt"
    
    log SUCCESS "Scenario 1 completed"
}

execute_scenario_2() {
    log INFO "Executing Scenario 2: API Query Stress Test"
    k6 run --out prometheus \
        -e API_URL="$API_URL" \
        -e ADMIN_TOKEN="$ADMIN_TOKEN" \
        "${LOAD_TEST_DIR}/k6_tests/scenario2_api_query_stress.js" \
        | tee "${LOG_DIR}/scenario2_results.txt"
    
    log SUCCESS "Scenario 2 completed"
}

execute_scenario_3() {
    log INFO "Executing Scenario 3: Combined Load Test (2 hours)"
    k6 run --out prometheus \
        -e API_URL="$API_URL" \
        -e INGESTOR_URL="$INGESTOR_URL" \
        -e ADMIN_TOKEN="$ADMIN_TOKEN" \
        -e TEST_DURATION="$TEST_DURATION" \
        "${LOAD_TEST_DIR}/k6_tests/scenario3_combined_load.js" \
        | tee "${LOG_DIR}/scenario3_results.txt"
    
    log SUCCESS "Scenario 3 completed"
}

# Generate final report
generate_report() {
    log INFO "Generating comprehensive test report..."
    
    REPORT_FILE="${RESULTS_DIR}/load_test_report.md"
    
    cat > "$REPORT_FILE" << EOF
# SIEM Platform Load Test Report

**Generated:** $(date)
**Test Duration:** $TEST_DURATION
**Target EPS:** $TARGET_EPS
**Concurrent Users:** $CONCURRENT_USERS

## Test Environment
- API URL: $API_URL
- Ingestor URL: $INGESTOR_URL
- ClickHouse URL: $CLICKHOUSE_URL

## Test Results Summary

### Scenario 1: Ingestion Load Test
$(cat "${LOG_DIR}/scenario1_results.txt" 2>/dev/null | tail -20 || echo "Results not available")

### Scenario 2: API Query Stress Test
$(cat "${LOG_DIR}/scenario2_results.txt" 2>/dev/null | tail -20 || echo "Results not available")

### Scenario 3: Combined Load Test
$(cat "${LOG_DIR}/scenario3_results.txt" 2>/dev/null | tail -20 || echo "Results not available")

## Verification Results
- Event Storage: $(grep "Event verification" "${LOG_DIR}/test_execution.log" | tail -1 || echo "Not verified")
- Alert Generation: $(grep "Alert verification" "${LOG_DIR}/test_execution.log" | tail -1 || echo "Not verified")
- Rule Engine: $(grep "Rule engine status" "${LOG_DIR}/test_execution.log" | tail -1 || echo "Not verified")

## Recommendations

Based on the test results, the following recommendations are provided:

1. **Performance Optimization**: Review any scenarios that failed to meet target KPIs
2. **Scaling**: Consider horizontal scaling if EPS targets were not met
3. **Monitoring**: Implement production monitoring based on the alerting rules tested
4. **Capacity Planning**: Use these results for production capacity planning

## Files Generated
- Test logs: ${LOG_DIR}/
- Results data: ${RESULTS_DIR}/
- Monitoring data: ${RESULTS_DIR}/prometheus_data/

EOF

    log SUCCESS "Test report generated: $REPORT_FILE"
}

# Cleanup function
cleanup() {
    log INFO "Cleaning up test processes..."
    
    # Kill monitoring processes
    for pid_file in prometheus.pid grafana.pid rule_engine.pid; do
        if [[ -f "${RESULTS_DIR}/$pid_file" ]]; then
            PID=$(cat "${RESULTS_DIR}/$pid_file")
            kill "$PID" 2>/dev/null || true
            log INFO "Stopped process $pid_file (PID: $PID)"
        fi
    done
    
    # Archive results
    tar -czf "${SCRIPT_DIR}/results/load_test_$(date +%Y%m%d_%H%M%S).tar.gz" \
        -C "${RESULTS_DIR}" . 2>/dev/null || true
    
    log INFO "Cleanup completed"
}

# Main execution flow
main() {
    log INFO "Starting SIEM Comprehensive Load Test Execution"
    log INFO "Test configuration: EPS=$TARGET_EPS, Duration=$TEST_DURATION, Users=$CONCURRENT_USERS"
    
    # Setup
    setup_directories
    
    # Verify services are running
    log INFO "Verifying service availability..."
    for service_url in "$API_URL" "$INGESTOR_URL" "$CLICKHOUSE_URL"; do
        if curl -s --max-time 5 "$service_url" >/dev/null; then
            log SUCCESS "✅ Service available: $service_url"
        else
            log ERROR "❌ Service unavailable: $service_url"
            log ERROR "Please ensure all SIEM services are running before starting load tests"
            exit 1
        fi
    done
    
    # Generate authentication
    generate_admin_token
    
    # Setup phase
    setup_phase
    
    # Start required services
    start_rule_engine
    start_monitoring
    
    # Execute the main test scenarios
    case "${1:-all}" in
        "scenario1"|"1")
            execute_scenario_1
            ;;
        "scenario2"|"2")
            execute_scenario_2
            ;;
        "scenario3"|"3")
            execute_scenario_3
            ;;
        "combined"|"detection")
            execute_combined_test
            verification_phase
            ;;
        "all"|*)
            execute_combined_test
            verification_phase
            execute_scenario_1
            execute_scenario_2
            execute_scenario_3
            ;;
    esac
    
    # Generate report
    generate_report
    
    log SUCCESS "🎯 Load test execution completed successfully!"
    log INFO "📊 Results available in: $RESULTS_DIR"
    log INFO "📈 Monitoring data: ${PROMETHEUS_URL} (if running)"
    log INFO "📋 Report: ${RESULTS_DIR}/load_test_report.md"
}

# Trap cleanup on exit
trap cleanup EXIT

# Execute main function
main "$@" 