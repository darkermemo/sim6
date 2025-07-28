# Dynamic Per-Source Alias Overrides

This document describes the new dynamic per-source alias override system that allows administrators to define field mappings specific to individual log sources.

## Overview

The alias override system extends the existing field mapping capabilities by adding a third resolution type: **Source-Specific** overrides. This allows for fine-grained control over field mappings on a per-source basis, which is essential for handling diverse log formats from different systems.

### Resolution Priority

Field resolution now follows this priority order (highest to lowest):

1. **Source-Specific** - Overrides specific to a particular log source
2. **Parser-Specific** - Overrides specific to a parser type
3. **Global** - Default mappings that apply to all sources

Within each resolution type, mappings with higher priority values take precedence.

## Configuration

### Static Configuration File

Source-specific overrides can be defined in `config/source_alias_overrides.yaml`:

```yaml
source_overrides:
  fortinet-fw-01:
    client_ip:
      canonical_field: "source.ip"
      priority: 100
    server_ip:
      canonical_field: "destination.ip"
      priority: 100
  
  zeek-sensor-02:
    orig_h:
      canonical_field: "source.ip"
      priority: 90
    resp_h:
      canonical_field: "destination.ip"
      priority: 90
  
  windows-dc-01:
    SubjectUserName:
      canonical_field: "user.name"
      priority: 95
    TargetUserName:
      canonical_field: "user.target"
      priority: 95
```

### Dynamic API Management

The system provides REST API endpoints for dynamic management of source-specific overrides:

#### Get All Source Overrides
```bash
GET /api/v1/alias/overrides
Authorization: Bearer <admin_token>
```

#### Add/Update Source Override
```bash
POST /api/v1/alias/override
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "source_name": "firewall-01",
  "field_alias": "client_ip",
  "canonical_field": "source.ip"
}
```

#### Delete Source Override
```bash
DELETE /api/v1/alias/override
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "source_name": "firewall-01",
  "field_alias": "client_ip"
}
```

#### Reload Configuration
```bash
POST /api/v1/alias/reload
Authorization: Bearer <admin_token>
```

## Implementation Details

### Core Components

1. **CanonicalResolver** - Enhanced with source-specific override support
2. **ResolutionType** - Extended with `SourceSpecific` variant
3. **Admin API Handlers** - New endpoints for override management
4. **YAML Configuration** - Persistent storage for overrides

### Key Features

- **Dynamic Updates**: Overrides can be added, modified, or removed at runtime
- **Persistent Storage**: Changes are automatically saved to YAML configuration
- **Priority-Based Resolution**: Conflicts are resolved using priority values
- **Source Context**: Resolution considers the specific log source
- **Comprehensive Testing**: Full test coverage for all override scenarios

### Resolution Process

1. **Source-Specific Lookup**: Check for source-specific overrides first
2. **Parser-Specific Fallback**: If no source override, check parser-specific mappings
3. **Global Fallback**: Finally, check global mappings
4. **Priority Resolution**: Within each type, higher priority wins
5. **Case-Insensitive Matching**: All field name comparisons are case-insensitive

## Usage Examples

### Scenario 1: Firewall with Custom Fields

A Fortinet firewall uses non-standard field names:

```bash
# Add override for source IP
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"source_name": "fortinet-fw-01", "field_alias": "srcip", "canonical_field": "source.ip"}' \
     http://localhost:8080/api/v1/alias/override

# Add override for destination IP
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"source_name": "fortinet-fw-01", "field_alias": "dstip", "canonical_field": "destination.ip"}' \
     http://localhost:8080/api/v1/alias/override
```

### Scenario 2: Windows Event Log Customization

Customize Windows event log field mappings:

```bash
# Override for specific domain controller
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"source_name": "dc-01", "field_alias": "SubjectUserName", "canonical_field": "user.name"}' \
     http://localhost:8080/api/v1/alias/override
```

### Scenario 3: Bulk Configuration via YAML

For large-scale deployments, edit `config/source_alias_overrides.yaml` directly:

```yaml
source_overrides:
  # Production firewalls
  fw-prod-01:
    src: {canonical_field: "source.ip", priority: 100}
    dst: {canonical_field: "destination.ip", priority: 100}
  
  fw-prod-02:
    source_addr: {canonical_field: "source.ip", priority: 100}
    dest_addr: {canonical_field: "destination.ip", priority: 100}
  
  # Development environment
  fw-dev-01:
    client: {canonical_field: "source.ip", priority: 90}
    server: {canonical_field: "destination.ip", priority: 90}
```

Then reload the configuration:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://localhost:8080/api/v1/alias/reload
```

## Testing

Run the comprehensive test suite:

```bash
# Test the parser component
cd siem_parser
cargo test context_aware_resolver

# Test the API endpoints
./test_alias_overrides.sh
```

## Security Considerations

- All override management endpoints require **Admin** role authorization
- Configuration changes are logged for audit purposes
- YAML files should have appropriate file system permissions
- API tokens should be rotated regularly

## Performance Impact

- Source-specific lookups add minimal overhead to field resolution
- In-memory hash maps provide O(1) lookup performance
- YAML file I/O only occurs during configuration changes
- No impact on high-throughput log processing

## Troubleshooting

### Common Issues

1. **Override Not Applied**: Check source name matches exactly (case-sensitive)
2. **Priority Conflicts**: Higher priority values take precedence
3. **YAML Syntax Errors**: Validate YAML format before reloading
4. **Permission Denied**: Ensure admin role and valid JWT token

### Debug Information

Use the debug resolution endpoint to troubleshoot field mappings:

```bash
# Debug field resolution for specific source
curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8080/api/v1/fields/debug?field=srcip&source=fortinet-fw-01"
```

## Migration Guide

Existing installations will continue to work without changes. To enable source-specific overrides:

1. Update to the latest version
2. Create `config/source_alias_overrides.yaml` if needed
3. Use the API endpoints to add source-specific mappings
4. Test thoroughly in a development environment first

The system is fully backward compatible with existing global and parser-specific configurations.