### UI Wiring Catalog (Authoritative)

Base URL: http://127.0.0.1:9999. No invented fields. Time units: events DateTime64(3); alerts UInt32 seconds.

Entities (ClickHouse):
- dev.events (SHOW CREATE):
  - tenant_id LowCardinality(String)
  - event_timestamp DateTime64(3)
  - event_id String
  - source_ip String; destination_ip Nullable(String)
  - source_port Nullable(UInt16); destination_port Nullable(UInt16); protocol Nullable(String)
  - event_type LowCardinality(String); severity LowCardinality(String)
  - message String; raw_log String; parsed_fields Map(String,String)
  - created_at DateTime64(3)
  - source_type, event_category, event_outcome, event_action LowCardinality(String)
  - log_source_id String; parsing_status Enum8('ok'|'partial'|'failed'); parse_error_msg Nullable(String)
  - retention_days UInt16; event_dt DateTime; ORDER BY (tenant_id,event_timestamp,event_id)
- dev.alerts: alert_id, tenant_id, rule_id, alert_title, alert_description, event_refs (JSON), severity, status, alert_timestamp UInt32, created_at UInt32, updated_at UInt32
- dev.alert_rules (SHOW CREATE highlights): rule_id, id, tenant_scope, rule_name, name, kql_query, severity, enabled, mode, stream_window_sec, description, created_at DateTime, updated_at DateTime, source_format, original_rule, mapping_profile, tags Array(String), dsl, compiled_sql, schedule_sec, throttle_seconds, dedup_key, entity_keys, lifecycle, INDEX idx_rule_id
- dev.rule_state: rule_id, tenant_id, last_run_ts UInt32, last_success_ts UInt32, last_error, last_sql, dedup_hash, last_alert_ts UInt32, updated_at UInt32
- dev.parsers_admin: parser_id, name, version, kind, body, samples Array(String), enabled, created_at UInt32, updated_at UInt32
- dev.log_sources_admin: tenant_id, source_id, name, kind, config, enabled, created_at UInt32, updated_at UInt32

API (selected):
- GET /api/v2/health -> { status, cidr_fn?, ingest_path?, redis? }
- POST /api/v2/search/compile -> { sql, where_sql, warnings }
- POST /api/v2/search/execute (body: { dsl }) -> { sql, data{ data[], meta[{name,type}], rows, statistics? }, timings_ms }
- GET /api/v2/alerts?limit=50 -> { alerts: AlertRow[] }
- Saved Searches: list/create/get/delete under /api/v2/search/saved (requires tenant_id)

Wiring matrix:
- Dashboard → health, metrics, metrics/quick
- Search → search/compile, search/execute, search/facets (tenant_id, time, q, limit)
- Alerts → alerts (limit)
- Admin Tenants → tenants, tenants/:id/limits
- Log Sources → admin/log-sources CRUD
- Parsers → admin/parsers CRUD
- Rules → alert_rules CRUD

Guardrails: MAX_ROWS 10000, QUERY_TIMEOUT 8s; UI enforces ranges and limits. Metrics names used: siem_v2_ingest_total, siem_v2_rate_limit_total, siem_v2_rules_run_total, siem_v2_alerts_written_total, siem_v2_stream_enqueue_total, siem_v2_stream_ack_total, siem_v2_stream_eval_errors_total, siem_v2_stream_lag_ms.

## Authoritative artifacts (captured from live system)

- Base URL: `http://127.0.0.1:9999`
- ClickHouse DB: `dev`

### DDL snapshots
- `target/test-artifacts/wire_schema_events.sql`
- `target/test-artifacts/wire_schema_alerts.sql`
- `target/test-artifacts/wire_schema_alert_rules.sql`
- `target/test-artifacts/wire_schema_rule_state.sql`
- `target/test-artifacts/wire_schema_parsers_admin.sql`
- `target/test-artifacts/wire_schema_log_sources_admin.sql`

### API samples
- Health: `target/test-artifacts/wire_health.json`
- Search compile: `target/test-artifacts/wire_search_compile.json`
- Search execute: `target/test-artifacts/wire_search_execute.json`
- Alerts list: `target/test-artifacts/wire_alerts.json`
- Admin parsers list: `target/test-artifacts/wire_parsers_list.json`
- Admin log-sources list: `target/test-artifacts/wire_log_sources_list.json`
- Metrics (raw): `target/test-artifacts/wire_metrics.txt`
- Metrics (keys used): `target/test-artifacts/wire_metrics_keys.txt`

### Guardrails & limits (enforced)
- MAX_ROWS: 10000
- MAX_RANGE: 7d
- QUERY_TIMEOUT: 8s
- Metrics used by stat cards: `siem_v2_ingest_total`, `siem_v2_rate_limit_total`, `siem_v2_rules_run_total`, `siem_v2_alerts_written_total`, `siem_v2_stream_enqueue_total`, `siem_v2_stream_ack_total`, `siem_v2_stream_eval_errors_total`, `siem_v2_stream_lag_ms`

### Page → API wiring (React)
- Dashboard → `/api/v2/health`, `/metrics`, `/api/v2/metrics/quick`
- Search → `/api/v2/search/compile`, `/api/v2/search/execute`, `/api/v2/search/facets`
- Alerts → `/api/v2/alerts?limit=`
- Admin Tenants → `/api/v2/admin/tenants`, `/api/v2/admin/tenants/:id/limits`
- Admin Log Sources → `/api/v2/admin/log-sources` CRUD
- Admin Parsers → `/api/v2/admin/parsers` CRUD
- Rules → `/api/v2/alert_rules`, `/api/v2/rules/:id` CRUD


