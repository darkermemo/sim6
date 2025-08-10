#!/usr/bin/env bash
set -Eeuo pipefail

# 1) Clean restart server
pids=$(lsof -ti tcp:9999 || true)
if [ -n "${pids:-}" ]; then kill -9 $pids || true; fi
pkill -f siem-pipeline || true
sleep 1

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

cargo clean -q && cargo build -q --bin siem-pipeline
BUILD_SHA=$(shasum -a256 target/debug/siem-pipeline | awk '{print $1}')
echo "BUILD_SHA=$BUILD_SHA"

export CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
export CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-dev}"
export RUST_LOG="${RUST_LOG:-info,siem=debug,axum::rejection=off}"

nohup target/debug/siem-pipeline > /tmp/siem_srv.log 2>&1 &
SERVER_PID=$!
echo "SERVER_PID=$SERVER_PID"
sleep 2
lsof -iTCP:9999 -sTCP:LISTEN || true

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"

# 2) Build payloads via files
cat >/tmp/v2_dsl_only.json <<'JSON'
{
  "search": {
    "tenant_ids": ["default"],
    "time_range": { "last_seconds": 900 },
    "where": {
      "op": "and",
      "args": [
        { "op":"eq", "args":["severity","HIGH"] },
        { "op":"contains", "args":["message","fail"] }
      ]
    }
  }
}
JSON

jq -c . </tmp/v2_dsl_only.json > /tmp/v2_dsl_only.min.json
printf '{"dsl":%s}\n' "$(cat /tmp/v2_dsl_only.min.json)" > /tmp/v2_dsl_wrapped.json

DSL_MIN=$(cat /tmp/v2_dsl_only.min.json)
cat >/tmp/rule_ready.json <<JSON
{
  "name": "Login Fail High (seed)",
  "description": "E2E rule",
  "severity": "HIGH",
  "enabled": 1,
  "schedule_sec": 60,
  "throttle_seconds": 0,
  "dedup_key": "[\"tenant_id\",\"user_name\",\"source_ip\"]",
  "dsl": $DSL_MIN
}
JSON

# 3) Compile/Estimate/Execute/Facets
curl -fsS -X POST "$BASE_URL/api/v2/search/compile"  -H 'content-type: application/json' --data-binary @/tmp/v2_dsl_only.json    | jq -r '.' | sed -n '1,40p'
curl -fsS -X POST "$BASE_URL/api/v2/search/estimate" -H 'content-type: application/json' --data-binary @/tmp/v2_dsl_wrapped.json | jq -r '.' | sed -n '1,40p'
curl -fsS -X POST "$BASE_URL/api/v2/search/execute"  -H 'content-type: application/json' --data-binary @/tmp/v2_dsl_wrapped.json \
  | jq -r '. as $o | {rows: ($o.data.rows|length), timings_ms: ($o.timings_ms // $o.timings // null)}'
jq -n --argjson d "$(cat /tmp/v2_dsl_only.json)" '{dsl:$d,field:"severity",k:5}' \
  | curl -fsS -X POST "$BASE_URL/api/v2/search/facets" -H 'content-type: application/json' --data-binary @- | jq -r '.' | sed -n '1,40p'

# 4) Create rule and extract RID
curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @/tmp/rule_ready.json \
  | tee /tmp/rule_create.json | jq -r '.' | sed -n '1,120p'
RID=$(jq -r '.id // .rule_id // empty' /tmp/rule_create.json)
echo "RID=$RID"
test -n "$RID"

# 5) Confirm row exists in ClickHouse
clickhouse client -q "SELECT rule_id,id,coalesce(nullIf(rule_name,''),nullIf(name,'')) name,length(compiled_sql) l_sql,length(dsl) l_dsl,ifNull(tenant_scope,'all') tenant_scope FROM dev.alert_rules WHERE rule_id='${RID}' OR id='${RID}' FORMAT Vertical" | cat

# 6) Dry-run and run-now
printf '{"limit":5}\n' > /tmp/limit5.json

echo '-- dry-run'
curl -sv -X POST "$BASE_URL/api/v2/rules/$RID/dry-run" -H 'content-type: application/json' --data-binary @/tmp/limit5.json | cat

echo '-- run-now'
curl -sv -X POST "$BASE_URL/api/v2/rules/$RID/run-now" -H 'content-type: application/json' --data-binary @/tmp/limit5.json | cat

echo '-- logs (tail)'
tail -n 200 /tmp/siem_srv.log | sed -n '/fetch_sql=/,$p' | head -80 | cat

echo 'DONE'


