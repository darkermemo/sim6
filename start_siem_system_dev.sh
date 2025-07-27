#!/bin/bash

# SIEM System Development Startup Script
# Starts all SIEM components in development mode with dependency checks

LOG_FILE="/Users/yasseralmohammed/sim6/startup_dev.log"

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to wait for service to be ready
wait_for_service() {
    local service_name="$1"
    local check_command="$2"
    local max_attempts=30
    local attempt=1
    
    log_message "Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if eval "$check_command" > /dev/null 2>&1; then
            log_message "$service_name is ready!"
            return 0
        fi
        
        log_message "Attempt $attempt/$max_attempts: $service_name not ready yet..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_message "ERROR: $service_name failed to start after $max_attempts attempts"
    return 1
}

# Function to kill existing processes
kill_existing_processes() {
    log_message "Stopping any existing SIEM processes..."
    
    # Kill existing Rust processes
    pkill -f "siem_api" 2>/dev/null || true
    pkill -f "siem_consumer" 2>/dev/null || true
    pkill -f "siem_ingestor" 2>/dev/null || true
    pkill -f "siem_rule_engine" 2>/dev/null || true
    pkill -f "siem_stream_processor" 2>/dev/null || true
    pkill -f "siem_parser" 2>/dev/null || true
    
    # Kill existing UI processes
    pkill -f "npm.*dev" 2>/dev/null || true
    
    sleep 3
    log_message "Existing processes stopped"
}

# Create logs directory
mkdir -p /Users/yasseralmohammed/sim6/logs

log_message "Starting SIEM system in DEVELOPMENT mode..."

# Stop existing processes first
kill_existing_processes

# 1. Check if Kafka is running
log_message "Checking Kafka status..."
if ! pgrep -f "kafka.Kafka" > /dev/null; then
    log_message "WARNING: Kafka is not running. Some features may not work."
    log_message "To start Kafka: brew services start kafka"
else
    log_message "Kafka is running"
fi

# 2. Check if ClickHouse is running
log_message "Checking ClickHouse status..."
if ! pgrep -f "clickhouse server" > /dev/null; then
    log_message "WARNING: ClickHouse is not running. Database features will not work."
    log_message "To start ClickHouse: brew services start clickhouse"
else
    log_message "ClickHouse is running"
    # Wait for ClickHouse to be ready
    wait_for_service "ClickHouse" "curl -s 'http://localhost:8123/' --data 'SELECT 1'"
fi

# 3. Start SIEM Parser (if exists)
if [ -d "/Users/yasseralmohammed/sim6/siem_parser" ]; then
    log_message "Starting SIEM Parser..."
    cd /Users/yasseralmohammed/sim6/siem_parser
    nohup cargo run > /Users/yasseralmohammed/sim6/logs/siem_parser.log 2>&1 &
    sleep 3
fi

# 4. Start SIEM Ingestor
log_message "Starting SIEM Ingestor..."
cd /Users/yasseralmohammed/sim6/siem_ingestor
nohup cargo run > /Users/yasseralmohammed/sim6/logs/siem_ingestor.log 2>&1 &
sleep 5

# 5. Start SIEM Consumer
log_message "Starting SIEM Consumer..."
cd /Users/yasseralmohammed/sim6/siem_consumer
nohup cargo run > /Users/yasseralmohammed/sim6/logs/siem_consumer.log 2>&1 &
sleep 5

# 6. Start SIEM Rule Engine
log_message "Starting SIEM Rule Engine..."
cd /Users/yasseralmohammed/sim6/siem_rule_engine
nohup cargo run > /Users/yasseralmohammed/sim6/logs/siem_rule_engine.log 2>&1 &
sleep 5

# 7. Start SIEM Stream Processor (if exists)
if [ -d "/Users/yasseralmohammed/sim6/siem_stream_processor" ]; then
    log_message "Starting SIEM Stream Processor..."
    cd /Users/yasseralmohammed/sim6/siem_stream_processor
    nohup cargo run > /Users/yasseralmohammed/sim6/logs/siem_stream_processor.log 2>&1 &
    sleep 3
fi

# 8. Start SIEM API
log_message "Starting SIEM API..."
cd /Users/yasseralmohammed/sim6/siem_api
nohup cargo run > /Users/yasseralmohammed/sim6/logs/siem_api.log 2>&1 &
sleep 5

# 9. Wait for SIEM API to be ready
wait_for_service "SIEM API" "curl -s 'http://localhost:8080/api/v1/health'"
if [ $? -ne 0 ]; then
    log_message "WARNING: SIEM API failed to start properly"
fi

# 10. Generate fresh JWT token
log_message "Generating fresh JWT token..."
if [ -f "/Users/yasseralmohammed/sim6/generate_fresh_token.sh" ]; then
    /Users/yasseralmohammed/sim6/generate_fresh_token.sh
else
    log_message "WARNING: generate_fresh_token.sh not found"
fi

# 11. Start SIEM UI
log_message "Starting SIEM UI..."
cd /Users/yasseralmohammed/sim6/siem_ui

# Check if node_modules exists, if not run npm install
if [ ! -d "node_modules" ]; then
    log_message "Installing UI dependencies..."
    npm install
fi

nohup npm run dev > /Users/yasseralmohammed/sim6/logs/siem_ui.log 2>&1 &
sleep 10

# 12. Wait for SIEM UI to be ready
wait_for_service "SIEM UI" "curl -s 'http://localhost:3004/'"
if [ $? -ne 0 ]; then
    log_message "WARNING: SIEM UI failed to start properly"
fi

# 13. Run system health check (if exists)
if [ -f "/Users/yasseralmohammed/sim6/system_health_check.sh" ]; then
    log_message "Running system health check..."
    /Users/yasseralmohammed/sim6/system_health_check.sh
fi

log_message "======================================"
log_message "SIEM DEVELOPMENT SYSTEM STARTUP COMPLETE!"
log_message "======================================"
log_message "🌐 SIEM UI: http://localhost:3004/"
log_message "🔌 SIEM API: http://localhost:8080/"
log_message "🗄️  ClickHouse: http://localhost:8123/"
log_message "📊 Kafka: localhost:9092"
log_message "======================================"
log_message "📋 View logs: tail -f /Users/yasseralmohammed/sim6/logs/*.log"
log_message "🔄 Monitor system: ./monitor_and_restart.sh &"
log_message "🛑 Stop system: pkill -f 'siem_|npm.*dev'"
log_message "======================================"

# Show running processes
log_message "Running SIEM processes:"
ps aux | grep -E "(siem_|npm.*dev)" | grep -v grep | while read line; do
    log_message "  $line"
done

log_message "Startup script completed. Check individual service logs if any issues occur."