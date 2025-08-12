#!/usr/bin/env bash
set -Eeuo pipefail
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
DB="${CLICKHOUSE_DATABASE:-dev}"
post(){ curl -sS "$CLICKHOUSE_URL/" --data-binary "$1" >/dev/null; }
post "CREATE DATABASE IF NOT EXISTS $DB"
post "CREATE TABLE IF NOT EXISTS $DB.parsers_admin (parser_id String, name String, version UInt32, kind LowCardinality(String), body String, samples Array(String), enabled UInt8 DEFAULT 1, created_at UInt32 DEFAULT toUInt32(now()), updated_at UInt32 DEFAULT toUInt32(now())) ENGINE=MergeTree ORDER BY (name, version)"
post "CREATE TABLE IF NOT EXISTS $DB.log_sources_admin (tenant_id String, source_id String, name String, kind LowCardinality(String), config String, enabled UInt8 DEFAULT 1, created_at UInt32 DEFAULT toUInt32(now()), updated_at UInt32 DEFAULT toUInt32(now())) ENGINE=MergeTree ORDER BY (tenant_id, source_id)"
post "CREATE TABLE IF NOT EXISTS $DB.api_keys (tenant_id String, key_id String, name String, token_hash String, scopes String, enabled UInt8 DEFAULT 1, created_at UInt32 DEFAULT toUInt32(now()), updated_at UInt32 DEFAULT toUInt32(now()), last_used_at UInt32 DEFAULT 0) ENGINE=MergeTree ORDER BY (tenant_id, key_id)"
post "CREATE TABLE IF NOT EXISTS $DB.saved_views (id String, tenant_id String, name String, dsl String, created_by String, created_at UInt32 DEFAULT toUInt32(now()), updated_at UInt32 DEFAULT toUInt32(now())) ENGINE=MergeTree ORDER BY (tenant_id, id)"
post "CREATE TABLE IF NOT EXISTS $DB.investigation_notes (id String, view_id String, author String, body String, created_at UInt32 DEFAULT toUInt32(now())) ENGINE=MergeTree ORDER BY (view_id, id)"
echo "ClickHouse bootstrap complete"

