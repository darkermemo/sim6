#!/bin/bash

# Test script to verify Common Information Model (CIM) implementation
# This script tests that diverse vendor logs are normalized to CIM fields for unified querying

set -e

echo "=== CIM Implementation Verification Test ==="
echo "Testing Common Information Model normalization across vendor logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_BASE="http://localhost:8080"
ADMIN_TOKEN_FILE="admin_token.txt"

# Check if admin token exists
if [ ! -f "$ADMIN_TOKEN_FILE" ]; then
    echo -e "${RED}Admin token file not found. Please generate one first.${NC}"
    exit 1
fi

ADMIN_TOKEN=$(cat "$ADMIN_TOKEN_FILE")

echo "1. Setting up test log sources..."

# Create log sources for different vendors
echo "Creating Palo Alto log source..."
curl -s -X POST "$API_BASE/v1/log_sources" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_name": "PA-Firewall-01",
    "source_type": "palo_alto",
    "source_ip": "192.168.10.1"
  }' > /dev/null

echo "Creating Fortinet log source..."
curl -s -X POST "$API_BASE/v1/log_sources" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_name": "FortiGate-01", 
    "source_type": "fortinet_fortigate",
    "source_ip": "192.168.10.2"
  }' > /dev/null

echo "2. Ingesting Palo Alto firewall traffic log..."

# Palo Alto LEEF format log (deny action)
PA_LOG='LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|	|devTime=2024-01-15 14:30:45	src=10.20.105.24	dst=8.8.8.8	srcPort=54321	dstPort=53	proto=UDP	act=deny	srcUser=alice@corp.com	devName=PA-3220	msg=DNS query blocked	app=DNS	appcat=networking	severity=medium	policyId=100	srcZone=internal	dstZone=external	srcCountry=US	dstCountry=US'

curl -s -X POST "$API_BASE/v1/events/ingest" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"source_ip\": \"192.168.10.1\",
    \"raw_message\": \"$PA_LOG\"
  }" > /dev/null

echo "3. Ingesting Fortinet firewall traffic log..."

# Fortinet FortiGate key-value format log (allow action)
FG_LOG='date=2024-01-15 time=14:31:20 devname="FortiGate-01" devid="FG600E" logid="0000000013" type="traffic" subtype="forward" level="notice" vd="root" srcip=192.168.1.100 srcport=45678 srcintf="internal" dstip=8.8.8.8 dstport=53 dstintf="wan1" proto=17 action="accept" policyid=5 service="DNS" duration=2 sentbyte=64 rcvdbyte=128 sentpkt=1 rcvdpkt=1 user="bob@corp.com" srccountry="US" dstcountry="US"'

curl -s -X POST "$API_BASE/v1/events/ingest" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"source_ip\": \"192.168.10.2\",
    \"raw_message\": \"$FG_LOG\"
  }" > /dev/null

echo "4. Waiting for events to be processed..."
sleep 5

echo "5. Testing CIM normalization with unified queries..."

echo -e "\n${YELLOW}=== Test 1: Unified Network Traffic Query ===${NC}"
echo "This is the critical test - both vendors' data should appear in normalized CIM fields"

RESULT=$(curl -s "$API_BASE/v1/events/query" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT source_ip, dest_ip, protocol, src_port, dest_port, vendor, product, device_type FROM dev.events WHERE dest_ip = '\''8.8.8.8'\'' ORDER BY event_timestamp DESC LIMIT 10"
  }')

echo "Response: $RESULT"

if [[ $RESULT == *"10.20.105.24"* ]] && [[ $RESULT == *"192.168.1.100"* ]]; then
    echo -e "${GREEN}✓ SUCCESS: Both Palo Alto and Fortinet logs found in unified CIM query${NC}"
    UNIFIED_SUCCESS=true
else
    echo -e "${RED}✗ FAILED: Could not find both vendor logs in unified query${NC}"
    echo "Expected to find source IPs: 10.20.105.24 (Palo Alto), 192.168.1.100 (Fortinet)"
    UNIFIED_SUCCESS=false
fi

echo -e "\n${YELLOW}=== Test 2: User Activity Across Vendors ===${NC}"

USER_RESULT=$(curl -s "$API_BASE/v1/events/query" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT user, source_ip, vendor, action FROM dev.events WHERE user IS NOT NULL ORDER BY event_timestamp DESC LIMIT 10"
  }')

echo "User query result: $USER_RESULT"

if [[ $USER_RESULT == *"alice@corp.com"* ]] && [[ $USER_RESULT == *"bob@corp.com"* ]]; then
    echo -e "${GREEN}✓ User normalization working across vendors${NC}"
    USER_SUCCESS=true
else
    echo -e "${RED}✗ User normalization failed${NC}"
    USER_SUCCESS=false
fi

echo -e "\n${YELLOW}=== Test 3: Vendor Identification ===${NC}"

VENDOR_RESULT=$(curl -s "$API_BASE/v1/events/query" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT vendor, product, device_type, COUNT(*) as count FROM dev.events WHERE vendor IS NOT NULL GROUP BY vendor, product, device_type"
  }')

echo "Vendor identification result: $VENDOR_RESULT"

if [[ $VENDOR_RESULT == *"Palo Alto Networks"* ]] && [[ $VENDOR_RESULT == *"Fortinet"* ]]; then
    echo -e "${GREEN}✓ Vendor identification working correctly${NC}"
    VENDOR_SUCCESS=true
else
    echo -e "${RED}✗ Vendor identification failed${NC}"
    VENDOR_SUCCESS=false
fi

echo -e "\n${YELLOW}=== Test 4: Protocol Normalization ===${NC}"

PROTO_RESULT=$(curl -s "$API_BASE/v1/events/query" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT protocol, COUNT(*) as count FROM dev.events WHERE protocol IS NOT NULL GROUP BY protocol ORDER BY count DESC"
  }')

echo "Protocol normalization result: $PROTO_RESULT"

if [[ $PROTO_RESULT == *"UDP"* ]] || [[ $PROTO_RESULT == *"17"* ]]; then
    echo -e "${GREEN}✓ Protocol normalization working${NC}"
    PROTO_SUCCESS=true
else
    echo -e "${RED}✗ Protocol normalization failed${NC}"
    PROTO_SUCCESS=false
fi

echo -e "\n${YELLOW}=== Test 5: Traffic Statistics (Fortinet Only) ===${NC}"

STATS_RESULT=$(curl -s "$API_BASE/v1/events/query" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT bytes_in, bytes_out, packets_in, packets_out, duration FROM dev.events WHERE bytes_in IS NOT NULL OR bytes_out IS NOT NULL ORDER BY event_timestamp DESC LIMIT 5"
  }')

echo "Traffic statistics result: $STATS_RESULT"

if [[ $STATS_RESULT == *"128"* ]] && [[ $STATS_RESULT == *"64"* ]]; then
    echo -e "${GREEN}✓ Traffic statistics normalization working${NC}"
    STATS_SUCCESS=true
else
    echo -e "${RED}✗ Traffic statistics normalization failed${NC}"
    STATS_SUCCESS=false
fi

echo -e "\n${YELLOW}=== Final Test: Comprehensive CIM Cross-Vendor Query ===${NC}"
echo "Testing the key requirement: unified querying across vendor logs using CIM fields"

FINAL_RESULT=$(curl -s "$API_BASE/v1/events/query" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT source_ip, dest_ip, src_port, dest_port, protocol, user, vendor, product, action, device_type, app_name FROM dev.events WHERE dest_ip = '\''8.8.8.8'\'' ORDER BY event_timestamp DESC"
  }')

echo "Comprehensive cross-vendor query result:"
echo "$FINAL_RESULT"

# Check if both logs appear with correct CIM normalization
if [[ $FINAL_RESULT == *"10.20.105.24"* ]] && [[ $FINAL_RESULT == *"192.168.1.100"* ]] && [[ $FINAL_RESULT == *"alice@corp.com"* ]] && [[ $FINAL_RESULT == *"bob@corp.com"* ]]; then
    FINAL_SUCCESS=true
else
    FINAL_SUCCESS=false
fi

echo -e "\n${YELLOW}=== CIM Implementation Results Summary ===${NC}"

if [[ "$UNIFIED_SUCCESS" == "true" ]]; then
    echo -e "${GREEN}✓ Unified Network Traffic Query${NC}"
else
    echo -e "${RED}✗ Unified Network Traffic Query${NC}"
fi

if [[ "$USER_SUCCESS" == "true" ]]; then
    echo -e "${GREEN}✓ User Activity Normalization${NC}"
else
    echo -e "${RED}✗ User Activity Normalization${NC}"
fi

if [[ "$VENDOR_SUCCESS" == "true" ]]; then
    echo -e "${GREEN}✓ Vendor Identification${NC}"
else
    echo -e "${RED}✗ Vendor Identification${NC}"
fi

if [[ "$PROTO_SUCCESS" == "true" ]]; then
    echo -e "${GREEN}✓ Protocol Normalization${NC}"
else
    echo -e "${RED}✗ Protocol Normalization${NC}"
fi

if [[ "$STATS_SUCCESS" == "true" ]]; then
    echo -e "${GREEN}✓ Traffic Statistics${NC}"
else
    echo -e "${RED}✗ Traffic Statistics${NC}"
fi

if [[ "$FINAL_SUCCESS" == "true" ]]; then
    echo -e "${GREEN}✓ Cross-Vendor CIM Query${NC}"
else
    echo -e "${RED}✗ Cross-Vendor CIM Query${NC}"
fi

# Overall result
if [[ "$UNIFIED_SUCCESS" == "true" && "$USER_SUCCESS" == "true" && "$VENDOR_SUCCESS" == "true" && "$FINAL_SUCCESS" == "true" ]]; then
    echo -e "\n${GREEN}🎉 CIM IMPLEMENTATION SUCCESSFUL! 🎉${NC}"
    echo -e "${GREEN}✓ Vendor-neutral data model working correctly${NC}"
    echo -e "${GREEN}✓ Cross-vendor querying enabled${NC}"
    echo -e "${GREEN}✓ Data normalization successful${NC}"
    echo -e "${GREEN}✓ Requirements satisfied: Palo Alto and Fortinet logs can be queried with unified CIM fields${NC}"
    exit 0
else
    echo -e "\n${RED}❌ CIM IMPLEMENTATION FAILED${NC}"
    echo -e "${RED}✗ Cross-vendor querying not working as expected${NC}"
    echo -e "${RED}✗ Some CIM normalization features are not functioning properly${NC}"
    exit 1
fi 