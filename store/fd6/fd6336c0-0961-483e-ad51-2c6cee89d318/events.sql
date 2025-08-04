ATTACH TABLE _ UUID '89d2cc25-9ea7-4458-a998-0df9904a0f4c'
(
    `event_id` String,
    `tenant_id` String,
    `event_timestamp` UInt32,
    `source_ip` String,
    `raw_event` String,
    `source_type` String,
    `event_category` Nullable(String),
    `event_outcome` Nullable(String),
    `event_action` Nullable(String),
    `severity` Nullable(String),
    `message` Nullable(String),
    `log_source_id` Nullable(String),
    `parsing_status` Nullable(String),
    `parse_error_msg` Nullable(String),
    `ingestion_timestamp` UInt32
)
ENGINE = MergeTree
ORDER BY (tenant_id, event_timestamp)
SETTINGS index_granularity = 8192
