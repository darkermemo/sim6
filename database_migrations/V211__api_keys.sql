-- API Keys for ingest/admin
CREATE TABLE IF NOT EXISTS dev.api_keys
(
  tenant_id String,
  key_id String,
  name String,
  token_hash String,
  scopes String, -- JSON array string
  enabled UInt8 DEFAULT 1,
  created_at UInt32 DEFAULT toUInt32(now()),
  updated_at UInt32 DEFAULT toUInt32(now()),
  last_used_at UInt32 DEFAULT 0
)
ENGINE = MergeTree
ORDER BY (tenant_id, key_id);


