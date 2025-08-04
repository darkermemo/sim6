ATTACH TABLE _ UUID '790992f4-db9f-4120-b852-dc316aa7f6c3'
(
    `tenant_id` UUID,
    `event_timestamp` DateTime64(3, 'UTC'),
    `event_category` LowCardinality(String),
    `source_ip` IPv6,
    `dest_ip` IPv6,
    `user` String,
    `raw_log_size` UInt32,
    `raw_log_hash` FixedString(32),
    `compression_alg` Enum8('none' = 0, 'gzip' = 1, 'zstd' = 2),
    `parsed_success` UInt8,
    `schema_version` UInt16,
    `raw_event_json` String,
    `ingest_node` String,
    `ingest_latency_ms` UInt32,
    `_partition` UInt16 DEFAULT toYYYYMM(event_timestamp),
    `_order` String DEFAULT concat(toString(tenant_id), toString(event_timestamp))
)
ENGINE = MergeTree
PARTITION BY _partition
ORDER BY (_partition, tenant_id, event_timestamp)
SETTINGS index_granularity = 8192
