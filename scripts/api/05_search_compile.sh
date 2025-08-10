#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

# DSL that hits canonical + JSON path equality + CIDR operator
DSL=$(jq -n '{
  search:{
    tenant_ids:["default"],
    time_range:{last_seconds:1800},
    where:{op:"and", args:[
      {op:"eq", args:["event_category","http"]},
      {op:"json_eq", args:["metadata.http.user_agent","Mozilla"]},
      {op:"ipincidr", args:["source_ip","10.0.0.0/8"]}
    ]},
    limit:50
  }
}')

note "compile"
api /api/v2/search/compile "$DSL" | tee "$ART_DIR/compile_smoke.json" >/dev/null && jq . "$ART_DIR/compile_smoke.json"


