#!/usr/bin/env bash
set -euo pipefail

echo "=== BRUTAL E2E REGRESSION TEST ==="
echo "Progress: 5%"

# Step 0: Kill strays & prep
echo "Step 0: Kill strays & prep"
pkill -f siem-pipeline 2>/dev/null || true
pkill -f "vite|preview" 2>/dev/null || true
mkdir -p target/test-artifacts

echo "Progress: 10%"

# Step 1: Build & run API (release)
echo "Step 1: Build & run API (release)"
(cd siem_unified_pipeline && cargo build --release --bin siem-pipeline)

echo "Starting API in background..."
nohup ./siem_unified_pipeline/target/release/siem-pipeline > target/test-artifacts/api.log 2>&1 &
echo $! > target/test-artifacts/api.pid

echo "Waiting for API to be ready..."
for i in {1..60}; do
    if curl -fsS http://127.0.0.1:9999/api/v2/health >/dev/null 2>&1; then
        echo "API ready!"
        break
    fi
    echo -n "."
    sleep 1
done
echo

echo "Progress: 40%"

# Step 2: Build & preview UI at /ui/app on :5173
echo "Step 2: Build & preview UI"
(cd siem_unified_pipeline/ui-react && npm i && npm run build)

echo "Starting UI in background..."
cd siem_unified_pipeline/ui-react
nohup npm run preview -- --strictPort --port 5173 > ../../target/test-artifacts/ui.log 2>&1 &
echo $! > ../../target/test-artifacts/ui.pid
cd ../..

echo "Waiting for UI to be ready..."
for i in {1..30}; do
    if curl -fsS http://127.0.0.1:5173/ui/app/ >/dev/null 2>&1; then
        echo "UI ready!"
        break
    fi
    echo -n "."
    sleep 1
done
echo

echo "Progress: 70%"

# Step 3: Run e2e tests
echo "Step 3: Running e2e tests"
export E2E_BASE_URL="http://127.0.0.1:5173/ui/app"
(cd siem_unified_pipeline/ui-react && npx playwright test --reporter=list)

echo "Progress: 100%"
echo "=== TEST COMPLETE ==="
echo
echo "View logs:"
echo "  API: tail -f target/test-artifacts/api.log"
echo "  UI:  tail -f target/test-artifacts/ui.log"
echo
echo "View test report:"
echo "  (cd siem_unified_pipeline/ui-react && npx playwright show-report)"
