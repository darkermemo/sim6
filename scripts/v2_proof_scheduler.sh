#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
TENANT="${TENANT:-default}"
ART="siem_unified_pipeline/target/test-artifacts"
mkdir -p "$ART"

# Seed
clickhouse client -q "
INSERT INTO dev.events
(event_id,event_timestamp,tenant_id,event_category,event_action,event_outcome,source_ip,destination_ip,user_id,user_name,severity,message,raw_event,metadata,source_type,created_at)
VALUES
('sched-1',toUInt32(now())-5,'$TENANT','auth','login','failure','10.0.0.5','10.0.0.10',NULL,'alice','HIGH','login fail','{}','{}','app',toUInt32(now())),
('sched-2',toUInt32(now())-4,'$TENANT','auth','login','failure','10.0.0.6','10.0.0.10',NULL,'bob','HIGH','login fail','{}','{}','app',toUInt32(now()))
" || true

cat >/tmp/rule_sched.json <<JSON
{
  "name":"Scheduler Proof",
  "description":"high login fails",
  "severity":"HIGH",
  "enabled":1,
  "schedule_sec":5,
  "throttle_seconds":0,
  "dedup_key":"[\"tenant_id\",\"user_name\",\"source_ip\"]",
  "dsl":{
    "search":{
      "tenant_ids":["$TENANT"],
      "time_range":{"last_seconds":900},
      "where":{"op":"and","args":[
        {"op":"eq","args":["severity","HIGH"]},
        {"op":"contains","args":["message","fail"]}
      ]}
    }
  }
}
JSON

curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @/tmp/rule_sched.json \
  | tee "$ART/scheduler_create.json" >/dev/null
RID=$(jq -r '.id // .rule_id // empty' "$ART/scheduler_create.json")
[ -n "$RID" ] || { echo "RID empty"; exit 1; }

sleep 8
curl -fsS "$BASE_URL/api/v2/alerts?limit=5" | tee "$ART/scheduler_alerts.json" >/dev/null
ALEN=$(jq '.alerts|length' "$ART/scheduler_alerts.json")
echo "SCHED_ALERTS=$ALEN"
[ "$ALEN" -ge 1 ]

curl -fsS "$BASE_URL/metrics" | egrep '^siem_v2_(rules_run_total|alerts_written_total|scheduler_tick_seconds)' \
  | tee "$ART/scheduler_metrics.txt" >/dev/null

echo "Scheduler proof PASS for $RID"


