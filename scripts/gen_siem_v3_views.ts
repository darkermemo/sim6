#!/usr/bin/env node
/**
 * Zero-breaking compatibility layer generator for SIEM v3
 * Creates views that read from existing tables with optional JSON extraction
 */

const { execSync } = require('child_process');

const BASE_DB = process.env.BASE_DB || 'dev';
const BASE_TABLE = process.env.BASE_TABLE || 'events';
const TARGET_DB = 'siem_v3';

// World-class SIEM field mapping with fallbacks
const want = {
  tenant_id: "tenant_id",
  ts: "event_timestamp", 
  event_type: "event_type",
  outcome: "multiIf(event_outcome='success', 'success', event_outcome='failure', 'fail', event_outcome='blocked', 'blocked', 'unknown')",
  user: "user",
  src_ip: "toIPv6OrNull(source_ip)",
  dest_ip: "toIPv6OrNull(destination_ip)", 
  src_port: "source_port",
  dest_port: "destination_port",
  host: "host",
  event_id: "event_id",
  proc_name: "coalesce(parsed_fields['process_name'], parsed_fields['proc.name'])",
  parent_proc: "coalesce(parsed_fields['parent_process'], parsed_fields['proc.parent'])",
  uri: "coalesce(parsed_fields['path'], parsed_fields['url'], parsed_fields['uri'])",
  user_agent: "coalesce(parsed_fields['user_agent'], parsed_fields['http.user_agent'])",
  bytes_in: "toUInt64OrZero(coalesce(parsed_fields['bytes_in'], parsed_fields['network.bytes']))",
  bytes_out: "toUInt64OrZero(coalesce(parsed_fields['bytes_out'], parsed_fields['network.bytes_out']))",
  severity: "severity",
  message: "message",
  protocol: "protocol", 
  event_category: "event_category",
  event_action: "event_action",
  vendor: "vendor",
  product: "product",
  source_type: "source_type",
  parsing_status: "toString(parsing_status)",
  ti_hits: "ti_hits",
  ti_match: "ti_match",
  ext: "parsed_fields",
  raw: "raw_log"
} as const;

// Get available columns from base table
function getAvailableColumns(): Set<string> {
  try {
    const result = execSync(
      `clickhouse client --query "SELECT name FROM system.columns WHERE database='${BASE_DB}' AND table='${BASE_TABLE}' FORMAT TabSeparated"`,
      { encoding: 'utf8' }
    );
    return new Set(result.trim().split('\n'));
  } catch (error) {
    console.error('Failed to get columns:', error);
    process.exit(1);
  }
}

function generateCompatibilityView(): string {
  const availableColumns = getAvailableColumns();
  
  const selects = Object.entries(want).map(([alias, expr]) => {
    // If the exact column exists, use it directly
    if (availableColumns.has(alias)) {
      return `${alias}`;
    }
    
    // If the expression references columns that exist, use the expression
    const referencedColumns = expr.match(/\b[a-z_]+\b/g) || [];
    const allExist = referencedColumns.every(col => 
      availableColumns.has(col) || 
      col === 'parsed_fields' || // Special case for Map column
      ['multiIf', 'coalesce', 'toIPv6OrNull', 'toUInt64OrZero', 'toString'].includes(col) // Functions
    );
    
    if (allExist) {
      return `${expr} AS ${alias}`;
    }
    
    // Fallback to NULL if we can't resolve
    return `NULL AS ${alias}`;
  });

  return `
-- Zero-breaking SIEM v3 compatibility layer
-- Reads from: ${BASE_DB}.${BASE_TABLE}
-- Creates: ${TARGET_DB}.events_norm

CREATE OR REPLACE VIEW ${TARGET_DB}.events_norm AS
SELECT
  ${selects.join(',\n  ')}
FROM ${BASE_DB}.${BASE_TABLE};
`;
}

function generateAggregationTables(): string {
  return `
-- Fast aggregation tables for world-class SIEM performance

-- Authentication failures/successes by user, IP, minute
CREATE TABLE IF NOT EXISTS ${TARGET_DB}.agg_auth_min
(
  tenant_id String,
  user LowCardinality(String), 
  src_ip IPv6,
  bucket DateTime('UTC'), 
  fails UInt64, 
  succ UInt64,
  blocked UInt64
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (tenant_id, user, src_ip, bucket);

CREATE MATERIALIZED VIEW IF NOT EXISTS ${TARGET_DB}.mv_agg_auth_min
TO ${TARGET_DB}.agg_auth_min AS
SELECT 
  tenant_id, 
  user, 
  src_ip, 
  toStartOfMinute(ts) AS bucket,
  countIf(event_type IN ('login', 'auth', 'authentication') AND outcome = 'fail') AS fails,
  countIf(event_type IN ('login', 'auth', 'authentication') AND outcome = 'success') AS succ,
  countIf(event_type IN ('login', 'auth', 'authentication') AND outcome = 'blocked') AS blocked
FROM ${TARGET_DB}.events_norm
GROUP BY tenant_id, user, src_ip, bucket;

-- Network connections by source/dest, protocol
CREATE TABLE IF NOT EXISTS ${TARGET_DB}.agg_network_min
(
  tenant_id String,
  src_ip IPv6,
  dest_ip IPv6, 
  protocol LowCardinality(String),
  bucket DateTime('UTC'),
  connections UInt64,
  bytes_total UInt64
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(bucket) 
ORDER BY (tenant_id, src_ip, dest_ip, protocol, bucket);

CREATE MATERIALIZED VIEW IF NOT EXISTS ${TARGET_DB}.mv_agg_network_min
TO ${TARGET_DB}.agg_network_min AS
SELECT
  tenant_id,
  src_ip,
  dest_ip,
  protocol,
  toStartOfMinute(ts) AS bucket,
  count() AS connections,
  sum(bytes_in + bytes_out) AS bytes_total
FROM ${TARGET_DB}.events_norm
WHERE event_category IN ('network', 'firewall', 'connection')
GROUP BY tenant_id, src_ip, dest_ip, protocol, bucket;

-- Process execution events
CREATE TABLE IF NOT EXISTS ${TARGET_DB}.agg_process_min  
(
  tenant_id String,
  host LowCardinality(String),
  user LowCardinality(String),
  proc_name LowCardinality(String),
  bucket DateTime('UTC'),
  executions UInt64
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (tenant_id, host, user, proc_name, bucket);

CREATE MATERIALIZED VIEW IF NOT EXISTS ${TARGET_DB}.mv_agg_process_min
TO ${TARGET_DB}.agg_process_min AS  
SELECT
  tenant_id,
  host,
  user, 
  proc_name,
  toStartOfMinute(ts) AS bucket,
  count() AS executions
FROM ${TARGET_DB}.events_norm
WHERE event_category IN ('process', 'execution') AND proc_name != ''
GROUP BY tenant_id, host, user, proc_name, bucket;
`;
}

function generateDetectionQueries(): string {
  return `
-- World-class SIEM detection templates (read-only, safe)

-- Brute force: 50+ auth failures then 1 success within 3 minutes
SELECT 
  tenant_id, user, src_ip, 
  count() as total_attempts,
  countIf(outcome = 'fail') as failures,
  countIf(outcome = 'success') as successes
FROM ${TARGET_DB}.events_norm 
WHERE 
  event_type IN ('login', 'auth', 'authentication')
  AND ts >= now() - INTERVAL 3 MINUTE
GROUP BY tenant_id, user, src_ip
HAVING failures >= 50 AND successes >= 1
ORDER BY failures DESC;

-- Suspicious process execution: rare process launched by many users
WITH rare_procs AS (
  SELECT proc_name, uniq(user) as user_count
  FROM ${TARGET_DB}.events_norm
  WHERE event_category = 'process' AND ts >= now() - INTERVAL 1 HOUR
  GROUP BY proc_name  
  HAVING user_count >= 10
)
SELECT 
  tenant_id, host, user, proc_name,
  count() as exec_count,
  min(ts) as first_seen,
  max(ts) as last_seen
FROM ${TARGET_DB}.events_norm e
JOIN rare_procs r ON e.proc_name = r.proc_name
WHERE ts >= now() - INTERVAL 1 HOUR
GROUP BY tenant_id, host, user, proc_name
ORDER BY exec_count DESC;

-- Lateral movement: authentication from multiple IPs by same user
SELECT 
  tenant_id, user,
  uniq(src_ip) as unique_ips,
  groupArray(DISTINCT src_ip) as source_ips,
  count() as total_logins
FROM ${TARGET_DB}.events_norm
WHERE 
  event_type IN ('login', 'auth') 
  AND outcome = 'success'
  AND ts >= now() - INTERVAL 1 HOUR
GROUP BY tenant_id, user
HAVING unique_ips >= 3
ORDER BY unique_ips DESC;
`;
}

// Main execution
function main() {
  console.log('-- 🌟 SIEM v3 Compatibility Layer Generator');
  console.log('-- Zero-breaking changes, add-only approach');
  console.log('-- Base table:', `${BASE_DB}.${BASE_TABLE}`);
  console.log('');
  
  // Generate the compatibility view
  console.log(generateCompatibilityView());
  console.log('');
  
  // Generate aggregation tables  
  console.log(generateAggregationTables());
  console.log('');
  
  // Generate detection templates as comments
  console.log('-- Detection query examples (copy/paste to test):');
  console.log(generateDetectionQueries());
}

main();
