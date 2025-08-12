-- Log Sources & Parsers: Connect • Test • Normalize
-- Admin can add sources, test connectivity, attach parsers, preview normalized output

-- Log sources admin table
CREATE TABLE IF NOT EXISTS dev.log_sources_admin
(
  tenant_id UInt64,
  source_id String,
  name String,
  kind LowCardinality(String),            -- e.g., "windows","zeek","f5","paloalto"
  transport LowCardinality(String),       -- "syslog-udp","syslog-tcp","http"
  endpoint String,                         -- host:port or relative URL for http
  parser_id String DEFAULT '',
  status LowCardinality(String) DEFAULT 'ENABLED',
  created_at DateTime64(3) DEFAULT now64(3),
  updated_at DateTime64(3) DEFAULT now64(3)
) ENGINE=ReplacingMergeTree ORDER BY (tenant_id, source_id);

-- Parsers admin table
CREATE TABLE IF NOT EXISTS dev.parsers_admin
(
  parser_id String,
  name String,
  version UInt32,
  kind LowCardinality(String),            -- "NATIVE"|"SIGMA"|"JSON"
  body String,
  created_at DateTime64(3) DEFAULT now64(3)
) ENGINE=ReplacingMergeTree ORDER BY (parser_id, version);

-- Test connection tokens (temporary)
CREATE TABLE IF NOT EXISTS dev.test_connection_tokens
(
  token String,
  tenant_id UInt64,
  source_id String,
  mode LowCardinality(String),            -- "syslog"|"http"
  created_at DateTime64(3) DEFAULT now64(3),
  expires_at DateTime64(3) DEFAULT now64(3) + toIntervalMinute(1),
  buffer_data String DEFAULT ''           -- JSON array of test samples
) ENGINE=MergeTree ORDER BY (token, created_at)
TTL created_at + toIntervalMinute(1);

-- Indexes for performance
ALTER TABLE dev.log_sources_admin ADD INDEX idx_tenant_status (tenant_id, status) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.log_sources_admin ADD INDEX idx_kind (kind) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.log_sources_admin ADD INDEX idx_transport (transport) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.log_sources_admin ADD INDEX idx_parser (parser_id) TYPE bloom_filter GRANULARITY 1;

ALTER TABLE dev.parsers_admin ADD INDEX idx_kind (kind) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.parsers_admin ADD INDEX idx_name (name) TYPE bloom_filter GRANULARITY 1;

ALTER TABLE dev.test_connection_tokens ADD INDEX idx_token (token) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE dev.test_connection_tokens ADD INDEX idx_expires (expires_at) TYPE bloom_filter GRANULARITY 1;

-- Comments
ALTER TABLE dev.log_sources_admin COMMENT 'Admin-managed log sources with parser attachments';
ALTER TABLE dev.parsers_admin COMMENT 'Parser definitions for log normalization';
ALTER TABLE dev.test_connection_tokens COMMENT 'Temporary tokens for testing source connectivity';
