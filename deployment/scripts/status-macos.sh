#!/bin/bash

# SIEM Services Status Script for macOS
# Shows comprehensive status of all SIEM services using launchd

set -euo pipefail

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
CYAN='\033[36m'
RESET='\033[0m'

# Configuration
LAUNCHD_DIR="/Library/LaunchDaemons"
SIEM_LOG_DIR="/var/log/siem"
SIEM_CONFIG_DIR="/etc/siem"
SIEM_HOME="/opt/siem"

# Service definitions
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

# Function to get service port
get_service_port() {
    case "$1" in
        "com.siem.api") echo "3000" ;;
        "com.siem.ui") echo "5173" ;;
        *) echo "" ;;
    esac
}

# Function to log messages
log_info() {
    echo -e "${BLUE}[STATUS]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[STATUS]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[STATUS]${RESET} $1"
}

log_error() {
    echo -e "${RED}[STATUS]${RESET} $1"
}

log_header() {
    echo -e "${CYAN}=== $1 ===${RESET}"
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

# Function to get service PID
get_service_pid() {
    local service="$1"
    if is_service_loaded "$service"; then
        launchctl list "$service" 2>/dev/null | grep -E "^\s*\"PID\"" | awk '{print $3}' | tr -d ';'
    else
        echo "N/A"
    fi
}

# Function to get service uptime
get_service_uptime() {
    local service="$1"
    local pid=$(get_service_pid "$service")
    
    if [[ "$pid" != "N/A" && "$pid" != "0" && -n "$pid" ]]; then
        local start_time=$(ps -o lstart= -p "$pid" 2>/dev/null | xargs)
        if [[ -n "$start_time" ]]; then
            local start_epoch=$(date -j -f "%a %b %d %H:%M:%S %Y" "$start_time" "+%s" 2>/dev/null || echo "0")
            local current_epoch=$(date "+%s")
            local uptime_seconds=$((current_epoch - start_epoch))
            
            if [[ $uptime_seconds -gt 0 ]]; then
                local days=$((uptime_seconds / 86400))
                local hours=$(((uptime_seconds % 86400) / 3600))
                local minutes=$(((uptime_seconds % 3600) / 60))
                
                if [[ $days -gt 0 ]]; then
                    echo "${days}d ${hours}h ${minutes}m"
                elif [[ $hours -gt 0 ]]; then
                    echo "${hours}h ${minutes}m"
                else
                    echo "${minutes}m"
                fi
            else
                echo "<1m"
            fi
        else
            echo "Unknown"
        fi
    else
        echo "N/A"
    fi
}

# Function to get service memory usage
get_service_memory() {
    local service="$1"
    local pid=$(get_service_pid "$service")
    
    if [[ "$pid" != "N/A" && "$pid" != "0" && -n "$pid" ]]; then
        local memory=$(ps -o rss= -p "$pid" 2>/dev/null | xargs)
        if [[ -n "$memory" ]]; then
            # Convert KB to MB
            local memory_mb=$((memory / 1024))
            echo "${memory_mb}MB"
        else
            echo "N/A"
        fi
    else
        echo "N/A"
    fi
}

# Function to check service health
check_service_health() {
    local service="$1"
    local port=$(get_service_port "$service")
    
    if [[ -n "$port" ]]; then
        if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
            echo "Healthy"
        elif curl -s "http://localhost:$port" > /dev/null 2>&1; then
            echo "Responding"
        else
            echo "Unhealthy"
        fi
    else
        echo "N/A"
    fi
}

# Function to show service status
show_service_status() {
    log_header "SIEM Services Status"
    
    printf "%-25s %-10s %-8s %-12s %-8s %-10s\n" "Service" "Status" "PID" "Uptime" "Memory" "Health"
    printf "%-25s %-10s %-8s %-12s %-8s %-10s\n" "-------" "------" "---" "------" "------" "------"
    
    for service in "${SERVICE_ORDER[@]}"; do
        local description=$(get_service_description "$service")
        local status="Stopped"
        local status_color="$RED"
        
        if is_service_running "$service"; then
            status="Running"
            status_color="$GREEN"
        elif is_service_loaded "$service"; then
            status="Loaded"
            status_color="$YELLOW"
        fi
        
        local pid=$(get_service_pid "$service")
        local uptime=$(get_service_uptime "$service")
        local memory=$(get_service_memory "$service")
        local health=$(check_service_health "$service")
        
        printf "%-25s ${status_color}%-10s${RESET} %-8s %-12s %-8s %-10s\n" \
               "$description" "$status" "$pid" "$uptime" "$memory" "$health"
    done
    
    echo
}

# Function to check external dependencies
check_external_dependencies() {
    log_header "External Dependencies"
    
    # Check ClickHouse
    if pgrep -f "clickhouse" > /dev/null; then
        if curl -s "http://localhost:8123/ping" > /dev/null 2>&1; then
            log_success "ClickHouse: Running and responding"
        else
            log_warning "ClickHouse: Running but not responding on port 8123"
        fi
    else
        log_error "ClickHouse: Not running"
    fi
    
    # Check Kafka (if configured)
    if command -v kafka-server-start.sh > /dev/null 2>&1; then
        if pgrep -f "kafka" > /dev/null; then
            log_success "Kafka: Running"
        else
            log_warning "Kafka: Not running"
        fi
    else
        log_info "Kafka: Not installed or not in PATH"
    fi
    
    echo
}

# Function to show recent logs
show_recent_logs() {
    log_header "Recent Logs (Last 5 lines per service)"
    
    local log_files=(
        "$SIEM_LOG_DIR/api.log:API"
        "$SIEM_LOG_DIR/consumer.log:Consumer"
        "$SIEM_LOG_DIR/schema-validator.log:Schema Validator"
        "$SIEM_LOG_DIR/ui.log:UI"
    )
    
    for log_entry in "${log_files[@]}"; do
        local log_file="${log_entry%:*}"
        local service_name="${log_entry#*:}"
        
        if [[ -f "$log_file" ]]; then
            echo -e "${CYAN}$service_name:${RESET}"
            tail -n 5 "$log_file" 2>/dev/null | sed 's/^/  /' || echo "  No recent logs"
            echo
        else
            echo -e "${CYAN}$service_name:${RESET}"
            echo "  Log file not found: $log_file"
            echo
        fi
    done
}

# Function to show system resources
show_system_resources() {
    log_header "System Resources"
    
    # CPU usage
    local cpu_usage=$(top -l 1 -n 0 | grep "CPU usage" | awk '{print $3}' | sed 's/%//')
    echo "CPU Usage: ${cpu_usage}%"
    
    # Memory usage
    local memory_info=$(vm_stat | grep -E "(free|active|inactive|wired)")
    local page_size=$(vm_stat | grep "page size" | awk '{print $8}')
    
    # Disk usage for SIEM directories
    if [[ -d "$SIEM_HOME" ]]; then
        local disk_usage=$(df -h "$SIEM_HOME" | tail -1 | awk '{print $5}')
        echo "Disk Usage (SIEM partition): $disk_usage"
    fi
    
    # Load average
    local load_avg=$(uptime | awk -F'load averages:' '{print $2}' | xargs)
    echo "Load Average: $load_avg"
    
    echo
}

# Function to show configuration summary
show_configuration() {
    log_header "Configuration Summary"
    
    if [[ -f "$SIEM_CONFIG_DIR/siem.env" ]]; then
        echo "Configuration file: $SIEM_CONFIG_DIR/siem.env"
        
        # Show key configuration values (without sensitive data)
        local config_keys=(
            "CLICKHOUSE_URL"
            "KAFKA_BROKERS"
            "API_URL"
            "SIEM_API_PORT"
            "NODE_ENV"
        )
        
        for key in "${config_keys[@]}"; do
            local value=$(grep "^$key=" "$SIEM_CONFIG_DIR/siem.env" 2>/dev/null | cut -d'=' -f2- | sed 's/^["\x27]//;s/["\x27]$//')
            if [[ -n "$value" ]]; then
                echo "  $key: $value"
            fi
        done
    else
        log_warning "Configuration file not found: $SIEM_CONFIG_DIR/siem.env"
    fi
    
    echo
}

# Function to show management commands
show_management_commands() {
    log_header "Management Commands"
    
    echo "Service Management:"
    echo "  Start all services: sudo $(dirname "$0")/start-services-macos.sh"
    echo "  Stop all services: sudo $(dirname "$0")/stop-services-macos.sh"
    echo "  Check status: $(dirname "$0")/status-macos.sh"
    echo
    echo "Individual Service Management:"
    echo "  Load service: sudo launchctl load $LAUNCHD_DIR/com.siem.api.plist"
    echo "  Start service: sudo launchctl start com.siem.api"
    echo "  Stop service: sudo launchctl stop com.siem.api"
    echo "  Unload service: sudo launchctl unload $LAUNCHD_DIR/com.siem.api.plist"
    echo
    echo "Logs:"
    echo "  View API logs: tail -f $SIEM_LOG_DIR/api.log"
    echo "  View Consumer logs: tail -f $SIEM_LOG_DIR/consumer.log"
    echo "  View all logs: tail -f $SIEM_LOG_DIR/*.log"
    echo
}

# Main function
main() {
    echo -e "${CYAN}SIEM System Status Report - macOS${RESET}"
    echo -e "${CYAN}Generated: $(date)${RESET}"
    echo
    
    show_service_status
    check_external_dependencies
    show_system_resources
    show_configuration
    show_recent_logs
    show_management_commands
}

# Run main function
main "$@"