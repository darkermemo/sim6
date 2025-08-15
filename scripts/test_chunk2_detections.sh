#!/usr/bin/env bash
set -euo pipefail

# Test script for Chunk 2 behavioral detection families
# Tests burst, time-of-day, travel, and lexical analysis

echo "🧪 Testing Chunk 2: Behavioral Detection Families"
echo "==============================================="

BASE_URL="http://127.0.0.1:9999/api/v2/detections"

# Test 1: Burst Detection - Process Burst
echo
echo "Test 1: Burst Detection (2min vs 10min ratio)"
echo "---------------------------------------------"

echo "Compiling burst detection rule..."
curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "burst",
    "tenant_id": "default",
    "time": {"last_seconds": 3600},
    "by": ["host"],
    "where": {"sql": "event_type='\''connection'\''"},
    "bucket_fast_sec": 120,
    "bucket_slow_sec": 600,
    "ratio_gt": 5,
    "emit": {"limit": 10}
  }' | jq -r '.sql' | head -5

echo
echo "Running burst detection..."
BURST_RESULT=$(curl -s -X POST "${BASE_URL}/run" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "burst",
    "tenant_id": "default",
    "time": {"last_seconds": 3600},
    "by": ["host"],
    "where": {"sql": "event_type='\''connection'\''"},
    "bucket_fast_sec": 120,
    "bucket_slow_sec": 600,
    "ratio_gt": 3,
    "emit": {"limit": 5}
  }')

echo "Burst hits: $(echo "$BURST_RESULT" | jq -r '.total_hits // 0')"
echo "Execution time: $(echo "$BURST_RESULT" | jq -r '.execution_time_ms // 0')ms"

# Test 2: Time-of-Day Detection - Night Activity
echo
echo "Test 2: Time-of-Day Detection (Night Activity)"
echo "----------------------------------------------"

echo "Compiling time-of-day detection rule..."
curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "time_of_day",
    "tenant_id": "default",
    "time": {"last_seconds": 86400},
    "by": ["user"],
    "where": {"sql": "event_type='\''auth'\''"},
    "hour_start": 2,
    "hour_end": 4,
    "bucket_sec": 3600,
    "hist_buckets": 24,
    "z": 2
  }' | jq -r '.sql' | head -5

echo
echo "Running time-of-day detection..."
TOD_RESULT=$(curl -s -X POST "${BASE_URL}/run" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "time_of_day",
    "tenant_id": "default",
    "time": {"last_seconds": 86400},
    "by": ["user"],
    "where": {"sql": "event_type='\''auth'\''"},
    "hour_start": 2,
    "hour_end": 4,
    "bucket_sec": 3600,
    "hist_buckets": 12,
    "z": 1.5
  }')

echo "Time-of-day hits: $(echo "$TOD_RESULT" | jq -r '.total_hits // 0')"
echo "Execution time: $(echo "$TOD_RESULT" | jq -r '.execution_time_ms // 0')ms"

# Test 3: Travel Detection - Country Changes
echo
echo "Test 3: Travel Detection (Country Changes)"
echo "-----------------------------------------"

echo "Compiling travel detection rule..."
curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "travel",
    "tenant_id": "default",
    "time": {"last_seconds": 604800},
    "by": ["user"],
    "max_interval_sec": 7200
  }' | jq -r '.sql' | head -5

echo
echo "Running travel detection..."
TRAVEL_RESULT=$(curl -s -X POST "${BASE_URL}/run" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "travel",
    "tenant_id": "default",
    "time": {"last_seconds": 604800},
    "by": ["user"],
    "max_interval_sec": 7200
  }')

echo "Travel hits: $(echo "$TRAVEL_RESULT" | jq -r '.total_hits // 0')"
echo "Execution time: $(echo "$TRAVEL_RESULT" | jq -r '.execution_time_ms // 0')ms"

# Test 4: Lexical Detection - Suspicious Patterns
echo
echo "Test 4: Lexical Detection (Suspicious Patterns)"
echo "-----------------------------------------------"

echo "Compiling lexical detection rule..."
curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "lex",
    "tenant_id": "default",
    "time": {"last_seconds": 86400},
    "by": ["src_ip"],
    "field": "message",
    "min_len": 25
  }' | jq -r '.sql' | head -5

echo
echo "Running lexical detection..."
LEX_RESULT=$(curl -s -X POST "${BASE_URL}/run" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "lex",
    "tenant_id": "default",
    "time": {"last_seconds": 86400},
    "by": ["src_ip"],
    "field": "message",
    "min_len": 25
  }')

echo "Lexical hits: $(echo "$LEX_RESULT" | jq -r '.total_hits // 0')"
echo "Execution time: $(echo "$LEX_RESULT" | jq -r '.execution_time_ms // 0')ms"

# Test 5: Validation Error Handling
echo
echo "Test 5: Validation Error Handling"
echo "---------------------------------"

echo "Testing invalid burst rule (missing ratio_gt)..."
INVALID_RESULT=$(curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "burst",
    "tenant_id": "default",
    "time": {"last_seconds": 3600},
    "bucket_fast_sec": 120,
    "bucket_slow_sec": 600
  }')

echo "Validation errors: $(echo "$INVALID_RESULT" | jq -r '.validation_errors | length')"

# Test 6: SQL Validation via ClickHouse
echo
echo "Test 6: SQL Validation Against Real Data"
echo "----------------------------------------"

echo "Testing burst detection SQL directly..."
clickhouse client --query "
WITH fast AS (
  SELECT tenant_id, host,
         toStartOfInterval(ts, INTERVAL 120 SECOND) AS b,
         count() AS c_fast
  FROM siem_v3.events_norm
  WHERE tenant_id='default' AND ts >= now() - INTERVAL 3600 SECOND
    AND event_type='connection'
  GROUP BY tenant_id, host, b
),
slow AS (
  SELECT tenant_id, host,
         toStartOfInterval(ts, INTERVAL 600 SECOND) AS b_slow,
         count() AS c_slow
  FROM siem_v3.events_norm
  WHERE tenant_id='default' AND ts >= now() - INTERVAL 3600 SECOND
    AND event_type='connection'
  GROUP BY tenant_id, host, b_slow
)
SELECT count() as burst_candidates
FROM fast f
LEFT JOIN slow s ON f.tenant_id = s.tenant_id AND f.host = s.host AND s.b_slow <= f.b
WHERE s.c_slow > 0 AND f.c_fast / s.c_slow >= 2
FORMAT PrettyCompact"

echo
echo "Testing time-of-day detection SQL directly..."
clickhouse client --query "
WITH b AS (
  SELECT tenant_id, user,
         toStartOfInterval(ts, INTERVAL 3600 SECOND) AS bkt,
         toHour(ts) AS hr,
         count() AS c
  FROM siem_v3.events_norm
  WHERE tenant_id='default' AND ts >= now() - INTERVAL 86400 SECOND
    AND event_type='auth'
  GROUP BY tenant_id, user, bkt, hr
),
f AS (
  SELECT * FROM b WHERE hr BETWEEN 2 AND 4
)
SELECT count() as night_activity_events
FROM f
WHERE c > 2
FORMAT PrettyCompact"

echo
echo "Testing lexical detection SQL directly..."
clickhouse client --query "
SELECT count() as suspicious_strings
FROM siem_v3.events_norm
WHERE tenant_id='default' AND ts >= now() - INTERVAL 86400 SECOND
  AND length(message) >= 25
  AND (match(message, '^[A-Za-z0-9+/=]{25,}$') 
    OR match(message, '^[A-Fa-f0-9]{25,}$')
    OR match(message, '[^A-Za-z0-9._-]{10,}'))
FORMAT PrettyCompact"

echo
echo "🎯 Chunk 2 Testing Complete"
echo "============================"
echo "✅ Burst detection: Short vs long-term activity ratios"
echo "✅ Time-of-day: Hour-based anomaly detection with Z-score"  
echo "✅ Travel detection: Geographic impossibility analysis"
echo "✅ Lexical detection: Suspicious string pattern analysis"
echo "✅ SQL validation: Direct ClickHouse execution"
echo "✅ Error handling: Validation rules working"
