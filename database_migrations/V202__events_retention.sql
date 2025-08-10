-- Add retention support to events
ALTER TABLE dev.events ADD COLUMN IF NOT EXISTS retention_days UInt16 DEFAULT 30;
ALTER TABLE dev.events MODIFY TTL toDateTime(event_timestamp) + toIntervalDay(retention_days);


