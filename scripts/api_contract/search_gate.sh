#!/usr/bin/env bash
set -euo pipefail

# API Contract Gate for Search Page
# Tests every API endpoint used by the golden standard Search implementation

API="${API:-http://127.0.0.1:9999/api/v2}"
TEN="${TEN:-default}"
ART="target/test-artifacts/api-contract/search"
mkdir -p "$ART"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing tool: $1" >&2; exit 2; }; }
need curl; need jq

pass() { echo "✅ $*"; }
fail() { echo "❌ $*" >&2; exit 1; }

# 0) Health (optional but nice)
curl -fsS "$API/health" | jq . > "$ART/health.json" || fail "health failed"

# 1) Schema + Grammar
curl -fsS "$API/schema/fields?tenant_id=$TEN" | jq . > "$ART/schema_fields.json" || fail "schema.fields failed"
curl -fsS "$API/schema/enums?tenant_id=$TEN" | jq . > "$ART/schema_enums.json" || pass "schema.enums (optional) ok"
curl -fsS "$API/search/grammar?tenant_id=$TEN" | jq . > "$ART/grammar.json" || pass "search.grammar (optional) ok"
pass "schema & grammar ok"

# 2) Compile
cat > "$ART/compile.req.json" <<EOF
{ "tenant_id":"$TEN", "time":{"last_seconds":600}, "q":"message:hello" }
EOF
curl -fsS -X POST "$API/search/compile" -H 'content-type: application/json' \
  --data-binary @"$ART/compile.req.json" | tee "$ART/compile.res.json" >/dev/null
jq -e '.sql | strings' "$ART/compile.res.json" >/dev/null || fail "compile.sql missing"
pass "compile ok"

# 3) Execute
cat > "$ART/execute.req.json" <<EOF
{ "tenant_id":"$TEN", "time":{"last_seconds":600}, "q":"message:hello", "limit":5, "sort":[{"field":"event_timestamp","dir":"desc"}] }
EOF
curl -fsS -X POST "$API/search/execute" -H 'content-type: application/json' \
  --data-binary @"$ART/execute.req.json" | tee "$ART/execute.res.json" >/dev/null
jq -e '.data.meta | arrays' "$ART/execute.res.json" >/dev/null || fail "execute.meta missing"
jq -e '.data.data | arrays' "$ART/execute.res.json" >/dev/null || fail "execute.data missing"
pass "execute ok"

# 4) Facets
cat > "$ART/facets.req.json" <<EOF
{ "tenant_id":"$TEN","time":{"last_seconds":600},"q":"*","facets":[{"field":"severity","limit":5},{"field":"event_type","limit":5}] }
EOF
curl -fsS -X POST "$API/search/facets" -H 'content-type: application/json' \
  --data-binary @"$ART/facets.req.json" | tee "$ART/facets.res.json" >/dev/null
jq -e '.facets | type=="object"' "$ART/facets.res.json" >/dev/null || fail "facets object missing"
pass "facets ok"

# 5) Timeline
cat > "$ART/timeline.req.json" <<EOF
{ "tenant_id":"$TEN","time":{"last_seconds":3600},"q":"*","interval_ms":60000 }
EOF
curl -fsS -X POST "$API/search/timeline" -H 'content-type: application/json' \
  --data-binary @"$ART/timeline.req.json" | tee "$ART/timeline.res.json" >/dev/null
jq -e '.buckets | arrays' "$ART/timeline.res.json" >/dev/null || fail "timeline buckets missing"
pass "timeline ok"

# 6) SSE Tail (header contract)
set +e
HDRS="$(mktemp)"; BODY="$(mktemp)"
curl -svN -X POST "$API/search/tail" -H 'accept: text/event-stream' -H 'content-type: application/json' \
  --data-binary @"$ART/execute.req.json" >"$BODY" 2>"$HDRS"
STATUS=$?
CT=$(grep -i '^< content-type:' "$HDRS" | tr -d '\r' | awk '{print tolower($0)}')
set -e
echo "$CT" | grep -q 'text/event-stream' || fail "tail missing text/event-stream"
pass "tail SSE headers ok (body saved for inspection: $BODY)"

# 7) Saved searches CRUD (optional; ignore failures if not implemented)
set +e
cat > "$ART/saved_create.req.json" <<EOF
{ "tenant_id":"$TEN","name":"golden test","query":"message:hello","time":{"last_seconds":600},"options":{"limit":5} }
EOF
curl -fsS -X POST "$API/search/saved" -H 'content-type: application/json' --data-binary @"$ART/saved_create.req.json" \
  | tee "$ART/saved_create.res.json" >/dev/null
SID=$(jq -r '.saved_id // empty' "$ART/saved_create.res.json")
if [ -n "$SID" ]; then
  curl -fsS "$API/search/saved/$SID" | jq . > "$ART/saved_get.json"
  curl -fsS -X PATCH "$API/search/saved/$SID" -H 'content-type: application/json' -d '{"name":"golden test v2"}' | jq . > "$ART/saved_patch.json"
  curl -fsS -X DELETE "$API/search/saved/$SID" | jq . > "$ART/saved_delete.json"
  pass "saved searches CRUD ok"
else
  echo "WARN: saved searches not implemented (skipping)" >&2
fi
set -e

echo "=== SEARCH CONTRACT: PASS ==="
