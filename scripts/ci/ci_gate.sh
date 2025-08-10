#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-dev}"
ART_DIR="siem_unified_pipeline/target/test-artifacts"
OUT="$ART_DIR/final_reportv1.md"
LOG="/tmp/siem_srv.log"
mkdir -p "$ART_DIR"

post_sql () { # POST SQL via HTTP to ClickHouse
  curl -sS "$CLICKHOUSE_URL/" --data-binary "$1"
}

# 1) Prepare CH schema (idempotent)
post_sql "CREATE DATABASE IF NOT EXISTS $CLICKHOUSE_DATABASE"
post_sql "CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DATABASE.tenants
(
  tenant_id String,
  name String,
  status LowCardinality(String) DEFAULT 'ACTIVE',
  retention_days UInt16 DEFAULT 30,
  eps_quota UInt32 DEFAULT 5000,
  burst_eps UInt32 DEFAULT 10000,
  created_at UInt32,
  updated_at UInt32
) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (tenant_id)"
post_sql "CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DATABASE.tenant_limits
(
  tenant_id String,
  eps_limit UInt32,
  burst_limit UInt32,
  retention_days UInt16,
  updated_at UInt32
) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (tenant_id)"
post_sql "CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DATABASE.events
(
  event_id String,
  event_timestamp UInt32,
  tenant_id String,
  event_category String,
  event_action Nullable(String),
  event_outcome Nullable(String),
  source_ip Nullable(String),
  destination_ip Nullable(String),
  user_id Nullable(String),
  user_name Nullable(String),
  severity Nullable(String),
  message Nullable(String),
  raw_event String,
  metadata String,
  source_type Nullable(String),
  created_at UInt32
) ENGINE = MergeTree ORDER BY (tenant_id, event_timestamp)"
# Align columns/TTL if table already existed
post_sql "ALTER TABLE $CLICKHOUSE_DATABASE.events ADD COLUMN IF NOT EXISTS retention_days UInt16 DEFAULT 30"
post_sql "ALTER TABLE $CLICKHOUSE_DATABASE.events MODIFY TTL toDateTime(event_timestamp) + toIntervalDay(retention_days)"
post_sql "CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DATABASE.alert_rules
(
  rule_id String,
  id String,
  tenant_scope LowCardinality(String),
  rule_name String,
  name String,
  kql_query String,
  severity LowCardinality(String),
  enabled UInt8 DEFAULT 1,
  mode LowCardinality(String) DEFAULT 'batch',
  stream_window_sec UInt32 DEFAULT 60,
  description String,
  created_at DateTime DEFAULT now(),
  updated_at DateTime DEFAULT now(),
  source_format LowCardinality(String),
  original_rule String,
  mapping_profile LowCardinality(String),
  tags Array(String),
  dsl String,
  compiled_sql String,
  schedule_sec UInt32 DEFAULT 60,
  throttle_seconds UInt32 DEFAULT 0,
  dedup_key String DEFAULT '[]',
  entity_keys String DEFAULT '[]',
  lifecycle LowCardinality(String) DEFAULT 'active',
  INDEX idx_rule_id rule_id TYPE set(0) GRANULARITY 1
) ENGINE = MergeTree ORDER BY (tenant_scope, rule_id)"
# Align extra columns/index if table already existed
post_sql "ALTER TABLE $CLICKHOUSE_DATABASE.alert_rules ADD COLUMN IF NOT EXISTS mode LowCardinality(String) DEFAULT 'batch'"
post_sql "ALTER TABLE $CLICKHOUSE_DATABASE.alert_rules ADD COLUMN IF NOT EXISTS stream_window_sec UInt32 DEFAULT 60"
post_sql "ALTER TABLE $CLICKHOUSE_DATABASE.alert_rules ADD COLUMN IF NOT EXISTS entity_keys String DEFAULT '[]'"
post_sql "ALTER TABLE $CLICKHOUSE_DATABASE.alert_rules ADD COLUMN IF NOT EXISTS lifecycle LowCardinality(String) DEFAULT 'active'"
post_sql "ALTER TABLE $CLICKHOUSE_DATABASE.alert_rules ADD INDEX IF NOT EXISTS idx_rule_id rule_id TYPE set(0) GRANULARITY 1"
post_sql "CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DATABASE.rule_state
(
  rule_id String,
  tenant_id String,
  last_run_ts UInt32,
  last_success_ts UInt32,
  last_error String,
  last_sql String,
  dedup_hash String,
  last_alert_ts UInt32,
  updated_at UInt32
) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (tenant_id, rule_id)"
post_sql "CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DATABASE.alerts
(
  alert_id String,
  tenant_id String,
  rule_id String,
  alert_title String,
  alert_description String,
  event_refs String,
  severity LowCardinality(String),
  status LowCardinality(String),
  alert_timestamp UInt32,
  created_at UInt32,
  updated_at UInt32,
  CONSTRAINT event_refs_json CHECK isValidJSON(event_refs)
) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (tenant_id, alert_id)"

# Admin tables for UI CRUDs (idempotent)
post_sql "CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DATABASE.parsers_admin (parser_id String, name String, version UInt32, kind LowCardinality(String), body String, samples Array(String), enabled UInt8 DEFAULT 1, created_at UInt32 DEFAULT toUInt32(now()), updated_at UInt32 DEFAULT toUInt32(now())) ENGINE=MergeTree ORDER BY (name, version)"
post_sql "CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DATABASE.log_sources_admin (tenant_id String, source_id String, name String, kind LowCardinality(String), config String, enabled UInt8 DEFAULT 1, created_at UInt32 DEFAULT toUInt32(now()), updated_at UInt32 DEFAULT toUInt32(now())) ENGINE=MergeTree ORDER BY (tenant_id, source_id)"

# Seed baseline tenant and limits (idempotent-ish)
post_sql "INSERT INTO $CLICKHOUSE_DATABASE.tenants (tenant_id,name,status,retention_days,eps_quota,burst_eps,created_at,updated_at)
SELECT 'default','Default','ACTIVE',30,5000,10000,toUInt32(now()),toUInt32(now()) WHERE NOT EXISTS(SELECT 1 FROM $CLICKHOUSE_DATABASE.tenants WHERE tenant_id='default')"
post_sql "INSERT INTO $CLICKHOUSE_DATABASE.tenant_limits (tenant_id,eps_limit,burst_limit,retention_days,updated_at)
SELECT 'default',5000,10000,30,toUInt32(now()) WHERE NOT EXISTS(SELECT 1 FROM $CLICKHOUSE_DATABASE.tenant_limits WHERE tenant_id='default')"

# 2) Start server
p=$(lsof -ti tcp:9999 || true); if [ -n "$p" ]; then kill -9 $p || true; fi
( cd siem_unified_pipeline && \
  RUST_LOG="${RUST_LOG:-info}" CLICKHOUSE_URL="$CLICKHOUSE_URL" CLICKHOUSE_DATABASE="$CLICKHOUSE_DATABASE" \
    cargo run -q --bin siem-pipeline >"$LOG" 2>&1 & echo $! > /tmp/siem_srv.pid )
srv_pid=$(cat /tmp/siem_srv.pid 2>/dev/null || echo 0)
echo "siem-pipeline pid=$srv_pid"
for i in {1..60}; do curl -sf "$BASE_URL/api/v2/health" >/dev/null && break || sleep 1; done
curl -sf "$BASE_URL/api/v2/health" >/dev/null

# 3) Seed 3 matching events
post_sql "INSERT INTO $CLICKHOUSE_DATABASE.events
(event_id,event_timestamp,tenant_id,event_category,event_action,event_outcome,
 source_ip,destination_ip,user_id,user_name,severity,message,raw_event,metadata,
 source_type,created_at) VALUES
('seed-ci-1',toUInt32(now())-5,'default','auth','login','failure','10.0.0.5','10.0.0.10',NULL,'alice','HIGH','login fail','{\"msg\":\"login fail\"}','{}','app',toUInt32(now())),
('seed-ci-2',toUInt32(now())-4,'default','auth','login','failure','10.0.0.6','10.0.0.10',NULL,'bob','HIGH','login fail','{\"msg\":\"login fail\"}','{}','app',toUInt32(now())),
('seed-ci-3',toUInt32(now())-3,'default','auth','login','failure','10.0.0.7','10.0.0.10',NULL,'carol','HIGH','login fail','{\"msg\":\"login fail\"}','{}','app',toUInt32(now()))"

# 4) Build DSL + create rule
cat >/tmp/ci_dsl.json <<'JSON'
{
  "search": {
    "tenant_ids": ["default"],
    "time_range": { "last_seconds": 900 },
    "where": {
      "op": "and",
      "args": [
        {"op":"eq","args":["severity","HIGH"]},
        {"op":"contains","args":["message","fail"]}
      ]
    },
    "limit": 100
  }
}
JSON
jq -n --slurpfile d /tmp/ci_dsl.json '{name:"CI Login Fail High", description:"CI gate rule", severity:"HIGH", enabled:1, schedule_sec:60, throttle_seconds:0, dedup_key:"[\"tenant_id\",\"user_name\",\"source_ip\"]", dsl:$d[0]}' \
  > /tmp/ci_rule.json

curl -fsS -X POST "$BASE_URL/api/v2/search/compile" -H 'content-type: application/json' --data-binary @/tmp/ci_dsl.json \
  | tee "$ART_DIR/ci_compile.json" >/dev/null

create_rule_resp="$ART_DIR/ci_rule_create.json"
curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @/tmp/ci_rule.json \
  | tee "$create_rule_resp" >/dev/null

RID=$(jq -r '.id // .rule_id // empty' "$create_rule_resp")
test -n "$RID"

# 5) Dry-run & Run-now
printf '{"limit":5}\n' >/tmp/limit5.json
curl -fsS -X POST "$BASE_URL/api/v2/rules/$RID/dry-run" -H 'content-type: application/json' --data-binary @/tmp/limit5.json \
  | tee "$ART_DIR/ci_dry_run.json" >/dev/null
curl -fsS -X POST "$BASE_URL/api/v2/rules/$RID/run-now" -H 'content-type: application/json' --data-binary @/tmp/limit5.json \
  | tee "$ART_DIR/ci_run_now.json" >/dev/null

curl -fsS "$BASE_URL/api/v2/alerts?limit=5" | tee "$ART_DIR/ci_alerts.json" >/dev/null
metrics=$(curl -fsS "$BASE_URL/metrics" | egrep '^(siem_v2_(rules_run_total|alerts_written_total|search_execute_seconds))' || true)
printf "%s\n" "$metrics" > "$ART_DIR/ci_metrics.txt"

# 6) Gates
alerts_count=$(post_sql "SELECT count() FROM $CLICKHOUSE_DATABASE.alerts WHERE rule_id='$RID' AND created_at >= toUInt32(now())-300")
[ "${alerts_count:-0}" -gt 0 ] || {
  echo "CI GATE FAIL: no alerts inserted (rule=$RID)";
  echo "-- compiled_sql for rule --";
  post_sql "SELECT if(length(kql_query)>0,kql_query,compiled_sql) FROM $CLICKHOUSE_DATABASE.alert_rules WHERE rule_id='$RID' LIMIT 1 FORMAT TSV" || true;
  echo "-- last rule_state entry --";
  post_sql "SELECT last_error, last_sql FROM $CLICKHOUSE_DATABASE.rule_state WHERE rule_id='$RID' ORDER BY updated_at DESC LIMIT 1 FORMAT TSV" || true;
  exit 1;
}
grep -q "siem_v2_rules_run_total{" "$ART_DIR/ci_metrics.txt" || { echo "CI GATE FAIL: rules_run_total not observed (rule=$RID)"; exit 1; }
grep -q "siem_v2_alerts_written_total" "$ART_DIR/ci_metrics.txt" || { echo "CI GATE FAIL: alerts_written_total not observed (rule=$RID)"; exit 1; }

# 7) Append proof
ts=$(date -u +%FT%TZ)
{
  echo "### CI Gate: PASS ($ts)";
  echo "";
  echo "**Rule:** \`$RID\`";
  echo "";
  echo "**Alerts inserted (CH, last 5m):**";
  echo '```txt'; echo "$alerts_count"; echo '```';
  echo "";
  echo "**Alerts sample (API):**";
  echo '```json'; jq -c '.' "$ART_DIR/ci_alerts.json"; echo '```';
  echo "";
  echo "**Metrics snapshot (siem_v2_*):**";
  echo '```txt'; cat "$ART_DIR/ci_metrics.txt"; echo '```';
} >>"$OUT"

echo "CI Gate PASS. Proof appended to $OUT"


