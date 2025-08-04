ATTACH TABLE _ UUID 'a13220cd-bea4-4e06-8dde-a85a01d0a041'
(
    `note_id` String,
    `alert_id` String,
    `tenant_id` String,
    `author` String,
    `content` String,
    `created_at` UInt32
)
ENGINE = MergeTree
ORDER BY (alert_id, created_at)
SETTINGS index_granularity = 8192
