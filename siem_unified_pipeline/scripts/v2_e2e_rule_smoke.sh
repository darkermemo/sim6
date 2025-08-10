#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
TENANT="${TENANT:-default}"
ART_DIR="siem_unified_pipeline/target/test-artifacts"
OUT="$ART_DIR/final_reportv1.md"
TS="$(date -u +%FT%TZ)"
mkdir -p "$ART_DIR"

# Capture status + headers + body even on 4xx/5xx
curl_json() { # name method url datafile
  local name="$1" method="$2" url="$3" data="${4:-}"
  local hdr="$ART_DIR/${name}.headers"
  local body="$ART_DIR/${name}.json"
  : >"$hdr"; : >"$body"
  if [ -n "${data}" ]; then
    curl -sS -X "$method" "$url" -H 'content-type: application/json' \
      --data-binary @"$data" -D "$hdr" -o "$body" -w '%{http_code}' > "${body}.status"
  else
    curl -sS -X "$method" "$url" -D "$hdr" -o "$body" -w '%{http_code}' > "${body}.status"
  fi
  printf "\n[%s] HTTP %s\n" "$name" "$(cat "${body}.status")"
  jq -r 'if .error then .error else {status, code, message, details} end' "$body" 2>/dev/null || cat "$body"
}

CH() { clickhouse client -q "$1"; }

echo "== Seeding ClickHouse dev.events for tenant=$TENANT =="
CH "INSERT INTO dev.events
(event_id,event_timestamp,tenant_id,event_category,event_action,event_outcome,
 source_ip,destination_ip,user_id,user_name,severity,message,raw_event,metadata,
 source_type,created_at)
VALUES
('seed-v2-1',toUInt32(now())-5,'$TENANT','auth','login','failure','10.0.0.5','10.0.0.10',NULL,'alice','HIGH','login fail','{\"msg\":\"login fail\"}','{}','app',toUInt32(now())),
('seed-v2-2',toUInt32(now())-4,'$TENANT','auth','login','failure','10.0.0.6','10.0.0.10',NULL,'bob','HIGH','login fail','{\"msg\":\"login fail\"}','{}','app',toUInt32(now()))"

echo "== Building DSL files =="
cat >/tmp/v2_dsl_only.json <<JSON
{
  "search": {
    "tenant_ids": ["$TENANT"],
    "time_range": { "last_seconds": 900 },
    "where": { "op": "and", "args": [
      { "op": "eq", "args": ["severity","HIGH"] },
      { "op": "contains", "args": ["message","fail"] }
    ]}
  }
}
JSON
jq -c . </tmp/v2_dsl_only.json >/tmp/v2_dsl_wrapped.json.tmp
printf '{"dsl":%s}' "$(cat /tmp/v2_dsl_wrapped.json.tmp)" >/tmp/v2_dsl_wrapped.json

echo "== Compile/Estimate/Execute/Facets =="
curl_json "v2_e2e_compile"  POST "$BASE_URL/api/v2/search/compile"  /tmp/v2_dsl_only.json
curl_json "v2_e2e_estimate" POST "$BASE_URL/api/v2/search/estimate" /tmp/v2_dsl_wrapped.json
curl_json "v2_e2e_execute"  POST "$BASE_URL/api/v2/search/execute"  /tmp/v2_dsl_wrapped.json
FACETS_PAYLOAD=$(jq -c '{dsl: ., field: "severity", k: 5}' /tmp/v2_dsl_only.json)
printf "%s" "$FACETS_PAYLOAD" | curl -sS -X POST "$BASE_URL/api/v2/search/facets" -H 'content-type: application/json' --data-binary @- \
  -D "$ART_DIR/v2_e2e_facets.headers" -o "$ART_DIR/v2_e2e_facets.json" -w '%{http_code}' > "$ART_DIR/v2_e2e_facets.json.status"
printf "\n[v2_e2e_facets] HTTP %s\n" "$(cat "$ART_DIR/v2_e2e_facets.json.status")"
jq -r '. | {status, code, message, details}' "$ART_DIR/v2_e2e_facets.json" 2>/dev/null || cat "$ART_DIR/v2_e2e_facets.json"

echo "== Create rule (v2) =="
cat >/tmp/v2_rule_create.json <<JSON
{
  "name": "Login Fail High (seed)",
  "description": "High severity login failures in last 15m",
  "severity": "HIGH",
  "enabled": 1,
  "tenant_scope": "explicit",
  "schedule_sec": 60,
  "throttle_seconds": 0,
  "dedup_key": "[\"tenant_id\",\"user_name\",\"source_ip\"]",
  "dsl": $(cat /tmp/v2_dsl_only.json)
}
JSON
curl_json "v2_e2e_rule_create" POST "$BASE_URL/api/v2/rules" /tmp/v2_rule_create.json
CR_STATUS=$(cat "$ART_DIR/v2_e2e_rule_create.json.status")
if [ "$CR_STATUS" != "200" ] && [ "$CR_STATUS" != "201" ]; then
  echo "Create-rule failed (HTTP $CR_STATUS). See:"
  echo "  $ART_DIR/v2_e2e_rule_create.json"
  echo "  $ART_DIR/v2_e2e_rule_create.headers"
  exit 1
fi
RID=$(jq -r '.id // .rule_id // empty' "$ART_DIR/v2_e2e_rule_create.json")
[ -z "$RID" ] && echo "RID empty (create response invalid)" && exit 1

echo "== Run-now rule: $RID =="
echo '{"limit": 5}' >/tmp/v2_run_now.json
curl_json "v2_e2e_run_now" POST "$BASE_URL/api/v2/rules/$RID/run-now" /tmp/v2_run_now.json

echo "== Fetch alerts =="
curl_json "v2_e2e_alerts" GET "$BASE_URL/api/v2/alerts?limit=5" ""

echo "== Scrape metrics =="
if curl -sS -o "$ART_DIR/v2_e2e_metrics.txt" -w '%{http_code}' "$BASE_URL/metrics" | grep -q '^200$'; then
  sed -n '/^siem_v2_/p' "$ART_DIR/v2_e2e_metrics.txt" > "$ART_DIR/v2_e2e_metrics.txt.filtered" || true
else
  echo "(metrics endpoint not available)" > "$ART_DIR/v2_e2e_metrics.txt.filtered"
fi

echo "== Append proof to $OUT =="
{
  echo ""
  echo "### V2 E2E Rule Proof ($TS)"
  echo ""
  echo "**Seeded rows (dev.events total now):**"
  echo '```txt'; CH "SELECT count() FROM dev.events"; echo '```'
  echo ""
  echo "**Rule created:** \`$RID\`"
  echo ""
  echo "**Execute rows:**"
  echo '```txt'; jq -r '.data.rows|length' "$ART_DIR/v2_e2e_execute.json"; echo '```'
  echo ""
  echo "**Alerts sample:**"
  echo '```json'; jq -c '.' "$ART_DIR/v2_e2e_alerts.json"; echo '```'
  echo ""
  echo "**Metrics snapshot (siem_v2_*)**"
  echo '```txt'; cat "$ART_DIR/v2_e2e_metrics.txt.filtered"; echo '```'
} >>"$OUT"

echo "DONE ✓"


