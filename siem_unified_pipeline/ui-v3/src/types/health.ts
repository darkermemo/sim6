// Frontend health types matching backend Rust structs

export type OverallStatus = 'up' | 'degraded' | 'down';

export interface HealthSummary {
  ts: string;
  overall: OverallStatus;
  errors: number;
  pipeline: PipelineMetrics;
  kafka: KafkaMetrics;
  redis: RedisMetrics;
  clickhouse: ClickHouseMetrics;
  services: ServiceMetrics;
  ui: UiMetrics;
}

export interface PipelineMetrics {
  eps_raw: number;
  eps_parsed: number;
  parse_success_pct: number;
  dlq_eps: number;
  ingest_latency_ms_p50: number;
  ingest_latency_ms_p95: number;
}

export interface KafkaMetrics {
  ok: boolean;
  brokers: string[];
  topics: Record<string, TopicMetrics>;
  consumer_groups: ConsumerGroupMetrics[];
  bytes_in_sec: number;
  bytes_out_sec: number;
}

export interface TopicMetrics {
  ok: boolean;
  partitions: number;
}

export interface ConsumerGroupMetrics {
  group: string;
  lag: number;
  tps: number;
  ok: boolean;
}

export interface RedisMetrics {
  ok: boolean;
  role: string;
  connected_clients: number;
  ops_per_sec: number;
  used_memory_mb: number;
  maxmemory_mb: number;
  hit_ratio_pct: number;
  evictions_per_min: number;
}

export interface ClickHouseMetrics {
  ok: boolean;
  version: string;
  inserts_per_sec: number;
  queries_per_sec: number;
  last_event_ts: string | null;
  ingest_delay_ms: number;
  parts: number;
  merges_in_progress: number;
  replication_lag_s: number;
}

export interface ServiceMetrics {
  ingestors: ServiceInfo[];
  parsers: ServiceInfo[];
  detectors: ServiceInfo[];
  sinks: ServiceInfo[];
}

export interface ServiceInfo {
  name: string;
  ok: boolean;
  rps?: number;
  parse_eps?: number;
  error_eps?: number;
  alerts_per_min?: number;
  rules_loaded?: number;
  batch_ms?: number;
  ok_batches_pct?: number;
}

export interface UiMetrics {
  sse_clients: number;
  ws_clients: number;
}

// Diagnostic types
export interface DiagnoseRequest {
  component: string;
}

export interface DiagnoseResponse {
  component: string;
  status: string;
  details: any;
  issues: HealthIssue[];
  recommendations: string[];
}

export interface HealthIssue {
  severity: string;
  description: string;
  playbook?: string;
  auto_fixable: boolean;
}

// Auto-fix types
export interface AutoFixRequest {
  kind: string;
  params: any;
  confirm?: boolean;
}

export interface AutoFixResponse {
  success: boolean;
  message: string;
  actions_taken: string[];
  dry_run: boolean;
}

// SSE delta updates
export interface HealthDelta {
  ts: string;
  pipeline?: PipelineMetrics;
  kafka?: KafkaMetrics;
  redis?: RedisMetrics;
  clickhouse?: ClickHouseMetrics;
  services?: ServiceMetrics;
  errors?: number;
  overall?: OverallStatus;
}
