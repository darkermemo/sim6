#!/usr/bin/env bash
# UI smoke via Playwright (optional if Node not present)

set -Eeuo pipefail
source scripts/ga/00_env.sh

if command -v node >/dev/null 2>&1; then
  note "Running Playwright admin log-sources spec"
  (cd siem_unified_pipeline/ui && npx --yes playwright install --with-deps >/dev/null 2>&1 || true
   npx --yes playwright test || true) \
   | tee "$GA_DIR/playwright.out" >/dev/null
else
  save_json "$GA_DIR/playwright.out" "node not installed; skipped"
fi

