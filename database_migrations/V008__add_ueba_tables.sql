-- V008: User and Entity Behavior Analytics (UEBA) tables
-- Creates behavioral_baselines and ueba_anomalies tables

-- Behavioral baselines table: Stores UEBA behavioral baselines for users and entities
CREATE TABLE IF NOT EXISTS dev.behavioral_baselines (
    baseline_id String,                    -- UUID for the baseline record
    tenant_id String,                      -- Tenant isolation
    entity_id String,                      -- Username, IP, hostname, etc.
    entity_type LowCardinality(String),    -- "user", "server", "workstation", etc.
    metric String,                         -- Behavior metric name
    baseline_value_avg Float64,            -- Average value of the behavior
    baseline_value_stddev Float64,         -- Standard deviation of the behavior
    sample_count UInt32,                   -- Number of data points used for calculation
    calculation_period_days UInt32,        -- Period used for calculation (e.g., 30 days)
    confidence_score Float64,              -- Confidence in the baseline (0.0-1.0)
    last_updated UInt32,                   -- Unix timestamp of last update
    created_at UInt32                      -- Unix timestamp of creation
) ENGINE = MergeTree()
PARTITION BY (tenant_id, entity_type)
ORDER BY (tenant_id, entity_type, entity_id, metric);

-- UEBA anomalies table: Stores detected behavioral anomalies
CREATE TABLE IF NOT EXISTS dev.ueba_anomalies (
    anomaly_id String,                     -- UUID for the anomaly
    tenant_id String,                      -- Tenant isolation
    entity_id String,                      -- Entity that exhibited anomalous behavior
    entity_type LowCardinality(String),    -- Type of entity
    metric String,                         -- Behavior metric that was anomalous
    baseline_value Float64,                -- Expected baseline value
    observed_value Float64,                -- Actual observed value
    deviation_score Float64,               -- Standard deviations from baseline
    severity LowCardinality(String),       -- "Low", "Medium", "High", "Critical"
    detection_timestamp UInt32,            -- When the anomaly was detected
    related_events Array(String),          -- Event IDs that contributed to anomaly
    status LowCardinality(String) DEFAULT 'open', -- "open", "investigating", "closed"
    created_at UInt32
) ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(toDateTime(detection_timestamp)))
ORDER BY (tenant_id, detection_timestamp, entity_id);