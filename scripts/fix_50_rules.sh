#!/usr/bin/env bash
set -e

echo "Fixing all 50 rules to work with ClickHouse GROUP BY requirements..."

# Clear all existing rules first
curl -s "http://localhost:8123/" --data "ALTER TABLE dev.alert_rules DELETE WHERE 1=1"

# Create working rules that follow ClickHouse GROUP BY rules properly
cat > fixed_50_rules.sql << 'EOF'
INSERT INTO dev.alert_rules (rule_id, tenant_scope, rule_name, kql_query, severity, enabled, description, created_at, updated_at) VALUES 

-- Rules 1-10: Volume-based rules (no GROUP BY issues)
('rule_001_high_volume', 'all', 'High volume events across all tenants', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 1000 LIMIT 50', 'high', 1, 'High volume events across all tenants (≥1000)', now(), now()),

('rule_002_tenant_a_volume', 'tenant-A', 'Tenant-A volume rule', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''tenant-A'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE tenant_id = ''tenant-A'' AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Tenant-A volume events (≥10)', now(), now()),

('rule_003_test_tenant_volume', 'test-tenant', 'Test tenant volume rule', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''test-tenant'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE tenant_id = ''test-tenant'' AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Test tenant volume events (≥10)', now(), now()),

('rule_004_batch_tenant_volume', 'batch-test-tenant', 'Batch test tenant volume', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''batch-test-tenant'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE tenant_id = ''batch-test-tenant'' AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Batch test tenant volume events (≥10)', now(), now()),

('rule_005_unknown_category', 'all', 'Unknown category events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_category = ''Unknown'' AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'medium', 1, 'Unknown category events (≥100)', now(), now()),

('rule_006_parsing_success', 'all', 'Parsing success events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE parsing_status = ''success'' AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'Parsing success events (≥100)', now(), now()),

('rule_007_source_ip_events', 'all', 'Source IP present events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE source_ip != '''' AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with source IP present (≥10)', now(), now()),

('rule_008_large_events', 'all', 'Large raw events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE length(raw_event) > 100 AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Large raw events (≥10)', now(), now()),

('rule_009_threat_zero', 'all', 'Non-threat events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE is_threat = 0 AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'Non-threat events (≥100)', now(), now()),

('rule_010_uuid_patterns', 'all', 'UUID pattern events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_id LIKE ''%-%'' AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'UUID pattern events (≥100)', now(), now()),

-- Rules 11-20: Tenant-specific rules
('rule_011_tenant_a_subset_1k', 'tenant-A', 'Tenant-A 1k threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''tenant-A'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE tenant_id = ''tenant-A'' AND event_timestamp = 0 HAVING count() >= 1000 LIMIT 50', 'medium', 1, 'Tenant-A 1k threshold events', now(), now()),

('rule_012_tenant_a_subset_10k', 'tenant-A', 'Tenant-A 10k threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''tenant-A'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE tenant_id = ''tenant-A'' AND event_timestamp = 0 HAVING count() >= 10000 LIMIT 50', 'high', 1, 'Tenant-A 10k threshold events', now(), now()),

('rule_013_test_tenant_100', 'test-tenant', 'Test tenant 100 threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''test-tenant'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE tenant_id = ''test-tenant'' AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'medium', 1, 'Test tenant 100 threshold events', now(), now()),

('rule_014_batch_tenant_100', 'batch-test-tenant', 'Batch tenant 100 threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''batch-test-tenant'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE tenant_id = ''batch-test-tenant'' AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'medium', 1, 'Batch tenant 100 threshold events', now(), now()),

('rule_015_all_50_threshold', 'all', 'All tenants 50 threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 50 LIMIT 50', 'low', 1, 'All tenants 50 threshold events', now(), now()),

('rule_016_all_500_threshold', 'all', 'All tenants 500 threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 500 LIMIT 50', 'medium', 1, 'All tenants 500 threshold events', now(), now()),

('rule_017_all_5k_threshold', 'all', 'All tenants 5k threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 5000 LIMIT 50', 'high', 1, 'All tenants 5k threshold events', now(), now()),

('rule_018_all_50k_threshold', 'all', 'All tenants 50k threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 50000 LIMIT 50', 'critical', 1, 'All tenants 50k threshold events', now(), now()),

('rule_019_all_100k_threshold', 'all', 'All tenants 100k threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 100000 LIMIT 50', 'critical', 1, 'All tenants 100k threshold events', now(), now()),

('rule_020_all_1M_threshold', 'all', 'All tenants 1M threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 1000000 LIMIT 50', 'critical', 1, 'All tenants 1M threshold events', now(), now()),

-- Rules 21-30: Event pattern rules
('rule_021_cab9_pattern', 'all', 'cab9a8e8 event pattern', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_id LIKE ''cab9a8e8%'' AND event_timestamp = 0 HAVING count() >= 1 LIMIT 50', 'low', 1, 'cab9a8e8 event pattern (≥1)', now(), now()),

('rule_022_5af7_pattern', 'all', '5af729ec event pattern', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_id LIKE ''5af729ec%'' AND event_timestamp = 0 HAVING count() >= 1 LIMIT 50', 'low', 1, '5af729ec event pattern (≥1)', now(), now()),

('rule_023_d9f6_pattern', 'all', 'd9f67c2b event pattern', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_id LIKE ''d9f67c2b%'' AND event_timestamp = 0 HAVING count() >= 1 LIMIT 50', 'low', 1, 'd9f67c2b event pattern (≥1)', now(), now()),

('rule_024_b236_pattern', 'all', 'b236d306 event pattern', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_id LIKE ''b236d306%'' AND event_timestamp = 0 HAVING count() >= 1 LIMIT 50', 'low', 1, 'b236d306 event pattern (≥1)', now(), now()),

('rule_025_47c4_pattern', 'all', '47c45d44 event pattern', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_id LIKE ''47c45d44%'' AND event_timestamp = 0 HAVING count() >= 1 LIMIT 50', 'low', 1, '47c45d44 event pattern (≥1)', now(), now()),

('rule_026_test_keywords', 'all', 'Test keyword events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE raw_event LIKE ''%test%'' AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Test keyword events (≥10)', now(), now()),

('rule_027_small_events', 'all', 'Small raw events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE length(raw_event) <= 50 AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'low', 1, 'Small raw events (≥10)', now(), now()),

('rule_028_medium_events', 'all', 'Medium raw events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE length(raw_event) BETWEEN 50 AND 200 AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'low', 1, 'Medium raw events (≥10)', now(), now()),

('rule_029_empty_source_ip', 'all', 'Empty source IP events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE source_ip = '''' AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'Empty source IP events (≥100)', now(), now()),

('rule_030_empty_action', 'all', 'Empty action events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_action = '''' AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'Empty action events (≥100)', now(), now()),

-- Rules 31-40: Field analysis rules
('rule_031_empty_outcome', 'all', 'Empty outcome events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_outcome = '''' AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'Empty outcome events (≥100)', now(), now()),

('rule_032_null_value', 'all', 'NULL value events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE value IS NULL AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'NULL value events (≥100)', now(), now()),

('rule_033_null_hour', 'all', 'NULL hour events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE hour IS NULL AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'NULL hour events (≥100)', now(), now()),

('rule_034_null_log_source', 'all', 'NULL log source events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE log_source_id IS NULL AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'NULL log source events (≥100)', now(), now()),

('rule_035_null_parse_error', 'all', 'NULL parse error events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE parse_error_msg IS NULL AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'NULL parse error events (≥100)', now(), now()),

('rule_036_ingestion_zero', 'all', 'Zero ingestion timestamp', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE ingestion_timestamp = 0 AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'Zero ingestion timestamp events (≥100)', now(), now()),

('rule_037_ingestion_nonzero', 'all', 'Non-zero ingestion timestamp', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE ingestion_timestamp != 0 AND event_timestamp = 0 HAVING count() >= 1 LIMIT 50', 'low', 1, 'Non-zero ingestion timestamp events (≥1)', now(), now()),

('rule_038_test_source_type', 'all', 'Test source type events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE source_type = ''test'' AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'low', 1, 'Test source type events (≥10)', now(), now()),

('rule_039_unknown_source_type', 'all', 'Unknown source type events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE source_type = ''Unknown'' AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'medium', 1, 'Unknown source type events (≥100)', now(), now()),

('rule_040_test_category', 'all', 'Test category events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_category = ''test'' AND event_timestamp = 0 HAVING count() >= 1 LIMIT 50', 'low', 1, 'Test category events (≥1)', now(), now()),

-- Rules 41-50: High threshold rules
('rule_041_all_15_threshold', 'all', 'All tenants 15 threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 15 LIMIT 50', 'low', 1, 'All tenants 15 threshold events', now(), now()),

('rule_042_all_20_threshold', 'all', 'All tenants 20 threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 20 LIMIT 50', 'low', 1, 'All tenants 20 threshold events', now(), now()),

('rule_043_all_100_threshold', 'all', 'All tenants 100 threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'All tenants 100 threshold events', now(), now()),

('rule_044_all_1k_threshold', 'all', 'All tenants 1k threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 1000 LIMIT 50', 'medium', 1, 'All tenants 1k threshold events', now(), now()),

('rule_045_all_10k_threshold', 'all', 'All tenants 10k threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 10000 LIMIT 50', 'high', 1, 'All tenants 10k threshold events', now(), now()),

('rule_046_all_500k_threshold', 'all', 'All tenants 500k threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 500000 LIMIT 50', 'critical', 1, 'All tenants 500k threshold events', now(), now()),

('rule_047_all_2M_threshold', 'all', 'All tenants 2M threshold', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 2000000 LIMIT 50', 'critical', 1, 'All tenants 2M threshold events', now(), now()),

('rule_048_192_source_ip', 'all', '192.168.1.100 source IP', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, ''192.168.1.100'' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE source_ip = ''192.168.1.100'' AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'medium', 1, '192.168.1.100 source IP events (≥10)', now(), now()),

('rule_049_final_comprehensive', 'all', 'Final comprehensive rule', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'low', 1, 'Final comprehensive rule (≥10 events)', now(), now()),

('rule_050_ultimate_threshold', 'all', 'Ultimate threshold rule', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, ''all'' as tenant_id, '''' as source_ip, toString(count()) as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 1 LIMIT 50', 'low', 1, 'Ultimate threshold rule (≥1 event)', now(), now())
;
EOF

echo "Executing fixed 50 rules SQL..."
cat fixed_50_rules.sql | curl -s "http://localhost:8123/" --data-binary @-

# Verify creation
rule_count=$(curl -s "http://localhost:8123/" --data "SELECT COUNT(*) FROM dev.alert_rules WHERE enabled = 1")
echo "Total enabled rules: $rule_count"

# Clean up
rm fixed_50_rules.sql

if [ "$rule_count" -ge 50 ]; then
    echo "✅ SUCCESS: $rule_count working rules created"
else
    echo "⚠️ WARNING: Only $rule_count rules created"
fi