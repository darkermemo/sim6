#!/usr/bin/env bash
set -euo pipefail

# Rule Packs Plan Proof
# Demonstrates safe vs force deployment planning

SCRIPT_DIR=$(dirname "$0")
source "$SCRIPT_DIR/api/00_env.sh"

echo "=== Rule Packs Plan Proof ==="

# Get pack ID from previous upload
if [ -f .last_pack_id ]; then
  PACK_ID=$(cat .last_pack_id)
  echo "Using pack ID: $PACK_ID"
else
  echo "Error: No pack ID found. Run rulepacks_upload_proof.sh first"
  exit 1
fi

# First, create a rule with recent alerts to test safe mode
echo "Creating rule with recent alerts..."

# Create a rule that will conflict
curl -s -X POST "$BASE_URL/api/v2/rules" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: 101" \
  -d '{
    "rule_id": "rule_test_3",
    "name": "Test Rule 3",
    "severity": "MEDIUM",
    "kind": "NATIVE",
    "dsl": "event_type:test",
    "enabled": true
  }' > /dev/null

# Simulate alerts for this rule
echo "INSERT INTO dev.alerts (alert_id, tenant_id, rule_id, created_at, alert_key) 
VALUES 
  ('alert_test_1', 101, 'rule_test_3', now() - INTERVAL 1 DAY, 'test1'),
  ('alert_test_2', 101, 'rule_test_3', now() - INTERVAL 2 DAY, 'test2'),
  ('alert_test_3', 101, 'rule_test_3', now() - INTERVAL 5 DAY, 'test3')" | \
clickhouse client 2>/dev/null || true

# Plan with SAFE strategy
echo ""
echo "Creating deployment plan with SAFE strategy..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/api/v2/rule-packs/$PACK_ID/plan" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: 101" \
  -d '{
    "strategy": "safe",
    "match_by": "rule_id",
    "tag_prefix": "pack:"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✓ Safe plan created"
  echo "$BODY" | jq '.' > rp_plan_safe.json
  
  # Display summary
  echo "$BODY" | jq -r '
    "Safe Plan Summary:",
    "  Plan ID: \(.plan_id)",
    "  Create: \(.totals.create)",
    "  Update: \(.totals.update)",
    "  Disable: \(.totals.disable)",
    "  Skip: \(.totals.skip)",
    "",
    "Warnings:",
    (.entries[] | select(.warnings | length > 0) | "  \(.rule_id): \(.warnings | join(\", \"))")
  '
else
  echo "✗ Safe plan failed with status $HTTP_CODE"
  echo "$BODY"
fi

# Plan with FORCE strategy
echo ""
echo "Creating deployment plan with FORCE strategy..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/api/v2/rule-packs/$PACK_ID/plan" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: 101" \
  -d '{
    "strategy": "force",
    "match_by": "rule_id",
    "tag_prefix": "pack:"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✓ Force plan created"
  echo "$BODY" | jq '.' > rp_plan_force.json
  
  # Display summary
  echo "$BODY" | jq -r '
    "Force Plan Summary:",
    "  Plan ID: \(.plan_id)",
    "  Create: \(.totals.create)",
    "  Update: \(.totals.update)",
    "  Disable: \(.totals.disable) (includes hot rules)",
    "  Skip: \(.totals.skip)",
    "",
    "All entries:",
    (.entries[] | "  \(.action): \(.rule_id) - \(.name)")
  '
  
  # Save plan ID for apply test
  echo "$BODY" | jq -r '.plan_id' > .last_plan_id
else
  echo "✗ Force plan failed with status $HTTP_CODE"
  echo "$BODY"
fi

echo ""
echo "=== Results saved to rp_plan_safe.json and rp_plan_force.json ==="
