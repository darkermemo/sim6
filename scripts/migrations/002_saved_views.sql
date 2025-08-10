-- Saved Views and Investigation Notes (idempotent)
CREATE TABLE IF NOT EXISTS dev.saved_views
(
  id String,
  tenant_id String,
  name String,
  dsl String,
  created_by String,
  created_at UInt32
)
ENGINE = MergeTree
ORDER BY (tenant_id, id);

CREATE TABLE IF NOT EXISTS dev.investigation_notes
(
  id String,
  view_id String,
  author String,
  body String,
  created_at UInt32
)
ENGINE = MergeTree
ORDER BY (view_id, id);


