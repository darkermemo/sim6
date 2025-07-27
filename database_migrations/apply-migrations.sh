#!/bin/bash

# apply-migrations.sh - Database Migration Script for SIEM System
# This script applies versioned SQL migration scripts to ClickHouse in order

set -e  # Exit on any error

# Configuration
CLICKHOUSE_HOST="localhost"
CLICKHOUSE_PORT="8123"
CLICKHOUSE_USER="default"
CLICKHOUSE_PASSWORD=""
MIGRATIONS_DIR="$(dirname "$0")"
MIGRATIONS_TABLE="dev.schema_migrations"

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
    local description="$2"
    
    if [ -n "$description" ]; then
        log "$description"
    fi
    
    curl -s -X POST "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" \
        --data-binary "$query" \
        -H "Content-Type: text/plain" || {
        log_error "Failed to execute query: $description"
        return 1
    }
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

# Function to create migrations tracking table
create_migrations_table() {
    log "Creating migrations tracking table..."
    
    # First ensure the dev database exists
    execute_query "CREATE DATABASE IF NOT EXISTS dev" "Creating dev database"
    
    local create_table_query="
CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    version String,
    filename String,
    applied_at UInt32,
    checksum String
) ENGINE = MergeTree()
ORDER BY version"
    execute_query "$create_table_query" "Creating schema_migrations table"
    log_success "Migrations tracking table ready"
}

# Function to get applied migrations
get_applied_migrations() {
    curl -s -X POST "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" \
        --data-binary "SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version" \
        -H "Content-Type: text/plain" 2>/dev/null || echo ""
}

# Function to calculate file checksum
calculate_checksum() {
    local file="$1"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$file" | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$file" | cut -d' ' -f1
    else
        # Fallback to a simple checksum
        wc -c < "$file"
    fi
}

# Function to split SQL file into individual statements
split_sql_statements() {
    local file="$1"
    # Read the entire file, remove comments and empty lines, then split on semicolons
    local content="$(cat "$file" | sed '/^[[:space:]]*--/d; /^[[:space:]]*$/d')"
    
    # Split on semicolons and clean up whitespace
    echo "$content" | awk 'BEGIN{RS=";"} {gsub(/^[[:space:]]+|[[:space:]]+$/,""); gsub(/[[:space:]]+/," "); if(length($0)>0) print $0}'
}

# Function to apply a single migration
apply_migration() {
    local file="$1"
    local filename="$(basename "$file")"
    local version="$(echo "$filename" | sed 's/V\([0-9]*\)__.*/\1/')"
    local checksum="$(calculate_checksum "$file")"
    
    log "Applying migration: $filename"
    
    # Split the migration file into individual statements
    local statements
    statements="$(split_sql_statements "$file")"
    
    # Execute each statement separately
    local statement_count=0
    while IFS= read -r statement; do
        if [ -n "$statement" ] && [ "$(echo "$statement" | tr -d '[:space:]')" != "" ]; then
            ((statement_count++))
            log "Executing statement $statement_count from $filename"
            log "Statement: $statement"
            local result
            result=$(execute_query "$statement" 2>&1)
            if [ $? -ne 0 ]; then
                log_error "Failed to execute statement $statement_count in migration: $filename"
                log_error "Statement: $statement"
                log_error "Error: $result"
                exit 1
            fi
        fi
    done <<< "$statements"
    
    # Record the migration as applied
    local record_query="INSERT INTO ${MIGRATIONS_TABLE} (version, filename, applied_at, checksum) VALUES ('$version', '$filename', toUnixTimestamp(now()), '$checksum')"
    execute_query "$record_query" "Recording migration $filename"
    log_success "Successfully applied: $filename ($statement_count statements)"
}

# Main execution
main() {
    log "Starting database migration process..."
    
    # Check ClickHouse connectivity
    check_clickhouse
    
    # Create migrations tracking table
    create_migrations_table
    
    # Get list of applied migrations
    local applied_migrations
    applied_migrations="$(get_applied_migrations)"
    
    # Find and sort migration files
    local migration_files
    migration_files="$(find "$MIGRATIONS_DIR" -name "V[0-9]*__*.sql" | sort)"
    
    if [ -z "$migration_files" ]; then
        log_warning "No migration files found in $MIGRATIONS_DIR"
        exit 0
    fi
    
    local applied_count=0
    local skipped_count=0
    
    # Apply each migration
    while IFS= read -r file; do
        local filename="$(basename "$file")"
        local version="$(echo "$filename" | sed 's/V\([0-9]*\)__.*/\1/')"
        
        # Check if migration is already applied
        if echo "$applied_migrations" | grep -q "^$version$"; then
            log "Skipping already applied migration: $filename"
            ((skipped_count++))
        else
            apply_migration "$file"
            ((applied_count++))
        fi
    done <<< "$migration_files"
    
    log_success "Migration process completed!"
    log_success "Applied: $applied_count migrations"
    log_success "Skipped: $skipped_count migrations"
}

# Run main function
main "$@"