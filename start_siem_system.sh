#!/bin/bash

# SIEM System Startup Script
# Starts all SIEM components in the correct order with dependency checks

set -e

# Load environment variables
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Configuration
PROJECT_ROOT=${PROJECT_ROOT:-"/Users/yasseralmohammed/sim6"}
LOGS_DIR=${LOGS_DIR:-"${PROJECT_ROOT}/logs"}
LOG_FILE="${PROJECT_ROOT}/startup.log"
MAX_WAIT_TIME=60
SLEEP_INTERVAL=5
API_URL=${API_URL:-"http://localhost:8080"}
CLICKHOUSE_URL=${CLICKHOUSE_URL:-"http://localhost:8123"}
UI_PORT=${VITE_PORT:-"3001"}

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
mkdir -p "${LOGS_DIR}"

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
wait_for_service "ClickHouse" "curl -s '${CLICKHOUSE_URL}/' --data 'SELECT 1'"
if [ $? -ne 0 ]; then
    exit 1
fi

# 4. Start SIEM Ingestor
log_message "Starting SIEM Ingestor..."
cd "${PROJECT_ROOT}/siem_ingestor"
if ! pgrep -f "siem_ingestor" > /dev/null; then
    nohup cargo run --release > "${LOGS_DIR}/siem_ingestor.log" 2>&1 &
    sleep 5
else
    log_message "SIEM Ingestor is already running"
fi

# 5. Start SIEM Consumer
log_message "Starting SIEM Consumer..."
cd "${PROJECT_ROOT}/siem_consumer"
if ! pgrep -f "siem_consumer" > /dev/null; then
    nohup cargo run --release > "${LOGS_DIR}/siem_consumer.log" 2>&1 &
    sleep 5
else
    log_message "SIEM Consumer is already running"
fi

# 6. Start SIEM API
log_message "Starting SIEM API..."
cd "${PROJECT_ROOT}/siem_api"
if ! pgrep -f "siem_api" > /dev/null; then
    nohup cargo run --release > "${LOGS_DIR}/siem_api.log" 2>&1 &
    sleep 5
else
    log_message "SIEM API is already running"
fi

# 7. Wait for SIEM API to be ready
wait_for_service "SIEM API" "curl -s '${API_URL}/api/v1/health'"
if [ $? -ne 0 ]; then
    exit 1
fi

# 8. Generate fresh JWT token
log_message "Generating fresh JWT token..."
"${PROJECT_ROOT}/generate_fresh_token.sh"

# 9. Start SIEM UI
log_message "Starting SIEM UI..."
cd "${PROJECT_ROOT}/siem_ui"
if ! pgrep -f "npm.*dev" > /dev/null; then
    nohup npm run dev > "${LOGS_DIR}/siem_ui.log" 2>&1 &
    sleep 10
else
    log_message "SIEM UI is already running"
fi

# 10. Wait for SIEM UI to be ready
wait_for_service "SIEM UI" "curl -s 'http://localhost:${UI_PORT}/'"
if [ $? -ne 0 ]; then
    exit 1
fi

# 11. Run system health check
log_message "Running system health check..."
"${PROJECT_ROOT}/system_health_check.sh"

log_message "SIEM system startup complete!"
log_message "Access the UI at: http://localhost:${UI_PORT}/"
log_message "API available at: ${API_URL}/"
log_message "To monitor the system continuously, run: ./monitor_and_restart.sh &"