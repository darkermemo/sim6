#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

note "alerts (limit=10)"
api "/api/v2/alerts?limit=10" | tee "$ART_DIR/alerts_list.json" >/dev/null


