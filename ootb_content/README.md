# OOTB Content Packs

This directory contains pre-packaged content for common enterprise log sources, organized by category.

## Structure

```
ootb_content/
├── 15.1_network_web_resilience/     # Palo Alto, Fortinet, Cisco FTD, F5 ASM
├── 15.2_remote_access_dns/          # Pulse Secure, GlobalProtect, Cisco ASA, Infoblox
├── 15.3_identity_mail_endpoint/     # Windows Event Log, Azure AD, M365 Defender, Symantec
├── 15.4_infrastructure_cloud/       # VMware, NGINX, Apache, Google Cloud Audit
└── shared/                          # Common utilities and templates
```

## Content Pack Components

Each content pack includes:

1. **Parsers** - Vendor-specific parsers that normalize data to CIM
2. **Taxonomy Mappings** - Default field mappings for normalized events
3. **Detection Rules** - High-value Sigma and Stateful rules
4. **Dashboards** - Pre-built visualization dashboards
5. **Tests** - 100% unit test coverage for all components

## Implementation Status

- [ ] 15.1: Network & Web Resilience
- [ ] 15.2: Remote Access & DNS
- [ ] 15.3: Identity, Mail & Endpoint
- [ ] 15.4: Infrastructure & Cloud