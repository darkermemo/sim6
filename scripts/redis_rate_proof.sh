#!/usr/bin/env bash
# redis_rate_proof.sh - Test EPS rate limiting with Redis token bucket
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART"

# Check if Redis is available
if [ -z "${REDIS_URL:-}" ]; then
    echo "REDIS_URL not set, skipping Redis rate proof"
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

# Apply migration for EPS limits
echo "Applying EPS limits migration..."
clickhouse client -q "$(cat "$ROOT/database_migrations/V304__eps_limits.sql")" 2>/dev/null || true

# Insert strict rate limit for tenant 1
echo "Setting EPS limit for tenant 1..."
clickhouse client -q "
INSERT INTO dev.tenants_eps (tenant_id, source, limit_eps, burst, enabled)
VALUES (1, 'http', 10, 20, 1)
"

# Verify limit was set
LIMIT_CHECK=$(clickhouse client -q "SELECT limit_eps, burst FROM dev.tenants_eps WHERE tenant_id=1 AND source='http' FORMAT JSON" | jq -r '.data[0] // empty')
echo "EPS limit configured: $LIMIT_CHECK"

# Generate test events
echo "Generating test events..."
BATCH_FILE="$ART/rate_test_batch.ndjson"
rm -f "$BATCH_FILE"

# Create 30 events (exceeds burst of 20)
for i in {1..30}; do
    echo "{\"tenant_id\":\"1\",\"event_timestamp\":$(date +%s),\"message\":\"rate-test-$i\",\"source_type\":\"http\"}" >> "$BATCH_FILE"
done

# Send events in rapid succession
echo "Sending events rapidly to trigger rate limit..."
> "$ART/redis_rate_samples.jsonl"

SUCCESS_COUNT=0
THROTTLE_COUNT=0
RETRY_AFTER_VALUES=()

for i in {1..30}; do
    RESPONSE_FILE="$ART/rate_response_$i.json"
    
    # Send single event
    EVENT="{\"tenant_id\":\"1\",\"event_timestamp\":$(date +%s),\"message\":\"rate-burst-$i\",\"source_type\":\"http\"}"
    
    HTTP_CODE=$(curl -sS -w "%{http_code}" -o "$RESPONSE_FILE" \
        -X POST "$API_BASE/api/v2/ingest/ndjson?tenant=1" \
        -H 'Content-Type: application/x-ndjson' \
        -d "$EVENT" || echo "000")
    
    # Extract Retry-After header if present
    RETRY_AFTER=$(curl -sS -I -X POST "$API_BASE/api/v2/ingest/ndjson?tenant=1" \
        -H 'Content-Type: application/x-ndjson' \
        -d "$EVENT" 2>/dev/null | grep -i "retry-after:" | awk '{print $2}' | tr -d '\r' || echo "")
    
    # Log result
    RESULT=$(jq -c ". + {http_code: $HTTP_CODE, retry_after: \"$RETRY_AFTER\"}" "$RESPONSE_FILE" 2>/dev/null || echo "{\"http_code\": $HTTP_CODE}")
    echo "$RESULT" >> "$ART/redis_rate_samples.jsonl"
    
    if [ "$HTTP_CODE" = "200" ]; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    elif [ "$HTTP_CODE" = "429" ]; then
        THROTTLE_COUNT=$((THROTTLE_COUNT + 1))
        if [ -n "$RETRY_AFTER" ]; then
            RETRY_AFTER_VALUES+=("$RETRY_AFTER")
        fi
    fi
    
    # Small delay to spread requests
    sleep 0.1
done

# Check metrics
echo "Checking metrics..."
METRICS=$(curl -sS "$API_BASE/api/v2/metrics")
ALLOW_METRIC=$(echo "$METRICS" | grep -o 'siem_v2_rate_limit_total{outcome="allow".*tenant="1".*} [0-9]*' | awk '{print $2}' || echo "0")
THROTTLE_METRIC=$(echo "$METRICS" | grep -o 'siem_v2_rate_limit_total{outcome="throttle".*tenant="1".*} [0-9]*' | awk '{print $2}' || echo "0")

# Generate summary
{
    echo "=== Redis Rate Limit Proof Summary ==="
    echo "Sent: 30 events"
    echo "Success (200): $SUCCESS_COUNT"
    echo "Throttled (429): $THROTTLE_COUNT"
    echo "Retry-After values: ${RETRY_AFTER_VALUES[*]:-none}"
    echo ""
    echo "Metrics:"
    echo "  Allow: $ALLOW_METRIC"
    echo "  Throttle: $THROTTLE_METRIC"
    echo ""
    
    # Verify results
    if [ "$THROTTLE_COUNT" -gt 0 ]; then
        echo "RESULT: PASS (Rate limiting is working, $THROTTLE_COUNT requests throttled)"
        
        # Check for HTTP 429
        if grep -q "HTTP:429" "$ART/redis_rate_samples.jsonl"; then
            echo "✓ HTTP 429 responses confirmed"
        fi
        
        # Check for Retry-After
        if [ "${#RETRY_AFTER_VALUES[@]}" -gt 0 ]; then
            echo "✓ Retry-After headers present"
        fi
    else
        echo "RESULT: FAIL (No throttling observed)"
    fi
} | tee "$ART/redis_rate_proof.txt"

# Generate detailed report
echo "" >> "$ART/redis_rate_proof.txt"
echo "=== Detailed Responses ===" >> "$ART/redis_rate_proof.txt"
jq -r '. | "\(.http_code) - \(.error.code // "OK") - retry_after: \(.retry_after // "none")"' "$ART/redis_rate_samples.jsonl" | head -20 >> "$ART/redis_rate_proof.txt"

echo "Artifacts written to $ART/"
