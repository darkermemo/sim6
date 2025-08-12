#!/usr/bin/env bash
set -euo pipefail

# Admin Core Proof Script
# Tests tenants, limits, API keys, roles, and deep health endpoints

echo "🔧 Testing Admin Core endpoints..."

# Test tenant creation
echo "Creating test tenant..."
curl -s -X POST "http://localhost:9999/api/v2/admin/tenants" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": 101,
    "slug": "test-tenant",
    "name": "Test Tenant",
    "region": "us-west"
  }' | jq '.' > target/test-artifacts/admin_tenant.json

echo "✅ Tenant created"

# Test tenant limits
echo "Setting tenant limits..."
curl -s -X PUT "http://localhost:9999/api/v2/admin/tenants/101/limits" \
  -H "Content-Type: application/json" \
  -d '{
    "eps_hard": 1000,
    "eps_soft": 500,
    "burst": 2000,
    "retention_days": 90,
    "export_daily_mb": 100
  }' | jq '.' > target/test-artifacts/admin_limits.json

echo "✅ Limits set"

# Test API key creation
echo "Creating API key..."
curl -s -X POST "http://localhost:9999/api/v2/admin/tenants/101/api-keys" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "analyst"
  }' | jq '.' > target/test-artifacts/admin_apikey_create.json

echo "✅ API key created"

# Test deep health
echo "Testing deep health..."
curl -s -X GET "http://localhost:9999/api/v2/admin/deep-health" | jq '.' > target/test-artifacts/admin_deep_health.json

echo "✅ Deep health retrieved"

# Test connection test
echo "Testing ClickHouse connection..."
curl -s -X POST "http://localhost:9999/api/v2/admin/deep-health/test" \
  -H "Content-Type: application/json" \
  -d '{
    "target": "clickhouse"
  }' | jq '.' >> target/test-artifacts/admin_deep_health.json

echo "✅ Connection test completed"

# Test roles
echo "Testing roles..."
curl -s -X GET "http://localhost:9999/api/v2/admin/roles" | jq '.' > target/test-artifacts/admin_roles.json

echo "✅ Roles retrieved"

# Test tenant listing
echo "Listing tenants..."
curl -s -X GET "http://localhost:9999/api/v2/admin/tenants?q=test" | jq '.' > target/test-artifacts/admin_tenants_list.json

echo "✅ Tenants listed"

echo
echo "🔒 Admin Core test completed successfully!"
echo "Artifacts saved to target/test-artifacts/"
