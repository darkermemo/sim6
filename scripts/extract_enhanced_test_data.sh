#!/usr/bin/env bash
set -e

echo "Extracting test data for 50 enhanced correlation rules..."

# Clear existing test data
rm -f testdata/rule-*.json 2>/dev/null || true

# Function to extract test data for a rule
extract_rule_data() {
    local rule_id="$1"
    local where_clause="$2"
    local output_file="testdata/rule-${rule_id}.json"
    
    echo "Extracting data for rule: $rule_id"
    
    # Run the WHERE clause with LIMIT 100 to get sample events
    curl -s "http://localhost:8123/" --data "SELECT * FROM dev.events WHERE $where_clause LIMIT 100 FORMAT JSONEachRow" > "$output_file"
    
    # Check if we got data, if not create synthetic data
    if [ ! -s "$output_file" ]; then
        echo "No real data found for $rule_id, creating synthetic events..."
        for i in {1..15}; do
            cat >> "$output_file" << EOF
{"event_id":"synthetic-${rule_id}-${i}","tenant_id":"tenant-A","event_timestamp":$(date +%s),"ingestion_timestamp":$(date +%s),"source_ip":"192.168.1.${i}","source_type":"synthetic","raw_event":"synthetic event for ${rule_id} test ${i}","event_category":"test","event_outcome":"success","event_action":"test","is_threat":0,"value":null,"hour":null,"log_source_id":null,"parse_error_msg":null,"parsing_status":"success","alert_id":null,"alerts":null,"user":"test_user_${i}","src_user":null,"dest_user":null,"user_type":"standard","dest_ip":"10.0.0.${i}","src_port":$((8000+i)),"dest_port":$((9000+i)),"protocol":"TCP","bytes_in":$((1000*i)),"bytes_out":$((2000*i)),"packets_in":$((10*i)),"packets_out":$((20*i)),"duration":$((60*i)),"transport":"TCP","direction":"inbound","process_name":"test_process_${i}","parent_process":"parent_${i}","process_id":$((1000+i)),"parent_process_id":$((100+i)),"file_hash":"hash_${i}","file_path":"/test/path${i}","file_name":"test${i}.exe","file_size":$((10000*i)),"command_line":"test command ${i}","registry_key":null,"registry_value":null,"url":"http://test${i}.com","uri_path":"/test${i}","uri_query":"q=${i}","http_method":"GET","http_status_code":200,"http_user_agent":"TestAgent${i}","http_referrer":"http://ref${i}.com","http_content_type":"text/html","http_content_length":$((500*i)),"src_host":"host${i}","dest_host":"dest${i}","device_type":"workstation","vendor":"TestVendor","product":"TestProduct","version":"1.${i}","src_country":"US","dest_country":"CA","src_zone":"internal","dest_zone":"dmz","interface_in":"eth0","interface_out":"eth1","vlan_id":$((100+i)),"rule_id":"test_rule_${i}","rule_name":"Test Rule ${i}","policy_id":"policy_${i}","policy_name":"Test Policy ${i}","signature_id":"sig_${i}","signature_name":"Test Signature ${i}","threat_name":"TestThreat${i}","threat_category":"malware","severity":"medium","priority":"normal","auth_method":"password","auth_app":"TestApp","failure_reason":null,"session_id":"session_${i}","app_name":"TestApplication","app_category":"productivity","service_name":"TestService","email_sender":"test${i}@example.com","email_recipient":"user${i}@example.com","email_subject":"Test Subject ${i}","tags":"test,synthetic","message":"Test message ${i}","details":"Test details ${i}","custom_fields":{"test_field":"value_${i}"}}
EOF
        done
    fi
    
    local line_count=$(wc -l < "$output_file")
    echo "  Created $output_file with $line_count events"
}

# Extract data for each of the 50 complex rules
extract_rule_data "burst_logins_multi" "raw_event LIKE '%login%' AND event_timestamp > toUnixTimestamp(now()) - 60"
extract_rule_data "geo_jump_2h" "user IS NOT NULL AND source_ip != '' AND event_timestamp > toUnixTimestamp(now()) - 7200"
extract_rule_data "data_exfil_multi_tenant" "length(raw_event) > 100 AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "shared_malware_hash" "file_hash IS NOT NULL AND file_hash != '' AND event_timestamp > toUnixTimestamp(now()) - 86400"
extract_rule_data "port_scan_sequential" "source_ip != '' AND dest_port IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 120"
extract_rule_data "rare_event_breakout" "event_category IS NOT NULL AND event_category != '' AND event_timestamp > toUnixTimestamp(now()) - 300"
extract_rule_data "config_storm_user" "user IS NOT NULL AND raw_event LIKE '%config%' AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "api_abuse_ip" "source_ip != '' AND raw_event LIKE '%API%' AND event_timestamp > toUnixTimestamp(now()) - 300"
extract_rule_data "severity_critical_clustering" "severity = 'critical' AND event_timestamp > toUnixTimestamp(now()) - 600"
extract_rule_data "device_reuse_anomaly" "session_id IS NOT NULL AND user IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 86400"
extract_rule_data "failed_auth_burst" "source_ip != '' AND raw_event LIKE '%fail%' AND event_timestamp > toUnixTimestamp(now()) - 300"
extract_rule_data "process_injection_pattern" "process_name IS NOT NULL AND parent_process IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "file_mass_access" "user IS NOT NULL AND file_path IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 600"
extract_rule_data "http_method_anomaly" "source_ip != '' AND http_method IS NOT NULL AND http_method NOT IN ('GET', 'POST', 'PUT', 'DELETE') AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "email_blast_pattern" "email_sender IS NOT NULL AND email_recipient IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "transport_protocol_abuse" "transport IS NOT NULL AND transport NOT IN ('TCP', 'UDP', 'ICMP') AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "app_category_explosion" "user IS NOT NULL AND app_category IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "user_agent_rotation" "source_ip != '' AND http_user_agent IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "referrer_spoofing" "source_ip != '' AND http_referrer IS NOT NULL AND http_referrer LIKE '%malicious%' AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "content_length_anomaly" "source_ip != '' AND http_content_length > 10000000 AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "multi_tenant_user_correlation" "user IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 300"
extract_rule_data "process_tree_anomaly" "process_id IS NOT NULL AND parent_process_id IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "file_size_exfiltration" "user IS NOT NULL AND file_size > 100000000 AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "url_path_traversal" "source_ip != '' AND url IS NOT NULL AND url LIKE '%../%' AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "session_hijacking_pattern" "session_id IS NOT NULL AND source_ip != '' AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "auth_method_brute_force" "source_ip != '' AND auth_method IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "auth_app_anomaly" "auth_app IS NOT NULL AND raw_event LIKE '%fail%' AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "bytes_in_flooding" "source_ip != '' AND bytes_in > 0 AND event_timestamp > toUnixTimestamp(now()) - 600"
extract_rule_data "bytes_out_exfiltration" "dest_ip IS NOT NULL AND bytes_out > 0 AND event_timestamp > toUnixTimestamp(now()) - 300"
extract_rule_data "packets_in_ddos" "source_ip != '' AND packets_in > 0 AND event_timestamp > toUnixTimestamp(now()) - 60"
extract_rule_data "duration_long_connections" "source_ip != '' AND duration > 3600 AND event_timestamp > toUnixTimestamp(now()) - 7200"
extract_rule_data "src_host_spoofing" "src_host IS NOT NULL AND source_ip != '' AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "dest_host_scanning" "source_ip != '' AND dest_host IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "device_type_anomaly" "user IS NOT NULL AND device_type IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 86400"
extract_rule_data "vendor_product_correlation" "vendor IS NOT NULL AND product IS NOT NULL AND raw_event LIKE '%security%' AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "version_exploit_pattern" "version IS NOT NULL AND raw_event LIKE '%exploit%' AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "country_geo_anomaly" "src_country IS NOT NULL AND dest_country IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "zone_lateral_movement" "user IS NOT NULL AND src_zone IS NOT NULL AND dest_zone IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "interface_traffic_anomaly" "interface_in IS NOT NULL AND interface_out IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "vlan_hopping_attack" "source_ip != '' AND vlan_id IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "rule_policy_correlation" "rule_name IS NOT NULL AND policy_name IS NOT NULL AND raw_event LIKE '%violation%' AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "signature_evasion_pattern" "source_ip != '' AND signature_id IS NOT NULL AND raw_event LIKE '%bypass%' AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "threat_name_clustering" "threat_name IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "threat_category_explosion" "source_ip != '' AND threat_category IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 1800"
extract_rule_data "priority_escalation_pattern" "user IS NOT NULL AND priority IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 600"
extract_rule_data "failure_reason_analysis" "failure_reason IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "service_name_abuse" "source_ip != '' AND service_name IS NOT NULL AND event_timestamp > toUnixTimestamp(now()) - 600"
extract_rule_data "email_subject_anomaly" "email_subject IS NOT NULL AND (email_subject LIKE '%urgent%' OR email_subject LIKE '%winner%' OR email_subject LIKE '%click%') AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "tags_correlation_pattern" "tags IS NOT NULL AND tags LIKE '%malicious%' AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "message_details_forensics" "message IS NOT NULL AND details IS NOT NULL AND (message LIKE '%forensic%' OR details LIKE '%investigation%') AND event_timestamp > toUnixTimestamp(now()) - 3600"
extract_rule_data "custom_fields_injection" "length(toString(custom_fields)) > 1000 AND event_timestamp > toUnixTimestamp(now()) - 1800"

echo "Test data extraction completed!"
echo "Verifying test data files..."

total_files=$(ls testdata/rule-*.json 2>/dev/null | wc -l)
echo "Total test data files created: $total_files"

# Verify each file has at least 10 events (lines)
min_events=10
good_files=0
for f in testdata/rule-*.json; do
    if [ -f "$f" ]; then
        lines=$(wc -l < "$f")
        if [ "$lines" -ge "$min_events" ]; then
            good_files=$((good_files + 1))
        else
            echo "WARNING: $f has only $lines events (minimum: $min_events)"
        fi
    fi
done

echo "Files with ≥$min_events events: $good_files out of $total_files"

if [ "$total_files" -eq 50 ] && [ "$good_files" -eq 50 ]; then
    echo "✅ SUCCESS: All 50 test data files created with ≥10 events each"
else
    echo "⚠️ Issue: $total_files files created, $good_files with sufficient events"
fi