-- v2 Rules Engine schema (alerts aggregated, rules, rule_state)

CREATE TABLE IF NOT EXISTS dev.alerts
(
  alert_id          String,
  tenant_id         String,
  rule_id           String,
  alert_title       String,
  alert_description String,
  event_refs        String,
  severity          LowCardinality(String),
  status            LowCardinality(String),
  alert_timestamp   UInt32,
  created_at        UInt32,
  updated_at        UInt32
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, alert_timestamp, rule_id, alert_id);

CREATE TABLE IF NOT EXISTS dev.alert_rules
(
  id               String,
  tenant_scope     String,
  name             String,
  description      String,
  severity         LowCardinality(String),
  enabled          UInt8,
  dsl              String,
  compiled_sql     String,
  schedule_sec     UInt32,
  throttle_seconds UInt32,
  dedup_key        String,
  created_at       UInt32,
  updated_at       UInt32
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_scope, id);

CREATE TABLE IF NOT EXISTS dev.rule_state
(
  rule_id         String,
  tenant_id       String,
  last_run_ts     UInt32,
  last_success_ts UInt32,
  last_error      String,
  last_sql        String,
  dedup_hash      String,
  last_alert_ts   UInt32,
  updated_at      UInt32
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, rule_id);


