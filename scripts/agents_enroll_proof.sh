#!/usr/bin/env bash
# agents_enroll_proof.sh - Test agent enrollment and config retrieval
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
    echo -e "${GREEN}[agents]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[agents]${NC} $1"
}

error() {
    echo -e "${RED}[agents]${NC} $1"
}

# 1. Enroll a Windows Sysmon agent
log "Enrolling Windows Sysmon agent..."

ENROLL_PAYLOAD='{"tenant_id": 1, "name": "win-sysmon-01", "kind": "windows_sysmon"}'

HTTP_CODE=$(curl -sS -w "%{http_code}" -o "$ART/agents_enroll_response.json" \
    -X POST "$API_BASE/api/v2/agents/enroll" \
    -H 'Content-Type: application/json' \
    -d "$ENROLL_PAYLOAD")

if [ "$HTTP_CODE" != "200" ]; then
    error "Enrollment failed with HTTP $HTTP_CODE"
    cat "$ART/agents_enroll_response.json"
    exit 1
fi

# Extract agent_id and config_url
AGENT_ID=$(jq -r '.agent_id' "$ART/agents_enroll_response.json")
CONFIG_URL=$(jq -r '.config_url' "$ART/agents_enroll_response.json")
API_KEY=$(jq -r '.api_key' "$ART/agents_enroll_response.json")
SOURCE_ID=$(jq -r '.source_id' "$ART/agents_enroll_response.json")

log "Agent enrolled successfully:"
log "  Agent ID: $AGENT_ID"
log "  Source ID: $SOURCE_ID"
log "  API Key: ${API_KEY:0:10}..."

# 2. Fetch Vector config
log "Fetching Vector config..."

curl -sS "$API_BASE${CONFIG_URL}?format=vector" > "$ART/agent_vector_win.toml"

# 3. Verify config has placeholders replaced
log "Verifying config content..."

if grep -q "{{BASE_URL}}" "$ART/agent_vector_win.toml"; then
    error "Config still contains {{BASE_URL}} placeholder"
    exit 1
fi

if grep -q "{{TENANT_ID}}" "$ART/agent_vector_win.toml"; then
    error "Config still contains {{TENANT_ID}} placeholder"
    exit 1
fi

# Check that values were substituted
if grep -q "tenant_id = 1" "$ART/agent_vector_win.toml"; then
    log "✓ Tenant ID correctly substituted"
else
    error "Tenant ID not found in config"
    exit 1
fi

if grep -q "source_id = \"$SOURCE_ID\"" "$ART/agent_vector_win.toml"; then
    log "✓ Source ID correctly substituted"
else
    error "Source ID not found in config"
    exit 1
fi

# 4. Also fetch Winlogbeat config for comparison
log "Fetching Winlogbeat config..."
curl -sS "$API_BASE${CONFIG_URL}?format=winlogbeat" > "$ART/agent_winlogbeat_win.yml"

# 5. Verify database records
log "Verifying database records..."

# Check agent record
AGENT_COUNT=$($CH_CLIENT -q "SELECT count() FROM dev.agents WHERE agent_id = '$AGENT_ID' FORMAT TabSeparated" 2>/dev/null || echo "0")
if [ "$AGENT_COUNT" -eq 1 ]; then
    log "✓ Agent record found in database"
else
    error "Agent record not found in database"
    exit 1
fi

# Check log source record
SOURCE_COUNT=$($CH_CLIENT -q "SELECT count() FROM dev.log_sources_admin WHERE source_id = '$SOURCE_ID' AND agent_id = '$AGENT_ID' FORMAT TabSeparated" 2>/dev/null || echo "0")
if [ "$SOURCE_COUNT" -eq 1 ]; then
    log "✓ Log source record found in database"
else
    error "Log source record not found in database"
    exit 1
fi

# Summary
log "Agent enrollment test complete. Artifacts:"
log "  - $ART/agents_enroll_response.json"
log "  - $ART/agent_vector_win.toml"
log "  - $ART/agent_winlogbeat_win.yml"

log "RESULT: PASS - Agent enrolled and config retrieved successfully"
