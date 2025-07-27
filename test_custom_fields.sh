#!/bin/bash

# Test script to verify custom fields functionality
# This script sends a rich Palo Alto log and verifies custom fields are stored

echo "Testing Custom Fields Implementation..."

# Rich Palo Alto Session Denied log with many non-CIM fields
PALO_ALTO_LOG='LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|Session Denied|devTime=2024-01-15T10:30:45.123Z|src=192.168.1.100|dst=203.0.113.50|srcPort=54321|dstPort=443|proto=TCP|srcUser=john.doe|dstUser=|act=deny|devName=PA-FW-01|dvchost=firewall.company.com|msg=Session denied by security policy|srchost=workstation-01|dsthost=external-server|out=1024|in=0|duration=0|cs2=Block_External_Traffic|cs2Label=RuleName|policyId=rule-123|srcZone=internal|dstZone=external|srcCountry=US|dstCountry=UK|app=ssl|appcat=networking|threatName=|threatCategory=|sev=Medium|sessionId=sess-abc123|DeviceName=PA-FW-01|SessionEndReason=Policy Deny|VirtualSystem=vsys1|SequenceNumber=12345|ActionFlags=0x8000000000000000|Bytes=1024|BytesReceived=0|BytesSent=1024|ElapsedTime=0|Packets=8|PacketsReceived=0|PacketsSent=8|SessionStartTime=2024-01-15T10:30:45.123Z|Category=general|Subcategory=end|ConfigVersion=10.1.0|GeneratedTime=2024-01-15T10:30:45.123Z|HighResTimestamp=1705315845123456|HostID=0x01020304|InboundInterface=ethernet1/1|OutboundInterface=ethernet1/2|LogAction=default|LogProfile=default|NATDestination=0.0.0.0|NATDestinationPort=0|NATSource=0.0.0.0|NATSourcePort=0|Protocol=tcp|RepeatCount=1|RuleUUID=01234567-89ab-cdef-0123-456789abcdef|SourceLocation=internal|DestinationLocation=external|TunnelID=0|TunnelType=N/A|URLCategory=any'

# Send the log via the ingestor
echo "Sending Palo Alto log..."
curl -X POST http://localhost:8081/ingest \
  -H "Content-Type: application/json" \
  -d "{
    \"tenant_id\": \"test-tenant\",
    \"source_ip\": \"192.168.1.100\",
    \"raw_message\": \"$PALO_ALTO_LOG\"
  }"

echo -e "\n\nWaiting for processing..."
sleep 5

# Query the database to verify the event was stored with custom fields
echo "\nQuerying database for the event..."
curl -X POST 'http://localhost:8123/' \
  -d "SELECT event_id, vendor, product, source_ip, dest_ip, rule_name, custom_fields FROM dev.events WHERE tenant_id = 'test-tenant' ORDER BY event_timestamp DESC LIMIT 1 FORMAT JSON" \
  | jq .

# Query specifically for custom fields
echo "\n\nQuerying custom fields specifically..."
curl -X POST 'http://localhost:8123/' \
  -d "SELECT custom_fields['DeviceName'] as device_name, custom_fields['SessionEndReason'] as session_end_reason, custom_fields['VirtualSystem'] as virtual_system, custom_fields['SequenceNumber'] as sequence_number FROM dev.events WHERE tenant_id = 'test-tenant' ORDER BY event_timestamp DESC LIMIT 1 FORMAT JSON" \
  | jq .

echo "\n\nTest completed!"