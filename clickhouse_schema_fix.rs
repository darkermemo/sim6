//! Fixed ClickHouse schema implementation for CIM alignment and universal log acceptance
//! This file contains the corrected code to replace the existing implementation

use anyhow::{Context, Result};
use clickhouse::{Client, Row};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    time::{SystemTime, UNIX_EPOCH},
};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use serde_json::Value;

/// FIXED: Full CIM-aligned ClickHouse row structure
/// This replaces the existing ClickHouseLogRow in clickhouse.rs
#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct ClickHouseLogRow {
    // Core event fields
    pub event_id: String,
    pub tenant_id: String,
    pub event_timestamp: DateTime<Utc>,
    pub ingestion_timestamp: DateTime<Utc>,
    pub raw_event: String,  // CRITICAL: Always preserve original data
    pub parsing_status: String,  // "success", "partial", "failed"
    pub parse_error_msg: Option<String>,
    
    // Basic log fields
    pub level: Option<String>,
    pub message: String,
    pub source: Option<String>,
    
    // CIM Network Fields
    pub source_ip: Option<String>,
    pub source_port: Option<u16>,
    pub destination_ip: Option<String>,
    pub destination_port: Option<u16>,
    pub protocol: Option<String>,
    pub network_direction: Option<String>,
    pub bytes_in: Option<u64>,
    pub bytes_out: Option<u64>,
    pub packets_in: Option<u64>,
    pub packets_out: Option<u64>,
    
    // CIM Authentication Fields
    pub user_name: Option<String>,
    pub user_id: Option<String>,
    pub user_domain: Option<String>,
    pub authentication_method: Option<String>,
    pub authentication_result: Option<String>,
    
    // CIM Host/System Fields
    pub host_name: Option<String>,
    pub host_ip: Option<String>,
    pub operating_system: Option<String>,
    pub host_type: Option<String>,
    
    // CIM Process Fields
    pub process_name: Option<String>,
    pub process_id: Option<u32>,
    pub process_path: Option<String>,
    pub parent_process_name: Option<String>,
    pub parent_process_id: Option<u32>,
    pub command_line: Option<String>,
    
    // CIM File Fields
    pub file_path: Option<String>,
    pub file_name: Option<String>,
    pub file_size: Option<u64>,
    pub file_hash: Option<String>,
    pub file_hash_type: Option<String>,
    
    // CIM Web Fields
    pub url: Option<String>,
    pub http_method: Option<String>,
    pub http_status_code: Option<u16>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    
    // CIM Security Fields
    pub event_type: Option<String>,
    pub severity: Option<String>,
    pub category: Option<String>,
    pub action: Option<String>,
    pub result: Option<String>,
    pub threat_name: Option<String>,
    pub signature_id: Option<String>,
    
    // Custom fields as JSON for anything not in CIM
    pub custom_fields: String,  // JSON object
}

/// Enhanced LogEvent with universal parsing capabilities
/// This extends the existing LogEvent in schema.rs
impl LogEvent {
    /// NEW: Create LogEvent from any unstructured data with zero rejection
    pub fn from_raw_unstructured(raw_data: &str, tenant_id: &str) -> Self {
        let event_id = Uuid::new_v4().to_string();
        let timestamp = SystemTime::now();
        
        // Attempt intelligent parsing
        let (parsed_fields, parsing_status, parse_error) = 
            Self::attempt_intelligent_parsing(raw_data);
        
        LogEvent {
            tenant_id: tenant_id.to_string(),
            timestamp,
            level: parsed_fields.get("level")
                .and_then(|v| v.as_str())
                .unwrap_or("INFO")
                .to_string(),
            message: parsed_fields.get("message")
                .and_then(|v| v.as_str())
                .unwrap_or(raw_data)
                .to_string(),
            source: parsed_fields.get("source")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            fields: parsed_fields,
            
            // Add metadata about parsing
            event_id: Some(event_id),
            raw_event: Some(raw_data.to_string()),
            parsing_status: Some(parsing_status),
            parse_error_msg: parse_error,
        }
    }
    
    /// Intelligent parsing that handles multiple log formats
    fn attempt_intelligent_parsing(raw_data: &str) -> (HashMap<String, Value>, String, Option<String>) {
        let mut fields = HashMap::new();
        
        // Try JSON parsing first
        if let Ok(json_value) = serde_json::from_str::<Value>(raw_data) {
            if let Value::Object(obj) = json_value {
                for (key, value) in obj {
                    fields.insert(key, value);
                }
                return (fields, "success".to_string(), None);
            }
        }
        
        // Try syslog format parsing
        if let Some(syslog_fields) = Self::parse_syslog_format(raw_data) {
            fields.extend(syslog_fields);
            return (fields, "partial".to_string(), None);
        }
        
        // Try key=value format
        if let Some(kv_fields) = Self::parse_key_value_format(raw_data) {
            fields.extend(kv_fields);
            return (fields, "partial".to_string(), None);
        }
        
        // Try to extract common patterns (IP addresses, timestamps, etc.)
        Self::extract_common_patterns(raw_data, &mut fields);
        
        // Fallback: treat entire input as message
        fields.insert("message".to_string(), Value::String(raw_data.to_string()));
        
        (fields, "failed".to_string(), Some("Unstructured format - stored as message".to_string()))
    }
    
    /// Parse syslog format (RFC3164/RFC5424)
    fn parse_syslog_format(raw_data: &str) -> Option<HashMap<String, Value>> {
        use regex::Regex;
        
        // RFC3164 format: <priority>timestamp hostname tag: message
        let rfc3164_regex = Regex::new(
            r"^<(\d+)>([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+):\s*(.*)$"
        ).ok()?;
        
        if let Some(captures) = rfc3164_regex.captures(raw_data) {
            let mut fields = HashMap::new();
            
            if let Some(priority) = captures.get(1) {
                fields.insert("priority".to_string(), Value::String(priority.as_str().to_string()));
            }
            if let Some(timestamp) = captures.get(2) {
                fields.insert("timestamp".to_string(), Value::String(timestamp.as_str().to_string()));
            }
            if let Some(hostname) = captures.get(3) {
                fields.insert("host_name".to_string(), Value::String(hostname.as_str().to_string()));
            }
            if let Some(tag) = captures.get(4) {
                fields.insert("source".to_string(), Value::String(tag.as_str().to_string()));
            }
            if let Some(message) = captures.get(5) {
                fields.insert("message".to_string(), Value::String(message.as_str().to_string()));
            }
            
            return Some(fields);
        }
        
        None
    }
    
    /// Parse key=value format
    fn parse_key_value_format(raw_data: &str) -> Option<HashMap<String, Value>> {
        use regex::Regex;
        
        let kv_regex = Regex::new(r"(\w+)=([^\s]+)").ok()?;
        let mut fields = HashMap::new();
        let mut found_any = false;
        
        for captures in kv_regex.captures_iter(raw_data) {
            if let (Some(key), Some(value)) = (captures.get(1), captures.get(2)) {
                fields.insert(
                    key.as_str().to_string(),
                    Value::String(value.as_str().to_string())
                );
                found_any = true;
            }
        }
        
        if found_any {
            Some(fields)
        } else {
            None
        }
    }
    
    /// Extract common patterns (IPs, timestamps, etc.)
    fn extract_common_patterns(raw_data: &str, fields: &mut HashMap<String, Value>) {
        use regex::Regex;
        
        // Extract IP addresses
        if let Ok(ip_regex) = Regex::new(r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b") {
            let ips: Vec<&str> = ip_regex.find_iter(raw_data)
                .map(|m| m.as_str())
                .collect();
            
            if !ips.is_empty() {
                fields.insert("extracted_ips".to_string(), 
                    Value::Array(ips.into_iter().map(|ip| Value::String(ip.to_string())).collect()));
                
                // Assume first IP is source
                if let Some(first_ip) = ips.first() {
                    fields.insert("source_ip".to_string(), Value::String(first_ip.to_string()));
                }
            }
        }
        
        // Extract log levels
        if let Ok(level_regex) = Regex::new(r"\b(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|TRACE)\b") {
            if let Some(level_match) = level_regex.find(raw_data) {
                fields.insert("level".to_string(), Value::String(level_match.as_str().to_string()));
            }
        }
        
        // Extract timestamps (ISO format)
        if let Ok(timestamp_regex) = Regex::new(r"\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}") {
            if let Some(ts_match) = timestamp_regex.find(raw_data) {
                fields.insert("extracted_timestamp".to_string(), Value::String(ts_match.as_str().to_string()));
            }
        }
    }
}

/// Enhanced conversion from LogEvent to CIM-aligned ClickHouse row
impl From<LogEvent> for ClickHouseLogRow {
    fn from(event: LogEvent) -> Self {
        let event_timestamp = DateTime::<Utc>::from(event.timestamp);
        let ingestion_timestamp = Utc::now();
        
        // Extract CIM fields from the fields HashMap
        let get_string_field = |key: &str| -> Option<String> {
            event.fields.get(key)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        };
        
        let get_u16_field = |key: &str| -> Option<u16> {
            event.fields.get(key)
                .and_then(|v| v.as_u64())
                .and_then(|n| u16::try_from(n).ok())
        };
        
        let get_u32_field = |key: &str| -> Option<u32> {
            event.fields.get(key)
                .and_then(|v| v.as_u64())
                .and_then(|n| u32::try_from(n).ok())
        };
        
        let get_u64_field = |key: &str| -> Option<u64> {
            event.fields.get(key)
                .and_then(|v| v.as_u64())
        };
        
        // Create custom_fields with remaining data
        let mut custom_fields = HashMap::new();
        for (key, value) in &event.fields {
            // Only include fields not mapped to CIM columns
            if !Self::is_cim_field(key) {
                custom_fields.insert(key.clone(), value.clone());
            }
        }
        
        let custom_fields_json = serde_json::to_string(&custom_fields)
            .unwrap_or_else(|_| "{}".to_string());
        
        Self {
            event_id: event.event_id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            tenant_id: event.tenant_id,
            event_timestamp,
            ingestion_timestamp,
            raw_event: event.raw_event.unwrap_or_else(|| 
                serde_json::to_string(&event.fields).unwrap_or_default()),
            parsing_status: event.parsing_status.unwrap_or_else(|| "success".to_string()),
            parse_error_msg: event.parse_error_msg,
            
            // Basic fields
            level: Some(event.level),
            message: event.message,
            source: event.source,
            
            // CIM Network Fields
            source_ip: get_string_field("source_ip"),
            source_port: get_u16_field("source_port"),
            destination_ip: get_string_field("destination_ip"),
            destination_port: get_u16_field("destination_port"),
            protocol: get_string_field("protocol"),
            network_direction: get_string_field("network_direction"),
            bytes_in: get_u64_field("bytes_in"),
            bytes_out: get_u64_field("bytes_out"),
            packets_in: get_u64_field("packets_in"),
            packets_out: get_u64_field("packets_out"),
            
            // CIM Authentication Fields
            user_name: get_string_field("user_name").or_else(|| get_string_field("user")),
            user_id: get_string_field("user_id"),
            user_domain: get_string_field("user_domain"),
            authentication_method: get_string_field("authentication_method"),
            authentication_result: get_string_field("authentication_result"),
            
            // CIM Host/System Fields
            host_name: get_string_field("host_name").or_else(|| get_string_field("hostname")),
            host_ip: get_string_field("host_ip"),
            operating_system: get_string_field("operating_system"),
            host_type: get_string_field("host_type"),
            
            // CIM Process Fields
            process_name: get_string_field("process_name"),
            process_id: get_u32_field("process_id"),
            process_path: get_string_field("process_path"),
            parent_process_name: get_string_field("parent_process_name"),
            parent_process_id: get_u32_field("parent_process_id"),
            command_line: get_string_field("command_line"),
            
            // CIM File Fields
            file_path: get_string_field("file_path"),
            file_name: get_string_field("file_name"),
            file_size: get_u64_field("file_size"),
            file_hash: get_string_field("file_hash"),
            file_hash_type: get_string_field("file_hash_type"),
            
            // CIM Web Fields
            url: get_string_field("url"),
            http_method: get_string_field("http_method"),
            http_status_code: get_u16_field("http_status_code"),
            user_agent: get_string_field("user_agent"),
            referer: get_string_field("referer"),
            
            // CIM Security Fields
            event_type: get_string_field("event_type"),
            severity: get_string_field("severity"),
            category: get_string_field("category"),
            action: get_string_field("action"),
            result: get_string_field("result"),
            threat_name: get_string_field("threat_name"),
            signature_id: get_string_field("signature_id"),
            
            custom_fields: custom_fields_json,
        }
    }
}

impl ClickHouseLogRow {
    /// Check if a field name is a CIM field (to avoid duplication in custom_fields)
    fn is_cim_field(field_name: &str) -> bool {
        matches!(field_name,
            "source_ip" | "source_port" | "destination_ip" | "destination_port" |
            "protocol" | "network_direction" | "bytes_in" | "bytes_out" |
            "packets_in" | "packets_out" | "user_name" | "user" | "user_id" |
            "user_domain" | "authentication_method" | "authentication_result" |
            "host_name" | "hostname" | "host_ip" | "operating_system" | "host_type" |
            "process_name" | "process_id" | "process_path" | "parent_process_name" |
            "parent_process_id" | "command_line" | "file_path" | "file_name" |
            "file_size" | "file_hash" | "file_hash_type" | "url" | "http_method" |
            "http_status_code" | "user_agent" | "referer" | "event_type" |
            "severity" | "category" | "action" | "result" | "threat_name" | "signature_id"
        )
    }
}

/// FIXED: Updated table creation SQL to match CIM schema
pub const CREATE_EVENTS_TABLE_CIM: &str = r#"
    CREATE TABLE IF NOT EXISTS events (
        event_id String,
        tenant_id String,
        event_timestamp DateTime64(3),
        ingestion_timestamp DateTime64(3) DEFAULT now64(3),
        raw_event String,
        parsing_status LowCardinality(String),
        parse_error_msg Nullable(String),
        
        -- Basic log fields
        level Nullable(String),
        message String,
        source Nullable(String),
        
        -- CIM Network Fields
        source_ip Nullable(IPv4),
        source_port Nullable(UInt16),
        destination_ip Nullable(IPv4),
        destination_port Nullable(UInt16),
        protocol Nullable(String),
        network_direction Nullable(String),
        bytes_in Nullable(UInt64),
        bytes_out Nullable(UInt64),
        packets_in Nullable(UInt64),
        packets_out Nullable(UInt64),
        
        -- CIM Authentication Fields
        user_name Nullable(String),
        user_id Nullable(String),
        user_domain Nullable(String),
        authentication_method Nullable(String),
        authentication_result Nullable(String),
        
        -- CIM Host/System Fields
        host_name Nullable(String),
        host_ip Nullable(IPv4),
        operating_system Nullable(String),
        host_type Nullable(String),
        
        -- CIM Process Fields
        process_name Nullable(String),
        process_id Nullable(UInt32),
        process_path Nullable(String),
        parent_process_name Nullable(String),
        parent_process_id Nullable(UInt32),
        command_line Nullable(String),
        
        -- CIM File Fields
        file_path Nullable(String),
        file_name Nullable(String),
        file_size Nullable(UInt64),
        file_hash Nullable(String),
        file_hash_type Nullable(String),
        
        -- CIM Web Fields
        url Nullable(String),
        http_method Nullable(String),
        http_status_code Nullable(UInt16),
        user_agent Nullable(String),
        referer Nullable(String),
        
        -- CIM Security Fields
        event_type Nullable(String),
        severity Nullable(String),
        category Nullable(String),
        action Nullable(String),
        result Nullable(String),
        threat_name Nullable(String),
        signature_id Nullable(String),
        
        -- Custom fields as JSON
        custom_fields String DEFAULT '{}'
    ) ENGINE = MergeTree()
    ORDER BY (tenant_id, event_timestamp)
    PARTITION BY toYYYYMM(event_timestamp)
    SETTINGS index_granularity = 8192
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    
    #[test]
    fn test_parse_json_log() {
        let json_log = r#"{"level":"ERROR","message":"Database connection failed","source_ip":"192.168.1.100"}"}"#;
        let event = LogEvent::from_raw_unstructured(json_log, "test-tenant");
        
        assert_eq!(event.level, "ERROR");
        assert_eq!(event.message, "Database connection failed");
        assert_eq!(event.parsing_status, Some("success".to_string()));
    }
    
    #[test]
    fn test_parse_syslog() {
        let syslog = "<134>Jan 1 12:00:00 server01 nginx: 192.168.1.100 GET /api/health";
        let event = LogEvent::from_raw_unstructured(syslog, "test-tenant");
        
        assert_eq!(event.parsing_status, Some("partial".to_string()));
        assert!(event.fields.contains_key("host_name"));
    }
    
    #[test]
    fn test_parse_plain_text() {
        let plain_text = "This is just a plain log message";
        let event = LogEvent::from_raw_unstructured(plain_text, "test-tenant");
        
        assert_eq!(event.message, plain_text);
        assert_eq!(event.parsing_status, Some("failed".to_string()));
        assert!(event.parse_error_msg.is_some());
    }
    
    #[test]
    fn test_cim_field_mapping() {
        let mut fields = HashMap::new();
        fields.insert("source_ip".to_string(), json!("192.168.1.100"));
        fields.insert("user_name".to_string(), json!("john.doe"));
        fields.insert("custom_field".to_string(), json!("custom_value"));
        
        let event = LogEvent {
            tenant_id: "test".to_string(),
            timestamp: SystemTime::now(),
            level: "INFO".to_string(),
            message: "Test message".to_string(),
            source: None,
            fields,
            event_id: Some("test-id".to_string()),
            raw_event: Some("raw".to_string()),
            parsing_status: Some("success".to_string()),
            parse_error_msg: None,
        };
        
        let ch_row: ClickHouseLogRow = event.into();
        
        assert_eq!(ch_row.source_ip, Some("192.168.1.100".to_string()));
        assert_eq!(ch_row.user_name, Some("john.doe".to_string()));
        
        // Custom field should be in custom_fields JSON
        let custom_fields: HashMap<String, Value> = 
            serde_json::from_str(&ch_row.custom_fields).unwrap();
        assert_eq!(custom_fields.get("custom_field"), Some(&json!("custom_value")));
    }
}