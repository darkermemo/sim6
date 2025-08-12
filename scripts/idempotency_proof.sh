#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ART_DIR="$ROOT_DIR/target/test-artifacts"
API_BASE="${API_BASE:-http://127.0.0.1:9999}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
DB="${CLICKHOUSE_DATABASE:-dev}"
mkdir -p "$ART_DIR"

# Build small NDJSON
IDEMP_KEY="demo-$(date +%s)-$$"
IDEMP_NDJSON="$ART_DIR/idemp.ndjson"
{
  printf '{"tenant_id":"default","event_timestamp":%s,"message":"m1"}\n' "$(date +%s)"
  printf '{"tenant_id":"default","event_timestamp":%s,"message":"m2"}\n' "$(date +%s)"
} > "$IDEMP_NDJSON"

# Ingest with Idempotency-Key
curl -sS -w "\nHTTP:%{http_code}\n" -X POST "$API_BASE/api/v2/ingest/ndjson?tenant=default" -H 'Content-Type: application/x-ndjson' -H "Idempotency-Key: ${IDEMP_KEY}" --data-binary @"$IDEMP_NDJSON" | tee "$ART_DIR/idemp_ingest_first.json" >/dev/null
# Replay (expect HTTP 200 and replayed)
curl -sS -w "\nHTTP:%{http_code}\n" -X POST "$API_BASE/api/v2/ingest/ndjson?tenant=default" -H 'Content-Type: application/x-ndjson' -H "Idempotency-Key: ${IDEMP_KEY}" --data-binary @"$IDEMP_NDJSON" | tee "$ART_DIR/idemp_ingest_second.json" >/dev/null
# Conflict (different body, expect 409)
printf '{"tenant_id":"default","event_timestamp":%s,"message":"m3"}\n' "$(date +%s)" > "$ART_DIR/idemp2.ndjson"
HTTP_CODE=$(curl -sS -w "%{http_code}" -o "$ART_DIR/idemp_ingest_conflict.json" -X POST "$API_BASE/api/v2/ingest/ndjson?tenant=default" -H 'Content-Type: application/x-ndjson' -H "Idempotency-Key: ${IDEMP_KEY}" --data-binary @"$ART_DIR/idemp2.ndjson" || echo "000")
echo -e "\nHTTP:$HTTP_CODE" >> "$ART_DIR/idemp_ingest_conflict.json"

# Rule run-now
RUN_KEY="demo-run-$(date +%s)-$$"
RULE_ID=$(curl -sS -X POST "$API_BASE/api/v2/rules" -H 'Content-Type: application/json' --data '{"name":"idemp-demo","compiled_sql":"SELECT event_id, event_timestamp, tenant_id, source_type FROM dev.events WHERE tenant_id=\"default\" ORDER BY event_timestamp DESC LIMIT 1"}' | jq -r .id)
# First run
curl -sS -w "\nHTTP:%{http_code}\n" -X POST "$API_BASE/api/v2/rules/$RULE_ID/run-now" -H "Idempotency-Key: ${RUN_KEY}" -H 'Content-Type: application/json' --data '{}' | tee "$ART_DIR/idemp_run_first.json" >/dev/null
# Replay
curl -sS -w "\nHTTP:%{http_code}\n" -X POST "$API_BASE/api/v2/rules/$RULE_ID/run-now" -H "Idempotency-Key: ${RUN_KEY}" -H 'Content-Type: application/json' --data '{}' | tee "$ART_DIR/idemp_run_second.json" >/dev/null

# CH recent
curl -sS "$CLICKHOUSE_URL/" --data-binary "SELECT key,route,first_seen_at,attempts,last_status FROM ${DB}.idempotency_recent ORDER BY first_seen_at DESC LIMIT 10 FORMAT JSONEachRow" > "$ART_DIR/idemp_recent.json"
# Metrics
curl -sS "$API_BASE/metrics" | grep -E '^siem_v2_idempotency_total' > "$ART_DIR/idemp_metrics.txt" || true

echo "Artifacts: idemp_ingest_first.json, idemp_ingest_second.json, idemp_ingest_conflict.json, idemp_run_first.json, idemp_run_second.json, idemp_recent.json, idemp_metrics.txt"
