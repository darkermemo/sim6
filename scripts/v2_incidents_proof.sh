#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:9999}"
TENANT="${TENANT:-default}"
OUT="siem_unified_pipeline/target/test-artifacts/final_reportv1.md"
mkdir -p "$(dirname "$OUT")"
TS="$(date -u +%FT%TZ)"
# Seed alerts → 3 dummy OPEN alerts
clickhouse client -q "INSERT INTO dev.alerts (alert_id,tenant_id,rule_id,alert_title,alert_description,event_refs,severity,status,alert_timestamp,created_at,updated_at)
VALUES
('inc-p1-a1','$TENANT','rule-X','','','[]','HIGH','OPEN',toUInt32(now())-3, toUInt32(now()), toUInt32(now())),
('inc-p1-a2','$TENANT','rule-X','','','[]','HIGH','OPEN',toUInt32(now())-2, toUInt32(now()), toUInt32(now())),
('inc-p1-a3','$TENANT','rule-X','','','[]','HIGH','OPEN',toUInt32(now())-1, toUInt32(now()), toUInt32(now()))"
# Trigger
curl -sS -X POST "$BASE/dev/admin/run_incident_aggregator" >/dev/null || true
CNT=$(clickhouse client -q "SELECT count() FROM dev.incidents WHERE tenant_id='$TENANT' AND last_alert_ts>=toUInt32(now())-120")
SAMPLE=$(curl -sS "$BASE/api/v2/incidents?tenant_id=$TENANT&limit=3")
{
  echo ""; echo "### V2 Incidents Proof ($TS)"
  echo ""; echo "**dev.incidents recent count:**"; echo '```txt'; echo "$CNT"; echo '```'
  echo ""; echo "**API sample:**"; echo '```json'; echo "$SAMPLE"; echo '```'
} >>"$OUT"
echo "OK"


