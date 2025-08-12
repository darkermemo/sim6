-- V300__storage_policy.sql
-- Storage policy (hot→warm→cold) and TTL move-to-cold for events/alerts
-- Idempotent; designed to succeed in CI without S3 (all local volumes).

-- Volumes (all local by default)
CREATE VOLUME IF NOT EXISTS vol_hot  TYPE = local;
CREATE VOLUME IF NOT EXISTS vol_warm TYPE = local;
CREATE VOLUME IF NOT EXISTS vol_cold TYPE = local;

-- Policy referencing the 3 volumes
CREATE STORAGE POLICY IF NOT EXISTS siem_policy SETTINGS volumes = ('vol_hot','vol_warm','vol_cold');

-- Apply policy to core tables (ignore errors if already set)
ALTER TABLE dev.events  MODIFY SETTING storage_policy='siem_policy';
ALTER TABLE dev.alerts  MODIFY SETTING storage_policy='siem_policy';

-- Ensure TTL moves to cold for events, then deletes after retention+180 days (two-stage TTL)
-- Primary form using event_dt (present in live DDL):
ALTER TABLE dev.events  MODIFY TTL 
  event_dt + toIntervalDay(retention_days) TO VOLUME 'cold',
  event_dt + toIntervalDay(retention_days + 180) DELETE;

-- Optional fallback if schema uses event_timestamp; keep as a best-effort (may be a no-op if column missing)
-- ALTER TABLE dev.events  MODIFY TTL 
--   event_timestamp + toIntervalDay(retention_days) TO VOLUME 'cold',
--   event_timestamp + toIntervalDay(retention_days + 180) DELETE;

-- Alerts TTL (move to cold, no delete)
ALTER TABLE dev.alerts  MODIFY TTL created_at + INTERVAL 365 DAY TO VOLUME 'cold';

-- Materialize TTL to enforce immediately (safe on empty tables)
ALTER TABLE dev.events  MATERIALIZE TTL;
ALTER TABLE dev.alerts MATERIALIZE TTL;
