#!/bin/bash

# SIEM System Service Starter
# Starts all SIEM services in the correct order with dependency checks

set -euo pipefail

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
RESET='\033[0m'

# Service configuration
SERVICES=("siem-schema-validator" "siem-consumer" "siem-api" "siem-ui")
MAX_WAIT_TIME=60
CHECK_INTERVAL=2

# Function to log messages
log_info() {
    echo -e "${BLUE}[START]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[START]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[START]${RESET} $1"
}

log_error() {
    echo -e "${RED}[START]${RESET} $1" >&2
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

# Function to wait for a service to become active
wait_for_service() {
    local service="$1"
    local elapsed=0
    
    log_info "Waiting for $service to become active..."
    
    while [[ $elapsed -lt $MAX_WAIT_TIME ]]; do
        if is_service_active "$service"; then
            log_success "$service is active"
            return 0
        fi
        
        sleep $CHECK_INTERVAL
        elapsed=$((elapsed + CHECK_INTERVAL))
        
        if [[ $((elapsed % 10)) -eq 0 ]]; then
            log_info "Still waiting for $service... (${elapsed}s elapsed)"
        fi
    done
    
    log_error "$service failed to start within ${MAX_WAIT_TIME}s"
    return 1
}

# Function to check external dependencies
check_dependencies() {
    log_info "Checking external dependencies..."
    
    # Check ClickHouse
    if systemctl is-active --quiet clickhouse-server 2>/dev/null; then
        log_success "ClickHouse is running"
    else
        log_warning "ClickHouse is not running. Attempting to start..."
        if systemctl start clickhouse-server 2>/dev/null; then
            log_success "Started ClickHouse"
        else
            log_error "Failed to start ClickHouse. Please start it manually."
            return 1
        fi
    fi
    
    # Check if ClickHouse is responding
    local clickhouse_url="http://localhost:8123"
    if curl -s "$clickhouse_url" >/dev/null 2>&1; then
        log_success "ClickHouse is responding"
    else
        log_error "ClickHouse is not responding at $clickhouse_url"
        return 1
    fi
    
    log_success "All dependencies are ready"
}

# Function to start a single service
start_service() {
    local service="$1"
    
    if is_service_active "$service"; then
        log_info "$service is already running"
        return 0
    fi
    
    log_info "Starting $service..."
    
    if systemctl start "$service"; then
        if wait_for_service "$service"; then
            log_success "Started $service successfully"
            return 0
        else
            log_error "$service failed to become active"
            # Show recent logs for debugging
            log_error "Recent logs for $service:"
            journalctl -u "$service" -n 10 --no-pager
            return 1
        fi
    else
        log_error "Failed to start $service"
        return 1
    fi
}

# Function to start all services
start_all_services() {
    log_info "Starting SIEM services in order..."
    
    for service in "${SERVICES[@]}"; do
        if ! start_service "$service"; then
            log_error "Failed to start $service. Stopping here."
            return 1
        fi
        
        # Brief pause between services
        sleep 2
    done
    
    log_success "All SIEM services started successfully"
}

# Function to show service status
show_service_status() {
    log_info "Service status summary:"
    echo
    
    for service in "${SERVICES[@]}"; do
        local status
        if is_service_active "$service"; then
            status="${GREEN}ACTIVE${RESET}"
        else
            status="${RED}INACTIVE${RESET}"
        fi
        
        printf "  %-25s %s\n" "$service:" "$status"
    done
    
    echo
}

# Function to show service URLs
show_service_urls() {
    log_info "Service URLs:"
    echo
    
    # Read configuration to get ports
    local config_file="/etc/siem/siem.env"
    if [[ -f "$config_file" ]]; then
        source "$config_file"
        
        echo "  SIEM API:     http://localhost:${SIEM_API_PORT:-3000}/"
        echo "  SIEM UI:      http://localhost:${UI_PORT:-3004}/"
        echo "  ClickHouse:   http://localhost:8123/"
        echo "  Health Check: http://localhost:${SIEM_API_PORT:-3000}/api/v1/health/detailed"
    else
        echo "  SIEM API:     http://localhost:3000/"
        echo "  SIEM UI:      http://localhost:3004/"
        echo "  ClickHouse:   http://localhost:8123/"
        echo "  Health Check: http://localhost:3000/api/v1/health/detailed"
    fi
    
    echo
}

# Function to show management commands
show_management_info() {
    log_info "Service management commands:"
    echo
    echo "  View logs:        journalctl -u <service-name> -f"
    echo "  Stop all:         sudo systemctl stop ${SERVICES[*]}"
    echo "  Restart service:  sudo systemctl restart <service-name>"
    echo "  Check status:     systemctl status <service-name>"
    echo "  Disable service:  sudo systemctl disable <service-name>"
    echo
    echo "  Available services: ${SERVICES[*]}"
    echo
}

# Main function
main() {
    log_info "Starting SIEM system services..."
    
    check_root
    check_dependencies
    start_all_services
    
    echo
    show_service_status
    show_service_urls
    show_management_info
    
    log_success "SIEM system is now running!"
}

# Handle script arguments
case "${1:-}" in
    "--status")
        show_service_status
        exit 0
        ;;
    "--help")
        echo "Usage: $0 [--status|--help]"
        echo "  --status  Show current service status"
        echo "  --help    Show this help message"
        exit 0
        ;;
    "")
        main
        ;;
    *)
        log_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac