-- V305__parsers_normalize_intel.sql
-- Bind parser to source, add normalized columns, and create intel tables

-- Bind parser to source
ALTER TABLE dev.log_sources_admin
  ADD COLUMN IF NOT EXISTS parser_id LowCardinality(String) DEFAULT '';

-- Normalized columns on events (idempotent)
ALTER TABLE dev.events
  ADD COLUMN IF NOT EXISTS event_category LowCardinality(String) DEFAULT '',
  ADD COLUMN IF NOT EXISTS event_type     LowCardinality(String) DEFAULT '',
  ADD COLUMN IF NOT EXISTS action         LowCardinality(String) DEFAULT '',
  ADD COLUMN IF NOT EXISTS user           LowCardinality(String) DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_ip      IPv4 DEFAULT toIPv4(0),
  ADD COLUMN IF NOT EXISTS destination_ip IPv4 DEFAULT toIPv4(0),
  ADD COLUMN IF NOT EXISTS host           LowCardinality(String) DEFAULT '',
  ADD COLUMN IF NOT EXISTS severity       Int16 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor         LowCardinality(String) DEFAULT '',
  ADD COLUMN IF NOT EXISTS product        LowCardinality(String) DEFAULT '',
  ADD COLUMN IF NOT EXISTS parsed_fields  Map(String, String) DEFAULT map(),
  ADD COLUMN IF NOT EXISTS ti_hits        Array(String) DEFAULT [],
  ADD COLUMN IF NOT EXISTS ti_match       UInt8 DEFAULT 0;

-- Intel/watchlist (small hot path)
CREATE TABLE IF NOT EXISTS dev.intel_iocs (
  ioc String, 
  kind LowCardinality(String) -- e.g., 'ip','domain','hash'
) ENGINE=ReplacingMergeTree ORDER BY (kind, ioc);

-- Effective MV for quick lookups (optional)
CREATE VIEW IF NOT EXISTS dev.intel_iocs_v AS
SELECT * FROM dev.intel_iocs;
