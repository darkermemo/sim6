#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
ART="siem_unified_pipeline/target/test-artifacts"
OUT="$ART/final_reportv1.md"
mkdir -p "$ART"

# 0) Ensure server is up
curl -fsS "$BASE_URL/health" >/dev/null || { echo "Server health failed"; exit 1; }

# 1) Smoke UI routes
ROUTES=(/dev/events /dev/alerts /dev/rules /dev/schema)
echo "== Routes ==" >"$ART/ui_routes.txt"
for p in "${ROUTES[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$p" || true)
  echo "$p $code" | tee -a "$ART/ui_routes.txt" >/dev/null
done

# 2) Seed data for filters/rules
clickhouse client -q "INSERT INTO dev.events (event_id,event_timestamp,tenant_id,event_category,event_action,event_outcome, source_ip,destination_ip,user_id,user_name,severity,message,raw_event,metadata,source_type,created_at) VALUES ('ui-1',toUInt32(now())-30,'default','auth','login','failure','10.9.0.1','10.0.0.10',NULL,'ui','HIGH','login fail','{}','{}','app',toUInt32(now()))" || true

# 3) Compile/Estimate/Execute
cat >/tmp/ui_dsl.json <<'JSON'
{"search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
 "where":{"op":"and","args":[{"op":"eq","args":["severity","HIGH"]},{"op":"contains","args":["message","fail"]}]}}}
JSON

curl -fsS -X POST "$BASE_URL/api/v2/search/compile"  -H 'content-type: application/json' --data-binary @/tmp/ui_dsl.json \
  | tee "$ART/ui_compile.json" >/dev/null
printf '{"dsl":%s}\n' "$(cat /tmp/ui_dsl.json)" > /tmp/ui_dsl_wrapped.json
curl -fsS -X POST "$BASE_URL/api/v2/search/estimate" -H 'content-type: application/json' --data-binary @/tmp/ui_dsl_wrapped.json \
  | tee "$ART/ui_estimate.json" >/dev/null
curl -fsS -X POST "$BASE_URL/api/v2/search/execute"  -H 'content-type: application/json' --data-binary @/tmp/ui_dsl_wrapped.json \
  | tee "$ART/ui_execute.json" >/dev/null

# 4) Save-as-rule → Dry-run → Run-now
cat >/tmp/ui_rule.json <<JSON
{
  "name":"UI SaveAsRule",
  "description":"from UI test",
  "severity":"HIGH",
  "enabled":1,
  "schedule_sec":60,
  "throttle_seconds":0,
  "dedup_key":"[\"tenant_id\",\"user_name\"]",
  "dsl": $(cat /tmp/ui_dsl.json)
}
JSON
curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @/tmp/ui_rule.json \
  | tee "$ART/ui_rule_create.json" >/dev/null

RID=$(jq -r '.id // .rule_id // empty' "$ART/ui_rule_create.json")
[ -n "$RID" ] || { echo "RID empty"; exit 1; }

printf '{"limit":20}\n' >/tmp/ui_lim.json
curl -fsS -X POST "$BASE_URL/api/v2/rules/$RID/dry-run" -H 'content-type: application/json' --data-binary @/tmp/ui_lim.json \
  | tee "$ART/ui_dryrun.json" >/dev/null
curl -fsS -X POST "$BASE_URL/api/v2/rules/$RID/run-now" -H 'content-type: application/json' --data-binary @/tmp/ui_lim.json \
  | tee "$ART/ui_run_now.json" >/dev/null

# 5) Alerts list sample
curl -fsS "$BASE_URL/api/v2/alerts?limit=5" | tee "$ART/ui_alerts.json" >/dev/null

# 6) Link checker
>"$ART/ui_links.txt"
for p in "${ROUTES[@]}"; do
  curl -fsS "$BASE_URL$p" | grep -Eoi 'href=\"[^\"]+\"' | sed -E 's/^href=\"|\"$//g' | while read -r href; do
    case "$href" in
      http*) code=$(curl -s -o /dev/null -w "%{http_code}" "$href" || true) ;;
      *) code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$href" || true) ;;
    esac
    echo "$href $code" >>"$ART/ui_links.txt"
  done
done

# 7) Append proof
TS=$(date -u +%FT%TZ)
{
  echo "";
  echo "### UI Proof ($TS)";
  echo "";
  echo "**Routes:**";
  echo '```txt'; cat "$ART/ui_routes.txt"; echo '```';
  echo "";
  echo "**Compile/Estimate/Execute (summaries):**";
  echo '```json'; jq -c '{compile:.sql, estimate:{rows:(.estimated_rows//.data.rows|length?)}, timings:.timings_ms}' "$ART/ui_estimate.json" 2>/dev/null || cat "$ART/ui_estimate.json"; echo '```';
  echo '```json'; jq -c '{rows:(.data.rows|length?), timings:.timings_ms}' "$ART/ui_execute.json" 2>/dev/null || cat "$ART/ui_execute.json"; echo '```';
  echo "";
  echo "**Rule create / dry-run / run-now:**";
  echo '```json'; jq -c '.' "$ART/ui_rule_create.json"; echo '```';
  echo '```json'; jq -c '.' "$ART/ui_dryrun.json"; echo '```';
  echo '```json'; jq -c '.' "$ART/ui_run_now.json"; echo '```';
  echo "";
  echo "**Alerts sample:**";
  echo '```json'; jq -c '.' "$ART/ui_alerts.json"; echo '```';
  echo "";
  echo "**Link check (first 20):**";
  echo '```txt'; head -n 20 "$ART/ui_links.txt"; echo '```';
} >>"$OUT"

echo "UI proof appended → $OUT"


