-- Incidents (aggregated)
CREATE TABLE IF NOT EXISTS dev.incidents
(
  incident_id String,
  tenant_id   String,
  title       String,
  description String,
  severity    LowCardinality(String), -- LOW|MEDIUM|HIGH|CRITICAL
  status      LowCardinality(String), -- OPEN|TRIAGED|IN_PROGRESS|CONTAINED|RESOLVED|CLOSED
  owner       String,
  entity_keys String,                 -- JSON array of keys used to group (e.g. ["user_name","source_ip"])
  entities    String,                 -- JSON object {user_name:"alice",source_ip:"10.0.0.5",...}
  rule_ids    Array(String),          -- rules contributing
  alert_count UInt32,
  first_alert_ts UInt32,
  last_alert_ts  UInt32,
  created_at UInt32,
  updated_at UInt32
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, incident_id);

-- Incident↔Alert mapping (many-to-one)
CREATE TABLE IF NOT EXISTS dev.incident_alerts
(
  tenant_id   String,
  incident_id String,
  alert_id    String,
  created_at  UInt32
) ENGINE = MergeTree
ORDER BY (tenant_id, incident_id, alert_id);


