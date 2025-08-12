#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

# Create rule (simple contains), dry-run, run-now
RULE_JSON="$ART_DIR/rule_create_req.json"
jq -n '{
  name:"Smoke Contains fail/error",
  description:"smoke rule",
  severity:"LOW",
  enabled:1,
  schedule_sec:60,
  throttle_seconds:0,
  dedup_key:"[\"tenant_id\"]",
  dsl:{search:{tenant_ids:["default"], time_range:{last_seconds:1800},
    where:{op:"containsany", args:["message", ["fail","error"]]}, limit:50}}
}' > "$RULE_JSON"

note "create rule"
api /api/v2/rules "$(cat "$RULE_JSON")" | tee "$ART_DIR/rule_create_resp.json" >/dev/null

RID="$(jq -r '.id // .rule_id // empty' "$ART_DIR/rule_create_resp.json")"
[[ -n "$RID" ]] || fail "Rule ID not returned"

note "dry-run"
api "/api/v2/rules/$RID/dry-run" '{"limit":25}' | tee "$ART_DIR/rule_dry_run.json" >/dev/null

note "run-now"
api "/api/v2/rules/$RID/run-now" '{"limit":50}' | tee "$ART_DIR/rule_run_now.json" >/dev/null

note "alerts sample"
api "/api/v2/alerts?limit=5" | tee "$ART_DIR/alerts_after_run_now.json" >/dev/null


