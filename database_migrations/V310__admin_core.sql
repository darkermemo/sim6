-- Admin Core: Tenants, Limits/Retention, API Keys, RBAC, Deep Health
-- Multi-tenant operations foundation with comprehensive admin controls

-- Tenants table
CREATE TABLE IF NOT EXISTS dev.tenants
(
  tenant_id UInt64,
  slug String,
  name String,
  status LowCardinality(String) DEFAULT 'ACTIVE',
  region LowCardinality(String) DEFAULT 'default',
  created_at DateTime64(3) DEFAULT now64(3)
) ENGINE=ReplacingMergeTree ORDER BY tenant_id;

-- Tenant limits and quotas
CREATE TABLE IF NOT EXISTS dev.tenant_limits
(
  tenant_id UInt64,
  eps_hard UInt64,
  eps_soft UInt64,
  burst UInt64,
  retention_days UInt16,
  export_daily_mb UInt64,
  updated_at DateTime64(3) DEFAULT now64(3)
) ENGINE=ReplacingMergeTree ORDER BY tenant_id;

-- API keys (hash-only storage)
CREATE TABLE IF NOT EXISTS dev.api_keys
(
  tenant_id UInt64,
  key_id String,
  prefix FixedString(8),
  hash String,
  role LowCardinality(String),
  created_at DateTime64(3) DEFAULT now64(3),
  last_used_at DateTime64(3) DEFAULT toDateTime64(0,3),
  revoked UInt8 DEFAULT 0
) ENGINE=ReplacingMergeTree ORDER BY (tenant_id, key_id);

-- Roles and permissions
CREATE TABLE IF NOT EXISTS dev.roles
(
  role LowCardinality(String),
  description String,
  perms Array(LowCardinality(String))
) ENGINE=ReplacingMergeTree ORDER BY role;

-- Seed default roles if empty
INSERT INTO dev.roles (role, description, perms)
SELECT 'admin','Full access', ['*'] WHERE 0=(SELECT count() FROM dev.roles WHERE role='admin');

INSERT INTO dev.roles (role, description, perms)
SELECT 'analyst','Investigate & search', ['search:read','alerts:*','rules:run','exports:*']
WHERE 0=(SELECT count() FROM dev.roles WHERE role='analyst');

INSERT INTO dev.roles (role, description, perms)
SELECT 'viewer','Read-only', ['search:read','alerts:read']
WHERE 0=(SELECT count() FROM dev.roles WHERE role='viewer');

-- Indexes for performance
ALTER TABLE dev.tenants ADD INDEX idx_slug (slug) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.tenants ADD INDEX idx_status (status) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.tenants ADD INDEX idx_region (region) TYPE bloom_filter GRANULARITY 1;

ALTER TABLE dev.api_keys ADD INDEX idx_prefix (prefix) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.api_keys ADD INDEX idx_role (role) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.api_keys ADD INDEX idx_revoked (revoked) TYPE bloom_filter GRANULARITY 1;

-- Comments
ALTER TABLE dev.tenants COMMENT 'Tenant registry for multi-tenant operations';
ALTER TABLE dev.tenant_limits COMMENT 'Per-tenant quotas and limits';
ALTER TABLE dev.api_keys COMMENT 'API key management with hash-only storage';
ALTER TABLE dev.roles COMMENT 'Role-based access control definitions';
