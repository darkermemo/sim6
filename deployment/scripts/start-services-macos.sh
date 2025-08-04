#!/bin/bash

# SIEM Services Start Script for macOS
# Starts all SIEM services using launchd

set -euo pipefail

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
RESET='\033[0m'

# Configuration
LAUNCHD_DIR="/Library/LaunchDaemons"
SIEM_LOG_DIR="/var/log/siem"

# Service definitions with dependencies
SERVICE_ORDER=(
    "com.siem.schema-validator"
    "com.siem.consumer"
    "com.siem.api"
    "com.siem.ui"
)

# Function to get service description
get_service_description() {
    case "$1" in
        "com.siem.schema-validator") echo "SIEM Schema Validator" ;;
        "com.siem.consumer") echo "SIEM Consumer" ;;
        "com.siem.api") echo "SIEM API" ;;
        "com.siem.ui") echo "SIEM UI" ;;
        *) echo "Unknown Service" ;;
    esac
}

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

# Function to check if service is loaded
is_service_loaded() {
    local service="$1"
    launchctl list | grep -q "$service"
}

# Function to check if service is running
is_service_running() {
    local service="$1"
    if is_service_loaded "$service"; then
        local status=$(launchctl list "$service" 2>/dev/null | grep -E "^\s*\"PID\"" | awk '{print $3}' | tr -d ';')
        [[ "$status" != "0" && "$status" != "" ]]
    else
        return 1
    fi
}

# Function to wait for service to start
wait_for_service() {
    local service="$1"
    local description="$2"
    local max_attempts=30
    local attempt=1
    
    log_info "Waiting for $description to start..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if is_service_running "$service"; then
            log_success "$description is running"
            return 0
        fi
        
        sleep 1
        ((attempt++))
    done
    
    log_error "$description failed to start within $max_attempts seconds"
    return 1
}

# Function to load and start a service
start_service() {
    local service="$1"
    local description="$2"
    local plist_file="$LAUNCHD_DIR/$service.plist"
    
    if [[ ! -f "$plist_file" ]]; then
        log_error "Service plist not found: $plist_file"
        return 1
    fi
    
    log_info "Starting $description..."
    
    # Unload if already loaded (to ensure clean start)
    if is_service_loaded "$service"; then
        log_info "Unloading existing $description..."
        launchctl unload "$plist_file" 2>/dev/null || true
        sleep 2
    fi
    
    # Load the service
    if launchctl load "$plist_file"; then
        log_info "Loaded $description"
    else
        log_error "Failed to load $description"
        return 1
    fi
    
    # Start the service
    if launchctl start "$service"; then
        log_info "Started $description"
    else
        log_error "Failed to start $description"
        return 1
    fi
    
    # Wait for service to be running
    if wait_for_service "$service" "$description"; then
        return 0
    else
        return 1
    fi
}

# Function to check external dependencies
check_dependencies() {
    log_info "Checking external dependencies..."
    
    # Check ClickHouse
    if ! pgrep -f "clickhouse" > /dev/null; then
        log_warning "ClickHouse server is not running"
        log_info "Please start ClickHouse server before starting SIEM services"
        log_info "You can start it with: clickhouse server"
        return 1
    else
        log_success "ClickHouse server is running"
    fi
    
    # Check if ClickHouse is responding
    if ! curl -s "http://localhost:8123/ping" > /dev/null; then
        log_warning "ClickHouse server is not responding on port 8123"
        return 1
    else
        log_success "ClickHouse server is responding"
    fi
    
    return 0
}

# Function to create log files if they don't exist
setup_log_files() {
    log_info "Setting up log files..."
    
    local log_files=(
        "$SIEM_LOG_DIR/api.log"
        "$SIEM_LOG_DIR/api.error.log"
        "$SIEM_LOG_DIR/consumer.log"
        "$SIEM_LOG_DIR/consumer.error.log"
        "$SIEM_LOG_DIR/schema-validator.log"
        "$SIEM_LOG_DIR/schema-validator.error.log"
        "$SIEM_LOG_DIR/ui.log"
        "$SIEM_LOG_DIR/ui.error.log"
    )
    
    for log_file in "${log_files[@]}"; do
        if [[ ! -f "$log_file" ]]; then
            touch "$log_file"
            chown siem:siem "$log_file"
            chmod 644 "$log_file"
        fi
    done
    
    log_success "Log files ready"
}

# Function to start all services
start_all_services() {
    log_info "Starting SIEM services..."
    
    # Start services in dependency order
    for service in "${SERVICE_ORDER[@]}"; do
        local description=$(get_service_description "$service")
        
        if is_service_running "$service"; then
            log_info "$description is already running"
        else
            if start_service "$service" "$description"; then
                log_success "$description started successfully"
                
                # Add delay between services to ensure proper startup
                sleep 3
            else
                log_error "Failed to start $description"
                return 1
            fi
        fi
    done
    
    return 0
}

# Function to show service status
show_service_status() {
    log_info "Service Status:"
    echo
    
    for service in "${SERVICE_ORDER[@]}"; do
        local description=$(get_service_description "$service")
        
        if is_service_running "$service"; then
            local pid=$(launchctl list "$service" 2>/dev/null | grep -E "^\s*\"PID\"" | awk '{print $3}' | tr -d ';')
            log_success "$description: Running (PID: $pid)"
        else
            log_error "$description: Not running"
        fi
    done
    
    echo
}

# Function to show post-startup information
show_post_startup_info() {
    log_success "SIEM services startup completed!"
    echo
    log_info "Service URLs:"
    log_info "  API Health: http://localhost:3000/api/v1/health"
    log_info "  API Docs: http://localhost:3000/api/v1/docs"
    log_info "  UI: http://localhost:5173 (if running in dev mode)"
    echo
    log_info "Log files:"
    log_info "  API: $SIEM_LOG_DIR/api.log"
    log_info "  Consumer: $SIEM_LOG_DIR/consumer.log"
    log_info "  Schema Validator: $SIEM_LOG_DIR/schema-validator.log"
    log_info "  UI: $SIEM_LOG_DIR/ui.log"
    echo
    log_info "Management commands:"
    log_info "  Stop services: sudo $0/../stop-services-macos.sh"
    log_info "  Check status: $0/../status-macos.sh"
    log_info "  View logs: tail -f $SIEM_LOG_DIR/api.log"
    echo
}

# Main function
main() {
    log_info "Starting SIEM services on macOS..."
    
    check_root
    
    if ! check_dependencies; then
        log_error "Dependency check failed. Please resolve issues before starting services."
        exit 1
    fi
    
    setup_log_files
    
    if start_all_services; then
        show_service_status
        show_post_startup_info
        log_success "All SIEM services started successfully!"
    else
        log_error "Failed to start some SIEM services"
        show_service_status
        exit 1
    fi
}

# Run main function
main "$@"