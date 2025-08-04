# Backend Contract Documentation - Log Activities API

## 1. Search Events Endpoint

### Endpoint: `POST /api/v1/events/search`

#### Request Structure (`SearchRequest`)

| Field | Type | Description | Required | snake_case Backend |
|-------|------|-------------|----------|-------------------|
| query | `Option<String>` | Search query string (supports full-text and regex) | No | query |
| time_range | `Option<TimeRange>` | Time range filter | No | time_range |
| filters | `Option<HashMap<String, FilterValue>>` | Field-specific filters | No | filters |
| pagination | `Option<Pagination>` | Pagination settings | No | pagination |
| sort | `Option<Vec<SortField>>` | Sorting configuration | No | sort |
| fields | `Option<Vec<String>>` | Fields to include in response | No | fields |
| options | `Option<SearchOptions>` | Search options and behavior | No | options |
| tenant_id | `Option<String>` | Tenant ID for multi-tenant isolation | No | tenant_id |
| aggregations | `Option<HashMap<String, AggregationRequest>>` | Aggregation requests | No | aggregations |

#### TimeRange Structure

| Field | Type | Description | Required | snake_case Backend |
|-------|------|-------------|----------|-------------------|
| start | `DateTime<Utc>` | Start time (inclusive) | Yes | start |
| end | `DateTime<Utc>` | End time (exclusive) | Yes | end |
| timezone | `Option<String>` | Time zone for display | No | timezone |

#### Pagination Structure

| Field | Type | Description | Required | snake_case Backend |
|-------|------|-------------|----------|-------------------|
| page | `u32` | Page number (0-based) | Yes | page |
| size | `u32` | Page size | Yes | size |
| cursor | `Option<String>` | Cursor for pagination | No | cursor |
| include_total | `bool` | Include total count | Yes | include_total |

#### Response Structure (`SearchEventsResponse`)

| Field | Type | Description | snake_case Backend |
|-------|------|-------------|-------------------|
| events | `Vec<EventDetailResponse>` | Array of events | events |
| total | `usize` | Total number of events | total |
| status | `String` | Response status | status |

#### EventDetailResponse Structure

| Field | Type | Description | snake_case Backend | camelCase Frontend |
|-------|------|-------------|-------------------|-------------------|
| id | `String` | Event ID | id | id |
| timestamp | `String` | Event timestamp (RFC3339) | timestamp | timestamp |
| source | `String` | Source identifier | source | source |
| source_type | `String` | Type of source | source_type | sourceType |
| severity | `String` | Event severity | severity | severity |
| facility | `String` | Log facility | facility | facility |
| hostname | `String` | Hostname | hostname | hostname |
| process | `String` | Process name | process | process |
| message | `String` | Event message | message | message |
| raw_message | `String` | Raw event message | raw_message | rawMessage |
| source_ip | `String` | Source IP address | source_ip | sourceIp |
| source_port | `i32` | Source port | source_port | sourcePort |
| protocol | `String` | Network protocol | protocol | protocol |
| tags | `Vec<String>` | Event tags | tags | tags |
| fields | `HashMap<String, serde_json::Value>` | Custom fields | fields | fields |
| processing_stage | `String` | Processing stage | processing_stage | processingStage |
| created_at | `String` | Creation timestamp | created_at | createdAt |
| updated_at | `String` | Update timestamp | updated_at | updatedAt |

## 2. Stream Events Endpoint

### Endpoint: `GET /api/v1/events/stream`

#### Query Parameters (`EventFilters`)

| Field | Type | Description | Required | snake_case Backend |
|-------|------|-------------|----------|-------------------|
| page | `Option<u32>` | Page number | No | page |
| limit | `Option<u32>` | Limit per page | No | limit |
| search | `Option<String>` | Search term | No | search |
| severity | `Option<String>` | Severity filter | No | severity |
| source_type | `Option<String>` | Source type filter | No | source_type |
| start_time | `Option<u32>` | Start timestamp (Unix) | No | start_time |
| end_time | `Option<u32>` | End timestamp (Unix) | No | end_time |
| tenant_id | `Option<String>` | Tenant ID | No | tenant_id |

#### SSE Response Format

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: event
data: {"event_id": "...", "timestamp": "...", ...}

event: heartbeat
data: {"type": "heartbeat", "timestamp": "..."}

event: error
data: {"error": "..."}
```

#### RedisEventFrame Structure (SSE Payload)

| Field | Type | Description | snake_case Backend | camelCase Frontend |
|-------|------|-------------|-------------------|-------------------|
| event_type | `String` | Type of event | event_type | eventType |
| event_data | `EventDetailResponse` | Event data | event_data | eventData |
| stream_id | `String` | Stream identifier | stream_id | streamId |
| timestamp | `DateTime<Utc>` | Stream timestamp | timestamp | timestamp |

## 3. ClickHouse Schema Alignment

### LogEvent Structure (ClickHouse → Rust)

| ClickHouse Column | Rust Field | Type | Description |
|------------------|------------|------|-------------|
| event_id | event_id | String | Unique event identifier |
| tenant_id | tenant_id | String | Tenant identifier |
| event_timestamp | event_timestamp | DateTime<Utc> | Event timestamp |
| source_ip | source_ip | String | Source IP address |
| source_type | source_type | String | Source type |
| raw_event | raw_event | String | Raw event data |
| event_category | event_category | String | Event category |
| event_outcome | event_outcome | String | Event outcome |
| event_action | event_action | String | Event action |
| dest_ip | dest_ip | Option<String> | Destination IP |
| src_port | src_port | Option<u16> | Source port |
| dest_port | dest_port | Option<u16> | Destination port |
| protocol | protocol | Option<String> | Network protocol |
| severity | severity | Option<String> | Event severity |
| message | message | Option<String> | Event message |
| user_name | user_name | Option<String> | Username |
| process_name | process_name | Option<String> | Process name |
| file_path | file_path | Option<String> | File path |
| command_line | command_line | Option<String> | Command line |
| tags | tags | Option<String> | Event tags (JSON) |
| custom_fields | custom_fields | Option<HashMap<String, String>> | Custom fields |
| ingestion_timestamp | ingestion_timestamp | DateTime<Utc> | Ingestion timestamp |

## 4. SQL Query Template

```sql
SELECT * FROM events_{tenant_id}
WHERE {filter_clause}
ORDER BY event_timestamp DESC
LIMIT {limit} OFFSET {offset}
```

### Filter Clause Examples

- Time range: `event_timestamp >= toDateTime('{start}') AND event_timestamp < toDateTime('{end}')`
- Severity: `severity = '{severity}'`
- Source type: `source_type = '{source_type}'`
- Search: `(message LIKE '%{query}%' OR raw_event LIKE '%{query}%')`
- Source IP: `source_ip = '{source_ip}'`

## 5. Error Handling

### ApiError Types

| Error Type | HTTP Status | Description |
|------------|-------------|-------------|
| Unauthorized | 401 | Invalid or missing JWT token |
| BadRequest | 400 | Invalid request parameters |
| InternalServerError | 500 | Database or internal error |
| NotFound | 404 | Resource not found |

## 6. Authentication

### JWT Token Requirements

- Header: `Authorization: Bearer <token>`
- Claims: `tenant_id`, `user_id`, `exp`, `iat`
- Validation: Token signature and expiration

## 7. Rate Limiting & Performance

### Limits

- Max page size: 1000 events
- Default page size: 100 events
- Query timeout: 30 seconds
- SSE connection timeout: 5 minutes

### Performance Considerations

- ClickHouse partitioning by `toYYYYMM(event_timestamp)`
- Primary key: `(tenant_id, event_timestamp)`
- Indexes on: `source_ip`, `source_type`, `severity`
- Redis stream trimming: MAXLEN ~100000