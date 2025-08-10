#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:9999}"
TENANT="${TENANT:-default}"
OUT="siem_unified_pipeline/target/test-artifacts/final_reportv1.md"
mkdir -p "$(dirname "$OUT")"
TS="$(date -u +%FT%TZ)"
ID=$(curl -sS "$BASE/api/v2/incidents?tenant_id=$TENANT&limit=1" | jq -r '.incidents[0].incident_id // empty')
[ -z "$ID" ] && echo "no incident" && exit 0
TL=$(curl -sS "$BASE/api/v2/incidents/$ID/timeline?tenant_id=$TENANT")
AL=$(curl -sS "$BASE/api/v2/incidents/$ID/alerts?tenant_id=$TENANT")
{
  echo ""; echo "### V2 Investigator Proof ($TS)"
  echo ""; echo "**Incident:** \`$ID\`"
  echo ""; echo "**Timeline:**"; echo '```json'; echo "$TL"; echo '```'
  echo ""; echo "**Alerts:**"; echo '```json'; echo "$AL"; echo '```'
} >>"$OUT"
echo "OK"


