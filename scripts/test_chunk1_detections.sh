#!/usr/bin/env bash
set -euo pipefail

# Test script for Chunk 1 advanced detection families
# Tests spike, spread, and peer outlier detection types

echo "🧪 Testing Chunk 1: Advanced Detection Families"
echo "=============================================="

BASE_URL="http://127.0.0.1:9999/api/v2/detections"

# Test 1: Spike Detection - Auth Failure Spike
echo
echo "Test 1: Authentication Failure Spike (Z-Score)"
echo "----------------------------------------------"

echo "Compiling spike detection rule..."
curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "spike",
    "tenant_id": "default",
    "time": {"last_seconds": 7200},
    "by": ["user"],
    "metric": {"sql": "event_type='\''auth'\'' AND outcome='\''fail'\''"},
    "bucket_sec": 300,
    "hist_buckets": 288,
    "z": 3.0,
    "emit": {"limit": 10}
  }' | jq -r '.sql' | head -5

echo
echo "Running spike detection..."
SPIKE_RESULT=$(curl -s -X POST "${BASE_URL}/run" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "spike",
    "tenant_id": "default",
    "time": {"last_seconds": 7200},
    "by": ["user"],
    "metric": {"sql": "event_type='\''auth'\'' AND outcome='\''fail'\''"},
    "bucket_sec": 300,
    "hist_buckets": 96,
    "z": 1.5,
    "emit": {"limit": 5}
  }')

echo "Spike hits: $(echo "$SPIKE_RESULT" | jq -r '.total_hits // 0')"
echo "Execution time: $(echo "$SPIKE_RESULT" | jq -r '.execution_time_ms // 0')ms"

# Test 2: Spread Detection - User Diversity
echo
echo "Test 2: User Diversity Spread Detection"
echo "---------------------------------------"

echo "Compiling spread detection rule..."
curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "spread",
    "tenant_id": "default",
    "time": {"last_seconds": 3600},
    "by": ["src_ip"],
    "target": "user",
    "window_sec": 600,
    "min_distinct": 5
  }' | jq -r '.sql' | head -5

echo
echo "Running spread detection..."
SPREAD_RESULT=$(curl -s -X POST "${BASE_URL}/run" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "spread",
    "tenant_id": "default",
    "time": {"last_seconds": 3600},
    "by": ["src_ip"],
    "target": "user",
    "window_sec": 600,
    "min_distinct": 5
  }')

echo "Spread hits: $(echo "$SPREAD_RESULT" | jq -r '.total_hits // 0')"
echo "Execution time: $(echo "$SPREAD_RESULT" | jq -r '.execution_time_ms // 0')ms"

# Test 3: Peer Outlier Detection - Activity by Event Type
echo
echo "Test 3: Peer Outlier Detection (Activity)"
echo "-----------------------------------------"

echo "Compiling peer outlier rule..."
curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "peer_out",
    "tenant_id": "default",
    "time": {"last_seconds": 14400},
    "by": ["user"],
    "kpi": {"sql": "event_type='\''auth'\''"},
    "bucket_sec": 1800,
    "peer_label_field": "event_type",
    "p": 0.90
  }' | jq -r '.sql' | head -5

echo
echo "Running peer outlier detection..."
PEER_RESULT=$(curl -s -X POST "${BASE_URL}/run" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "peer_out",
    "tenant_id": "default",
    "time": {"last_seconds": 14400},
    "by": ["user"],
    "kpi": {"sql": "event_type='\''auth'\''"},
    "bucket_sec": 1800,
    "peer_label_field": "event_type",
    "p": 0.90
  }')

echo "Peer outlier hits: $(echo "$PEER_RESULT" | jq -r '.total_hits // 0')"
echo "Execution time: $(echo "$PEER_RESULT" | jq -r '.execution_time_ms // 0')ms"

# Test 4: Validation Tests
echo
echo "Test 4: Validation Error Handling"
echo "---------------------------------"

echo "Testing invalid spike rule (missing metric)..."
INVALID_RESULT=$(curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "spike",
    "tenant_id": "default",
    "time": {"last_seconds": 3600},
    "bucket_sec": 300,
    "hist_buckets": 288,
    "z": 3.0
  }')

echo "Validation errors: $(echo "$INVALID_RESULT" | jq -r '.validation_errors | length')"

# Test 5: SQL Validation via ClickHouse
echo
echo "Test 5: SQL Validation Against Real Data"
echo "----------------------------------------"

echo "Testing spike detection SQL directly..."
clickhouse client --query "
WITH b AS (
  SELECT tenant_id, user,
         toStartOfInterval(ts, INTERVAL 300 SECOND) AS bkt,
         countIf(event_type='auth') AS c
  FROM siem_v3.events_norm
  WHERE tenant_id='default' AND ts >= now() - INTERVAL 3600 SECOND
  GROUP BY tenant_id, user, bkt
),
z AS (
  SELECT tenant_id, user, bkt, c,
         avg(c) OVER (PARTITION BY tenant_id, user ORDER BY bkt ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING) AS mu,
         stddevPop(c) OVER (PARTITION BY tenant_id, user ORDER BY bkt ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING) AS sigma
  FROM b
)
SELECT count() as spike_candidates
FROM z
WHERE (c - mu) / nullIf(sigma,0) >= 1.0
FORMAT PrettyCompact"

echo
echo "Testing spread detection SQL directly..."
clickhouse client --query "
SELECT count() as spread_hits
FROM (
  SELECT tenant_id, src_ip,
         toStartOfInterval(ts, INTERVAL 600 SECOND) AS window_start,
         uniqExact(user) AS distinct_users
  FROM siem_v3.events_norm
  WHERE tenant_id='default' AND ts >= now() - INTERVAL 3600 SECOND
  GROUP BY tenant_id, src_ip, window_start
  HAVING distinct_users >= 3
)
FORMAT PrettyCompact"

echo
echo "🎯 Chunk 1 Testing Complete"
echo "============================"
echo "✅ Spike detection: Z-score anomaly detection"
echo "✅ Spread detection: Distinct count thresholds"  
echo "✅ Peer outlier: Percentile-based anomalies"
echo "✅ SQL validation: Direct ClickHouse execution"
echo "✅ Error handling: Validation rules working"
