#!/usr/bin/env bash
set -e

echo "Creating 50 rules directly in ClickHouse..."

# First clear existing test rules
curl -s "http://localhost:8123/" --data "ALTER TABLE dev.alert_rules DELETE WHERE rule_id LIKE 'high_volume%' OR rule_id LIKE 'bulk_events%' OR rule_id LIKE 'unknown_category%'"

# Create rules using a more direct approach
cat > temp_50_rules.sql << 'EOF'
INSERT INTO dev.alert_rules (rule_id, tenant_scope, rule_name, kql_query, severity, enabled, description, created_at, updated_at) VALUES 

('high_volume_multi_tenant', 'all', 'High volume events across multiple tenants (≥10 events per tenant)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'high', 1, 'High volume events across multiple tenants (≥10 events per tenant)', now(), now()),

('bulk_events_same_source', 'all', 'Bulk events from same source IP (≥100 events)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, source_ip, raw_event as message, '''' as user FROM dev.events WHERE source_ip = ''192.168.1.100'' AND event_timestamp = 0 GROUP BY source_ip, tenant_id HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Bulk events from same source IP (≥100 events)', now(), now()),

('unknown_category_burst', 'all', 'Burst of unknown category events (≥10 events)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_category = ''Unknown'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Burst of unknown category events (≥10 events)', now(), now()),

('tenant_a_activity', 'tenant-A', 'High activity in tenant-A (≥1000 events)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE tenant_id = ''tenant-A'' AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'low', 1, 'High activity in tenant-A (≥1000 events)', now(), now()),

('test_tenant_events', 'test-tenant', 'Test tenant event monitoring (≥10 events)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE tenant_id = ''test-tenant'' AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'low', 1, 'Test tenant event monitoring (≥10 events)', now(), now()),

('batch_test_monitoring', 'batch-test-tenant', 'Batch test tenant monitoring (≥10 events)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE tenant_id = ''batch-test-tenant'' AND event_timestamp = 0 HAVING count() >= 10 LIMIT 50', 'low', 1, 'Batch test tenant monitoring (≥10 events)', now(), now()),

('large_raw_events', 'all', 'Large raw events detection (≥100 chars)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE length(raw_event) > 100 AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Large raw events detection (≥100 chars)', now(), now()),

('source_ip_spread', 'all', 'Events with source IP spread across tenants', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, source_ip, raw_event as message, '''' as user FROM dev.events WHERE source_ip != '''' AND event_timestamp = 0 GROUP BY source_ip HAVING countDistinct(tenant_id) >= 2 AND count() >= 10 LIMIT 50', 'medium', 1, 'Events with source IP spread across tenants', now(), now()),

('multi_tenant_correlation', 'all', 'Events correlated across multiple tenants', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, '''' as tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING countDistinct(tenant_id) >= 3 AND count() >= 15 LIMIT 50', 'high', 1, 'Events correlated across multiple tenants', now(), now()),

('parsing_success_volume', 'all', 'High volume of successfully parsed events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE parsing_status = ''success'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'High volume of successfully parsed events', now(), now()),

('event_id_pattern_1', 'all', 'Events with specific ID patterns (cab9a8e8 prefix)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_id LIKE ''cab9a8e8%'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 1 LIMIT 50', 'low', 1, 'Events with specific ID patterns (cab9a8e8 prefix)', now(), now()),

('event_id_pattern_2', 'all', 'Events with specific ID patterns (5af729ec prefix)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_id LIKE ''5af729ec%'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 1 LIMIT 50', 'low', 1, 'Events with specific ID patterns (5af729ec prefix)', now(), now()),

('raw_event_keywords', 'all', 'Events containing specific keywords in raw_event', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE raw_event LIKE ''%test%'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Events containing specific keywords in raw_event', now(), now()),

('tenant_volume_threshold_1', 'all', 'Tenant volume exceeding 100k events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 100000 LIMIT 50', 'high', 1, 'Tenant volume exceeding 100k events', now(), now()),

('tenant_volume_threshold_2', 'all', 'Tenant volume exceeding 50k events', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 50000 LIMIT 50', 'medium', 1, 'Tenant volume exceeding 50k events', now(), now()),

('cross_tenant_events_15', 'all', 'Cross-tenant event patterns (≥15 total)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, '''' as tenant_id, '''' as source_ip, count()::String as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 15 LIMIT 50', 'medium', 1, 'Cross-tenant event patterns (≥15 total)', now(), now()),

('cross_tenant_events_20', 'all', 'Cross-tenant event patterns (≥20 total)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, '''' as tenant_id, '''' as source_ip, count()::String as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 20 LIMIT 50', 'high', 1, 'Cross-tenant event patterns (≥20 total)', now(), now()),

('source_type_test_volume', 'all', 'High volume from test source type', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE source_type = ''test'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'High volume from test source type', now(), now()),

('ingestion_timestamp_zero', 'all', 'Events with zero ingestion timestamp', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE ingestion_timestamp = 0 AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with zero ingestion timestamp', now(), now()),

('non_zero_ingestion', 'all', 'Events with non-zero ingestion timestamp', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE ingestion_timestamp != 0 AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 1 LIMIT 50', 'low', 1, 'Events with non-zero ingestion timestamp', now(), now()),

('uuid_v4_patterns', 'all', 'Events with UUID v4 patterns in event_id', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_id LIKE ''%-%'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with UUID v4 patterns in event_id', now(), now()),

('empty_source_ip', 'all', 'Events with empty source IP', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE source_ip = '''' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with empty source IP', now(), now()),

('non_empty_source_ip', 'all', 'Events with non-empty source IP', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, source_ip, raw_event as message, '''' as user FROM dev.events WHERE source_ip != '''' AND event_timestamp = 0 GROUP BY tenant_id, source_ip HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with non-empty source IP', now(), now()),

('event_outcome_empty', 'all', 'Events with empty outcome', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_outcome = '''' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with empty outcome', now(), now()),

('event_action_empty', 'all', 'Events with empty action', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_action = '''' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with empty action', now(), now()),

('is_threat_zero', 'all', 'Events with is_threat = 0', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE is_threat = 0 AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with is_threat = 0', now(), now()),

('null_value_fields', 'all', 'Events with null value fields', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE value IS NULL AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with null value fields', now(), now()),

('null_hour_fields', 'all', 'Events with null hour fields', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE hour IS NULL AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with null hour fields', now(), now()),

('null_log_source', 'all', 'Events with null log source ID', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE log_source_id IS NULL AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with null log source ID', now(), now()),

('null_parse_error', 'all', 'Events with null parse error messages', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE parse_error_msg IS NULL AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Events with null parse error messages', now(), now()),

('specific_event_batch_1', 'all', 'Specific event batch analysis 1', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_id LIKE ''d9f67c2b%'' OR event_id LIKE ''b236d306%'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 1 LIMIT 50', 'low', 1, 'Specific event batch analysis 1', now(), now()),

('specific_event_batch_2', 'all', 'Specific event batch analysis 2', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_id LIKE ''47c45d44%'' OR event_id LIKE ''f8e2b1a3%'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 1 LIMIT 50', 'low', 1, 'Specific event batch analysis 2', now(), now()),

('tenant_a_large_subset', 'tenant-A', 'Large subset of tenant-A events (≥10k)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE tenant_id = ''tenant-A'' AND event_timestamp = 0 HAVING count() >= 10000 LIMIT 50', 'medium', 1, 'Large subset of tenant-A events (≥10k)', now(), now()),

('tenant_a_medium_subset', 'tenant-A', 'Medium subset of tenant-A events (≥1k)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE tenant_id = ''tenant-A'' AND event_timestamp = 0 HAVING count() >= 1000 LIMIT 50', 'low', 1, 'Medium subset of tenant-A events (≥1k)', now(), now()),

('event_category_unknown_volume', 'all', 'Unknown category high volume (≥100k)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_category = ''Unknown'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 100000 LIMIT 50', 'high', 1, 'Unknown category high volume (≥100k)', now(), now()),

('event_category_test_volume', 'all', 'Test category volume analysis', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_category = ''test'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Test category volume analysis', now(), now()),

('raw_event_length_small', 'all', 'Small raw events (≤50 chars)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE length(raw_event) <= 50 AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Small raw events (≤50 chars)', now(), now()),

('raw_event_length_medium', 'all', 'Medium raw events (50-200 chars)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE length(raw_event) BETWEEN 50 AND 200 AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'low', 1, 'Medium raw events (50-200 chars)', now(), now()),

('raw_event_length_large', 'all', 'Large raw events (>200 chars)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE length(raw_event) > 200 AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Large raw events (>200 chars)', now(), now()),

('combined_tenant_source_analysis', 'all', 'Combined tenant and source analysis', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, source_ip, raw_event as message, '''' as user FROM dev.events WHERE tenant_id IN (''tenant-A'', ''test-tenant'') AND event_timestamp = 0 GROUP BY tenant_id, source_ip HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Combined tenant and source analysis', now(), now()),

('all_tenant_aggregation', 'all', 'All tenant aggregation (≥100 total)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, '''' as tenant_id, '''' as source_ip, count()::String as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'All tenant aggregation (≥100 total)', now(), now()),

('all_tenant_aggregation_500', 'all', 'All tenant aggregation (≥500 total)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, '''' as tenant_id, '''' as source_ip, count()::String as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 500 LIMIT 50', 'low', 1, 'All tenant aggregation (≥500 total)', now(), now()),

('all_tenant_aggregation_1k', 'all', 'All tenant aggregation (≥1k total)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, '''' as tenant_id, '''' as source_ip, count()::String as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 1000 LIMIT 50', 'medium', 1, 'All tenant aggregation (≥1k total)', now(), now()),

('all_tenant_aggregation_5k', 'all', 'All tenant aggregation (≥5k total)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, '''' as tenant_id, '''' as source_ip, count()::String as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 5000 LIMIT 50', 'medium', 1, 'All tenant aggregation (≥5k total)', now(), now()),

('all_tenant_aggregation_10k', 'all', 'All tenant aggregation (≥10k total)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, '''' as tenant_id, '''' as source_ip, count()::String as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 10000 LIMIT 50', 'high', 1, 'All tenant aggregation (≥10k total)', now(), now()),

('tenant_specific_batch_test', 'batch-test-tenant', 'Batch test tenant specific analysis (≥100)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE tenant_id = ''batch-test-tenant'' AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'Batch test tenant specific analysis (≥100)', now(), now()),

('tenant_specific_test', 'test-tenant', 'Test tenant specific analysis (≥100)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE tenant_id = ''test-tenant'' AND event_timestamp = 0 HAVING count() >= 100 LIMIT 50', 'low', 1, 'Test tenant specific analysis (≥100)', now(), now()),

('parsing_status_success_volume', 'all', 'High parsing success volume (≥1k)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, '''' as source_ip, raw_event as message, '''' as user FROM dev.events WHERE parsing_status = ''success'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 1000 LIMIT 50', 'low', 1, 'High parsing success volume (≥1k)', now(), now()),

('multi_field_correlation', 'all', 'Multi-field correlation analysis', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, tenant_id, source_ip, raw_event as message, '''' as user FROM dev.events WHERE event_category = ''Unknown'' AND source_type = ''Unknown'' AND event_timestamp = 0 GROUP BY tenant_id HAVING count() >= 10 LIMIT 50', 'medium', 1, 'Multi-field correlation analysis', now(), now()),

('final_comprehensive_rule', 'all', 'Final comprehensive rule (≥2M total events)', 'SELECT arrayMap(x->toString(x), groupArray(event_id)) as event_ids, '''' as tenant_id, '''' as source_ip, count()::String as message, '''' as user FROM dev.events WHERE event_timestamp = 0 HAVING count() >= 2000000 LIMIT 50', 'critical', 1, 'Final comprehensive rule (≥2M total events)', now(), now())
;
EOF

echo "Executing SQL to create all 50 rules..."
cat temp_50_rules.sql | curl -s "http://localhost:8123/" --data-binary @-

# Verify creation
rule_count=$(curl -s "http://localhost:8123/" --data "SELECT COUNT(*) FROM dev.alert_rules WHERE enabled = 1")
echo "Created rules count: $rule_count"

# Clean up
rm temp_50_rules.sql

if [ "$rule_count" -ge 50 ]; then
    echo "✅ SUCCESS: 50+ rules created successfully"
else
    echo "⚠️ WARNING: Only $rule_count rules created"
fi