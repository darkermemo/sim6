#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Ensure API is running
if ! curl -sS http://127.0.0.1:9999/health >/dev/null; then
  if [ -x scripts/restart_api.sh ]; then bash scripts/restart_api.sh; fi
  for i in $(seq 1 40); do curl -sS http://127.0.0.1:9999/health >/dev/null && break || sleep 0.25; done
fi

cd siem_unified_pipeline/ui-react
npm run dev


