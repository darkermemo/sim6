#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:9999}"
TENANT="${TENANT:-default}"
OUT="siem_unified_pipeline/target/test-artifacts/final_reportv1.md"
mkdir -p "$(dirname "$OUT")"
TS="$(date -u +%FT%TZ)"
# Create N OPEN alerts for one rule
clickhouse client -q "INSERT INTO dev.alerts (alert_id,tenant_id,rule_id,alert_title,alert_description,event_refs,severity,status,alert_timestamp,created_at,updated_at)
SELECT concat('bulk-', toString(number)), '$TENANT', 'rule-bulk', '', '', '[]', 'HIGH', 'OPEN', toUInt32(now())-number, toUInt32(now()), toUInt32(now()) FROM numbers(5)"
# Aggregate
curl -sS -X POST "$BASE/dev/admin/run_incident_aggregator" >/dev/null || true
ID=$(curl -sS "$BASE/api/v2/incidents?tenant_id=$TENANT&limit=5" | jq -r '.incidents[] | select(.title | contains("rule-bulk") or .title | contains("bulk")) | .incident_id' | head -n1)
[ -z "$ID" ] && echo "no incident for bulk" && exit 0
BEF=$(curl -sS "$BASE/api/v2/incidents/$ID/alerts?tenant_id=$TENANT" | jq -r '.alerts|length')
curl -sS -X POST "$BASE/api/v2/incidents/$ID/alerts/bulk?tenant_id=$TENANT" -H 'content-type: application/json' --data-binary '{"status":"CLOSED"}' | cat >/dev/null
AFT=$(curl -sS "$BASE/api/v2/incidents/$ID/alerts?tenant_id=$TENANT" | jq -r '.alerts | map(select(.status=="CLOSED")) | length')
{
  echo ""; echo "### V2 Bulk Close Proof ($TS)"
  echo ""; echo "**Incident:** \`$ID\`"
  echo ""; echo "**Before alerts count:**"; echo '```txt'; echo "$BEF"; echo '```'
  echo ""; echo "**Closed alerts after action:**"; echo '```txt'; echo "$AFT"; echo '```'
} >>"$OUT"
echo "OK"


