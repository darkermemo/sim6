-- Rule Packs: Upload, Plan, Deploy
-- Enables bulk rule management with safe deployment workflows

-- Main pack metadata
CREATE TABLE IF NOT EXISTS dev.rule_packs (
    pack_id String,
    name String,
    version String,
    source String,
    uploaded_at DateTime64(3) DEFAULT now64(3),
    uploader String,
    items UInt32,
    sha256 String,
    metadata String DEFAULT '{}' -- JSON for extensibility
) ENGINE = MergeTree()
ORDER BY (pack_id)
COMMENT 'Uploaded rule pack metadata';

-- Individual rules within a pack
CREATE TABLE IF NOT EXISTS dev.rule_pack_items (
    pack_id String,
    item_id String,
    kind LowCardinality(String), -- SIGMA or NATIVE
    rule_id String,
    name String,
    severity LowCardinality(String),
    tags Array(String),
    body String, -- Original DSL/YAML
    sha256 String,
    compile_result String DEFAULT '{}', -- JSON with ok, sql, errors
    created_at DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
ORDER BY (pack_id, item_id)
COMMENT 'Individual rules within uploaded packs';

-- Deployment tracking
CREATE TABLE IF NOT EXISTS dev.rule_pack_deployments (
    deploy_id String, -- ULID
    pack_id String,
    started_at DateTime64(3) DEFAULT now64(3),
    finished_at Nullable(DateTime64(3)),
    status LowCardinality(String), -- PLANNED, APPLIED, FAILED, CANCELED
    strategy LowCardinality(String) DEFAULT 'safe', -- safe or force
    summary String DEFAULT '{}', -- JSON summary
    created UInt32 DEFAULT 0,
    updated UInt32 DEFAULT 0,
    disabled UInt32 DEFAULT 0,
    skipped UInt32 DEFAULT 0,
    errors UInt32 DEFAULT 0,
    actor String,
    idempotency_key String DEFAULT ''
) ENGINE = MergeTree()
ORDER BY (deploy_id)
COMMENT 'Rule pack deployment history';

-- Audit log for all rule changes
CREATE TABLE IF NOT EXISTS dev.rule_change_log (
    ts DateTime64(3) DEFAULT now64(3),
    tenant_id UInt32,
    actor String,
    action LowCardinality(String), -- CREATE, UPDATE, DISABLE, ENABLE
    rule_id String,
    from_sha String DEFAULT '',
    to_sha String DEFAULT '',
    reason String DEFAULT '',
    deploy_id String DEFAULT '', -- Links to deployment if part of pack
    metadata String DEFAULT '{}' -- JSON for additional context
) ENGINE = MergeTree()
ORDER BY (tenant_id, ts, rule_id)
TTL ts + INTERVAL 180 DAY
COMMENT 'Append-only audit log of rule changes';

-- Hot rules view (rules with recent alerts)
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.rules_hot_alerts_30d
ENGINE = AggregatingMergeTree()
ORDER BY (tenant_id, rule_id)
POPULATE
AS SELECT
    tenant_id,
    rule_id,
    count() as alert_count,
    max(created_at) as last_alert_at,
    uniqExact(alert_key) as unique_keys
FROM dev.alerts
WHERE created_at >= now() - INTERVAL 30 DAY
GROUP BY tenant_id, rule_id
COMMENT 'Rules with alerts in last 30 days for safe deployment checks';

-- Deployment plan details (ephemeral, TTL 7 days)
CREATE TABLE IF NOT EXISTS dev.rule_pack_plans (
    plan_id String,
    pack_id String,
    created_at DateTime64(3) DEFAULT now64(3),
    strategy LowCardinality(String),
    match_by LowCardinality(String), -- rule_id or name
    tag_prefix String DEFAULT '',
    plan_data String, -- JSON array of planned changes
    totals String -- JSON with create/update/disable/skip counts
) ENGINE = MergeTree()
ORDER BY (plan_id)
TTL created_at + INTERVAL 7 DAY
COMMENT 'Temporary storage for deployment plans';

-- Indexes for common queries
ALTER TABLE dev.rule_packs ADD INDEX idx_source (source) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.rule_pack_items ADD INDEX idx_rule_id (rule_id) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.rule_pack_deployments ADD INDEX idx_pack_id (pack_id) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.rule_change_log ADD INDEX idx_rule_id (rule_id) TYPE bloom_filter GRANULARITY 1;
