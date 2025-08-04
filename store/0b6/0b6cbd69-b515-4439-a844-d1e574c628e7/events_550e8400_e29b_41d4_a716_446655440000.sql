ATTACH TABLE _ UUID '645af594-29ac-4221-bdba-35b4a67c5fc2'
(
    `event_id` String,
    `tenant_id` String,
    `event_timestamp` UInt64,
    `event_type` String,
    `source_ip` String,
    `dest_ip` Nullable(String),
    `source_port` Nullable(UInt16),
    `dest_port` Nullable(UInt16),
    `protocol` Nullable(String),
    `event_category` Nullable(String),
    `event_action` Nullable(String),
    `event_outcome` Nullable(String),
    `user_name` Nullable(String),
    `host_name` Nullable(String),
    `process_name` Nullable(String),
    `file_path` Nullable(String),
    `url` Nullable(String),
    `http_method` Nullable(String),
    `http_status` Nullable(UInt16),
    `user_agent` Nullable(String),
    `severity` Nullable(String),
    `message` Nullable(String),
    `tags` Nullable(String),
    `details` Nullable(String)
)
ENGINE = MergeTree
ORDER BY (tenant_id, event_timestamp)
SETTINGS index_granularity = 8192
