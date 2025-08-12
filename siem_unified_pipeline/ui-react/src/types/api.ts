// Generated from captured wire files in target/test-artifacts

export interface Health {
  status: string;
  cidr_fn: string;
  ingest_path: string;
  redis: string;
  clickhouse: { ok: boolean; latency_ms: number };
  redis_detail: { ok: boolean };
}

export interface SearchExecuteRequest {
  tenant_id: string;
  time: { last_seconds?: number; from?: number; to?: number };
  q?: string;
}

// Execute response is dynamic JSON rows; keep it as any for table rendering
export type SearchExecuteResponse = any;

export interface SchemaWrap { create_sql: string }

// Derived strictly from live wire_* fixtures and DDL. Do not invent fields.

export interface HealthResponse {
  status: string
  cidr_fn?: string
  ingest_path?: string
  redis?: string
}

// Search execute response (ClickHouse JSON)
export interface SearchExecuteMetaField { name: string; type: string }
export interface SearchExecuteStatistics { bytes_read?: number; rows_read?: number; elapsed?: number }
export interface SearchExecuteData {
  data: Record<string, unknown>[]
  meta: SearchExecuteMetaField[]
  rows: number
  rows_before_limit_at_least?: number
  statistics?: SearchExecuteStatistics
}
export interface SearchExecuteResponse {
  sql: string
  data: SearchExecuteData
  timings_ms: number
}

// Alerts list (from wire_alerts.json)
export interface AlertRow {
  alert_description: string
  alert_id: string
  alert_timestamp: number
  alert_title: string
  created_at: number
  event_refs: string
  rule_id: string
  severity: string
  status: string
  tenant_id: string
  updated_at: number
}
export interface AlertsListResponse { alerts: AlertRow[]; total?: number }

// Admin Parsers list (from wire_parsers_list.json)
export interface ParserAdminRow {
  parser_id: string
  name: string
  version: number
  kind: string
  enabled: number
  updated_at: string
  body: string
}
export interface ParsersListResponse { items: ParserAdminRow[]; next_cursor: string | null }

// Admin Log Sources list (from wire_log_sources_list.json)
export interface LogSourceAdminRow {
  tenant_id: string
  source_id: string
  name: string
  kind: string
  config: string
  enabled: number
  created_at: number
  updated_at: number
}
export interface LogSourcesListResponse { items: LogSourceAdminRow[]; next_cursor: string | null }

// Facets request/response (from v2 search facets handler)
export interface SearchFacetRequest { dsl: unknown; field: string; k?: number }
export interface SearchFacetResponse { sql: string; topk: Array<[string, number]> | Array<{ v: string; c: number }>; timings_ms: number }

// Tenants (used by Admin endpoints)
export interface TenantItem { id: string; name?: string }
export interface TenantsList { tenants: TenantItem[] }
export interface TenantLimits { eps_limit: number; burst_limit: number; retention_days: number }

// Saved searches (used by Search page)
export interface SavedSearchList { items: { tenant_id: string; saved_id: string; name: string; updated_at: string }[]; next_cursor?: string | null }
export interface SavedSearchCreate { ok: boolean; saved_id?: string; created_at?: string; updated_at?: string }
export interface SavedSearchGet { tenant_id: string; saved_id: string; name: string; dsl: unknown; updated_at: string }


