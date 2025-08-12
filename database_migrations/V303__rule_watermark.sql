-- V303__rule_watermark.sql
-- Add watermark tracking and deduplication columns for PR-04

-- Add watermark and status columns to rule_state
ALTER TABLE dev.rule_state
  ADD COLUMN IF NOT EXISTS watermark_ts    DateTime64(3) DEFAULT toDateTime64(0,3),
  ADD COLUMN IF NOT EXISTS last_success_ts DateTime64(3) DEFAULT toDateTime64(0,3),
  ADD COLUMN IF NOT EXISTS last_error      LowCardinality(String) DEFAULT '';

-- Create view for current rule state
CREATE VIEW IF NOT EXISTS dev.rule_state_current AS
SELECT rule_id, tenant_id, watermark_ts, last_success_ts, last_error
FROM dev.rule_state;

-- Add deduplication columns to alerts table
ALTER TABLE dev.alerts
  ADD COLUMN IF NOT EXISTS alert_key   String,
  ADD COLUMN IF NOT EXISTS dedupe_hash UInt64;