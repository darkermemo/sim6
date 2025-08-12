-- Extend dev.alert_rules with Sigma-related columns

ALTER TABLE dev.alert_rules ADD COLUMN IF NOT EXISTS source_format LowCardinality(String) AFTER updated_at;
ALTER TABLE dev.alert_rules ADD COLUMN IF NOT EXISTS original_rule String AFTER source_format;
ALTER TABLE dev.alert_rules ADD COLUMN IF NOT EXISTS mapping_profile LowCardinality(String) AFTER original_rule;
ALTER TABLE dev.alert_rules ADD COLUMN IF NOT EXISTS tags Array(String) AFTER mapping_profile;


