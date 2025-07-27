# Phase 15.1: Network & Web Resilience Content Pack

This content pack provides comprehensive OOTB content for network security and web application firewall log sources.

## Supported Vendors

### Firewalls & Network Security
- **Palo Alto Networks** - PAN-OS firewalls, Panorama
- **Fortinet** - FortiGate firewalls, FortiManager
- **Cisco** - Firepower Threat Defense (FTD), ASA
- **SonicWall** - TZ, NSA, and SuperMassive series

### Web Application Firewalls
- **F5 ASM** - Application Security Manager
- **Imperva** - SecureSphere WAF
- **Cloudflare** - Web Application Firewall
- **AWS WAF** - Web Application Firewall

### Network Monitoring
- **Wireshark/Tshark** - Network packet analysis
- **Zeek/Bro** - Network security monitoring

## Content Components

### Parsers
- Enhanced Palo Alto Networks parser with full CIM mapping
- Fortinet FortiGate parser for traffic and threat logs
- Cisco FTD parser for connection and intrusion events
- F5 ASM parser for web application security events
- SonicWall parser for firewall and IPS events
- Imperva WAF parser for web security events
- Cloudflare WAF parser for edge security events
- AWS WAF parser for cloud web security events
- Zeek parser for network monitoring events

### Detection Rules
- Network reconnaissance detection
- Lateral movement identification
- Data exfiltration patterns
- Web application attacks (OWASP Top 10)
- DDoS attack detection
- Suspicious outbound connections
- Firewall policy violations

### Dashboards
- Network Security Overview
- Firewall Traffic Analysis
- Web Application Security
- Threat Intelligence Integration
- Geographic Traffic Analysis
- Top Talkers and Protocols

### Taxonomy Mappings
- Network traffic normalization
- Security event categorization
- Threat severity mapping
- Geographic enrichment
- Asset context integration

## Implementation Status

- [x] Enhanced Palo Alto Networks parser
- [ ] Fortinet FortiGate parser
- [ ] Cisco FTD parser
- [ ] F5 ASM parser
- [ ] SonicWall parser
- [ ] Imperva WAF parser
- [ ] Cloudflare WAF parser
- [ ] AWS WAF parser
- [ ] Zeek parser
- [ ] Detection rules (2-3 per vendor)
- [ ] Dashboards (1 per major vendor)
- [ ] Unit tests (100% coverage)