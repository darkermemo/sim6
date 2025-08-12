-- V307__agents.sql
-- Agents registry

-- Agents registry
CREATE TABLE IF NOT EXISTS dev.agents (
  tenant_id UInt64,
  agent_id  String,
  source_id String,
  name      LowCardinality(String),
  kind      LowCardinality(String),
  api_key   String DEFAULT '',  -- optional until auth lands
  version   LowCardinality(String) DEFAULT '',
  created_at DateTime64(3) DEFAULT now64(3),
  last_seen_at DateTime64(3) DEFAULT toDateTime64(0,3),
  eps_last UInt64 DEFAULT 0,
  queue_depth_last UInt64 DEFAULT 0
) ENGINE=ReplacingMergeTree ORDER BY (tenant_id, agent_id);

-- Link back to admin sources
ALTER TABLE dev.log_sources_admin
  ADD COLUMN IF NOT EXISTS agent_id String DEFAULT '';

-- Effective view for dashboards
CREATE VIEW IF NOT EXISTS dev.agents_online AS
SELECT tenant_id, agent_id, name, kind, version,
       (now64(3)-last_seen_at <= toIntervalMinute(2)) AS online
FROM dev.agents;
