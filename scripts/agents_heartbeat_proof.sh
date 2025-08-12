#!/usr/bin/env bash
# agents_heartbeat_proof.sh - Test agent heartbeat functionality
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART"

API_BASE="http://127.0.0.1:9999"
CH_CLIENT="clickhouse client"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[heartbeat]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[heartbeat]${NC} $1"
}

error() {
    echo -e "${RED}[heartbeat]${NC} $1"
}

# Get agent ID from previous enrollment (or enroll new one)
if [ -f "$ART/agents_enroll_response.json" ]; then
    AGENT_ID=$(jq -r '.agent_id' "$ART/agents_enroll_response.json")
    log "Using existing agent: $AGENT_ID"
else
    log "No existing agent found, enrolling new one..."
    bash "$ROOT/scripts/agents_enroll_proof.sh"
    AGENT_ID=$(jq -r '.agent_id' "$ART/agents_enroll_response.json")
fi

# 1. Send first heartbeat
log "Sending first heartbeat..."

HEARTBEAT_PAYLOAD=$(cat <<EOF
{
    "version": "v1.2.3",
    "eps": 123,
    "queue_depth": 456,
    "last_ok": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

HTTP_CODE=$(curl -sS -w "%{http_code}" -o /dev/null \
    -X POST "$API_BASE/api/v2/agents/$AGENT_ID/heartbeat" \
    -H 'Content-Type: application/json' \
    -d "$HEARTBEAT_PAYLOAD")

if [ "$HTTP_CODE" != "204" ]; then
    error "First heartbeat failed with HTTP $HTTP_CODE"
    exit 1
fi

log "✓ First heartbeat sent successfully"

# Wait a moment
sleep 1

# 2. Send second heartbeat with updated values
log "Sending second heartbeat..."

HEARTBEAT_PAYLOAD2=$(cat <<EOF
{
    "version": "v1.2.3",
    "eps": 250,
    "queue_depth": 100,
    "last_ok": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

HTTP_CODE=$(curl -sS -w "%{http_code}" -o /dev/null \
    -X POST "$API_BASE/api/v2/agents/$AGENT_ID/heartbeat" \
    -H 'Content-Type: application/json' \
    -d "$HEARTBEAT_PAYLOAD2")

if [ "$HTTP_CODE" != "204" ]; then
    error "Second heartbeat failed with HTTP $HTTP_CODE"
    exit 1
fi

log "✓ Second heartbeat sent successfully"

# 3. Query agents_online view
log "Checking agent online status..."

$CH_CLIENT -q "
SELECT 
    agent_id,
    name,
    online,
    version,
    eps_last,
    queue_depth_last
FROM dev.agents_online 
WHERE agent_id = '$AGENT_ID'
FORMAT TSV
" > "$ART/agents_heartbeat_status.tsv"

# Check if agent is online
ONLINE_STATUS=$(awk '{print $3}' "$ART/agents_heartbeat_status.tsv" | head -1)
if [ "$ONLINE_STATUS" = "1" ]; then
    log "✓ Agent is marked as online"
else
    error "Agent is not marked as online"
    cat "$ART/agents_heartbeat_status.tsv"
    exit 1
fi

# 4. Check metrics
log "Checking heartbeat metrics..."

curl -sS "$API_BASE/api/v2/metrics" | grep -E "siem_v2_agents_(heartbeat|online)" > "$ART/agents_metrics.txt" || true

if grep -q "siem_v2_agents_heartbeat_total" "$ART/agents_metrics.txt"; then
    log "✓ Heartbeat metric found"
else
    warn "Heartbeat metric not found"
fi

if grep -q "siem_v2_agents_online" "$ART/agents_metrics.txt"; then
    log "✓ Online gauge metric found"
else
    warn "Online gauge metric not found"
fi

# 5. Verify database values
log "Verifying database values..."

AGENT_INFO=$($CH_CLIENT -q "
SELECT 
    version,
    eps_last,
    queue_depth_last,
    toUnixTimestamp(last_seen_at) - toUnixTimestamp(now()) as seconds_ago
FROM dev.agents 
WHERE agent_id = '$AGENT_ID'
FORMAT JSONEachRow
" | head -1)

VERSION=$(echo "$AGENT_INFO" | jq -r '.version')
EPS=$(echo "$AGENT_INFO" | jq -r '.eps_last')
QUEUE=$(echo "$AGENT_INFO" | jq -r '.queue_depth_last')

if [ "$VERSION" = "v1.2.3" ] && [ "$EPS" = "250" ] && [ "$QUEUE" = "100" ]; then
    log "✓ Agent values correctly updated in database"
else
    error "Agent values incorrect in database"
    echo "Expected: version=v1.2.3, eps=250, queue=100"
    echo "Got: version=$VERSION, eps=$EPS, queue=$QUEUE"
    exit 1
fi

# Summary
log "Agent heartbeat test complete. Artifacts:"
log "  - $ART/agents_heartbeat_status.tsv"
log "  - $ART/agents_metrics.txt"

log "RESULT: PASS - Agent heartbeat working correctly"
