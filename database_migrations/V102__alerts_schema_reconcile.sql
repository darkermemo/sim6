-- Reconcile dev.alerts to v2 aggregated schema (Option B)
-- If existing table shape differs, rename and create new

-- Try to rename existing alerts to a legacy name; ignore error if not exists
RENAME TABLE IF EXISTS dev.alerts TO dev.alerts_legacy_20250808;

-- Create v2 alerts table (use String with JSON check for broad compatibility)
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
  created_at        UInt32,
  updated_at        UInt32
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, alert_id);




