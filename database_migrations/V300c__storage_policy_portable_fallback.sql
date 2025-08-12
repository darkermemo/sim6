-- Portable retention without storage policies/volumes.
-- Works on older CH builds. Safe to re-run.

-- Events: use event_dt when present; otherwise derive from event_timestamp.
ALTER TABLE dev.events
  MODIFY TTL (ifNull(event_dt, toDate(event_timestamp))) + toIntervalDay(retention_days);

ALTER TABLE dev.events MATERIALIZE TTL;

-- Alerts: conservative year retention.
ALTER TABLE dev.alerts
  MODIFY TTL created_at + INTERVAL 365 DAY;

ALTER TABLE dev.alerts MATERIALIZE TTL;