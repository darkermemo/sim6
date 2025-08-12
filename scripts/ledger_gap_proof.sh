#!/usr/bin/env bash
# ledger_gap_proof.sh - End-to-end accounting with zero gap tolerance
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART/ledger"

API_BASE="http://127.0.0.1:9999"
CH_CLIENT="clickhouse client"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[ledger]${NC} $1"; }
warn() { echo -e "${YELLOW}[ledger]${NC} $1"; }
error() { echo -e "${RED}[ledger]${NC} $1"; }

# Test configuration
TENANT_ID=1
SOURCE_ID="ledger-test-$(date +%s)"
TOTAL_EVENTS=100
CUTOFF_POINT=50

# Clear any previous test data
log "Clearing previous ledger test data..."
$CH_CLIENT -q "DELETE FROM dev.agent_ingest_ledger WHERE source_id = '$SOURCE_ID'" 2>/dev/null || true
$CH_CLIENT -q "DELETE FROM dev.events WHERE source_id = '$SOURCE_ID'" 2>/dev/null || true

# Phase 1: Send sequences 1-50
log "Phase 1: Sending sequences 1-$CUTOFF_POINT..."
for seq in $(seq 1 $CUTOFF_POINT); do
    PAYLOAD=$(cat <<EOF
{
  "tenant_id": $TENANT_ID,
  "source_id": "$SOURCE_ID",
  "source_seq": $seq,
  "source_type": "ledger_test",
  "message": "Ledger test event sequence $seq",
  "event_timestamp": $(date +%s)
}
EOF
)
    
    HTTP_CODE=$(curl -sS -w "%{http_code}" -o /dev/null \
        -X POST "$API_BASE/api/v2/ingest/ndjson" \
        -H 'Content-Type: application/x-ndjson' \
        -d "$PAYLOAD")
    
    if [ "$HTTP_CODE" != "200" ]; then
        error "Failed to send seq $seq: HTTP $HTTP_CODE"
        exit 1
    fi
    
    # Update ledger
    $CH_CLIENT -q "INSERT INTO dev.agent_ingest_ledger (tenant_id, source_id, seq, status) VALUES ($TENANT_ID, '$SOURCE_ID', $seq, 1)"
done

log "✓ Phase 1 complete: sent sequences 1-$CUTOFF_POINT"

# Simulate WAN outage
log "Simulating WAN outage..."
if command -v iptables >/dev/null 2>&1; then
    sudo iptables -I OUTPUT -p tcp --dport 9999 -j DROP 2>/dev/null || warn "Cannot block traffic (need sudo)"
    BLOCKED=true
else
    warn "Cannot simulate WAN outage on this system"
    BLOCKED=false
fi

# Phase 2: Attempt to send sequences 51-100 (should fail if blocked)
log "Phase 2: Attempting sequences $((CUTOFF_POINT+1))-$TOTAL_EVENTS during outage..."
FAILED_COUNT=0
for seq in $(seq $((CUTOFF_POINT+1)) $TOTAL_EVENTS); do
    PAYLOAD=$(cat <<EOF
{
  "tenant_id": $TENANT_ID,
  "source_id": "$SOURCE_ID",
  "source_seq": $seq,
  "source_type": "ledger_test",
  "message": "Ledger test event sequence $seq",
  "event_timestamp": $(date +%s)
}
EOF
)
    
    if ! curl -sS --max-time 2 -X POST "$API_BASE/api/v2/ingest/ndjson" \
        -H 'Content-Type: application/x-ndjson' \
        -d "$PAYLOAD" >/dev/null 2>&1; then
        ((FAILED_COUNT++))
    else
        # If it succeeded, still record in ledger
        $CH_CLIENT -q "INSERT INTO dev.agent_ingest_ledger (tenant_id, source_id, seq, status) VALUES ($TENANT_ID, '$SOURCE_ID', $seq, 1)"
    fi
done

log "Failed to send $FAILED_COUNT events during outage (expected if WAN blocked)"

# Restore connectivity
if [ "$BLOCKED" = "true" ]; then
    log "Restoring connectivity..."
    sudo iptables -D OUTPUT -p tcp --dport 9999 -j DROP 2>/dev/null || true
fi

# Phase 3: Resend missing sequences
log "Phase 3: Resending any missing sequences..."
if [ "$FAILED_COUNT" -gt 0 ]; then
    for seq in $(seq $((CUTOFF_POINT+1)) $TOTAL_EVENTS); do
        # Check if this sequence exists
        EXISTS=$($CH_CLIENT -q "SELECT count() FROM dev.events WHERE source_id = '$SOURCE_ID' AND source_seq = $seq FORMAT TabSeparated" 2>/dev/null || echo "0")
        
        if [ "$EXISTS" -eq 0 ]; then
            PAYLOAD=$(cat <<EOF
{
  "tenant_id": $TENANT_ID,
  "source_id": "$SOURCE_ID",
  "source_seq": $seq,
  "source_type": "ledger_test",
  "message": "Ledger test event sequence $seq (retry)",
  "event_timestamp": $(date +%s)
}
EOF
)
            
            HTTP_CODE=$(curl -sS -w "%{http_code}" -o /dev/null \
                -X POST "$API_BASE/api/v2/ingest/ndjson" \
                -H 'Content-Type: application/x-ndjson' \
                -d "$PAYLOAD")
            
            if [ "$HTTP_CODE" = "200" ]; then
                $CH_CLIENT -q "INSERT INTO dev.agent_ingest_ledger (tenant_id, source_id, seq, status) VALUES ($TENANT_ID, '$SOURCE_ID', $seq, 1)"
            fi
        fi
    done
fi

# Wait for data to settle
log "Waiting for data to settle..."
sleep 2

# Verification Phase
log "Verifying ledger integrity..."

# 1. Check for gaps
GAP_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.ledger_missing 
WHERE tenant_id = $TENANT_ID 
  AND source_id = '$SOURCE_ID'
FORMAT TabSeparated
" 2>/dev/null || echo "999")

# 2. Get counts from ledger
LEDGER_STATS=$($CH_CLIENT -q "
SELECT 
  max_seq,
  total_count,
  accepted_count,
  quarantined_count,
  dlq_count
FROM dev.ledger_stats_mv
WHERE tenant_id = $TENANT_ID 
  AND source_id = '$SOURCE_ID'
FORMAT TabSeparatedWithNames
" 2>/dev/null || echo "0	0	0	0	0")

echo "$LEDGER_STATS" > "$ART/ledger/ledger_stats.tsv"

# 3. Get actual event count
EVENT_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.events 
WHERE source_id = '$SOURCE_ID'
FORMAT TabSeparated
" 2>/dev/null || echo "0")

# 4. Get detailed gap analysis
$CH_CLIENT -q "
SELECT 
  gap_start,
  gap_end,
  gap_size
FROM dev.ledger_missing
WHERE tenant_id = $TENANT_ID 
  AND source_id = '$SOURCE_ID'
ORDER BY gap_start
FORMAT TabSeparatedWithNames
" > "$ART/ledger/gap_analysis.tsv" 2>/dev/null || true

# 5. Get sequence coverage
$CH_CLIENT -q "
WITH all_seqs AS (
  SELECT number + 1 as seq
  FROM numbers($TOTAL_EVENTS)
),
found_seqs AS (
  SELECT DISTINCT source_seq as seq
  FROM dev.events
  WHERE source_id = '$SOURCE_ID'
)
SELECT 
  countIf(found_seqs.seq IS NOT NULL) as sequences_found,
  countIf(found_seqs.seq IS NULL) as sequences_missing,
  groupArray(all_seqs.seq) as missing_sequences
FROM all_seqs
LEFT JOIN found_seqs ON all_seqs.seq = found_seqs.seq
WHERE found_seqs.seq IS NULL
FORMAT JSONEachRow
" > "$ART/ledger/sequence_coverage.json" 2>/dev/null || echo "{}" > "$ART/ledger/sequence_coverage.json"

# Generate report
cat > "$ART/ledger/ledger_report.txt" <<EOF
Ledger Gap Analysis Report
==========================
Test Parameters:
- Tenant ID: $TENANT_ID
- Source ID: $SOURCE_ID
- Total sequences: $TOTAL_EVENTS
- WAN cut after: $CUTOFF_POINT

Results:
- Gap count: $GAP_COUNT
- Events in database: $EVENT_COUNT
- Expected events: $TOTAL_EVENTS
- Data loss: $((TOTAL_EVENTS - EVENT_COUNT))

Ledger Statistics:
$(cat "$ART/ledger/ledger_stats.tsv")

Gap Details:
$(cat "$ART/ledger/gap_analysis.tsv")

Verdict: $(if [ "$GAP_COUNT" -eq 0 ] && [ "$EVENT_COUNT" -eq $TOTAL_EVENTS ]; then echo "PASS - Zero gaps, all events accounted for"; else echo "FAIL - Gaps detected or events missing"; fi)
EOF

log "Report generated: $ART/ledger/ledger_report.txt"

# Final verdict
if [ "$GAP_COUNT" -eq 0 ] && [ "$EVENT_COUNT" -eq $TOTAL_EVENTS ]; then
    log "✓ PASS: Zero gaps detected, all $TOTAL_EVENTS events accounted for"
    exit 0
else
    error "FAIL: Detected $GAP_COUNT gaps, only $EVENT_COUNT of $TOTAL_EVENTS events found"
    cat "$ART/ledger/ledger_report.txt"
    exit 1
fi
