-- Saved searches table
CREATE TABLE IF NOT EXISTS dev.saved_searches
(
  tenant_id String,
  saved_id String,
  name String,
  dsl String,
  created_at DateTime DEFAULT now(),
  updated_at DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (tenant_id, saved_id);


