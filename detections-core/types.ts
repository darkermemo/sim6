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

export type RuleSpec =
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
