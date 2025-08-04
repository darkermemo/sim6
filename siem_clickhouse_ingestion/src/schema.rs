//! Schema definitions for log events and validation
//! Provides canonical log event structure and validation logic

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    time::{SystemTime, UNIX_EPOCH},
};
use tracing::{debug, warn};
use uuid::Uuid;
use regex::Regex;

/// Canonical log event structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEvent {
    /// Unique event identifier
    pub event_id: Option<String>,
    
    /// Tenant identifier
    pub tenant_id: String,
    
    /// Original raw log data
    pub raw_event: Option<String>,
    
    /// Parsing status: "structured", "parsed", "raw", "failed"
    pub parsing_status: Option<String>,
    
    /// Parse error message if parsing failed
    pub parse_error_msg: Option<String>,
    
    /// Event timestamp
    #[serde(with = "timestamp_serde")]
    pub timestamp: SystemTime,
    
    /// Log level (INFO, WARN, ERROR, DEBUG, TRACE)
    pub level: String,
    
    /// Log message
    pub message: String,
    
    /// Source of the log (application, service, etc.)
    pub source: Option<String>,
    
    /// Additional structured fields
    pub fields: HashMap<String, serde_json::Value>,
}

/// Raw log event from HTTP request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawLogEvent {
    /// Optional tenant ID (can be inferred from headers/auth)
    pub tenant_id: Option<String>,
    
    /// Timestamp as string, number, or ISO format
    pub timestamp: Option<serde_json::Value>,
    
    /// Log level
    pub level: Option<String>,
    
    /// Log message
    pub message: String,
    
    /// Source identifier
    pub source: Option<String>,
    
    /// Additional fields
    #[serde(flatten)]
    pub fields: HashMap<String, serde_json::Value>,
}

/// Batch of log events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogBatch {
    /// Events in the batch
    pub events: Vec<RawLogEvent>,
    
    /// Batch metadata
    pub metadata: Option<BatchMetadata>,
}

/// Batch metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchMetadata {
    /// Batch ID
    pub batch_id: Option<String>,
    
    /// Source system
    pub source_system: Option<String>,
    
    /// Batch timestamp
    pub batch_timestamp: Option<String>,
    
    /// Compression used
    pub compression: Option<String>,
}

/// Log validation error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
    pub value: Option<serde_json::Value>,
}

/// Log validation result
#[derive(Debug, Clone)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationError>,
}

impl LogEvent {
    /// Create LogEvent from raw unstructured data with intelligent parsing
    pub fn from_raw_unstructured(raw_data: &str, tenant_id: String) -> Self {
        let event_id = Some(Uuid::new_v4().to_string());
        let raw_event = Some(raw_data.to_string());
        let mut parsing_status = "raw".to_string();
        let parse_error_msg = None;
        let mut fields = HashMap::new();
        let mut level = "info".to_string();
        let mut message = raw_data.to_string();
        let mut source = None;
        
        // Try JSON parsing first
        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(raw_data) {
            parsing_status = "parsed".to_string();
            
            if let Some(obj) = json_value.as_object() {
                // Extract standard fields
                if let Some(msg) = obj.get("message").and_then(|v| v.as_str()) {
                    message = msg.to_string();
                }
                if let Some(lvl) = obj.get("level").and_then(|v| v.as_str()) {
                    level = lvl.to_string();
                }
                if let Some(src) = obj.get("source").and_then(|v| v.as_str()) {
                    source = Some(src.to_string());
                }
                
                // Store all fields
                for (k, v) in obj {
                    if !["message", "level", "source", "tenant_id", "timestamp"].contains(&k.as_str()) {
                        fields.insert(k.clone(), v.clone());
                    }
                }
            }
        } else {
            // Try syslog parsing
            if let Some(syslog_match) = Self::parse_syslog(raw_data) {
                parsing_status = "parsed".to_string();
                level = syslog_match.level;
                message = syslog_match.message;
                source = syslog_match.source;
                fields = syslog_match.fields;
            } else if let Some(kv_fields) = Self::parse_key_value(raw_data) {
                // Try key-value parsing
                parsing_status = "parsed".to_string();
                
                if let Some(msg) = kv_fields.get("message").and_then(|v| v.as_str()) {
                    message = msg.to_string();
                }
                if let Some(lvl) = kv_fields.get("level").and_then(|v| v.as_str()) {
                    level = lvl.to_string();
                }
                if let Some(src) = kv_fields.get("source").and_then(|v| v.as_str()) {
                    source = Some(src.to_string());
                }
                
                fields = kv_fields;
            } else {
                // Try common log patterns
                if let Some(pattern_match) = Self::parse_common_patterns(raw_data) {
                    parsing_status = "parsed".to_string();
                    level = pattern_match.level;
                    message = pattern_match.message;
                    source = pattern_match.source;
                    fields = pattern_match.fields;
                }
            }
        }
        
        Self {
            event_id,
            tenant_id,
            raw_event,
            parsing_status: Some(parsing_status),
            parse_error_msg,
            timestamp: SystemTime::now(),
            level,
            message,
            source,
            fields,
        }
    }
    
    /// Parse syslog format
    fn parse_syslog(data: &str) -> Option<ParsedLog> {
        // RFC3164 syslog pattern: <priority>timestamp hostname tag: message
        let syslog_regex = Regex::new(r"^<(\d+)>([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+):\s*(.*)$").ok()?;
        
        if let Some(captures) = syslog_regex.captures(data) {
            let priority = captures.get(1)?.as_str().parse::<u8>().ok()?;
            let facility = priority >> 3;
            let severity = priority & 7;
            
            let level = match severity {
                0..=3 => "error",
                4 => "warn",
                5..=6 => "info",
                7 => "debug",
                _ => "info",
            }.to_string();
            
            let hostname = captures.get(3)?.as_str().to_string();
            let tag = captures.get(4)?.as_str().to_string();
            let message = captures.get(5)?.as_str().to_string();
            
            let mut fields = HashMap::new();
            fields.insert("facility".to_string(), serde_json::Value::Number(facility.into()));
            fields.insert("severity".to_string(), serde_json::Value::Number(severity.into()));
            fields.insert("hostname".to_string(), serde_json::Value::String(hostname.clone()));
            fields.insert("tag".to_string(), serde_json::Value::String(tag.clone()));
            
            return Some(ParsedLog {
                level,
                message,
                source: Some(format!("{}:{}", hostname, tag)),
                fields,
            });
        }
        
        None
    }
    
    /// Parse key-value format
    fn parse_key_value(data: &str) -> Option<HashMap<String, serde_json::Value>> {
        let kv_regex = Regex::new(r#"(\w+)=([^\s]+|"[^"]*")"#).ok()?;
        let mut fields = HashMap::new();
        
        for captures in kv_regex.captures_iter(data) {
            let key = captures.get(1)?.as_str();
            let value = captures.get(2)?.as_str();
            
            // Remove quotes if present
            let clean_value = if value.starts_with('"') && value.ends_with('"') {
                &value[1..value.len()-1]
            } else {
                value
            };
            
            // Try to parse as number, otherwise store as string
            let json_value = if let Ok(num) = clean_value.parse::<i64>() {
                serde_json::Value::Number(num.into())
            } else if let Ok(float) = clean_value.parse::<f64>() {
                serde_json::Value::Number(serde_json::Number::from_f64(float)?)
            } else {
                serde_json::Value::String(clean_value.to_string())
            };
            
            fields.insert(key.to_string(), json_value);
        }
        
        if fields.is_empty() {
            None
        } else {
            Some(fields)
        }
    }
    
    /// Parse common log patterns (Apache, Nginx, etc.)
    fn parse_common_patterns(data: &str) -> Option<ParsedLog> {
        // Apache Common Log Format
        let apache_regex = Regex::new(r#"^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([^"]+)"\s+(\d+)\s+(\d+|-)$"#).ok()?;
        
        if let Some(captures) = apache_regex.captures(data) {
            let ip = captures.get(1)?.as_str();
            let _timestamp = captures.get(2)?.as_str();
            let request = captures.get(3)?.as_str();
            let status = captures.get(4)?.as_str();
            let size = captures.get(5)?.as_str();
            
            let mut fields = HashMap::new();
            fields.insert("client_ip".to_string(), serde_json::Value::String(ip.to_string()));
            fields.insert("request".to_string(), serde_json::Value::String(request.to_string()));
            fields.insert("status".to_string(), serde_json::Value::String(status.to_string()));
            fields.insert("size".to_string(), serde_json::Value::String(size.to_string()));
            
            let level = match status.parse::<u16>().unwrap_or(200) {
                400..=499 => "warn",
                500..=599 => "error",
                _ => "info",
            }.to_string();
            
            return Some(ParsedLog {
                level,
                message: format!("HTTP {} {} {}", request, status, size),
                source: Some("apache".to_string()),
                fields,
            });
        }
        
        // Try to extract timestamp and level from common patterns
        let timestamp_regex = Regex::new(r"\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}").ok()?;
        let level_regex = Regex::new(r"(?i)\b(error|warn|warning|info|debug|trace|fatal|critical)\b").ok()?;
        
        let mut fields = HashMap::new();
        let mut level = "info".to_string();
        
        if let Some(ts_match) = timestamp_regex.find(data) {
            fields.insert("extracted_timestamp".to_string(), serde_json::Value::String(ts_match.as_str().to_string()));
        }
        
        if let Some(level_match) = level_regex.find(data) {
            level = level_match.as_str().to_lowercase();
        }
        
        if !fields.is_empty() || level != "info" {
            return Some(ParsedLog {
                level,
                message: data.to_string(),
                source: None,
                fields,
            });
        }
        
        None
    }
}

#[derive(Debug)]
struct ParsedLog {
    level: String,
    message: String,
    source: Option<String>,
    fields: HashMap<String, serde_json::Value>,
}

/// Schema validator for log events
pub struct LogEventValidator {
    /// Required fields
    required_fields: Vec<String>,
    
    /// Valid log levels
    valid_levels: Vec<String>,
    
    /// Maximum message length
    max_message_length: usize,
    
    /// Maximum fields count
    max_fields_count: usize,
    
    /// Field name validation regex
    field_name_pattern: regex::Regex,
}

impl Default for LogEventValidator {
    fn default() -> Self {
        Self {
            required_fields: vec!["message".to_string()],
            valid_levels: vec![
                "TRACE".to_string(),
                "DEBUG".to_string(),
                "INFO".to_string(),
                "WARN".to_string(),
                "WARNING".to_string(),
                "ERROR".to_string(),
                "FATAL".to_string(),
                "CRITICAL".to_string(),
            ],
            max_message_length: 10_000,
            max_fields_count: 100,
            field_name_pattern: regex::Regex::new(r"^[a-zA-Z_][a-zA-Z0-9_.-]*$")
                .expect("Invalid field name regex"),
        }
    }
}

impl LogEventValidator {
    /// Create a new validator with custom settings
    pub fn new(
        required_fields: Vec<String>,
        valid_levels: Vec<String>,
        max_message_length: usize,
        max_fields_count: usize,
    ) -> Result<Self> {
        Ok(Self {
            required_fields,
            valid_levels,
            max_message_length,
            max_fields_count,
            field_name_pattern: regex::Regex::new(r"^[a-zA-Z_][a-zA-Z0-9_.-]*$")
                .context("Failed to compile field name regex")?,
        })
    }
    
    /// Validate a raw log event
    pub fn validate(&self, event: &RawLogEvent) -> ValidationResult {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        
        // Check required fields
        for field in &self.required_fields {
            match field.as_str() {
                "message" => {
                    if event.message.is_empty() {
                        errors.push(ValidationError {
                            field: "message".to_string(),
                            message: "Message cannot be empty".to_string(),
                            value: Some(serde_json::Value::String(event.message.clone())),
                        });
                    }
                }
                "level" => {
                    if event.level.is_none() {
                        warnings.push(ValidationError {
                            field: "level".to_string(),
                            message: "Log level not specified, will default to INFO".to_string(),
                            value: None,
                        });
                    }
                }
                "timestamp" => {
                    if event.timestamp.is_none() {
                        warnings.push(ValidationError {
                            field: "timestamp".to_string(),
                            message: "Timestamp not specified, will use current time".to_string(),
                            value: None,
                        });
                    }
                }
                _ => {
                    if !event.fields.contains_key(field) {
                        errors.push(ValidationError {
                            field: field.clone(),
                            message: format!("Required field '{}' is missing", field),
                            value: None,
                        });
                    }
                }
            }
        }
        
        // Validate message length
        if event.message.len() > self.max_message_length {
            errors.push(ValidationError {
                field: "message".to_string(),
                message: format!(
                    "Message length {} exceeds maximum {}",
                    event.message.len(),
                    self.max_message_length
                ),
                value: Some(serde_json::Value::Number(
                    serde_json::Number::from(event.message.len())
                )),
            });
        }
        
        // Validate log level
        if let Some(ref level) = event.level {
            let level_upper = level.to_uppercase();
            if !self.valid_levels.contains(&level_upper) {
                warnings.push(ValidationError {
                    field: "level".to_string(),
                    message: format!(
                        "Unknown log level '{}', will default to INFO. Valid levels: {}",
                        level,
                        self.valid_levels.join(", ")
                    ),
                    value: Some(serde_json::Value::String(level.clone())),
                });
            }
        }
        
        // Validate fields count
        if event.fields.len() > self.max_fields_count {
            errors.push(ValidationError {
                field: "fields".to_string(),
                message: format!(
                    "Too many fields: {} exceeds maximum {}",
                    event.fields.len(),
                    self.max_fields_count
                ),
                value: Some(serde_json::Value::Number(
                    serde_json::Number::from(event.fields.len())
                )),
            });
        }
        
        // Validate field names
        for field_name in event.fields.keys() {
            if !self.field_name_pattern.is_match(field_name) {
                warnings.push(ValidationError {
                    field: field_name.clone(),
                    message: format!(
                        "Field name '{}' doesn't match recommended pattern (alphanumeric, underscore, dot, dash)",
                        field_name
                    ),
                    value: Some(serde_json::Value::String(field_name.clone())),
                });
            }
        }
        
        ValidationResult {
            is_valid: errors.is_empty(),
            errors,
            warnings,
        }
    }
    
    /// Convert and validate a raw log event to canonical format
    pub fn normalize(&self, mut raw_event: RawLogEvent, tenant_id: String) -> Result<LogEvent> {
        // Validate first
        let validation = self.validate(&raw_event);
        
        if !validation.is_valid {
            return Err(anyhow::anyhow!(
                "Validation failed: {}",
                validation.errors.iter()
                    .map(|e| format!("{}: {}", e.field, e.message))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
        
        // Log warnings
        for warning in &validation.warnings {
            warn!("Validation warning for field '{}': {}", warning.field, warning.message);
        }
        
        // Parse timestamp
        let timestamp = match raw_event.timestamp {
            Some(ts_value) => parse_timestamp(&ts_value)?,
            None => SystemTime::now(),
        };
        
        // Normalize log level
        let level = raw_event.level
            .map(|l| l.to_uppercase())
            .unwrap_or_else(|| "INFO".to_string());
        
        // Ensure level is valid, default to INFO if not
        let level = if self.valid_levels.contains(&level) {
            level
        } else {
            "INFO".to_string()
        };
        
        // Remove special fields from the fields map
        raw_event.fields.remove("tenant_id");
        raw_event.fields.remove("timestamp");
        raw_event.fields.remove("level");
        raw_event.fields.remove("message");
        raw_event.fields.remove("source");
        
        Ok(LogEvent {
            event_id: Some(uuid::Uuid::new_v4().to_string()),
            tenant_id,
            raw_event: None, // Will be set by caller if needed
            parsing_status: Some("normalized".to_string()),
            parse_error_msg: None,
            timestamp,
            level,
            message: raw_event.message,
            source: raw_event.source,
            fields: raw_event.fields,
        })
    }
    
    /// Normalize a batch of events
    pub fn normalize_batch(
        &self,
        batch: LogBatch,
        default_tenant_id: String,
    ) -> Result<Vec<LogEvent>> {
        let mut normalized_events = Vec::new();
        let mut errors = Vec::new();
        
        for (index, raw_event) in batch.events.into_iter().enumerate() {
            let tenant_id = raw_event.tenant_id
                .clone()
                .unwrap_or_else(|| default_tenant_id.clone());
            
            match self.normalize(raw_event, tenant_id) {
                Ok(event) => normalized_events.push(event),
                Err(e) => {
                    errors.push(format!("Event {}: {}", index, e));
                }
            }
        }
        
        if !errors.is_empty() {
            return Err(anyhow::anyhow!(
                "Failed to normalize {} events: {}",
                errors.len(),
                errors.join("; ")
            ));
        }
        
        debug!("Successfully normalized {} events", normalized_events.len());
        Ok(normalized_events)
    }
}

/// Parse timestamp from various formats
fn parse_timestamp(value: &serde_json::Value) -> Result<SystemTime> {
    match value {
        // Unix timestamp in seconds
        serde_json::Value::Number(n) => {
            if let Some(timestamp) = n.as_u64() {
                // Determine if it's seconds or milliseconds based on magnitude
                let duration = if timestamp > 1_000_000_000_000 {
                    // Milliseconds
                    std::time::Duration::from_millis(timestamp)
                } else {
                    // Seconds
                    std::time::Duration::from_secs(timestamp)
                };
                
                Ok(UNIX_EPOCH + duration)
            } else if let Some(timestamp) = n.as_f64() {
                // Float seconds
                let duration = std::time::Duration::from_secs_f64(timestamp);
                Ok(UNIX_EPOCH + duration)
            } else {
                Err(anyhow::anyhow!("Invalid numeric timestamp: {}", n))
            }
        }
        
        // ISO 8601 string
        serde_json::Value::String(s) => {
            // Try parsing as RFC3339 first
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                let timestamp = dt.timestamp() as u64;
                let nanos = dt.timestamp_subsec_nanos();
                let duration = std::time::Duration::new(timestamp, nanos);
                return Ok(UNIX_EPOCH + duration);
            }
            
            // Try parsing as Unix timestamp string
            if let Ok(timestamp) = s.parse::<u64>() {
                let duration = if timestamp > 1_000_000_000_000 {
                    std::time::Duration::from_millis(timestamp)
                } else {
                    std::time::Duration::from_secs(timestamp)
                };
                return Ok(UNIX_EPOCH + duration);
            }
            
            // Try parsing as float timestamp string
            if let Ok(timestamp) = s.parse::<f64>() {
                let duration = std::time::Duration::from_secs_f64(timestamp);
                return Ok(UNIX_EPOCH + duration);
            }
            
            Err(anyhow::anyhow!("Unable to parse timestamp string: {}", s))
        }
        
        _ => Err(anyhow::anyhow!("Invalid timestamp format: {:?}", value)),
    }
}

/// Serde module for SystemTime serialization
mod timestamp_serde {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::time::{SystemTime, UNIX_EPOCH};
    
    pub fn serialize<S>(time: &SystemTime, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let duration = time.duration_since(UNIX_EPOCH)
            .map_err(serde::ser::Error::custom)?;
        duration.as_millis().serialize(serializer)
    }
    
    pub fn deserialize<'de, D>(deserializer: D) -> Result<SystemTime, D::Error>
    where
        D: Deserializer<'de>,
    {
        let millis = u64::deserialize(deserializer)?;
        Ok(UNIX_EPOCH + std::time::Duration::from_millis(millis))
    }
}

/// Generate a unique event ID
pub fn generate_event_id() -> String {
    Uuid::new_v4().to_string()
}

/// Get table name for a tenant
pub fn get_table_name(tenant_id: &str) -> String {
    // Sanitize tenant ID for use as table name
    let sanitized = tenant_id
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect::<String>();
    
    format!("logs_{}", sanitized)
}

/// Get partition key for a timestamp
pub fn get_partition_key(timestamp: SystemTime) -> String {
    let duration = timestamp.duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let timestamp_secs = duration.as_secs();
    
    // Create YYYYMM partition
    let dt = chrono::DateTime::from_timestamp(timestamp_secs as i64, 0)
        .unwrap_or_else(|| chrono::Utc::now());
    
    dt.format("%Y%m").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    
    #[test]
    fn test_parse_timestamp_unix_seconds() {
        let value = json!(1640995200); // 2022-01-01 00:00:00 UTC
        let timestamp = parse_timestamp(&value).unwrap();
        let duration = timestamp.duration_since(UNIX_EPOCH).unwrap();
        assert_eq!(duration.as_secs(), 1640995200);
    }
    
    #[test]
    fn test_parse_timestamp_unix_millis() {
        let value = json!(1640995200000u64); // 2022-01-01 00:00:00 UTC in millis
        let timestamp = parse_timestamp(&value).unwrap();
        let duration = timestamp.duration_since(UNIX_EPOCH).unwrap();
        assert_eq!(duration.as_millis(), 1640995200000);
    }
    
    #[test]
    fn test_parse_timestamp_rfc3339() {
        let value = json!("2022-01-01T00:00:00Z");
        let timestamp = parse_timestamp(&value).unwrap();
        let duration = timestamp.duration_since(UNIX_EPOCH).unwrap();
        assert_eq!(duration.as_secs(), 1640995200);
    }
    
    #[test]
    fn test_parse_timestamp_string_unix() {
        let value = json!("1640995200");
        let timestamp = parse_timestamp(&value).unwrap();
        let duration = timestamp.duration_since(UNIX_EPOCH).unwrap();
        assert_eq!(duration.as_secs(), 1640995200);
    }
    
    #[test]
    fn test_validator_default() {
        let validator = LogEventValidator::default();
        assert_eq!(validator.required_fields, vec!["message"]);
        assert!(validator.valid_levels.contains(&"INFO".to_string()));
        assert_eq!(validator.max_message_length, 10_000);
    }
    
    #[test]
    fn test_validate_valid_event() {
        let validator = LogEventValidator::default();
        let event = RawLogEvent {
            tenant_id: Some("test".to_string()),
            timestamp: Some(json!(1640995200)),
            level: Some("INFO".to_string()),
            message: "Test message".to_string(),
            source: Some("test_app".to_string()),
            fields: HashMap::new(),
        };
        
        let result = validator.validate(&event);
        assert!(result.is_valid);
        assert!(result.errors.is_empty());
    }
    
    #[test]
    fn test_validate_empty_message() {
        let validator = LogEventValidator::default();
        let event = RawLogEvent {
            tenant_id: Some("test".to_string()),
            timestamp: Some(json!(1640995200)),
            level: Some("INFO".to_string()),
            message: "".to_string(),
            source: Some("test_app".to_string()),
            fields: HashMap::new(),
        };
        
        let result = validator.validate(&event);
        assert!(!result.is_valid);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].field, "message");
    }
    
    #[test]
    fn test_normalize_event() {
        let validator = LogEventValidator::default();
        let raw_event = RawLogEvent {
            tenant_id: Some("test_tenant".to_string()),
            timestamp: Some(json!(1640995200)),
            level: Some("info".to_string()),
            message: "Test message".to_string(),
            source: Some("test_app".to_string()),
            fields: {
                let mut fields = HashMap::new();
                fields.insert("custom_field".to_string(), json!("custom_value"));
                fields
            },
        };
        
        let event = validator.normalize(raw_event, "default_tenant".to_string()).unwrap();
        
        assert_eq!(event.tenant_id, "default_tenant");
        assert_eq!(event.level, "INFO");
        assert_eq!(event.message, "Test message");
        assert_eq!(event.source, Some("test_app".to_string()));
        assert_eq!(event.fields.get("custom_field"), Some(&json!("custom_value")));
    }
    
    #[test]
    fn test_get_table_name() {
        assert_eq!(get_table_name("test_tenant"), "logs_test_tenant");
        assert_eq!(get_table_name("test-tenant.123"), "logs_test_tenant_123");
        assert_eq!(get_table_name("TENANT@DOMAIN"), "logs_TENANT_DOMAIN");
    }
    
    #[test]
    fn test_get_partition_key() {
        let timestamp = UNIX_EPOCH + std::time::Duration::from_secs(1640995200); // 2022-01-01
        let partition = get_partition_key(timestamp);
        assert_eq!(partition, "202201");
    }
    
    #[test]
    fn test_generate_event_id() {
        let id1 = generate_event_id();
        let id2 = generate_event_id();
        
        assert_ne!(id1, id2);
        assert_eq!(id1.len(), 36); // UUID v4 length
        assert!(id1.contains('-'));
    }
}