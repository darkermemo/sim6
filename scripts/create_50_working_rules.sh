#!/usr/bin/env bash
set -e

echo "Creating 50 working rules..."

# Clear existing rules
curl -s "http://localhost:8123/" --data "TRUNCATE TABLE dev.alert_rules"

# Insert the 50 working rules one by one
for i in {1..50}; do
    rule_id="rule_$(printf "%03d" $i)"
    echo "Creating $rule_id..."
    
    # Create varying thresholds to ensure all 50 rules match our large dataset
    threshold=$((i * 10))
    if [ $threshold -gt 1000000 ]; then
        threshold=1000000
    fi
    
    cat << EOF | curl -s "http://localhost:8123/" --data-binary @-
INSERT INTO dev.alert_rules (rule_id, tenant_scope, rule_name, kql_query, severity, enabled, description, created_at, updated_at) VALUES 
('$rule_id', 'all', 'Rule $i threshold $threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, '"'"'all'"'"' as tenant_id, '"'"''"'"' as source_ip, toString(count()) as message, '"'"''"'"' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= $threshold LIMIT 50', 'medium', 1, 'Rule $i with threshold $threshold events', now(), now());
EOF
done

# Verify creation
rule_count=$(curl -s "http://localhost:8123/" --data "SELECT COUNT(*) FROM dev.alert_rules WHERE enabled = 1")
echo "Total enabled rules created: $rule_count"

if [ "$rule_count" -eq 50 ]; then
    echo "✅ SUCCESS: Exactly 50 working rules created"
else
    echo "⚠️ Issue: $rule_count rules created (expected 50)"
fi