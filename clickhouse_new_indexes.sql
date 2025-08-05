-- Add new indexes for ClickHouse events table (avoiding duplicates)

-- Add bloom filter for source IP (most commonly searched field)
ALTER TABLE dev.events 
ADD INDEX idx_source_ip_bloom (source_ip) TYPE bloom_filter() GRANULARITY 4;

-- Add bloom filter for destination IP  
ALTER TABLE dev.events 
ADD INDEX idx_dest_ip_bloom (dest_ip) TYPE bloom_filter() GRANULARITY 4;

-- Add minmax indexes for ports (commonly used in range queries)
ALTER TABLE dev.events 
ADD INDEX idx_src_port_minmax (src_port) TYPE minmax GRANULARITY 4;

ALTER TABLE dev.events 
ADD INDEX idx_dest_port_minmax (dest_port) TYPE minmax GRANULARITY 4;

-- Add minmax for HTTP status codes
ALTER TABLE dev.events 
ADD INDEX idx_http_status_code_minmax (http_status_code) TYPE minmax GRANULARITY 4;

-- Add index for process IDs
ALTER TABLE dev.events 
ADD INDEX idx_process_id_minmax (process_id) TYPE minmax GRANULARITY 4;

-- Optimize table settings for high-volume ingestion
ALTER TABLE dev.events 
MODIFY SETTING 
    max_part_removal_threads = 8,
    max_part_loading_threads = 8,
    parts_to_delay_insert = 300,
    parts_to_throw_insert = 600;