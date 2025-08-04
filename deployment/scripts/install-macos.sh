#!/bin/bash

# SIEM System Installation Script for macOS
# Installs SIEM services as launchd services with proper user accounts and directories

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
LAUNCHD_DIR="/Library/LaunchDaemons"

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

# Function to get next available UID/GID
get_next_uid() {
    local max_uid=$(dscl . -list /Users UniqueID | awk '{print $2}' | sort -n | tail -1)
    echo $((max_uid + 1))
}

get_next_gid() {
    local max_gid=$(dscl . -list /Groups PrimaryGroupID | awk '{print $2}' | sort -n | tail -1)
    echo $((max_gid + 1))
}

# Function to create system user and group for macOS
create_siem_user() {
    log_info "Creating SIEM system user..."
    
    # Check if group exists
    if ! dscl . -read /Groups/$SIEM_GROUP &>/dev/null; then
        local gid=$(get_next_gid)
        log_info "Creating group $SIEM_GROUP with GID $gid"
        dscl . -create /Groups/$SIEM_GROUP
        dscl . -create /Groups/$SIEM_GROUP PrimaryGroupID $gid
        dscl . -create /Groups/$SIEM_GROUP RealName "SIEM System Group"
        log_success "Created group: $SIEM_GROUP"
    else
        log_info "Group $SIEM_GROUP already exists"
    fi
    
    # Check if user exists
    if ! dscl . -read /Users/$SIEM_USER &>/dev/null; then
        local uid=$(get_next_uid)
        local gid=$(dscl . -read /Groups/$SIEM_GROUP PrimaryGroupID | awk '{print $2}')
        
        log_info "Creating user $SIEM_USER with UID $uid"
        dscl . -create /Users/$SIEM_USER
        dscl . -create /Users/$SIEM_USER UniqueID $uid
        dscl . -create /Users/$SIEM_USER PrimaryGroupID $gid
        dscl . -create /Users/$SIEM_USER UserShell /bin/bash
        dscl . -create /Users/$SIEM_USER NFSHomeDirectory $SIEM_HOME
        dscl . -create /Users/$SIEM_USER RealName "SIEM System User"
        
        # Hide user from login window
        dscl . -create /Users/$SIEM_USER IsHidden 1
        
        log_success "Created user: $SIEM_USER"
    else
        log_info "User $SIEM_USER already exists"
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

# Function to create launchd plist files
create_launchd_services() {
    log_info "Creating launchd service files..."
    
    # SIEM API Service
    cat > "$LAUNCHD_DIR/com.siem.api.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.siem.api</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/siem/bin/siem_api</string>
    </array>
    <key>UserName</key>
    <string>siem</string>
    <key>GroupName</key>
    <string>siem</string>
    <key>WorkingDirectory</key>
    <string>/opt/siem</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>RUST_LOG</key>
        <string>info</string>
        <key>RUST_BACKTRACE</key>
        <string>1</string>
    </dict>
    <key>StandardOutPath</key>
    <string>/var/log/siem/api.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/siem/api.error.log</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

    # SIEM Consumer Service
    cat > "$LAUNCHD_DIR/com.siem.consumer.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.siem.consumer</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/siem/bin/siem_consumer</string>
    </array>
    <key>UserName</key>
    <string>siem</string>
    <key>GroupName</key>
    <string>siem</string>
    <key>WorkingDirectory</key>
    <string>/opt/siem</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>RUST_LOG</key>
        <string>info</string>
        <key>RUST_BACKTRACE</key>
        <string>1</string>
    </dict>
    <key>StandardOutPath</key>
    <string>/var/log/siem/consumer.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/siem/consumer.error.log</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

    # SIEM Schema Validator Service
    cat > "$LAUNCHD_DIR/com.siem.schema-validator.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.siem.schema-validator</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/siem/bin/siem_schema_validator</string>
    </array>
    <key>UserName</key>
    <string>siem</string>
    <key>GroupName</key>
    <string>siem</string>
    <key>WorkingDirectory</key>
    <string>/opt/siem</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>RUST_LOG</key>
        <string>info</string>
        <key>RUST_BACKTRACE</key>
        <string>1</string>
    </dict>
    <key>StandardOutPath</key>
    <string>/var/log/siem/schema-validator.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/siem/schema-validator.error.log</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

    # SIEM UI Service
    cat > "$LAUNCHD_DIR/com.siem.ui.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.siem.ui</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/npm</string>
        <string>start</string>
    </array>
    <key>UserName</key>
    <string>siem</string>
    <key>GroupName</key>
    <string>siem</string>
    <key>WorkingDirectory</key>
    <string>/opt/siem/ui</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>NPM_CONFIG_CACHE</key>
        <string>/var/lib/siem/npm-cache</string>
    </dict>
    <key>StandardOutPath</key>
    <string>/var/log/siem/ui.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/siem/ui.error.log</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

    # Set proper permissions on plist files
    chmod 644 "$LAUNCHD_DIR"/com.siem.*.plist
    chown root:wheel "$LAUNCHD_DIR"/com.siem.*.plist
    
    log_success "Created launchd service files"
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
    log_info "  2. Start services: sudo $SCRIPT_DIR/start-services-macos.sh"
    log_info "  3. Check status: $SCRIPT_DIR/status-macos.sh"
    echo
    log_info "Service management (launchd):"
    log_info "  Load service: sudo launchctl load $LAUNCHD_DIR/com.siem.api.plist"
    log_info "  Start service: sudo launchctl start com.siem.api"
    log_info "  Stop service: sudo launchctl stop com.siem.api"
    log_info "  Unload service: sudo launchctl unload $LAUNCHD_DIR/com.siem.api.plist"
    log_info "  View logs: tail -f $SIEM_LOG_DIR/api.log"
    echo
}

# Main installation function
main() {
    log_info "Starting SIEM system installation for macOS..."
    
    check_root
    create_siem_user
    create_directories
    install_binaries
    install_ui
    install_configuration
    create_launchd_services
    show_post_install_info
}

# Run main function
main "$@"