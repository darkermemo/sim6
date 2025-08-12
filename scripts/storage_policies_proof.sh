#!/usr/bin/env bash
set -Eeuo pipefail

# storage_policies_proof.sh - Verify storage policy and TTL movement to 'cold'
# Outputs artifacts to target/test-artifacts/

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ART_DIR="$ROOT_DIR/target/test-artifacts"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
DB="${CLICKHOUSE_DATABASE:-dev}"
mkdir -p "$ART_DIR"

run_sql() {
  local sql="$1"
  curl -sS "$CLICKHOUSE_URL/" --data-binary "$sql"
}

note() { echo "[proof] $*"; }

# Version
note "ClickHouse version"
run_sql "SELECT version() AS version" > "$ART_DIR/ch_version.txt"

# Storage policies and volumes
note "Dump storage policies"
run_sql "SELECT name, policy_name, volumes FROM system.storage_policies FORMAT Pretty" > "$ART_DIR/ch_storage_policies.txt" || true
note "Dump volumes"
run_sql "SELECT name, type, volume_name FROM system.volumes FORMAT Pretty" > "$ART_DIR/ch_volumes.txt" || true
note "Dump table settings for events/alerts"
run_sql "SELECT name, engine, storage_policy FROM system.tables WHERE database='${DB}' AND name IN ('events','alerts') FORMAT Pretty" > "$ART_DIR/ch_tables_settings.txt" || true

# TTL probe (local, safe)
note "Create TTL probe table"
run_sql "DROP TABLE IF EXISTS ${DB}.ttl_probe" >/dev/null || true
run_sql "CREATE TABLE ${DB}.ttl_probe (tenant_id UInt64, ts DateTime64(3), payload String) ENGINE=MergeTree ORDER BY (tenant_id, ts) TTL ts + INTERVAL 30 SECOND TO VOLUME 'cold' SETTINGS storage_policy='siem_policy'" >/dev/null

# Insert past/future rows
note "Insert probe rows"
run_sql "INSERT INTO ${DB}.ttl_probe SELECT number AS tenant_id, now64(3)-toIntervalSecond(40) AS ts, 'old' FROM numbers(50)" >/dev/null
run_sql "INSERT INTO ${DB}.ttl_probe SELECT number AS tenant_id, now64(3)+toIntervalSecond(5)  AS ts, 'new' FROM numbers(50)" >/dev/null

# Before snapshot
note "Before snapshot"
run_sql "SELECT count() AS rows, min(ts) AS min_ts, max(ts) AS max_ts FROM ${DB}.ttl_probe FORMAT Pretty" > "$ART_DIR/ttl_probe_before.tsv"
run_sql "SELECT table, name, rows, disk_name, volume_name, min_ttl, max_ttl FROM system.parts WHERE database='${DB}' AND table='ttl_probe' AND active ORDER BY name FORMAT JSONEachRow" > "$ART_DIR/ttl_probe_parts_before.json" || true

# Wait for TTL and force moves
note "Waiting 45s for TTL to mature..."
sleep 45
note "Materialize TTL"
run_sql "ALTER TABLE ${DB}.ttl_probe MATERIALIZE TTL" >/dev/null || true

# After snapshot
note "After snapshot"
run_sql "SELECT count() AS rows, min(ts) AS min_ts, max(ts) AS max_ts FROM ${DB}.ttl_probe FORMAT Pretty" > "$ART_DIR/ttl_probe_after.tsv"
run_sql "SELECT table, name, rows, disk_name, volume_name, min_ttl, max_ttl FROM system.parts WHERE database='${DB}' AND table='ttl_probe' AND active ORDER BY name FORMAT JSONEachRow" > "$ART_DIR/ttl_probe_parts_after.json" || true

note "Part log evidence"
run_sql "SELECT event_type, source_disk, destination_disk, reason, part_name, table, event_time FROM system.part_log WHERE database='${DB}' AND table='ttl_probe' AND event_time >= now()-INTERVAL 5 MINUTE ORDER BY event_time FORMAT JSONEachRow" > "$ART_DIR/ttl_probe_part_log.json" || true

# Summary
note "Summarize observation"
{
  echo "Storage policy proof summary"
  echo "CH Version:"; cat "$ART_DIR/ch_version.txt" || true
  echo "Tables settings:"; sed -n '1,80p' "$ART_DIR/ch_tables_settings.txt" || true
  echo "Before (rows):"; sed -n '1,80p' "$ART_DIR/ttl_probe_before.tsv"
  echo "After (rows):"; sed -n '1,80p' "$ART_DIR/ttl_probe_after.tsv"
  echo "Parts before (json sample):"; sed -n '1,10p' "$ART_DIR/ttl_probe_parts_before.json" || true
  echo "Parts after  (json sample):"; sed -n '1,10p' "$ART_DIR/ttl_probe_parts_after.json" || true
  echo "Part log (json sample):"; sed -n '1,10p' "$ART_DIR/ttl_probe_part_log.json" || true
} > "$ART_DIR/verify_notes.txt"

note "Artifacts written to $ART_DIR"

