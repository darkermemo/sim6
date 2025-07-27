#!/bin/bash

echo "🛑 Stopping Local SIEM Cluster Simulation..."
echo "============================================="

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
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Stop SIEM applications
stop_siem_apps() {
    log_info "Stopping SIEM applications..."
    
    # Stop SIEM API
    if [ -f pids/siem_api.pid ]; then
        echo "[1/4] Stopping SIEM API..."
        if kill $(cat pids/siem_api.pid) 2>/dev/null; then
            log_success "SIEM API stopped"
        else
            log_warn "SIEM API process not found or already stopped"
        fi
        rm -f pids/siem_api.pid
    else
        log_info "SIEM API PID file not found, skipping"
    fi
    
    # Stop SIEM Consumer
    if [ -f pids/siem_consumer.pid ]; then
        echo "[2/4] Stopping SIEM Consumer..."
        if kill $(cat pids/siem_consumer.pid) 2>/dev/null; then
            log_success "SIEM Consumer stopped"
        else
            log_warn "SIEM Consumer process not found or already stopped"
        fi
        rm -f pids/siem_consumer.pid
    else
        log_info "SIEM Consumer PID file not found, skipping"
    fi
    
    # Stop SIEM Ingestor
    if [ -f pids/siem_ingestor.pid ]; then
        echo "[3/4] Stopping SIEM Ingestor..."
        if kill $(cat pids/siem_ingestor.pid) 2>/dev/null; then
            log_success "SIEM Ingestor stopped"
        else
            log_warn "SIEM Ingestor process not found or already stopped"
        fi
        rm -f pids/siem_ingestor.pid
    else
        log_info "SIEM Ingestor PID file not found, skipping"
    fi
    
    # Stop SIEM Rule Engine
    if [ -f pids/siem_rule_engine.pid ]; then
        echo "[4/4] Stopping SIEM Rule Engine..."
        if kill $(cat pids/siem_rule_engine.pid) 2>/dev/null; then
            log_success "SIEM Rule Engine stopped"
        else
            log_warn "SIEM Rule Engine process not found or already stopped"
        fi
        rm -f pids/siem_rule_engine.pid
    else
        log_info "SIEM Rule Engine PID file not found, skipping"
    fi
    
    # Wait for processes to terminate gracefully
    log_info "Waiting for processes to terminate gracefully..."
    sleep 3
}

# Stop core infrastructure services
stop_core_services() {
    log_info "Stopping core infrastructure services..."
    
    # Stop Kafka
    echo "[1/3] Stopping Kafka..."
    if brew services stop kafka 2>/dev/null; then
        log_success "Kafka stopped"
    else
        log_warn "Kafka failed to stop or was already stopped"
    fi
    
    # Stop Zookeeper
    echo "[2/3] Stopping Zookeeper..."
    if brew services stop zookeeper 2>/dev/null; then
        log_success "Zookeeper stopped"
    else
        log_warn "Zookeeper failed to stop or was already stopped"
    fi
    
    # Stop ClickHouse
    echo "[3/3] Stopping ClickHouse..."
    if brew services stop clickhouse 2>/dev/null; then
        log_success "ClickHouse stopped"
    else
        log_warn "ClickHouse failed to stop or was already stopped"
    fi
}

# Cleanup any remaining processes
cleanup_remaining_processes() {
    log_info "Cleaning up any remaining SIEM processes..."
    
    # Kill any remaining cargo run processes for SIEM services
    pkill -f "cargo run" 2>/dev/null && log_info "Killed remaining cargo processes" || log_info "No remaining cargo processes found"
    
    # Clean up any remaining Rust processes for SIEM services
    for service in siem_api siem_consumer siem_ingestor siem_rule_engine; do
        pkill -f "$service" 2>/dev/null && log_info "Killed remaining $service processes" || true
    done
}

# Show final status
show_final_status() {
    echo
    echo "📊 Final Cluster Status:"
    echo "========================"
    
    # Check if any SIEM processes are still running
    local remaining_processes=0
    
    if pgrep -f "siem_api" >/dev/null 2>&1; then
        echo "❌ SIEM API processes still running"
        remaining_processes=$((remaining_processes + 1))
    else
        echo "✅ SIEM API: Stopped"
    fi
    
    if pgrep -f "siem_consumer" >/dev/null 2>&1; then
        echo "❌ SIEM Consumer processes still running"
        remaining_processes=$((remaining_processes + 1))
    else
        echo "✅ SIEM Consumer: Stopped"
    fi
    
    if pgrep -f "siem_ingestor" >/dev/null 2>&1; then
        echo "❌ SIEM Ingestor processes still running"
        remaining_processes=$((remaining_processes + 1))
    else
        echo "✅ SIEM Ingestor: Stopped"
    fi
    
    if pgrep -f "siem_rule_engine" >/dev/null 2>&1; then
        echo "❌ SIEM Rule Engine processes still running"
        remaining_processes=$((remaining_processes + 1))
    else
        echo "✅ SIEM Rule Engine: Stopped"
    fi
    
    # Check core services
    brew services list | grep -q 'clickhouse.*started' && echo "⚠️  ClickHouse: Still Running" || echo "✅ ClickHouse: Stopped"
    brew services list | grep -q 'kafka.*started' && echo "⚠️  Kafka: Still Running" || echo "✅ Kafka: Stopped"
    brew services list | grep -q 'zookeeper.*started' && echo "⚠️  Zookeeper: Still Running" || echo "✅ Zookeeper: Stopped"
    
    if [ $remaining_processes -gt 0 ]; then
        echo
        log_warn "$remaining_processes SIEM processes may still be running"
        log_info "You may need to kill them manually: pkill -f siem_"
    fi
}

# Archive logs
archive_logs() {
    if [ -d "logs" ] && [ "$(ls -A logs)" ]; then
        local timestamp=$(date '+%Y%m%d_%H%M%S')
        local archive_dir="logs_archive_${timestamp}"
        
        log_info "Archiving logs to $archive_dir..."
        mv logs "$archive_dir" 2>/dev/null && log_success "Logs archived successfully" || log_warn "Failed to archive logs"
        mkdir -p logs
    fi
}

# Main execution
main() {
    local archive_logs_flag=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --archive-logs)
                archive_logs_flag=true
                shift
                ;;
            --force)
                log_info "Force shutdown requested"
                cleanup_remaining_processes
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  --archive-logs    Archive logs before shutdown"
                echo "  --force          Force kill any remaining processes"
                echo "  -h, --help       Show this help message"
                exit 0
                ;;
            *)
                log_warn "Unknown option: $1"
                shift
                ;;
        esac
    done
    
    echo "🎯 SIEM Local Cluster Shutdown"
    echo "==============================="
    echo "This will stop all SIEM services and infrastructure"
    echo
    
    stop_siem_apps
    stop_core_services
    cleanup_remaining_processes
    
    if [ "$archive_logs_flag" = true ]; then
        archive_logs
    fi
    
    show_final_status
    
    echo
    echo "🎉 SIEM Cluster Simulation Stopped!"
    echo "===================================="
    echo
    echo "📋 What's Next:"
    echo "  • Review logs in logs_archive_* directories"
    echo "  • Clean up any remaining processes if needed"
    echo "  • Restart cluster with: ./start-cluster.sh"
    echo
}

main "$@" 