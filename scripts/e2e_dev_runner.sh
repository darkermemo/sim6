#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART"

echo "[e2e] ensure API running"
if ! curl -fsS "http://127.0.0.1:9999/api/v2/health" >/dev/null 2>&1; then
  (cd "$ROOT/siem_unified_pipeline" && nohup cargo run --bin siem-pipeline >"$ART/api_ui_e2e.log" 2>&1 & echo $! > "$ART/api_ui_e2e.pid")
  for i in {1..60}; do
    curl -fsS "http://127.0.0.1:9999/api/v2/health" >/dev/null 2>&1 && break
    sleep 1
  done
fi

echo "[e2e] build & preview ui-react"
cd "$ROOT/siem_unified_pipeline/ui-react"
npm ci >/dev/null 2>&1 || npm i
npm run build
PORT=5173
if lsof -i :$PORT >/dev/null 2>&1; then
  echo "[e2e] port $PORT in use; killing process"
  PIDS="$(lsof -ti :$PORT || true)"
  for PID in $PIDS; do
    kill -9 "$PID" 2>/dev/null || true
  done
fi
nohup npm run preview -- --strictPort --port $PORT >"$ART/ui_preview.log" 2>&1 & echo $! > "$ART/ui_preview.pid"
for i in {1..30}; do
  curl -fsS "http://127.0.0.1:$PORT/ui/app" >/dev/null 2>&1 && break
  sleep 1
done

echo "[e2e] install playwright (first run)"
npm i -D @playwright/test >/dev/null 2>&1 || true
npx playwright install --with-deps >/dev/null 2>&1 || true

echo "[e2e] run tests"
E2E_BASE_URL="http://127.0.0.1:$PORT/ui/app" npm run e2e | tee "$ART/ui_e2e_output.txt"

echo "[e2e] copy report"
cp -r "$ROOT/siem_unified_pipeline/ui-react/playwright-report" "$ART/ui_playwright_report" 2>/dev/null || true

echo "[e2e] done"


