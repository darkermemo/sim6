// Rust backend v2 → TS types (exact field names preserved where applicable)

export interface TimeRange {
  last_seconds?: number;
  from?: number;
  to?: number;
}

export interface ExecuteEnvelope {
  sql: string;
  took_ms: number;
  data: ClickHouseEnvelope;
}

export interface ClickHouseEnvelope {
  meta: Array<{ name: string; type: string }>;
  data: Record<string, unknown>[];
  rows: number;
  rows_before_limit_at_least?: number;
  statistics?: { elapsed: number; rows_read: number; bytes_read: number };
}

export interface AggsEnvelope {
  aggs: {
    by_severity: Array<Record<string, unknown>>;
    timeline: Array<{ ts: string | number; c?: number; count?: number }>;
    by_outcome: Array<Record<string, unknown>>;
    top_sources: Array<Record<string, unknown>>;
  };
}

export interface ExecuteRequestBody {
  tenant_id: string;
  time: TimeRange;
  q: string;
  limit?: number;
  sort?: Array<{ field: string; dir: "asc" | "desc" }>;
}

export interface AggsRequestBody {
  tenant_id: string;
  time: TimeRange;
  q: string;
}


