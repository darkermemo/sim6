#!/bin/bash

# verify_schema.sh - Database Schema Verification Script for SIEM System
# This script verifies the current ClickHouse schema against a golden record

set -e  # Exit on any error

# Configuration
CLICKHOUSE_HOST="localhost"
CLICKHOUSE_PORT="8123"
CLICKHOUSE_USER="default"
CLICKHOUSE_PASSWORD=""
SCHEMA_DIR="$(dirname "$0")"
GOLDEN_SCHEMA_FILE="$SCHEMA_DIR/golden_schema.txt"
CURRENT_SCHEMA_FILE="/tmp/current_schema.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
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

# Function to execute ClickHouse query
execute_query() {
    local query="$1"
    curl -s -X POST "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" \
        --data-binary "$query" \
        -H "Content-Type: text/plain" 2>/dev/null
}

# Function to check if ClickHouse is accessible
check_clickhouse() {
    log "Checking ClickHouse connectivity..."
    if ! curl -s "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/ping" > /dev/null; then
        log_error "Cannot connect to ClickHouse at ${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}"
        log_error "Please ensure ClickHouse is running and accessible"
        exit 1
    fi
    log_success "ClickHouse is accessible"
}

# Function to get all tables in dev database
get_tables() {
    execute_query "SHOW TABLES FROM dev" | sort
}

# Function to describe a table
describe_table() {
    local table="$1"
    execute_query "DESCRIBE TABLE dev.$table" | sort
}

# Function to generate current schema
generate_current_schema() {
    log "Generating current database schema..."
    
    # Clear the current schema file
    > "$CURRENT_SCHEMA_FILE"
    
    # Get all tables
    local tables
    tables="$(get_tables)"
    
    if [ -z "$tables" ]; then
        log_error "No tables found in dev database"
        exit 1
    fi
    
    # Describe each table
    while IFS= read -r table; do
        if [ -n "$table" ]; then
            echo "=== TABLE: dev.$table ===" >> "$CURRENT_SCHEMA_FILE"
            describe_table "$table" >> "$CURRENT_SCHEMA_FILE"
            echo "" >> "$CURRENT_SCHEMA_FILE"
        fi
    done <<< "$tables"
    
    log_success "Current schema generated: $CURRENT_SCHEMA_FILE"
}

# Function to create golden schema if it doesn't exist
create_golden_schema() {
    if [ ! -f "$GOLDEN_SCHEMA_FILE" ]; then
        log_warning "Golden schema file not found. Creating from current schema..."
        cp "$CURRENT_SCHEMA_FILE" "$GOLDEN_SCHEMA_FILE"
        log_success "Golden schema created: $GOLDEN_SCHEMA_FILE"
        log_warning "Please review and commit the golden schema file to version control"
        return 0
    fi
    return 1
}

# Function to compare schemas
compare_schemas() {
    log "Comparing current schema with golden record..."
    
    if ! diff -u "$GOLDEN_SCHEMA_FILE" "$CURRENT_SCHEMA_FILE" > /tmp/schema_diff.txt; then
        log_error "Schema verification FAILED!"
        log_error "Differences found between current schema and golden record:"
        echo ""
        cat /tmp/schema_diff.txt
        echo ""
        log_error "Please review the differences above."
        log_error "If the changes are intentional, update the golden schema file."
        log_error "If the changes are unintentional, fix the database schema."
        return 1
    else
        log_success "Schema verification PASSED!"
        log_success "Current database schema matches the golden record"
        return 0
    fi
}

# Function to update golden schema
update_golden_schema() {
    log "Updating golden schema with current schema..."
    cp "$CURRENT_SCHEMA_FILE" "$GOLDEN_SCHEMA_FILE"
    log_success "Golden schema updated: $GOLDEN_SCHEMA_FILE"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help           Show this help message"
    echo "  -u, --update-golden  Update golden schema with current schema"
    echo "  -v, --verbose        Enable verbose output"
    echo ""
    echo "Examples:"
    echo "  $0                   Verify current schema against golden record"
    echo "  $0 --update-golden   Update golden schema with current schema"
}

# Main execution
main() {
    local update_golden=false
    local verbose=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -u|--update-golden)
                update_golden=true
                shift
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    log "Starting database schema verification..."
    
    # Check ClickHouse connectivity
    check_clickhouse
    
    # Generate current schema
    generate_current_schema
    
    # Handle update golden schema option
    if [ "$update_golden" = true ]; then
        update_golden_schema
        exit 0
    fi
    
    # Create golden schema if it doesn't exist
    if create_golden_schema; then
        exit 0
    fi
    
    # Compare schemas
    if compare_schemas; then
        # Clean up temporary files
        rm -f "$CURRENT_SCHEMA_FILE" /tmp/schema_diff.txt
        exit 0
    else
        # Keep temporary files for debugging
        log_error "Temporary files kept for debugging:"
        log_error "  Current schema: $CURRENT_SCHEMA_FILE"
        log_error "  Schema diff: /tmp/schema_diff.txt"
        exit 1
    fi
}

# Run main function
main "$@"