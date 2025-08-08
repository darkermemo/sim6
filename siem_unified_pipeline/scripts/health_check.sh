#!/bin/bash
# SIEM Unified Pipeline Health Check Script
# Uses existing configuration without creating new files
# Supports both environment variables and --dump-config approach

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BINARY_PATH="${PROJECT_ROOT}/target/release/siem_unified_pipeline"
E2E_TEST_ENABLE="${E2E_TEST_ENABLE:-0}"
VERBOSE="${VERBOSE:-0}"
TIMEOUT="${TIMEOUT:-10}"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for service with timeout
wait_for_service() {
    local url="$1"
    local name="$2"
    local timeout="${3:-$TIMEOUT}"
    local count=0
    
    log_info "Waiting for $name at $url..."
    
    while [ $count -lt $timeout ]; do
        if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
            log_success "$name is responding"
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    
    log_error "$name failed to respond within ${timeout}s"
    return 1
}

# Function to load configuration from environment or binary
load_config() {
    log_info "Loading configuration..."
    
    # Try to use binary's config dump if available
    if [ -f "$BINARY_PATH" ]; then
        log_info "Attempting to load config from binary..."
        # Note: The binary doesn't currently support --dump-config, so we fall back to env vars
    fi
    
    # Load from environment variables (existing approach)
    SIEM_SERVER_HOST="${SIEM_SERVER_HOST:-${SERVER_HOST:-localhost}}"
    SIEM_SERVER_PORT="${SIEM_SERVER_PORT:-${SERVER_PORT:-8080}}"
    
    # Vector configuration
    VECTOR_BASE_URL="${VECTOR_BASE_URL:-http://localhost:8686}"
    VECTOR_HEALTH_PATH="${VECTOR_HEALTH_PATH:-/health}"
    VECTOR_METRICS_PATH="${VECTOR_METRICS_PATH:-/api/v1/sources}"
    
    # Database connections
    CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
    REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
    KAFKA_BROKERS="${KAFKA_BROKERS:-localhost:9092}"
    
    # Test resources (only used if they exist in config)
    KAFKA_TEST_TOPIC="${KAFKA_TEST_TOPIC:-}"
    CLICKHOUSE_TEST_TABLE="${CLICKHOUSE_TEST_TABLE:-}"
    CLICKHOUSE_TEST_DATABASE="${CLICKHOUSE_TEST_DATABASE:-dev}"
    
    # Extract components from URLs
    REDIS_HOST=$(echo "$REDIS_URL" | sed -E 's|^redis://([^:/]+).*|\1|')
    REDIS_PORT=$(echo "$REDIS_URL" | sed -E 's|^redis://[^:/]+:([0-9]+).*|\1|')
    if [ "$REDIS_PORT" = "$REDIS_URL" ]; then
        REDIS_PORT="6379"
    fi
    
    KAFKA_HOST=$(echo "$KAFKA_BROKERS" | cut -d: -f1)
    KAFKA_PORT=$(echo "$KAFKA_BROKERS" | cut -d: -f2)
    
    log_info "Configuration loaded:"
    [ "$VERBOSE" = "1" ] && {
        echo "  SIEM Server: http://$SIEM_SERVER_HOST:$SIEM_SERVER_PORT"
        echo "  Vector: $VECTOR_BASE_URL"
        echo "  ClickHouse: $CLICKHOUSE_URL"
        echo "  Redis: $REDIS_URL"
        echo "  Kafka: $KAFKA_BROKERS"
        [ -n "$KAFKA_TEST_TOPIC" ] && echo "  Test Topic: $KAFKA_TEST_TOPIC"
        [ -n "$CLICKHOUSE_TEST_TABLE" ] && echo "  Test Table: $CLICKHOUSE_TEST_TABLE"
    }
}

# Phase 1: Redis Health Check
check_redis() {
    log_info "Phase 1: Redis Health Check"
    
    # Check if redis-cli is available
    if ! command_exists redis-cli; then
        log_warning "redis-cli not found, skipping Redis checks"
        return 0
    fi
    
    # Read-only check
    log_info "Testing Redis connectivity (read-only)..."
    if redis-cli -u "$REDIS_URL" PING >/dev/null 2>&1; then
        log_success "Redis PING successful"
    else
        log_error "Redis PING failed"
        return 1
    fi
    
    # Light write test (only if E2E testing is enabled)
    if [ "$E2E_TEST_ENABLE" = "1" ]; then
        log_info "Testing Redis write capability..."
        local test_key="health_check:$(date +%s)"
        
        if redis-cli -u "$REDIS_URL" SET "$test_key" "ok" EX 15 >/dev/null 2>&1; then
            local result
            result=$(redis-cli -u "$REDIS_URL" GET "$test_key" 2>/dev/null || echo "")
            if [ "$result" = "ok" ]; then
                log_success "Redis write/read test successful"
                redis-cli -u "$REDIS_URL" DEL "$test_key" >/dev/null 2>&1 || true
            else
                log_error "Redis read test failed"
                return 1
            fi
        else
            log_error "Redis write test failed"
            return 1
        fi
    fi
    
    return 0
}

# Phase 2: Kafka Health Check
check_kafka() {
    log_info "Phase 2: Kafka Health Check"
    
    # Check if kafka tools are available
    if ! command_exists kafka-topics.sh && ! command_exists kcat; then
        log_warning "Kafka tools (kafka-topics.sh or kcat) not found, skipping Kafka checks"
        return 0
    fi
    
    # Basic connectivity check
    log_info "Testing Kafka connectivity..."
    if command_exists kafka-topics.sh; then
        if kafka-topics.sh --bootstrap-server "$KAFKA_BROKERS" --list >/dev/null 2>&1; then
            log_success "Kafka connectivity successful"
        else
            log_error "Kafka connectivity failed"
            return 1
        fi
    elif command_exists kcat; then
        if timeout 5 kcat -b "$KAFKA_BROKERS" -L >/dev/null 2>&1; then
            log_success "Kafka connectivity successful (via kcat)"
        else
            log_error "Kafka connectivity failed (via kcat)"
            return 1
        fi
    fi
    
    # Test topic check (only if test topic is configured)
    if [ -n "$KAFKA_TEST_TOPIC" ] && [ "$E2E_TEST_ENABLE" = "1" ]; then
        log_info "Testing Kafka topic: $KAFKA_TEST_TOPIC"
        
        if command_exists kafka-topics.sh; then
            if kafka-topics.sh --bootstrap-server "$KAFKA_BROKERS" --describe --topic "$KAFKA_TEST_TOPIC" >/dev/null 2>&1; then
                log_success "Test topic $KAFKA_TEST_TOPIC exists"
                
                # Round-trip test
                log_info "Testing Kafka round-trip..."
                local test_message="health_check_$(date +%s)"
                
                if command_exists kcat; then
                    echo "$test_message" | kcat -b "$KAFKA_BROKERS" -t "$KAFKA_TEST_TOPIC" -P -e 2>/dev/null
                    sleep 2
                    local received
                    received=$(timeout 5 kcat -b "$KAFKA_BROKERS" -t "$KAFKA_TEST_TOPIC" -C -o -1 -e -q -c 1 2>/dev/null || echo "")
                    if echo "$received" | grep -q "$test_message"; then
                        log_success "Kafka round-trip test successful"
                    else
                        log_warning "Kafka round-trip test failed (message not received)"
                    fi
                fi
            else
                log_warning "Test topic $KAFKA_TEST_TOPIC does not exist"
            fi
        fi
    fi
    
    return 0
}

# Phase 3: ClickHouse Health Check
check_clickhouse() {
    log_info "Phase 3: ClickHouse Health Check"
    
    # Basic connectivity
    log_info "Testing ClickHouse connectivity..."
    if curl -fsS --max-time "$TIMEOUT" "$CLICKHOUSE_URL/ping" >/dev/null 2>&1; then
        log_success "ClickHouse ping successful"
    else
        log_error "ClickHouse ping failed"
        return 1
    fi
    
    # Basic query test
    log_info "Testing ClickHouse query capability..."
    if curl -fsS --max-time "$TIMEOUT" "$CLICKHOUSE_URL/?query=SELECT%201" >/dev/null 2>&1; then
        log_success "ClickHouse query test successful"
    else
        log_error "ClickHouse query test failed"
        return 1
    fi
    
    # Check if test table exists (only if configured)
    if [ -n "$CLICKHOUSE_TEST_TABLE" ]; then
        log_info "Checking test table: $CLICKHOUSE_TEST_TABLE"
        local query="SELECT name FROM system.tables WHERE database='$CLICKHOUSE_TEST_DATABASE' AND name='$CLICKHOUSE_TEST_TABLE'"
        local encoded_query
        encoded_query=$(echo "$query" | sed 's/ /%20/g' | sed 's/=/%3D/g' | sed "s/'/%27/g")
        
        if curl -fsS --max-time "$TIMEOUT" "$CLICKHOUSE_URL/?query=$encoded_query" 2>/dev/null | grep -q "$CLICKHOUSE_TEST_TABLE"; then
            log_success "Test table $CLICKHOUSE_TEST_TABLE exists"
            
            # Write test (only if E2E testing is enabled)
            if [ "$E2E_TEST_ENABLE" = "1" ]; then
                log_info "Testing ClickHouse write capability..."
                local now
                now=$(date +%s%3N)
                local insert_query="INSERT INTO $CLICKHOUSE_TEST_DATABASE.$CLICKHOUSE_TEST_TABLE FORMAT Values (toDateTime64($now/1000,3),'health_check')"
                
                if curl -fsS --max-time "$TIMEOUT" --data-binary "$insert_query" "$CLICKHOUSE_URL" >/dev/null 2>&1; then
                    log_success "ClickHouse write test successful"
                else
                    log_warning "ClickHouse write test failed"
                fi
            fi
        else
            log_warning "Test table $CLICKHOUSE_TEST_TABLE does not exist"
        fi
    fi
    
    return 0
}

# Phase 4: Vector Health Check
check_vector() {
    log_info "Phase 4: Vector Health Check"
    
    # Health endpoint
    local health_url="$VECTOR_BASE_URL$VECTOR_HEALTH_PATH"
    log_info "Testing Vector health endpoint..."
    if curl -fsS --max-time "$TIMEOUT" "$health_url" >/dev/null 2>&1; then
        log_success "Vector health check successful"
    else
        log_warning "Vector health check failed (may not be running)"
        return 0  # Non-critical
    fi
    
    # API endpoints (if available)
    local sources_url="$VECTOR_BASE_URL/api/v1/sources"
    local sinks_url="$VECTOR_BASE_URL/api/v1/sinks"
    
    if curl -fsS --max-time "$TIMEOUT" "$sources_url" >/dev/null 2>&1; then
        log_success "Vector sources API accessible"
    else
        log_warning "Vector sources API not accessible"
    fi
    
    if curl -fsS --max-time "$TIMEOUT" "$sinks_url" >/dev/null 2>&1; then
        log_success "Vector sinks API accessible"
    else
        log_warning "Vector sinks API not accessible"
    fi
    
    return 0
}

# Phase 5: SIEM Pipeline Health Check
check_siem_pipeline() {
    log_info "Phase 5: SIEM Pipeline Health Check"
    
    local siem_url="http://$SIEM_SERVER_HOST:$SIEM_SERVER_PORT"
    
    # Health endpoint
    log_info "Testing SIEM pipeline health endpoint..."
    if curl -fsS --max-time "$TIMEOUT" "$siem_url/health" >/dev/null 2>&1; then
        log_success "SIEM pipeline health check successful"
    else
        log_warning "SIEM pipeline health check failed (may not be running)"
        return 0  # Non-critical for health check script
    fi
    
    # Metrics endpoint (if enabled)
    if curl -fsS --max-time "$TIMEOUT" "$siem_url/metrics" >/dev/null 2>&1; then
        log_success "SIEM pipeline metrics accessible"
    else
        log_warning "SIEM pipeline metrics not accessible"
    fi
    
    return 0
}

# Phase 6: End-to-End Test (only if enabled and test resources exist)
run_e2e_test() {
    if [ "$E2E_TEST_ENABLE" != "1" ]; then
        log_info "Phase 6: End-to-End Test (skipped - E2E_TEST_ENABLE=0)"
        return 0
    fi
    
    if [ -z "$KAFKA_TEST_TOPIC" ] || [ -z "$CLICKHOUSE_TEST_TABLE" ]; then
        log_info "Phase 6: End-to-End Test (skipped - test resources not configured)"
        return 0
    fi
    
    log_info "Phase 6: End-to-End Test"
    
    # Check if pipeline is running
    local siem_url="http://$SIEM_SERVER_HOST:$SIEM_SERVER_PORT"
    if ! curl -fsS --max-time 5 "$siem_url/health" >/dev/null 2>&1; then
        log_warning "SIEM pipeline not running, skipping E2E test"
        return 0
    fi
    
    # Send test event
    local host_tag="health_check_$(date +%s)"
    local test_event
    test_event=$(cat <<EOF
{"ts":"$(date -Iseconds)","host":"$host_tag","level":"INFO","message":"health_check_probe"}
EOF
)
    
    log_info "Sending test event to Kafka..."
    if command_exists kcat; then
        if echo "$test_event" | kcat -b "$KAFKA_BROKERS" -t "$KAFKA_TEST_TOPIC" -P -e 2>/dev/null; then
            log_success "Test event sent to Kafka"
            
            # Wait for processing
            log_info "Waiting for event processing..."
            sleep 5
            
            # Check ClickHouse for the event
            local query="SELECT count() FROM $CLICKHOUSE_TEST_DATABASE.$CLICKHOUSE_TEST_TABLE WHERE host='$host_tag'"
            local encoded_query
            encoded_query=$(echo "$query" | sed 's/ /%20/g' | sed 's/=/%3D/g' | sed "s/'/%27/g")
            
            local count
            count=$(curl -fsS --max-time "$TIMEOUT" "$CLICKHOUSE_URL/?query=$encoded_query" 2>/dev/null || echo "0")
            
            if [ "$count" -gt 0 ]; then
                log_success "End-to-end test successful (found $count events)"
            else
                log_warning "End-to-end test failed (no events found in ClickHouse)"
            fi
        else
            log_error "Failed to send test event to Kafka"
            return 1
        fi
    else
        log_warning "kcat not available, skipping E2E test"
    fi
    
    return 0
}

# Main execution
main() {
    echo "SIEM Unified Pipeline Health Check"
    echo "=================================="
    echo
    
    # Load configuration
    load_config
    
    local exit_code=0
    
    # Run health checks
    check_redis || exit_code=1
    echo
    
    check_kafka || exit_code=1
    echo
    
    check_clickhouse || exit_code=1
    echo
    
    check_vector || exit_code=1
    echo
    
    check_siem_pipeline || exit_code=1
    echo
    
    run_e2e_test || exit_code=1
    echo
    
    # Summary
    if [ $exit_code -eq 0 ]; then
        log_success "All health checks passed!"
    else
        log_error "Some health checks failed. Check the output above for details."
    fi
    
    return $exit_code
}

# Help function
show_help() {
    cat <<EOF
SIEM Unified Pipeline Health Check Script

Usage: $0 [OPTIONS]

Options:
  -h, --help     Show this help message
  -v, --verbose  Enable verbose output
  -t, --timeout  Set timeout for service checks (default: 10s)
  -e, --e2e      Enable end-to-end testing (requires test resources)

Environment Variables:
  SIEM_SERVER_HOST       SIEM server host (default: localhost)
  SIEM_SERVER_PORT       SIEM server port (default: 8080)
  VECTOR_BASE_URL        Vector base URL (default: http://localhost:8686)
  CLICKHOUSE_URL         ClickHouse URL (default: http://localhost:8123)
  REDIS_URL              Redis URL (default: redis://localhost:6379)
  KAFKA_BROKERS          Kafka brokers (default: localhost:9092)
  KAFKA_TEST_TOPIC       Test topic for E2E testing (optional)
  CLICKHOUSE_TEST_TABLE  Test table for E2E testing (optional)
  E2E_TEST_ENABLE        Enable E2E testing (0 or 1, default: 0)
  VERBOSE                Enable verbose output (0 or 1, default: 0)
  TIMEOUT                Timeout for service checks (default: 10)

Examples:
  # Basic health check
  $0
  
  # Verbose health check with E2E testing
  E2E_TEST_ENABLE=1 VERBOSE=1 $0
  
  # Health check with custom timeout
  TIMEOUT=30 $0 --verbose

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--verbose)
            VERBOSE=1
            shift
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -e|--e2e)
            E2E_TEST_ENABLE=1
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Run main function
main "$@"