#!/usr/bin/env bash
# backup_restore.sh - Test backup and restore procedures for ClickHouse
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
DDL_DIR="$ART/ddl"
mkdir -p "$ART" "$DDL_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[backup]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[backup]${NC} $1"
}

error() {
    echo -e "${RED}[backup]${NC} $1"
}

# Output files
NOTES="$ART/backup_restore_notes.txt"
COUNTS_BEFORE="$ART/table_counts_before.tsv"
COUNTS_AFTER="$ART/table_counts_after.tsv"

> "$NOTES"

record() {
    echo "$1" | tee -a "$NOTES"
}

# Tables to backup
TABLES=(
    "events"
    "alerts"
    "rule_state"
    "alert_rules"
    "tenants"
    "idempotency_keys"
    "quarantine"
)

# 1. Document backup procedure
record "=== ClickHouse Backup & Restore Test ==="
record "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
record ""

# 2. Export DDL for all tables
record "--- Step 1: Export Table DDL ---"
for table in "${TABLES[@]}"; do
    log "Exporting DDL for dev.$table..."
    clickhouse client -q "SHOW CREATE TABLE dev.$table FORMAT TabSeparatedRaw" > "$DDL_DIR/${table}_create.sql" 2>/dev/null || {
        warn "Table dev.$table does not exist, skipping"
        continue
    }
    record "Exported: ${table}_create.sql"
done

# Export views
log "Exporting views..."
clickhouse client -q "SHOW TABLES FROM dev WHERE engine = 'View' FORMAT TabSeparated" | while read -r view; do
    clickhouse client -q "SHOW CREATE TABLE dev.$view FORMAT TabSeparatedRaw" > "$DDL_DIR/${view}_view.sql" 2>/dev/null || true
    record "Exported view: ${view}_view.sql"
done

# 3. Count records before backup
record ""
record "--- Step 2: Record Table Counts (Before) ---"
echo -e "table\tcount" > "$COUNTS_BEFORE"

for table in "${TABLES[@]}"; do
    COUNT=$(clickhouse client -q "SELECT count() FROM dev.$table FORMAT TabSeparated" 2>/dev/null || echo "0")
    echo -e "$table\t$COUNT" >> "$COUNTS_BEFORE"
    record "dev.$table: $COUNT rows"
done

# 4. Create test data and backup alerts table (small table for demo)
record ""
record "--- Step 3: Backup alerts Table (Demo) ---"

# Insert a few test alerts if table is empty
ALERT_COUNT=$(clickhouse client -q "SELECT count() FROM dev.alerts FORMAT TabSeparated" 2>/dev/null || echo "0")
if [ "$ALERT_COUNT" -eq "0" ]; then
    log "Inserting test alerts..."
    clickhouse client -q "
    INSERT INTO dev.alerts (id, tenant_id, rule_id, rule_name, severity, alert_timestamp, message)
    VALUES 
        (generateUUIDv4(), 'test', 'rule1', 'Test Rule 1', 'HIGH', now(), 'Backup test alert 1'),
        (generateUUIDv4(), 'test', 'rule2', 'Test Rule 2', 'MEDIUM', now(), 'Backup test alert 2')
    " 2>/dev/null || warn "Failed to insert test alerts"
fi

# Export alerts to Parquet
log "Exporting alerts to Parquet..."
clickhouse client -q "
SELECT * FROM dev.alerts 
ORDER BY alert_timestamp DESC 
LIMIT 1000
INTO OUTFILE '$ART/alerts_backup.parquet' 
FORMAT Parquet
" 2>/dev/null || {
    # Fallback to JSON if Parquet fails
    warn "Parquet export failed, using JSON"
    clickhouse client -q "
    SELECT * FROM dev.alerts 
    ORDER BY alert_timestamp DESC 
    LIMIT 1000
    FORMAT JSONEachRow
    " > "$ART/alerts_backup.json"
}

record "Backed up alerts to: alerts_backup.parquet (or .json)"

# 5. Drop and recreate alerts table
record ""
record "--- Step 4: Drop and Recreate Table ---"
log "Dropping dev.alerts..."
clickhouse client -q "DROP TABLE IF EXISTS dev.alerts" || error "Failed to drop table"

log "Recreating dev.alerts from DDL..."
if [ -f "$DDL_DIR/alerts_create.sql" ]; then
    clickhouse client < "$DDL_DIR/alerts_create.sql" || error "Failed to recreate table"
    record "Table recreated from DDL"
else
    error "DDL file not found"
    exit 1
fi

# 6. Restore data
record ""
record "--- Step 5: Restore Data ---"
if [ -f "$ART/alerts_backup.parquet" ]; then
    log "Restoring from Parquet..."
    clickhouse client -q "
    INSERT INTO dev.alerts 
    SELECT * FROM file('$ART/alerts_backup.parquet', 'Parquet')
    " || {
        error "Parquet restore failed"
        exit 1
    }
elif [ -f "$ART/alerts_backup.json" ]; then
    log "Restoring from JSON..."
    clickhouse client -q "
    INSERT INTO dev.alerts FORMAT JSONEachRow
    " < "$ART/alerts_backup.json" || {
        error "JSON restore failed"
        exit 1
    }
else
    error "No backup file found"
    exit 1
fi

record "Data restored"

# 7. Count records after restore
record ""
record "--- Step 6: Verify Restore ---"
echo -e "table\tcount" > "$COUNTS_AFTER"

for table in "${TABLES[@]}"; do
    COUNT=$(clickhouse client -q "SELECT count() FROM dev.$table FORMAT TabSeparated" 2>/dev/null || echo "0")
    echo -e "$table\t$COUNT" >> "$COUNTS_AFTER"
done

# Compare counts
ALERTS_BEFORE=$(grep "^alerts" "$COUNTS_BEFORE" | cut -f2)
ALERTS_AFTER=$(grep "^alerts" "$COUNTS_AFTER" | cut -f2)

record ""
record "Alerts count before: $ALERTS_BEFORE"
record "Alerts count after: $ALERTS_AFTER"

if [ "$ALERTS_BEFORE" = "$ALERTS_AFTER" ]; then
    record "✓ Count matches - restore successful"
else
    record "✗ Count mismatch - restore may have failed"
fi

# 8. Additional backup methods documentation
record ""
record "--- Additional Backup Methods ---"
record ""
record "1. Native ClickHouse BACKUP (if available):"
record "   BACKUP TABLE dev.events TO Disk('backups', 'events_backup')"
record ""
record "2. clickhouse-backup tool:"
record "   clickhouse-backup create --tables=dev.events"
record "   clickhouse-backup upload"
record ""
record "3. Partition-based backup:"
record "   ALTER TABLE dev.events FREEZE PARTITION '2024-01-01'"
record "   rsync -av /var/lib/clickhouse/shadow/ /backup/location/"
record ""
record "4. Logical dump (small tables):"
record "   clickhouse client -q 'SELECT * FROM dev.table FORMAT Native' > table.native"
record ""
record "5. S3 backup (if using S3 storage):"
record "   ALTER TABLE dev.events MOVE PARTITION '2024-01-01' TO DISK 's3_backup'"
record ""

# Summary
record ""
record "=== Summary ==="
if [ "$ALERTS_BEFORE" = "$ALERTS_AFTER" ] && [ -f "$DDL_DIR/alerts_create.sql" ]; then
    record "RESULT: PASS"
    record "- DDL exported successfully"
    record "- Table dropped and recreated"
    record "- Data backup and restore verified"
    record "- Row counts match"
else
    record "RESULT: FAIL"
    [ "$ALERTS_BEFORE" != "$ALERTS_AFTER" ] && record "- Row count mismatch"
    [ ! -f "$DDL_DIR/alerts_create.sql" ] && record "- DDL export failed"
fi

log "Backup/restore test complete. Results in:"
log "  - $NOTES"
log "  - $COUNTS_BEFORE"
log "  - $COUNTS_AFTER"
