#!/bin/bash

# ClickHouse Setup Script for Ingestion Layer Testing
# Prepares ClickHouse database and tables for high-performance testing

set -e

# Configuration
CLICKHOUSE_HOST="localhost"
CLICKHOUSE_PORT="8123"
CLICKHOUSE_USER="default"
CLICKHOUSE_PASSWORD=""
CLICKHOUSE_DB="siem"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to execute ClickHouse query
execute_clickhouse_query() {
    local query="$1"
    local format="${2:-TabSeparated}"
    
    curl -s "http://$CLICKHOUSE_HOST:$CLICKHOUSE_PORT/" \
        --data-urlencode "query=$query" \
        --data-urlencode "format=$format" \
        -u "$CLICKHOUSE_USER:$CLICKHOUSE_PASSWORD"
}

# Function to check if ClickHouse is running
check_clickhouse_connection() {
    echo "🔍 Checking ClickHouse connection..."
    
    if execute_clickhouse_query "SELECT 1" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ ClickHouse is running and accessible${NC}"
        return 0
    else
        echo -e "${RED}❌ ClickHouse is not accessible${NC}"
        return 1
    fi
}

# Function to create database
create_database() {
    echo "🗄️ Creating database '$CLICKHOUSE_DB'..."
    
    local query="CREATE DATABASE IF NOT EXISTS $CLICKHOUSE_DB"
    
    if execute_clickhouse_query "$query" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Database '$CLICKHOUSE_DB' created successfully${NC}"
    else
        echo -e "${RED}❌ Failed to create database '$CLICKHOUSE_DB'${NC}"
        return 1
    fi
}

# Function to create optimized events table template
create_events_table() {
    local table_name="$1"
    
    echo "📋 Creating table '$table_name'..."
    
    local create_table_sql="
        CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DB.$table_name (
            tenant_id String,
            timestamp UInt64,
            level String,
            message String,
            source String,
            fields String,
            ingestion_time UInt64
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(toDateTime(timestamp / 1000))
        ORDER BY (tenant_id, timestamp)
        SETTINGS 
            index_granularity = 8192,
            merge_with_ttl_timeout = 86400,
            max_compress_block_size = 1048576,
            min_compress_block_size = 65536
    "
    
    if execute_clickhouse_query "$create_table_sql" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Table '$table_name' created successfully${NC}"
    else
        echo -e "${RED}❌ Failed to create table '$table_name'${NC}"
        return 1
    fi
}

# Function to create all tenant tables
create_tenant_tables() {
    echo "🏢 Creating tenant tables..."
    
    for i in {1..20}; do
        create_events_table "events_tenant$i"
    done
    
    echo -e "${GREEN}✅ All tenant tables created${NC}"
}

# Function to optimize ClickHouse settings for high throughput
optimize_clickhouse_settings() {
    echo "⚡ Optimizing ClickHouse settings for high throughput..."
    
    # Set optimal settings for high-performance ingestion
    local settings=(
        "SET max_insert_block_size = 1048576"
        "SET max_block_size = 65536"
        "SET max_threads = 8"
        "SET max_memory_usage = 10000000000"
        "SET max_bytes_before_external_group_by = 20000000000"
        "SET max_bytes_before_external_sort = 20000000000"
    )
    
    for setting in "${settings[@]}"; do
        if execute_clickhouse_query "$setting" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Applied: $setting${NC}"
        else
            echo -e "${YELLOW}⚠️ Warning: Failed to apply: $setting${NC}"
        fi
    done
}

# Function to create system monitoring views
create_monitoring_views() {
    echo "📊 Creating monitoring views..."
    
    # Create view for table statistics
    local table_stats_view="
        CREATE OR REPLACE VIEW $CLICKHOUSE_DB.table_statistics AS
        SELECT 
            table,
            sum(rows) as total_rows,
            sum(bytes_uncompressed) as raw_bytes,
            sum(bytes_on_disk) as stored_bytes,
            round(100.0 * sum(bytes_on_disk) / sum(bytes_uncompressed), 2) as compression_ratio,
            max(modification_time) as last_modified
        FROM system.parts 
        WHERE database = '$CLICKHOUSE_DB' AND active = 1
        GROUP BY table
        ORDER BY total_rows DESC
    "
    
    if execute_clickhouse_query "$table_stats_view" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Table statistics view created${NC}"
    else
        echo -e "${YELLOW}⚠️ Warning: Failed to create table statistics view${NC}"
    fi
    
    # Create view for ingestion monitoring
    local ingestion_monitor_view="
        CREATE OR REPLACE VIEW $CLICKHOUSE_DB.ingestion_monitor AS
        SELECT 
            table,
            count() as events_count,
            min(toDateTime(timestamp / 1000)) as earliest_event,
            max(toDateTime(timestamp / 1000)) as latest_event,
            max(toDateTime(ingestion_time / 1000)) as latest_ingestion,
            round(avg(ingestion_time - timestamp), 2) as avg_ingestion_lag_ms
        FROM (
            SELECT 'events_tenant1' as table, timestamp, ingestion_time FROM $CLICKHOUSE_DB.events_tenant1
            UNION ALL
            SELECT 'events_tenant2' as table, timestamp, ingestion_time FROM $CLICKHOUSE_DB.events_tenant2
            UNION ALL
            SELECT 'events_tenant3' as table, timestamp, ingestion_time FROM $CLICKHOUSE_DB.events_tenant3
            UNION ALL
            SELECT 'events_tenant4' as table, timestamp, ingestion_time FROM $CLICKHOUSE_DB.events_tenant4
            UNION ALL
            SELECT 'events_tenant5' as table, timestamp, ingestion_time FROM $CLICKHOUSE_DB.events_tenant5
        )
        GROUP BY table
        ORDER BY events_count DESC
    "
    
    if execute_clickhouse_query "$ingestion_monitor_view" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Ingestion monitor view created${NC}"
    else
        echo -e "${YELLOW}⚠️ Warning: Failed to create ingestion monitor view${NC}"
    fi
}

# Function to verify setup
verify_setup() {
    echo "🔍 Verifying ClickHouse setup..."
    
    # Check database exists
    local db_exists=$(execute_clickhouse_query "SHOW DATABASES" | grep -c "^$CLICKHOUSE_DB$" || true)
    if [ "$db_exists" -eq 1 ]; then
        echo -e "${GREEN}✅ Database '$CLICKHOUSE_DB' exists${NC}"
    else
        echo -e "${RED}❌ Database '$CLICKHOUSE_DB' not found${NC}"
        return 1
    fi
    
    # Check tables exist
    local table_count=$(execute_clickhouse_query "SELECT count() FROM system.tables WHERE database = '$CLICKHOUSE_DB' AND name LIKE 'events_%'")
    echo -e "${GREEN}✅ Found $table_count tenant tables${NC}"
    
    # Show table list
    echo "📋 Available tables:"
    execute_clickhouse_query "SELECT name FROM system.tables WHERE database = '$CLICKHOUSE_DB' AND name LIKE 'events_%' ORDER BY name" | while read -r table; do
        echo "   - $table"
    done
    
    # Show views
    local view_count=$(execute_clickhouse_query "SELECT count() FROM system.tables WHERE database = '$CLICKHOUSE_DB' AND engine = 'View'")
    if [ "$view_count" -gt 0 ]; then
        echo -e "${GREEN}✅ Found $view_count monitoring views${NC}"
    fi
}

# Function to show performance tips
show_performance_tips() {
    echo -e "\n${BLUE}💡 Performance Tips for Testing:${NC}"
    echo "================================================"
    echo "1. Monitor system resources during testing:"
    echo "   - CPU usage: htop or top"
    echo "   - Memory usage: free -h"
    echo "   - Disk I/O: iostat -x 1"
    echo ""
    echo "2. ClickHouse monitoring queries:"
    echo "   - Table stats: SELECT * FROM $CLICKHOUSE_DB.table_statistics;"
    echo "   - Ingestion lag: SELECT * FROM $CLICKHOUSE_DB.ingestion_monitor;"
    echo "   - Active parts: SELECT table, count() FROM system.parts WHERE active GROUP BY table;"
    echo ""
    echo "3. Optimize for your hardware:"
    echo "   - Adjust max_threads based on CPU cores"
    echo "   - Increase memory limits for large datasets"
    echo "   - Use SSD storage for better performance"
    echo ""
    echo "4. Test incrementally:"
    echo "   - Start with 1K EPS, then scale up"
    echo "   - Monitor for bottlenecks at each level"
    echo "   - Adjust batch sizes and timeouts as needed"
}

# Main execution
main() {
    echo -e "${BLUE}🚀 ClickHouse Setup for Ingestion Layer Testing${NC}"
    echo "================================================"
    
    # Check connection
    if ! check_clickhouse_connection; then
        echo -e "${RED}❌ Cannot connect to ClickHouse. Please ensure it's running.${NC}"
        echo "To start ClickHouse:"
        echo "  - macOS: brew services start clickhouse"
        echo "  - Linux: sudo systemctl start clickhouse-server"
        echo "  - Docker: docker run -d --name clickhouse-server --ulimit nofile=262144:262144 -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server"
        exit 1
    fi
    
    # Setup database and tables
    create_database
    create_tenant_tables
    optimize_clickhouse_settings
    create_monitoring_views
    
    # Verify setup
    verify_setup
    
    # Show tips
    show_performance_tips
    
    echo -e "\n${GREEN}✅ ClickHouse setup complete!${NC}"
    echo "You can now run the ingestion layer tests with:"
    echo "  ./test_clickhouse_ingestion_layer.sh"
}

# Execute main function
main "$@"