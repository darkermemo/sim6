//! ParsedEvent Struct Definition
//!
//! This module defines the canonical ParsedEvent struct that serves as the normalized
//! representation of security events in the SIEM system. The struct follows ECS
//! (Elastic Common Schema), CIM (Common Information Model), and UDM (Unified Data Model)
//! best practices for field naming and organization.
//!
//! # Design Principles
//!
//! 1. **Canonical Field Names**: All fields use standardized names based on industry standards
//! 2. **Type Safety**: Appropriate Rust types for each field (u16 for ports, DateTime for timestamps)
//! 3. **Extensibility**: `additional_fields` HashMap for unmapped or custom fields
//! 4. **Backward Compatibility**: Legacy field names maintained alongside canonical ones
//! 5. **Performance**: Efficient serialization/deserialization with serde

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// Canonical ParsedEvent struct representing a normalized security event
///
/// This struct contains all the essential fields for security event analysis,
/// organized by functional categories following ECS/CIM/UDM standards.
///
/// # Field Categories
///
/// - **Network**: source.ip, destination.ip, source.port, destination.port
/// - **Identity**: user.name, host.name
/// - **Process**: process.name, process.pid
/// - **Event**: event.action, event.id, timestamp
/// - **Web**: http.response.status_code, url.original
/// - **Additional**: log.level, message, and extensible additional_fields
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ParsedEvent {
    /// Event timestamp in UTC
    #[serde(rename = "@timestamp")]
    pub timestamp: Option<DateTime<Utc>>,

    // === NETWORK FIELDS ===
    /// Source IP address (ECS: source.ip)
    #[serde(rename = "source.ip")]
    pub source_ip: Option<String>,

    /// Destination IP address (ECS: destination.ip)
    #[serde(rename = "destination.ip")]
    pub destination_ip: Option<String>,

    /// Source port number (ECS: source.port)
    #[serde(rename = "source.port")]
    pub source_port: Option<u16>,

    /// Destination port number (ECS: destination.port)
    #[serde(rename = "destination.port")]
    pub destination_port: Option<u16>,

    /// Network protocol (ECS: network.protocol)
    #[serde(rename = "network.protocol")]
    pub protocol: Option<String>,

    // === IDENTITY FIELDS ===
    /// Username or user identifier (ECS: user.name)
    #[serde(rename = "user.name")]
    pub user_name: Option<String>,

    /// Host or computer name (ECS: host.name)
    #[serde(rename = "host.name")]
    pub host_name: Option<String>,

    // === PROCESS FIELDS ===
    /// Process name or executable (ECS: process.name)
    #[serde(rename = "process.name")]
    pub process_name: Option<String>,

    /// Process ID (ECS: process.pid)
    #[serde(rename = "process.pid")]
    pub process_pid: Option<u32>,

    // === EVENT FIELDS ===
    /// Event action or operation (ECS: event.action)
    #[serde(rename = "event.action")]
    pub event_action: Option<String>,

    /// Event identifier (ECS: event.id)
    #[serde(rename = "event.id")]
    pub event_id: Option<String>,

    /// Event outcome (ECS: event.outcome)
    #[serde(rename = "event.outcome")]
    pub event_outcome: Option<String>,

    // === WEB FIELDS ===
    /// HTTP response status code (ECS: http.response.status_code)
    #[serde(rename = "http.response.status_code")]
    pub http_response_status_code: Option<u16>,

    /// Original URL (ECS: url.original)
    #[serde(rename = "url.original")]
    pub url_original: Option<String>,

    /// HTTP method (ECS: http.request.method)
    #[serde(rename = "http.request.method")]
    pub http_method: Option<String>,

    /// User agent string (ECS: user_agent.original)
    #[serde(rename = "user_agent.original")]
    pub user_agent: Option<String>,

    // === FILE FIELDS ===
    /// File name (ECS: file.name)
    #[serde(rename = "file.name")]
    pub file_name: Option<String>,

    /// File path (ECS: file.path)
    #[serde(rename = "file.path")]
    pub file_path: Option<String>,

    /// File hash (ECS: file.hash.sha256)
    #[serde(rename = "file.hash.sha256")]
    pub file_hash_sha256: Option<String>,

    // === LOGGING FIELDS ===
    /// Log level or severity (ECS: log.level)
    #[serde(rename = "log.level")]
    pub log_level: Option<String>,

    /// Log message (ECS: message)
    pub message: Option<String>,

    /// Log facility (Syslog: facility)
    #[serde(rename = "log.syslog.facility.name")]
    pub facility: Option<String>,

    // === SECURITY FIELDS ===
    /// Rule ID that triggered (Custom: rule.id)
    #[serde(rename = "rule.id")]
    pub rule_id: Option<String>,

    /// Rule name (Custom: rule.name)
    #[serde(rename = "rule.name")]
    pub rule_name: Option<String>,

    /// Threat name (ECS: threat.indicator.name)
    #[serde(rename = "threat.indicator.name")]
    pub threat_name: Option<String>,

    // === GEOGRAPHIC FIELDS ===
    /// Source country (ECS: source.geo.country_name)
    #[serde(rename = "source.geo.country_name")]
    pub source_country: Option<String>,

    /// Destination country (ECS: destination.geo.country_name)
    #[serde(rename = "destination.geo.country_name")]
    pub destination_country: Option<String>,

    // === DEVICE FIELDS ===
    /// Device vendor (ECS: observer.vendor)
    #[serde(rename = "observer.vendor")]
    pub device_vendor: Option<String>,

    /// Device product (ECS: observer.product)
    #[serde(rename = "observer.product")]
    pub device_product: Option<String>,

    /// Device version (ECS: observer.version)
    #[serde(rename = "observer.version")]
    pub device_version: Option<String>,

    // === EXTENSIBILITY ===
    /// Additional fields for unmapped or custom data
    /// This serves as a fallback bucket for fields that don't have
    /// explicit mappings in the canonical schema
    #[serde(flatten)]
    pub additional_fields: HashMap<String, Value>,
}

impl Default for ParsedEvent {
    fn default() -> Self {
        Self::new()
    }
}

impl ParsedEvent {
    /// Create a new empty ParsedEvent
    pub fn new() -> Self {
        Self {
            timestamp: None,
            source_ip: None,
            destination_ip: None,
            source_port: None,
            destination_port: None,
            protocol: None,
            user_name: None,
            host_name: None,
            process_name: None,
            process_pid: None,
            event_action: None,
            event_id: None,
            event_outcome: None,
            http_response_status_code: None,
            url_original: None,
            http_method: None,
            user_agent: None,
            file_name: None,
            file_path: None,
            file_hash_sha256: None,
            log_level: None,
            message: None,
            facility: None,
            rule_id: None,
            rule_name: None,
            threat_name: None,
            source_country: None,
            destination_country: None,
            device_vendor: None,
            device_product: None,
            device_version: None,
            additional_fields: HashMap::new(),
        }
    }

    /// Create a ParsedEvent with a timestamp
    pub fn with_timestamp(timestamp: DateTime<Utc>) -> Self {
        let mut event = Self::new();
        event.timestamp = Some(timestamp);
        event
    }

    /// Set the source IP address
    pub fn set_source_ip<S: Into<String>>(&mut self, ip: S) -> &mut Self {
        self.source_ip = Some(ip.into());
        self
    }

    /// Set the destination IP address
    pub fn set_destination_ip<S: Into<String>>(&mut self, ip: S) -> &mut Self {
        self.destination_ip = Some(ip.into());
        self
    }

    /// Set the user name
    pub fn set_user_name<S: Into<String>>(&mut self, name: S) -> &mut Self {
        self.user_name = Some(name.into());
        self
    }

    /// Set the event action
    pub fn set_event_action<S: Into<String>>(&mut self, action: S) -> &mut Self {
        self.event_action = Some(action.into());
        self
    }

    /// Add a custom field to additional_fields
    pub fn add_field<K: Into<String>, V: Into<Value>>(&mut self, key: K, value: V) -> &mut Self {
        self.additional_fields.insert(key.into(), value.into());
        self
    }

    /// Get a field from additional_fields
    pub fn get_field(&self, key: &str) -> Option<&Value> {
        self.additional_fields.get(key)
    }

    /// Check if the event has a valid timestamp
    pub fn has_timestamp(&self) -> bool {
        self.timestamp.is_some()
    }

    /// Check if the event represents network traffic
    pub fn is_network_event(&self) -> bool {
        self.source_ip.is_some() || self.destination_ip.is_some()
    }

    /// Check if the event represents a web request
    pub fn is_web_event(&self) -> bool {
        self.http_response_status_code.is_some() || self.url_original.is_some()
    }

    /// Check if the event represents a process event
    pub fn is_process_event(&self) -> bool {
        self.process_name.is_some() || self.process_pid.is_some()
    }

    /// Get the event severity level
    pub fn get_severity(&self) -> Option<&str> {
        self.log_level.as_deref()
    }

    /// Convert to JSON string
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Convert to pretty JSON string
    pub fn to_json_pretty(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Create from JSON string
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use serde_json::json;

    #[test]
    fn test_new_parsed_event() {
        let event = ParsedEvent::new();
        assert!(event.timestamp.is_none());
        assert!(event.source_ip.is_none());
        assert!(event.additional_fields.is_empty());
    }

    #[test]
    fn test_with_timestamp() {
        let now = Utc::now();
        let event = ParsedEvent::with_timestamp(now);
        assert_eq!(event.timestamp, Some(now));
    }

    #[test]
    fn test_builder_pattern() {
        let mut event = ParsedEvent::new();
        event
            .set_source_ip("192.168.1.1")
            .set_destination_ip("10.0.0.1")
            .set_user_name("alice")
            .set_event_action("login")
            .add_field("custom_field", "custom_value");

        assert_eq!(event.source_ip, Some("192.168.1.1".to_string()));
        assert_eq!(event.destination_ip, Some("10.0.0.1".to_string()));
        assert_eq!(event.user_name, Some("alice".to_string()));
        assert_eq!(event.event_action, Some("login".to_string()));
        assert_eq!(
            event.get_field("custom_field"),
            Some(&json!("custom_value"))
        );
    }

    #[test]
    fn test_event_type_detection() {
        let mut network_event = ParsedEvent::new();
        network_event.set_source_ip("192.168.1.1");
        assert!(network_event.is_network_event());
        assert!(!network_event.is_web_event());
        assert!(!network_event.is_process_event());

        let mut web_event = ParsedEvent::new();
        web_event.http_response_status_code = Some(200);
        assert!(web_event.is_web_event());
        assert!(!web_event.is_network_event());

        let mut process_event = ParsedEvent::new();
        process_event.process_name = Some("nginx".to_string());
        assert!(process_event.is_process_event());
    }

    #[test]
    fn test_serialization_deserialization() {
        let mut original = ParsedEvent::new();
        original
            .set_source_ip("192.168.1.100")
            .set_destination_ip("10.0.0.50")
            .set_user_name("testuser")
            .add_field("severity", "high")
            .add_field("count", 42);

        original.source_port = Some(8080);
        original.destination_port = Some(443);
        original.http_response_status_code = Some(200);
        original.timestamp = Some(Utc::now());

        // Test JSON serialization
        let json = original.to_json().expect("Failed to serialize to JSON");
        let deserialized = ParsedEvent::from_json(&json).expect("Failed to deserialize from JSON");

        assert_eq!(original.source_ip, deserialized.source_ip);
        assert_eq!(original.destination_ip, deserialized.destination_ip);
        assert_eq!(original.user_name, deserialized.user_name);
        assert_eq!(original.source_port, deserialized.source_port);
        assert_eq!(original.destination_port, deserialized.destination_port);
        assert_eq!(
            original.http_response_status_code,
            deserialized.http_response_status_code
        );
        assert_eq!(original.additional_fields, deserialized.additional_fields);
    }
}
