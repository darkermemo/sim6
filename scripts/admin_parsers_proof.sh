#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
ART="$ROOT/siem_unified_pipeline/target/test-artifacts"
OUT="$ART/final_reportv1.md"
mkdir -p "$ART"

# Health
curl -fsS "$BASE_URL/health" -o "$ART/parsers_health.json" >/dev/null

# Create parser
cat > /tmp/parser_create.json <<'JSON'
{"name":"demo-parser","version":1,"kind":"regex","body":{"pattern":"^msg:(.*)$"},"samples":["msg:hello"],"enabled":1}
JSON
curl -fsS -X POST "$BASE_URL/api/v2/admin/parsers" -H 'content-type: application/json' --data-binary @/tmp/parser_create.json -o "$ART/parser_create.json"

PID=$(jq -r '.parser_id // empty' "$ART/parser_create.json" || true)

# List parsers
curl -fsS "$BASE_URL/api/v2/admin/parsers" -o "$ART/parsers_list.json"

# Get parser (with body)
if [ -n "${PID:-}" ]; then
  curl -fsS "$BASE_URL/api/v2/admin/parsers/$PID?include_body=1" -o "$ART/parser_get.json"
fi

# Update parser
cat > /tmp/parser_update.json <<JSON
{"name":"demo-parser","version":2,"kind":"regex","body":{"pattern":"^msg:(.*)$"},"samples":["msg:world"],"enabled":1}
JSON
if [ -n "${PID:-}" ]; then
  curl -fsS -X PUT "$BASE_URL/api/v2/admin/parsers/$PID" -H 'content-type: application/json' --data-binary @/tmp/parser_update.json -o "$ART/parser_update.json"
fi

# Delete parser
if [ -n "${PID:-}" ]; then
  curl -fsS -X DELETE "$BASE_URL/api/v2/admin/parsers/$PID" -o "$ART/parser_delete.json"
fi

# Append proof block
ts=$(date -u +%FT%TZ)
{
  echo
  echo "## Admin Parsers Proof — ${ts}"
  echo
  echo "**Created:**"
  echo '```json'
  jq -c '{parser_id, ok}' "$ART/parser_create.json" 2>/dev/null || true
  echo '```'
  echo
  echo "**List (count):**"
  echo '```txt'
  jq '.items | length' "$ART/parsers_list.json" 2>/dev/null || echo 0
  echo '```'
  if [ -f "$ART/parser_get.json" ]; then
    echo
    echo "**Get (slice):**"
    echo '```json'
    jq -c '{parser_id,name,version,kind,enabled}' "$ART/parser_get.json" 2>/dev/null || true
    echo '```'
  fi
} >> "$OUT"
echo "[parsers] proof complete"


