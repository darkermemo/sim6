#!/usr/bin/env bash
set -euo pipefail

# Wiring smoke test - verify core API endpoints are reachable and working
ART="target/test-artifacts"
mkdir -p "$ART"

# Use the same API base as the UI
API_BASE="http://127.0.0.1:9999/api/v2"

echo "== Wiring Smoke Test =="
echo "API Base: $API_BASE"

# Test health endpoint
echo "Testing health..."
curl -fsS "$API_BASE/health" > "$ART/health.json" || {
    echo "FAIL: Health endpoint unreachable"
    exit 1
}
echo "✓ Health OK"

# Test compile endpoint
echo "Testing compile..."
curl -fsS -X POST "$API_BASE/search/compile" \
    -H "Content-Type: application/json" \
    -d '{"tenant_id":"default","dsl":"event_type:login | stats count() by user | limit 5"}' \
    > "$ART/compile.json" || {
    echo "FAIL: Compile endpoint failed"
    exit 1
}
echo "✓ Compile OK"

# Test execute endpoint
echo "Testing execute..."
curl -fsS -X POST "$API_BASE/search/execute" \
    -H "Content-Type: application/json" \
    -d '{"tenant_id":"default","dsl":"event_type:login | stats count() by user | limit 5","time":{"last_seconds":300}}' \
    > "$ART/execute.json" || {
    echo "FAIL: Execute endpoint failed"
    exit 1
}
echo "✓ Execute OK"

# Test CORS preflight
echo "Testing CORS..."
curl -fsS -X OPTIONS "$API_BASE/search/compile" \
    -H "Origin: http://localhost:5173" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type" \
    -i > "$ART/cors.txt" || {
    echo "FAIL: CORS preflight failed"
    exit 1
}
echo "✓ CORS OK"

echo "All wiring smoke tests passed"
echo "Artifacts saved to: $ART/{health.json,compile.json,execute.json,cors.txt}"
