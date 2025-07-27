#!/bin/bash

echo "📊 SIEM Cluster Status Check"
echo "============================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

# Check core infrastructure services
check_core_services() {
    echo
    echo "🏗️  Core Infrastructure Services:"
    echo "==================================="
    
    # Check ClickHouse
    echo -n "ClickHouse Database: "
    if brew services list | grep -q 'clickhouse.*started'; then
        if curl -s http://localhost:8123/?query=SELECT%201 | grep -q "1"; then
            log_success "Running & Responding"
        else
            log_warn "Started but not responding"
        fi
    else
        log_error "Stopped"
    fi
    
    # Check Zookeeper
    echo -n "Zookeeper: "
    if brew services list | grep -q 'zookeeper.*started'; then
        if nc -z localhost 2181 2>/dev/null; then
            log_success "Running & Accessible"
        else
            log_warn "Started but not accessible"
        fi
    else
        log_error "Stopped"
    fi
    
    # Check Kafka
    echo -n "Kafka Message Broker: "
    if brew services list | grep -q 'kafka.*started'; then
        if kafka-topics --list --bootstrap-server localhost:9092 >/dev/null 2>&1; then
            local topic_count=$(kafka-topics --list --bootstrap-server localhost:9092 2>/dev/null | wc -l)
            log_success "Running with $topic_count topics"
        else
            log_warn "Started but not accessible"
        fi
    else
        log_error "Stopped"
    fi
}

# Check SIEM applications
check_siem_apps() {
    echo
    echo "🛡️  SIEM Application Services:"
    echo "================================"
    
    # Check SIEM API
    echo -n "SIEM API Service: "
    if [ -f pids/siem_api.pid ] && ps -p $(cat pids/siem_api.pid) > /dev/null 2>&1; then
        if curl -s http://localhost:8080/v1/health >/dev/null 2>&1; then
            local health_status=$(curl -s http://localhost:8080/v1/health | jq -r '.status' 2>/dev/null || echo "unknown")
            log_success "Running - Status: $health_status"
        else
            log_warn "Process running but not responding"
        fi
    else
        log_error "Stopped"
    fi
    
    # Check SIEM Consumer
    echo -n "SIEM Consumer Service: "
    if [ -f pids/siem_consumer.pid ] && ps -p $(cat pids/siem_consumer.pid) > /dev/null 2>&1; then
        log_success "Running (PID: $(cat pids/siem_consumer.pid))"
    else
        log_error "Stopped"
    fi
    
    # Check SIEM Ingestor
    echo -n "SIEM Ingestor Service: "
    if [ -f pids/siem_ingestor.pid ] && ps -p $(cat pids/siem_ingestor.pid) > /dev/null 2>&1; then
        if curl -s http://localhost:8081/health >/dev/null 2>&1; then
            log_success "Running & Responding"
        else
            log_warn "Process running but not responding"
        fi
    else
        log_error "Stopped"
    fi
    
    # Check SIEM Rule Engine
    echo -n "SIEM Rule Engine Service: "
    if [ -f pids/siem_rule_engine.pid ] && ps -p $(cat pids/siem_rule_engine.pid) > /dev/null 2>&1; then
        log_success "Running (PID: $(cat pids/siem_rule_engine.pid))"
    else
        log_error "Stopped"
    fi
}

# Check network connectivity between services
check_connectivity() {
    echo
    echo "🌐 Service Connectivity:"
    echo "========================="
    
    # Test API endpoints
    echo -n "API Health Endpoint: "
    if curl -s http://localhost:8080/v1/health >/dev/null 2>&1; then
        log_success "Accessible"
    else
        log_error "Not accessible"
    fi
    
    echo -n "Ingestor Health Endpoint: "
    if curl -s http://localhost:8081/health >/dev/null 2>&1; then
        log_success "Accessible"
    else
        log_error "Not accessible"
    fi
    
    echo -n "ClickHouse Query Interface: "
    if curl -s http://localhost:8123/?query=SELECT%201 >/dev/null 2>&1; then
        log_success "Accessible"
    else
        log_error "Not accessible"
    fi
    
    echo -n "Kafka Bootstrap Server: "
    if nc -z localhost 9092 2>/dev/null; then
        log_success "Accessible"
    else
        log_error "Not accessible"
    fi
}

# Show resource usage
check_resource_usage() {
    echo
    echo "💻 Resource Usage:"
    echo "=================="
    
    # Show CPU and Memory usage for SIEM processes
    if command -v ps >/dev/null 2>&1; then
        echo
        echo "SIEM Process Resource Usage:"
        echo "----------------------------"
        
        # Header
        printf "%-20s %-8s %-8s %-10s\n" "SERVICE" "PID" "CPU%" "MEM%"
        echo "--------------------------------------------"
        
        # Check each service
        for service in siem_api siem_consumer siem_ingestor siem_rule_engine; do
            if [ -f "pids/${service}.pid" ]; then
                local pid=$(cat "pids/${service}.pid")
                if ps -p $pid >/dev/null 2>&1; then
                    local stats=$(ps -p $pid -o pid=,pcpu=,pmem= 2>/dev/null)
                    if [ -n "$stats" ]; then
                        printf "%-20s %s\n" "$service" "$stats"
                    fi
                fi
            fi
        done
    fi
    
    # Show overall system resources
    echo
    echo "System Resources:"
    echo "-----------------"
    
    # Memory usage
    if command -v free >/dev/null 2>&1; then
        free -h | head -2
    elif command -v vm_stat >/dev/null 2>&1; then
        # macOS memory info
        local pages_free=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
        local pages_total=$(vm_stat | grep -E "(free|active|inactive|speculative|throttled|wired)" | awk '{total += $3} END {print total}')
        local page_size=4096
        local mem_free=$((pages_free * page_size / 1024 / 1024))
        local mem_total=$((pages_total * page_size / 1024 / 1024))
        echo "Memory: ${mem_free}MB free / ${mem_total}MB total"
    fi
    
    # CPU usage
    echo -n "CPU Load: "
    if command -v uptime >/dev/null 2>&1; then
        uptime | awk -F'load average:' '{print $2}'
    fi
}

# Show recent log activity
check_recent_activity() {
    echo
    echo "📋 Recent Log Activity:"
    echo "======================="
    
    if [ -d "logs" ]; then
        for service in siem_api siem_consumer siem_ingestor siem_rule_engine; do
            local log_file="logs/${service}.log"
            if [ -f "$log_file" ]; then
                echo
                echo "📄 $service (last 3 lines):"
                echo "----------------------------"
                tail -3 "$log_file" 2>/dev/null || echo "Unable to read log file"
            fi
        done
    else
        log_warn "No logs directory found"
    fi
}

# Show load testing readiness
check_load_test_readiness() {
    echo
    echo "🧪 Load Testing Readiness:"
    echo "=========================="
    
    local ready_count=0
    local total_services=4
    
    # Check if k6 is installed
    echo -n "k6 Load Testing Tool: "
    if command -v k6 >/dev/null 2>&1; then
        log_success "Installed ($(k6 version | head -1))"
    else
        log_error "Not installed - run: brew install k6"
    fi
    
    # Check if all services are ready
    echo -n "SIEM API Ready: "
    if curl -s http://localhost:8080/v1/health >/dev/null 2>&1; then
        log_success "Ready"
        ready_count=$((ready_count + 1))
    else
        log_error "Not ready"
    fi
    
    echo -n "SIEM Ingestor Ready: "
    if curl -s http://localhost:8081/health >/dev/null 2>&1; then
        log_success "Ready"
        ready_count=$((ready_count + 1))
    else
        log_error "Not ready"
    fi
    
    echo -n "ClickHouse Ready: "
    if curl -s http://localhost:8123/?query=SELECT%201 >/dev/null 2>&1; then
        log_success "Ready"
        ready_count=$((ready_count + 1))
    else
        log_error "Not ready"
    fi
    
    echo -n "Kafka Ready: "
    if kafka-topics --list --bootstrap-server localhost:9092 >/dev/null 2>&1; then
        log_success "Ready"
        ready_count=$((ready_count + 1))
    else
        log_error "Not ready"
    fi
    
    # Overall readiness
    echo
    if [ $ready_count -eq $total_services ]; then
        log_success "🎯 Cluster is READY for load testing!"
        echo "       Run: ./execute_comprehensive_load_test.sh all"
    else
        log_warn "⚠️  Cluster readiness: $ready_count/$total_services services ready"
        echo "       Fix issues above before running load tests"
    fi
}

# Show available commands
show_commands() {
    echo
    echo "🔧 Available Commands:"
    echo "====================="
    echo "  ./start-cluster.sh       - Start all services"
    echo "  ./stop-cluster.sh        - Stop all services"
    echo "  ./status-cluster.sh      - Show this status (current)"
    echo "  ./status-cluster.sh -v   - Verbose status with logs"
    echo "  ./status-cluster.sh -r   - Status with resource usage"
    echo
    echo "Load Testing:"
    echo "  ./execute_comprehensive_load_test.sh all     - Run all test scenarios"
    echo "  ./execute_comprehensive_load_test.sh scenario1 - Run ingestion test"
    echo "  ./execute_comprehensive_load_test.sh scenario2 - Run API stress test"
}

# Main execution
main() {
    local verbose=false
    local show_resources=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                verbose=true
                shift
                ;;
            -r|--resources)
                show_resources=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  -v, --verbose     Show recent log activity"
                echo "  -r, --resources   Show resource usage"
                echo "  -h, --help        Show this help message"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Use -h for help"
                exit 1
                ;;
        esac
    done
    
    check_core_services
    check_siem_apps
    check_connectivity
    
    if [ "$show_resources" = true ]; then
        check_resource_usage
    fi
    
    if [ "$verbose" = true ]; then
        check_recent_activity
    fi
    
    check_load_test_readiness
    show_commands
    
    echo
    echo "🔄 Status check completed at $(date)"
}

main "$@" 