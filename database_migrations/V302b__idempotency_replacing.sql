-- V302b__idempotency_replacing.sql
-- Make idempotency deterministic using ReplacingMergeTree(version)

CREATE TABLE IF NOT EXISTS dev.idempotency_keys_v2 (
  key String,
  route LowCardinality(String),
  first_seen_at DateTime64(3) DEFAULT now64(3),
  body_hash UInt64,
  last_status UInt16,
  last_reason LowCardinality(String) DEFAULT '',
  attempts UInt32 DEFAULT 1,
  version UInt64 DEFAULT toUInt64(now64(3) * 1000)
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toDate(first_seen_at)
ORDER BY (key, route)
TTL first_seen_at + INTERVAL 1 DAY;

-- Migrate existing rows if the old table exists
INSERT INTO dev.idempotency_keys_v2 (key, route, first_seen_at, body_hash, last_status, last_reason, attempts)
SELECT key, route, first_seen_at, body_hash, last_status, last_reason, attempts
FROM dev.idempotency_keys
SETTINGS insert_allow_materialized_columns = 0
;

-- Swap tables atomically (if old exists)
RENAME TABLE dev.idempotency_keys TO idempotency_keys_old,
             dev.idempotency_keys_v2 TO idempotency_keys;

DROP TABLE IF EXISTS dev.idempotency_keys_old;
