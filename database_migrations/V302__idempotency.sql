-- V302__idempotency.sql
-- Idempotency store with 24h TTL and recent view

CREATE TABLE IF NOT EXISTS dev.idempotency_keys (
  key String,
  route LowCardinality(String),
  first_seen_at DateTime64(3) DEFAULT now64(3),
  body_hash UInt64,
  last_status UInt16,
  last_reason LowCardinality(String) DEFAULT '',
  attempts UInt32 DEFAULT 1
) ENGINE = ReplacingMergeTree()
PARTITION BY toDate(first_seen_at)
ORDER BY (key, route)
TTL first_seen_at + INTERVAL 1 DAY;

CREATE VIEW IF NOT EXISTS dev.idempotency_recent AS
SELECT key, route, first_seen_at, attempts, last_status
FROM dev.idempotency_keys
WHERE first_seen_at >= now()-INTERVAL 1 DAY;
