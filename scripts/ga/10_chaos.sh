#!/usr/bin/env bash
# Chaos & reliability: bounce API, idempotent run-now, duplicate checks

set -Eeuo pipefail
source scripts/ga/00_env.sh

note "Bounce API (quick)"
# Stop anything on 9999 and start fresh
p=$(lsof -ti tcp:9999 || true); if [ -n "$p" ]; then kill -9 $p || true; fi
( cd siem_unified_pipeline && RUST_LOG="${RUST_LOG:-info}" CLICKHOUSE_URL="$CLICKHOUSE_URL" CLICKHOUSE_DATABASE="$CLICKHOUSE_DATABASE" \
    cargo run -q --bin siem-pipeline > /tmp/siem_srv.log 2>&1 & echo $! > /tmp/siem_srv.pid )
for i in {1..200}; do curl -fsS "$BASE_URL/health" >/dev/null 2>&1 && break || sleep 0.2; done
curl -fsS "$BASE_URL/health" | jq . > "$GA_DIR/health_after_bounce.json"

note "Seed deterministic events (auth failures)"
post_sql "INSERT INTO $CLICKHOUSE_DATABASE.events
(event_id,event_timestamp,tenant_id,event_category,event_action,event_outcome,source_ip,destination_ip,
 user_id,user_name,severity,message,raw_event,metadata,source_type,created_at,retention_days) VALUES
('ga-seed-1',toUInt32(now())-30,'$TENANT','auth','login','failure','10.1.1.1','10.1.1.2',NULL,'eve','HIGH','login fail','{\"msg\":\"login fail\"}','{}','app',toUInt32(now()),30),
('ga-seed-2',toUInt32(now())-29,'$TENANT','auth','login','failure','10.1.1.2','10.1.1.2',NULL,'mallory','HIGH','login fail','{\"msg\":\"login fail\"}','{}','app',toUInt32(now()),30),
('ga-seed-3',toUInt32(now())-28,'$TENANT','auth','login','failure','10.1.1.3','10.1.1.2',NULL,'trent','HIGH','login fail','{\"msg\":\"login fail\"}','{}','app',toUInt32(now()),30)
"

note "Create a threshold rule via DSL"
cat > "$GA_DIR/ga_rule_dsl.json" <<'JSON'
{
  "search": {
    "tenant_ids": ["default"],
    "time_range": { "last_seconds": 900 },
    "where": {
      "op": "and",
      "args": [
        {"op":"eq","args":["event_category","auth"]},
        {"op":"eq","args":["event_outcome","failure"]}
      ]
    },
    "limit": 100
  }
}
JSON
jq -n --slurpfile d "$GA_DIR/ga_rule_dsl.json" '{name:"GA Threshold Failures", description:"GA chaos idempotency", severity:"HIGH", enabled:1, schedule_sec:60, throttle_seconds:0, dedup_key:"[\"tenant_id\",\"source_ip\"]", dsl:$d[0]}' > "$GA_DIR/ga_rule_create.json"

RID=$(curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @"$GA_DIR/ga_rule_create.json" | jq -r '.id // .rule_id')
echo "$RID" > "$GA_DIR/ga_rule_id.txt"

note "Run-now twice (idempotency)"
printf '{"limit":50}\n' > "$GA_DIR/limit50.json"
curl -fsS -X POST "$BASE_URL/api/v2/rules/$RID/run-now" -H 'content-type: application/json' --data-binary @"$GA_DIR/limit50.json" | jq . > "$GA_DIR/run_now_1.json"
sleep 1
curl -fsS -X POST "$BASE_URL/api/v2/rules/$RID/run-now" -H 'content-type: application/json' --data-binary @"$GA_DIR/limit50.json" | jq . > "$GA_DIR/run_now_2.json"

note "Prove no duplicate alerts (scoped to new rule)"
DUP_COUNT=$(post_sql "SELECT count() FROM (SELECT alert_id,count() c FROM $CLICKHOUSE_DATABASE.alerts WHERE rule_id='$RID' AND created_at>=toUInt32(now())-600 GROUP BY alert_id HAVING c>1)")
save_json "$GA_DIR/dup_check.json" "{\"dup_alert_ids_last_10m\":$DUP_COUNT}"

note "Snapshot rule_state errors (scoped to new rule)"
curl -sS "$CLICKHOUSE_URL/" --data-binary "SELECT rule_id, tenant_id, last_error, updated_at FROM $CLICKHOUSE_DATABASE.rule_state WHERE rule_id='$RID' AND updated_at>=toUInt32(now())-600 AND last_error!='' FORMAT JSON" > "$GA_DIR/rule_errors.json"

