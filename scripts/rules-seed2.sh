#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
ART_DIR="target/test-artifacts"
mkdir -p "$ART_DIR"
IDS_FILE="$ART_DIR/rule_ids.txt"
: >"$IDS_FILE"

note(){ printf '[rules] %s\n' "$*"; }
post(){ curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @-; }

note "seed start"

# 1) Threshold failed logins (canonical)
post <<'JSON' | jq -r '.id // empty' >> "$IDS_FILE"
{"name":"Threshold Failed Logins","severity":"medium","enabled":1,
 "dsl":{"version":"1","search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
 "where":{"op":"and","args":[{"op":"eq","args":["event_category","auth"]},{"op":"eq","args":["event_outcome","failure"]}]}}},
 "threshold":{"group_by":["user_name","source_ip"],"gte":5,"window_seconds":900}}
JSON

# 2) HTTP UA (json_meta on metadata.http.user_agent)
post <<'JSON' | jq -r '.id // empty' >> "$IDS_FILE"
{"name":"HTTP UA Mozilla","severity":"low","enabled":1,
 "dsl":{"version":"1","search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
 "where":{"op":"jsoneq","args":["metadata.http.user_agent","Mozilla"]}}}}
JSON

# 3) OTel service (json_raw on raw_event.resource.service.name)
post <<'JSON' | jq -r '.id // empty' >> "$IDS_FILE"
{"name":"OTel service app","severity":"low","enabled":1,
 "dsl":{"version":"1","search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
 "where":{"op":"jsoneq","args":["raw_event.resource.service.name","app"]}}}}
JSON

# 4) GCP method (json_raw on raw_event.protoPayload.methodName)
post <<'JSON' | jq -r '.id // empty' >> "$IDS_FILE"
{"name":"GCP audit methods","severity":"low","enabled":1,
 "dsl":{"version":"1","search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
 "where":{"op":"jsoneq","args":["raw_event.protoPayload.methodName","google.iam.admin.v1.CreateUser"]}}}}
JSON

# 5) CIDR filter
post <<'JSON' | jq -r '.id // empty' >> "$IDS_FILE"
{"name":"CIDR 10/8","severity":"low","enabled":1,
 "dsl":{"version":"1","search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
 "where":{"op":"ipincidr","args":["source_ip","10.0.0.0/8"]}}}}
JSON

# 6) contains_any on message
post <<'JSON' | jq -r '.id // empty' >> "$IDS_FILE"
{"name":"Contains fail/error","severity":"low","enabled":1,
 "dsl":{"version":"1","search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
 "where":{"op":"containsany","args":["message",["fail","error"]]}}}}
JSON

note "seed done ids=$(tr "\n" ' ' < "$IDS_FILE")"


