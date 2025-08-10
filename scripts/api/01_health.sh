#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

note "health"
out="$ART_DIR/health.json"
if api /api/v2/health > "$out" 2>/dev/null; then
  jq . "$out"
else
  # fallback to /health if v2 isn’t mounted
  api /health > "$out"
  jq . "$out"
fi


