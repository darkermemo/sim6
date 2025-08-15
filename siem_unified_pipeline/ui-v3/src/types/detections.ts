// Core detection types for M4 Patterns

export type TimeRange = { last_seconds?: number; from?: string; to?: string };

export type SqlCond = { sql: string };

export type BaseSpec = {
  tenant_id: string;
  time: TimeRange;
  by?: string[];
  emit?: { limit?: number };
};

export type SequenceRule = BaseSpec & {
  type: 'sequence';
  window_sec: number;
  strict?: 'strict_once'|'strict_order'|'any';
  stages: Array<{ cond: SqlCond; repeat_min?: number }>;
};

export type AbsenceRule = BaseSpec & {
  type: 'sequence_absence';
  window_sec: number;
  a: SqlCond; b: SqlCond;
};

export type ChainRule = BaseSpec & {
  type: 'chain';
  window_sec: number;
  stages: SqlCond[];
};

export type RollingRule = BaseSpec & {
  type: 'rolling_threshold';
  window_sec: number;            // sliding window
  expr: string;                  // expression on "rolling"
};

export type RatioRule = BaseSpec & {
  type: 'ratio';
  bucket_sec: number;
  numerator: SqlCond;
  denominator: SqlCond;
  ratio_gt: number;
};

export type FirstSeenRule = BaseSpec & {
  type: 'first_seen';
  entity: string;                // field name
  horizon_days: number;
  within?: SqlCond;              // optional filter
};

export type BeaconRule = BaseSpec & {
  type: 'beaconing';
  partition: string[];           // e.g., ['src_ip','dest_ip']
  where?: SqlCond;
  min_events: number;
  rsd_lt: number;                // stddev/avg of inter-arrival
};

export type RuleSpec =
  | SequenceRule | AbsenceRule | ChainRule
  | RollingRule  | RatioRule   | FirstSeenRule | BeaconRule;

// API contracts
export type CompileReq = { source: 'filters'|'pattern'; spec: RuleSpec; tenant_id: string; time: TimeRange };
export type CompileRes = { sql: string; est_cost?: number };

export type PreviewReq = CompileReq & { limit?: number };
export type PreviewRes = {
  compiled_sql: string;
  total: number;
  rows: Record<string, unknown>[];
  sample?: Record<string, unknown>;
};

export type DetectionRecord = {
  id: string; name: string; severity: 'low'|'medium'|'high'|'critical';
  spec: RuleSpec; owner: string; tags?: string[]; enabled: boolean;
  created_at: string; updated_at: string; schedule?: { cron: string; enabled: boolean };
};

export type CreateDetectionReq = Omit<DetectionRecord, 'id'|'created_at'|'updated_at'>;
export type CreateDetectionRes = DetectionRecord;
export type UpdateDetectionReq = Partial<CreateDetectionReq>;
export type ListDetectionsRes = { items: DetectionRecord[] };
export type RunOnceRes = { ok: boolean; started_at: string; job_id: string };
export type ScheduleReq = { cron: string; enabled: boolean };


