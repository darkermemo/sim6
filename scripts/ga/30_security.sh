#!/usr/bin/env bash
# Security probes: auth on admin endpoints, secrets, audit trail presence

set -Eeuo pipefail
source scripts/ga/00_env.sh

note "Probe admin without token (expect 401/403 or document open_mode)"
RC=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v2/admin/tenants" -H 'content-type: application/json' --data '{"tenant_id":"probe"}')
MODE=$([ "$RC" = "401" -o "$RC" = "403" ] && echo "protected" || echo "open_mode")
save_json "$GA_DIR/admin_auth.json" "{\"status_code\":$RC,\"mode\":\"$MODE\"}"

note "Audit trail present for rule create/update?"
curl -sS "$CLICKHOUSE_URL/" --data-binary "SELECT count() c FROM $CLICKHOUSE_DATABASE.events WHERE event_category='audit' AND event_action IN ('rule_create','rule_update') AND event_timestamp>=toUInt32(now())-3600 FORMAT JSON" > "$GA_DIR/audit_rule_events.json"

