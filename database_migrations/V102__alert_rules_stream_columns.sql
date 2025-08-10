-- V102: Add streaming-related columns to dev.alert_rules
ALTER TABLE dev.alert_rules
  ADD COLUMN IF NOT EXISTS mode LowCardinality(String) DEFAULT 'batch' AFTER enabled;

ALTER TABLE dev.alert_rules
  ADD COLUMN IF NOT EXISTS stream_window_sec UInt32 DEFAULT 60 AFTER mode;

ALTER TABLE dev.alert_rules
  ADD COLUMN IF NOT EXISTS entity_keys String DEFAULT '[]' AFTER dedup_key;

-- Optional: fast lookup index
ALTER TABLE dev.alert_rules
  ADD INDEX IF NOT EXISTS idx_rule_id rule_id TYPE set(0) GRANULARITY 1;


