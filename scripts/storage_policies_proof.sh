#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
TENANT="${TENANT:-default}"
ART="$ROOT/siem_unified_pipeline/target/test-artifacts"
OUT="$ART/final_reportv1.md"
mkdir -p "$ART"

curl -fsS "$BASE_URL/api/v2/admin/storage/$TENANT" -o "$ART/storage_get.json"
cat > /tmp/put_storage.json <<'JSON'
{"retention_days": 31, "compression": "lz4"}
JSON
curl -fsS -X PUT "$BASE_URL/api/v2/admin/storage/$TENANT" -H 'content-type: application/json' --data-binary @/tmp/put_storage.json -o "$ART/storage_put.json"

ts=$(date -u +%FT%TZ)
{
  echo
  echo "## Storage Policies Proof — ${ts}"
  echo
  echo "**Get:**"
  echo '```json'; jq -c '.' "$ART/storage_get.json"; echo '```'
  echo
  echo "**Put:**"
  echo '```json'; jq -c '.' "$ART/storage_put.json"; echo '```'
} >> "$OUT"
echo "[storage] proof complete"

