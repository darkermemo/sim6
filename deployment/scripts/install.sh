#!/bin/bash

# SIEM System Installation Script
# Installs SIEM services as systemd services with proper user accounts and directories

set -euo pipefail

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
RESET='\033[0m'

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$DEPLOYMENT_DIR/.." && pwd)"

# Configuration
SIEM_USER="siem"
SIEM_GROUP="siem"
SIEM_HOME="/opt/siem"
SIEM_CONFIG_DIR="/etc/siem"
SIEM_LOG_DIR="/var/log/siem"
SIEM_DATA_DIR="/var/lib/siem"
SIEM_UI_DIR="/opt/siem/ui"

# Function to log messages
log_info() {
    echo -e "${BLUE}[INSTALL]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[INSTALL]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[INSTALL]${RESET} $1"
}

log_error() {
    echo -e "${RED}[INSTALL]${RESET} $1" >&2
}

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Function to create system user
create_siem_user() {
    log_info "Creating SIEM system user..."
    
    if ! id "$SIEM_USER" &>/dev/null; then
        useradd --system --home "$SIEM_HOME" --shell /bin/bash \
                --comment "SIEM System User" "$SIEM_USER"
        log_success "Created user: $SIEM_USER"
    else
        log_info "User $SIEM_USER already exists"
    fi
    
    if ! getent group "$SIEM_GROUP" &>/dev/null; then
        groupadd --system "$SIEM_GROUP"
        usermod -a -G "$SIEM_GROUP" "$SIEM_USER"
        log_success "Created group: $SIEM_GROUP"
    else
        log_info "Group $SIEM_GROUP already exists"
    fi
}

# Function to create directories
create_directories() {
    log_info "Creating SIEM directories..."
    
    local dirs=(
        "$SIEM_HOME"
        "$SIEM_HOME/bin"
        "$SIEM_CONFIG_DIR"
        "$SIEM_LOG_DIR"
        "$SIEM_DATA_DIR"
        "$SIEM_DATA_DIR/npm-cache"
        "$SIEM_UI_DIR"
    )
    
    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log_info "Created directory: $dir"
        fi
    done
    
    # Set ownership and permissions
    chown -R "$SIEM_USER:$SIEM_GROUP" "$SIEM_HOME" "$SIEM_LOG_DIR" "$SIEM_DATA_DIR"
    chmod 755 "$SIEM_HOME" "$SIEM_HOME/bin"
    chmod 750 "$SIEM_LOG_DIR" "$SIEM_DATA_DIR"
    chmod 755 "$SIEM_CONFIG_DIR"
    
    log_success "Created and configured directories"
}

# Function to install binaries
install_binaries() {
    log_info "Installing SIEM binaries..."
    
    local bin_dir="$DEPLOYMENT_DIR/bin"
    
    if [[ ! -d "$bin_dir" ]]; then
        log_error "Binary directory not found: $bin_dir"
        log_error "Please run the build script first: $SCRIPT_DIR/build.sh"
        exit 1
    fi
    
    # Copy binaries
    for binary in "$bin_dir"/*; do
        if [[ -f "$binary" ]]; then
            local binary_name=$(basename "$binary")
            cp "$binary" "$SIEM_HOME/bin/"
            chown "$SIEM_USER:$SIEM_GROUP" "$SIEM_HOME/bin/$binary_name"
            chmod 755 "$SIEM_HOME/bin/$binary_name"
            log_info "Installed binary: $binary_name"
        fi
    done
    
    log_success "Installed SIEM binaries"
}

# Function to install UI
install_ui() {
    log_info "Installing SIEM UI..."
    
    local ui_source="$PROJECT_ROOT/siem_ui"
    
    if [[ ! -d "$ui_source" ]]; then
        log_error "UI source directory not found: $ui_source"
        exit 1
    fi
    
    # Copy UI files (excluding node_modules and build artifacts)
    rsync -av --exclude='node_modules' --exclude='dist' --exclude='build' \
          --exclude='.next' --exclude='.nuxt' \
          "$ui_source/" "$SIEM_UI_DIR/"
    
    # Set ownership
    chown -R "$SIEM_USER:$SIEM_GROUP" "$SIEM_UI_DIR"
    
    log_success "Installed SIEM UI"
}

# Function to install configuration
install_configuration() {
    log_info "Installing configuration files..."
    
    # Copy environment configuration
    cp "$DEPLOYMENT_DIR/config/siem.env" "$SIEM_CONFIG_DIR/"
    chown "$SIEM_USER:$SIEM_GROUP" "$SIEM_CONFIG_DIR/siem.env"
    chmod 640 "$SIEM_CONFIG_DIR/siem.env"
    
    log_success "Installed configuration files"
    log_warning "Please review and update $SIEM_CONFIG_DIR/siem.env with your settings"
}

# Function to install systemd services
install_systemd_services() {
    log_info "Installing systemd service files..."
    
    local systemd_dir="$DEPLOYMENT_DIR/systemd"
    local services=("siem-api" "siem-consumer" "siem-schema-validator" "siem-ui")
    
    for service in "${services[@]}"; do
        local service_file="$systemd_dir/$service.service"
        
        if [[ -f "$service_file" ]]; then
            cp "$service_file" "/etc/systemd/system/"
            log_info "Installed service: $service.service"
        else
            log_error "Service file not found: $service_file"
            exit 1
        fi
    done
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable services (but don't start them yet)
    for service in "${services[@]}"; do
        systemctl enable "$service.service"
        log_info "Enabled service: $service.service"
    done
    
    log_success "Installed and enabled systemd services"
}

# Function to create log rotation configuration
setup_log_rotation() {
    log_info "Setting up log rotation..."
    
    cat > /etc/logrotate.d/siem << 'EOF'
/var/log/siem/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 siem siem
    postrotate
        systemctl reload siem-api siem-consumer siem-schema-validator siem-ui 2>/dev/null || true
    endscript
}
EOF
    
    log_success "Configured log rotation"
}

# Function to display post-installation instructions
show_post_install_info() {
    log_success "SIEM system installation completed!"
    echo
    log_info "Configuration:"
    log_info "  Config file: $SIEM_CONFIG_DIR/siem.env"
    log_info "  Binaries: $SIEM_HOME/bin/"
    log_info "  UI files: $SIEM_UI_DIR/"
    log_info "  Logs: $SIEM_LOG_DIR/"
    log_info "  Data: $SIEM_DATA_DIR/"
    echo
    log_info "Next steps:"
    log_info "  1. Review configuration: sudo nano $SIEM_CONFIG_DIR/siem.env"
    log_info "  2. Start services: sudo $SCRIPT_DIR/start-services.sh"
    log_info "  3. Check status: $SCRIPT_DIR/status.sh"
    echo
    log_info "Service management:"
    log_info "  Start all: sudo systemctl start siem-api siem-consumer siem-schema-validator siem-ui"
    log_info "  Stop all: sudo systemctl stop siem-api siem-consumer siem-schema-validator siem-ui"
    log_info "  View logs: journalctl -u siem-api -f"
    echo
}

# Main installation function
main() {
    log_info "Starting SIEM system installation..."
    
    check_root
    create_siem_user
    create_directories
    install_binaries
    install_ui
    install_configuration
    install_systemd_services
    setup_log_rotation
    show_post_install_info
}

# Run main function
main "$@"