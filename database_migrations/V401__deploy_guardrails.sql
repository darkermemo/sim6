-- Deploy Guardrails & Rollback: Safety, Canary, Snapshots
-- Enables provably safe deployments with progressive rollouts and rollback

-- Artifacts storage for plans, applies, canaries, rollbacks
CREATE TABLE IF NOT EXISTS dev.rule_pack_artifacts (
    deploy_id String,
    kind LowCardinality(String), -- "plan", "apply", "rollback", "canary"
    content String, -- JSON content
    created_at DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
ORDER BY (deploy_id, kind, created_at)
TTL created_at + INTERVAL 90 DAY
COMMENT 'Stores deployment artifacts for audit and rollback';

-- Rule snapshots before changes
CREATE TABLE IF NOT EXISTS dev.rule_snapshots (
    snapshot_id String, -- ULID
    rule_id String,
    sha256 String,
    body String, -- Full rule body (DSL/YAML)
    taken_at DateTime64(3) DEFAULT now64(3),
    by_pack String DEFAULT '', -- Pack ID that triggered snapshot
    deploy_id String DEFAULT '' -- Deployment that created this snapshot
) ENGINE = MergeTree()
ORDER BY (rule_id, snapshot_id)
TTL taken_at + INTERVAL 180 DAY
COMMENT 'Rule state snapshots for rollback';

-- Extend deployments table with guardrails and canary
ALTER TABLE dev.rule_pack_deployments 
ADD COLUMN guardrails LowCardinality(String) DEFAULT '', -- CSV flags: compilation_clean,hot_disable_safe,quota_ok,blast_radius_ok,health_ok
ADD COLUMN canary UInt8 DEFAULT 0, -- 0=disabled, 1=enabled
ADD COLUMN canary_stages UInt8 DEFAULT 0, -- Number of stages configured
ADD COLUMN canary_current_stage UInt8 DEFAULT 0, -- Current stage (0=not started)
ADD COLUMN canary_state LowCardinality(String) DEFAULT 'disabled', -- disabled, running, paused, failed, completed
ADD COLUMN rolled_back_from String DEFAULT '', -- Deploy ID this was rolled back from
ADD COLUMN rolled_back_to String DEFAULT '', -- Deploy ID this rolled back to
ADD COLUMN errors FirstNonNull(String) DEFAULT '', -- First error encountered
ADD COLUMN force_reason String DEFAULT '', -- Reason provided for force deployment
ADD COLUMN blast_radius UInt32 DEFAULT 0; -- Total number of rules affected

-- View for rules firing in last 24h (for canary health checks)
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.rules_firing_24h
ENGINE = AggregatingMergeTree()
ORDER BY (rule_id)
POPULATE
AS SELECT
    rule_id,
    count() as alerts_24h,
    uniqExact(alert_key) as unique_keys_24h,
    max(created_at) as last_alert_at
FROM dev.alerts
WHERE created_at >= now() - INTERVAL 24 HOUR
GROUP BY rule_id
COMMENT 'Rules with alerts in last 24h for canary health monitoring';

-- View for rules firing in last 30d (for hot rule protection)
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.rules_firing_30d
ENGINE = AggregatingMergeTree()
ORDER BY (rule_id)
POPULATE
AS SELECT
    rule_id,
    count() as alerts_30d,
    uniqExact(alert_key) as unique_keys_30d,
    max(created_at) as last_alert_at
FROM dev.alerts
WHERE created_at >= now() - INTERVAL 30 DAY
GROUP BY rule_id
COMMENT 'Rules with alerts in last 30d for safe deployment checks';

-- Indexes for performance
ALTER TABLE dev.rule_pack_artifacts ADD INDEX idx_deploy_kind (deploy_id, kind) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.rule_snapshots ADD INDEX idx_rule_deploy (rule_id, deploy_id) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.rule_pack_deployments ADD INDEX idx_canary_state (canary_state) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.rule_pack_deployments ADD INDEX idx_rolled_back (rolled_back_from) TYPE bloom_filter GRANULARITY 1;
