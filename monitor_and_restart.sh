#!/bin/bash

# SIEM System Monitor and Auto-Restart Script
# This script monitors all SIEM components and restarts them if they crash

LOG_FILE="/Users/yasseralmohammed/sim6/monitor.log"
PID_FILE="/Users/yasseralmohammed/sim6/monitor.pid"

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to check if a process is running
check_process() {
    local process_name="$1"
    local search_pattern="$2"
    
    if pgrep -f "$search_pattern" > /dev/null; then
        return 0  # Process is running
    else
        return 1  # Process is not running
    fi
}

# Function to start SIEM API
start_siem_api() {
    log_message "Starting SIEM API..."
    cd /Users/yasseralmohammed/sim6/siem_api
    nohup cargo run --release > /Users/yasseralmohammed/sim6/logs/siem_api.log 2>&1 &
    sleep 5
}

# Function to start SIEM Consumer
start_siem_consumer() {
    log_message "Starting SIEM Consumer..."
    cd /Users/yasseralmohammed/sim6/siem_consumer
    nohup cargo run --release > /Users/yasseralmohammed/sim6/logs/siem_consumer.log 2>&1 &
    sleep 5
}

# Function to start SIEM Ingestor
start_siem_ingestor() {
    log_message "Starting SIEM Ingestor..."
    cd /Users/yasseralmohammed/sim6/siem_ingestor
    nohup cargo run --release > /Users/yasseralmohammed/sim6/logs/siem_ingestor.log 2>&1 &
    sleep 5
}

# Function to start SIEM UI
start_siem_ui() {
    log_message "Starting SIEM UI..."
    cd /Users/yasseralmohammed/sim6/siem_ui
    nohup npm run dev > /Users/yasseralmohammed/sim6/logs/siem_ui.log 2>&1 &
    sleep 10
}

# Create logs directory if it doesn't exist
mkdir -p /Users/yasseralmohammed/sim6/logs

# Main monitoring loop
monitor_services() {
    log_message "Starting SIEM system monitoring..."
    
    while true; do
        # Check SIEM API
        if ! check_process "siem_api" "siem_api"; then
            log_message "SIEM API is down! Restarting..."
            start_siem_api
        fi
        
        # Check SIEM Consumer
        if ! check_process "siem_consumer" "siem_consumer"; then
            log_message "SIEM Consumer is down! Restarting..."
            start_siem_consumer
        fi
        
        # Check SIEM Ingestor
        if ! check_process "siem_ingestor" "siem_ingestor"; then
            log_message "SIEM Ingestor is down! Restarting..."
            start_siem_ingestor
        fi
        
        # Check SIEM UI
        if ! check_process "siem_ui" "npm.*dev"; then
            log_message "SIEM UI is down! Restarting..."
            start_siem_ui
        fi
        
        # Check JWT token validity every hour
        if [ $(($(date +%s) % 3600)) -lt 30 ]; then
            if [ -f "/Users/yasseralmohammed/sim6/admin_token.txt" ]; then
                TOKEN=$(cat /Users/yasseralmohammed/sim6/admin_token.txt)
                if ! curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:8080/api/v1/health' > /dev/null 2>&1; then
                    log_message "JWT token expired! Generating new token..."
                    /Users/yasseralmohammed/sim6/generate_fresh_token.sh
                fi
            fi
        fi
        
        # Wait 30 seconds before next check
        sleep 30
    done
}

# Handle script termination
trap 'log_message "Monitor stopped"; rm -f "$PID_FILE"; exit 0' SIGTERM SIGINT

# Check if monitor is already running
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Monitor is already running (PID: $(cat "$PID_FILE"))"
    exit 1
fi

# Save PID and start monitoring
echo $$ > "$PID_FILE"
monitor_services