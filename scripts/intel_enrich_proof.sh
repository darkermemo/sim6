#!/usr/bin/env bash
# intel_enrich_proof.sh - Test intel enrichment functionality
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
    echo -e "${GREEN}[intel]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[intel]${NC} $1"
}

error() {
    echo -e "${RED}[intel]${NC} $1"
}

# 1. Insert test IOCs
log "Inserting test IOCs..."
$CH_CLIENT -q "
INSERT INTO dev.intel_iocs (ioc, kind) VALUES 
    ('192.168.1.100', 'ip'),
    ('evil.example.com', 'domain'),
    ('10.0.0.50', 'ip'),
    ('93.184.216.34', 'ip'),
    ('d41d8cd98f00b204e9800998ecf8427e', 'hash')
"

# Wait for IOCs to be available
sleep 1

# 2. Create events that should match IOCs
log "Creating events with matching IOCs..."

# Event with matching IP
MATCHING_EVENT=$(cat <<'EOF'
{
    "tenant_id": "test",
    "source_type": "okta",
    "message": "Suspicious login from blacklisted IP",
    "eventType": "user.session.start",
    "actor": {"displayName": "John Doe", "alternateId": "john@evil.example.com"},
    "client": {"ipAddress": "192.168.1.100"},
    "outcome": {"result": "SUCCESS"}
}
EOF
)

# Event with matching domain in parsed fields
DOMAIN_EVENT=$(cat <<'EOF'
{
    "tenant_id": "test", 
    "source_type": "dns",
    "message": "DNS query for suspicious domain",
    "query_name": "evil.example.com",
    "source_ip": "10.1.1.1"
}
EOF
)

# Ingest events
log "Ingesting events for enrichment..."
NDJSON=$(echo -e "$MATCHING_EVENT\n$DOMAIN_EVENT")
echo "$NDJSON" > "$ART/intel_test_events.ndjson"

HTTP_CODE=$(curl -sS -w "%{http_code}" -o "$ART/intel_ingest_response.json" \
    -X POST "$API_BASE/api/v2/ingest/ndjson?tenant=test" \
    -H 'Content-Type: application/x-ndjson' \
    --data-binary @"$ART/intel_test_events.ndjson")

if [ "$HTTP_CODE" != "200" ]; then
    error "Ingest failed with HTTP $HTTP_CODE"
    cat "$ART/intel_ingest_response.json"
    exit 1
fi

# Wait for events to be processed
sleep 3

# 3. Query enriched events
log "Querying enriched events..."
$CH_CLIENT -q "
SELECT 
    event_id,
    message,
    source_ip,
    ti_hits,
    ti_match
FROM dev.events 
WHERE tenant_id = 'test' 
  AND event_timestamp >= toUnixTimestamp(now() - INTERVAL 5 MINUTE)
  AND ti_match = 1
ORDER BY created_at DESC
LIMIT 10
FORMAT JSON
" > "$ART/intel_enrich_hits.json"

# Also check all recent events
$CH_CLIENT -q "
SELECT 
    event_id,
    substring(message, 1, 50) as message_preview,
    source_ip,
    ti_match,
    length(ti_hits) as ti_hit_count
FROM dev.events 
WHERE tenant_id = 'test' 
  AND event_timestamp >= toUnixTimestamp(now() - INTERVAL 5 MINUTE)
ORDER BY created_at DESC
LIMIT 20
FORMAT JSON
" > "$ART/intel_all_recent.json"

# 4. Verify enrichment
log "Verifying intel enrichment..."

ENRICHED_COUNT=$(jq '.rows // 0' "$ART/intel_enrich_hits.json" 2>/dev/null || echo "0")
if [ "$ENRICHED_COUNT" -eq 0 ]; then
    warn "No enriched events found"
    log "Checking all recent events..."
    jq '.' "$ART/intel_all_recent.json" || true
else
    log "Found $ENRICHED_COUNT enriched events with IOC matches"
    
    # Check for specific matches
    if jq -e '.data[0].ti_match == 1' "$ART/intel_enrich_hits.json" >/dev/null 2>&1; then
        log "✓ ti_match field correctly set"
    fi
    
    if jq -e '.data[0].ti_hits | length > 0' "$ART/intel_enrich_hits.json" >/dev/null 2>&1; then
        log "✓ ti_hits array populated"
    fi
fi

# 5. Display IOC stats
log "Current IOC statistics..."
$CH_CLIENT -q "
SELECT 
    kind,
    count() as total_iocs
FROM dev.intel_iocs
GROUP BY kind
FORMAT PrettyCompact
"

# Summary
log "Intel enrichment test complete. Artifacts:"
log "  - $ART/intel_enrich_hits.json (enriched events)"
log "  - $ART/intel_all_recent.json (all recent events)"
log "  - $ART/intel_test_events.ndjson (test input)"

# Final check for the gate
if [ "$ENRICHED_COUNT" -gt 0 ]; then
    log "RESULT: PASS - Found enriched events"
else
    error "RESULT: FAIL - No enriched events found"
    exit 1
fi
