CREATE TABLE IF NOT EXISTS dev.log_sources (
    id String,
    name String,
    type Enum8('firewall' = 1, 'edr' = 2, 'os' = 3, 'proxy' = 4, 'custom' = 5),
    subtype Enum16(
        'palo_alto' = 1, 'fortigate' = 2, 'checkpoint' = 3, 'cisco_asa' = 4,
        'windows' = 5, 'linux' = 6, 'macos' = 7,
        'crowdstrike' = 8, 'sentinelone' = 9, 'defender' = 10,
        'squid' = 11, 'bluecoat' = 12, 'zscaler' = 13,
        'iis' = 14, 'apache' = 15, 'nginx' = 16,
        'custom_parser' = 17, 'syslog' = 18, 'json' = 19, 'cef' = 20
    ),
    parser_id String,
    tenant_id String,
    last_seen DateTime DEFAULT now(),
    status Enum8('active' = 1, 'blocked' = 2, 'error' = 3, 'parsing_failed' = 4),
    eps Float32 DEFAULT 0.0,
    event_count UInt64 DEFAULT 0,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (tenant_id, type, name);

-- Also create the legacy log_sources table for backward compatibility
CREATE TABLE IF NOT EXISTS dev.log_sources_legacy (
    source_id String,
    tenant_id String,
    source_name String,
    source_type String,
    source_ip String,
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, source_ip);

-- Insert some sample data
INSERT INTO dev.log_sources (id, name, type, subtype, parser_id, tenant_id, status) VALUES
('ls-palo-alto-001', 'Palo Alto Firewall Main', 'firewall', 'palo_alto', 'parser-palo-alto-001', 'tenant-A', 'active'),
('ls-windows-dc-001', 'Windows Domain Controller', 'os', 'windows', 'parser-windows-001', 'tenant-A', 'active'),
('ls-crowdstrike-001', 'CrowdStrike EDR', 'edr', 'crowdstrike', 'parser-crowdstrike-001', 'tenant-A', 'active'),
('ls-squid-proxy-001', 'Squid Proxy Server', 'proxy', 'squid', 'parser-squid-001', 'tenant-A', 'active');