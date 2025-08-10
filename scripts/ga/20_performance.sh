#!/usr/bin/env bash
# Performance sweep: EPS for load, p50/p95 execute latency

set -Eeuo pipefail
source scripts/ga/00_env.sh

note "Generate 10k Zeek HTTP"
mkdir -p target/generated
cd siem_tools
cargo build -q --bin siem
cd ..
./siem_tools/target/debug/siem gen zeek-http --seed 7 --count 10000 --tenant "$TENANT" --out /tmp/ga_zh.raw --out-ndjson /tmp/ga_zh.ndjson

LINES=$(wc -l < /tmp/ga_zh.ndjson | tr -d ' ')
t0=$(date +%s)
./siem_tools/target/debug/siem load-ch --file /tmp/ga_zh.ndjson --table "$CLICKHOUSE_DATABASE.events"
t1=$(date +%s)
DUR=$((t1 - t0)); [ "$DUR" -gt 0 ] || DUR=1
EPS=$((LINES / DUR))
save_json "$GA_DIR/ingest_eps.json" "{\"lines\":$LINES,\"seconds\":$DUR,\"eps\":$EPS}"

note "Measure execute latency 30x (simple DSL)"
cat > "$GA_DIR/latency_dsl.json" <<'JSON'
{
  "search":{
    "tenant_ids":["default"],
    "time_range":{"last_seconds":900},
    "where":{"op":"eq","args":["event_category","http"]},
    "limit": 50
  }
}
JSON

sum=0; best=1000000000; worst=0
for i in $(seq 1 30); do
  body=$(jq -c . "$GA_DIR/latency_dsl.json")
  t=$(curl -sS -w "%{time_total}" -o /dev/null -X POST "$BASE_URL/api/v2/search/execute" -H 'content-type: application/json' --data-binary "{\"dsl\":$body}")
  ms=$(awk "BEGIN{printf \"%d\", ($t+0)*1000}")
  if [ "$ms" -lt "$best" ]; then best="$ms"; fi
  if [ "$ms" -gt "$worst" ]; then worst="$ms"; fi
  sum=$((sum + ms))
done
avg=$((sum / 30))
save_json "$GA_DIR/execute_latency.json" "{\"samples\":30,\"avg_ms\":$avg,\"best_ms\":$best,\"worst_ms\":$worst}"

