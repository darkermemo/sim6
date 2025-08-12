-- V303c__rule_watermark_fix.sql
-- Ensure correct types (portable add/copy/swap)
ALTER TABLE dev.rule_state
  ADD COLUMN IF NOT EXISTS watermark_ts    DateTime64(3) DEFAULT toDateTime64(0,3),
  ADD COLUMN IF NOT EXISTS last_success_ts DateTime64(3) DEFAULT toDateTime64(0,3),
  ADD COLUMN IF NOT EXISTS last_error      LowCardinality(String) DEFAULT '';

-- If last_success_ts was a numeric, migrate via temp column
ALTER TABLE dev.rule_state
  ADD COLUMN IF NOT EXISTS _last_success_ts_dt DateTime64(3) DEFAULT toDateTime64(0,3);
ALTER TABLE dev.rule_state
  UPDATE _last_success_ts_dt = toDateTime64(last_success_ts, 3) WHERE 1;
ALTER TABLE dev.rule_state DROP COLUMN IF EXISTS last_success_ts;
ALTER TABLE dev.rule_state RENAME COLUMN _last_success_ts_dt TO last_success_ts;

-- Alerts dedupe columns (idempotent)
ALTER TABLE dev.alerts
  ADD COLUMN IF NOT EXISTS alert_key   String,
  ADD COLUMN IF NOT EXISTS dedupe_hash UInt64;

-- Refresh view
CREATE VIEW IF NOT EXISTS dev.rule_state_current AS
SELECT rule_id, tenant_id, watermark_ts, last_success_ts, last_error
FROM dev.rule_state;
