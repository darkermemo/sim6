#!/bin/bash

# SIEM Services Startup Script
# Starts all SIEM components in the correct order with health checks

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

# Load environment variables
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

# Default values
LOGS_DIR="${LOGS_DIR:-$PROJECT_ROOT/logs}"
API_PORT="${API_PORT:-8080}"
INGESTOR_PORT="${INGESTOR_PORT:-8081}"
PIPELINE_PORT="${PIPELINE_PORT:-8082}"
UI_PORT="${UI_PORT:-3004}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
KAFKA_BROKERS="${KAFKA_BROKERS:-localhost:9092}"

# Function to log messages
log_info() {
    echo -e "${BLUE}[SERVICES]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[SERVICES]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[SERVICES]${RESET} $1"
}

log_error() {
    echo -e "${RED}[SERVICES]${RESET} $1" >&2
}

# Function to check if a port is in use
port_in_use() {
    local port="$1"
    if command -v lsof >/dev/null 2>&1; then
        lsof -i ":$port" >/dev/null 2>&1
    elif command -v netstat >/dev/null 2>&1; then
        netstat -ln | grep ":$port " >/dev/null 2>&1
    else
        # Fallback: try to connect
        timeout 1 bash -c "</dev/tcp/localhost/$port" >/dev/null 2>&1
    fi
}

# Function to wait for a service to be ready
wait_for_service() {
    local service_name="$1"
    local url="$2"
    local max_attempts="${3:-30}"
    local attempt=1
    
    log_info "Waiting for $service_name to be ready..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -s "$url" >/dev/null 2>&1; then
            log_success "$service_name is ready"
            return 0
        fi
        
        if [[ $((attempt % 5)) -eq 0 ]]; then
            log_info "Still waiting for $service_name (attempt $attempt/$max_attempts)..."
        fi
        
        sleep 2
        ((attempt++))
    done
    
    log_error "$service_name failed to start within $((max_attempts * 2)) seconds"
    return 1
}

# Function to kill existing processes
kill_existing_processes() {
    log_info "Stopping existing SIEM processes..."
    
    # Kill processes by port
    local ports=("$API_PORT" "$INGESTOR_PORT" "$PIPELINE_PORT" "$UI_PORT")
    
    for port in "${ports[@]}"; do
        if port_in_use "$port"; then
            log_info "Killing process on port $port"
            if command -v lsof >/dev/null 2>&1; then
                local pid
                pid=$(lsof -ti ":$port" 2>/dev/null || true)
                if [[ -n "$pid" ]]; then
                    kill "$pid" 2>/dev/null || true
                    sleep 1
                    # Force kill if still running
                    if kill -0 "$pid" 2>/dev/null; then
                        kill -9 "$pid" 2>/dev/null || true
                    fi
                fi
            fi
        fi
    done
    
    # Kill by process name
    local process_names=("siem_api" "siem_clickhouse_ingestion" "siem-pipeline" "npm")
    
    for process in "${process_names[@]}"; do
        if pgrep -f "$process" >/dev/null 2>&1; then
            log_info "Killing $process processes"
            pkill -f "$process" 2>/dev/null || true
        fi
    done
    
    sleep 2
    log_success "Existing processes stopped"
}

# Function to create logs directory
setup_logging() {
    log_info "Setting up logging..."
    
    mkdir -p "$LOGS_DIR"
    
    # Clean old logs (keep last 5 days)
    find "$LOGS_DIR" -name "*.log" -mtime +5 -delete 2>/dev/null || true
    
    log_success "Logging setup complete"
}

# Function to check external dependencies
check_external_deps() {
    log_info "Checking external dependencies..."
    
    # Check ClickHouse
    if ! curl -s "$CLICKHOUSE_URL" >/dev/null 2>&1; then
        log_error "ClickHouse is not accessible at $CLICKHOUSE_URL"
        log_error "Please start ClickHouse or check the CLICKHOUSE_URL configuration"
        return 1
    fi
    log_success "ClickHouse is accessible"
    
    # Check Kafka (optional check)
    if command -v kafka-topics.sh >/dev/null 2>&1; then
        if kafka-topics.sh --bootstrap-server "$KAFKA_BROKERS" --list >/dev/null 2>&1; then
            log_success "Kafka is accessible"
        else
            log_warning "Kafka check failed (may not be critical)"
        fi
    else
        log_info "Kafka tools not found, skipping Kafka check"
    fi
    
    return 0
}

# Function to start ClickHouse Ingestion service
start_ingestor() {
    log_info "Starting ClickHouse Ingestion service..."
    
    cd "$PROJECT_ROOT/siem_clickhouse_ingestion"
    
    # Start in background
    SIEM__SERVER__BIND_ADDRESS="0.0.0.0:$INGESTOR_PORT" \
        cargo run > "$LOGS_DIR/ingestor.log" 2>&1 &
    
    local pid=$!
    echo "$pid" > "$LOGS_DIR/ingestor.pid"
    
    # Wait for service to be ready
    wait_for_service "ClickHouse Ingestor" "http://localhost:$INGESTOR_PORT/health" 30
    
    log_success "ClickHouse Ingestion service started (PID: $pid)"
}

# Function to start Unified Pipeline service
start_pipeline() {
    log_info "Starting Unified Pipeline service..."
    
    cd "$PROJECT_ROOT/siem_unified_pipeline"
    
    # Start in background
    cargo run --bin siem-pipeline server --port "$PIPELINE_PORT" > "$LOGS_DIR/pipeline.log" 2>&1 &
    
    local pid=$!
    echo "$pid" > "$LOGS_DIR/pipeline.pid"
    
    # Wait for service to be ready
    wait_for_service "Unified Pipeline" "http://localhost:$PIPELINE_PORT/health" 30
    
    log_success "Unified Pipeline service started (PID: $pid)"
}

# Function to start API service
start_api() {
    log_info "Starting SIEM API service..."
    
    cd "$PROJECT_ROOT/siem_api"
    
    # Start in background
    cargo run --bin siem_api > "$LOGS_DIR/api.log" 2>&1 &
    
    local pid=$!
    echo "$pid" > "$LOGS_DIR/api.pid"
    
    # Wait for service to be ready
    wait_for_service "SIEM API" "http://localhost:$API_PORT/health" 30
    
    log_success "SIEM API service started (PID: $pid)"
}

# Function to start UI service
start_ui() {
    log_info "Starting SIEM UI service..."
    
    cd "$PROJECT_ROOT/siem_ui"
    
    # Install dependencies if needed
    if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules" ]]; then
        log_info "Installing UI dependencies..."
        npm install > "$LOGS_DIR/ui-install.log" 2>&1
    fi
    
    # Start in background
    npm run dev > "$LOGS_DIR/ui.log" 2>&1 &
    
    local pid=$!
    echo "$pid" > "$LOGS_DIR/ui.pid"
    
    # Wait for service to be ready
    wait_for_service "SIEM UI" "http://localhost:$UI_PORT" 60
    
    log_success "SIEM UI service started (PID: $pid)"
}

# Function to generate JWT token
generate_jwt_token() {
    log_info "Generating JWT token..."
    
    # Try to get token from API
    local token
    if token=$(curl -s -X POST "http://localhost:$API_PORT/api/v1/auth/token" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin"}' | jq -r '.token' 2>/dev/null); then
        
        if [[ "$token" != "null" ]] && [[ -n "$token" ]]; then
            echo "$token" > "$LOGS_DIR/jwt_token.txt"
            log_success "JWT token generated and saved to $LOGS_DIR/jwt_token.txt"
        else
            log_warning "Failed to generate JWT token (API may not support auth yet)"
        fi
    else
        log_warning "Could not generate JWT token (API may not be ready)"
    fi
}

# Function to display service status
show_service_status() {
    log_info "Service Status:"
    
    local services=(
        "ClickHouse Ingestor:http://localhost:$INGESTOR_PORT/health"
        "Unified Pipeline:http://localhost:$PIPELINE_PORT/health"
        "SIEM API:http://localhost:$API_PORT/health"
        "SIEM UI:http://localhost:$UI_PORT"
    )
    
    for service_info in "${services[@]}"; do
        local name="${service_info%%:*}"
        local url="${service_info##*:}"
        
        if curl -s "$url" >/dev/null 2>&1; then
            log_success "✓ $name is running"
        else
            log_error "✗ $name is not responding"
        fi
    done
}

# Function to save service URLs
save_service_urls() {
    local urls_file="$LOGS_DIR/service_urls.txt"
    
    cat > "$urls_file" << EOF
SIEM System Service URLs
========================

SIEM UI: http://localhost:$UI_PORT
SIEM API: http://localhost:$API_PORT
ClickHouse Ingestor: http://localhost:$INGESTOR_PORT
Unified Pipeline: http://localhost:$PIPELINE_PORT

API Documentation: http://localhost:$API_PORT/docs
Health Checks: http://localhost:$API_PORT/health

Logs Directory: $LOGS_DIR
Configuration: $PROJECT_ROOT/.env
EOF
    
    log_success "Service URLs saved to $urls_file"
}

# Main execution
main() {
    log_info "Starting SIEM services..."
    
    # Setup
    setup_logging
    kill_existing_processes
    check_external_deps
    
    # Start services in order
    start_ingestor
    start_pipeline
    start_api
    start_ui
    
    # Post-startup tasks
    generate_jwt_token
    save_service_urls
    show_service_status
    
    log_success "All SIEM services started successfully"
    log_info "Access the SIEM UI at: http://localhost:$UI_PORT"
    log_info "View logs with: tail -f $LOGS_DIR/*.log"
    log_info "Stop services with: make stop"
}

# Run main function
main "$@"