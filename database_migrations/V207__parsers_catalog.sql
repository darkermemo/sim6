-- Parsers catalog (versioned)
CREATE TABLE IF NOT EXISTS dev.parsers
(
  parser_id String,
  name String,
  version UInt32,
  kind LowCardinality(String),
  body String,
  samples Array(String),
  enabled UInt8 DEFAULT 1,
  created_at UInt32 DEFAULT toUInt32(now()),
  updated_at UInt32 DEFAULT toUInt32(now())
)
ENGINE = MergeTree
ORDER BY (name, version);


