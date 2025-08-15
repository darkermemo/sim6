/**
 * World-class SIEM detection types for ClickHouse-powered analytics
 * Maps rule specifications to proven ClickHouse functions (windowFunnel, aggregations)
 */

export type Cond = { sql: string }; // emitted from UI filter builder (already ClickHouse-safe)

export type SeqMode = 'strict'|'strict_once'|'default';

export type RuleBase = {
  tenant_id: string;
  time: { from?: string; to?: string; last_seconds?: number };
  by: string[];              // e.g. ["user","src_ip"]
  emit?: { limit?: number }; // default 1000
};

export type SequenceRule = RuleBase & {
  type: 'sequence';
  window_sec: number;
  strict?: SeqMode;
  stages: Array<{ cond: Cond; repeat_min?: number }>;
};

export type AbsenceRule = RuleBase & {
  type: 'sequence_absence';
  window_sec: number;
  a: Cond; b: Cond;          // "A THEN NOT B within T"
};

export type ChainRule = RuleBase & {
  type: 'chain';
  window_sec: number;
  stages: Cond[];            // A→B→C ordered
};

export type RollingRule = RuleBase & {
  type: 'rolling_threshold';
  window_sec: number;
  expr: string;              // e.g. "sum(fails_5m) > 100"
  source?: 'raw'|'minute';   // prefer minute agg if you have it
};

export type RatioRule = RuleBase & {
  type: 'ratio';
  numerator: Cond;
  denominator: Cond;
  bucket_sec: number;        // e.g. 600
  ratio_gt: number;          // e.g. 20
};

export type FirstSeenRule = RuleBase & {
  type: 'first_seen';
  entity: string;            // e.g. "src_geo"
  horizon_days: number;      // e.g. 180
  within?: Cond;             // e.g. success logins
};

export type BeaconRule = RuleBase & {
  type: 'beaconing';
  partition: string[];       // e.g. ["src_ip","dest_ip"]
  min_events: number;        // e.g. 20
  rsd_lt: number;            // e.g. 0.2
  where?: Cond;
};

// NEW CHUNK 1: Advanced Detection Families
export type SqlExpr = { sql: string };

export type RuleSpecBase = {
  tenant_id: string;
  time: { last_seconds?: number; from?: string; to?: string };
  by?: string[];
  emit?: { limit?: number };
};

export type SpikeRule = RuleSpecBase & {
  type: 'spike';
  metric: SqlExpr;           // metric over raw rows (e.g., "event_type='auth' AND outcome='fail'")
  bucket_sec: number;        // e.g., 300 (5 minutes)
  hist_buckets: number;      // e.g., 288 (24h of 5m buckets)
  z: number;                 // e.g., 3 (z-score threshold)
};

export type SpreadRule = RuleSpecBase & {
  type: 'spread';
  target: string;            // column to distinct-count (e.g., 'user' or 'host')
  where?: SqlExpr;           // optional filter
  window_sec: number;        // e.g., 600 (10 minutes)
  min_distinct: number;      // e.g., 20 (minimum distinct count)
};

export type PeerOutlierRule = RuleSpecBase & {
  type: 'peer_out';
  kpi: SqlExpr;              // numeric expr per bucket (e.g., "event_type='download'")
  bucket_sec: number;        // bucket size (e.g., 3600)
  peer_label_field: string;  // field that defines peer group (e.g., "event_type" or "host")
  p: number;                 // percentile threshold (0< p <1), e.g., 0.95
};

// CHUNK 2: Advanced Behavioral Detection Families
export type TimeRange = { last_seconds?: number; from?: string; to?: string };

export type BurstRule = RuleSpecBase & {
  type: 'burst';
  where?: SqlExpr;          // e.g., "event_type='proc' AND host='x'"
  bucket_fast_sec: number;  // e.g., 120
  bucket_slow_sec: number;  // e.g., 600
  ratio_gt: number;         // e.g., 10
};

export type TimeOfDayRule = RuleSpecBase & {
  type: 'time_of_day';
  where?: SqlExpr;          // narrow to auth/download/etc.
  hour_start: number;       // 0..23 inclusive
  hour_end: number;         // 0..23 inclusive (inclusive range)
  bucket_sec: number;       // e.g., 3600
  hist_buckets: number;     // e.g., 24*30 for ~30d hourly baseline
  z: number;                // e.g., 3
};

export type TravelRule = RuleSpecBase & {
  type: 'travel';
  by: string[];             // must include user-like key
  countries_only?: boolean; // default true
  max_interval_sec: number; // e.g., 3600
  // speed mode (requires geo lat/lon dicts); if set, uses km/h test
  speed_kmh_gt?: number;
  src_ip_field?: string;    // default 'src_ip'
};

export type LexRule = RuleSpecBase & {
  type: 'lex';
  field: string;            // e.g., 'dns_qname' | 'cmdline'
  min_len?: number;         // e.g., 30
  score_sql?: SqlExpr;      // optional custom heuristic expr returning Float64
  score_gt?: number;        // threshold on score_sql when provided
  where?: SqlExpr;
};

export type RuleSpec =
  | BurstRule | TimeOfDayRule | TravelRule | LexRule
  | SpikeRule | SpreadRule | PeerOutlierRule
  | SequenceRule | AbsenceRule | ChainRule
  | RollingRule | RatioRule | FirstSeenRule | BeaconRule;

// Detection result types
export type DetectionHit = {
  entity_keys: Record<string, any>;
  first_ts?: string;
  last_ts?: string;
  bucket?: string;
  metadata?: Record<string, any>;
};

export type DetectionResult = {
  sql: string;
  hits: DetectionHit[];
  execution_time_ms?: number;
  total_hits: number;
};

export type DetectionTestResult = {
  ok: boolean;
  rows_count: number;
  sample: DetectionHit[];
  sql: string;
  validation_errors?: string[];
};
