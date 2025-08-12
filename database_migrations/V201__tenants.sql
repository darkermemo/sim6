-- Tenants table (Admin phase)
CREATE TABLE IF NOT EXISTS dev.tenants
(
  tenant_id String,
  name String,
  status LowCardinality(String) DEFAULT 'ACTIVE',
  retention_days UInt16 DEFAULT 30,
  eps_quota UInt32 DEFAULT 5000,
  burst_eps UInt32 DEFAULT 10000,
  created_at UInt32,
  updated_at UInt32
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id);


