#!/bin/bash

# SIEM Deployment Summary
# Shows deployment status and provides next steps

set -euo pipefail

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
CYAN='\033[36m'
BOLD='\033[1m'
RESET='\033[0m'

# Configuration
DEPLOYMENT_DIR="/Users/yasseralmohammed/sim6/deployment"
SERVICES=("siem-schema-validator" "siem-consumer" "siem-api" "siem-ui")
BINARIES=("siem_api" "siem_consumer" "siem_schema_validator")

# Function to log messages
log_header() {
    echo -e "${BOLD}${CYAN}=== $1 ===${RESET}"
}

log_info() {
    echo -e "${BLUE}[INFO]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${RESET} $1"
}

log_error() {
    echo -e "${RED}[✗]${RESET} $1"
}

# Function to check if file exists
check_file() {
    local file="$1"
    local description="$2"
    
    if [[ -f "$file" ]]; then
        log_success "$description: $file"
        return 0
    else
        log_error "$description: $file (missing)"
        return 1
    fi
}

# Function to check if directory exists
check_directory() {
    local dir="$1"
    local description="$2"
    
    if [[ -d "$dir" ]]; then
        log_success "$description: $dir"
        return 0
    else
        log_error "$description: $dir (missing)"
        return 1
    fi
}

# Function to check deployment files
check_deployment_files() {
    log_header "Deployment Files Status"
    echo
    
    local all_good=true
    
    # Check scripts
    echo "${BOLD}Scripts:${RESET}"
    check_file "$DEPLOYMENT_DIR/scripts/build.sh" "Build script" || all_good=false
    check_file "$DEPLOYMENT_DIR/scripts/install.sh" "Install script" || all_good=false
    check_file "$DEPLOYMENT_DIR/scripts/start-services.sh" "Start services script" || all_good=false
    check_file "$DEPLOYMENT_DIR/scripts/stop-services.sh" "Stop services script" || all_good=false
    check_file "$DEPLOYMENT_DIR/scripts/status.sh" "Status script" || all_good=false
    echo
    
    # Check systemd service files
    echo "${BOLD}Systemd Service Files:${RESET}"
    for service in "${SERVICES[@]}"; do
        check_file "$DEPLOYMENT_DIR/systemd/$service.service" "$service service file" || all_good=false
    done
    echo
    
    # Check configuration
    echo "${BOLD}Configuration:${RESET}"
    check_file "$DEPLOYMENT_DIR/config/siem.env" "Environment configuration" || all_good=false
    echo
    
    # Check if binaries exist (after build)
    echo "${BOLD}Built Binaries:${RESET}"
    for binary in "${BINARIES[@]}"; do
        if [[ -f "$DEPLOYMENT_DIR/bin/$binary" ]]; then
            log_success "Binary: $binary"
        else
            log_warning "Binary: $binary (not built yet)"
        fi
    done
    echo
    
    if [[ "$all_good" == "true" ]]; then
        log_success "All deployment files are present"
    else
        log_warning "Some deployment files are missing"
    fi
    
    echo
}

# Function to check if services are installed
check_installation_status() {
    log_header "Installation Status"
    echo
    
    local installed_count=0
    
    # Check if siem user exists
    if id "siem" >/dev/null 2>&1; then
        log_success "SIEM user account exists"
    else
        log_warning "SIEM user account not created yet"
    fi
    
    # Check directories
    echo "${BOLD}System Directories:${RESET}"
    check_directory "/opt/siem" "SIEM installation directory" && ((installed_count++))
    check_directory "/etc/siem" "SIEM configuration directory" && ((installed_count++))
    check_directory "/var/log/siem" "SIEM log directory" && ((installed_count++))
    check_directory "/var/lib/siem" "SIEM data directory" && ((installed_count++))
    echo
    
    # Check installed binaries
    echo "${BOLD}Installed Binaries:${RESET}"
    for binary in "${BINARIES[@]}"; do
        if [[ -f "/opt/siem/bin/$binary" ]]; then
            log_success "Installed: $binary"
            ((installed_count++))
        else
            log_warning "Not installed: $binary"
        fi
    done
    echo
    
    # Check systemd services
    echo "${BOLD}Systemd Services:${RESET}"
    for service in "${SERVICES[@]}"; do
        if [[ -f "/etc/systemd/system/$service.service" ]]; then
            log_success "Service file: $service"
            ((installed_count++))
        else
            log_warning "Service file missing: $service"
        fi
    done
    echo
    
    if [[ $installed_count -gt 0 ]]; then
        log_info "Installation progress: $installed_count components installed"
    else
        log_warning "Services not installed yet"
    fi
    
    echo
}

# Function to check service status
check_service_status() {
    log_header "Service Runtime Status"
    echo
    
    local running_count=0
    
    for service in "${SERVICES[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            log_success "$service is running"
            ((running_count++))
        elif systemctl list-unit-files "$service.service" >/dev/null 2>&1; then
            log_warning "$service is installed but not running"
        else
            log_error "$service is not installed"
        fi
    done
    
    echo
    log_info "Running services: $running_count/${#SERVICES[@]}"
    echo
}

# Function to show next steps
show_next_steps() {
    log_header "Next Steps"
    echo
    
    # Check what needs to be done
    local needs_build=false
    local needs_install=false
    local needs_start=false
    
    # Check if binaries are built
    for binary in "${BINARIES[@]}"; do
        if [[ ! -f "$DEPLOYMENT_DIR/bin/$binary" ]]; then
            needs_build=true
            break
        fi
    done
    
    # Check if services are installed
    if [[ ! -d "/opt/siem" ]]; then
        needs_install=true
    fi
    
    # Check if services are running
    local running_services=0
    for service in "${SERVICES[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            ((running_services++))
        fi
    done
    
    if [[ $running_services -lt ${#SERVICES[@]} ]]; then
        needs_start=true
    fi
    
    # Show appropriate next steps
    if [[ "$needs_build" == "true" ]]; then
        echo "${BOLD}1. Build the services:${RESET}"
        echo "   cd $DEPLOYMENT_DIR"
        echo "   sudo ./scripts/build.sh"
        echo
    fi
    
    if [[ "$needs_install" == "true" ]]; then
        echo "${BOLD}2. Install the services:${RESET}"
        echo "   sudo ./scripts/install.sh"
        echo
    fi
    
    if [[ "$needs_start" == "true" ]]; then
        echo "${BOLD}3. Start the services:${RESET}"
        echo "   sudo ./scripts/start-services.sh"
        echo
    fi
    
    if [[ "$needs_build" == "false" && "$needs_install" == "false" && "$needs_start" == "false" ]]; then
        log_success "All services are built, installed, and running!"
        echo
        echo "${BOLD}Access your SIEM system:${RESET}"
        echo "   SIEM UI:      http://localhost:3004/"
        echo "   SIEM API:     http://localhost:3000/"
        echo "   Health Check: http://localhost:3000/api/v1/health/detailed"
        echo
        echo "${BOLD}Management commands:${RESET}"
        echo "   Check status: ./scripts/status.sh"
        echo "   Stop services: sudo ./scripts/stop-services.sh"
        echo "   View logs: journalctl -u siem-api -f"
        echo
    else
        echo "${BOLD}After completion, your SIEM system will be available at:${RESET}"
        echo "   SIEM UI:      http://localhost:3004/"
        echo "   SIEM API:     http://localhost:3000/"
        echo "   Health Check: http://localhost:3000/api/v1/health/detailed"
        echo
    fi
}

# Function to show troubleshooting tips
show_troubleshooting() {
    log_header "Troubleshooting"
    echo
    
    echo "${BOLD}Common issues and solutions:${RESET}"
    echo
    echo "${BOLD}1. Permission denied errors:${RESET}"
    echo "   - Make sure to run installation scripts with sudo"
    echo "   - Check that scripts are executable: chmod +x scripts/*.sh"
    echo
    echo "${BOLD}2. Service fails to start:${RESET}"
    echo "   - Check logs: journalctl -u <service-name> -n 50"
    echo "   - Verify ClickHouse is running: systemctl status clickhouse-server"
    echo "   - Check configuration: cat /etc/siem/siem.env"
    echo
    echo "${BOLD}3. Port conflicts:${RESET}"
    echo "   - Check what's using ports: sudo lsof -i :3000 -i :3004"
    echo "   - Stop conflicting processes or change ports in config"
    echo
    echo "${BOLD}4. Build failures:${RESET}"
    echo "   - Ensure Rust is installed: rustc --version"
    echo "   - Update Rust: rustup update"
    echo "   - Clean build: cargo clean && cargo build --release"
    echo
    echo "${BOLD}5. UI issues:${RESET}"
    echo "   - Ensure Node.js is installed: node --version"
    echo "   - Check npm cache: npm cache clean --force"
    echo "   - Reinstall dependencies: rm -rf node_modules && npm install"
    echo
}

# Main function
main() {
    echo -e "${BOLD}${BLUE}SIEM System Deployment Summary${RESET}"
    echo -e "${BLUE}Generated on: $(date)${RESET}"
    echo
    
    check_deployment_files
    check_installation_status
    check_service_status
    show_next_steps
    
    if [[ "${1:-}" == "--troubleshooting" ]]; then
        show_troubleshooting
    fi
    
    echo -e "${BOLD}${GREEN}Deployment summary complete!${RESET}"
    echo "Run with --troubleshooting for additional help"
}

# Handle script arguments
case "${1:-}" in
    "--help")
        echo "Usage: $0 [--troubleshooting|--help]"
        echo "  --troubleshooting  Show troubleshooting guide"
        echo "  --help            Show this help message"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac