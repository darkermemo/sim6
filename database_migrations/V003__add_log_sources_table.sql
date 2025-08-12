-- V003: Add log_sources table for tenant-specific log source management

CREATE TABLE IF NOT EXISTS dev.log_sources (
    tenant_id String,
    source_id String,
    source_type LowCardinality(String),
    source_name String,
    configuration String,  -- JSON configuration for the source
    enabled UInt8 DEFAULT 1,
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (tenant_id, source_id);

-- Insert sample log sources for default tenants
INSERT INTO dev.log_sources (tenant_id, source_id, source_type, source_name, configuration, enabled, created_at, updated_at) VALUES
('tenant-demo', 'fw-001', 'Firewall', 'Main Firewall', '{"ip": "192.168.1.1", "port": 514}', 1, now(), now()),
('tenant-demo', 'web-001', 'WebServer', 'Apache Web Server', '{"path": "/var/log/apache2/access.log"}', 1, now(), now()),
('tenant-prod', 'fw-prod', 'Firewall', 'Production Firewall', '{"ip": "10.0.1.1", "port": 514}', 1, now(), now()),
('tenant-prod', 'f5-001', 'F5-BigIP', 'Load Balancer', '{"ip": "10.0.2.1", "port": 514}', 1, now(), now());