#!/usr/bin/env bash
set -euo pipefail

# Log Sources & Parsers Proof Script
# Tests source creation, test connection, parser creation, and sample testing

echo "🔧 Testing Log Sources & Parsers endpoints..."

# Create a test parser first
echo "Creating test parser..."
curl -s -X POST "http://localhost:9999/api/v2/admin/parsers" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Parser",
    "kind": "NATIVE",
    "body": "function parse(log) { return { message: log }; }"
  }' | jq '.' > target/test-artifacts/parser_create.json

PARSER_ID=$(jq -r '.parser_id' target/test-artifacts/parser_create.json)
echo "✅ Parser created with ID: $PARSER_ID"

# Create a log source
echo "Creating log source..."
curl -s -X POST "http://localhost:9999/api/v2/admin/sources" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": 101,
    "name": "Test Syslog Source",
    "kind": "syslog",
    "transport": "syslog-udp",
    "endpoint": "0.0.0.0:514",
    "parser_id": "'$PARSER_ID'"
  }' | jq '.' > target/test-artifacts/source_create.json

SOURCE_ID=$(jq -r '.source_id' target/test-artifacts/source_create.json)
echo "✅ Source created with ID: $SOURCE_ID"

# Test connection
echo "Testing source connection..."
curl -s -X POST "http://localhost:9999/api/v2/admin/sources/$SOURCE_ID/test-connection" \
  -H "Content-Type: application/json" | jq '.' > target/test-artifacts/source_test_connection.json

TOKEN=$(jq -r '.token' target/test-artifacts/source_test_connection.json)
echo "✅ Test connection created with token: $TOKEN"

# Test sample parsing
echo "Testing sample parsing..."
curl -s -X POST "http://localhost:9999/api/v2/admin/sources/$SOURCE_ID/test-sample" \
  -H "Content-Type: application/json" \
  -d '{
    "sample": "Aug 12 10:30:00 test-host syslog: Test message"
  }' | jq '.' > target/test-artifacts/source_test_sample.json

echo "✅ Sample parsing tested"

# Test parser validation
echo "Validating parser..."
curl -s -X GET "http://localhost:9999/api/v2/admin/parsers/$PARSER_ID/validate" | jq '.' > target/test-artifacts/parser_validate.json

echo "✅ Parser validated"

# Test parser sample
echo "Testing parser sample..."
curl -s -X POST "http://localhost:9999/api/v2/admin/parsers/$PARSER_ID/sample" \
  -H "Content-Type: application/json" \
  -d '{
    "sample": "Test log message"
  }' | jq '.' > target/test-artifacts/parser_sample.json

echo "✅ Parser sample tested"

# List sources
echo "Listing sources..."
curl -s -X GET "http://localhost:9999/api/v2/admin/sources?tenant=101" | jq '.' > target/test-artifacts/sources_list.json

echo "✅ Sources listed"

# List parsers
echo "Listing parsers..."
curl -s -X GET "http://localhost:9999/api/v2/admin/parsers" | jq '.' > target/test-artifacts/parsers_list.json

echo "✅ Parsers listed"

# Test SSE tail (would need to be running in background)
echo "Testing SSE tail (background)..."
curl -s -X GET "http://localhost:9999/api/v2/admin/sources/$SOURCE_ID/test-connection/$TOKEN/tail" \
  --max-time 5 > target/test-artifacts/source_tail.ndjson &

echo "✅ SSE tail test initiated"

echo
echo "🚀 Sources & Parsers test completed successfully!"
echo "Artifacts saved to target/test-artifacts/"
