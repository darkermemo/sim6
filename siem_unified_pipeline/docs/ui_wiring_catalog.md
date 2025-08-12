### UI Wiring Catalog (Authoritative) – generated from captured wire files

Sources: `siem_unified_pipeline/target/test-artifacts`

- Health (GET /health)
  - Type: `Health` (status, cidr_fn, ingest_path, redis, clickhouse.ok/latency_ms, redis_detail.ok)

- Metrics (GET /metrics)
  - Prometheus text (parse client-side as needed)

- Search Execute (POST /api/v2/search/execute)
  - Request: `SearchExecuteRequest` { tenant_id, time { last_seconds | from+to }, q? }
  - Response: JSON rows (schema varies per query)

- Schemas (ClickHouse SHOW CREATE)
  - `events`, `alerts`, `alert_rules`, `rule_state`, `parsers_admin`, `log_sources_admin` → `SchemaWrap` { create_sql }

- Admin Parsers (GET /api/v2/admin/parsers)
  - Current capture returned error (ClickHouse down or auth); UI must handle non-200 and show inline error.

- Admin Log Sources (GET /api/v2/admin/log-sources)
  - Current capture expects `tenant_id`; UI must include tenant context; handle 4xx gracefully.

Contract rules:
- UI must not reference fields beyond what the types above define.
- Inline error surfaces for 4xx/5xx.
- All fetches with 8s timeout and abort.


