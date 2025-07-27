-- V001: Initial core tables for SIEM system
-- Creates the dev database and core event storage tables

-- Create the dev database
CREATE DATABASE IF NOT EXISTS dev;

-- Events table: Core table for storing all security events
CREATE TABLE IF NOT EXISTS dev.events (
    event_id String,
    tenant_id String,
    timestamp UInt32,
    source_ip String,
    destination_ip String,
    source_port UInt16,
    destination_port UInt16,
    protocol String,
    event_type String,
    severity String,
    message String,
    raw_log String,
    parsed_fields Map(String, String),
    created_at UInt32,
    source_type String DEFAULT '',
    event_category String DEFAULT '',
    event_outcome String DEFAULT '',
    event_action String DEFAULT ''
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(timestamp))
ORDER BY (tenant_id, timestamp, event_id);

-- Tenants table: Stores tenant configurations for multi-tenancy
CREATE TABLE IF NOT EXISTS dev.tenants (
    tenant_id String,
    tenant_name String,
    is_active UInt8 DEFAULT 1,
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY tenant_id;

-- Insert default tenants
INSERT INTO dev.tenants (tenant_id, tenant_name, is_active, created_at) VALUES
('tenant-A', 'Organization A', 1, toUnixTimestamp(now())),
('tenant-B', 'Organization B', 1, toUnixTimestamp(now()));