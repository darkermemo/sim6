-- Log Sources admin table
CREATE TABLE IF NOT EXISTS dev.log_sources
(
  tenant_id String,
  source_id String,
  name String,
  kind LowCardinality(String),
  config String,
  enabled UInt8 DEFAULT 1,
  created_at UInt32 DEFAULT toUInt32(now()),
  updated_at UInt32 DEFAULT toUInt32(now())
)
ENGINE = MergeTree
ORDER BY (tenant_id, source_id);


