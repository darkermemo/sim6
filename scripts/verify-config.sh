#!/bin/bash

# SIEM Configuration Verification Script
# Validates that all required configuration is present and valid

set -euo pipefail

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
RESET='\033[0m'

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/config"

# Function to log messages
log_info() {
    echo -e "${BLUE}[CONFIG]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[CONFIG]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[CONFIG]${RESET} $1"
}

log_error() {
    echo -e "${RED}[CONFIG]${RESET} $1" >&2
}

# Function to check if .env file exists and load it
check_env_file() {
    local env_file="$PROJECT_ROOT/.env"
    
    if [[ ! -f "$env_file" ]]; then
        log_warning ".env file not found, checking for development config..."
        
        if [[ -f "$CONFIG_DIR/dev.env" ]]; then
            log_info "Copying development config to .env"
            cp "$CONFIG_DIR/dev.env" "$env_file"
            log_success "Development configuration copied to .env"
        else
            log_error ".env file not found and no development config available"
            log_error "Please create .env file or copy from config/dev.env"
            return 1
        fi
    fi
    
    # Load environment variables
    set -a
    source "$env_file"
    set +a
    
    log_success ".env file loaded successfully"
}

# Function to validate required variables
validate_required_vars() {
    local required_vars_file="$CONFIG_DIR/required-vars.txt"
    local missing_vars=()
    
    if [[ ! -f "$required_vars_file" ]]; then
        log_error "Required variables file not found: $required_vars_file"
        return 1
    fi
    
    log_info "Checking required environment variables..."
    
    # Read required variables (skip comments and empty lines)
    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ "$line" =~ ^#.*$ ]] || [[ -z "$line" ]] && continue
        
        local var_name="$line"
        
        if [[ -z "${!var_name:-}" ]]; then
            missing_vars+=("$var_name")
        fi
    done < "$required_vars_file"
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            log_error "  - $var"
        done
        return 1
    fi
    
    log_success "All required environment variables are set"
}

# Function to validate configuration values
validate_config_values() {
    log_info "Validating configuration values..."
    
    # Check PROJECT_ROOT exists
    if [[ ! -d "$PROJECT_ROOT" ]]; then
        log_error "PROJECT_ROOT directory does not exist: $PROJECT_ROOT"
        return 1
    fi
    
    # Check ports are numeric and in valid range
    local ports=("API_PORT" "INGESTOR_PORT" "UI_PORT")
    for port_var in "${ports[@]}"; do
        local port_value="${!port_var:-}"
        if [[ ! "$port_value" =~ ^[0-9]+$ ]] || [[ "$port_value" -lt 1024 ]] || [[ "$port_value" -gt 65535 ]]; then
            log_error "Invalid port value for $port_var: $port_value (must be 1024-65535)"
            return 1
        fi
    done
    
    # Check JWT_SECRET is long enough
    if [[ ${#JWT_SECRET} -lt 32 ]]; then
        log_warning "JWT_SECRET is shorter than recommended (32+ characters)"
    fi
    
    # Check ENVIRONMENT is valid
    if [[ "$ENVIRONMENT" != "development" ]] && [[ "$ENVIRONMENT" != "production" ]] && [[ "$ENVIRONMENT" != "staging" ]]; then
        log_error "Invalid ENVIRONMENT value: $ENVIRONMENT (must be development, staging, or production)"
        return 1
    fi
    
    # Warn about development secrets in production
    if [[ "$ENVIRONMENT" == "production" ]]; then
        if [[ "$JWT_SECRET" == *"dev"* ]] || [[ "$ADMIN_TOKEN" == *"dev"* ]]; then
            log_error "Development secrets detected in production environment!"
            log_error "Please update JWT_SECRET and ADMIN_TOKEN for production"
            return 1
        fi
    fi
    
    log_success "Configuration values are valid"
}

# Function to create required directories
create_directories() {
    log_info "Creating required directories..."
    
    local dirs=("$LOGS_DIR" "$PROJECT_ROOT/tmp" "$PROJECT_ROOT/data")
    
    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log_info "Created directory: $dir"
        fi
    done
    
    log_success "Required directories verified"
}

# Function to validate file permissions
validate_permissions() {
    log_info "Checking file permissions..."
    
    # Check that scripts are executable
    local scripts=("$PROJECT_ROOT/bin/dev-up")
    
    for script in "${scripts[@]}"; do
        if [[ -f "$script" ]] && [[ ! -x "$script" ]]; then
            log_warning "Making script executable: $script"
            chmod +x "$script"
        fi
    done
    
    log_success "File permissions verified"
}

# Main execution
main() {
    log_info "Starting configuration verification..."
    
    check_env_file
    validate_required_vars
    validate_config_values
    create_directories
    validate_permissions
    
    log_success "Configuration verification completed successfully"
}

# Run main function
main "$@"