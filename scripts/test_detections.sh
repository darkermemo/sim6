#!/usr/bin/env bash
set -euo pipefail

# Test script for world-class SIEM detection endpoints
# Validates compilation, execution, and basic functionality

echo "🔍 Testing World-Class SIEM Detection Endpoints"
echo "================================================"

BASE_URL="http://127.0.0.1:9999/api/v2/detections"

# Test 1: Brute Force Authentication Detection
echo
echo "Test 1: Brute Force Authentication (Sequence)"
echo "----------------------------------------------"

curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sequence",
    "tenant_id": "default",
    "time": {"last_seconds": 1800},
    "by": ["user", "src_ip"],
    "window_sec": 180,
    "strict": "strict_once",
    "stages": [
      {"cond": {"sql": "event_type='\''auth'\'' AND outcome='\''fail'\''"}},
      {"cond": {"sql": "event_type='\''auth'\'' AND outcome='\''success'\''"}}
    ],
    "emit": {"limit": 10}
  }' | jq -r '.sql' || echo "❌ Compile failed"

echo
echo "Test 2: Password Reset Without MFA (Absence)"
echo "--------------------------------------------"

curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sequence_absence", 
    "tenant_id": "default",
    "time": {"last_seconds": 3600},
    "by": ["user"],
    "window_sec": 600,
    "a": {"sql": "event_type='\''idp'\'' AND action='\''password_reset'\''"},
    "b": {"sql": "event_type='\''idp'\'' AND action='\''mfa_challenge'\''"}
  }' | jq -r '.sql' || echo "❌ Compile failed"

echo
echo "Test 3: Rolling Threshold Detection"
echo "-----------------------------------"

curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "rolling_threshold",
    "tenant_id": "default", 
    "time": {"last_seconds": 7200},
    "by": ["user", "src_ip"],
    "window_sec": 300,
    "expr": "rolling > 100"
  }' | jq -r '.sql' || echo "❌ Compile failed"

echo
echo "Test 4: Authentication Ratio Detection"
echo "-------------------------------------"

curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ratio",
    "tenant_id": "default",
    "time": {"last_seconds": 7200},
    "by": ["src_ip"], 
    "bucket_sec": 600,
    "numerator": {"sql": "event_type='\''auth'\'' AND outcome='\''fail'\''"},
    "denominator": {"sql": "event_type='\''auth'\'' AND outcome='\''success'\''"},
    "ratio_gt": 20
  }' | jq -r '.sql' || echo "❌ Compile failed"

echo
echo "Test 5: C2 Beaconing Detection"
echo "------------------------------"

curl -s -X POST "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "beaconing",
    "tenant_id": "default",
    "time": {"last_seconds": 86400},
    "by": [],
    "partition": ["src_ip", "dest_ip"],
    "min_events": 20,
    "rsd_lt": 0.2,
    "where": {"sql": "bytes_out>0 AND event_type='\''net'\''"}
  }' | jq -r '.sql' || echo "❌ Compile failed"

echo
echo "Test 6: Execution Test (Simple Sequence)"
echo "---------------------------------------"

RESULT=$(curl -s -X POST "${BASE_URL}/test" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sequence",
    "tenant_id": "default",
    "time": {"last_seconds": 3600},
    "by": ["user"],
    "window_sec": 300,
    "stages": [
      {"cond": {"sql": "event_type='\''auth'\''"}}
    ],
    "emit": {"limit": 5}
  }')

echo "$RESULT" | jq -r '.ok // false'
echo "Rows found: $(echo "$RESULT" | jq -r '.rows_count // 0')"
echo "Sample: $(echo "$RESULT" | jq -r '.sample[0] // "none"')"

echo
echo "Test 7: Health Check"
echo "-------------------"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/compile" \
  -H "Content-Type: application/json" \
  -d '{"type": "invalid"}')

echo "Invalid rule HTTP status: $HTTP_STATUS"

echo
echo "🎯 Detection Testing Complete"
echo "============================="
