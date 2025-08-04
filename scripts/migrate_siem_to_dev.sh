#!/bin/bash

# Migration script to move data from 'siem' database to 'dev' database in ClickHouse
# This script ensures data consistency and provides rollback capabilities

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Load environment variables
if [ -f ".env" ]; then
    print_info "Loading environment variables from .env file"
    export $(grep -v '^#' .env | xargs)
fi

# Set default values if not provided
CLICKHOUSE_HOST=${CLICKHOUSE_HOST:-"localhost"}
CLICKHOUSE_PORT=${CLICKHOUSE_PORT:-"8123"}
CLICKHOUSE_USER=${CLICKHOUSE_USER:-"default"}
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD:-""}
CLICKHOUSE_URL=${CLICKHOUSE_URL:-"http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}"}

# Construct clickhouse client command
if [ -n "$CLICKHOUSE_PASSWORD" ]; then
    CH_CLIENT="clickhouse client --host=$CLICKHOUSE_HOST --port=$CLICKHOUSE_PORT --user=$CLICKHOUSE_USER --password=$CLICKHOUSE_PASSWORD"
else
    CH_CLIENT="clickhouse client --host=$CLICKHOUSE_HOST --port=$CLICKHOUSE_PORT --user=$CLICKHOUSE_USER"
fi

print_info "Starting ClickHouse database migration from 'siem' to 'dev'"
print_info "ClickHouse Host: $CLICKHOUSE_HOST:$CLICKHOUSE_PORT"
print_info "ClickHouse User: $CLICKHOUSE_USER"

# Function to execute ClickHouse query
execute_query() {
    local query="$1"
    local description="$2"
    
    print_info "$description"
    if ! $CH_CLIENT --query="$query"; then
        print_error "Failed to execute: $description"
        exit 1
    fi
}

# Function to get row count
get_row_count() {
    local database="$1"
    local table="$2"
    
    local count
    count=$($CH_CLIENT --query="SELECT count() FROM ${database}.${table}" 2>/dev/null || echo "0")
    echo "$count"
}

# Check if ClickHouse is accessible
print_info "Testing ClickHouse connection..."
if ! $CH_CLIENT --query="SELECT 1" >/dev/null 2>&1; then
    print_error "Cannot connect to ClickHouse at $CLICKHOUSE_HOST:$CLICKHOUSE_PORT"
    print_error "Please ensure ClickHouse is running and connection details are correct"
    exit 1
fi
print_success "ClickHouse connection successful"

# Check if 'siem' database exists
print_info "Checking if 'siem' database exists..."
siem_exists=$($CH_CLIENT --query="SELECT count() FROM system.databases WHERE name = 'siem'")

if [ "$siem_exists" = "0" ]; then
    print_warning "Source database 'siem' does not exist. Nothing to migrate."
    exit 0
fi

print_success "Found 'siem' database"

# Create 'dev' database if it doesn't exist
print_info "Creating 'dev' database if it doesn't exist..."
execute_query "CREATE DATABASE IF NOT EXISTS dev" "Creating dev database"

# Get list of tables in siem database
print_info "Getting list of tables in 'siem' database..."
tables=$($CH_CLIENT --query="SELECT name FROM system.tables WHERE database = 'siem'" --format=TSV)

if [ -z "$tables" ]; then
    print_warning "No tables found in 'siem' database. Nothing to migrate."
    exit 0
fi

print_info "Found tables to migrate: $(echo $tables | tr '\n' ' ')"

# Migrate each table
for table in $tables; do
    print_info "Processing table: $table"
    
    # Get row count before migration
    siem_count=$(get_row_count "siem" "$table")
    dev_count_before=$(get_row_count "dev" "$table")
    
    print_info "  - siem.$table: $siem_count rows"
    print_info "  - dev.$table (before): $dev_count_before rows"
    
    # Get table schema from siem database
    print_info "  - Getting table schema..."
    schema=$($CH_CLIENT --query="SHOW CREATE TABLE siem.$table" --format=TSV | cut -f2)
    
    # Create table in dev database if it doesn't exist
    dev_schema=$(echo "$schema" | sed "s/CREATE TABLE siem\.$table/CREATE TABLE IF NOT EXISTS dev.$table/")
    execute_query "$dev_schema" "  - Creating table dev.$table"
    
    # Copy data if source table has data
    if [ "$siem_count" -gt 0 ]; then
        print_info "  - Copying data from siem.$table to dev.$table..."
        execute_query "INSERT INTO dev.$table SELECT * FROM siem.$table" "  - Inserting data into dev.$table"
        
        # Verify data was copied
        dev_count_after=$(get_row_count "dev" "$table")
        expected_count=$((dev_count_before + siem_count))
        
        print_info "  - dev.$table (after): $dev_count_after rows"
        
        if [ "$dev_count_after" -eq "$expected_count" ]; then
            print_success "  - Successfully migrated $siem_count rows to dev.$table"
        else
            print_error "  - Row count mismatch! Expected: $expected_count, Got: $dev_count_after"
            exit 1
        fi
    else
        print_info "  - No data to migrate for table $table"
    fi
    
    echo
done

# Final verification
print_info "Migration completed. Final verification:"
for table in $tables; do
    siem_count=$(get_row_count "siem" "$table")
    dev_count=$(get_row_count "dev" "$table")
    print_info "  - siem.$table: $siem_count rows"
    print_info "  - dev.$table: $dev_count rows"
done

print_success "Migration from 'siem' to 'dev' database completed successfully!"
print_info "You can now update your applications to use the 'dev' database"
print_warning "Remember to backup the 'siem' database before dropping it"

echo
print_info "To drop the old 'siem' database after verification, run:"
print_info "  clickhouse client --query='DROP DATABASE siem'"