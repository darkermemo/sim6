-- V006: Threat Intelligence and Audit tables
-- Creates audit_logs and threat_intel tables

-- Audit log table: Stores audit trail for all administrative actions
CREATE TABLE IF NOT EXISTS dev.audit_logs (
    audit_id String,
    tenant_id String,
    user_id String,
    action String,
    details String,
    timestamp UInt32
) ENGINE = MergeTree()
ORDER BY (tenant_id, timestamp);

-- Threat intelligence table: Stores Indicators of Compromise (IOCs)
CREATE TABLE IF NOT EXISTS dev.threat_intel (
    ioc_id String,
    ioc_type LowCardinality(String),
    ioc_value String,
    source String,
    first_seen UInt32,
    created_at UInt32
) ENGINE = MergeTree()
ORDER BY (ioc_type, ioc_value);