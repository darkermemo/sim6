#!/usr/bin/env bash
set -euo pipefail
ART="${ART_DIR:-$(cd "$(dirname "$0")/.." && pwd)/target/test-artifacts}"
mkdir -p "$ART"

clickhouse client -q "SELECT version() FORMAT PrettyCompact" | tee "$ART/ch_version.txt" >/dev/null

clickhouse client -q "
  SELECT name, engine, storage_policy
  FROM system.tables
  WHERE database='dev' AND name IN ('events','alerts')
  ORDER BY name
  FORMAT PrettyCompact
" | tee "$ART/ch_tables_settings.txt" >/dev/null

clickhouse client -q "
  SELECT name, engine
  FROM system.tables
  WHERE database='dev' AND name LIKE 'idemp%'
  ORDER BY name
  FORMAT PrettyCompact
" | tee "$ART/ch_idemp_tables.txt" >/dev/null

clickhouse client -q "EXISTS TABLE dev.idempotency_keys FORMAT PrettyCompact" | tee "$ART/ch_idemp_exists_table.txt" >/dev/null || true
clickhouse client -q "EXISTS VIEW  dev.idempotency_recent FORMAT PrettyCompact" | tee "$ART/ch_idemp_exists_view.txt"  >/dev/null || true

clickhouse client -q "SHOW CREATE TABLE dev.events" | tee "$ART/show_create_dev_events.sql" >/dev/null
