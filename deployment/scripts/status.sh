#!/bin/bash

# SIEM System Status Checker
# Provides comprehensive status information for all SIEM services

set -euo pipefail

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
CYAN='\033[36m'
RESET='\033[0m'

# Service configuration
SERVICES=("siem-schema-validator" "siem-consumer" "siem-api" "siem-ui")
CONFIG_FILE="/etc/siem/siem.env"

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
    echo -e "${RED}[STATUS]${RESET} $1" >&2
}

log_header() {
    echo -e "${CYAN}=== $1 ===${RESET}"
}

# Function to check if a service is active
is_service_active() {
    local service="$1"
    systemctl is-active --quiet "$service" 2>/dev/null
}

# Function to get service uptime
get_service_uptime() {
    local service="$1"
    systemctl show "$service" --property=ActiveEnterTimestamp --value 2>/dev/null || echo "Unknown"
}

# Function to get service memory usage
get_service_memory() {
    local service="$1"
    systemctl show "$service" --property=MemoryCurrent --value 2>/dev/null | awk '{if($1>0) printf "%.1f MB", $1/1024/1024; else print "N/A"}'
}

# Function to get service CPU usage
get_service_cpu() {
    local service="$1"
    systemctl show "$service" --property=CPUUsageNSec --value 2>/dev/null | awk '{if($1>0) printf "%.2f%%", $1/1000000000; else print "N/A"}'
}

# Function to check HTTP endpoint
check_http_endpoint() {
    local url="$1"
    local timeout="${2:-5}"
    
    if curl -s --max-time "$timeout" "$url" >/dev/null 2>&1; then
        echo "${GREEN}✓${RESET}"
    else
        echo "${RED}✗${RESET}"
    fi
}

# Function to get HTTP response time
get_response_time() {
    local url="$1"
    local timeout="${2:-5}"
    
    local response_time
    response_time=$(curl -s --max-time "$timeout" -w "%{time_total}" -o /dev/null "$url" 2>/dev/null || echo "timeout")
    
    if [[ "$response_time" == "timeout" ]]; then
        echo "${RED}timeout${RESET}"
    else
        printf "${GREEN}%.3fs${RESET}" "$response_time"
    fi
}

# Function to show detailed service status
show_service_details() {
    log_header "Service Status Details"
    echo
    
    printf "%-25s %-10s %-15s %-12s %-10s\n" "Service" "Status" "Uptime" "Memory" "Enabled"
    printf "%-25s %-10s %-15s %-12s %-10s\n" "-------" "------" "-------" "------" "-------"
    
    for service in "${SERVICES[@]}"; do
        local status memory enabled uptime_display
        
        if is_service_active "$service"; then
            status="${GREEN}ACTIVE${RESET}"
            memory=$(get_service_memory "$service")
            
            # Calculate uptime
            local uptime_timestamp
            uptime_timestamp=$(get_service_uptime "$service")
            if [[ "$uptime_timestamp" != "Unknown" && -n "$uptime_timestamp" ]]; then
                local uptime_seconds
                uptime_seconds=$(( $(date +%s) - $(date -d "$uptime_timestamp" +%s 2>/dev/null || echo 0) ))
                if [[ $uptime_seconds -gt 86400 ]]; then
                    uptime_display="$(( uptime_seconds / 86400 ))d $(( (uptime_seconds % 86400) / 3600 ))h"
                elif [[ $uptime_seconds -gt 3600 ]]; then
                    uptime_display="$(( uptime_seconds / 3600 ))h $(( (uptime_seconds % 3600) / 60 ))m"
                else
                    uptime_display="$(( uptime_seconds / 60 ))m $(( uptime_seconds % 60 ))s"
                fi
            else
                uptime_display="Unknown"
            fi
        else
            status="${RED}INACTIVE${RESET}"
            memory="N/A"
            uptime_display="N/A"
        fi
        
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            enabled="${GREEN}Yes${RESET}"
        else
            enabled="${YELLOW}No${RESET}"
        fi
        
        printf "%-35s %-20s %-15s %-12s %-20s\n" "$service" "$status" "$uptime_display" "$memory" "$enabled"
    done
    
    echo
}

# Function to check external dependencies
check_dependencies() {
    log_header "External Dependencies"
    echo
    
    printf "%-20s %-10s %-15s\n" "Service" "Status" "Response Time"
    printf "%-20s %-10s %-15s\n" "-------" "------" "-------------"
    
    # Check ClickHouse
    local clickhouse_status clickhouse_response
    if systemctl is-active --quiet clickhouse-server 2>/dev/null; then
        clickhouse_status="${GREEN}ACTIVE${RESET}"
        clickhouse_response=$(get_response_time "http://localhost:8123")
    else
        clickhouse_status="${RED}INACTIVE${RESET}"
        clickhouse_response="${RED}N/A${RESET}"
    fi
    
    printf "%-30s %-20s %-25s\n" "ClickHouse" "$clickhouse_status" "$clickhouse_response"
    
    # Check Kafka (if configured)
    if command -v kafka-topics.sh >/dev/null 2>&1; then
        local kafka_status="${YELLOW}UNKNOWN${RESET}"
        local kafka_response="${YELLOW}N/A${RESET}"
        
        # Try to list topics to check if Kafka is running
        if timeout 5 kafka-topics.sh --bootstrap-server localhost:9092 --list >/dev/null 2>&1; then
            kafka_status="${GREEN}ACTIVE${RESET}"
            kafka_response="${GREEN}OK${RESET}"
        else
            kafka_status="${RED}INACTIVE${RESET}"
            kafka_response="${RED}N/A${RESET}"
        fi
        
        printf "%-30s %-20s %-25s\n" "Kafka" "$kafka_status" "$kafka_response"
    fi
    
    echo
}

# Function to check API endpoints
check_api_endpoints() {
    log_header "API Health Checks"
    echo
    
    # Load configuration
    local api_port="3000"
    if [[ -f "$CONFIG_FILE" ]]; then
        source "$CONFIG_FILE"
        api_port="${SIEM_API_PORT:-3000}"
    fi
    
    local base_url="http://localhost:$api_port"
    
    printf "%-30s %-10s %-15s\n" "Endpoint" "Status" "Response Time"
    printf "%-30s %-10s %-15s\n" "--------" "------" "-------------"
    
    # Check main API
    local api_status api_response
    api_status=$(check_http_endpoint "$base_url/api/v1/health")
    api_response=$(get_response_time "$base_url/api/v1/health")
    printf "%-30s %-20s %-25s\n" "API Health" "$api_status" "$api_response"
    
    # Check detailed health
    local detailed_status detailed_response
    detailed_status=$(check_http_endpoint "$base_url/api/v1/health/detailed")
    detailed_response=$(get_response_time "$base_url/api/v1/health/detailed")
    printf "%-30s %-20s %-25s\n" "Detailed Health" "$detailed_status" "$detailed_response"
    
    # Check events endpoint
    local events_status events_response
    events_status=$(check_http_endpoint "$base_url/api/v1/events")
    events_response=$(get_response_time "$base_url/api/v1/events")
    printf "%-30s %-20s %-25s\n" "Events API" "$events_status" "$events_response"
    
    echo
}

# Function to check UI
check_ui_status() {
    log_header "UI Status"
    echo
    
    # Load configuration
    local ui_port="3004"
    if [[ -f "$CONFIG_FILE" ]]; then
        source "$CONFIG_FILE"
        ui_port="${UI_PORT:-3004}"
    fi
    
    local ui_url="http://localhost:$ui_port"
    
    printf "%-30s %-10s %-15s\n" "Component" "Status" "Response Time"
    printf "%-30s %-10s %-15s\n" "---------" "------" "-------------"
    
    local ui_status ui_response
    ui_status=$(check_http_endpoint "$ui_url")
    ui_response=$(get_response_time "$ui_url")
    printf "%-30s %-20s %-25s\n" "SIEM UI" "$ui_status" "$ui_response"
    
    echo
}

# Function to show recent logs
show_recent_logs() {
    local service="${1:-}"
    local lines="${2:-20}"
    
    if [[ -n "$service" ]]; then
        log_header "Recent Logs for $service"
        echo
        journalctl -u "$service" -n "$lines" --no-pager
    else
        log_header "Recent Logs (All Services)"
        echo
        for svc in "${SERVICES[@]}"; do
            echo -e "${CYAN}--- $svc ---${RESET}"
            journalctl -u "$svc" -n 5 --no-pager 2>/dev/null || echo "No logs available"
            echo
        done
    fi
}

# Function to show system resources
show_system_resources() {
    log_header "System Resources"
    echo
    
    # Memory usage
    echo "Memory Usage:"
    free -h | grep -E "Mem:|Swap:" | sed 's/^/  /'
    echo
    
    # Disk usage for SIEM directories
    echo "Disk Usage (SIEM directories):"
    if [[ -d "/opt/siem" ]]; then
        du -sh /opt/siem 2>/dev/null | sed 's/^/  /' || echo "  /opt/siem: Not accessible"
    fi
    if [[ -d "/var/log/siem" ]]; then
        du -sh /var/log/siem 2>/dev/null | sed 's/^/  /' || echo "  /var/log/siem: Not accessible"
    fi
    if [[ -d "/var/lib/siem" ]]; then
        du -sh /var/lib/siem 2>/dev/null | sed 's/^/  /' || echo "  /var/lib/siem: Not accessible"
    fi
    echo
    
    # Load average
    echo "Load Average:"
    uptime | sed 's/^/  /'
    echo
}

# Function to show configuration summary
show_configuration() {
    log_header "Configuration Summary"
    echo
    
    if [[ -f "$CONFIG_FILE" ]]; then
        echo "Configuration file: $CONFIG_FILE"
        echo
        echo "Key settings:"
        grep -E "^(SIEM_API_PORT|UI_PORT|CLICKHOUSE_URL|KAFKA_BROKERS)=" "$CONFIG_FILE" 2>/dev/null | sed 's/^/  /' || echo "  No key settings found"
    else
        echo "Configuration file not found: $CONFIG_FILE"
        echo "Using default settings"
    fi
    
    echo
}

# Main function
main() {
    local option="${1:-all}"
    
    case "$option" in
        "services")
            show_service_details
            ;;
        "deps")
            check_dependencies
            ;;
        "api")
            check_api_endpoints
            ;;
        "ui")
            check_ui_status
            ;;
        "logs")
            show_recent_logs "${2:-}" "${3:-20}"
            ;;
        "resources")
            show_system_resources
            ;;
        "config")
            show_configuration
            ;;
        "all")
            show_service_details
            check_dependencies
            check_api_endpoints
            check_ui_status
            show_system_resources
            show_configuration
            ;;
        *)
            log_error "Unknown option: $option"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
}

# Handle script arguments
case "${1:-}" in
    "--help")
        echo "Usage: $0 [option]"
        echo "Options:"
        echo "  all        Show complete status (default)"
        echo "  services   Show service status details"
        echo "  deps       Check external dependencies"
        echo "  api        Check API endpoints"
        echo "  ui         Check UI status"
        echo "  logs       Show recent logs [service] [lines]"
        echo "  resources  Show system resources"
        echo "  config     Show configuration summary"
        echo "  --help     Show this help message"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac