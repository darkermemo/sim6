-- Tenants and Limits tables (idempotent)
CREATE TABLE IF NOT EXISTS dev.tenants
(
  tenant_id String,
  name String,
  status LowCardinality(String) DEFAULT 'ACTIVE',
  retention_days UInt16 DEFAULT 30,
  eps_quota UInt32 DEFAULT 50,
  burst_eps UInt32 DEFAULT 100,
  created_at UInt32,
  updated_at UInt32
)
ENGINE = MergeTree
ORDER BY (tenant_id);

CREATE TABLE IF NOT EXISTS dev.tenant_limits
(
  tenant_id String,
  eps_limit UInt32,
  burst_limit UInt32,
  retention_days UInt16,
  updated_at UInt32
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id);


