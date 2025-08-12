-- V303b__rule_watermark_adjust.sql  
-- Fallback for ClickHouse builds that struggle with ALTER TABLE ADD COLUMN IF NOT EXISTS

-- Add dedupe_hash64 to alerts if missing (use numeric type for efficiency)
ALTER TABLE dev.alerts
  ADD COLUMN IF NOT EXISTS dedupe_hash64 UInt64;

-- Ensure rule_state view includes last_error if present
CREATE OR REPLACE VIEW dev.rule_state_current AS
SELECT rule_id, tenant_id, watermark_ts, last_success_ts, last_error
FROM dev.rule_state;