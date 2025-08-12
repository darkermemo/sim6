#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ART="$ROOT/target/test-artifacts"; mkdir -p "$ART"

# Hard guard: fail if anything still references the legacy UI path.
if grep -R "siem_unified_pipeline/ui[^-r]" "$ROOT" \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=target --exclude-dir=scripts \
  2>/dev/null; then
  echo "[ux][FAIL] legacy UI path referenced in repo. Remove or update references."
  exit 2
fi

echo "[ux] start API"
(cd "$ROOT/siem_unified_pipeline" && cargo build --release --bin siem-pipeline >/dev/null)
nohup "$ROOT/siem_unified_pipeline/target/release/siem-pipeline" >"$ART/api_ux.log" 2>&1 & echo $! > "$ART/api_ux.pid"
for i in {1..60}; do curl -fsS http://127.0.0.1:9999/api/v2/health >/dev/null && break; sleep 1; done

echo "[ux] build ui-react"
(cd "$ROOT/siem_unified_pipeline/ui-react" && npm ci && VITE_API_URL="http://127.0.0.1:9999" npm run build)

echo "[ux] preview ui-react on 5173 (strict)"
nohup bash -c 'cd "'"$ROOT"'/siem_unified_pipeline/ui-react" && npm run preview -- --strictPort --port 5173' \
  >"$ART/ui_preview_ci.log" 2>&1 & echo $! > "$ART/ui_preview_ci.pid"
for i in {1..60}; do curl -fsS http://127.0.0.1:5173/ui/app/ >/dev/null && break; sleep 1; done

echo "[ux] playwright (new UI)"
(cd "$ROOT/siem_unified_pipeline/ui-react" && \
  E2E_BASE_URL="http://127.0.0.1:5173/ui/app" npx playwright test --reporter=list | tee "$ART/ui_e2e_ci_output.txt")

# artifacts
cp -r "$ROOT/siem_unified_pipeline/ui-react/playwright-report" "$ART/ui_playwright_report" 2>/dev/null || true
echo "[ux] done"

