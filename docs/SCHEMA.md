# SIEM ParsedEvent Schema Documentation

## Overview

The `ParsedEvent` struct serves as the canonical representation of security events in our SIEM system. It follows industry standards including ECS (Elastic Common Schema), CIM (Common Information Model), and UDM (Unified Data Model) for field naming and organization.

## Design Principles

### 1. Canonical Field Names
All fields use standardized names based on industry standards:
- **ECS (Elastic Common Schema)**: Primary standard for field naming
- **CIM (Common Information Model)**: Splunk's data model conventions
- **UDM (Unified Data Model)**: Google Chronicle's unified schema

### 2. Type Safety
Each field uses appropriate Rust types:
- `String` for text fields
- `u16` for port numbers
- `u32` for process IDs
- `DateTime<Utc>` for timestamps
- `HashMap<String, Value>` for extensible fields

### 3. Extensibility
The `additional_fields` HashMap serves as a fallback bucket for:
- Custom fields specific to your organization
- Vendor-specific fields not covered by standards
- Temporary fields during schema evolution

### 4. Performance
Optimized for high-throughput SIEM operations:
- Efficient serialization/deserialization with serde
- Optional fields to minimize memory usage
- Structured field organization for fast access

## Field Categories

### Network Fields
| Field | Type | ECS Mapping | Description |
|-------|------|-------------|-------------|
| `source_ip` | `Option<String>` | `source.ip` | Source IP address |
| `destination_ip` | `Option<String>` | `destination.ip` | Destination IP address |
| `source_port` | `Option<u16>` | `source.port` | Source port number |
| `destination_port` | `Option<u16>` | `destination.port` | Destination port number |
| `protocol` | `Option<String>` | `network.protocol` | Network protocol (TCP, UDP, ICMP) |

### Identity Fields
| Field | Type | ECS Mapping | Description |
|-------|------|-------------|-------------|
| `user_name` | `Option<String>` | `user.name` | Username or user identifier |
| `host_name` | `Option<String>` | `host.name` | Host or computer name |

### Process Fields
| Field | Type | ECS Mapping | Description |
|-------|------|-------------|-------------|
| `process_name` | `Option<String>` | `process.name` | Process name or executable |
| `process_pid` | `Option<u32>` | `process.pid` | Process ID |

### Event Fields
| Field | Type | ECS Mapping | Description |
|-------|------|-------------|-------------|
| `timestamp` | `Option<DateTime<Utc>>` | `@timestamp` | Event timestamp in UTC |
| `event_action` | `Option<String>` | `event.action` | Event action or operation |
| `event_id` | `Option<String>` | `event.id` | Event identifier |
| `event_outcome` | `Option<String>` | `event.outcome` | Event outcome (success, failure) |

### Web Fields
| Field | Type | ECS Mapping | Description |
|-------|------|-------------|-------------|
| `http_response_status_code` | `Option<u16>` | `http.response.status_code` | HTTP response status code |
| `url_original` | `Option<String>` | `url.original` | Original URL |
| `http_method` | `Option<String>` | `http.request.method` | HTTP method (GET, POST, etc.) |
| `user_agent` | `Option<String>` | `user_agent.original` | User agent string |

### File Fields
| Field | Type | ECS Mapping | Description |
|-------|------|-------------|-------------|
| `file_name` | `Option<String>` | `file.name` | File name |
| `file_path` | `Option<String>` | `file.path` | File path |
| `file_hash_sha256` | `Option<String>` | `file.hash.sha256` | SHA256 file hash |

### Logging Fields
| Field | Type | ECS Mapping | Description |
|-------|------|-------------|-------------|
| `log_level` | `Option<String>` | `log.level` | Log level or severity |
| `message` | `Option<String>` | `message` | Log message |
| `facility` | `Option<String>` | `log.syslog.facility.name` | Syslog facility |

### Security Fields
| Field | Type | ECS Mapping | Description |
|-------|------|-------------|-------------|
| `rule_id` | `Option<String>` | `rule.id` | Security rule ID |
| `rule_name` | `Option<String>` | `rule.name` | Security rule name |
| `threat_name` | `Option<String>` | `threat.indicator.name` | Threat indicator name |

### Geographic Fields
| Field | Type | ECS Mapping | Description |
|-------|------|-------------|-------------|
| `source_country` | `Option<String>` | `source.geo.country_name` | Source country |
| `destination_country` | `Option<String>` | `destination.geo.country_name` | Destination country |

### Device Fields
| Field | Type | ECS Mapping | Description |
|-------|------|-------------|-------------|
| `device_vendor` | `Option<String>` | `observer.vendor` | Device vendor |
| `device_product` | `Option<String>` | `observer.product` | Device product |
| `device_version` | `Option<String>` | `observer.version` | Device version |

### Extensibility
| Field | Type | Description |
|-------|------|-------------|
| `additional_fields` | `HashMap<String, Value>` | Fallback bucket for unmapped fields |

## Usage Examples

### Creating a Network Event
```rust
use chrono::Utc;
use siem_schema_validator::ParsedEvent;

let mut event = ParsedEvent::with_timestamp(Utc::now());
event
    .set_source_ip("192.168.1.100")
    .set_destination_ip("10.0.0.50")
    .set_event_action("connection_established");

event.source_port = Some(54321);
event.destination_port = Some(443);
event.protocol = Some("TCP".to_string());
```

### Creating a Web Event
```rust
let mut event = ParsedEvent::new();
event.http_response_status_code = Some(404);
event.url_original = Some("https://example.com/admin".to_string());
event.http_method = Some("POST".to_string());
event.set_user_name("admin");
```

### Adding Custom Fields
```rust
let mut event = ParsedEvent::new();
event
    .add_field("custom_severity", 95)
    .add_field("analyst_notes", "Confirmed malicious activity")
    .add_field("blocked", true);
```

### JSON Serialization
```rust
// Serialize to JSON
let json = event.to_json()?;
let pretty_json = event.to_json_pretty()?;

// Deserialize from JSON
let event = ParsedEvent::from_json(&json)?;
```

## Event Type Detection

The `ParsedEvent` struct provides helper methods to identify event types:

```rust
// Check event types
if event.is_network_event() {
    println!("This is a network event");
}

if event.is_web_event() {
    println!("This is a web event");
}

if event.is_process_event() {
    println!("This is a process event");
}

// Check for timestamp
if event.has_timestamp() {
    println!("Event has a valid timestamp");
}
```

## Field Mapping Strategy

### Priority Order
1. **Canonical Fields**: Direct mapping to struct fields
2. **Additional Fields**: Unmapped fields go to `additional_fields` HashMap
3. **Type Conversion**: Automatic conversion where possible (strings to numbers)

### Alias Resolution
The SIEM system uses a comprehensive alias resolution system:
- Multiple aliases can map to the same canonical field
- Priority-based resolution prevents conflicts
- Case-insensitive matching for flexibility

## Validation and Testing

The schema includes comprehensive tests covering:

1. **Network Event Deserialization**: IP addresses, ports, protocols
2. **Web Event Deserialization**: HTTP status codes, URLs, user agents
3. **Process Event Deserialization**: Process names, PIDs, file hashes
4. **Security Event Handling**: Rules, threats, additional fields
5. **Complete Lifecycle**: Creation, modification, serialization, validation

## Best Practices

### Field Naming
- Use canonical field names when available
- Follow ECS conventions for new fields
- Use snake_case for custom fields
- Prefix vendor-specific fields (e.g., `cisco_`, `palo_alto_`)

### Type Usage
- Use appropriate types for data (u16 for ports, not strings)
- Store timestamps in UTC
- Use `additional_fields` for temporary or experimental fields

### Performance
- Minimize use of `additional_fields` for frequently accessed data
- Consider promoting common additional fields to canonical fields
- Use efficient serialization formats for high-volume scenarios

### Extensibility
- Add new canonical fields through schema evolution
- Maintain backward compatibility
- Document field deprecations and migrations

## Schema Evolution

When evolving the schema:

1. **Add new canonical fields** for commonly used additional fields
2. **Maintain backward compatibility** with existing field names
3. **Provide migration utilities** for schema updates
4. **Update documentation** and tests
5. **Coordinate with parsing and ingestion systems**

## Integration Points

### Parsers
Parsers should populate `ParsedEvent` fields using:
- Direct field assignment for canonical fields
- `add_field()` method for custom fields
- Proper type conversion and validation

### Storage Systems
Storage systems should:
- Index canonical fields for fast queries
- Store additional fields as flexible JSON
- Optimize for common query patterns

### Analytics
Analytics systems should:
- Prioritize canonical fields for standardized analysis
- Use additional fields for custom analytics
- Implement field promotion strategies

This schema provides a solid foundation for SIEM event processing while maintaining flexibility for future growth and customization.