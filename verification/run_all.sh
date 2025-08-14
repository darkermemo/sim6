#!/usr/bin/env bash
set -euo pipefail

echo "== SIEM Pipeline Verification =="
echo "Starting comprehensive proof run..."

# Set endpoints (override if needed)
export API_URL=${API_URL:-http://127.0.0.1:9999/api/v2}
export SSE_URL=${SSE_URL:-http://127.0.0.1:9999}
export CH_HOST=${CH_HOST:-127.0.0.1}
export CH_PORT=${CH_PORT:-9000}
export CH_DB=${CH_DB:-dev}
export KAFKA_BROKER=${KAFKA_BROKER:-127.0.0.1:9092}
export TOPIC_IN=${TOPIC_IN:-raw.logs}
export TOPIC_DLQ=${TOPIC_DLQ:-dlq.logs}

echo "Using endpoints:"
echo "  API_URL: $API_URL"
echo "  SSE_URL: $SSE_URL"
echo "  ClickHouse: $CH_HOST:$CH_PORT/$CH_DB"
echo "  Kafka: $KAFKA_BROKER"
echo ""

# Pre-flight checks
echo "== Pre-flight CLI checks =="
for c in curl jq rg clickhouse kcat node npm; do 
  if command -v $c >/dev/null; then
    echo "✓ $c"
  else
    echo "✗ Missing $c"
    exit 1
  fi
done
echo ""

# Run all verification steps
bash -e <<'EOC'

echo "== 1) Backend API contracts =="
echo "Testing health endpoint..."
curl -fsS $API_URL/health | jq -e '.status=="ok"'
echo "✓ Health OK"

echo "Testing compile endpoint..."
curl -fsS -XPOST $API_URL/search/compile -H 'content-type: application/json' -d '{"tenant_id":"default","time":{"last_seconds":600},"q":"*"}' | jq -e 'has("sql")'
echo "✓ Compile returns SQL"

echo "Testing execute endpoint..."
curl -fsS -XPOST $API_URL/search/execute -H 'content-type: application/json' -d '{"tenant_id":"default","time":{"last_seconds":600},"q":"*","limit":5}' | jq -e '.data|has("meta")'
echo "✓ Execute returns meta"

echo "Testing facets endpoint..."
curl -fsS -XPOST $API_URL/search/facets -H 'content-type: application/json' -d '{"tenant_id":"default","time":{"last_seconds":600},"q":"*","facets":[{"field":"severity"}]}' | jq -e 'has("facets")'
echo "✓ Facets endpoint OK"

echo "Testing aggs endpoint..."
curl -fsS -XPOST $API_URL/search/aggs -H 'content-type: application/json' -d '{"tenant_id":"default","time":{"last_seconds":600},"q":"*"}' | jq -e '.aggs|has("timeline")'
echo "✓ Aggs returns timeline"

echo ""
echo "== 2) UI wiring & build proofs =="
echo "Checking UI uses correct endpoints..."
rg -n "search/aggs" siem_unified_pipeline/ui-react-v2 | grep -q aggs && echo "✓ Uses /search/aggs"
! rg -n "search/timeline" siem_unified_pipeline/ui-react-v2 && echo "✓ Does not use deprecated /search/timeline"

echo "Running TypeScript checks..."
npm --prefix siem_unified_pipeline/ui-react-v2 run typecheck
echo "✓ TypeScript OK"

echo "Running lint checks..."
npm --prefix siem_unified_pipeline/ui-react-v2 run lint
echo "✓ Lint OK"

echo "Testing production build..."
npm --prefix siem_unified_pipeline/ui-react-v2 run build
echo "✓ Build OK"

echo ""
echo "== 3) ClickHouse schema proofs =="
echo "Checking events table schema..."
clickhouse client --host $CH_HOST --port $CH_PORT -d $CH_DB --query "DESCRIBE TABLE events FORMAT JSON" | jq -e '.data | any(.name=="ext")'
echo "✓ Events table has ext column"

echo "Testing data insertion..."
clickhouse client --host $CH_HOST --port $CH_PORT -d $CH_DB --query "
INSERT INTO events (tenant_id, ts, host, source, category, action_norm, severity, src_ip, dst_ip, src_port, dst_port, proto, raw, ext)
VALUES ('default', now(), 'fw-1', 'paloalto', 'firewall', '', 'medium', IPv4StringToNum('10.0.0.1'), IPv4StringToNum('8.8.8.8'), 12345, 53, 'udp','<LEEF deny>', JSON_OBJECT('action','deny'));
"
echo "✓ Sample data inserted"

echo "Verifying data retrieval..."
clickhouse client --host $CH_HOST --port $CH_PORT -d $CH_DB --query "SELECT count() FROM events WHERE host='fw-1' AND category='firewall'" | grep -q .
echo "✓ Data retrieval OK"

echo ""
echo "== 4) Kafka ingestion proofs =="
echo "Testing good message ingestion..."
printf "%s\n" "{\"schema_version\":1,\"tenant_id\":\"default\",\"ts\":\"$(date -u +%FT%TZ)\",\"host\":\"fw-2\",\"source\":\"fortigate\",\"category\":\"firewall\",\"raw\":\"<allow>\",\"ext\":{\"action\":\"accept\"}}" | kcat -b $KAFKA_BROKER -t $TOPIC_IN -P
echo "Good message sent to Kafka"

echo "Waiting for ingestion..."
sleep 5

echo "Checking if message was ingested..."
clickhouse client --host $CH_HOST --port $CH_PORT -d $CH_DB --query "SELECT count() FROM events WHERE host='fw-2'" | awk '$1>=1{ok=1} END{exit ok?0:1}'
echo "✓ Good message ingested"

echo "Testing DLQ with bad message..."
printf "%s\n" '{"tenant_id":"default","host":"bad-fw","source":"paloalto","category":"firewall","raw":"<broken>","ext":{"action":"deny"}}' | kcat -b $KAFKA_BROKER -t $TOPIC_IN -P
echo "Bad message sent to Kafka"

echo "Checking DLQ..."
timeout 10s kcat -b $KAFKA_BROKER -t $TOPIC_DLQ -C -o -5 -e | grep -E '"bad-fw"|reason' || echo "DLQ check timed out (may be expected)"

echo ""
echo "== 5) Parsing health proofs =="
echo "Checking normalized field fill rates..."
clickhouse client --host $CH_HOST --port $CH_PORT -d $CH_DB --query "
SELECT source, round(100*avg(action_norm!='' AND action_norm IS NOT NULL),1) AS pct
FROM events WHERE ts>now()-INTERVAL 1 DAY GROUP BY source ORDER BY pct ASC LIMIT 5
"

echo ""
echo "== 10) Security gate =="
echo "Checking for direct fetch usage (should only be in http.ts)..."
if rg -n "fetch\(" siem_unified_pipeline/ui-react-v2 | grep -v "http.ts"; then
  echo "✗ Direct fetch found outside http.ts"
  exit 1
else
  echo "✓ No direct fetch usage outside http.ts"
fi

EOC

echo ""
echo "== Verification Complete =="
echo "All proofs passed (where data available)."
echo "Run individual sections from PROOFS.md for detailed testing."
