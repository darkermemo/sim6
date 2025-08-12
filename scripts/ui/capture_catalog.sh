#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:9999}"
CH_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
ART_DIR="${1:-$(cd "$(dirname "$0")/../../siem_unified_pipeline" && pwd)/target/test-artifacts}"

mkdir -p "${ART_DIR}"

# Wait for API health
for i in $(seq 1 60); do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "${API_BASE}/health" || true)
  if [ "${code}" = "200" ]; then break; fi
  sleep 0.25
done

# Helper to wrap plain text into json string field
wrap_text_json() {
  local key="$1"; shift
  jq -Rn --arg s "$(cat)" "{\"${key}\": \$s}"
}

# SHOW CREATE dumps
curl -sS --data-binary 'SHOW CREATE TABLE dev.events'        "${CH_URL}" | wrap_text_json create_sql > "${ART_DIR}/wire_schema_events.json"
curl -sS --data-binary 'SHOW CREATE TABLE dev.alerts'        "${CH_URL}" | wrap_text_json create_sql > "${ART_DIR}/wire_schema_alerts.json"
curl -sS --data-binary 'SHOW CREATE TABLE dev.alert_rules'   "${CH_URL}" | wrap_text_json create_sql > "${ART_DIR}/wire_schema_alert_rules.json"
curl -sS --data-binary 'SHOW CREATE TABLE dev.rule_state'    "${CH_URL}" | wrap_text_json create_sql > "${ART_DIR}/wire_schema_rule_state.json"
curl -sS --data-binary 'SHOW CREATE TABLE dev.parsers_admin' "${CH_URL}" | wrap_text_json create_sql > "${ART_DIR}/wire_schema_parsers_admin.json"
curl -sS --data-binary 'SHOW CREATE TABLE dev.log_sources_admin' "${CH_URL}" | wrap_text_json create_sql > "${ART_DIR}/wire_schema_log_sources_admin.json"

# API samples
curl -sS "${API_BASE}/health" > "${ART_DIR}/wire_health.json"
curl -sS "${API_BASE}/metrics" | wrap_text_json prometheus > "${ART_DIR}/wire_metrics.json"

# Search execute sample
cat > "${ART_DIR}/wire_search_execute.request.json" <<'JSON'
{
  "tenant_id": "default",
  "time": { "last_seconds": 900 },
  "q": "error"
}
JSON
curl -sS -H 'content-type: application/json' --data-binary @"${ART_DIR}/wire_search_execute.request.json" \
  "${API_BASE}/api/v2/search/execute" > "${ART_DIR}/wire_search_execute.response.json" || true

# Admin list samples
curl -sS "${API_BASE}/api/v2/admin/parsers" > "${ART_DIR}/wire_admin_parsers.json" || true
curl -sS "${API_BASE}/api/v2/admin/log-sources" > "${ART_DIR}/wire_admin_log_sources.json" || true

echo "Captured artifacts in ${ART_DIR}"


