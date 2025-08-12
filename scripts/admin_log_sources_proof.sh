#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
TENANT="${TENANT:-default}"
ART="$ROOT/siem_unified_pipeline/target/test-artifacts"
OUT="$ART/final_reportv1.md"
mkdir -p "$ART"

curl -fsS "$BASE_URL/health" -o "$ART/logsources_health.json" >/dev/null

# Create source
cat > /tmp/ls_create.json <<'JSON'
{"tenant_id":"default","name":"Web Vectors","kind":"vector","config":{"endpoint":"http://127.0.0.1:9999/api/v2/ingest/bulk"},"enabled":1}
JSON
curl -fsS -X POST "$BASE_URL/api/v2/admin/log-sources" -H 'content-type: application/json' --data-binary @/tmp/ls_create.json -o "$ART/ls_create.json"
SID=$(jq -r '.source_id // empty' "$ART/ls_create.json" || true)

# List (redacted config)
curl -fsS "$BASE_URL/api/v2/admin/log-sources?tenant_id=$TENANT" -o "$ART/ls_list.json"

# Get full (include_config=1)
if [ -n "${SID:-}" ]; then
  curl -fsS "$BASE_URL/api/v2/admin/log-sources/$SID?tenant_id=$TENANT&include_config=1" -o "$ART/ls_get.json"
fi

# Update
cat > /tmp/ls_update.json <<JSON
{"tenant_id":"${TENANT}","name":"Web Vectors (A)","kind":"vector","config":{"endpoint":"http://127.0.0.1:9999/api/v2/ingest/bulk"},"enabled":1}
JSON
if [ -n "${SID:-}" ]; then
  curl -fsS -X PUT "$BASE_URL/api/v2/admin/log-sources/$SID" -H 'content-type: application/json' --data-binary @/tmp/ls_update.json -o "$ART/ls_update.json"
  curl -fsS -X DELETE "$BASE_URL/api/v2/admin/log-sources/$SID?tenant_id=$TENANT" -o "$ART/ls_delete.json"
fi

ts=$(date -u +%FT%TZ)
{
  echo
  echo "## Admin Log Sources Proof — ${ts}"
  echo
  echo "**Created:**"
  echo '```json'; jq -c '{source_id, ok}' "$ART/ls_create.json"; echo '```'
  echo
  echo "**List (count):**"
  echo '```txt'; jq '.items | length' "$ART/ls_list.json"; echo '```'
  if [ -f "$ART/ls_get.json" ]; then
    echo
    echo "**Get full (has config):**"
    echo '```json'; jq -c '{tenant_id,source_id,name,kind,enabled,has_config: (.config|type=="string"|not)}' "$ART/ls_get.json"; echo '```'
  fi
} >> "$OUT"
echo "[log-sources] proof complete"

#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL=${BASE_URL:-http://127.0.0.1:9999}
TENANT=${TENANT:-default}
ART="siem_unified_pipeline/target/test-artifacts"
OUT="$ART/final_reportv1.md"
mkdir -p "$ART"

curl -fsS "$BASE_URL/health" -o "$ART/ls_health.json"

uuid=$(uuidgen || cat /proc/sys/kernel/random/uuid || echo "ui-$(date +%s)")
cat > /tmp/ls_create.json <<JSON
{"tenant_id":"$TENANT","source_id":"$uuid","name":"UI Web","kind":"vector","config":{"endpoint":"$BASE_URL/api/v2/ingest/bulk","token":"REDACT"},"enabled":1}
JSON
curl -fsS -X POST "$BASE_URL/api/v2/admin/log-sources" -H 'content-type: application/json' --data-binary @/tmp/ls_create.json -o "$ART/ls_create.json"

curl -fsS "$BASE_URL/api/v2/admin/log-sources?tenant_id=$TENANT&limit=50" -o "$ART/ls_list.json"
curl -fsS "$BASE_URL/api/v2/admin/log-sources/$uuid?tenant_id=$TENANT" -o "$ART/ls_get_redacted.json"
curl -fsS "$BASE_URL/api/v2/admin/log-sources/$uuid?tenant_id=$TENANT&include_config=1" -o "$ART/ls_get_full.json"

cat > /tmp/ls_update.json <<JSON
{"tenant_id":"$TENANT","name":"UI Web (A)","kind":"vector","config":{"endpoint":"$BASE_URL/api/v2/ingest/bulk","token":"NEW"},"enabled":1}
JSON
curl -fsS -X PUT "$BASE_URL/api/v2/admin/log-sources/$uuid" -H 'content-type: application/json' --data-binary @/tmp/ls_update.json -o "$ART/ls_update.json"

curl -fsS -X DELETE "$BASE_URL/api/v2/admin/log-sources/$uuid?tenant_id=$TENANT" -o "$ART/ls_delete.json"

# Append proof
list_count=$(jq -r '.items|length' "$ART/ls_list.json" 2>/dev/null || echo 0)
redacted=$(jq -r '.items[0].config' "$ART/ls_list.json" 2>/dev/null || echo '')
has_token=$(jq -r '.config|tostring|test("token")' "$ART/ls_get_full.json" 2>/dev/null || echo false)
ts=$(date -u +%FT%TZ)
{
  echo; echo "## Log Sources CRUD Proof — $ts"; echo;
  echo "source_id: $uuid"; echo "list_count: $list_count"; echo "redacted_in_list: $redacted"; echo "has_token_full_get: $has_token"; echo;
  echo "**Create:**"; echo '```json'; sed -n '1,80p' "$ART/ls_create.json"; echo '```';
  echo "**List:**"; echo '```json'; sed -n '1,80p' "$ART/ls_list.json"; echo '```';
  echo "**Get (full):**"; echo '```json'; sed -n '1,80p' "$ART/ls_get_full.json"; echo '```';
  echo "**Update:**"; echo '```json'; sed -n '1,80p' "$ART/ls_update.json"; echo '```';
  echo "**Delete:**"; echo '```json'; sed -n '1,80p' "$ART/ls_delete.json"; echo '```';
} >> "$OUT"
echo "Appended Log Sources CRUD Proof to $OUT"

