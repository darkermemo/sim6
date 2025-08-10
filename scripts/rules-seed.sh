#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"

note(){ printf '[rules] %s\n' "$*"; }

post(){
  local path="$1"; shift
  curl -fsS -X POST "$BASE_URL$path" -H 'content-type: application/json' --data-binary @- <<'JSON'
{
  "name": "TEMP",
  "severity": "medium",
  "enabled": true,
  "dsl": {
    "version": "1",
    "search": {"tenant_ids":["default"],"time_range":{"last_seconds":900},
      "where": {"op":"and","args":[]}
    }
  }
}
JSON
}

note "seeding rules…"

# 1) Threshold: failed logins ≥5 per user+ip in 15m
curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @- <<'JSON'
{
  "name":"Threshold Failed Logins",
  "severity":"medium",
  "enabled":true,
  "dsl":{
    "version":"1",
    "search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
      "where":{"op":"and","args":[{"op":"eq","args":["event_category","auth"]},{"op":"eq","args":["event_outcome","failure"]}]}
    },
    "threshold":{"group_by":["user_name","source_ip"],"gte":5,"window_seconds":900}
  }
}
JSON

# 2) UA contains Mozilla via json_meta -> JsonEq(metadata.http.user_agent)
curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @- <<'JSON'
{
  "name":"HTTP UA Mozilla",
  "severity":"low",
  "enabled":true,
  "dsl":{
    "version":"1",
    "search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
      "where":{"op":"jsoneq","args":["metadata.http.user_agent","Mozilla"]}
    }
  }
}
JSON

# 3) OTel service name equals app via json_raw guard
curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @- <<'JSON'
{
  "name":"OTel service app",
  "severity":"low",
  "enabled":true,
  "dsl":{
    "version":"1",
    "search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
      "where":{"op":"jsoneq","args":["raw_event.resource.service.name","app"]}
    }
  }
}
JSON

# 4) GCP method IN set via json_raw
curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @- <<'JSON'
{
  "name":"GCP audit methods",
  "severity":"low",
  "enabled":true,
  "dsl":{
    "version":"1",
    "search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
      "where":{"op":"jsoneq","args":["raw_event.protoPayload.methodName","google.iam.admin.v1.CreateUser"]}
    }
  }
}
JSON

# 5) CIDR filter
curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @- <<'JSON'
{
  "name":"CIDR 10/8",
  "severity":"low",
  "enabled":true,
  "dsl":{
    "version":"1",
    "search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
      "where":{"op":"ipincidr","args":["source_ip","10.0.0.0/8"]}
    }
  }
}
JSON

# 6) contains_any tokens
curl -fsS -X POST "$BASE_URL/api/v2/rules" -H 'content-type: application/json' --data-binary @- <<'JSON'
{
  "name":"Contains fail/error",
  "severity":"low",
  "enabled":true,
  "dsl":{
    "version":"1",
    "search":{"tenant_ids":["default"],"time_range":{"last_seconds":900},
      "where":{"op":"containsany","args":["message",["fail","error"]]}
    }
  }
}
JSON

note "seed complete"

