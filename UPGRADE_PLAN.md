# SIEM Unstructured Log Ingestion Upgrade Plan

## Executive Summary

This document provides a comprehensive plan to upgrade the SIEM ingestion pipeline to handle **any log format** with **zero data loss**. The current system has critical schema mismatches and limited unstructured log support that leads to data rejection.

## Current State Analysis

### Identified Issues

1. **Schema Mismatch Crisis**
   - `siem_consumer` writes to full CIM schema (50+ fields)
   - `siem_clickhouse_ingestion` writes to simplified 7-field schema
   - Both target same ClickHouse instance → data inconsistency

2. **Unstructured Log Rejection**
   - Logs not matching `LogEvent` schema are rejected
   - No fallback for arbitrary formats (syslog, plain text, XML, etc.)
   - `transform_massive_log_gen_to_log_event` only handles specific format

3. **Data Loss Scenarios**
   - Malformed JSON → rejection
   - Unknown log formats → rejection
   - ClickHouse write failures → no retry
   - Parse errors → log discarded

## Upgrade Strategy

### Phase 1: Schema Unification (Priority 1)

#### 1.1 Fix `siem_clickhouse_ingestion` Schema

**File:** `siem_clickhouse_ingestion/src/clickhouse.rs`

```rust
// Current ClickHouseLogRow (BROKEN)
#[derive(Debug, Serialize)]
struct ClickHouseLogRow {
    tenant_id: String,
    timestamp: String,
    level: String,
    message: String,
    source: String,
    fields: String,  // ← All data crammed here
    ingestion_time: String,
}

// NEW: Full CIM Schema Alignment
#[derive(Debug, Serialize, Default)]
struct ClickHouseLogRow {
    // Core fields
    event_id: String,
    tenant_id: String,
    event_timestamp: DateTime<Utc>,
    ingestion_timestamp: DateTime<Utc>,
    raw_event: String,  // ← ALWAYS preserve original
    parsing_status: String,  // "success", "partial", "failed"
    parse_error_msg: Option<String>,
    
    // CIM Fields (all Optional for unstructured logs)
    source_ip: Option<String>,
    source_port: Option<u16>,
    destination_ip: Option<String>,
    destination_port: Option<u16>,
    protocol: Option<String>,
    event_type: Option<String>,
    severity: Option<String>,
    user_name: Option<String>,
    host_name: Option<String>,
    process_name: Option<String>,
    file_path: Option<String>,
    command_line: Option<String>,
    
    // Custom fields as JSON
    custom_fields: String,  // JSON object for extra data
    
    // ... (include all CIM fields from database_setup.sql)
}
```

#### 1.2 Update Table Creation

```rust
// Update ensure_table_exists() to match database_setup.sql
const CREATE_EVENTS_TABLE: &str = r#"
    CREATE TABLE IF NOT EXISTS events (
        event_id String,
        tenant_id String,
        event_timestamp DateTime64(3),
        ingestion_timestamp DateTime64(3) DEFAULT now64(3),
        raw_event String,
        parsing_status LowCardinality(String),
        parse_error_msg Nullable(String),
        
        -- CIM Fields
        source_ip Nullable(IPv4),
        source_port Nullable(UInt16),
        destination_ip Nullable(IPv4),
        destination_port Nullable(UInt16),
        protocol Nullable(String),
        event_type Nullable(String),
        severity Nullable(String),
        user_name Nullable(String),
        host_name Nullable(String),
        process_name Nullable(String),
        file_path Nullable(String),
        command_line Nullable(String),
        
        custom_fields String DEFAULT '{}'
    ) ENGINE = MergeTree()
    ORDER BY (tenant_id, event_timestamp)
    PARTITION BY toYYYYMM(event_timestamp)
    SETTINGS index_granularity = 8192
"#;
```

### Phase 2: Universal Log Acceptance (Priority 1)

#### 2.1 Enhanced LogEvent Parsing

**File:** `siem_clickhouse_ingestion/src/receiver.rs`

```rust
impl LogEvent {
    /// NEW: Create LogEvent from any unstructured data
    pub fn from_raw_unstructured(raw_data: &str, tenant_id: &str) -> Self {
        let event_id = uuid::Uuid::new_v4().to_string();
        let timestamp = Utc::now();
        
        // Attempt intelligent parsing
        let (parsed_fields, parsing_status, parse_error) = 
            Self::attempt_intelligent_parsing(raw_data);
        
        LogEvent {
            event_id,
            tenant_id: tenant_id.to_string(),
            timestamp,
            raw_event: raw_data.to_string(),  // ← ALWAYS preserve
            parsing_status,
            parse_error_msg: parse_error,
            
            // Extracted fields (if any)
            level: parsed_fields.get("level").cloned(),
            message: parsed_fields.get("message")
                .cloned()
                .unwrap_or_else(|| raw_data.to_string()),
            source: parsed_fields.get("source").cloned(),
            
            // CIM fields (extracted if possible)
            source_ip: Self::extract_ip(&parsed_fields, "source_ip"),
            user_name: parsed_fields.get("user").cloned(),
            host_name: parsed_fields.get("host").cloned(),
            
            // Store remaining fields as JSON
            custom_fields: serde_json::to_string(&parsed_fields)
                .unwrap_or_else(|_| "{}".to_string()),
        }
    }
    
    fn attempt_intelligent_parsing(raw_data: &str) -> (HashMap<String, String>, String, Option<String>) {
        // Try JSON first
        if let Ok(json_value) = serde_json::from_str::<Value>(raw_data) {
            return Self::parse_json_fields(json_value);
        }
        
        // Try syslog format
        if let Some(syslog_fields) = Self::parse_syslog_format(raw_data) {
            return (syslog_fields, "partial".to_string(), None);
        }
        
        // Try key=value format
        if let Some(kv_fields) = Self::parse_key_value_format(raw_data) {
            return (kv_fields, "partial".to_string(), None);
        }
        
        // Fallback: treat as plain message
        let mut fields = HashMap::new();
        fields.insert("message".to_string(), raw_data.to_string());
        
        (fields, "failed".to_string(), Some("Unstructured format".to_string()))
    }
}
```

#### 2.2 Zero-Rejection Ingestion

```rust
// Update ingest_logs function for universal acceptance
pub async fn ingest_logs(
    State(state): State<AppState>,
    Path(tenant_id): Path<String>,
    Json(request): Json<LogIngestionRequest>,
) -> Result<Json<LogIngestionResponse>, StatusCode> {
    let mut accepted = 0;
    let mut rejected = 0;  // Should always be 0 now!
    let mut errors = Vec::new();
    
    for log_value in request.logs {
        let log_event = match log_value {
            // Try structured parsing first
            Value::Object(_) => {
                match serde_json::from_value::<LogEvent>(log_value.clone()) {
                    Ok(event) => {
                        event.parsing_status = "success".to_string();
                        event
                    },
                    Err(_) => {
                        // Fallback: convert to unstructured
                        let raw_json = serde_json::to_string(&log_value)
                            .unwrap_or_else(|_| "Invalid JSON".to_string());
                        LogEvent::from_raw_unstructured(&raw_json, &tenant_id)
                    }
                }
            },
            // Handle any other value type
            _ => {
                let raw_str = match log_value {
                    Value::String(s) => s,
                    _ => serde_json::to_string(&log_value)
                        .unwrap_or_else(|_| "Unparseable value".to_string()),
                };
                LogEvent::from_raw_unstructured(&raw_str, &tenant_id)
            }
        };
        
        // Route log (with retry mechanism)
        match state.log_router.route_log_with_retry(log_event, 3).await {
            Ok(_) => {
                accepted += 1;
                state.metrics.increment_accepted_logs();
            },
            Err(e) => {
                // Log routing failed - this is infrastructure error, not data error
                errors.push(format!("Routing failed: {}", e));
                state.metrics.increment_infrastructure_errors();
                
                // TODO: Store in dead letter queue for retry
            }
        }
    }
    
    Ok(Json(LogIngestionResponse {
        accepted,
        rejected,  // Always 0 - we never reject logs
        errors,
    }))
}
```

### Phase 3: Robust Error Handling (Priority 2)

#### 3.1 Retry Mechanisms

```rust
// Add to LogRouter
impl LogRouter {
    pub async fn route_log_with_retry(
        &self, 
        log_event: LogEvent, 
        max_retries: u32
    ) -> Result<(), LogRoutingError> {
        let mut attempt = 0;
        let mut last_error = None;
        
        while attempt <= max_retries {
            match self.route_log(log_event.clone()).await {
                Ok(_) => return Ok(()),
                Err(e) => {
                    last_error = Some(e);
                    attempt += 1;
                    
                    if attempt <= max_retries {
                        // Exponential backoff
                        let delay = Duration::from_millis(100 * 2_u64.pow(attempt));
                        tokio::time::sleep(delay).await;
                    }
                }
            }
        }
        
        // All retries failed - store in dead letter queue
        self.store_in_dead_letter_queue(log_event).await?;
        Err(last_error.unwrap())
    }
}
```

#### 3.2 Dead Letter Queue

```rust
// Add dead letter queue for failed logs
#[derive(Debug, Serialize)]
struct DeadLetterEntry {
    original_log: LogEvent,
    failure_reason: String,
    retry_count: u32,
    first_attempt: DateTime<Utc>,
    last_attempt: DateTime<Utc>,
}

impl LogRouter {
    async fn store_in_dead_letter_queue(
        &self, 
        log_event: LogEvent
    ) -> Result<(), LogRoutingError> {
        // Store in Redis/file/separate ClickHouse table for manual review
        let dead_letter = DeadLetterEntry {
            original_log: log_event,
            failure_reason: "Max retries exceeded".to_string(),
            retry_count: 3,
            first_attempt: Utc::now(),
            last_attempt: Utc::now(),
        };
        
        // TODO: Implement storage mechanism
        Ok(())
    }
}
```

## Testing Strategy

### Automated Test Cases

1. **Format Coverage Tests**
   - JSON (valid/malformed)
   - Syslog (RFC3164/RFC5424)
   - Plain text
   - XML
   - Key-value pairs
   - Binary/encoded data
   - Empty/null values

2. **Edge Case Tests**
   - Extremely large payloads (>1MB)
   - High-frequency ingestion (1000+ EPS)
   - Network failures during ingestion
   - ClickHouse unavailability
   - Malicious/crafted inputs

3. **Data Integrity Tests**
   - Original data preservation in `raw_event`
   - Correct `parsing_status` assignment
   - Error message accuracy
   - Field extraction validation

### Success Criteria

- ✅ **100% Ingestion Success**: No logs rejected due to format
- ✅ **Data Preservation**: All original data in `raw_event`
- ✅ **Error Tracking**: Parse failures logged but not blocking
- ✅ **Performance**: Maintain 100+ EPS throughput
- ✅ **Searchability**: All logs queryable in ClickHouse

## Implementation Timeline

### Week 1: Schema Unification
- [ ] Update `ClickHouseLogRow` struct
- [ ] Modify `ensure_table_exists()` function
- [ ] Test schema migration
- [ ] Verify compatibility with existing data

### Week 2: Universal Log Acceptance
- [ ] Implement `LogEvent::from_raw_unstructured()`
- [ ] Add intelligent parsing methods
- [ ] Update `ingest_logs()` function
- [ ] Add comprehensive unit tests

### Week 3: Error Handling & Resilience
- [ ] Implement retry mechanisms
- [ ] Add dead letter queue
- [ ] Enhanced monitoring and metrics
- [ ] Integration testing

### Week 4: Testing & Validation
- [ ] Run diagnostic script
- [ ] Performance testing
- [ ] Security testing
- [ ] Production deployment

## Monitoring & Observability

### Key Metrics

```rust
// Enhanced metrics
struct IngestionMetrics {
    // Success metrics
    logs_accepted_total: Counter,
    logs_parsed_successfully: Counter,
    logs_parsed_partially: Counter,
    logs_parsing_failed: Counter,
    
    // Error metrics
    infrastructure_errors: Counter,
    dead_letter_queue_size: Gauge,
    retry_attempts_total: Counter,
    
    // Performance metrics
    ingestion_duration: Histogram,
    parsing_duration: Histogram,
    clickhouse_write_duration: Histogram,
}
```

### Alerts

- Dead letter queue size > 100
- Infrastructure error rate > 1%
- Parsing failure rate > 10%
- Ingestion latency > 1 second

## Risk Mitigation

### Rollback Plan

1. **Schema Changes**: Use ClickHouse `ALTER TABLE` for safe column additions
2. **Code Deployment**: Blue-green deployment with traffic switching
3. **Data Backup**: Full ClickHouse backup before schema changes
4. **Monitoring**: Real-time dashboards during rollout

### Security Considerations

- Input validation for all log formats
- Rate limiting per tenant
- Resource limits for large payloads
- Audit logging for all ingestion attempts

## Success Validation

After implementation, run the diagnostic script:

```bash
python3 diagnose_unstructured_logs.py
```

Expected results:
- ✅ All test cases: 100% success rate
- ✅ Zero data loss across all formats
- ✅ All logs searchable in ClickHouse
- ✅ Proper error tracking and status

---

**This upgrade plan ensures that any log—structured or unstructured—will be safely ingested into ClickHouse with complete data preservation and comprehensive error tracking.**