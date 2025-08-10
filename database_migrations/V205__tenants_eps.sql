-- Tenants catalog
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

-- Per-minute EPS counters (AggregatingMergeTree)
CREATE TABLE IF NOT EXISTS dev.tenant_eps_minute
(
  tenant_id String,
  ts_min DateTime,
  c_state AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
ORDER BY (tenant_id, ts_min);

-- Materialized view to populate EPS per minute from dev.events
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.mv_eps_minute
TO dev.tenant_eps_minute AS
SELECT
  tenant_id,
  toStartOfMinute(toDateTime(event_timestamp)) AS ts_min,
  countState() AS c_state
FROM dev.events
GROUP BY tenant_id, ts_min;

-- Add retention_days to events and TTL (Option A)
ALTER TABLE dev.events ADD COLUMN IF NOT EXISTS retention_days UInt16 DEFAULT 30;
-- Add a helper DateTime for TTL if missing
ALTER TABLE dev.events ADD COLUMN IF NOT EXISTS event_dt DateTime DEFAULT toDateTime(event_timestamp);
ALTER TABLE dev.events MODIFY TTL event_dt + toIntervalDay(retention_days);


