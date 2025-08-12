#!/usr/bin/env bash
set -Eeuo pipefail
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"

note(){ printf '[rules-run] %s\n' "$*"; }

IDS_FILE="target/test-artifacts/rule_ids.txt"
if [ -s "$IDS_FILE" ]; then
  ids=$(cat "$IDS_FILE" | grep -v '^\s*$' || true)
else
  ids=$(curl -fsS "$BASE_URL/api/v2/rules?limit=100" 2>/dev/null | jq -r '.rules[]?.id // .data[]?.rule_id // .data[]?.id // empty' || true)
fi
if [ -z "${ids:-}" ]; then note "no rule ids found"; exit 0; fi

while IFS= read -r id; do
  note "run-now $id"
  curl -fsS -X POST "$BASE_URL/api/v2/rules/$id/run-now" -H 'content-type: application/json' --data-binary '{"limit":100}' >/dev/null || true
done <<<"$ids"

note "alerts sample"
curl -fsS "$BASE_URL/api/v2/alerts?limit=5" | jq .

