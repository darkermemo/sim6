-- V007: Network Flows and Cloud API Sources tables
-- Creates network_flows and cloud_api_sources tables

-- Network flows table: Stores normalized network flow data from NetFlow/IPFIX collectors
CREATE TABLE IF NOT EXISTS dev.network_flows (
    flow_id String,
    tenant_id String,
    timestamp UInt32,
    source_ip String,
    destination_ip String,
    source_port UInt16,
    destination_port UInt16,
    protocol UInt8,
    bytes_in UInt64,
    bytes_out UInt64,
    packets_in UInt64,
    packets_out UInt64,
    collector_ip String,
    flow_start_time UInt32,
    flow_end_time UInt32,
    tcp_flags UInt8 DEFAULT 0,
    tos UInt8 DEFAULT 0,
    created_at UInt32
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(timestamp))
ORDER BY (tenant_id, timestamp, source_ip, destination_ip);

-- Cloud API Sources table: Stores configurations for cloud API polling
CREATE TABLE IF NOT EXISTS dev.cloud_api_sources (
    source_id String,
    tenant_id String,
    platform LowCardinality(String),        -- 'Microsoft365', 'AzureAD', 'GCP', 'AWS', etc.
    source_name String,                     -- Human-readable name for the source
    api_credentials String,                 -- Encrypted credentials blob
    polling_interval_minutes UInt16 DEFAULT 15,  -- How often to poll (in minutes)
    last_polled_timestamp UInt32 DEFAULT 0, -- Unix timestamp of last successful poll
    is_enabled UInt8 DEFAULT 1,            -- Enable/disable polling for this source
    created_at UInt32,
    updated_at UInt32,
    error_count UInt32 DEFAULT 0,          -- Track consecutive errors
    last_error String DEFAULT '',          -- Last error message if any
    next_poll_time UInt32 DEFAULT 0        -- Next scheduled poll time
) ENGINE = MergeTree()
ORDER BY (tenant_id, platform, source_id);