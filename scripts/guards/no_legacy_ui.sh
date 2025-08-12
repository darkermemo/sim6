#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

hits=$(grep -R "siem_unified_pipeline/ui[^-r]" "$ROOT" \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=target --exclude-dir=scripts \
  2>/dev/null || true)

if [[ -n "$hits" ]]; then
  echo "[guard][FAIL] Legacy UI references detected:"
  echo "$hits"
  exit 2
fi

echo "[guard] OK: no legacy UI references."
