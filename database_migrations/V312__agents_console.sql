-- Agents/Collectors Console: Enroll • Status • Config • Test Pipeline
-- Ops can enroll agents, see heartbeats, fetch templated configs, run test pipeline

-- Agent enrollment keys
CREATE TABLE IF NOT EXISTS dev.agent_enroll_keys
(
  tenant_id UInt64,
  enroll_key String,
  created_at DateTime64(3) DEFAULT now64(3),
  expires_at DateTime64(3) DEFAULT now64(3) + toIntervalDay(7),
  revoked UInt8 DEFAULT 0
) ENGINE=ReplacingMergeTree ORDER BY (tenant_id, enroll_key);

-- Agent configuration audit
CREATE TABLE IF NOT EXISTS dev.agent_config_audit
(
  tenant_id UInt64,
  agent_id String,
  version UInt64,
  applied_at DateTime64(3) DEFAULT now64(3),
  diff String
) ENGINE=ReplacingMergeTree ORDER BY (tenant_id, agent_id, version);

-- Indexes for performance
ALTER TABLE dev.agent_enroll_keys ADD INDEX idx_enroll_key (enroll_key) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.agent_enroll_keys ADD INDEX idx_expires (expires_at) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.agent_enroll_keys ADD INDEX idx_revoked (revoked) TYPE bloom_filter GRANULARITY 1;

ALTER TABLE dev.agent_config_audit ADD INDEX idx_agent_version (agent_id, version) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.agent_config_audit ADD INDEX idx_applied_at (applied_at) TYPE bloom_filter GRANULARITY 1;

-- Comments
ALTER TABLE dev.agent_enroll_keys COMMENT 'One-time enrollment keys for agent registration';
ALTER TABLE dev.agent_config_audit COMMENT 'Audit trail of agent configuration changes';
