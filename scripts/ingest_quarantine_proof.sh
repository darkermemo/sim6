#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ART_DIR="$ROOT_DIR/target/test-artifacts"
API_BASE="${API_BASE:-http://127.0.0.1:9999}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
DB="${CLICKHOUSE_DATABASE:-dev}"
mkdir -p "$ART_DIR"

TENANT="qa_$(date +%s)"
NDJSON_FILE="$ART_DIR/quarantine_sample.ndjson"
{
  printf '{"tenant_id": "default", "event_timestamp": %s, "message": "ok row"}\n' "$(date +%s)"
  printf '{"event_timestamp": %s, "message": "missing tenant"}\n' "$(date +%s)"
  printf '{"tenant_id": "default", "event_timestamp": "bad-ts", "message": "bad ts"}\n'
  printf '{"tenant_id": "default", "event_timestamp": %s}\n' "$(date +%s)"
} > "$NDJSON_FILE"

# POST to ingest/ndjson with retry on 429
for i in 1 2 3; do
  HTTP_CODE=$(curl -sS -o "$ART_DIR/quarantine_ingest_response.json" -w "%{http_code}" -X POST "$API_BASE/api/v2/ingest/ndjson?tenant=$TENANT&rate=1000&burst=2000" -H 'Content-Type: application/x-ndjson' --data-binary @"$NDJSON_FILE" || echo 000)
  if [ "$HTTP_CODE" = "200" ]; then break; fi
  sleep 2
done

sleep 3

curl -sS "$CLICKHOUSE_URL/" --data-binary "SELECT reason, count() FROM ${DB}.events_quarantine WHERE received_at >= now()-INTERVAL 30 MINUTE GROUP BY reason ORDER BY reason FORMAT TabSeparated" > "$ART_DIR/quarantine_counts.tsv"

curl -sS "$CLICKHOUSE_URL/" --data-binary "SELECT tenant_id, source, reason, left(payload,200) AS payload_snippet, received_at FROM ${DB}.events_quarantine ORDER BY received_at DESC LIMIT 5 FORMAT JSONEachRow" > "$ART_DIR/quarantine_tail.json"

curl -sS "$API_BASE/metrics" | grep -E 'siem_v2_ingest_(total|validation_total)' > "$ART_DIR/quarantine_metrics.txt" || true

{
  echo "Ingest quarantine proof"
  echo "Tenant: $TENANT"
  echo "API response:"; cat "$ART_DIR/quarantine_ingest_response.json" || true
  echo "Counts (30m window):"; cat "$ART_DIR/quarantine_counts.tsv" || true
} > "$ART_DIR/quarantine_verify_notes.txt"

echo "Artifacts updated under $ART_DIR"
