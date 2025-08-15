export type HealthStatus = "up" | "degraded" | "down";

export type KafkaTopicStat = {
  name: string;
  partitions: number;
  lag_total: number;
  bytes_in_per_sec: number;
  bytes_out_per_sec: number;
};

export type KafkaGroupStat = {
  group: string;
  state: string;
  lag_total: number;
  members: number;
};

export type HealthSummary = {
  overall: HealthStatus;
  ts: string; // ISO time from backend
  pipeline: {
    eps_raw: number;
    eps_parsed: number;
    parse_success_pct: number;
    dlq_eps: number;
    ingest_latency_ms_p50: number;
    ingest_latency_ms_p95: number;
  };
  kafka: {
    ok: boolean;
    brokers: string[];
    topics: Record<string, KafkaTopicStat>;
    consumer_groups: KafkaGroupStat[];
  };
  redis: {
    ok: boolean;
    role: "master" | "replica" | "unknown";
    connected_clients: number;
    ops_per_sec: number;
    used_memory_mb: number;
    maxmemory_mb?: number;
    hit_ratio_pct?: number;
    evictions_per_min?: number;
  };
  clickhouse: {
    ok: boolean;
    version: string;
    inserts_per_sec: number;
    queries_per_sec: number;
    last_event_ts?: string;
    ingest_delay_ms?: number;
    parts?: number;
    merges_in_progress?: number;
    replication_lag_s?: number;
  };
  services: {
    ingestors: { name: string; ok: boolean; eps?: number }[];
    parsers: { name: string; ok: boolean; eps?: number; error_rate_pct?: number }[];
    detectors: { name: string; ok: boolean; alerts_per_min?: number }[];
    sinks: { name: string; ok: boolean }[];
  };
  ui?: { sse_clients?: number; ws_clients?: number };
};

export type HealthDelta = Partial<HealthSummary> & { ts?: string };

export type DiagnoseRequest = {
  component: "clickhouse" | "redis" | "kafka" | "pipeline";
  details?: Record<string, any>;
};

export type DiagnoseResponse = {
  component: string;
  status: HealthStatus;
  issues: string[];
  recommendations: string[];
  execution_id?: string;
};

export type AutoFixRequest = {
  error_id?: string;
  fix_kind?: string;
  dry_run?: boolean;
  details?: Record<string, any>;
};

export type AutoFixResponse = {
  execution_id: string;
  status: "queued" | "running" | "completed" | "failed";
  actions: string[];
  dry_run: boolean;
  estimated_duration_ms?: number;
  risk_level: "low" | "medium" | "high";
};