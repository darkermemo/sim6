-- V309__agent_ingest_ledger.sql
-- End-to-end accounting ledger for zero-loss verification

-- Ledger table tracking every sequence number per source
CREATE TABLE IF NOT EXISTS dev.agent_ingest_ledger (
  tenant_id UInt64,
  source_id String,
  seq UInt64,
  first_seen_at DateTime64(3) DEFAULT now64(3),
  last_seen_at DateTime64(3) DEFAULT now64(3),
  status Enum8('accepted' = 1, 'quarantined' = 2, 'dlq' = 3),
  INDEX idx_seq (seq) TYPE minmax GRANULARITY 1
) ENGINE = ReplacingMergeTree(last_seen_at)
ORDER BY (tenant_id, source_id, seq)
PARTITION BY toYYYYMM(first_seen_at);

-- Materialized view to track max sequence and missing ranges
CREATE MATERIALIZED VIEW IF NOT EXISTS dev.ledger_stats_mv
ENGINE = AggregatingMergeTree()
ORDER BY (tenant_id, source_id)
AS SELECT
  tenant_id,
  source_id,
  max(seq) as max_seq,
  count() as total_count,
  countIf(status = 1) as accepted_count,
  countIf(status = 2) as quarantined_count,
  countIf(status = 3) as dlq_count,
  min(first_seen_at) as first_event_time,
  max(last_seen_at) as last_event_time
FROM dev.agent_ingest_ledger
GROUP BY tenant_id, source_id;

-- View to find missing sequence gaps
CREATE VIEW IF NOT EXISTS dev.ledger_missing AS
WITH sequences AS (
  SELECT 
    tenant_id,
    source_id,
    seq,
    lead(seq, 1, seq + 1) OVER (PARTITION BY tenant_id, source_id ORDER BY seq) as next_seq
  FROM dev.agent_ingest_ledger
)
SELECT 
  tenant_id,
  source_id,
  seq + 1 as gap_start,
  next_seq - 1 as gap_end,
  next_seq - seq - 1 as gap_size
FROM sequences
WHERE next_seq > seq + 1
ORDER BY tenant_id, source_id, seq;

-- Add sequence tracking to events table
ALTER TABLE dev.events
  ADD COLUMN IF NOT EXISTS source_seq UInt64 DEFAULT 0;

-- Index for efficient gap detection
ALTER TABLE dev.events
  ADD INDEX IF NOT EXISTS idx_source_seq (source_id, source_seq) TYPE minmax GRANULARITY 1;
