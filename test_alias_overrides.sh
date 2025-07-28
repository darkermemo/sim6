#!/bin/bash

# Test script for dynamic per-source alias overrides
# This script tests the new alias override functionality

set -e

API_BASE="http://localhost:8080/api/v1"
ADMIN_TOKEN="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJBZG1pbiIsInRlbmFudF9pZCI6InRlbmFudDEiLCJleHAiOjE3NjcyNzc2MDB9.s8UwXwVBWzAJQs7ZOJXyJhqJpGZO8F2X1vN4mR5tKcE"

echo "=== Testing Dynamic Per-Source Alias Overrides ==="
echo

# Test 1: Get initial alias overrides (should be empty)
echo "1. Getting initial alias overrides..."
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
     "$API_BASE/alias/overrides" | jq .
echo

# Test 2: Add a source-specific alias override
echo "2. Adding source-specific alias override..."
curl -s -X POST \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "source_name": "firewall-01",
       "field_alias": "client_ip",
       "canonical_field": "source.ip"
     }' \
     "$API_BASE/alias/override" | jq .
echo

# Test 3: Add another override for the same source
echo "3. Adding another override for the same source..."
curl -s -X POST \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "source_name": "firewall-01",
       "field_alias": "server_ip",
       "canonical_field": "destination.ip"
     }' \
     "$API_BASE/alias/override" | jq .
echo

# Test 4: Add override for a different source
echo "4. Adding override for a different source..."
curl -s -X POST \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "source_name": "web-server",
       "field_alias": "remote_user",
       "canonical_field": "user.name"
     }' \
     "$API_BASE/alias/override" | jq .
echo

# Test 5: Get all alias overrides
echo "5. Getting all alias overrides..."
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
     "$API_BASE/alias/overrides" | jq .
echo

# Test 6: Reload alias configuration
echo "6. Reloading alias configuration..."
curl -s -X POST \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     "$API_BASE/alias/reload" | jq .
echo

# Test 7: Delete a specific override
echo "7. Deleting a specific override..."
curl -s -X DELETE \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "source_name": "firewall-01",
       "field_alias": "server_ip"
     }' \
     "$API_BASE/alias/override" | jq .
echo

# Test 8: Get final state of alias overrides
echo "8. Getting final state of alias overrides..."
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
     "$API_BASE/alias/overrides" | jq .
echo

echo "=== Alias Override Tests Complete ==="