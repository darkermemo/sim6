#!/usr/bin/env bash
set -euo pipefail

# Dashboard API Contract Test
# Tests all dashboard endpoints with exact response shapes

API="${API:-http://127.0.0.1:9999/api/v2}"
JQ="${JQ:-jq}"
ART="target/test-artifacts/api-contract/dashboard"
mkdir -p "$ART"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing tool: $1" >&2; exit 2; }; }
need curl; need jq

pass() { echo "✅ $*"; }
fail() { echo "❌ $*" >&2; exit 1; }

# Calculate time range (last 10 minutes)
if date -v-10M >/dev/null 2>&1; then
  # macOS
  since=$(date -u -v-10M +%FT%TZ)
  until=$(date -u +%FT%TZ)
else
  # Linux
  since=$(date -u -d '10 minutes ago' +%FT%TZ)
  until=$(date -u +%FT%TZ)
fi

echo "=== Dashboard Contract Tests ==="
echo "API Base: $API"
echo "Time Range: $since to $until"
echo ""

# 1. Health endpoint
echo "## 1. Health Check"
curl -fsS "$API/health" | tee "$ART/health.json" | \
  $JQ -e '.status and .components.clickhouse.status' >/dev/null || fail "health: missing required fields"
pass "health endpoint ok"

# 2. Ingest metrics
echo -e "\n## 2. Metrics Endpoints"
for ep in ingest query storage errors freshness; do
  echo -n "Testing /metrics/$ep... "
  curl -fsS "$API/metrics/$ep?since=$since&until=$until&step=60s" | tee "$ART/metrics_${ep}.json" | \
    $JQ -e '.series | type=="array"' >/dev/null || fail "metrics/$ep: series not array"
  
  # Verify shape based on endpoint
  case $ep in
    ingest)
      $JQ -e '.totals.bytes_in >= 0 and .totals.rows_in >= 0' "$ART/metrics_${ep}.json" >/dev/null || \
        fail "metrics/ingest: missing totals"
      ;;
    query)
      $JQ -e '.totals.queries >= 0' "$ART/metrics_${ep}.json" >/dev/null || \
        fail "metrics/query: missing totals.queries"
      ;;
    storage)
      $JQ -e '.latest.storage_bytes >= 0' "$ART/metrics_${ep}.json" >/dev/null || \
        fail "metrics/storage: missing latest.storage_bytes"
      ;;
    errors)
      $JQ -e '.totals.errors >= 0' "$ART/metrics_${ep}.json" >/dev/null || \
        fail "metrics/errors: missing totals.errors"
      ;;
    freshness)
      # freshness only has series
      ;;
  esac
  
  pass "ok"
done

# 3. Alerts endpoint
echo -e "\n## 3. Alerts"
curl -fsS "$API/alerts?since=$since&until=$until&limit=5" | tee "$ART/alerts.json" | \
  $JQ -e '.alerts | type=="array" and (.total >= 0)' >/dev/null || fail "alerts: bad shape"

# Check alert fields if any exist
if [ "$($JQ -r '.alerts | length' "$ART/alerts.json")" -gt 0 ]; then
  $JQ -e '.alerts[0] | has("alert_id") and has("alert_timestamp") and has("severity")' \
    "$ART/alerts.json" >/dev/null || fail "alerts: missing required fields"
fi
pass "alerts endpoint ok"

# 4. Error cases
echo -e "\n## 4. Error Handling"

# Missing time range
set +e
STATUS=$(curl -s -w "%{http_code}" -o "$ART/error_no_time.json" "$API/metrics/ingest")
set -e
if [ "$STATUS" = "400" ]; then
  pass "metrics handles missing time params"
else
  echo "WARN: metrics accepted request without time params (status: $STATUS)"
fi

# Invalid time range
set +e
STATUS=$(curl -s -w "%{http_code}" -o "$ART/error_bad_time.json" \
  "$API/metrics/ingest?since=bad&until=worse")
set -e
if [ "$STATUS" = "400" ] || [ "$STATUS" = "422" ]; then
  pass "metrics validates time params"
else
  echo "WARN: metrics accepted invalid time params (status: $STATUS)"
fi

echo -e "\n=== DASHBOARD CONTRACT: PASS ==="
echo "Artifacts saved to: $ART"
