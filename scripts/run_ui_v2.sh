#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/siem_unified_pipeline/ui-react-v2"
VITE_API_URL="${VITE_API_URL:-http://127.0.0.1:9999}" npm run build
exec npm run preview
