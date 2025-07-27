#!/bin/bash

# SIEM System Stop Script
# Stops all SIEM components gracefully

LOG_FILE="/Users/yasseralmohammed/sim6/stop.log"

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_message "Stopping SIEM system..."

# Stop all SIEM processes
log_message "Stopping SIEM components..."
pkill -f "siem_api" 2>/dev/null && log_message "Stopped SIEM API"
pkill -f "siem_consumer" 2>/dev/null && log_message "Stopped SIEM Consumer"
pkill -f "siem_ingestor" 2>/dev/null && log_message "Stopped SIEM Ingestor"
pkill -f "siem_rule_engine" 2>/dev/null && log_message "Stopped SIEM Rule Engine"
pkill -f "siem_stream_processor" 2>/dev/null && log_message "Stopped SIEM Stream Processor"
pkill -f "siem_parser" 2>/dev/null && log_message "Stopped SIEM Parser"

# Stop UI
log_message "Stopping SIEM UI..."
pkill -f "npm.*dev" 2>/dev/null && log_message "Stopped SIEM UI"

# Wait a moment for processes to terminate
sleep 2

# Check if any processes are still running
remaining=$(ps aux | grep -E "(siem_|npm.*dev)" | grep -v grep | wc -l)
if [ $remaining -eq 0 ]; then
    log_message "✅ All SIEM processes stopped successfully"
else
    log_message "⚠️  Some processes may still be running:"
    ps aux | grep -E "(siem_|npm.*dev)" | grep -v grep | while read line; do
        log_message "  $line"
    done
    log_message "You may need to manually kill remaining processes"
fi

log_message "SIEM system stop completed"