#!/bin/bash

# SIEM System Build Script
# Builds all Rust services in release mode for production deployment

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
BIN_DIR="$DEPLOYMENT_DIR/bin"

# Function to log messages
log_info() {
    echo -e "${BLUE}[BUILD]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[BUILD]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[BUILD]${RESET} $1"
}

log_error() {
    echo -e "${RED}[BUILD]${RESET} $1" >&2
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to build a Rust service
build_rust_service() {
    local service_name="$1"
    local service_dir="$PROJECT_ROOT/$service_name"
    local binary_name="$2"
    
    if [[ ! -d "$service_dir" ]]; then
        log_error "Service directory not found: $service_dir"
        return 1
    fi
    
    log_info "Building $service_name..."
    
    cd "$service_dir"
    
    # Clean previous builds
    cargo clean
    
    # Build in release mode
    if cargo build --release --bin "$binary_name"; then
        # Copy binary to deployment bin directory
        cp "target/release/$binary_name" "$BIN_DIR/"
        
        # Set executable permissions
        chmod +x "$BIN_DIR/$binary_name"
        
        log_success "Built $service_name successfully"
    else
        log_error "Failed to build $service_name"
        return 1
    fi
}

# Function to prepare UI for production
build_ui_service() {
    local ui_dir="$PROJECT_ROOT/siem_ui"
    
    if [[ ! -d "$ui_dir" ]]; then
        log_error "UI directory not found: $ui_dir"
        return 1
    fi
    
    log_info "Preparing SIEM UI for production..."
    
    cd "$ui_dir"
    
    # Install dependencies
    if command_exists npm; then
        npm ci --only=production
        
        # Build for production if build script exists
        if npm run build 2>/dev/null; then
            log_success "Built SIEM UI for production"
        else
            log_warning "No build script found for UI, will run in development mode"
        fi
    else
        log_error "npm not found. Please install Node.js and npm"
        return 1
    fi
}

# Main build function
main() {
    log_info "Starting SIEM system build..."
    
    # Check prerequisites
    if ! command_exists cargo; then
        log_error "Rust/Cargo not found. Please install Rust: https://rustup.rs/"
        exit 1
    fi
    
    if ! command_exists npm; then
        log_error "npm not found. Please install Node.js and npm"
        exit 1
    fi
    
    # Create bin directory
    mkdir -p "$BIN_DIR"
    
    # Build Rust services
    log_info "Building Rust services..."
    
    build_rust_service "siem_api" "siem_api" || exit 1
    build_rust_service "siem_consumer" "siem_consumer" || exit 1
    build_rust_service "siem_schema_validator" "siem_schema_validator" || exit 1
    
    # Prepare UI
    build_ui_service || exit 1
    
    # Display build summary
    log_success "Build completed successfully!"
    log_info "Built binaries:"
    
    for binary in "$BIN_DIR"/*; do
        if [[ -f "$binary" ]]; then
            local size=$(du -h "$binary" | cut -f1)
            log_info "  $(basename "$binary") ($size)"
        fi
    done
    
    log_info "Next steps:"
    log_info "  1. Review configuration: $DEPLOYMENT_DIR/config/siem.env"
    log_info "  2. Install services: sudo $SCRIPT_DIR/install.sh"
    log_info "  3. Start services: sudo $SCRIPT_DIR/start-services.sh"
}

# Run main function
main "$@"