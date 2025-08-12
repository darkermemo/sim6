#!/usr/bin/env bash
set -euo pipefail
ART="$(cd "$(dirname "$0")/.." && pwd)/target/test-artifacts"
mkdir -p "$ART"

note(){ echo "[wm-proof] $*"; }

# 0) Seed synthetic events spanning ~10 minutes
note "Seeding events"
clickhouse client -q "
INSERT INTO dev.events (tenant_id, event_timestamp, message, event_id, source_ip, event_type, severity)
SELECT 
    '1' as tenant_id,
    now64(3) - INTERVAL 9 MINUTE + INTERVAL (number * 90) SECOND as event_timestamp,
    concat('testwm-', toString(number)) as message,
    generateUUIDv4() as event_id,
    concat('10.0.0.', toString(number % 10)) as source_ip,
    'security' as event_type,
    'HIGH' as severity
FROM numbers(6)
"

# 1) Create a minimal rule (disabled) – adjust payload to your API contract
note "Creating rule"
cat > "$ART/wm_rule_create_payload.json" << 'EOF'
{
  "name": "wm_test",
  "tenant_scope": "1",
  "enabled": 0,
  "severity": "HIGH",
  "description": "Watermark test rule",
  "compiled_sql": "SELECT * FROM dev.events WHERE positionCaseInsensitive(message, 'testwm') > 0",
  "schedule_sec": 60
}
EOF

curl -sS -X POST http://127.0.0.1:9999/api/v2/rules \
  -H 'Content-Type: application/json' \
  --data-binary @"$ART/wm_rule_create_payload.json" \
  | tee "$ART/wm_rule_create.json" >/dev/null
RULE_ID=$(jq -r '.id // .rule_id // empty' "$ART/wm_rule_create.json")

if [[ -z "$RULE_ID" ]]; then
    note "ERROR: Failed to create rule"
    exit 1
fi

note "Created rule ID: $RULE_ID"

# 2) Run-now (first run) – expect >0 alerts
note "Run 1 - First execution (should find events)"
curl -sS -w "%{http_code}" \
  -X POST "http://127.0.0.1:9999/api/v2/rules/${RULE_ID}/run-now" \
  -H 'Content-Type: application/json' \
  -d '{}' -o "$ART/wm_run1.json" \
  && echo " (HTTP $(cat "$ART/wm_run1.json" && echo))"

# Extract alerts count
ALERTS1=$(jq -r '.inserted_alerts // 0' "$ART/wm_run1.json")
note "Run 1 produced $ALERTS1 alerts"

# 3) Run-now (immediate) – expect 0 new alerts due to watermark + anti-join
note "Run 2 - Immediate re-run (should find 0 alerts)"
sleep 1
curl -sS \
  -X POST "http://127.0.0.1:9999/api/v2/rules/${RULE_ID}/run-now" \
  -H 'Content-Type: application/json' \
  -d '{}' -o "$ART/wm_run2.json"

ALERTS2=$(jq -r '.inserted_alerts // 0' "$ART/wm_run2.json")
note "Run 2 produced $ALERTS2 alerts"

# 4) Insert two later events beyond current watermark + lag
note "Seeding late events"
clickhouse client -q "
INSERT INTO dev.events (tenant_id, event_timestamp, message, event_id, source_ip, event_type, severity)
SELECT 
    '1' as tenant_id,
    now64(3) - INTERVAL 2 MINUTE + INTERVAL (number * 10) SECOND as event_timestamp,
    concat('testwm-new-', toString(number)) as message,
    generateUUIDv4() as event_id,
    concat('10.0.0.', toString(20 + number)) as source_ip,
    'security' as event_type,
    'CRITICAL' as severity
FROM numbers(2)
"

# Wait a bit to ensure events are written
sleep 2

# 5) Run-now (third) – expect >0 new alerts
note "Run 3 - After new events (should find new alerts)"
curl -sS \
  -X POST "http://127.0.0.1:9999/api/v2/rules/${RULE_ID}/run-now" \
  -H 'Content-Type: application/json' \
  -d '{}' -o "$ART/wm_run3.json"

ALERTS3=$(jq -r '.inserted_alerts // 0' "$ART/wm_run3.json")
note "Run 3 produced $ALERTS3 alerts"

# 6) Dump state + metrics slice
note "Dump rule_state + metrics"
clickhouse client -q "
SELECT rule_id, tenant_id, 
       toUnixTimestamp64Milli(watermark_ts) as watermark_ms,
       toUnixTimestamp64Milli(last_success_ts) as last_success_ms,
       last_error
FROM dev.rule_state
WHERE rule_id='${RULE_ID}' AND tenant_id='1'
ORDER BY updated_at DESC
LIMIT 1
FORMAT JSONEachRow" > "$ART/wm_state.json" || true

curl -sS http://127.0.0.1:9999/metrics | \
  grep -E 'siem_v2_rules_run_total|siem_v2_rules_lag_seconds|siem_v2_alerts_written_total' | \
  grep -E "rule=\"${RULE_ID}\"" \
  > "$ART/wm_metrics.txt" || true

# 7) Verify results
note "Verification:"
if [[ "$ALERTS1" -gt 0 ]]; then
    echo "  ✓ Run 1 produced alerts ($ALERTS1)"
else
    echo "  ✗ Run 1 produced no alerts"
    exit 1
fi

if [[ "$ALERTS2" -eq 0 ]]; then
    echo "  ✓ Run 2 produced no alerts (watermark working)"
else
    echo "  ✗ Run 2 produced alerts ($ALERTS2) - watermark not working"
    exit 1
fi

if [[ "$ALERTS3" -gt 0 ]]; then
    echo "  ✓ Run 3 produced new alerts ($ALERTS3)"
else
    echo "  ✗ Run 3 produced no alerts"
    exit 1
fi

# Check watermark advancement
if [[ -s "$ART/wm_state.json" ]]; then
    WM_MS=$(jq -r '.watermark_ms // 0' "$ART/wm_state.json")
    if [[ "$WM_MS" -gt 0 ]]; then
        echo "  ✓ Watermark advanced to: $WM_MS"
    else
        echo "  ✗ Watermark not set"
        exit 1
    fi
fi

# Add window counts analysis
note "Analyzing window counts"
clickhouse client -q "
WITH
  (SELECT watermark_ts FROM dev.rule_state WHERE rule_id='${RULE_ID}' AND tenant_id='1' ORDER BY updated_at DESC LIMIT 1) AS wm,
  now64(3) - INTERVAL 120 SECOND AS upper
SELECT
  wm AS watermark_ts,
  upper AS upper_ts,
  countIf(event_timestamp > wm AND event_timestamp <= upper) AS candidates_in_window,
  countIf(event_timestamp > wm AND event_timestamp <= upper AND message ILIKE '%testwm%') AS matches_in_window
FROM dev.events
WHERE tenant_id='1'
FORMAT PrettyCompact" > "$ART/wm_window_counts.tsv"

# Cleanup
note "Cleanup: deleting test rule"
curl -sS -X DELETE "http://127.0.0.1:9999/api/v2/rules/${RULE_ID}" >/dev/null || true

note "PR-04 watermark proof complete"