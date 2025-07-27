#!/bin/bash

# SIEM System Startup Script
# Starts all SIEM components in the correct order with dependency checks

LOG_FILE="/Users/yasseralmohammed/sim6/startup.log"

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

# Create logs directory
mkdir -p /Users/yasseralmohammed/sim6/logs

log_message "Starting SIEM system..."

# 1. Check if Kafka is running
log_message "Checking Kafka status..."
if ! pgrep -f "kafka.Kafka" > /dev/null; then
    log_message "ERROR: Kafka is not running. Please start Kafka first."
    exit 1
fi

# 2. Check if ClickHouse is running
log_message "Checking ClickHouse status..."
if ! pgrep -f "clickhouse server" > /dev/null; then
    log_message "ERROR: ClickHouse is not running. Please start ClickHouse first."
    exit 1
fi

# 3. Wait for ClickHouse to be ready
wait_for_service "ClickHouse" "curl -s 'http://localhost:8123/' --data 'SELECT 1'"
if [ $? -ne 0 ]; then
    exit 1
fi

# 4. Start SIEM Ingestor
log_message "Starting SIEM Ingestor..."
cd /Users/yasseralmohammed/sim6/siem_ingestor
if ! pgrep -f "siem_ingestor" > /dev/null; then
    nohup cargo run --release > /Users/yasseralmohammed/sim6/logs/siem_ingestor.log 2>&1 &
    sleep 5
else
    log_message "SIEM Ingestor is already running"
fi

# 5. Start SIEM Consumer
log_message "Starting SIEM Consumer..."
cd /Users/yasseralmohammed/sim6/siem_consumer
if ! pgrep -f "siem_consumer" > /dev/null; then
    nohup cargo run --release > /Users/yasseralmohammed/sim6/logs/siem_consumer.log 2>&1 &
    sleep 5
else
    log_message "SIEM Consumer is already running"
fi

# 6. Start SIEM API
log_message "Starting SIEM API..."
cd /Users/yasseralmohammed/sim6/siem_api
if ! pgrep -f "siem_api" > /dev/null; then
    nohup cargo run --release > /Users/yasseralmohammed/sim6/logs/siem_api.log 2>&1 &
    sleep 5
else
    log_message "SIEM API is already running"
fi

# 7. Wait for SIEM API to be ready
wait_for_service "SIEM API" "curl -s 'http://localhost:8080/api/v1/health'"
if [ $? -ne 0 ]; then
    exit 1
fi

# 8. Generate fresh JWT token
log_message "Generating fresh JWT token..."
/Users/yasseralmohammed/sim6/generate_fresh_token.sh

# 9. Start SIEM UI
log_message "Starting SIEM UI..."
cd /Users/yasseralmohammed/sim6/siem_ui
if ! pgrep -f "npm.*dev" > /dev/null; then
    nohup npm run dev > /Users/yasseralmohammed/sim6/logs/siem_ui.log 2>&1 &
    sleep 10
else
    log_message "SIEM UI is already running"
fi

# 10. Wait for SIEM UI to be ready
wait_for_service "SIEM UI" "curl -s 'http://localhost:3004/'"
if [ $? -ne 0 ]; then
    exit 1
fi

# 11. Run system health check
log_message "Running system health check..."
/Users/yasseralmohammed/sim6/system_health_check.sh

log_message "SIEM system startup complete!"
log_message "Access the UI at: http://localhost:3004/"
log_message "API available at: http://localhost:8080/"
log_message "To monitor the system continuously, run: ./monitor_and_restart.sh &"