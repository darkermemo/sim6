#!/usr/bin/env bash
# scripts/soak_run.sh
# Long-running soak test for the SIEM. Runs end-to-end ingest + rules, logs metrics, and emits a strict PASS/FAIL summary.

set -Eeuo pipefail

## -------- Config (override via env) -----------------------------------------
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-dev}"

# Duration in seconds (48h default). Use 86400 for 24h, 7200 for quick trial, etc.
DURATION_SEC="${DURATION_SEC:-172800}"

# Tenants to simulate (space-delimited)
TENANTS="${TENANTS:-default tenant_1 tenant_2 tenant_3 tenant_4}"

# Sources per tenant to generate
SOURCES="${SOURCES:-okta-system-log zeek-http otel-logs}"

# Generator batch + sleep => tune EPS ~= (batch / sleep) * sources per tenant
GEN_BATCH="${GEN_BATCH:-300}"
GEN_SLEEP_SEC="${GEN_SLEEP_SEC:-5}"

# Sampling cadence
METRICS_EVERY_SEC="${METRICS_EVERY_SEC:-60}"
RESOURCE_EVERY_SEC="${RESOURCE_EVERY_SEC:-3600}"

# How far back to check rule_state errors at the end (min(6h, DURATION))
CHECK_WINDOW_SEC_DEFAULT=$((6*3600))

# Runtime id
RUN_ID="${RUN_ID:-SOAK-$(date -u +%Y%m%d-%H%M%SZ)}"

## -------- Paths -------------------------------------------------------------
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ART="$ROOT/target/soak"
LOG="/tmp/siem_srv.log"
PID_FILE="/tmp/siem_srv.pid"
mkdir -p "$ART"

note(){ printf '[soak] %s\n' "$*"; }
post_sql(){ curl -sS "$CLICKHOUSE_URL/" --data-binary "$1"; }

## -------- Bootstrap ClickHouse tables (idempotent) --------------------------
note "Ensuring ClickHouse DB/tables exist"
post_sql "CREATE DATABASE IF NOT EXISTS $CLICKHOUSE_DATABASE"
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
  created_at UInt32,
  retention_days UInt16 DEFAULT 30
) ENGINE = MergeTree
PARTITION BY toYYYYMM(toDateTime(event_timestamp))
ORDER BY (event_timestamp, event_id)
TTL toDateTime(event_timestamp) + toIntervalDay(retention_days)"
post_sql "CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DATABASE.alert_rules
(
  rule_id String, id String, tenant_scope LowCardinality(String),
  rule_name String, name String, kql_query String,
  severity LowCardinality(String), enabled UInt8 DEFAULT 1,
  mode LowCardinality(String) DEFAULT 'batch',
  stream_window_sec UInt32 DEFAULT 60,
  description String, created_at DateTime DEFAULT now(), updated_at DateTime DEFAULT now(),
  source_format LowCardinality(String), original_rule String, mapping_profile LowCardinality(String),
  tags Array(String), dsl String, compiled_sql String,
  schedule_sec UInt32 DEFAULT 60, throttle_seconds UInt32 DEFAULT 0,
  dedup_key String DEFAULT '[]', entity_keys String DEFAULT '[]'
) ENGINE = MergeTree
ORDER BY (tenant_scope, rule_id)"
post_sql "CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DATABASE.rule_state
(
  rule_id String, tenant_id String, last_run_ts UInt32, last_success_ts UInt32,
  last_error String, last_sql String, dedup_hash String, last_alert_ts UInt32, updated_at UInt32
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, rule_id)"
post_sql "CREATE TABLE IF NOT EXISTS $CLICKHOUSE_DATABASE.alerts
(
  alert_id String, tenant_id String, rule_id String,
  alert_title String, alert_description String, event_refs String,
  severity LowCardinality(String), status LowCardinality(String),
  alert_timestamp UInt32, created_at UInt32, updated_at UInt32,
  CONSTRAINT event_refs_json CHECK isValidJSON(event_refs)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (tenant_id, alert_id)"

## -------- Start API server if needed ----------------------------------------
note "Starting API with RUN_ID=$RUN_ID"
p=$(lsof -ti tcp:9999 || true); if [ -n "$p" ]; then kill -9 $p || true; fi
(
  cd "$ROOT/siem_unified_pipeline"
  RUST_LOG="${RUST_LOG:-info}" RUN_ID="$RUN_ID" CLICKHOUSE_URL="$CLICKHOUSE_URL" CLICKHOUSE_DATABASE="$CLICKHOUSE_DATABASE" \
    cargo run -q --bin siem-pipeline >"$LOG" 2>&1 &
  echo $! > "$PID_FILE"
)
srv_pid=$(cat "$PID_FILE" 2>/dev/null || echo 0)
for i in {1..120}; do curl -fsS "$BASE_URL/health" >/dev/null 2>&1 && break || sleep 0.5; done
curl -fsS "$BASE_URL/health" | tee "$ART/health.json" >/dev/null
note "API up (pid=$srv_pid)"

## -------- Build generator CLI once ------------------------------------------
note "Building siem CLI"
( cd "$ROOT/siem_tools" && cargo build -q --bin siem )
SIEM_CLI="$ROOT/siem_tools/target/debug/siem"

## -------- Ingest loops (background) -----------------------------------------
P_INGEST=()
gen_loop() {
  local tenant="$1"
  while :; do
    for src in $SOURCES; do
      # Files per round
      out="/tmp/${tenant}.${src}.ndjson"
      "$SIEM_CLI" gen "$src" --seed 42 --count "$GEN_BATCH" --tenant "$tenant" --out /dev/null --out-ndjson "$out"
      "$SIEM_CLI" load-ch --file "$out" --table "$CLICKHOUSE_DATABASE.events" || true
    done
    sleep "$GEN_SLEEP_SEC"
  done
}
note "Starting ingest loops for tenants: $TENANTS (sources: $SOURCES)"
for t in $TENANTS; do
  gen_loop "$t" &
  P_INGEST+=("$!")
done

## -------- Seed a small rule pack (once) -------------------------------------
note "Seeding baseline rules (if not present)"
cat > /tmp/_dsl_http_mozilla.json <<'JSON'
{"search":{"tenant_ids":["default"],"time_range":{"last_seconds":1800},
 "where":{"op":"and","args":[
   {"op":"eq","args":["event_category","http"]},
   {"op":"contains","args":["message","GET"]},
   {"op":"eq","args":["json_meta","http.user_agent","Mozilla"]}
 ]}}}
JSON
jq -n --slurpfile d /tmp/_dsl_http_mozilla.json \
  '{name:"Soak HTTP UA Mozilla", description:"soak", severity:"LOW", enabled:1, schedule_sec:60, throttle_seconds:0, dedup_key:"[""tenant_id"", ""source_ip""]", dsl:$d[0]}' \
  > /tmp/_rule_http_mozilla.json
curl -sS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @/tmp/_rule_http_mozilla.json \
  | tee "$ART/rule_create.json" >/dev/null

## -------- Metrics/resource samplers -----------------------------------------
note "Starting samplers (metrics every ${METRICS_EVERY_SEC}s, resources every ${RESOURCE_EVERY_SEC}s)"
P_METRICS=""
P_RES=""

metrics_loop() {
  while :; do
    ts=$(date -u +%FT%TZ)
    echo "### $ts" >> "$ART/soak_metrics.log"
    curl -sS "$BASE_URL/metrics" \
      | egrep '^(siem_v2_(rules_run_total|alerts_written_total|search_execute_seconds|compile_total))' \
      >> "$ART/soak_metrics.log" || true
    sleep "$METRICS_EVERY_SEC"
  done
}
resources_loop() {
  while :; do
    ts=$(date -u +%FT%TZ)
    echo "### $ts" >> "$ART/soak_ps.log"
    ps -o pid,rss,pcpu,etime,cmd -p "$srv_pid" >> "$ART/soak_ps.log" || true
    echo "### $ts" >> "$ART/soak_fds.log"
    lsof -p "$srv_pid" 2>/dev/null | wc -l >> "$ART/soak_fds.log" || echo 0 >> "$ART/soak_fds.log"
    # Also capture rule_state recent errors
    curl -sS "$CLICKHOUSE_URL/" --data-binary \
'SELECT rule_id, tenant_id, last_error, updated_at
 FROM dev.rule_state
 WHERE updated_at >= toUInt32(now())-900 AND last_error != ''''
 ORDER BY updated_at DESC LIMIT 50 FORMAT Pretty' \
      >> "$ART/soak_rule_errors.log" || true
    sleep "$RESOURCE_EVERY_SEC"
  done
}
metrics_loop & P_METRICS=$!
resources_loop & P_RES=$!

## -------- Baseline + End metrics for deltas ---------------------------------
curl -sS "$BASE_URL/metrics" > "$ART/metrics_start.prom" || true

## -------- Soak main wait ----------------------------------------------------
note "Running for ${DURATION_SEC}s … (Ctrl+C to stop early)"
END_AT=$(( $(date +%s) + DURATION_SEC ))
while [ "$(date +%s)" -lt "$END_AT" ]; do sleep 5; done

## -------- Cleanup & final checks --------------------------------------------
note "Stopping background loops"
for p in "${P_INGEST[@]}"; do kill "$p" >/dev/null 2>&1 || true; done
kill "$P_METRICS" >/dev/null 2>&1 || true
kill "$P_RES" >/dev/null 2>&1 || true

curl -sS "$BASE_URL/metrics" > "$ART/metrics_end.prom" || true

# Compute metrics deltas (simple sums)
sum_metric () {
  # $1 = file, $2 = metric name regex
  awk -v m="$2" '$0 ~ m { val=$NF; if (val+0==val) s+=val } END{ printf("%.0f", s+0); }' "$1" 2>/dev/null || echo 0
}
ALERTS_START=$(sum_metric "$ART/metrics_start.prom" '^siem_v2_alerts_written_total')
ALERTS_END=$(sum_metric "$ART/metrics_end.prom"   '^siem_v2_alerts_written_total')
RULEERR_START=$(awk '/^siem_v2_rules_run_total/ && /outcome="error"/ { s+=$NF } END{ printf("%.0f", s+0) }' "$ART/metrics_start.prom" 2>/dev/null || echo 0)
RULEERR_END=$(awk   '/^siem_v2_rules_run_total/ && /outcome="error"/ { s+=$NF } END{ printf("%.0f", s+0) }' "$ART/metrics_end.prom"   2>/dev/null || echo 0)

# Idempotency check over last 30m
DUP_SUM=$(curl -sS "$CLICKHOUSE_URL/" --data-binary \
"WITH toUInt32(now()) AS nowu SELECT sum(cnt - u) FROM (
  SELECT rule_id, tenant_id, toStartOfInterval(toDateTime(alert_timestamp), INTERVAL 5 MIN) w,
         count() cnt, uniq(alert_id) u
  FROM $CLICKHOUSE_DATABASE.alerts
  WHERE created_at >= nowu - 1800
  GROUP BY rule_id,tenant_id,w
)" 2>/dev/null || echo 0)
DUP_SUM=${DUP_SUM:-0}

# Rule errors window (min(6h, DURATION))
CHECK_WINDOW="$CHECK_WINDOW_SEC_DEFAULT"
if [ "$DURATION_SEC" -lt "$CHECK_WINDOW_SEC_DEFAULT" ]; then CHECK_WINDOW="$DURATION_SEC"; fi
RULE_ERRS_RECENT=$(curl -sS "$CLICKHOUSE_URL/" --data-binary \
"SELECT count() FROM $CLICKHOUSE_DATABASE.rule_state WHERE updated_at >= toUInt32(now())-$CHECK_WINDOW AND last_error!=''" 2>/dev/null || echo 0)
RULE_ERRS_RECENT=${RULE_ERRS_RECENT:-0}

# Resource drift (RSS from first/last lines)
RSS_FIRST=$(awk 'NR==2 {print $2; exit}' "$ART/soak_ps.log" 2>/dev/null || echo 0)
RSS_LAST=$(awk '/^###/ {t=$0; next} NF>0 {rss=$2} END{print rss+0}' "$ART/soak_ps.log" 2>/dev/null || echo 0)
RSS_GROW_OK=1
if [ "${RSS_FIRST:-0}" -gt 0 ] && [ "${RSS_LAST:-0}" -gt 0 ]; then
  # allow up to +10%
  awk -v a="$RSS_FIRST" -v b="$RSS_LAST" 'BEGIN{exit ! (b <= a*1.10)}'
  RSS_GROW_OK=$?
fi

# Build summary JSON
jq -n \
  --arg run_id "$RUN_ID" \
  --arg duration_sec "$DURATION_SEC" \
  --arg tenants "$TENANTS" \
  --arg sources "$SOURCES" \
  --arg base_url "$BASE_URL" \
  --arg ch_url "$CLICKHOUSE_URL" \
  --arg ch_db "$CLICKHOUSE_DATABASE" \
  --argjson alerts_start "${ALERTS_START:-0}" \
  --argjson alerts_end   "${ALERTS_END:-0}" \
  --argjson ruleerr_start "${RULEERR_START:-0}" \
  --argjson ruleerr_end   "${RULEERR_END:-0}" \
  --argjson dup_sum "${DUP_SUM:-0}" \
  --argjson rule_errs_recent "${RULE_ERRS_RECENT:-0}" \
  --argjson rss_first "${RSS_FIRST:-0}" \
  --argjson rss_last  "${RSS_LAST:-0}" \
  --argjson rss_grow_ok "${RSS_GROW_OK:-1}" \
  '{
    run_id:$run_id, duration_sec:$duration_sec|tonumber,
    base_url:$base_url, clickhouse:{url:$ch_url, db:$ch_db},
    tenants:($tenants|split(" ")), sources:($sources|split(" ")),
    metrics:{
      alerts_written_total:{start:$alerts_start, end:$alerts_end, delta:($alerts_end-$alerts_start)},
      rules_run_error_total:{start:$ruleerr_start, end:$ruleerr_end, delta:($ruleerr_end-$ruleerr_start)}
    },
    idempotency:{dup_alert_ids_last_30m:$dup_sum|tonumber},
    scheduler_errors_recent: $rule_errs_recent|tonumber,
    resources:{rss_first_kb:$rss_first, rss_last_kb:$rss_last, within_10pct:(($rss_grow_ok==0))}
  }' | tee "$ART/soak_summary.json" >/dev/null

# PASS/FAIL rules
PASS=1
# 1) Alerts flowing
if [ $((ALERTS_END-ALERTS_START)) -le 0 ]; then note "FAIL: alerts_written_total did not increase"; PASS=0; fi
# 2) No new scheduler errors
if [ $((RULEERR_END-RULEERR_START)) -gt 0 ]; then note "FAIL: rules_run_total{outcome=error} increased"; PASS=0; fi
# 3) No dup alerts in last 30m
if [ "${DUP_SUM:-0}" -gt 0 ]; then note "FAIL: duplicate alert_id detected in last 30m"; PASS=0; fi
# 4) Recent rule_state errors window
if [ "${RULE_ERRS_RECENT:-0}" -gt 0 ]; then note "FAIL: rule_state shows recent errors ($RULE_ERRS_RECENT)"; PASS=0; fi
# 5) RSS within 10%
if [ "${RSS_GROW_OK:-1}" -ne 0 ]; then note "FAIL: RSS grew >10% (first=${RSS_FIRST}kB,last=${RSS_LAST}kB)"; PASS=0; fi

echo
if [ "$PASS" -eq 1 ]; then
  note "SOAK PASS ✅  (summary at $ART/soak_summary.json)"
  exit 0
else
  note "SOAK FAIL ❌  (see $ART for logs: soak_metrics.log, soak_rule_errors.log, soak_ps.log, soak_fds.log, soak_summary.json)"
  exit 1
fi

