-- V304__eps_limits.sql
-- Create tenant EPS limits table for rate limiting

CREATE TABLE IF NOT EXISTS dev.tenants_eps (
  tenant_id UInt64,
  source LowCardinality(String) DEFAULT '*',
  limit_eps UInt32 DEFAULT 100,
  burst UInt32 DEFAULT 200,
  enabled UInt8 DEFAULT 1,
  created_at DateTime DEFAULT now(),
  updated_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, source);

-- Create view for effective limits (only enabled rows)
CREATE VIEW IF NOT EXISTS dev.tenants_eps_effective AS
SELECT tenant_id, source, limit_eps, burst
FROM dev.tenants_eps
WHERE enabled = 1;

-- Insert default limits for all tenants
INSERT INTO dev.tenants_eps (tenant_id, source, limit_eps, burst)
VALUES (0, '*', 100, 200);  -- Default for all tenants
