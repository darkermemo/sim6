-- V301__quarantine.sql
-- Quarantine tables for invalid ingest rows and rollup view

CREATE TABLE IF NOT EXISTS dev.events_quarantine (
  tenant_id UInt64 DEFAULT 0,
  received_at DateTime64(3) DEFAULT now64(3),
  source LowCardinality(String) DEFAULT 'http',
  reason LowCardinality(String),
  payload String
) ENGINE = MergeTree
PARTITION BY toDate(received_at)
ORDER BY (tenant_id, received_at);

CREATE MATERIALIZED VIEW IF NOT EXISTS dev.events_quarantine_agg
ENGINE = SummingMergeTree
PARTITION BY toDate(received_at)
ORDER BY (toStartOfHour(received_at), reason)
AS
SELECT toStartOfHour(received_at) AS hour, reason, count() AS cnt
FROM dev.events_quarantine
GROUP BY hour, reason;
