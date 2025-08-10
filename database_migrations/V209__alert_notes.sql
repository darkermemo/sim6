-- Optional notes for alerts
CREATE TABLE IF NOT EXISTS dev.alert_notes
(
  tenant_id String,
  alert_id String,
  note_id String,
  body String,
  created_at DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (tenant_id, alert_id, note_id);


