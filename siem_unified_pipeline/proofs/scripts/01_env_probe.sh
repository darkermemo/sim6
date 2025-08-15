#!/usr/bin/env bash
set -euo pipefail

# Stage 1: Environment Probe
PROOF_DIR="$1"
API_URL="$2"
CH_HOST="$3"

echo "🔍 Environment Probe - Writing system state artifacts"

mkdir -p "$PROOF_DIR/sys"

# Capture environment variables
cat > "$PROOF_DIR/sys/env.json" << EOF
{
  "api_url": "${API_URL}",
  "ch_host": "${CH_HOST}",
  "ui_url": "http://localhost:5183",
  "kafka_brokers": "${KAFKA_BROKERS:-localhost:9092}",
  "redis_url": "${REDIS_URL:-redis://localhost:6379}",
  "node_env": "${NODE_ENV:-development}",
  "rust_env": "${RUST_LOG:-info}",
  "proof_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Capture version information
{
  echo "{"
  echo "  \"node\": \"$(node --version 2>/dev/null || echo 'not_found')\","
  echo "  \"npm\": \"$(npm --version 2>/dev/null || echo 'not_found')\","
  echo "  \"rust\": \"$(rustc --version 2>/dev/null || echo 'not_found')\","
  echo "  \"cargo\": \"$(cargo --version 2>/dev/null || echo 'not_found')\","
  echo "  \"clickhouse\": \"$(clickhouse --version 2>/dev/null | head -1 || echo 'not_found')\","
  echo "  \"git\": \"$(git --version 2>/dev/null || echo 'not_found')\","
  echo "  \"jq\": \"$(jq --version 2>/dev/null || echo 'not_found')\","
  echo "  \"curl\": \"$(curl --version 2>/dev/null | head -1 || echo 'not_found')\""
  echo "}"
} > "$PROOF_DIR/sys/versions.json"

# Test basic connectivity
echo "🌐 Testing connectivity..."

# API reachable
if curl -sS --max-time 5 "$API_URL/api/v2/health" > /dev/null 2>&1; then
  API_REACHABLE="true"
else
  API_REACHABLE="false"
fi

# ClickHouse reachable
if echo "SELECT 1" | clickhouse client --host $(echo $CH_HOST | cut -d: -f1) --port $(echo $CH_HOST | cut -d: -f2) > /dev/null 2>&1; then
  CH_REACHABLE="true"
else
  CH_REACHABLE="false"
fi

# UI reachable
if curl -sS --max-time 5 "http://localhost:5183/ui/v3" > /dev/null 2>&1; then
  UI_REACHABLE="true"
else
  UI_REACHABLE="false"
fi

# Connectivity summary
cat > "$PROOF_DIR/sys/connectivity.json" << EOF
{
  "api_reachable": $API_REACHABLE,
  "clickhouse_reachable": $CH_REACHABLE,
  "ui_reachable": $UI_REACHABLE,
  "all_services_up": $([ "$API_REACHABLE" = "true" ] && [ "$CH_REACHABLE" = "true" ] && [ "$UI_REACHABLE" = "true" ] && echo "true" || echo "false")
}
EOF

# Check if all critical services are reachable
if [ "$API_REACHABLE" != "true" ] || [ "$CH_REACHABLE" != "true" ] || [ "$UI_REACHABLE" != "true" ]; then
  echo "❌ FAIL: Critical services not reachable"
  echo "   API: $API_REACHABLE, ClickHouse: $CH_REACHABLE, UI: $UI_REACHABLE"
  exit 1
fi

echo "✅ PASS: Environment probe complete"
echo "   API: $API_REACHABLE, ClickHouse: $CH_REACHABLE, UI: $UI_REACHABLE"
