#!/bin/bash

# SIEM System Cleanup Script
# Stops all SIEM services and cleans up resources

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Function to kill processes by name pattern
kill_processes() {
    local pattern="$1"
    local description="$2"
    
    log "Stopping $description..."
    
    # Find processes matching the pattern
    local pids=$(pgrep -f "$pattern" 2>/dev/null || true)
    
    if [ -n "$pids" ]; then
        log "Found $description processes: $pids"
        
        # Try graceful shutdown first
        echo "$pids" | xargs -r kill -TERM 2>/dev/null || true
        sleep 2
        
        # Check if processes are still running
        local remaining_pids=$(pgrep -f "$pattern" 2>/dev/null || true)
        
        if [ -n "$remaining_pids" ]; then
            log_warning "Force killing remaining $description processes: $remaining_pids"
            echo "$remaining_pids" | xargs -r kill -KILL 2>/dev/null || true
            sleep 1
        fi
        
        log_success "Stopped $description"
    else
        log "No $description processes found"
    fi
}

# Function to kill processes by port
kill_by_port() {
    local port="$1"
    local description="$2"
    
    log "Checking port $port for $description..."
    
    # Find process using the port
    local pid=$(lsof -ti:$port 2>/dev/null || true)
    
    if [ -n "$pid" ]; then
        log "Found process $pid using port $port ($description)"
        
        # Try graceful shutdown first
        kill -TERM "$pid" 2>/dev/null || true
        sleep 2
        
        # Check if process is still running
        if kill -0 "$pid" 2>/dev/null; then
            log_warning "Force killing process $pid on port $port"
            kill -KILL "$pid" 2>/dev/null || true
            sleep 1
        fi
        
        log_success "Freed port $port"
    else
        log "Port $port is free"
    fi
}

# Function to clean up log files
cleanup_logs() {
    log "Cleaning up log files..."
    
    # Create logs directory if it doesn't exist
    mkdir -p logs
    
    # Archive old logs if they exist
    if ls logs/*.log 1> /dev/null 2>&1; then
        local timestamp=$(date +"%Y%m%d_%H%M%S")
        local archive_dir="logs/archive/$timestamp"
        
        mkdir -p "$archive_dir"
        mv logs/*.log "$archive_dir/" 2>/dev/null || true
        
        log "Archived old logs to $archive_dir"
    fi
    
    # Clean up old archives (keep last 5)
    if [ -d "logs/archive" ]; then
        local archive_count=$(ls -1 logs/archive | wc -l)
        if [ "$archive_count" -gt 5 ]; then
            log "Cleaning up old log archives..."
            ls -1t logs/archive | tail -n +6 | xargs -I {} rm -rf "logs/archive/{}"
        fi
    fi
    
    log_success "Log cleanup completed"
}

# Function to clean up temporary files
cleanup_temp_files() {
    log "Cleaning up temporary files..."
    
    # Remove PID files
    rm -f /tmp/siem_*.pid 2>/dev/null || true
    
    # Remove temporary service files
    rm -f /tmp/siem_services.txt 2>/dev/null || true
    rm -f /tmp/siem_urls.txt 2>/dev/null || true
    
    # Remove temporary JWT tokens
    rm -f /tmp/siem_jwt_token.txt 2>/dev/null || true
    
    log_success "Temporary files cleaned up"
}

# Function to reset cargo build cache if needed
reset_cargo_cache() {
    if [ "${1:-}" = "--full" ]; then
        log "Performing full cargo clean..."
        
        # Find all Cargo.toml files and clean their targets
        find . -name "Cargo.toml" -not -path "./target/*" | while read -r cargo_file; do
            local dir=$(dirname "$cargo_file")
            log "Cleaning cargo cache in $dir"
            (cd "$dir" && cargo clean 2>/dev/null || true)
        done
        
        log_success "Cargo cache reset completed"
    fi
}

# Main cleanup function
main() {
    log "Starting SIEM system cleanup..."
    
    # Stop SIEM services by process name patterns
    kill_processes "siem_api" "SIEM API"
    kill_processes "siem_clickhouse_ingestion" "ClickHouse Ingestor"
    kill_processes "siem_unified_pipeline" "Unified Pipeline"
    kill_processes "siem-pipeline" "Pipeline Server"
    
    # Stop services by port (in case process names don't match)
    kill_by_port 8080 "SIEM API"
    kill_by_port 8081 "ClickHouse Ingestor"
    kill_by_port 8082 "Unified Pipeline"
    kill_by_port 3004 "SIEM UI"
    
    # Stop Node.js development servers
    kill_processes "vite.*siem_ui" "SIEM UI (Vite)"
    kill_processes "npm.*run.*dev" "NPM Dev Server"
    kill_processes "yarn.*dev" "Yarn Dev Server"
    
    # Clean up files
    cleanup_logs
    cleanup_temp_files
    
    # Reset cargo cache if requested
    reset_cargo_cache "$@"
    
    # Wait a moment for all processes to fully terminate
    sleep 2
    
    # Final verification
    log "Verifying cleanup..."
    
    local remaining_processes=$(pgrep -f "siem_" 2>/dev/null || true)
    if [ -n "$remaining_processes" ]; then
        log_warning "Some SIEM processes may still be running: $remaining_processes"
        log_warning "You may need to manually kill them: kill -9 $remaining_processes"
    else
        log_success "All SIEM processes stopped"
    fi
    
    # Check if ports are free
    local busy_ports=""
    for port in 8080 8081 8082 3004; do
        if lsof -ti:$port >/dev/null 2>&1; then
            busy_ports="$busy_ports $port"
        fi
    done
    
    if [ -n "$busy_ports" ]; then
        log_warning "Some ports are still in use:$busy_ports"
        log_warning "Run 'lsof -ti:<port>' to identify the processes"
    else
        log_success "All SIEM ports are free"
    fi
    
    log_success "SIEM system cleanup completed"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "SIEM System Cleanup Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --full    Perform full cleanup including cargo cache"
        echo "  --help    Show this help message"
        echo ""
        echo "This script stops all SIEM services and cleans up resources."
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac