#!/usr/bin/env bash
set -e

echo "Extracting test data for all 50 rules..."

# Rule 1: high_volume_multi_tenant - Extract 10 events per tenant
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 AND tenant_id = 'tenant-A' LIMIT 10 FORMAT JSONEachRow" > testdata/rule-high_volume_multi_tenant.json

# Rule 2: bulk_events_same_source
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE source_ip = '192.168.1.100' AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-bulk_events_same_source.json

# Rule 3: unknown_category_burst  
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_category = 'Unknown' AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-unknown_category_burst.json

# Rule 4: tenant_a_activity
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE tenant_id = 'tenant-A' AND event_timestamp = 0 LIMIT 15 FORMAT JSONEachRow" > testdata/rule-tenant_a_activity.json

# Rule 5: test_tenant_events
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE tenant_id = 'test-tenant' AND event_timestamp = 0 LIMIT 15 FORMAT JSONEachRow" > testdata/rule-test_tenant_events.json

# Rule 6: batch_test_monitoring
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE tenant_id = 'batch-test-tenant' AND event_timestamp = 0 LIMIT 15 FORMAT JSONEachRow" > testdata/rule-batch_test_monitoring.json

# Rule 7: large_raw_events
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE length(raw_event) > 100 AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-large_raw_events.json

# Rule 8: source_ip_spread
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE source_ip != '' AND event_timestamp = 0 LIMIT 15 FORMAT JSONEachRow" > testdata/rule-source_ip_spread.json

# Rule 9: multi_tenant_correlation (sample from all tenants)
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 LIMIT 20 FORMAT JSONEachRow" > testdata/rule-multi_tenant_correlation.json

# Rule 10: parsing_success_volume
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE parsing_status = 'success' AND event_timestamp = 0 LIMIT 15 FORMAT JSONEachRow" > testdata/rule-parsing_success_volume.json

# Rules 11-20: Event ID patterns and keyword searches
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_id LIKE 'cab9a8e8%' AND event_timestamp = 0 LIMIT 5 FORMAT JSONEachRow" > testdata/rule-event_id_pattern_1.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_id LIKE '5af729ec%' AND event_timestamp = 0 LIMIT 5 FORMAT JSONEachRow" > testdata/rule-event_id_pattern_2.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE raw_event LIKE '%test%' AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-raw_event_keywords.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-tenant_volume_threshold_1.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-tenant_volume_threshold_2.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 LIMIT 20 FORMAT JSONEachRow" > testdata/rule-cross_tenant_events_15.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 LIMIT 25 FORMAT JSONEachRow" > testdata/rule-cross_tenant_events_20.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE source_type = 'test' AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-source_type_test_volume.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE ingestion_timestamp = 0 AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-ingestion_timestamp_zero.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE ingestion_timestamp != 0 AND event_timestamp = 0 LIMIT 5 FORMAT JSONEachRow" > testdata/rule-non_zero_ingestion.json

# Rules 21-30: Field analysis
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_id LIKE '%-%' AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-uuid_v4_patterns.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE source_ip = '' AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-empty_source_ip.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE source_ip != '' AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-non_empty_source_ip.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_outcome = '' AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-event_outcome_empty.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_action = '' AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-event_action_empty.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE is_threat = 0 AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-is_threat_zero.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE value IS NULL AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-null_value_fields.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE hour IS NULL AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-null_hour_fields.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE log_source_id IS NULL AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-null_log_source.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE parse_error_msg IS NULL AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-null_parse_error.json

# Rules 31-40: Specific event batches and analysis
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE (event_id LIKE 'd9f67c2b%' OR event_id LIKE 'b236d306%') AND event_timestamp = 0 LIMIT 5 FORMAT JSONEachRow" > testdata/rule-specific_event_batch_1.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE (event_id LIKE '47c45d44%' OR event_id LIKE 'f8e2b1a3%') AND event_timestamp = 0 LIMIT 5 FORMAT JSONEachRow" > testdata/rule-specific_event_batch_2.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE tenant_id = 'tenant-A' AND event_timestamp = 0 LIMIT 15 FORMAT JSONEachRow" > testdata/rule-tenant_a_large_subset.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE tenant_id = 'tenant-A' AND event_timestamp = 0 LIMIT 12 FORMAT JSONEachRow" > testdata/rule-tenant_a_medium_subset.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_category = 'Unknown' AND event_timestamp = 0 LIMIT 15 FORMAT JSONEachRow" > testdata/rule-event_category_unknown_volume.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_category = 'test' AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-event_category_test_volume.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE length(raw_event) <= 50 AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-raw_event_length_small.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE length(raw_event) BETWEEN 50 AND 200 AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-raw_event_length_medium.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE length(raw_event) > 200 AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-raw_event_length_large.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE tenant_id IN ('tenant-A', 'test-tenant') AND event_timestamp = 0 LIMIT 15 FORMAT JSONEachRow" > testdata/rule-combined_tenant_source_analysis.json

# Rules 41-50: Aggregation rules
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 LIMIT 100 FORMAT JSONEachRow" > testdata/rule-all_tenant_aggregation.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 LIMIT 500 FORMAT JSONEachRow" > testdata/rule-all_tenant_aggregation_500.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 LIMIT 1000 FORMAT JSONEachRow" > testdata/rule-all_tenant_aggregation_1k.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 LIMIT 5000 FORMAT JSONEachRow" > testdata/rule-all_tenant_aggregation_5k.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 LIMIT 10000 FORMAT JSONEachRow" > testdata/rule-all_tenant_aggregation_10k.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE tenant_id = 'batch-test-tenant' AND event_timestamp = 0 LIMIT 100 FORMAT JSONEachRow" > testdata/rule-tenant_specific_batch_test.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE tenant_id = 'test-tenant' AND event_timestamp = 0 LIMIT 100 FORMAT JSONEachRow" > testdata/rule-tenant_specific_test.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE parsing_status = 'success' AND event_timestamp = 0 LIMIT 20 FORMAT JSONEachRow" > testdata/rule-parsing_status_success_volume.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_category = 'Unknown' AND source_type = 'Unknown' AND event_timestamp = 0 LIMIT 10 FORMAT JSONEachRow" > testdata/rule-multi_field_correlation.json
curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE event_timestamp = 0 LIMIT 50 FORMAT JSONEachRow" > testdata/rule-final_comprehensive_rule.json

echo "Test data extraction completed for all 50 rules."
echo "Verifying file counts..."

# Verify each file has at least 1 line
for f in testdata/rule-*.json; do
    if [ ! -s "$f" ]; then
        echo "WARNING: $f is empty"
    else
        lines=$(wc -l < "$f")
        echo "$(basename "$f"): $lines events"
    fi
done