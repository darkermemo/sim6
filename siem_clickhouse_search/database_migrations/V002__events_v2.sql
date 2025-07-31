-- Migration V002: Create events_v2 table with enhanced schema
-- This migration introduces a richer, future-proof model that supports
-- log-size tracking, advanced filtering, and low-latency streaming

-- Create the enhanced events_v2 table
CREATE TABLE IF NOT EXISTS events_v2 (
    -- Core identifiers
    tenant_id          UUID,
    event_timestamp    DateTime64(3, 'UTC'),
    
    -- Core metadata
    event_category     LowCardinality(String),
    source_ip          IPv6,
    dest_ip            IPv6,
    user               String,
    
    -- NEW: raw log metrics for size tracking and analysis
    raw_log_size       UInt32,      -- bytes
    raw_log_hash       FixedString(32), -- MD5 hash for deduplication
    compression_alg    Enum8('none'=0,'gzip'=1,'zstd'=2), -- compression algorithm used
    
    -- NEW: enrichment flags for data quality tracking
    parsed_success     UInt8,       -- 1 if parsing succeeded, 0 if failed
    schema_version     UInt16,      -- schema version for backward compatibility
    
    -- Original JSON for fallback and debugging
    raw_event_json     String,
    
    -- Ingestion pipeline metadata for performance monitoring
    ingest_node        String,      -- node that processed this event
    ingest_latency_ms  UInt32,      -- processing latency in milliseconds
    
    -- Partition and ordering optimization
    _partition         UInt16       DEFAULT toYYYYMM(event_timestamp),
    _order             String       DEFAULT concat(toString(tenant_id), toString(event_timestamp))
)
ENGINE = MergeTree()
PARTITION BY _partition
ORDER BY (_partition, tenant_id, event_timestamp)
SETTINGS index_granularity = 8192;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_events_v2_source_ip ON events_v2 (source_ip) TYPE bloom_filter GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_events_v2_dest_ip ON events_v2 (dest_ip) TYPE bloom_filter GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_events_v2_user ON events_v2 (user) TYPE bloom_filter GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_events_v2_category ON events_v2 (event_category) TYPE bloom_filter GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_events_v2_log_size ON events_v2 (raw_log_size) TYPE minmax GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_events_v2_parsed_success ON events_v2 (parsed_success) TYPE set(2) GRANULARITY 1;

-- Create materialized view for real-time aggregations
CREATE MATERIALIZED VIEW IF NOT EXISTS events_v2_hourly_stats
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_timestamp)
ORDER BY (tenant_id, toStartOfHour(event_timestamp), event_category)
AS SELECT
    tenant_id,
    toStartOfHour(event_timestamp) as hour,
    event_category,
    count() as event_count,
    sum(raw_log_size) as total_log_size,
    avg(ingest_latency_ms) as avg_ingest_latency,
    sum(parsed_success) as successful_parses,
    count() - sum(parsed_success) as failed_parses
FROM events_v2
GROUP BY tenant_id, hour, event_category;

-- Create materialized view for compression statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS events_v2_compression_stats
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_timestamp)
ORDER BY (tenant_id, compression_alg)
AS SELECT
    tenant_id,
    compression_alg,
    count() as event_count,
    sum(raw_log_size) as total_raw_size,
    avg(raw_log_size) as avg_log_size
FROM events_v2
GROUP BY tenant_id, compression_alg;

-- Add TTL for automatic data cleanup (configurable retention)
ALTER TABLE events_v2 MODIFY TTL event_timestamp + INTERVAL 90 DAY;

-- Add comment for documentation
ALTER TABLE events_v2 COMMENT 'Enhanced events table v2 with log metrics, enrichment flags, and performance optimizations';