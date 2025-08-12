#!/bin/sh
# ClickHouse Connectivity Test Script
# Tests connection, schema verification, and basic queries against dev.events table

set -e

# Load environment variables from .env if it exists
if [ -f ".env" ]; then
    # Export variables from .env, handling quotes and comments
    set -a
    . ./.env
    set +a
fi

# Default values from config analysis
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-dev}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-default}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-}"
EVENTS_TABLE_NAME="${EVENTS_TABLE_NAME:-dev.events}"

echo "=== ClickHouse Connectivity Test ==="
echo "ClickHouse URL: $CLICKHOUSE_URL"
echo "Database: $CLICKHOUSE_DATABASE"
echo "User: $CLICKHOUSE_USER"
echo "Events Table: $EVENTS_TABLE_NAME"
echo

# Function to execute ClickHouse query
execute_query() {
    local query="$1"
    local description="$2"
    
    echo "Executing: $description"
    echo "Query: $query"
    
    if [ -n "$CLICKHOUSE_PASSWORD" ]; then
        curl -s --fail \
            -u "$CLICKHOUSE_USER:$CLICKHOUSE_PASSWORD" \
            "$CLICKHOUSE_URL" \
            -d "$query"
    else
        curl -s --fail \
            -u "$CLICKHOUSE_USER:" \
            "$CLICKHOUSE_URL" \
            -d "$query"
    fi
    
    if [ $? -eq 0 ]; then
        echo "✅ Success: $description"
    else
        echo "❌ Failed: $description"
        exit 1
    fi
    echo
}

# Test 1: Basic connectivity
echo "--- Test 1: Basic Connectivity ---"
execute_query "SELECT 1" "Basic connectivity test"

# Test 2: Database access
echo "--- Test 2: Database Access ---"
execute_query "SELECT name FROM system.databases WHERE name = '$CLICKHOUSE_DATABASE'" "Database existence check"

# Test 3: Table schema verification
echo "--- Test 3: Table Schema Verification ---"
execute_query "DESCRIBE TABLE $EVENTS_TABLE_NAME" "Table schema description"

# Test 4: Basic count query
echo "--- Test 4: Basic Count Query ---"
execute_query "SELECT count() FROM $EVENTS_TABLE_NAME" "Total events count"

# Test 5: EPS calculation with time window
echo "--- Test 5: EPS Calculation (Last 60 seconds) ---"
execute_query "SELECT tenant_id, count() FROM $EVENTS_TABLE_NAME WHERE event_timestamp >= now() - INTERVAL 60 SECOND GROUP BY tenant_id" "EPS calculation by tenant"

# Test 6: Recent events sample
echo "--- Test 6: Recent Events Sample ---"
execute_query "SELECT event_id, tenant_id, event_timestamp FROM $EVENTS_TABLE_NAME ORDER BY event_timestamp DESC LIMIT 5" "Recent events sample"

# Test 7: Table columns verification
echo "--- Test 7: Table Columns Verification ---"
execute_query "SELECT name, type FROM system.columns WHERE database = '$CLICKHOUSE_DATABASE' AND table = 'events' ORDER BY name" "Table columns and types"

echo "=== ClickHouse Connectivity Test Completed Successfully ==="
echo "All queries executed without errors."
echo "ClickHouse is ready for SIEM operations."