ATTACH TABLE _ UUID 'e690aa93-c088-49d2-8867-1a8d435fb891'
(
    `alert_id` String,
    `tenant_id` String,
    `rule_id` String,
    `rule_name` String,
    `event_id` String,
    `alert_timestamp` UInt32,
    `severity` LowCardinality(String),
    `status` LowCardinality(String) DEFAULT 'open',
    `created_at` UInt32
)
ENGINE = MergeTree
ORDER BY (tenant_id, alert_timestamp)
SETTINGS index_granularity = 8192
