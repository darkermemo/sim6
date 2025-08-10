#!/usr/bin/env bash
set -Eeuo pipefail

# Simple ingest soak: sends small JSON batches for DURATION_MIN minutes at RATE per second
# Usage: EPS=50 DURATION_MIN=1 ./scripts/soak_ingest.sh

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
EPS="${EPS:-20}"
DURATION_MIN="${DURATION_MIN:-1}"

end_ts=$(( $(date +%s) + DURATION_MIN*60 ))
tmp="/tmp/soak_ingest_payload.json"
cat > "$tmp" <<'JSON'
{"logs":[{"tenant_id":"default","timestamp":"2024-07-01T00:00:00Z","log_type":"soak","src_ip":"1.2.3.4","message":"soak"}]}
JSON

sent=0
while [ "$(date +%s)" -lt "$end_ts" ]; do
  i=0
  while [ $i -lt "$EPS" ]; do
    curl -fsS -X POST "$BASE_URL/api/v2/ingest/raw" -H 'Content-Type: application/json' --data-binary @"$tmp" -o /dev/null || true
    sent=$((sent+1))
    i=$((i+1))
  done
  sleep 1
done

echo "sent=$sent" > siem_unified_pipeline/target/test-artifacts/soak_ingest_summary.txt
exit 0


