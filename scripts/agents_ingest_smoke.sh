#!/usr/bin/env bash
# agents_ingest_smoke.sh - Test agent-based ingest
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
    echo -e "${GREEN}[ingest]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[ingest]${NC} $1"
}

error() {
    echo -e "${RED}[ingest]${NC} $1"
}

# Get agent details from previous enrollment
if [ -f "$ART/agents_enroll_response.json" ]; then
    AGENT_ID=$(jq -r '.agent_id' "$ART/agents_enroll_response.json")
    API_KEY=$(jq -r '.api_key' "$ART/agents_enroll_response.json")
    SOURCE_ID=$(jq -r '.source_id' "$ART/agents_enroll_response.json")
    log "Using existing agent: $AGENT_ID"
else
    error "No agent enrollment found. Run agents_enroll_proof.sh first."
    exit 1
fi

# 1. Create test events as if from agent
log "Creating test events..."

# Simulate Windows Sysmon events
cat > "$ART/agent_test_events.ndjson" <<EOF
{"tenant_id": 1, "source_id": "$SOURCE_ID", "source_type": "windows_sysmon", "message": "Process Create: chrome.exe", "event_category": "process", "severity": "info"}
{"tenant_id": 1, "source_id": "$SOURCE_ID", "source_type": "windows_sysmon", "message": "Network connection: 10.0.0.1:443", "event_category": "network", "severity": "info"}
{"tenant_id": 1, "source_id": "$SOURCE_ID", "source_type": "windows_sysmon", "message": "Registry value set: HKLM\\Software\\Test", "event_category": "registry", "severity": "low"}
{"tenant_id": 1, "source_id": "$SOURCE_ID", "source_type": "windows_sysmon", "message": "File created: C:\\Temp\\test.txt", "event_category": "file", "severity": "info"}
{"tenant_id": 1, "source_id": "$SOURCE_ID", "source_type": "windows_sysmon", "message": "DNS query: example.com", "event_category": "network", "severity": "info"}
EOF

# 2. Ingest events with API key
log "Ingesting events via NDJSON endpoint..."

HTTP_CODE=$(curl -sS -w "%{http_code}" -o "$ART/agents_ingest_response.json" \
    -X POST "$API_BASE/api/v2/ingest/ndjson?tenant=1" \
    -H 'Content-Type: application/x-ndjson' \
    -H "X-API-Key: $API_KEY" \
    --data-binary @"$ART/agent_test_events.ndjson")

if [ "$HTTP_CODE" != "200" ]; then
    error "Ingest failed with HTTP $HTTP_CODE"
    cat "$ART/agents_ingest_response.json"
    exit 1
fi

log "✓ Events ingested successfully"

# Wait for events to be written
sleep 2

# 3. Query events count
log "Verifying ingested events..."

EVENT_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.events 
WHERE source_id = '$SOURCE_ID' 
  AND source_type = 'windows_sysmon'
  AND event_timestamp >= toUnixTimestamp(now() - INTERVAL 5 MINUTE)
FORMAT TabSeparated
" 2>/dev/null || echo "0")

echo "$EVENT_COUNT" > "$ART/agents_ingest_count.tsv"

if [ "$EVENT_COUNT" -ge 5 ]; then
    log "✓ Found $EVENT_COUNT events from agent"
else
    error "Expected at least 5 events, found $EVENT_COUNT"
    exit 1
fi

# 4. Check normalization (if parser is bound)
log "Checking event normalization..."

# Check if log source has a parser
PARSER_ID=$($CH_CLIENT -q "SELECT parser_id FROM dev.log_sources_admin WHERE source_id = '$SOURCE_ID' FORMAT TabSeparated" 2>/dev/null || echo "")

if [ -n "$PARSER_ID" ] && [ "$PARSER_ID" != "" ]; then
    log "Parser '$PARSER_ID' is bound to source"
    
    # Check normalized fields
    NORMALIZED_COUNT=$($CH_CLIENT -q "
    SELECT count()
    FROM dev.events 
    WHERE source_id = '$SOURCE_ID'
      AND event_category != ''
      AND event_timestamp >= toUnixTimestamp(now() - INTERVAL 5 MINUTE)
    FORMAT TabSeparated
    " 2>/dev/null || echo "0")
    
    if [ "$NORMALIZED_COUNT" -gt 0 ]; then
        log "✓ Found $NORMALIZED_COUNT events with normalized fields"
    else
        warn "No normalized fields found (parser may not be configured)"
    fi
else
    log "No parser bound to log source (normalization skipped)"
fi

# 5. Check ingest response
log "Checking ingest response..."

ACCEPTED=$(jq -r '.accepted // 0' "$ART/agents_ingest_response.json")
QUARANTINED=$(jq -r '.quarantined // 0' "$ART/agents_ingest_response.json")

log "Ingest results: accepted=$ACCEPTED, quarantined=$QUARANTINED"

if [ "$ACCEPTED" -ge 5 ]; then
    log "✓ All events accepted"
else
    warn "Some events may have been rejected"
fi

# 6. Optional: simulate agent heartbeat with queue stats
if [ -n "$AGENT_ID" ]; then
    log "Sending heartbeat with ingest stats..."
    
    HEARTBEAT=$(cat <<EOF
{
    "version": "v1.2.3",
    "eps": $(($EVENT_COUNT * 60)),
    "queue_depth": 0,
    "last_ok": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)
    
    curl -sS -X POST "$API_BASE/api/v2/agents/$AGENT_ID/heartbeat" \
        -H 'Content-Type: application/json' \
        -d "$HEARTBEAT" > /dev/null
fi

# Summary
log "Agent ingest test complete. Artifacts:"
log "  - $ART/agent_test_events.ndjson"
log "  - $ART/agents_ingest_response.json"
log "  - $ART/agents_ingest_count.tsv"

log "RESULT: PASS - Agent ingest working correctly"
