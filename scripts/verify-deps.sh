#!/bin/bash

# SIEM Dependencies Verification Script
# Checks that all required system dependencies are available

set -euo pipefail

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
RESET='\033[0m'

# Function to log messages
log_info() {
    echo -e "${BLUE}[DEPS]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[DEPS]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[DEPS]${RESET} $1"
}

log_error() {
    echo -e "${RED}[DEPS]${RESET} $1" >&2
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check version and compare
check_version() {
    local cmd="$1"
    local min_version="$2"
    local version_flag="$3"
    
    if ! command_exists "$cmd"; then
        return 1
    fi
    
    local current_version
    current_version=$("$cmd" "$version_flag" 2>/dev/null | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1)
    
    if [[ -z "$current_version" ]]; then
        log_warning "Could not determine version for $cmd"
        return 0
    fi
    
    # Simple version comparison (assumes semantic versioning)
    if [[ "$(printf '%s\n' "$min_version" "$current_version" | sort -V | head -n1)" == "$min_version" ]]; then
        log_success "$cmd version $current_version (>= $min_version)"
        return 0
    else
        log_error "$cmd version $current_version is below minimum required $min_version"
        return 1
    fi
}

# Function to check Rust and Cargo
check_rust() {
    log_info "Checking Rust toolchain..."
    
    if ! command_exists "rustc"; then
        log_error "Rust compiler (rustc) not found"
        log_error "Please install Rust: https://rustup.rs/"
        return 1
    fi
    
    if ! command_exists "cargo"; then
        log_error "Cargo not found"
        log_error "Please install Rust: https://rustup.rs/"
        return 1
    fi
    
    # Check Rust version (minimum 1.70.0)
    check_version "rustc" "1.70.0" "--version"
    
    # Check for required Rust components
    local components=("clippy" "rustfmt")
    for component in "${components[@]}"; do
        if ! rustup component list --installed | grep -q "$component"; then
            log_warning "Rust component '$component' not installed, installing..."
            rustup component add "$component"
        else
            log_success "Rust component '$component' is installed"
        fi
    done
    
    log_success "Rust toolchain verified"
}

# Function to check Node.js and npm
check_nodejs() {
    log_info "Checking Node.js and npm..."
    
    if ! command_exists "node"; then
        log_error "Node.js not found"
        log_error "Please install Node.js: https://nodejs.org/"
        return 1
    fi
    
    if ! command_exists "npm"; then
        log_error "npm not found"
        log_error "Please install npm (usually comes with Node.js)"
        return 1
    fi
    
    # Check Node.js version (minimum 18.0.0)
    check_version "node" "18.0.0" "--version"
    
    # Check npm version (minimum 8.0.0)
    check_version "npm" "8.0.0" "--version"
    
    log_success "Node.js and npm verified"
}

# Function to check database dependencies
check_databases() {
    log_info "Checking database dependencies..."
    
    # Check ClickHouse
    if command_exists "clickhouse-client"; then
        log_success "ClickHouse client found"
    else
        log_warning "ClickHouse client not found (optional for development)"
        log_info "You can install it or use Docker: docker run -d --name clickhouse-server -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server"
    fi
    
    # Check PostgreSQL client
    if command_exists "psql"; then
        log_success "PostgreSQL client found"
    else
        log_warning "PostgreSQL client not found (optional for development)"
        log_info "You can install it or use Docker: docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=password postgres"
    fi
    
    # Check Redis client
    if command_exists "redis-cli"; then
        log_success "Redis client found"
    else
        log_warning "Redis client not found (optional for development)"
        log_info "You can install it or use Docker: docker run -d --name redis -p 6379:6379 redis"
    fi
}

# Function to check message queue dependencies
check_message_queues() {
    log_info "Checking message queue dependencies..."
    
    # Check Kafka (optional, can use Docker)
    if command_exists "kafka-console-producer.sh" || command_exists "kafka-console-producer"; then
        log_success "Kafka tools found"
    else
        log_warning "Kafka tools not found (can use Docker)"
        log_info "You can use Docker: docker run -d --name kafka -p 9092:9092 confluentinc/cp-kafka"
    fi
}

# Function to check development tools
check_dev_tools() {
    log_info "Checking development tools..."
    
    # Check Git
    if ! command_exists "git"; then
        log_error "Git not found"
        log_error "Please install Git: https://git-scm.com/"
        return 1
    fi
    log_success "Git found"
    
    # Check Make
    if ! command_exists "make"; then
        log_error "Make not found"
        log_error "Please install Make (usually available via build-essential or Xcode Command Line Tools)"
        return 1
    fi
    log_success "Make found"
    
    # Check curl
    if ! command_exists "curl"; then
        log_error "curl not found"
        log_error "Please install curl"
        return 1
    fi
    log_success "curl found"
    
    # Check jq (for JSON processing)
    if ! command_exists "jq"; then
        log_warning "jq not found (recommended for JSON processing)"
        log_info "Install with: brew install jq (macOS) or apt-get install jq (Ubuntu)"
    else
        log_success "jq found"
    fi
}

# Function to check Docker (optional)
check_docker() {
    log_info "Checking Docker (optional)..."
    
    if command_exists "docker"; then
        if docker info >/dev/null 2>&1; then
            log_success "Docker is running"
        else
            log_warning "Docker is installed but not running"
            log_info "Start Docker Desktop or run: sudo systemctl start docker"
        fi
    else
        log_warning "Docker not found (optional for development)"
        log_info "Install Docker for easier dependency management: https://docker.com/"
    fi
    
    if command_exists "docker-compose"; then
        log_success "Docker Compose found"
    else
        log_warning "Docker Compose not found (optional)"
    fi
}

# Function to check system resources
check_system_resources() {
    log_info "Checking system resources..."
    
    # Check available memory (minimum 4GB recommended)
    if command_exists "free"; then
        local mem_gb
        mem_gb=$(free -g | awk '/^Mem:/{print $2}')
        if [[ "$mem_gb" -lt 4 ]]; then
            log_warning "Available memory: ${mem_gb}GB (4GB+ recommended)"
        else
            log_success "Available memory: ${mem_gb}GB"
        fi
    elif [[ "$(uname)" == "Darwin" ]]; then
        # macOS
        local mem_bytes
        mem_bytes=$(sysctl -n hw.memsize)
        local mem_gb=$((mem_bytes / 1024 / 1024 / 1024))
        if [[ "$mem_gb" -lt 4 ]]; then
            log_warning "Available memory: ${mem_gb}GB (4GB+ recommended)"
        else
            log_success "Available memory: ${mem_gb}GB"
        fi
    fi
    
    # Check available disk space (minimum 10GB recommended)
    local disk_space
    disk_space=$(df -h . | awk 'NR==2{print $4}' | sed 's/G.*//')
    if [[ "$disk_space" =~ ^[0-9]+$ ]] && [[ "$disk_space" -lt 10 ]]; then
        log_warning "Available disk space: ${disk_space}GB (10GB+ recommended)"
    else
        log_success "Sufficient disk space available"
    fi
}

# Main execution
main() {
    log_info "Starting dependency verification..."
    
    local failed=0
    
    check_rust || failed=1
    check_nodejs || failed=1
    check_dev_tools || failed=1
    
    # These are warnings only, don't fail the build
    check_databases
    check_message_queues
    check_docker
    check_system_resources
    
    if [[ $failed -eq 1 ]]; then
        log_error "Dependency verification failed"
        log_error "Please install missing dependencies and try again"
        return 1
    fi
    
    log_success "Dependency verification completed successfully"
}

# Run main function
main "$@"