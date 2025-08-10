#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

# DSL that hits canonical + json_meta + CIDR operator
DSL=$(jq -n '{
  search:{
    tenant_ids:["default"],
    time_range:{last_seconds:1800},
    where:{op:"and", args:[
      {op:"eq", args:["event_category","http"]},
      {op:"eq", args:["json_meta","http.user_agent","Mozilla"]},
      {op:"ip_in_cidr", args:["source_ip","10.0.0.0/8"]}
    ]},
    limit:50
  }
}')

note "compile"
api /api/v2/search/compile "$DSL" | tee "$ART_DIR/compile_smoke.json" >/dev/null && jq . "$ART_DIR/compile_smoke.json"


