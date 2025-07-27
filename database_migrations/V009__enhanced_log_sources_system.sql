-- V009: Enhanced Log Sources System
-- Implements comprehensive log sources registry, parsing status tracking, and grouping

-- Drop existing log_sources table to recreate with enhanced schema
DROP TABLE IF EXISTS dev.log_sources;

-- Enhanced Log Sources Registry table
CREATE TABLE IF NOT EXISTS dev.log_sources (
    id String,                                    -- UUID primary key
    name String,                                  -- Human-readable name
    type Enum8('firewall' = 1, 'edr' = 2, 'os' = 3, 'proxy' = 4, 'custom' = 5),
    subtype Enum16(
        'palo_alto' = 1, 'fortigate' = 2, 'checkpoint' = 3, 'cisco_asa' = 4,
        'windows' = 5, 'linux' = 6, 'macos' = 7,
        'crowdstrike' = 8, 'sentinelone' = 9, 'defender' = 10,
        'squid' = 11, 'bluecoat' = 12, 'zscaler' = 13,
        'iis' = 14, 'apache' = 15, 'nginx' = 16,
        'custom_parser' = 17, 'syslog' = 18, 'json' = 19, 'cef' = 20
    ),
    parser_id String,                             -- UUID reference to parser
    tenant_id String,                             -- Tenant isolation
    last_seen DateTime DEFAULT now(),            -- Last time we received logs
    status Enum8('active' = 1, 'blocked' = 2, 'error' = 3, 'parsing_failed' = 4),
    eps Float32 DEFAULT 0.0,                     -- Events per second rate
    event_count UInt64 DEFAULT 0,               -- Total events processed
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (tenant_id, type, name);

-- Log Source Groups table for logical grouping
CREATE TABLE IF NOT EXISTS dev.log_source_groups (
    group_id String,                              -- UUID primary key
    name String,                                  -- Group name (e.g., "Next-Gen Firewalls")
    description String,                           -- Group description
    log_source_ids Array(String),               -- Array of log source UUIDs
    tenant_id String,                            -- Tenant isolation
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (tenant_id, name);

-- Add new fields to events table for log source tracking and parsing status
ALTER TABLE dev.events ADD COLUMN IF NOT EXISTS log_source_id String DEFAULT '';
ALTER TABLE dev.events ADD COLUMN IF NOT EXISTS parsing_status Enum8('ok' = 1, 'partial' = 2, 'failed' = 3) DEFAULT 'ok';
ALTER TABLE dev.events ADD COLUMN IF NOT EXISTS parse_error_msg Nullable(String);

-- Create indexes for better query performance
-- Note: ClickHouse doesn't support traditional indexes, but we can create materialized views for common queries

-- Insert some default log source types for common vendors
INSERT INTO dev.log_sources (id, name, type, subtype, parser_id, tenant_id, status) VALUES
('ls-palo-alto-001', 'Palo Alto Firewall Main', 'firewall', 'palo_alto', 'parser-palo-alto-001', 'tenant-A', 'active'),
('ls-fortigate-001', 'FortiGate Firewall DMZ', 'firewall', 'fortigate', 'parser-fortigate-001', 'tenant-A', 'active'),
('ls-windows-dc-001', 'Windows Domain Controller', 'os', 'windows', 'parser-windows-001', 'tenant-A', 'active'),
('ls-crowdstrike-001', 'CrowdStrike EDR', 'edr', 'crowdstrike', 'parser-crowdstrike-001', 'tenant-A', 'active'),
('ls-squid-proxy-001', 'Squid Proxy Server', 'proxy', 'squid', 'parser-squid-001', 'tenant-A', 'active');

-- Insert default log source groups
INSERT INTO dev.log_source_groups (group_id, name, description, log_source_ids, tenant_id) VALUES
('group-firewalls-001', 'Next-Gen Firewalls', 'All next-generation firewall devices', ['ls-palo-alto-001', 'ls-fortigate-001'], 'tenant-A'),
('group-endpoints-001', 'Endpoint Security', 'All endpoint detection and response systems', ['ls-crowdstrike-001'], 'tenant-A'),
('group-infrastructure-001', 'Core Infrastructure', 'Critical infrastructure components', ['ls-windows-dc-001'], 'tenant-A');

-- Create a materialized view for log source statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.log_source_stats_mv
ENGINE = SummingMergeTree()
ORDER BY (log_source_id, tenant_id, toDate(timestamp))
AS SELECT
    log_source_id,
    tenant_id,
    toDate(timestamp) as date,
    count() as event_count,
    countIf(parsing_status = 'failed') as parse_failures,
    countIf(parsing_status = 'partial') as parse_partials
FROM dev.events
WHERE log_source_id != ''
GROUP BY log_source_id, tenant_id, toDate(timestamp);