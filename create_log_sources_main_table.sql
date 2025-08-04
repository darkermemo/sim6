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
ORDER BY (tenant_id, type, name)