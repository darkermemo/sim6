#!/usr/bin/env bash
set -euo pipefail

API="${API:-http://127.0.0.1:9999/api/v2}"
UI="${UI:-http://127.0.0.1:5183}"   # Next UI v3
TENANT="${TENANT:-default}"

say(){ printf "\n🧪 %s\n" "$*"; }

jqpresent(){ command -v jq >/dev/null 2>&1; }
jqpresent || { echo "Please install jq"; exit 1; }

say "Backend health"
curl -fsS "$API/health" | jq -e '.status=="ok"'

say "Compile"
curl -fsS -X POST "$API/search/compile" \
  -H 'content-type: application/json' \
  -d "{\"tenant_id\":\"$TENANT\",\"time\":{\"last_seconds\":600},\"q\":\"*\"}" | jq -e '.sql|length>0'

say "Execute"
curl -fsS -X POST "$API/search/execute" \
  -H 'content-type: application/json' \
  -d "{\"tenant_id\":\"$TENANT\",\"time\":{\"last_seconds\":600},\"q\":\"*\",\"limit\":5}" | jq -e '.data.meta|type=="array"'

say "Facets"
curl -fsS -X POST "$API/search/facets" \
  -H 'content-type: application/json' \
  -d "{\"tenant_id\":\"$TENANT\",\"time\":{\"last_seconds\":600},\"q\":\"*\",\"facets\":[{\"field\":\"severity\",\"size\":5}]}" | jq -e '.facets|type=="object"'

say "Aggs (timeline)"
curl -fsS -X POST "$API/search/aggs" \
  -H 'content-type: application/json' \
  -d "{\"tenant_id\":\"$TENANT\",\"time\":{\"last_seconds\":600},\"q\":\"*\"}" | jq -e '.aggs.timeline|type=="array"'

say "UI v3 proxy works"
curl -fsS "$UI/api/v2/health" | jq -e '.status=="ok"'

say "UI v3 pages exist"
for p in "" "/search" "/rules" "/alerts" "/reports" "/settings"; do
  code=$(curl -IfsS "$UI$p" | head -1 | awk '{print $2}')
  printf "%-12s %s\n" "$p" "${code:-NO-RESPONSE}"
done
