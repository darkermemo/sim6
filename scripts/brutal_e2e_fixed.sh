#!/usr/bin/env bash
set -euo pipefail

echo "=== BRUTAL E2E TEST WITH FIXES ==="

# 0) kill strays & prep artifacts
echo "[1/5] Killing strays & prepping artifacts..."
pkill -f siem-pipeline 2>/dev/null || true
pkill -f "vite|preview" 2>/dev/null || true
mkdir -p target/test-artifacts

# 1) build & run API (release) on :9999
echo "[2/5] Building & running API..."
(cd siem_unified_pipeline && cargo build --release --bin siem-pipeline)
nohup ./siem_unified_pipeline/target/release/siem-pipeline \
  > target/test-artifacts/api.log 2>&1 & echo $! > target/test-artifacts/api.pid

echo "Waiting for API..."
for i in {1..60}; do 
    if curl -fsS http://127.0.0.1:9999/api/v2/health >/dev/null 2>&1; then
        break
    fi
    echo -n "."
    sleep 1
done
echo
echo "[api] $(curl -fsS http://127.0.0.1:9999/api/v2/health)"

# 2) build UI with API base baked in, then preview at /ui/app/ on :5173
echo "[3/5] Building UI with API URL baked in..."
(
  cd siem_unified_pipeline/ui-react
  npm i
  VITE_API_URL="http://127.0.0.1:9999" npm run build
)

echo "Starting UI preview server..."
nohup bash -lc 'cd siem_unified_pipeline/ui-react && npm run preview -- --strictPort --port 5173 --host' \
  > target/test-artifacts/ui.log 2>&1 & echo $! > target/test-artifacts/ui.pid

echo "Waiting for UI..."
for i in {1..30}; do 
    if curl -fsS http://127.0.0.1:5173/ui/app/ >/dev/null 2>&1; then
        break
    fi
    echo -n "."
    sleep 1
done
echo
echo "[ui] $(curl -fsS -I http://127.0.0.1:5173/ui/app/ | head -1)"

# 3) sanity smoke (compiles & executes)
echo "[4/5] Running API sanity tests..."
printf '{"tenant_id":"default","time":{"last_seconds":60},"q":"message:hello"}' > target/test-artifacts/compile.json
printf '{"tenant_id":"default","time":{"last_seconds":60},"q":"message:hello","limit":5}' > target/test-artifacts/execute.json
echo "Compile test: $(curl -fsS -X POST http://127.0.0.1:9999/api/v2/search/compile -H 'content-type: application/json' --data-binary @target/test-artifacts/compile.json | jq -c .sql)"
echo "Execute test: $(curl -fsS -X POST http://127.0.0.1:9999/api/v2/search/execute -H 'content-type: application/json' --data-binary @target/test-artifacts/execute.json | jq -c .took_ms)"

# 4) run BRUTAL E2E (with trailing slash!)
echo "[5/5] Running BRUTAL E2E tests..."
export E2E_BASE_URL="http://127.0.0.1:5173/ui/app/"
(
  cd siem_unified_pipeline/ui-react
  npx playwright test --reporter=list --retries=0 --forbid-only --timeout=60000
)

echo
echo "=== TEST COMPLETE ==="
echo "Artifacts in:"
echo "  - siem_unified_pipeline/ui-react/playwright-report/"
echo "  - target/test-artifacts/"
echo
echo "To view report: cd siem_unified_pipeline/ui-react && npx playwright show-report"
