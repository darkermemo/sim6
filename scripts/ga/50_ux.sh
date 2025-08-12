#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART"

echo "[ux] start API"
(cd "$ROOT/siem_unified_pipeline" && nohup cargo run --bin siem-pipeline >"$ART/api_ux.log" 2>&1 & echo $! > "$ART/api_ux.pid")
for i in {1..60}; do
  curl -fsS "http://127.0.0.1:9999/api/v2/health" >/dev/null 2>&1 && break
  sleep 1
done

echo "[ux] build ui-react"
(cd "$ROOT/siem_unified_pipeline/ui-react" && npm ci && npm run build)

echo "[ux] preview ui-react"
PORT=5173
if lsof -i :$PORT >/dev/null 2>&1; then
  echo "[ux] port $PORT in use; killing process"
  PIDS="$(lsof -ti :$PORT || true)"
  for PID in $PIDS; do
    kill -9 "$PID" 2>/dev/null || true
  done
fi
(cd "$ROOT/siem_unified_pipeline/ui-react" && nohup npm run preview -- --strictPort --port $PORT >"$ART/ui_preview_ci.log" 2>&1 & echo $! > "$ART/ui_preview_ci.pid")
for i in {1..30}; do
  curl -fsS "http://127.0.0.1:$PORT/ui/app" >/dev/null 2>&1 && break
  sleep 1
done

echo "[ux] playwright (ui-react)"
(cd "$ROOT/siem_unified_pipeline/ui-react" && E2E_BASE_URL="http://127.0.0.1:$PORT/ui/app" npx playwright test --reporter=list | tee "$ART/ui_e2e_ci_output.txt")

echo "[ux] archive report"
cp -r "$ROOT/siem_unified_pipeline/ui-react/playwright-report" "$ART/ui_playwright_report" 2>/dev/null || true

echo "[ux] done"

