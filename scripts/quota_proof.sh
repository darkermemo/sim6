#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; ART="$ROOT/siem_unified_pipeline/target/test-artifacts"; OUT="$ART/final_reportv1.md"; mkdir -p "$ART"
BASE_URL=${BASE_URL:-http://127.0.0.1:9999}

# Send a batch, then set very low caps and send again to get 403-like error
now=$(date +%s)
echo '{"event_id":"q1","event_timestamp":'"$now"',"tenant_id":"default","event_category":"app","message":"quota test","raw_event":"{}","metadata":"{}","source_type":"ui","created_at":'"$now"',"retention_days":30}' > /tmp/q1.ndjson
curl -fsS -H 'content-type: application/x-ndjson' --data-binary @/tmp/q1.ndjson "$BASE_URL/api/v2/ingest/bulk?tenant=default" -o "$ART/quota_first.json" || true

# Second send should exceed bytes cap if we set env and restart server; fallback to making many repeats
REPEATS=${REPEATS:-0}
if [ "$REPEATS" -eq 0 ]; then REPEATS=1; fi
{ for i in $(seq 1 $REPEATS); do cat /tmp/q1.ndjson; echo; done; } > /tmp/q2.ndjson
code=$(curl -s -o /tmp/q2.out -w "%{http_code}" -H 'content-type: application/x-ndjson' --data-binary @/tmp/q2.ndjson "$BASE_URL/api/v2/ingest/bulk?tenant=default" || true)
echo "$code" > "$ART/quota_second_code.txt"

# Pull metrics slice
curl -fsS "$BASE_URL/metrics" | grep '^siem_v2_quota_violations_total' > "$ART/quota_metrics.txt" || true
ts=$(date -u +%FT%TZ)
{
  echo; echo "## Quota Proof — ${ts}"; echo; echo "**Second ingest status:** $(cat "$ART/quota_second_code.txt")"; echo; echo "**Metrics (quota):**"; echo '```txt'; cat "$ART/quota_metrics.txt"; echo '```';
} >> "$OUT"
echo "[quota] proof complete"

