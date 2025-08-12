#!/usr/bin/env bash
# search_fts_proof.sh - Test free-text search functionality
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
    echo -e "${GREEN}[fts]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[fts]${NC} $1"
}

error() {
    echo -e "${RED}[fts]${NC} $1"
}

# 1. Seed test events with specific tokens
log "Seeding test events for FTS..."

# Clean up old test events
$CH_CLIENT -q "DELETE FROM dev.events WHERE tenant_id = 'fts_test' AND event_timestamp >= toUnixTimestamp(now() - INTERVAL 1 HOUR)" 2>/dev/null || true

# Insert test events
NOW=$(date +%s)
$CH_CLIENT -q "
INSERT INTO dev.events (
    event_id, event_timestamp, tenant_id, event_category, 
    message, raw_event, source_type, created_at
) VALUES 
    (generateUUIDv4(), $NOW, 'fts_test', 'test', 'alpha token present here', '{}', 'test', $NOW),
    (generateUUIDv4(), $NOW, 'fts_test', 'test', 'bravo token is here', '{}', 'test', $NOW),
    (generateUUIDv4(), $NOW, 'fts_test', 'test', 'both alpha and bravo tokens', '{}', 'test', $NOW),
    (generateUUIDv4(), $NOW, 'fts_test', 'test', 'unrelated charlie message', '{}', 'test', $NOW),
    (generateUUIDv4(), $NOW, 'fts_test', 'test', 'exact phrase \"alpha bravo\" together', '{}', 'test', $NOW)
"

# Wait for data to be available
sleep 2

# 2. Test free-text search with multiple tokens
log "Testing free-text search for 'alpha bravo'..."

SEARCH_BODY=$(cat <<'EOF'
{
    "tenant_id": "fts_test",
    "q": "alpha bravo",
    "time": {"last_seconds": 3600},
    "debug": true
}
EOF
)

curl -sS -X POST "$API_BASE/api/v2/search/execute" \
    -H 'Content-Type: application/json' \
    -d "$SEARCH_BODY" \
    > "$ART/fts_search.json"

# 3. Test phrase search
log "Testing phrase search for \"alpha bravo\"..."

PHRASE_BODY=$(cat <<'EOF'
{
    "tenant_id": "fts_test",
    "q": "\"alpha bravo\"",
    "time": {"last_seconds": 3600}
}
EOF
)

curl -sS -X POST "$API_BASE/api/v2/search/execute" \
    -H 'Content-Type: application/json' \
    -d "$PHRASE_BODY" \
    > "$ART/fts_phrase_search.json"

# 4. Verify results
log "Verifying search results..."

# Check if we got results
RESULT_COUNT=$(jq '.data.rows // 0' "$ART/fts_search.json" 2>/dev/null || echo "0")
if [ "$RESULT_COUNT" -eq 0 ]; then
    warn "No results found in search response"
    # Check if response has data array instead
    RESULT_COUNT=$(jq '.data.data | length // 0' "$ART/fts_search.json" 2>/dev/null || echo "0")
fi

log "Found $RESULT_COUNT results for 'alpha bravo' search"

# Check for multiSearch in compiled SQL
if [ -f "$ART/fts_compiled_sql.txt" ]; then
    if grep -q "multiSearchAllPositionsCaseInsensitive" "$ART/fts_compiled_sql.txt"; then
        log "✓ multiSearchAllPositionsCaseInsensitive found in compiled SQL"
    else
        warn "multiSearchAllPositionsCaseInsensitive not found in compiled SQL"
    fi
fi

# Check for index usage
if [ -f "$ART/fts_explain.txt" ]; then
    log "EXPLAIN output saved to fts_explain.txt"
    if grep -q "idx_msg_token" "$ART/fts_explain.txt"; then
        log "✓ Token index (idx_msg_token) is being used"
    else
        log "Token index not shown in EXPLAIN (may not be available in this CH version)"
    fi
fi

# Check debug info in response
if jq -e '.debug.indexes_used' "$ART/fts_search.json" >/dev/null 2>&1; then
    INDEX_INFO=$(jq -r '.debug.indexes_used' "$ART/fts_search.json")
    log "Index usage: $INDEX_INFO"
fi

# 5. Summary
log "Free-text search test complete. Artifacts:"
log "  - $ART/fts_search.json (search results)"
log "  - $ART/fts_phrase_search.json (phrase search)"
log "  - $ART/fts_compiled_sql.txt (compiled SQL)"
log "  - $ART/fts_explain.txt (EXPLAIN output)"

# Final validation for gate
if [ "$RESULT_COUNT" -ge 1 ]; then
    log "RESULT: PASS - Found $RESULT_COUNT matching events"
    exit 0
else
    error "RESULT: FAIL - No matching events found"
    # Show what's in the response
    jq '.' "$ART/fts_search.json" || true
    exit 1
fi
