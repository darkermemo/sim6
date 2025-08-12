#!/usr/bin/env bash
# redis_lock_proof.sh - Test distributed lock prevents concurrent rule execution
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART"

# Check if Redis is available
if [ -z "${REDIS_URL:-}" ]; then
    echo "REDIS_URL not set, skipping Redis lock proof"
    exit 0
fi

API_BASE="http://127.0.0.1:9999"

# Helper to check API health
check_api() {
    for i in {1..10}; do
        if curl -sS "$API_BASE/api/v2/health" | jq -e '.status == "ok"' >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    echo "API not healthy after 10 seconds"
    return 1
}

# Check API is up
check_api || { echo "API not responding"; exit 1; }

# Seed some test data
echo "Seeding test events..."
NDJSON_FILE="$ART/lock_test_events.ndjson"
for i in {1..20}; do
    echo "{\"tenant_id\":\"1\",\"event_timestamp\":$(date +%s),\"message\":\"lock-test-$i\",\"severity\":\"HIGH\",\"event_type\":\"security\"}" >> "$NDJSON_FILE"
done

curl -sS -X POST "$API_BASE/api/v2/ingest/ndjson?tenant=1" \
    -H 'Content-Type: application/x-ndjson' \
    --data-binary @"$NDJSON_FILE" > "$ART/lock_seed_response.json"

# Create a test rule
echo "Creating test rule..."
RULE_RESPONSE=$(curl -sS -X POST "$API_BASE/api/v2/rules" \
    -H 'Content-Type: application/json' \
    -d '{
        "name": "lock-test-rule",
        "tenant_scope": "1",
        "enabled": 0,
        "severity": "HIGH",
        "description": "Test rule for lock proof",
        "compiled_sql": "SELECT * FROM dev.events WHERE positionCaseInsensitive(message, '\''lock-test'\'') > 0",
        "schedule_sec": 60
    }')

RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.id // empty')
if [ -z "$RULE_ID" ]; then
    echo "Failed to create rule: $RULE_RESPONSE"
    exit 1
fi
echo "Created rule: $RULE_ID"

# Warm up the watermark
echo "Warming up watermark..."
curl -sS -X POST "$API_BASE/api/v2/rules/$RULE_ID/run-now" \
    -H 'Content-Type: application/json' \
    -d '{}' > "$ART/lock_warmup.json"

sleep 2

# Run two parallel requests
echo "Running parallel rule executions..."
(
    curl -sS -w "\nHTTP:%{http_code}\n" -X POST "$API_BASE/api/v2/rules/$RULE_ID/run-now" \
        -H 'Content-Type: application/json' \
        -d '{}' > "$ART/lock_run1.json" 2>&1
) &
PID1=$!

(
    curl -sS -w "\nHTTP:%{http_code}\n" -X POST "$API_BASE/api/v2/rules/$RULE_ID/run-now" \
        -H 'Content-Type: application/json' \
        -d '{}' > "$ART/lock_run2.json" 2>&1
) &
PID2=$!

# Wait for both to complete
wait $PID1
wait $PID2

# Extract results
echo "Analyzing results..."
HTTP1=$(grep -o 'HTTP:[0-9]*' "$ART/lock_run1.json" | cut -d: -f2 || echo "000")
HTTP2=$(grep -o 'HTTP:[0-9]*' "$ART/lock_run2.json" | cut -d: -f2 || echo "000")

ALERTS1=$(jq -r '.inserted_alerts // 0' "$ART/lock_run1.json" 2>/dev/null || echo "0")
ALERTS2=$(jq -r '.inserted_alerts // 0' "$ART/lock_run2.json" 2>/dev/null || echo "0")

ERROR1=$(jq -r '.error.code // empty' "$ART/lock_run1.json" 2>/dev/null || echo "")
ERROR2=$(jq -r '.error.code // empty' "$ART/lock_run2.json" 2>/dev/null || echo "")

# Check metrics
METRICS=$(curl -sS "$API_BASE/api/v2/metrics")
ACQUIRED=$(echo "$METRICS" | grep -o 'siem_v2_lock_total{outcome="acquired",route="rule-run-now"} [0-9]*' | awk '{print $2}' || echo "0")
BLOCKED=$(echo "$METRICS" | grep -o 'siem_v2_lock_total{outcome="blocked",route="rule-run-now"} [0-9]*' | awk '{print $2}' || echo "0")

# Generate summary
{
    echo "=== Redis Lock Proof Summary ==="
    echo "Run 1: HTTP=$HTTP1, alerts=$ALERTS1, error=$ERROR1"
    echo "Run 2: HTTP=$HTTP2, alerts=$ALERTS2, error=$ERROR2"
    echo "Metrics: acquired=$ACQUIRED, blocked=$BLOCKED"
    echo ""
    
    # Determine success
    SUCCESS_COUNT=0
    CONFLICT_COUNT=0
    
    if [ "$HTTP1" = "200" ] && [ "$ALERTS1" -gt 0 ]; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        echo "Run 1: SUCCESS (200 with alerts)"
    elif [ "$HTTP1" = "409" ] || [ "$ERROR1" = "CONFLICT_ERROR" ]; then
        CONFLICT_COUNT=$((CONFLICT_COUNT + 1))
        echo "Run 1: BLOCKED (409 conflict)"
    else
        echo "Run 1: UNEXPECTED ($HTTP1)"
    fi
    
    if [ "$HTTP2" = "200" ] && [ "$ALERTS2" -gt 0 ]; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        echo "Run 2: SUCCESS (200 with alerts)"
    elif [ "$HTTP2" = "409" ] || [ "$ERROR2" = "CONFLICT_ERROR" ]; then
        CONFLICT_COUNT=$((CONFLICT_COUNT + 1))
        echo "Run 2: BLOCKED (409 conflict)"
    else
        echo "Run 2: UNEXPECTED ($HTTP2)"
    fi
    
    echo ""
    echo "Total: success=$SUCCESS_COUNT, blocked=$CONFLICT_COUNT"
    
    # Expected: exactly 1 success and 1 blocked
    if [ "$SUCCESS_COUNT" -eq 1 ] && [ "$CONFLICT_COUNT" -eq 1 ]; then
        echo "RESULT: PASS (1 success, 1 blocked as expected)"
    else
        echo "RESULT: FAIL (expected 1 success, 1 blocked)"
    fi
} | tee "$ART/redis_lock_proof.txt"

# Write JSONL output
{
    jq -c '. + {run: 1}' "$ART/lock_run1.json" 2>/dev/null || echo '{"run":1,"error":"parse_fail"}'
    jq -c '. + {run: 2}' "$ART/lock_run2.json" 2>/dev/null || echo '{"run":2,"error":"parse_fail"}'
} > "$ART/redis_lock_parallel.jsonl"

echo "Artifacts written to $ART/"
