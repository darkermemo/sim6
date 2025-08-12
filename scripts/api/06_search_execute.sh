#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

DSL="${1:-}"
if [[ -z "$DSL" ]]; then
  DSL=$(jq -n '{search:{tenant_ids:["default"], time_range:{last_seconds:1800}, where:{op:"contains", args:["message","fail"]}, limit:20}}')
fi

note "execute"
api /api/v2/search/execute "$(jq -n --argjson d "$DSL" '{dsl:$d}')" \
  | tee "$ART_DIR/execute_smoke.json" >/dev/null && jq '.data.data|length' "$ART_DIR/execute_smoke.json"

