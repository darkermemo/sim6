-- Investigations
CREATE TABLE IF NOT EXISTS dev.investigations
(
  tenant_id String,
  inv_id String,
  title String,
  created_at DateTime DEFAULT now(),
  updated_at DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (tenant_id, inv_id);

CREATE TABLE IF NOT EXISTS dev.investigation_events
(
  tenant_id String,
  inv_id String,
  item_id String,
  item_type LowCardinality(String),
  body String,
  created_at DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (tenant_id, inv_id, item_id);

-- Saved views used by investigations UI/APIs
CREATE TABLE IF NOT EXISTS dev.saved_views
(
  id String,
  tenant_id String,
  name String,
  dsl String,
  created_by String,
  created_at UInt32 DEFAULT toUInt32(now()),
  updated_at UInt32 DEFAULT toUInt32(now())
)
ENGINE = MergeTree
ORDER BY (tenant_id, id);

-- Investigation notes for a given view
CREATE TABLE IF NOT EXISTS dev.investigation_notes
(
  id String,
  view_id String,
  author String,
  body String,
  created_at UInt32 DEFAULT toUInt32(now())
)
ENGINE = MergeTree
ORDER BY (view_id, id);


