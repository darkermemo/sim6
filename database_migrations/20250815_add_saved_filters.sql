-- Saved filters storage (append-only updates allowed via UPDATE)
CREATE TABLE IF NOT EXISTS saved_filters (
  id String,
  name String,
  tenant_id String,
  root JSON,
  created_at DateTime64(3) DEFAULT now64(3),
  updated_at DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree
ORDER BY (tenant_id, updated_at);


