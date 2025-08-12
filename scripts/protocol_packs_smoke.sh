#!/usr/bin/env bash
# protocol_packs_smoke.sh - Test protocol pack normalization
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART"

API_BASE="http://127.0.0.1:9999"
CH_CLIENT="clickhouse client"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[protocol]${NC} $1"
}

error() {
    echo -e "${RED}[protocol]${NC} $1"
}

# Test F5 BIG-IP syslog
test_f5() {
    log "Testing F5 BIG-IP normalization..."
    
    # Sample F5 syslog
    F5_LOG='<134>Jan 15 10:23:45 bigip1 tmm[12345]: Rule /Common/block_bad_ips : Client 192.168.1.100:54321 -> 10.0.0.50:443 was blocked'
    
    # Send via parse endpoint
    RESPONSE=$(curl -sS -X POST "$API_BASE/api/v2/parse" \
        -H 'Content-Type: application/json' \
        -d "{\"raw\": \"$F5_LOG\", \"parser_id\": \"f5_bigip\"}")
    
    echo "$RESPONSE" > "$ART/f5_parse_response.json"
    
    # Check normalized fields
    ACTION=$(echo "$RESPONSE" | jq -r '.normalized.action // ""')
    SRC_IP=$(echo "$RESPONSE" | jq -r '.normalized.source_ip // ""')
    DST_IP=$(echo "$RESPONSE" | jq -r '.normalized.destination_ip // ""')
    
    if [[ "$ACTION" == "blocked" && "$SRC_IP" == "192.168.1.100" && "$DST_IP" == "10.0.0.50" ]]; then
        log "✓ F5 normalization PASS"
        return 0
    else
        error "F5 normalization failed"
        return 1
    fi
}

# Test Palo Alto syslog
test_paloalto() {
    log "Testing Palo Alto normalization..."
    
    # Sample PAN syslog
    PAN_LOG='<14>Jan 15 10:23:45 PA-VM 1,2023/01/15 10:23:45,012345678901,TRAFFIC,end,2049,2023/01/15 10:23:45,10.1.1.100,8.8.8.8,0.0.0.0,0.0.0.0,allow-dns,,,dns,vsys1,trust,untrust,ethernet1/1,ethernet1/2,Forward,2023/01/15 10:23:45,12345,1,53,53,0,0,0x0,udp,allow,184,184,0,1,2023/01/15 10:23:40,0,any,0,123456789,0x0,10.0.0.0-10.255.255.255,8.8.8.8-8.8.8.8,0,1,0,policy-deny,0,0,0,0,,PA-VM,from-policy,,,0,,0,,N/A,0,0,0,0,1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d,0,0,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,0,2023/01/15 10:23:45,,'
    
    RESPONSE=$(curl -sS -X POST "$API_BASE/api/v2/parse" \
        -H 'Content-Type: application/json' \
        -d "{\"raw\": \"$PAN_LOG\", \"parser_id\": \"paloalto_traffic\"}")
    
    echo "$RESPONSE" > "$ART/paloalto_parse_response.json"
    
    ACTION=$(echo "$RESPONSE" | jq -r '.normalized.action // ""')
    SRC_IP=$(echo "$RESPONSE" | jq -r '.normalized.source_ip // ""')
    DST_IP=$(echo "$RESPONSE" | jq -r '.normalized.destination_ip // ""')
    
    if [[ "$ACTION" == "allow" && "$SRC_IP" == "10.1.1.100" && "$DST_IP" == "8.8.8.8" ]]; then
        log "✓ Palo Alto normalization PASS"
        return 0
    else
        error "Palo Alto normalization failed"
        return 1
    fi
}

# Test Fortinet syslog
test_fortinet() {
    log "Testing Fortinet normalization..."
    
    # Sample Fortinet syslog
    FORTI_LOG='<189>date=2023-01-15 time=10:23:45 devname="FG-100D" devid="FG100D123456" logid="0000000013" type="traffic" subtype="forward" level="notice" vd="root" eventtime=1673780625 srcip=172.16.1.50 srcport=45678 srcintf="port1" srcintfrole="lan" dstip=93.184.216.34 dstport=443 dstintf="port2" dstintfrole="wan" sessionid=123456 proto=6 action="accept" policyid=10 policytype="policy" service="HTTPS" trandisp="snat" transip=203.0.113.1 transport=45678 duration=120 sentbyte=5432 rcvdbyte=98765 sentpkt=45 rcvdpkt=123'
    
    RESPONSE=$(curl -sS -X POST "$API_BASE/api/v2/parse" \
        -H 'Content-Type: application/json' \
        -d "{\"raw\": \"$FORTI_LOG\", \"parser_id\": \"fortinet_traffic\"}")
    
    echo "$RESPONSE" > "$ART/fortinet_parse_response.json"
    
    ACTION=$(echo "$RESPONSE" | jq -r '.normalized.action // ""')
    SRC_IP=$(echo "$RESPONSE" | jq -r '.normalized.source_ip // ""')
    DST_IP=$(echo "$RESPONSE" | jq -r '.normalized.destination_ip // ""')
    
    if [[ "$ACTION" == "accept" && "$SRC_IP" == "172.16.1.50" && "$DST_IP" == "93.184.216.34" ]]; then
        log "✓ Fortinet normalization PASS"
        return 0
    else
        error "Fortinet normalization failed"
        return 1
    fi
}

# Test Cisco ASA syslog
test_cisco() {
    log "Testing Cisco ASA normalization..."
    
    # Sample Cisco ASA syslog
    CISCO_LOG='<166>Jan 15 2023 10:23:45: %ASA-6-302013: Built outbound TCP connection 123456 for outside:8.8.8.8/443 (8.8.8.8/443) to inside:10.1.1.100/54321 (203.0.113.1/54321)'
    
    RESPONSE=$(curl -sS -X POST "$API_BASE/api/v2/parse" \
        -H 'Content-Type: application/json' \
        -d "{\"raw\": \"$CISCO_LOG\", \"parser_id\": \"cisco_asa\"}")
    
    echo "$RESPONSE" > "$ART/cisco_parse_response.json"
    
    ACTION=$(echo "$RESPONSE" | jq -r '.normalized.action // ""')
    SRC_IP=$(echo "$RESPONSE" | jq -r '.normalized.source_ip // ""')
    DST_IP=$(echo "$RESPONSE" | jq -r '.normalized.destination_ip // ""')
    
    if [[ "$ACTION" == "built" && "$SRC_IP" == "10.1.1.100" && "$DST_IP" == "8.8.8.8" ]]; then
        log "✓ Cisco ASA normalization PASS"
        return 0
    else
        error "Cisco ASA normalization failed"
        return 1
    fi
}

# Test Zeek conn.log
test_zeek() {
    log "Testing Zeek normalization..."
    
    # Sample Zeek conn.log (tab-separated)
    ZEEK_LOG='1673780625.123456	CYqW7f4HHFgun8KQBh	10.0.0.100	54321	192.168.1.1	443	tcp	ssl	1.234567	1024	2048	SF	T	T	0	ShADadfF	15	2536	20	3456	(empty)'
    
    RESPONSE=$(curl -sS -X POST "$API_BASE/api/v2/parse" \
        -H 'Content-Type: application/json' \
        -d "{\"raw\": \"$ZEEK_LOG\", \"parser_id\": \"zeek_conn\"}")
    
    echo "$RESPONSE" > "$ART/zeek_parse_response.json"
    
    # For Zeek, action might be derived from conn_state
    ACTION=$(echo "$RESPONSE" | jq -r '.normalized.action // ""')
    SRC_IP=$(echo "$RESPONSE" | jq -r '.normalized.source_ip // ""')
    DST_IP=$(echo "$RESPONSE" | jq -r '.normalized.destination_ip // ""')
    
    if [[ "$SRC_IP" == "10.0.0.100" && "$DST_IP" == "192.168.1.1" ]]; then
        log "✓ Zeek normalization PASS (src/dst IPs correct)"
        return 0
    else
        error "Zeek normalization failed"
        return 1
    fi
}

# Main test execution
log "Starting protocol pack smoke tests..."

FAILED=0

# Run all tests
test_f5 || ((FAILED++))
test_paloalto || ((FAILED++))
test_fortinet || ((FAILED++))
test_cisco || ((FAILED++))
test_zeek || ((FAILED++))

# Summary
log "Protocol pack tests complete:"
log "  Total packs tested: 5"
log "  Failed: $FAILED"

if [ "$FAILED" -gt 0 ]; then
    error "RESULT: FAIL - $FAILED protocol packs failed normalization"
    exit 1
else
    log "RESULT: PASS - All protocol packs normalized correctly"
fi
