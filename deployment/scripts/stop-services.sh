#!/bin/bash

# SIEM System Service Stopper
# Stops all SIEM services in the correct order

set -euo pipefail

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
RESET='\033[0m'

# Service configuration (reverse order for stopping)
SERVICES=("siem-ui" "siem-api" "siem-consumer" "siem-schema-validator")
MAX_WAIT_TIME=30
CHECK_INTERVAL=2

# Function to log messages
log_info() {
    echo -e "${BLUE}[STOP]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[STOP]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[STOP]${RESET} $1"
}

log_error() {
    echo -e "${RED}[STOP]${RESET} $1" >&2
}

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Function to check if a service is active
is_service_active() {
    local service="$1"
    systemctl is-active --quiet "$service" 2>/dev/null
}

# Function to wait for a service to stop
wait_for_service_stop() {
    local service="$1"
    local elapsed=0
    
    log_info "Waiting for $service to stop..."
    
    while [[ $elapsed -lt $MAX_WAIT_TIME ]]; do
        if ! is_service_active "$service"; then
            log_success "$service has stopped"
            return 0
        fi
        
        sleep $CHECK_INTERVAL
        elapsed=$((elapsed + CHECK_INTERVAL))
        
        if [[ $((elapsed % 10)) -eq 0 ]]; then
            log_info "Still waiting for $service to stop... (${elapsed}s elapsed)"
        fi
    done
    
    log_warning "$service did not stop gracefully within ${MAX_WAIT_TIME}s"
    return 1
}

# Function to force stop a service
force_stop_service() {
    local service="$1"
    
    log_warning "Force stopping $service..."
    
    if systemctl kill --signal=SIGKILL "$service" 2>/dev/null; then
        sleep 2
        if ! is_service_active "$service"; then
            log_success "Force stopped $service"
            return 0
        fi
    fi
    
    log_error "Failed to force stop $service"
    return 1
}

# Function to stop a single service
stop_service() {
    local service="$1"
    local force="${2:-false}"
    
    if ! is_service_active "$service"; then
        log_info "$service is already stopped"
        return 0
    fi
    
    log_info "Stopping $service..."
    
    if systemctl stop "$service" 2>/dev/null; then
        if wait_for_service_stop "$service"; then
            log_success "Stopped $service successfully"
            return 0
        else
            if [[ "$force" == "true" ]]; then
                force_stop_service "$service"
            else
                log_error "$service did not stop gracefully"
                return 1
            fi
        fi
    else
        log_error "Failed to stop $service"
        if [[ "$force" == "true" ]]; then
            force_stop_service "$service"
        else
            return 1
        fi
    fi
}

# Function to stop all services
stop_all_services() {
    local force="${1:-false}"
    
    log_info "Stopping SIEM services in reverse order..."
    
    for service in "${SERVICES[@]}"; do
        stop_service "$service" "$force"
        
        # Brief pause between services
        sleep 1
    done
    
    log_success "All SIEM services stopped"
}

# Function to show service status
show_service_status() {
    log_info "Service status summary:"
    echo
    
    for service in "${SERVICES[@]}"; do
        local status
        if is_service_active "$service"; then
            status="${RED}ACTIVE${RESET}"
        else
            status="${GREEN}STOPPED${RESET}"
        fi
        
        printf "  %-25s %s\n" "$service:" "$status"
    done
    
    echo
}

# Function to disable services (prevent auto-start)
disable_services() {
    log_info "Disabling SIEM services..."
    
    for service in "${SERVICES[@]}"; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            log_info "Disabling $service..."
            if systemctl disable "$service" 2>/dev/null; then
                log_success "Disabled $service"
            else
                log_error "Failed to disable $service"
            fi
        else
            log_info "$service is already disabled"
        fi
    done
    
    log_success "All SIEM services disabled"
}

# Function to show running processes
show_running_processes() {
    log_info "Checking for running SIEM processes..."
    echo
    
    local processes_found=false
    
    # Check for SIEM processes
    local siem_processes
    siem_processes=$(pgrep -f "siem_" 2>/dev/null || true)
    
    if [[ -n "$siem_processes" ]]; then
        processes_found=true
        echo "  Running SIEM processes:"
        ps -p "$siem_processes" -o pid,ppid,cmd --no-headers | sed 's/^/    /'
        echo
    fi
    
    # Check for Node.js processes (UI)
    local node_processes
    node_processes=$(pgrep -f "node.*siem" 2>/dev/null || true)
    
    if [[ -n "$node_processes" ]]; then
        processes_found=true
        echo "  Running Node.js SIEM processes:"
        ps -p "$node_processes" -o pid,ppid,cmd --no-headers | sed 's/^/    /'
        echo
    fi
    
    if [[ "$processes_found" == "false" ]]; then
        log_success "No SIEM processes found running"
    else
        log_warning "Some SIEM processes are still running"
        echo "  Use 'sudo pkill -f siem_' to force kill them"
        echo
    fi
}

# Main function
main() {
    local force="${1:-false}"
    
    log_info "Stopping SIEM system services..."
    
    check_root
    stop_all_services "$force"
    
    echo
    show_service_status
    show_running_processes
    
    log_success "SIEM system services stopped!"
}

# Handle script arguments
case "${1:-}" in
    "--force")
        main "true"
        ;;
    "--disable")
        check_root
        stop_all_services "false"
        disable_services
        show_service_status
        ;;
    "--status")
        show_service_status
        show_running_processes
        exit 0
        ;;
    "--help")
        echo "Usage: $0 [--force|--disable|--status|--help]"
        echo "  --force    Force stop services (use SIGKILL if needed)"
        echo "  --disable  Stop and disable services (prevent auto-start)"
        echo "  --status   Show current service status"
        echo "  --help     Show this help message"
        exit 0
        ;;
    "")
        main "false"
        ;;
    *)
        log_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac