#!/usr/bin/env bash
# Correctness: parser fuzz (always-200), rules pack sanity

set -Eeuo pipefail
source scripts/ga/00_env.sh

note "Parser fuzz: 6 malformed samples → normalize must be 200"
declare -a FUZZ
FUZZ+=('{"event":"ok"')
FUZZ+=('not-json-line')
FUZZ+=('{"protoPayload":{"m":1}}')
FUZZ+=('{"http":{"user_agent":123}}')
FUZZ+=('{"x": {"y": {"z": [1,2,3]}}}')
FUZZ+=('')

pass=0; total=0
for f in "${FUZZ[@]}"; do
  total=$((total+1))
  if jq -e . >/dev/null 2>&1 <<<"$f"; then
    req=$(jq -cn --arg t "$TENANT" --argjson rec "$f" '{tenant_id:$t, record:$rec}')
  else
    req=$(jq -cn --arg t "$TENANT" --arg raw "$f" '{tenant_id:$t, raw:$raw}')
  fi
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v2/parse/normalize" -H 'content-type: application/json' --data-binary "$req")
  [ "$code" = "200" ] && pass=$((pass+1))
done
save_json "$GA_DIR/parser_fuzz.json" "{\"total\":$total,\"ok\":$pass}"

note "6 core rules hit at least 1 row"
hits=0
cat > "$GA_DIR/rule_http.json" <<'JSON'
{"search":{"tenant_ids":["default"],"time_range":{"last_seconds":3600},"where":{"op":"and","args":[{"op":"eq","args":["event_category","http"]},{"op":"contains","args":["message","GET"]},{"op":"eq","args":["json_meta","http.user_agent","Mozilla"]}]},"limit":100}}
JSON
cat > "$GA_DIR/rule_gcp.json" <<'JSON'
{"search":{"tenant_ids":["default"],"time_range":{"last_seconds":3600},"where":{"op":"eq","args":["json_raw","protoPayload.methodName","storage.objects.get"]},"limit":100}}
JSON
cat > "$GA_DIR/rule_cidr.json" <<'JSON'
{"search":{"tenant_ids":["default"],"time_range":{"last_seconds":3600},"where":{"op":"ip_in_cidr","args":["source_ip","10.0.0.0/8"]},"limit":100}}
JSON
cat > "$GA_DIR/rule_contains_any.json" <<'JSON'
{"search":{"tenant_ids":["default"],"time_range":{"last_seconds":3600},"where":{"op":"contains_any","args":["message",["fail","error","warn"]]},"limit":100}}
JSON
cat > "$GA_DIR/rule_fail.json" <<'JSON'
{"search":{"tenant_ids":["default"],"time_range":{"last_seconds":3600},"where":{"op":"and","args":[{"op":"eq","args":["event_category","auth"]},{"op":"eq","args":["event_outcome","failure"]}]},"limit":100}}
JSON
cat > "$GA_DIR/rule_http_cat.json" <<'JSON'
{"search":{"tenant_ids":["default"],"time_range":{"last_seconds":3600},"where":{"op":"eq","args":["event_category","http"]},"limit":100}}
JSON

count_rule(){
  local f="$1"
  local body; body=$(jq -c . "$f")
  local rows; rows=$(curl -sS -X POST "$BASE_URL/api/v2/search/execute" -H 'content-type: application/json' --data-binary "{\"dsl\":$body}" | jq -r '.data.rows_before_limit_at_least // .data.rows // 0' 2>/dev/null || echo 0)
  printf '%s\n' "${rows:-0}"
}

H1=$(count_rule "$GA_DIR/rule_http.json")
H2=$(count_rule "$GA_DIR/rule_gcp.json")
H3=$(count_rule "$GA_DIR/rule_cidr.json")
H4=$(count_rule "$GA_DIR/rule_contains_any.json")
H5=$(count_rule "$GA_DIR/rule_fail.json")
H6=$(count_rule "$GA_DIR/rule_http_cat.json")
for v in "$H1" "$H2" "$H3" "$H4" "$H5" "$H6"; do
  if [ "${v:-0}" -gt 0 ]; then hits=$((hits+1)); fi
done

jq -n --argjson hits "$hits" \
  --arg h1 "$H1" \
  --arg h2 "$H2" \
  --arg h3 "$H3" \
  --arg h4 "$H4" \
  --arg h5 "$H5" \
  --arg h6 "$H6" \
  '{hits:$hits, rules: {http:$h1, gcp:$h2, cidr:$h3, contains_any:$h4, fail:$h5, http_cat:$h6}}' > "$GA_DIR/rules_hits.json"

