#!/usr/bin/env bash
set -euo pipefail

# ClickHouse wiring gate - verify schema matches UI/API expectations
ART="target/ch-gate"
mkdir -p "$ART"

CH_HTTP="${CH_HTTP:-http://127.0.0.1:8123}"

echo "== ClickHouse Wiring Gate =="
echo "CH HTTP: $CH_HTTP"

# Test basic connectivity
echo "Testing CH connectivity..."
curl -fsS "$CH_HTTP/ping" > "$ART/ping.txt" || {
    echo "SKIP: ClickHouse not available at $CH_HTTP"
    echo "Set CH_HTTP environment variable if ClickHouse is running elsewhere"
    exit 0
}
echo "✓ CH connectivity OK"

# Check required tables exist
echo "Checking required tables..."
curl -fsS "$CH_HTTP" -d "SHOW TABLES FROM dev" > "$ART/tables.txt"

if ! grep -q "events" "$ART/tables.txt"; then
    echo "FAIL: Required table 'events' not found in 'dev' database"
    echo "Available tables:"
    cat "$ART/tables.txt"
    exit 1
fi
echo "✓ Required tables present"

# Check events table schema
echo "Checking events table schema..."
curl -fsS "$CH_HTTP" -d "DESCRIBE dev.events" > "$ART/events_schema.txt"

# Check for key columns that UI expects  
required_cols=("event_timestamp" "tenant_id" "event_type" "user" "source_ip" "host")
for col in "${required_cols[@]}"; do
    if ! grep -q "$col" "$ART/events_schema.txt"; then
        echo "FAIL: Required column '$col' not found in events table"
        echo "Current schema:"
        cat "$ART/events_schema.txt"
        exit 1
    fi
done
echo "✓ Events schema has required columns"

# Check for TTL (optional but recommended)
echo "Checking TTL configuration..."
curl -fsS "$CH_HTTP" -d "SHOW CREATE TABLE dev.events" > "$ART/events_create.txt"
if grep -q "TTL" "$ART/events_create.txt"; then
    echo "✓ TTL configured on events table"
else
    echo "⚠ No TTL found on events table (recommended for production)"
fi

# Check parts health (detect fragmentation)
echo "Checking parts health..."
curl -fsS "$CH_HTTP" -d "SELECT database, table, count() as parts FROM system.parts WHERE database = 'dev' AND table = 'events' AND active = 1 GROUP BY database, table" > "$ART/parts_count.txt"
parts_count=$(cat "$ART/parts_count.txt" | tail -1 | awk '{print $3}' || echo "0")
if [ "$parts_count" -gt 1000 ]; then
    echo "WARN: High parts count ($parts_count) - consider OPTIMIZE TABLE"
else
    echo "✓ Parts count reasonable ($parts_count)"
fi

# Check recent errors
echo "Checking system errors..."
curl -fsS "$CH_HTTP" -d "SELECT count() FROM system.errors WHERE last_error_time > now() - INTERVAL 1 HOUR" > "$ART/recent_errors.txt"
error_count=$(cat "$ART/recent_errors.txt" | tail -1 || echo "0")
if [ "$error_count" -gt 100 ]; then
    echo "WARN: High error count in last hour ($error_count)"
    curl -fsS "$CH_HTTP" -d "SELECT name, value FROM system.errors WHERE last_error_time > now() - INTERVAL 1 HOUR ORDER BY value DESC LIMIT 5" > "$ART/top_errors.txt"
    echo "Top errors:"
    cat "$ART/top_errors.txt"
else
    echo "✓ Error count acceptable ($error_count)"
fi

echo "ClickHouse wiring gate passed"
echo "Artifacts saved to: $ART/"
