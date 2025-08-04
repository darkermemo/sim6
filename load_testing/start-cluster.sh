#!/bin/bash

echo "🚀 Starting Local SIEM Cluster Simulation..."
echo "============================================="

# Create directories for logs and PIDs if they don't exist
mkdir -p logs
mkdir -p pids

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required services are installed
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if brew is installed
    if ! command -v brew >/dev/null 2>&1; then
        log_error "Homebrew is required but not installed. Please install it first."
        exit 1
    fi
    
    # Check if ClickHouse is installed
    if ! brew list clickhouse >/dev/null 2>&1; then
        log_warn "ClickHouse not found. Installing..."
        brew install clickhouse
    fi
    
    # Check if Kafka is installed  
    if ! brew list kafka >/dev/null 2>&1; then
        log_warn "Kafka not found. Installing..."
        brew install kafka
    fi
    
    # Check if Rust/Cargo is available
    if ! command -v cargo >/dev/null 2>&1; then
        log_error "Rust/Cargo is required but not installed. Please install Rust first."
        exit 1
    fi
    
    log_success "Prerequisites check completed"
}

# Start core infrastructure services
start_core_services() {
    log_info "Starting core infrastructure services..."
    
    # Start ClickHouse
    echo "[1/3] Starting ClickHouse..."
    if brew services start clickhouse 2>/dev/null; then
        log_success "ClickHouse started"
    else
        log_warn "ClickHouse already running or failed to start"
    fi
    
    # Wait for ClickHouse to be ready
    log_info "Waiting for ClickHouse to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:8123/?query=SELECT%201 >/dev/null 2>&1; then
            log_success "ClickHouse is ready"
            break
        fi
        sleep 2
        echo -n "."
    done
    echo
    
    # Start Zookeeper (required for Kafka)
    echo "[2/3] Starting Zookeeper..."
    if brew services start zookeeper 2>/dev/null; then
        log_success "Zookeeper started"
    else
        log_warn "Zookeeper already running or failed to start"
    fi
    
    # Start Kafka
    echo "[3/3] Starting Kafka..."
    if brew services start kafka 2>/dev/null; then
        log_success "Kafka started"
    else
        log_warn "Kafka already running or failed to start"
    fi
    
    # Wait for Kafka to be ready and create topic
    log_info "Waiting for Kafka to be ready..."
    sleep 10
    
    # Create the ingest-events topic if it doesn't exist
    kafka-topics --create --topic ingest-events --bootstrap-server localhost:9092 --partitions 8 --replication-factor 1 2>/dev/null || log_info "Topic 'ingest-events' already exists"
    
    log_success "Core services started successfully"
}

# Build SIEM applications
build_siem_apps() {
    log_info "Building SIEM applications..."
    
    for app in siem_api siem_consumer siem_ingestor siem_rule_engine; do
        if [ -d "../$app" ]; then
            log_info "Building $app..."
            (cd "../$app" && cargo build --release) || log_warn "Failed to build $app"
        else
            log_warn "Directory ../$app not found, skipping"
        fi
    done
    
    log_success "SIEM applications built"
}

# Start SIEM applications
start_siem_apps() {
    log_info "Starting SIEM applications..."
    
    # Start SIEM API
    if [ -d "../siem_api" ]; then
        echo "[1/4] Starting SIEM API..."
        (cd ../siem_api && RUST_LOG=info cargo run --release &> ../load_testing/logs/siem_api.log & echo $! > ../load_testing/pids/siem_api.pid)
        log_success "SIEM API started (PID: $(cat pids/siem_api.pid))"
    else
        log_warn "SIEM API directory not found, skipping"
    fi
    
    # Start SIEM Consumer
    if [ -d "../siem_consumer" ]; then
        echo "[2/4] Starting SIEM Consumer..."
        (cd ../siem_consumer && RUST_LOG=info cargo run --release &> ../load_testing/logs/siem_consumer.log & echo $! > ../load_testing/pids/siem_consumer.pid)
        log_success "SIEM Consumer started (PID: $(cat pids/siem_consumer.pid))"
    else
        log_warn "SIEM Consumer directory not found, skipping"
    fi
    
    # Start SIEM Ingestor
    if [ -d "../siem_ingestor" ]; then
        echo "[3/4] Starting SIEM Ingestor..."
        (cd ../siem_ingestor && RUST_LOG=info cargo run --release &> ../load_testing/logs/siem_ingestor.log & echo $! > ../load_testing/pids/siem_ingestor.pid)
        log_success "SIEM Ingestor started (PID: $(cat pids/siem_ingestor.pid))"
    else
        log_warn "SIEM Ingestor directory not found, skipping"
    fi
    
    # Start SIEM Rule Engine
    if [ -d "../siem_rule_engine" ]; then
        echo "[4/4] Starting SIEM Rule Engine..."
        (cd ../siem_rule_engine && RUST_LOG=info cargo run --release &> ../load_testing/logs/siem_rule_engine.log & echo $! > ../load_testing/pids/siem_rule_engine.pid)
        log_success "SIEM Rule Engine started (PID: $(cat pids/siem_rule_engine.pid))"
    else
        log_warn "SIEM Rule Engine directory not found, skipping"
    fi
}

# Wait for services to be ready
wait_for_services() {
    log_info "Waiting for services to be ready..."
    
    # Wait for API
    log_info "Checking SIEM API availability..."
    for i in {1..30}; do
        if curl -s http://localhost:8080/v1/health >/dev/null 2>&1; then
            log_success "SIEM API is ready"
            break
        fi
        sleep 2
        echo -n "."
    done
    echo
    
    # Wait for Ingestor
    log_info "Checking SIEM Ingestor availability..."
    for i in {1..30}; do
        if curl -s http://localhost:8081/health >/dev/null 2>&1; then
            log_success "SIEM Ingestor is ready"
            break
        fi
        sleep 2
        echo -n "."
    done
    echo
    
    log_success "All services are ready for load testing!"
}

# Setup database schema
setup_database() {
    log_info "Setting up database schema..."
    
    if [ -f "../database_setup.sql" ]; then
        log_info "Initializing ClickHouse database schema..."
        clickhouse client --multiquery < ../database_setup.sql 2>/dev/null || log_warn "Database setup failed or already exists"
        log_success "Database schema setup completed"
    else
        log_warn "Database setup file not found, skipping schema initialization"
    fi
}

# Main execution
main() {
    echo "🎯 SIEM Local Cluster Simulation"
    echo "================================="
    echo "This will start all SIEM services locally for load testing"
    echo
    
    check_prerequisites
    start_core_services
    setup_database
    build_siem_apps
    start_siem_apps
    wait_for_services
    
    echo
    echo "🎉 SIEM Cluster Simulation Started Successfully!"
    echo "==============================================="
    echo
    echo "📋 Next Steps:"
    echo "  1. Check cluster status: ./status-cluster.sh"
    echo "  2. Run load tests: ./execute_comprehensive_load_test.sh all"
    echo "  3. Stop cluster: ./stop-cluster.sh"
    echo
    echo "📁 Service Logs: load_testing/logs/"
    echo "🔧 Process IDs: load_testing/pids/"
}

main "$@"