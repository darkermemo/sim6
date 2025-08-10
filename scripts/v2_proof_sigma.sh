#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
TENANT="${TENANT:-default}"
ART="siem_unified_pipeline/target/test-artifacts"
mkdir -p "$ART"

cat >/tmp/sigma.yaml <<'YAML'
title: Login Failures HIGH
logsource:
  product: app
detection:
  selection:
    severity: HIGH
    message|contains: fail
  condition: selection
YAML

jq -n --arg yaml "$(cat /tmp/sigma.yaml)" --arg tenant "$TENANT" \
  '{sigma: $yaml, tenant_ids: [$tenant], allow_unmapped: true}' \
  | curl -fsS -X POST "$BASE_URL/api/v2/rules/sigma/compile" -H 'content-type: application/json' --data-binary @- \
  | tee "$ART/sigma_compile_proof.json" >/dev/null

jq -n --arg yaml "$(cat /tmp/sigma.yaml)" --arg tenant "$TENANT" \
  '{name:"Sigma Proof", severity:"HIGH", enabled:1, schedule_sec:60, throttle_seconds:0, dedup_key:"[]", sigma:$yaml, tenant_ids:[$tenant], allow_unmapped:true}' \
  | curl -fsS -X POST "$BASE_URL/api/v2/rules/sigma" -H 'content-type: application/json' --data-binary @- \
  | tee "$ART/sigma_create_proof.json" >/dev/null

RID=$(jq -r '.id // .rule_id // empty' "$ART/sigma_create_proof.json")
[ -n "$RID" ] || { echo "RID empty"; exit 1; }

printf '{"limit":5}\n' >/tmp/lim.json
curl -fsS -X POST "$BASE_URL/api/v2/rules/$RID/run-now" -H 'content-type: application/json' --data-binary @/tmp/lim.json \
  | tee "$ART/sigma_run_now.json" >/dev/null

curl -fsS "$BASE_URL/api/v2/alerts?limit=5" | tee "$ART/sigma_alerts.json" >/dev/null
jq -e '.alerts|length >= 1' "$ART/sigma_alerts.json" >/dev/null

echo "Sigma proof PASS for $RID"


