-- V002: Fix events schema for proper multi-tenancy
-- Updates tenant_id to LowCardinality(String) and fixes primary key order

-- Drop existing events table
DROP TABLE IF EXISTS dev.events;

-- Create events table with proper multi-tenant schema
CREATE TABLE IF NOT EXISTS dev.events (
    tenant_id LowCardinality(String),
    event_timestamp DateTime64(3),
    event_id String,
    source_ip String,
    destination_ip Nullable(String),
    source_port Nullable(UInt16),
    destination_port Nullable(UInt16),
    protocol Nullable(String),
    event_type LowCardinality(String),
    severity LowCardinality(String),
    message String,
    raw_log String,
    parsed_fields Map(String, String),
    created_at DateTime64(3) DEFAULT now64(),
    source_type LowCardinality(String) DEFAULT '',
    event_category LowCardinality(String) DEFAULT '',
    event_outcome LowCardinality(String) DEFAULT '',
    event_action LowCardinality(String) DEFAULT ''
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_timestamp)
ORDER BY (tenant_id, event_timestamp, event_id);

-- Update tenants table to match requirements
DROP TABLE IF EXISTS dev.tenants;
CREATE TABLE IF NOT EXISTS dev.tenants (
    tenant_id String PRIMARY KEY,
    tenant_name String,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY tenant_id;

-- Insert default tenants
INSERT INTO dev.tenants (tenant_id, tenant_name, created_at) VALUES
('tenant-demo', 'Demo Tenant', now()),
('tenant-prod', 'Production Tenant', now());