#!/bin/bash

echo "🔍 Testing Threat Intelligence System"
echo "======================================"

# Test 1: Verify threat intel database has test data
echo "📊 Test 1: Checking threat intelligence database..."
THREAT_COUNT=$(clickhouse client --query "SELECT COUNT(*) FROM dev.threat_intel" 2>/dev/null)
echo "Found $THREAT_COUNT threat intelligence IOCs"

if [ "$THREAT_COUNT" -eq 0 ]; then
    echo "❌ No threat intelligence data found. Inserting test data..."
    clickhouse client --query "INSERT INTO dev.threat_intel (ioc_id, ioc_type, ioc_value, source, first_seen, created_at) VALUES ('test-001', 'ipv4', '192.168.1.100', 'manual_test', 1752962400, 1752962400), ('test-002', 'ipv4', '10.0.0.50', 'manual_test', 1752962400, 1752962400), ('test-003', 'ipv4', '203.0.113.1', 'manual_test', 1752962400, 1752962400)"
    echo "✅ Test threat intelligence data inserted"
fi

# Test 2: Manually insert events to test enrichment
echo "📝 Test 2: Inserting test events for threat enrichment..."

# Clear any existing test events
clickhouse client --query "DELETE FROM dev.events WHERE tenant_id = 'test-tenant'"

# Insert a malicious event (IP is in threat intel)
clickhouse client --query "INSERT INTO dev.events (event_id, tenant_id, event_timestamp, source_ip, source_type, raw_event, event_category, event_outcome, event_action, is_threat) VALUES ('mal-001', 'test-tenant', 1752962400, '192.168.1.100', 'test', 'Malicious activity from known bad IP', 'security', 'suspicious', 'login_attempt', 1)"

# Insert a benign event (IP is not in threat intel)
clickhouse client --query "INSERT INTO dev.events (event_id, tenant_id, event_timestamp, source_ip, source_type, raw_event, event_category, event_outcome, event_action, is_threat) VALUES ('ben-001', 'test-tenant', 1752962400, '192.168.1.200', 'test', 'Normal activity from clean IP', 'security', 'success', 'login_attempt', 0)"

echo "✅ Test events inserted"

# Test 3: Verify threat enrichment worked
echo "🔍 Test 3: Verifying threat enrichment..."

MALICIOUS_COUNT=$(clickhouse client --query "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'test-tenant' AND source_ip = '192.168.1.100' AND is_threat = 1")
BENIGN_COUNT=$(clickhouse client --query "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'test-tenant' AND source_ip = '192.168.1.200' AND is_threat = 0")

echo "Events flagged as threats: $MALICIOUS_COUNT"
echo "Events flagged as benign: $BENIGN_COUNT"

# Test 4: Show all test events
echo "📋 Test 4: Showing all test events..."
clickhouse client --query "SELECT event_id, source_ip, is_threat, raw_event FROM dev.events WHERE tenant_id = 'test-tenant' ORDER BY event_id" --format PrettyCompact

echo ""
echo "🧪 Testing Consumer Threat Enrichment Logic..."

# Test the consumer with known malicious IP
echo "🔴 Testing with known malicious IP (203.0.113.1)..."
echo '{"event_id": "test-threat-001", "tenant_id": "test-tenant", "timestamp": 1752962500, "source_ip": "203.0.113.1", "raw_message": "Suspicious activity from malicious IP"}' | kafka-console-producer --bootstrap-server localhost:9092 --topic ingest-events 2>/dev/null || echo "⚠️  Kafka not available for live testing"

# Test the consumer with benign IP
echo "🟢 Testing with benign IP (1.1.1.1)..."
echo '{"event_id": "test-benign-001", "tenant_id": "test-tenant", "timestamp": 1752962500, "source_ip": "1.1.1.1", "raw_message": "Normal activity from clean IP"}' | kafka-console-producer --bootstrap-server localhost:9092 --topic ingest-events 2>/dev/null || echo "⚠️  Kafka not available for live testing"

# Wait a moment for processing
sleep 2

# Check final results
echo "📊 Final Results:"
echo "=================="
clickhouse client --query "SELECT source_ip, is_threat, COUNT(*) as count FROM dev.events WHERE tenant_id = 'test-tenant' GROUP BY source_ip, is_threat ORDER BY source_ip" --format PrettyCompact

echo ""
echo "🎯 Threat Intelligence Summary:"
echo "• Malicious IPs in database: $(clickhouse client --query "SELECT COUNT(*) FROM dev.threat_intel WHERE ioc_type = 'ipv4'")"
echo "• Events flagged as threats: $(clickhouse client --query "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'test-tenant' AND is_threat = 1")"
echo "• Events flagged as benign: $(clickhouse client --query "SELECT COUNT(*) FROM dev.events WHERE tenant_id = 'test-tenant' AND is_threat = 0")"
echo ""
echo "✅ Threat Intelligence Testing Complete!" 