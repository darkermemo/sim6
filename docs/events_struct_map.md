# Current Events Struct Mapping

## Overview
This document maps the current ClickHouse events table schema to the corresponding Rust structs found in the codebase.

## Current Events Table DDL (from README.md)
```sql
CREATE TABLE IF NOT EXISTS events (
    event_id String,
    event_timestamp DateTime64(3),
    tenant_id String,
    event_category String,
    event_action String,
    event_outcome Nullable(String),
    source_ip Nullable(String),
    destination_ip Nullable(String),
    user_id Nullable(String),
    user_name Nullable(String),
    severity Nullable(String),
    message Nullable(String),
    raw_event String,
    metadata String,
    created_at DateTime64(3) DEFAULT now64()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_timestamp)
ORDER BY (tenant_id, event_timestamp, event_category)
```

## Rust Struct Mappings

### LogEventRow (src/database.rs)
**Purpose**: ClickHouse row structure for log events (used for deserialization)

| Field | Rust Type | ClickHouse Type | Serde Rename | Notes |
|-------|-----------|-----------------|--------------|-------|
| timestamp | DateTime<Utc> | DateTime64(3) | - | Maps to event_timestamp |
| event_id | Uuid | String | - | UUID type in Rust |
| level | Option<String> | Nullable(String) | - | Maps to severity |
| message | String | String | - | Direct mapping |
| source | Option<String> | Nullable(String) | - | Additional field |
| source_ip | Option<String> | Nullable(String) | - | Direct mapping |
| destination_ip | Option<String> | Nullable(String) | - | Direct mapping |
| user_id | Option<String> | Nullable(String) | - | Direct mapping |
| session_id | Option<String> | - | - | Additional field not in events table |
| event_type | Option<String> | String | - | Maps to event_category |
| severity | Option<String> | Nullable(String) | - | Direct mapping |
| tags | Option<Vec<String>> | - | - | Additional field not in events table |
| fields | Option<HashMap<String, String>> | - | - | Additional field not in events table |
| tenant_id | Option<String> | String | - | Direct mapping |
| detections | Option<Vec<(String, String, String, f64, Vec<String>)>> | - | - | Additional field not in events table |

### LogEvent (src/dto.rs - referenced in database.rs)
**Purpose**: API response structure for log events

*Note: This struct is referenced but definition needs to be located in dto.rs or similar files*

## Schema Discrepancies

### Missing in Current Events Table
- `session_id` (present in LogEventRow)
- `tags` (present in LogEventRow)
- `fields` (present in LogEventRow)
- `detections` (present in LogEventRow)

### Missing in LogEventRow
- `event_action` (present in events table)
- `event_outcome` (present in events table)
- `user_name` (present in events table)
- `raw_event` (present in events table)
- `metadata` (present in events table)
- `created_at` (present in events table)

## Recommendations for EventsV2
1. Align Rust structs with actual ClickHouse schema
2. Add missing fields from both sides
3. Implement proper serde rename tags for field mapping
4. Consider separate structs for ingestion vs. query responses