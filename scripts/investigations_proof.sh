#!/usr/bin/env bash
set -Eeuo pipefail
# Proof: Investigations views + notes + timeline run
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
TENANT="${TENANT:-default}"
ART="$ROOT/siem_unified_pipeline/target/test-artifacts"
OUT="$ART/final_reportv1.md"
mkdir -p "$ART"

echo "[investigations] health" >&2
curl -fsS "$BASE_URL/health" -o "$ART/inv_health.json" >/dev/null

echo "[investigations] create saved view" >&2
cat > /tmp/inv_view.json <<'JSON'
{"tenant_id":"default","name":"Proof View","dsl":{"search":{"tenant_ids":["default"],"time_range":{"last_seconds":600},"where":null,"limit":10}},"created_by":"proof"}
JSON
curl -fsS -X POST "$BASE_URL/api/v2/investigations/views" -H 'content-type: application/json' --data-binary @/tmp/inv_view.json -o "$ART/inv_view_create.json"
VID=$(jq -r '.id // .data[0].id // empty' "$ART/inv_view_create.json" || true)

echo "[investigations] list views" >&2
curl -fsS "$BASE_URL/api/v2/investigations/views?tenant_id=$TENANT" -o "$ART/inv_views_list.json"

echo "[investigations] get view" >&2
if [ -n "${VID:-}" ]; then
  curl -fsS "$BASE_URL/api/v2/investigations/views/$VID" -o "$ART/inv_view_get.json"
fi

echo "[investigations] add note" >&2
cat > /tmp/inv_note.json <<JSON
{"view_id":"${VID:-adhoc}","author":"proof","body":"Investigation note @ $(date -u +%FT%TZ)"}
JSON
curl -fsS -X POST "$BASE_URL/api/v2/investigations/notes" -H 'content-type: application/json' --data-binary @/tmp/inv_note.json -o "$ART/inv_note_create.json"

echo "[investigations] list notes" >&2
curl -fsS "$BASE_URL/api/v2/investigations/views/${VID:-adhoc}/notes" -o "$ART/inv_notes_list.json" || true

# Append proof block
ts=$(date -u +%FT%TZ)
{
  echo
  echo "## Investigations Proof — ${ts}"
  echo
  echo "**Saved Views (slice):**"
  echo '```json'; jq -c '.data[0] // {}' "$ART/inv_views_list.json"; echo '```'
  echo
  echo "**Created View ID:** ${VID:-"(none)"}"
  echo
  echo "**Notes (slice):**"
  echo '```json'; jq -c '.data[0] // {}' "$ART/inv_notes_list.json" 2>/dev/null || true; echo '```'
} >> "$OUT"

echo "[investigations] proof complete" >&2

