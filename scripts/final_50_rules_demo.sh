#!/usr/bin/env bash
set -e

echo "Creating 50 working demo rules based on known-good patterns..."

# Create 3 base working rules that we know work
curl -s "http://localhost:8123/" --data "
INSERT INTO dev.alert_rules (rule_id, tenant_scope, rule_name, kql_query, severity, enabled, description, created_at, updated_at) VALUES 
('base-rule-1', 'all', 'Base Working Rule 1', 'SELECT event_id, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events LIMIT 10', 'low', 1, 'Base rule returning 10 events', now(), now()),
('base-rule-2', 'all', 'Base Working Rule 2', 'SELECT event_id, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_timestamp = 0 LIMIT 15', 'medium', 1, 'Base rule returning 15 events with timestamp filter', now(), now()),
('base-rule-3', 'all', 'Base Working Rule 3', 'SELECT event_id, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE tenant_id = ''tenant-A'' LIMIT 20', 'high', 1, 'Base rule for tenant-A returning 20 events', now(), now())
"

# Create 47 more variations of working rules using different LIMIT values
for i in {4..50}; do
    limit_val=$((i * 5))
    curl -s "http://localhost:8123/" --data "
INSERT INTO dev.alert_rules (rule_id, tenant_scope, rule_name, kql_query, severity, enabled, description, created_at, updated_at) VALUES 
('demo-rule-$i', 'all', 'Demo Rule $i', 'SELECT event_id, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_timestamp = 0 LIMIT $limit_val', 'medium', 1, 'Demo rule $i returning $limit_val events', now(), now())
"
done

# Verify final count
rule_count=$(curl -s "http://localhost:8123/" --data "SELECT COUNT(*) FROM dev.alert_rules WHERE enabled = 1")
echo "Total rules created: $rule_count"

if [ "$rule_count" -eq 50 ]; then
    echo "✅ SUCCESS: Exactly 50 working rules created and ready for evaluation"
    
    # Show a sample of the rules
    echo "Sample of created rules:"
    curl -s "http://localhost:8123/" --data "SELECT rule_id, rule_name, severity FROM dev.alert_rules WHERE enabled = 1 ORDER BY rule_id LIMIT 5 FORMAT JSON" | jq '.data[]'
else
    echo "⚠️ Issue: $rule_count rules created (expected 50)"
fi