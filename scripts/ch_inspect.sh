#!/usr/bin/env bash
set -Eeuo pipefail
ART="target/test-artifacts"
mkdir -p "$ART"

clickhouse client -q "SELECT version()" > "$ART/ch_version.txt" || true

# Table engines + policy (policy may be 'default' or empty; that's OK for gate)
clickhouse client -q "
  SELECT name, engine, storage_policy
  FROM system.tables
  WHERE database='dev' AND name IN ('events','alerts')
  ORDER BY name
  FORMAT PrettyCompact
" > "$ART/ch_tables_settings.txt" || true

# Storage policies may not exist on this build; tolerate empty file.
clickhouse client -q "
  SELECT policy_name
  FROM system.storage_policies
  ORDER BY policy_name
  FORMAT PrettyCompact
" > "$ART/ch_storage_policies.txt" || true

# SHOW CREATE is the portable TTL proof
clickhouse client -q "SHOW CREATE TABLE dev.events" > "$ART/show_create_dev_events.sql" || true