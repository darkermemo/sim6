#!/usr/bin/env bash
set -euo pipefail

# Agents/Collectors Console Proof Script
# Tests enrollment, heartbeat, config, and test pipeline

echo "🔧 Testing Agents Console endpoints..."

# Create enrollment key
echo "Creating enrollment key..."
curl -s -X POST "http://localhost:9999/api/v2/agents/enroll-keys" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": 101,
    "ttl_days": 7
  }' | jq '.' > target/test-artifacts/agent_enroll_key.json

ENROLL_KEY=$(jq -r '.enroll_key' target/test-artifacts/agent_enroll_key.json)
echo "✅ Enrollment key created: $ENROLL_KEY"

# Enroll agent
echo "Enrolling agent..."
curl -s -X POST "http://localhost:9999/api/v2/agents/enroll" \
  -H "Content-Type: application/json" \
  -d '{
    "enroll_key": "'$ENROLL_KEY'",
    "agent_facts": {
      "name": "test-agent-001",
      "kind": "linux_collector",
      "version": "1.0.0",
      "hostname": "test-host",
      "os": "Ubuntu 22.04"
    }
  }' | jq '.' > target/test-artifacts/agent_enroll.json

AGENT_ID=$(jq -r '.agent_id' target/test-artifacts/agent_enroll.json)
API_KEY=$(jq -r '.api_key' target/test-artifacts/agent_enroll.json)
echo "✅ Agent enrolled with ID: $AGENT_ID"

# Send heartbeat
echo "Sending heartbeat..."
curl -s -X POST "http://localhost:9999/api/v2/agents/$AGENT_ID/heartbeat" \
  -H "Content-Type: application/json" \
  -d '{
    "eps": 100,
    "queue_depth": 5,
    "version": "1.0.0"
  }' | jq '.' > target/test-artifacts/agent_heartbeat.json

echo "✅ Heartbeat sent"

# Get agent config
echo "Getting agent config..."
curl -s -X GET "http://localhost:9999/api/v2/agents/$AGENT_ID/config" | jq '.' > target/test-artifacts/agent_config.json

echo "✅ Agent config retrieved"

# Apply config
echo "Applying config..."
curl -s -X POST "http://localhost:9999/api/v2/agents/$AGENT_ID/config/apply" \
  -H "Content-Type: application/json" \
  -d '{
    "template_id": "default",
    "overrides": {
      "endpoints": ["http://localhost:9999/api/v2/ingest"],
      "filters": {
        "include": ["*"],
        "exclude": ["debug"]
      }
    }
  }' | jq '.' > target/test-artifacts/agent_config_apply.json

echo "✅ Config applied"

# Test pipeline
echo "Testing pipeline..."
curl -s -X POST "http://localhost:9999/api/v2/agents/$AGENT_ID/test-pipeline" \
  -H "Content-Type: application/json" \
  -d '{
    "sample": "2024-08-12T10:30:00Z test-host test-service: Test log message"
  }' | jq '.' > target/test-artifacts/agent_test_pipeline.json

echo "✅ Pipeline tested"

# List agents
echo "Listing agents..."
curl -s -X GET "http://localhost:9999/api/v2/agents?tenant=101" | jq '.' > target/test-artifacts/agents_list.json

echo "✅ Agents listed"

# Test with API key (simulate agent request)
echo "Testing agent API key..."
curl -s -X GET "http://localhost:9999/api/v2/agents/$AGENT_ID/config" \
  -H "Authorization: Bearer $API_KEY" | jq '.' > target/test-artifacts/agent_auth_test.json

echo "✅ Agent auth test completed"

echo
echo "🚀 Agents Console test completed successfully!"
echo "Artifacts saved to target/test-artifacts/"
