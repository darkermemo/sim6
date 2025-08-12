#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL=${BASE_URL:-http://127.0.0.1:9999}
TENANT=${TENANT:-default}
ART=${ART:-target/test-artifacts}
mkdir -p "$ART"

echo "[limits] set strict limits"
cat > /tmp/limits_strict.json <<'JSON'
{"eps_limit":1,"burst_limit":1,"retention_days":30}
JSON
curl -sS -X PUT -H 'content-type: application/json' \
  --data-binary @/tmp/limits_strict.json \
  "$BASE_URL/api/v2/admin/tenants/$TENANT/limits" \
  -o "$ART/limits_put_strict.json"

echo "[limits] attempt 2 requests quickly -> expect one 200 and one 429 with Retry-After"
now=$(date +%s)
echo '{"event_id":"q1","event_timestamp":'$now',"tenant_id":"'$TENANT'","event_category":"app","message":"quota test"}' >/tmp/q1.ndjson
curl -sS -D "$ART/q1.h" -o "$ART/q1.b" -H 'content-type: application/x-ndjson' --data-binary @/tmp/q1.ndjson "$BASE_URL/api/v2/ingest/bulk" || true
sleep 0.1
echo '{"event_id":"q2","event_timestamp":'$now',"tenant_id":"'$TENANT'","event_category":"app","message":"quota test"}' >/tmp/q2.ndjson
curl -sS -D "$ART/q2.h" -o "$ART/q2.b" -H 'content-type: application/x-ndjson' --data-binary @/tmp/q2.ndjson "$BASE_URL/api/v2/ingest/bulk" || true

echo "[limits] headers"
sed -n '1,40p' "$ART/q1.h" | sed -n '1,10p'
sed -n '1,40p' "$ART/q2.h" | sed -n '1,20p'

echo "[limits] restore generous limits"
cat > /tmp/limits_open.json <<'JSON'
{"eps_limit":1000,"burst_limit":1000,"retention_days":30}
JSON
curl -sS -X PUT -H 'content-type: application/json' \
  --data-binary @/tmp/limits_open.json \
  "$BASE_URL/api/v2/admin/tenants/$TENANT/limits" \
  -o "$ART/limits_put_open.json"

echo "[limits] done"

