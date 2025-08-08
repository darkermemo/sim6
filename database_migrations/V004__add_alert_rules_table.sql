-- V004: Add alert_rules and alerts tables for correlation rule engine

-- Create alert_rules table for tenant-scoped correlation rules
CREATE TABLE IF NOT EXISTS dev.alert_rules (
    rule_id String,
    tenant_scope LowCardinality(String),  -- 'all' or specific tenant_id
    rule_name String,
    kql_query String,  -- KQL/ClickHouse query for correlation
    severity LowCardinality(String),  -- Critical, High, Medium, Low
    enabled UInt8 DEFAULT 1,
    description String,
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (tenant_scope, rule_id);

-- Create alerts table for generated alerts
CREATE TABLE IF NOT EXISTS dev.alerts (
    alert_id String,
    tenant_id LowCardinality(String),
    rule_id String,
    event_refs String,  -- JSON array of event IDs that triggered this alert
    alert_title String,
    alert_description String,
    severity LowCardinality(String),
    status LowCardinality(String) DEFAULT 'open',  -- open, investigating, resolved, false_positive
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (tenant_id, created_at, alert_id);

-- Insert sample alert rules
INSERT INTO dev.alert_rules (rule_id, tenant_scope, rule_name, kql_query, severity, enabled, description, created_at, updated_at) VALUES
('rule-001', 'all', 'Failed Login Attempts', 'SELECT event_id, tenant_id, source_ip, user FROM dev.events WHERE event_category = ''authentication'' AND event_outcome = ''failure'' AND event_timestamp > toUnixTimestamp(now() - INTERVAL 5 MINUTE) GROUP BY source_ip, user HAVING count(*) >= 5', 'High', 1, 'Detect multiple failed login attempts from same IP', now(), now()),
('rule-002', 'tenant-demo', 'High Severity Events', 'SELECT event_id, tenant_id, source_ip, message FROM dev.events WHERE severity = ''Critical'' AND event_timestamp > toUnixTimestamp(now() - INTERVAL 1 MINUTE)', 'Critical', 1, 'Alert on critical severity events for demo tenant', now(), now()),
('rule-003', 'all', 'Threat Intel Match', 'SELECT event_id, tenant_id, source_ip, message FROM dev.events WHERE is_threat = 1 AND event_timestamp > toUnixTimestamp(now() - INTERVAL 2 MINUTE)', 'High', 1, 'Alert when threat intelligence matches are detected', now(), now());