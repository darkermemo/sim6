-- ClickHouse Schema Optimization for SIEM Events Table
-- Optimized for 99%+ parsing success and high-volume ingestion
-- Supports 500+ log sources with comprehensive search capabilities

-- Add bloom filter indexes for full-text search capabilities
ALTER TABLE dev.events 
ADD INDEX idx_raw_event_bloom (raw_event) TYPE tokenbf_v1(1024,3,0) GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_message_bloom (message) TYPE tokenbf_v1(512,3,0) GRANULARITY 4;

-- Add bloom filter for IP address searches
ALTER TABLE dev.events 
ADD INDEX idx_source_ip_bloom (source_ip) TYPE bloom_filter() GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_dest_ip_bloom (dest_ip) TYPE bloom_filter() GRANULARITY 4;

-- Add indexes for common search fields
ALTER TABLE dev.events 
ADD INDEX idx_user_bloom (user) TYPE bloom_filter() GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_src_user_bloom (src_user) TYPE bloom_filter() GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_dest_user_bloom (dest_user) TYPE bloom_filter() GRANULARITY 4;

-- Add indexes for HTTP fields (common in web logs)
ALTER TABLE dev.events 
ADD INDEX idx_http_user_agent_bloom (http_user_agent) TYPE tokenbf_v1(512,3,0) GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_url_bloom (url) TYPE tokenbf_v1(512,3,0) GRANULARITY 4;

-- Add indexes for security-relevant fields
ALTER TABLE dev.events 
ADD INDEX idx_threat_name_bloom (threat_name) TYPE bloom_filter() GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_threat_category_bloom (threat_category) TYPE bloom_filter() GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_signature_name_bloom (signature_name) TYPE tokenbf_v1(512,3,0) GRANULARITY 4;

-- Add indexes for process/file analysis
ALTER TABLE dev.events 
ADD INDEX idx_process_name_bloom (process_name) TYPE bloom_filter() GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_file_hash_bloom (file_hash) TYPE bloom_filter() GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_file_path_bloom (file_path) TYPE tokenbf_v1(512,3,0) GRANULARITY 4;

-- Add index for command line analysis  
ALTER TABLE dev.events 
ADD INDEX idx_command_line_bloom (command_line) TYPE tokenbf_v1(1024,3,0) GRANULARITY 4;

-- Add minmax indexes for numeric fields commonly used in ranges
ALTER TABLE dev.events 
ADD INDEX idx_src_port_minmax (src_port) TYPE minmax GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_dest_port_minmax (dest_port) TYPE minmax GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_http_status_code_minmax (http_status_code) TYPE minmax GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_process_id_minmax (process_id) TYPE minmax GRANULARITY 4;

-- Optimize table settings for high-volume ingestion
ALTER TABLE dev.events 
MODIFY SETTING 
    max_part_removal_threads = 8,
    max_part_loading_threads = 8,
    parts_to_delay_insert = 300,
    parts_to_throw_insert = 600,
    inactive_parts_to_delay_insert = 50,
    inactive_parts_to_throw_insert = 100;

-- Create materialized view for fast aggregations by hour
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.events_hourly_stats
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_hour)
ORDER BY (tenant_id, event_hour, source_type, event_category)
AS SELECT
    tenant_id,
    toStartOfHour(FROM_UNIXTIME(event_timestamp)) as event_hour,
    source_type,
    event_category,
    event_outcome,
    parsing_status,
    count() as event_count,
    countIf(is_threat = 1) as threat_count,
    countIf(parsing_status != 'success') as parse_error_count,
    uniqIf(source_ip, source_ip != '') as unique_source_ips,
    uniqIf(dest_ip, dest_ip != '') as unique_dest_ips,
    uniqIf(user, user != '') as unique_users
FROM dev.events
GROUP BY tenant_id, event_hour, source_type, event_category, event_outcome, parsing_status;

-- Create materialized view for threat intelligence aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.threat_summary
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(event_hour)
ORDER BY (tenant_id, threat_category, threat_name, source_ip)
AS SELECT
    tenant_id,
    toStartOfHour(FROM_UNIXTIME(event_timestamp)) as event_hour,
    threat_category,
    threat_name,
    source_ip,
    dest_ip,
    count() as occurrence_count,
    max(event_timestamp) as last_seen,
    min(event_timestamp) as first_seen,
    groupUniqArray(signature_name) as signatures,
    groupUniqArray(rule_name) as rules
FROM dev.events
WHERE is_threat = 1 AND threat_name != ''
GROUP BY tenant_id, event_hour, threat_category, threat_name, source_ip, dest_ip;

-- Create view for parser performance monitoring
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.parser_performance
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_hour)  
ORDER BY (event_hour, source_type, parsing_status)
AS SELECT
    toStartOfHour(FROM_UNIXTIME(ingestion_timestamp)) as event_hour,
    source_type,
    parsing_status,
    count() as events_processed,
    countIf(parse_error_msg != '') as events_with_errors,
    avg(ingestion_timestamp - event_timestamp) as avg_processing_delay_seconds
FROM dev.events
GROUP BY event_hour, source_type, parsing_status;