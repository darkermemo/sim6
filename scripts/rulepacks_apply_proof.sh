#!/usr/bin/env bash
set -euo pipefail

# Rule Packs Apply Proof
# Demonstrates applying a deployment plan with idempotency

SCRIPT_DIR=$(dirname "$0")
source "$SCRIPT_DIR/api/00_env.sh"

echo "=== Rule Packs Apply Proof ==="

# Get pack and plan IDs
if [ -f .last_pack_id ] && [ -f .last_plan_id ]; then
  PACK_ID=$(cat .last_pack_id)
  PLAN_ID=$(cat .last_plan_id)
  echo "Using pack ID: $PACK_ID"
  echo "Using plan ID: $PLAN_ID"
else
  echo "Error: Missing IDs. Run upload and plan proofs first"
  exit 1
fi

# Generate idempotency key
IDEMPOTENCY_KEY="apply-$(date +%s)-$RANDOM"
echo "Idempotency Key: $IDEMPOTENCY_KEY"

# First apply - should execute
echo ""
echo "First apply (should execute)..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/api/v2/rule-packs/$PACK_ID/apply" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: 101" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "plan_id": "'"$PLAN_ID"'",
    "dry_run": false,
    "actor": "test_script"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✓ First apply successful"
  echo "$BODY" | jq '.' > rp_apply_first.json
  
  # Display summary
  echo "$BODY" | jq -r '
    "Apply Summary:",
    "  Deploy ID: \(.deploy_id)",
    "  Created: \(.totals.create) rules",
    "  Updated: \(.totals.update) rules",
    "  Disabled: \(.totals.disable) rules",
    "  Errors: \(.errors | length)",
    "  Replayed: \(.replayed)"
  '
  
  DEPLOY_ID=$(echo "$BODY" | jq -r '.deploy_id')
else
  echo "✗ First apply failed with status $HTTP_CODE"
  echo "$BODY"
  exit 1
fi

# Second apply with same idempotency key - should replay
echo ""
echo "Second apply with same idempotency key (should replay)..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/api/v2/rule-packs/$PACK_ID/apply" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: 101" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "plan_id": "'"$PLAN_ID"'",
    "dry_run": false,
    "actor": "test_script"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✓ Second apply successful (replay)"
  echo "$BODY" | jq '.' > rp_apply_second.json
  
  # Display summary
  echo "$BODY" | jq -r '
    "Replay Summary:",
    "  Deploy ID: \(.deploy_id)",
    "  Replayed: \(.replayed)",
    "  Same deploy_id: '"$([ "$(echo "$BODY" | jq -r '.deploy_id')" = "$DEPLOY_ID" ] && echo "Yes" || echo "No")"'"
  '
else
  echo "✗ Second apply failed with status $HTTP_CODE"
  echo "$BODY"
fi

# Verify deployment record
echo ""
echo "Verifying deployment record..."

DEPLOY_CHECK=$(curl -s "$BASE_URL/api/v2/rule-packs/deployments/$DEPLOY_ID" \
  -H "x-tenant-id: 101")

if [ $? -eq 0 ]; then
  echo "$DEPLOY_CHECK" | jq -r '
    "Deployment Record:",
    "  Status: \(.status)",
    "  Started: \(.started_at)",
    "  Finished: \(.finished_at)",
    "  Strategy: \(.strategy)",
    "  Actor: \(.actor)"
  '
fi

# Check metrics
echo ""
echo "Checking metrics..."

curl -s "$BASE_URL/metrics" | grep -E "siem_v2_rulepack|siem_v2_rule_changes" | head -10

echo ""
echo "=== Results saved to rp_apply_first.json and rp_apply_second.json ==="
