export type TimeCtrl = { last_seconds?: number; from?: string; to?: string };

export type FieldOp = '='|'!='|'<'|'<='|'>'|'>='|'in'|'not in'|'contains'|'regex';

export type FieldConditionBlock = {
  kind: 'field';
  field: string;
  op: FieldOp;
  value?: string | number | boolean | Array<string|number|boolean>;
};

export type SequenceStage = { conditions: FieldConditionBlock[]; repeat_min?: number };
export type SequenceBlock = {
  kind: 'sequence';
  stages: SequenceStage[];
  window_sec: number;
  strict_once?: boolean;
  by: string[];
};

export type RollingBlock = {
  kind: 'rolling';
  source?: string; // optional MV name
  metric: string;  // logical metric name
  func: 'sum'|'count'|'avg';
  op: '>'|'<'|'='|'>='|'<=';
  value: number;
  window_sec: number;
  by: string[];
};

export type RatioBlock = {
  kind: 'ratio';
  numerator: string;    // logical metric expr
  denominator: string;  // logical metric expr
  op: '>'|'<'|'='|'>='|'<=';
  k: number;
  bucket_sec: number;
  by: string[];
};

export type SpikeBlock = {
  kind: 'spike';
  metric: string;
  window_sec: number;
  history_buckets: number;
  z: number;
  by: string[];
};

export type FirstSeenBlock = {
  kind: 'first_seen';
  dimension: string;
  horizon_days: number;
  by?: string[];
};

export type Block = FieldConditionBlock | SequenceBlock | RollingBlock | RatioBlock | SpikeBlock | FirstSeenBlock;


