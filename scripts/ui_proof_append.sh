#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ART="siem_unified_pipeline/target/test-artifacts"
OUT="$ART/final_reportv1.md"
mkdir -p "$ART"

# Run Playwright suite (native, headless)
pushd tests/ui >/dev/null
npm ci || npm i
npm run install:browsers || true
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}" npx playwright test --reporter=list
popd >/dev/null

# Copy report artifacts
mkdir -p "$ART/ui/playwright-report"
if [ -d tests/ui/playwright-report ]; then
  cp -a tests/ui/playwright-report/* "$ART/ui/playwright-report/" || true
fi

# Append proof block
now=$(date -u +%FT%TZ)
{
  echo
  echo "## UI Proof — ${now}"
  echo
  echo "**Specs:**"
  echo '```txt'
  ls -1 tests/ui/specs | sed 's/^/- /'
  echo '```'
  echo
  echo "**Screenshots/Report:** saved under siem_unified_pipeline/target/test-artifacts/ui/playwright-report"
} >> "$OUT"

# Tail the updated report
sed -n '1,220p' "$OUT" | tail -n 60


