#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
TENANT="${TENANT:-default}"
ART="$ROOT/siem_unified_pipeline/target/test-artifacts"
OUT="$ART/final_reportv1.md"
mkdir -p "$ART"

echo "[api-keys] health" >&2
curl -fsS "$BASE_URL/health" -o "$ART/apikeys_health.json" >/dev/null

echo "[api-keys] create" >&2
cat > /tmp/ak_create.json <<'JSON'
{"tenant_id":"default","name":"Ingest Key","scopes":["ingest","admin:read"],"enabled":1}
JSON
curl -fsS -X POST "$BASE_URL/api/v2/admin/api-keys" -H 'content-type: application/json' --data-binary @/tmp/ak_create.json -o "$ART/apikeys_create.json"
AKID=$(jq -r '.key_id' "$ART/apikeys_create.json")
AKT=$(jq -r '.token' "$ART/apikeys_create.json")

echo "[api-keys] list" >&2
curl -fsS "$BASE_URL/api/v2/admin/api-keys?tenant_id=$TENANT" -o "$ART/apikeys_list.json"

echo "[api-keys] get" >&2
curl -fsS "$BASE_URL/api/v2/admin/api-keys/$AKID?tenant_id=$TENANT" -o "$ART/apikeys_get.json"

echo "[api-keys] update" >&2
cat > /tmp/ak_update.json <<JSON
{"tenant_id":"${TENANT}","name":"Ingest Key (rotated)","enabled":1}
JSON
curl -fsS -X PUT "$BASE_URL/api/v2/admin/api-keys/$AKID" -H 'content-type: application/json' --data-binary @/tmp/ak_update.json -o "$ART/apikeys_update.json"

echo "[api-keys] delete" >&2
curl -fsS -X DELETE "$BASE_URL/api/v2/admin/api-keys/$AKID?tenant_id=$TENANT" -o "$ART/apikeys_delete.json"

ts=$(date -u +%FT%TZ)
{
  echo
  echo "## API Keys Proof — ${ts}"
  echo
  echo "**Created:**"
  echo '```json'; jq -c '{key_id, has_token: (.token|length>0)}' "$ART/apikeys_create.json"; echo '```'
  echo
  echo "**List (slice):**"
  echo '```json'; jq -c '.items[0] // {}' "$ART/apikeys_list.json"; echo '```'
  echo
  echo "**Get (slice):**"
  echo '```json'; jq -c '{tenant_id,key_id,name,enabled,scopes}' "$ART/apikeys_get.json"; echo '```'
} >> "$OUT"

echo "[api-keys] proof complete" >&2

