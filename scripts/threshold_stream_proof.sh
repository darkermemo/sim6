#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; ART="$ROOT/siem_unified_pipeline/target/test-artifacts"; OUT="$ART/final_reportv1.md"; mkdir -p "$ART"
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}" CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"

# Create stream rule: threshold>=2 in 30s, group_by=source_ip
cat >/tmp/stream_threshold.json <<'JSON'
{"name":"UI Threshold","description":"2 hits/30s by src","severity":"LOW","enabled":1,"mode":"stream","stream_window_sec":30,"schedule_sec":60,"throttle_seconds":0,"dedup_key":"[\"tenant_id\",\"event_id\"]","dsl":{"search":{"tenant_ids":["default"],"time_range":{"last_seconds":300},"where":{"op":"contains_any","args":["message",["thx"]]}}}}
JSON
curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @/tmp/stream_threshold.json -o "$ART/stream_threshold_create.json"
RID=$(jq -r '.id // .rule_id' "$ART/stream_threshold_create.json")

# Restart runner bound to this rule with threshold/window/group-by via env
pkill -f siem-stream-runner || true
(
  cd "$ROOT/siem_unified_pipeline"
  RUST_LOG=${RUST_LOG:-info} STREAM_RULE_ID="$RID" STREAM_WINDOW_SEC=30 STREAM_THRESHOLD=2 STREAM_GROUP_BY=source_ip CLICKHOUSE_URL="$CLICKHOUSE_URL" CLICKHOUSE_DATABASE=dev REDIS_URL=redis://127.0.0.1:6379 cargo run --bin siem-stream-runner > /tmp/siem_runner.log 2>&1 & echo $! > /tmp/siem_runner.pid
)
sleep 2

# Ingest 2 events with same source_ip to trigger threshold
now=$(date +%s)
cat >/tmp/ing_threshold.ndjson <<JSONL
{"event_id":"th1","event_timestamp":$now,"tenant_id":"default","event_category":"app","message":"thx one","source_ip":"1.2.3.4","raw_event":"{}","metadata":"{}","source_type":"ui","created_at":$now,"retention_days":30}
{"event_id":"th2","event_timestamp":$now,"tenant_id":"default","event_category":"app","message":"thx two","source_ip":"1.2.3.4","raw_event":"{}","metadata":"{}","source_type":"ui","created_at":$now,"retention_days":30}
JSONL
curl -fsS -H 'content-type: application/x-ndjson' --data-binary @/tmp/ing_threshold.ndjson "$BASE_URL/api/v2/ingest/bulk?tenant=default" -o "$ART/ing_threshold.json" || true

sleep 2

# Verify alerts written
clickhouse client -q "SELECT count() FROM dev.alerts WHERE rule_id='${RID}' AND created_at >= toUInt32(now())-120" > /tmp/alert_th_count.txt || echo 0 > /tmp/alert_th_count.txt
ts=$(date -u +%FT%TZ)
{
  echo; echo "## Threshold Stream Proof — ${ts}"; echo; echo "**Rule:** $RID"; echo; echo "**Alerts last 2m:** $(cat /tmp/alert_th_count.txt)";
} >> "$OUT"
echo "[threshold] proof complete"

