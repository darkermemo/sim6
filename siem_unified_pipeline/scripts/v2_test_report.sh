#!/usr/bin/env bash
set -euo pipefail

CH_URL=${CH_URL:-http://localhost:8123}
API_URL=${API_URL:-http://localhost:9999}

echo "== v2 Test Report =="
date -Iseconds

section() { echo; echo "-- $1 --"; }

section "Health checks"
echo -n "health: "
curl -sS "$API_URL/health" || true; echo
echo -n "eps:    "
curl -sS "$API_URL/dev/metrics/eps" || true; echo

section "API smoke"
echo -n "search (10): "
curl -sS "$API_URL/api/v1/events/search?limit=10" || true; echo

section "ClickHouse connectivity"
echo -n "SELECT 1 => "
curl -sS "$CH_URL/?query=SELECT%201" || true; echo

section "ClickHouse event counts"
TOTAL=$(curl -sS "$CH_URL/?query=SELECT%20count()%20FROM%20dev.events" || echo 0)
echo "total: $TOTAL"

echo "last 5 minutes by second (non-zero):"
curl -sS --data-binary $'SELECT toStartOfSecond(toDateTime(event_timestamp)) AS ts, count() AS c FROM dev.events WHERE event_timestamp >= toUInt32(now())-300 GROUP BY ts ORDER BY ts' "$CH_URL/?query=" | awk '{ if ($2>0) print }' || true

echo "per tenant totals (top 10):"
curl -sS --data-binary $'SELECT tenant_id, count() AS c FROM dev.events GROUP BY tenant_id ORDER BY c DESC LIMIT 10' "$CH_URL/?query=" || true; echo

echo "by source_type (top 10):"
curl -sS --data-binary $'SELECT coalesce(source_type, \'unknown\') AS st, count() AS c FROM dev.events GROUP BY st ORDER BY c DESC LIMIT 10' "$CH_URL/?query=" || true; echo

section "Parsing quality (non-null field coverage)"
for col in event_category event_action event_outcome source_ip destination_ip severity source_type; do
  cnt=$(curl -sS --data-binary "SELECT count() FROM dev.events WHERE $col IS NOT NULL" "$CH_URL/?query=" || echo 0)
  echo "$col non-null: $cnt"
done

section "Summary"
echo "{\n  \"health\": $(curl -sS "$API_URL/health" || echo '{}'),\n  \"total_events\": $TOTAL\n}"


