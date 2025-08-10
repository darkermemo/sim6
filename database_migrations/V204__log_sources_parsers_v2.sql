-- V2 tables to avoid conflicts with existing schemas
CREATE TABLE IF NOT EXISTS dev.log_sources_v2
(
  source_id String,
  tenant_id String,
  vendor String,
  product String,
  source_type LowCardinality(String),
  transport LowCardinality(String),
  input_endpoint String,
  parser_id Nullable(String),
  enabled UInt8,
  eps UInt32,
  error_rate Float64,
  last_seen UInt32,
  created_at UInt32,
  updated_at UInt32,
  config_json String
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, source_id);

CREATE TABLE IF NOT EXISTS dev.parsers_v2
(
  parser_id String,
  vendor String,
  product String,
  version UInt32,
  strategy LowCardinality(String),
  pattern String,
  test_examples Array(String),
  cim_map_json String,
  enabled UInt8,
  created_at UInt32,
  updated_at UInt32
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (vendor, product, parser_id);

CREATE TABLE IF NOT EXISTS dev.parser_tests_v2
(
  test_id String,
  parser_id String,
  sample String,
  result_json String,
  pass UInt8,
  created_at UInt32
) ENGINE = MergeTree
ORDER BY (parser_id, test_id);

CREATE TABLE IF NOT EXISTS dev.cim_field_coverage_v2
(
  source_id String,
  parser_id String,
  run_ts UInt32,
  total_samples UInt32,
  parsed_ok UInt32,
  coverage Float64,
  missing_fields Array(String),
  warnings Array(String),
  updated_at UInt32
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (source_id, run_ts);


