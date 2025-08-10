#!/usr/bin/env bash
set -Eeuo pipefail

# --- Config (override via env if needed) ---
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-dev}"
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
TENANT="${TENANT:-default}"
ART_DIR="siem_unified_pipeline/target/test-artifacts"
LOG_API="/tmp/siem_srv.log"
LOG_RUNNER="/tmp/siem_runner.log"
mkdir -p "$ART_DIR"

note(){ printf '[stream] %s\n' "$*"; }

# --- 0) Preconditions ---
note "health"
curl -fsS "$BASE_URL/api/v2/health" -o "$ART_DIR/health_stream.json" >/dev/null
note "backends"
curl -fsS "$CLICKHOUSE_URL/ping" >/dev/null
REDIS_OK=0
if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1; then REDIS_OK=1; fi
fi

# --- 1) Start runner (bound to new rule later) ---
note "runner (re)start"
pkill -f siem-stream-runner || true
(
  cd siem_unified_pipeline
  RUST_LOG=${RUST_LOG:-debug},siem_unified_pipeline=debug \
  CLICKHOUSE_URL="$CLICKHOUSE_URL" CLICKHOUSE_DATABASE="$CLICKHOUSE_DATABASE" \
  REDIS_URL="$REDIS_URL" \
  cargo run --bin siem-stream-runner >"$LOG_RUNNER" 2>&1 &
  echo $! > /tmp/siem_runner.pid
)
sleep 2

# --- 2) Bump tenant limits high to avoid 429 ---
note "limits"
cat > /tmp/limits_high.json <<'JSON'
{"eps_limit":1000,"burst_limit":1000,"retention_days":30}
JSON
curl -fsS -X PUT -H 'content-type: application/json' \
  --data-binary @/tmp/limits_high.json \
  "$BASE_URL/api/v2/admin/tenants/$TENANT/limits" \
  -o "$ART_DIR/stream_limits_put.json"

# --- 3) Create stream rule (containsany on message) ---
note "create stream rule"
cat > /tmp/stream_rule.json <<'JSON'
{
  "name": "Stream: message has hammer (proof)",
  "description": "stream rule using containsany(message, …)",
  "severity": "LOW",
  "enabled": 1,
  "mode": "stream",
  "stream_window_sec": 60,
  "schedule_sec": 60,
  "throttle_seconds": 0,
  "dedup_key": "[\"tenant_id\",\"event_id\"]",
  "dsl": {
    "search": {
      "tenant_ids": ["default"],
      "time_range": { "last_seconds": 300 },
      "where": { "op": "containsany", "args": ["message", ["hammer","HAMMER"]] }
    }
  }
}
JSON
curl -fsS -X POST "$BASE_URL/api/v2/rules" \
  -H 'content-type: application/json' \
  --data-binary @/tmp/stream_rule.json \
  -o "$ART_DIR/stream_rule_create.json"
RID=$(jq -r '.id // .rule_id' "$ART_DIR/stream_rule_create.json")

# Rebind runner to this rule id (optional but makes logs focused)
note "runner rebind to RID=$RID"
pkill -f siem-stream-runner || true
(
  cd siem_unified_pipeline
  RUST_LOG=${RUST_LOG:-debug},siem_unified_pipeline=debug \
  STREAM_RULE_ID="$RID" \
  CLICKHOUSE_URL="$CLICKHOUSE_URL" CLICKHOUSE_DATABASE="$CLICKHOUSE_DATABASE" \
  REDIS_URL="$REDIS_URL" \
  cargo run --bin siem-stream-runner >"$LOG_RUNNER" 2>&1 &
  echo $! > /tmp/siem_runner.pid
)
sleep 2

# --- 4) Ingest two matching events ---
note "ingest"
now=$(date +%s)
cat > /tmp/ing_stream.ndjson <<JSONL
{"event_id":"s$(date +%s)0","event_timestamp":$now,"tenant_id":"$TENANT","event_category":"app","event_action":"log","event_outcome":"success","message":"hammer proof lower","raw_event":"{\"m\":\"hammer\"}","metadata":"{}","source_type":"manual","created_at":$now,"retention_days":30}
{"event_id":"s$(date +%s)1","event_timestamp":$now,"tenant_id":"$TENANT","event_category":"app","event_action":"log","event_outcome":"success","message":"PROOF HAMMER upper","raw_event":"{\"m\":\"HAMMER\"}","metadata":"{}","source_type":"manual","created_at":$now,"retention_days":30}
JSONL
curl -fsS -D "$ART_DIR/ing_stream.h" -o "$ART_DIR/ing_stream.b" \
  -H 'content-type: application/x-ndjson' \
  --data-binary @/tmp/ing_stream.ndjson \
  "$BASE_URL/api/v2/ingest/bulk" >/dev/null

# --- 5) Verify alerts and metrics ---
note "verify"
sleep 3
curl -fsS "$BASE_URL/api/v2/alerts?limit=5" -o "$ART_DIR/stream_alerts_api.json"
ALERTS_CH=$(curl -fsS "$CLICKHOUSE_URL/" --data-binary \
"SELECT count() FROM $CLICKHOUSE_DATABASE.alerts WHERE rule_id='$RID' AND created_at >= toUInt32(now())-300" )
METRICS=$(curl -fsS "$BASE_URL/metrics" | egrep '^(siem_v2_(stream_matches_total|alerts_written_total))' || true)
printf "%s\n" "$METRICS" > "$ART_DIR/stream_metrics.txt"

# Redis stream peek (if available)
if [ "$REDIS_OK" -eq 1 ]; then
  redis-cli -u "$REDIS_URL" XLEN "siem:events:$TENANT" > "$ART_DIR/stream_xlen.txt" || true
  redis-cli -u "$REDIS_URL" XREVRANGE "siem:events:$TENANT" + - COUNT 5 > "$ART_DIR/stream_xrange.txt" || true
fi

# --- 6) Append proof to final_reportv1.md ---
TS=$(date -u +%FT%TZ)
OUT="siem_unified_pipeline/target/test-artifacts/final_reportv1.md"
{
  echo "### Streaming Proof: ${ALERTS_CH} alerts (PASS if >0) — $TS"
  echo
  echo "**Rule:** \`$RID\`"
  echo
  echo "**Alerts sample (API):**"
  echo '```json'; jq -c '.' "$ART_DIR/stream_alerts_api.json"; echo '```'
  echo
  echo "**Metrics snapshot:**"
  echo '```txt'; cat "$ART_DIR/stream_metrics.txt"; echo '```'
  if [ -f "$ART_DIR/stream_xlen.txt" ]; then
    echo
    echo "**Redis stream XLEN:**"
    echo '```txt'; sed -n '1,50p' "$ART_DIR/stream_xlen.txt"; echo '```'
  fi
} >> "$OUT"

note "DONE — appended proof to $OUT ; CH alerts for rule=$RID: $ALERTS_CH"
exit 0

#!/usr/bin/env bash
set -Eeuo pipefail

note(){ echo "[stream] $*"; }

BASE_URL=${BASE_URL:-http://127.0.0.1:9999}
TENANT=${TENANT:-default}
API_KEY=${API_KEY:-test_key}

note "enqueue a few NDJSON events"
tmp=$(mktemp)
now=$(date +%s)
{
  for i in 1 2 3; do
    printf '{"event_id":"s-%d","event_timestamp":%d,"tenant_id":"%s","event_category":"app","message":"login fail %d","raw_event":"{\"msg\":\"fail\"}","metadata":"{}","created_at":%d}\n' "$i" "$now" "$TENANT" "$i" "$now"
  done
} > "$tmp"
curl -sS -H 'Content-Type: application/x-ndjson' -H "X-Api-Key: ${API_KEY}" --data-binary @"$tmp" "$BASE_URL/api/v2/ingest/ndjson" || true
rm -f "$tmp"

note "metrics peek"
curl -sS "$BASE_URL/metrics" | grep -E '^(siem_v2_(ingest|stream)_|siem_v2_rules_run_total|siem_v2_alerts_written_total)' || true


