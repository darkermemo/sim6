CREATE TABLE IF NOT EXISTS dev.rules (
    rule_id String,
    tenant_id String,
    rule_name String,
    rule_description String,
    rule_query String,
    is_active UInt8 DEFAULT 1,
    is_stateful UInt8 DEFAULT 0,
    stateful_config String DEFAULT '',
    engine_type String DEFAULT 'scheduled',
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, rule_id);