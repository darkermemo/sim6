#!/usr/bin/env bash
# parsers_normalize_proof.sh - Test parser normalization functionality
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
    echo -e "${GREEN}[parsers]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[parsers]${NC} $1"
}

error() {
    echo -e "${RED}[parsers]${NC} $1"
}

# Sample log data
OKTA_LOG='{"eventType": "user.session.start", "actor": {"displayName": "Alice Smith", "alternateId": "alice@example.com"}, "client": {"ipAddress": "192.168.1.100"}, "outcome": {"result": "SUCCESS"}, "displayMessage": "User login to Okta"}'

WINDOWS_LOG='{"EventID": 4624, "Computer": "WORKSTATION01", "TargetUserName": "bob", "IpAddress": "10.0.0.50", "LogonType": 3}'

ZEEK_LOG='{"id.orig_h": "192.168.1.10", "id.resp_h": "93.184.216.34", "method": "GET", "uri": "/index.html", "status_code": 200, "host": "example.com", "user_agent": "Mozilla/5.0"}'

# 1. Create a test log source with parser
log "Creating test log source with parser..."
$CH_CLIENT -q "INSERT INTO dev.log_sources_admin (id, name, source_type, parser_id, enabled) VALUES ('okta-dev', 'Okta Development', 'okta', 'okta', 1)" 2>/dev/null || true

# 2. Test normalization endpoint
log "Testing parse/normalize endpoint..."

# Test Okta normalization
log "Normalizing Okta log..."
curl -sS -X POST "$API_BASE/api/v2/parse/normalize" \
    -H 'Content-Type: application/json' \
    -d "{\"tenant_id\": \"test\", \"sample\": $(echo "$OKTA_LOG" | jq -Rsa .)}" \
    > "$ART/normalize_okta.json"

# Test Windows normalization
log "Normalizing Windows log..."
curl -sS -X POST "$API_BASE/api/v2/parse/normalize" \
    -H 'Content-Type: application/json' \
    -d "{\"tenant_id\": \"test\", \"sample\": $(echo "$WINDOWS_LOG" | jq -Rsa .), \"vendor\": \"windows\"}" \
    > "$ART/normalize_windows.json"

# Test Zeek normalization
log "Normalizing Zeek log..."
curl -sS -X POST "$API_BASE/api/v2/parse/normalize" \
    -H 'Content-Type: application/json' \
    -d "{\"tenant_id\": \"test\", \"sample\": $(echo "$ZEEK_LOG" | jq -Rsa .), \"vendor\": \"zeek_http\"}" \
    > "$ART/normalize_zeek.json"

# 3. Ingest events with source type that has parser
log "Ingesting NDJSON with parsed source..."
NDJSON_PAYLOAD=$(cat <<EOF
{"tenant_id": "test", "source_type": "okta", "message": "Test okta event", $OKTA_LOG}
{"tenant_id": "test", "source_type": "windows", "message": "Test windows event", $WINDOWS_LOG}
{"tenant_id": "test", "source_type": "zeek_http", "message": "Test zeek event", $ZEEK_LOG}
EOF
)

# Remove outer braces from log objects to merge fields
NDJSON_PAYLOAD=$(echo "$NDJSON_PAYLOAD" | sed 's/, {/, /g' | sed 's/}}/}/g')

echo "$NDJSON_PAYLOAD" > "$ART/parsers_test_input.ndjson"

HTTP_CODE=$(curl -sS -w "%{http_code}" -o "$ART/ingest_response.json" \
    -X POST "$API_BASE/api/v2/ingest/ndjson?tenant=test" \
    -H 'Content-Type: application/x-ndjson' \
    --data-binary @"$ART/parsers_test_input.ndjson")

if [ "$HTTP_CODE" != "200" ]; then
    error "Ingest failed with HTTP $HTTP_CODE"
    cat "$ART/ingest_response.json"
    exit 1
fi

# Wait for events to be written
sleep 2

# 4. Query normalized events
log "Querying normalized events..."
$CH_CLIENT -q "
SELECT 
    event_category,
    event_type,
    action,
    user,
    source_ip,
    host,
    vendor,
    product,
    parsed_fields
FROM dev.events 
WHERE tenant_id = 'test' 
  AND event_timestamp >= toUnixTimestamp(now() - INTERVAL 5 MINUTE)
  AND source_type IN ('okta', 'windows', 'zeek_http')
ORDER BY created_at DESC
LIMIT 10
FORMAT JSON
" > "$ART/events_norm_sample.json"

# 5. Verify results
log "Verifying normalization results..."

# Check normalize endpoint responses
OKTA_CHECK=$(jq -r '.records[0].event_category // empty' "$ART/normalize_okta.json")
WINDOWS_CHECK=$(jq -r '.records[0].event_category // empty' "$ART/normalize_windows.json")
ZEEK_CHECK=$(jq -r '.records[0].event_category // empty' "$ART/normalize_zeek.json")

if [ -z "$OKTA_CHECK" ] || [ -z "$WINDOWS_CHECK" ] || [ -z "$ZEEK_CHECK" ]; then
    error "Normalization endpoint failed to return categories"
    exit 1
fi

# Check events in ClickHouse
EVENT_COUNT=$(jq '.rows // 0' "$ART/events_norm_sample.json")
if [ "$EVENT_COUNT" -eq 0 ]; then
    warn "No normalized events found in ClickHouse"
else
    log "Found $EVENT_COUNT normalized events"
fi

# Summary
log "Parser normalization test complete. Artifacts:"
log "  - $ART/normalize_okta.json"
log "  - $ART/normalize_windows.json"
log "  - $ART/normalize_zeek.json"
log "  - $ART/events_norm_sample.json"
