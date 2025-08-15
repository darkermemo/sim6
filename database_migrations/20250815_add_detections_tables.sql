-- Append-only tables for detections MS-5

CREATE TABLE IF NOT EXISTS detections (
  id String,
  name String,
  severity LowCardinality(String),
  owner String,
  tags Array(String),
  enabled UInt8,
  spec JSON,
  created_at DateTime64(3) DEFAULT now64(3),
  updated_at DateTime64(3) DEFAULT now64(3),
  schedule Nullable(JSON)
) ENGINE = MergeTree
ORDER BY (id, updated_at);

CREATE TABLE IF NOT EXISTS detection_runs (
  id String,
  detection_id String,
  started_at DateTime64(3) DEFAULT now64(3),
  finished_at Nullable(DateTime64(3)),
  status LowCardinality(String),
  rows UInt64,
  sample JSON
) ENGINE = MergeTree
ORDER BY (detection_id, started_at);

CREATE TABLE IF NOT EXISTS alerts (
  id String,
  detection_id String,
  occurred_at DateTime64(3) DEFAULT now64(3),
  entity_keys JSON,
  payload JSON
) ENGINE = MergeTree
ORDER BY (detection_id, occurred_at);


