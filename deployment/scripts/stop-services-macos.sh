#!/bin/bash

# SIEM Services Stop Script for macOS
# Stops all SIEM services using launchd

set -euo pipefail

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
RESET='\033[0m'

# Configuration
LAUNCHD_DIR="/Library/LaunchDaemons"

# Service definitions in reverse order (for proper shutdown)
SERVICE_ORDER=(
    "com.siem.ui"
    "com.siem.api"
    "com.siem.consumer"
    "com.siem.schema-validator"
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

# Function to wait for service to stop
wait_for_service_stop() {
    local service="$1"
    local description="$2"
    local max_attempts=30
    local attempt=1
    
    log_info "Waiting for $description to stop..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if ! is_service_running "$service"; then
            log_success "$description has stopped"
            return 0
        fi
        
        sleep 1
        ((attempt++))
    done
    
    log_warning "$description did not stop gracefully within $max_attempts seconds"
    return 1
}

# Function to stop a service
stop_service() {
    local service="$1"
    local description="$2"
    local plist_file="$LAUNCHD_DIR/$service.plist"
    
    if ! is_service_loaded "$service"; then
        log_info "$description is not loaded"
        return 0
    fi
    
    if ! is_service_running "$service"; then
        log_info "$description is not running"
        # Still try to unload it
        if [[ -f "$plist_file" ]]; then
            launchctl unload "$plist_file" 2>/dev/null || true
            log_info "Unloaded $description"
        fi
        return 0
    fi
    
    log_info "Stopping $description..."
    
    # Stop the service
    if launchctl stop "$service" 2>/dev/null; then
        log_info "Sent stop signal to $description"
    else
        log_warning "Failed to send stop signal to $description"
    fi
    
    # Wait for graceful shutdown
    if wait_for_service_stop "$service" "$description"; then
        log_success "$description stopped gracefully"
    else
        log_warning "$description did not stop gracefully, forcing unload..."
    fi
    
    # Unload the service
    if [[ -f "$plist_file" ]]; then
        if launchctl unload "$plist_file" 2>/dev/null; then
            log_success "Unloaded $description"
        else
            log_warning "Failed to unload $description"
        fi
    fi
    
    # Final check
    if ! is_service_running "$service"; then
        log_success "$description is fully stopped"
        return 0
    else
        log_error "$description is still running after stop attempt"
        return 1
    fi
}

# Function to force kill remaining processes
force_kill_remaining() {
    log_info "Checking for remaining SIEM processes..."
    
    local processes=(
        "siem_api"
        "siem_consumer"
        "siem_schema_validator"
    )
    
    local found_processes=false
    
    for process in "${processes[@]}"; do
        local pids=$(pgrep -f "$process" 2>/dev/null || true)
        if [[ -n "$pids" ]]; then
            found_processes=true
            log_warning "Found remaining $process processes: $pids"
            
            # Try SIGTERM first
            echo "$pids" | xargs -r kill -TERM 2>/dev/null || true
            sleep 3
            
            # Check if still running
            local remaining_pids=$(pgrep -f "$process" 2>/dev/null || true)
            if [[ -n "$remaining_pids" ]]; then
                log_warning "Force killing $process processes: $remaining_pids"
                echo "$remaining_pids" | xargs -r kill -KILL 2>/dev/null || true
            fi
        fi
    done
    
    if [[ "$found_processes" == "false" ]]; then
        log_success "No remaining SIEM processes found"
    else
        log_success "Cleaned up remaining processes"
    fi
}

# Function to stop all services
stop_all_services() {
    log_info "Stopping SIEM services..."
    
    local failed_services=()
    
    # Stop services in reverse dependency order
    for service in "${SERVICE_ORDER[@]}"; do
        local description=$(get_service_description "$service")
        
        if stop_service "$service" "$description"; then
            log_success "$description stopped successfully"
        else
            log_error "Failed to stop $description"
            failed_services+=("$description")
        fi
        
        # Add delay between service stops
        sleep 2
    done
    
    # Force kill any remaining processes
    force_kill_remaining
    
    if [[ ${#failed_services[@]} -eq 0 ]]; then
        return 0
    else
        log_error "Failed to stop services: ${failed_services[*]}"
        return 1
    fi
}

# Function to show service status
show_service_status() {
    log_info "Service Status After Stop:"
    echo
    
    for service in "${SERVICE_ORDER[@]}"; do
        local description=$(get_service_description "$service")
        
        if is_service_running "$service"; then
            local pid=$(launchctl list "$service" 2>/dev/null | grep -E "^\s*\"PID\"" | awk '{print $3}' | tr -d ';')
            log_error "$description: Still running (PID: $pid)"
        elif is_service_loaded "$service"; then
            log_warning "$description: Loaded but not running"
        else
            log_success "$description: Stopped and unloaded"
        fi
    done
    
    echo
}

# Function to show remaining processes
show_remaining_processes() {
    log_info "Checking for any remaining SIEM processes..."
    
    local siem_processes=$(ps aux | grep -E "(siem_|com\.siem\.)" | grep -v grep | grep -v "$0" || true)
    
    if [[ -n "$siem_processes" ]]; then
        log_warning "Found remaining SIEM-related processes:"
        echo "$siem_processes"
        echo
        log_info "You may need to manually kill these processes if they persist"
    else
        log_success "No remaining SIEM processes found"
    fi
    
    echo
}

# Main function
main() {
    log_info "Stopping SIEM services on macOS..."
    
    check_root
    
    if stop_all_services; then
        show_service_status
        show_remaining_processes
        log_success "All SIEM services stopped successfully!"
    else
        log_error "Failed to stop some SIEM services"
        show_service_status
        show_remaining_processes
        exit 1
    fi
}

# Run main function
main "$@"