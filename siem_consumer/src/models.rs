use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Event {
    pub event_id: String,
    pub tenant_id: String,
    #[serde(rename = "timestamp")]
    pub event_timestamp: u32,
    pub ingestion_timestamp: u32,
    pub source_ip: String,
    pub source_type: String,
    pub raw_event: String,
    pub event_category: String,
    pub event_outcome: String,
    pub event_action: String,
    pub is_threat: u8,

    // Common Information Model (CIM) Fields
    // Authentication Data Model
    pub user: Option<String>,      // Normalized username/user identity
    pub src_user: Option<String>,  // Source user (for authentication events)
    pub dest_user: Option<String>, // Destination user (for authentication events)
    pub user_type: Option<String>, // User type: local, domain, service, etc.

    // Network Traffic Data Model
    pub dest_ip: Option<String>,   // Destination IP address
    pub src_port: Option<u16>,     // Source port number
    pub dest_port: Option<u16>,    // Destination port number
    pub protocol: Option<String>,  // Protocol (TCP, UDP, ICMP, etc.)
    pub bytes_in: Option<u64>,     // Bytes received/inbound
    pub bytes_out: Option<u64>,    // Bytes sent/outbound
    pub packets_in: Option<u64>,   // Packets received/inbound
    pub packets_out: Option<u64>,  // Packets sent/outbound
    pub duration: Option<u32>,     // Connection/session duration in seconds
    pub transport: Option<String>, // Transport protocol details
    pub direction: Option<String>, // Traffic direction: inbound, outbound, lateral

    // Endpoint Activity Data Model
    pub process_name: Option<String>,   // Process/executable name
    pub parent_process: Option<String>, // Parent process name
    pub process_id: Option<u32>,        // Process ID (PID)
    pub parent_process_id: Option<u32>, // Parent process ID (PPID)
    pub file_hash: Option<String>,      // File hash (MD5, SHA1, SHA256)
    pub file_path: Option<String>,      // Full file path
    pub file_name: Option<String>,      // File name only
    pub file_size: Option<u64>,         // File size in bytes
    pub command_line: Option<String>,   // Full command line with arguments
    pub registry_key: Option<String>,   // Registry key (Windows)
    pub registry_value: Option<String>, // Registry value (Windows)

    // Web Traffic Data Model
    pub url: Option<String>,               // Full URL accessed
    pub uri_path: Option<String>,          // URI path component
    pub uri_query: Option<String>,         // URI query string
    pub http_method: Option<String>,       // HTTP method (GET, POST, etc.)
    pub http_status_code: Option<u16>,     // HTTP response status code
    pub http_user_agent: Option<String>,   // User agent string
    pub http_referrer: Option<String>,     // HTTP referrer
    pub http_content_type: Option<String>, // Content type
    pub http_content_length: Option<u64>,  // Content length

    // Device/Host Information
    pub src_host: Option<String>,    // Source hostname
    pub dest_host: Option<String>,   // Destination hostname
    pub device_type: Option<String>, // Device type: firewall, ids, endpoint, etc.
    pub vendor: Option<String>,      // Vendor name
    pub product: Option<String>,     // Product name
    pub version: Option<String>,     // Product version

    // Geographic and Network Context
    pub src_country: Option<String>,   // Source country
    pub dest_country: Option<String>,  // Destination country
    pub src_zone: Option<String>,      // Source network zone
    pub dest_zone: Option<String>,     // Destination network zone
    pub interface_in: Option<String>,  // Ingress interface
    pub interface_out: Option<String>, // Egress interface
    pub vlan_id: Option<u16>,          // VLAN ID

    // Security Context
    pub rule_id: Option<String>,        // Security rule ID that triggered
    pub rule_name: Option<String>,      // Security rule name
    pub policy_id: Option<String>,      // Policy ID
    pub policy_name: Option<String>,    // Policy name
    pub signature_id: Option<String>,   // IDS/IPS signature ID
    pub signature_name: Option<String>, // IDS/IPS signature name
    pub threat_name: Option<String>,    // Threat/malware name
    pub threat_category: Option<String>, // Threat category
    pub severity: Option<String>,       // Event severity
    pub priority: Option<String>,       // Event priority

    // Authentication Specific
    pub auth_method: Option<String>,    // Authentication method
    pub auth_app: Option<String>,       // Authentication application
    pub failure_reason: Option<String>, // Authentication failure reason
    pub session_id: Option<String>,     // Session identifier

    // Application/Service Context
    pub app_name: Option<String>,     // Application name
    pub app_category: Option<String>, // Application category
    pub service_name: Option<String>, // Service name

    // Email/Communication (for email security events)
    pub email_sender: Option<String>,    // Email sender
    pub email_recipient: Option<String>, // Email recipient
    pub email_subject: Option<String>,   // Email subject

    // Additional Context
    pub tags: Option<String>,    // Comma-separated tags
    pub message: Option<String>, // Human-readable message
    pub details: Option<String>, // Additional details in JSON format
    
    // Custom Fields (non-CIM fields)
    pub custom_fields: HashMap<String, String>, // Arbitrary key-value pairs for non-standard fields
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]  // Fields are used by serde for deserialization
pub struct KafkaMessage {
    pub event_id: String,
    pub tenant_id: String,
    #[serde(alias = "timestamp", default = "default_timestamp")]
    pub event_timestamp: u32,
    pub source_ip: String,
    #[serde(default = "default_source_type")]
    pub source_type: String,
    #[serde(alias = "raw_message", alias = "raw_log", deserialize_with = "deserialize_raw_event")]
    pub raw_event: String,
    #[serde(default = "default_event_category")]
    pub event_category: String,
    #[serde(default = "default_event_outcome")]
    pub event_outcome: String,
    #[serde(default = "default_event_action")]
    pub event_action: String,
    #[serde(default)]
    pub is_threat: u8,
}

// Custom deserializer to handle nested raw_message structure
fn deserialize_raw_event<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;
    use serde_json::Value;
    
    let value = Value::deserialize(deserializer)?;
    
    // If the value is a string, check if it's nested JSON
    if let Some(s) = value.as_str() {
        // Try to parse as JSON to see if it contains raw_event
        if let Ok(nested) = serde_json::from_str::<Value>(s) {
            if let Some(nested_raw_event) = nested.get("raw_event") {
                if let Some(nested_s) = nested_raw_event.as_str() {
                    return Ok(nested_s.to_string());
                }
            }
        }
        // If not nested JSON or no raw_event found, return the string as is
        return Ok(s.to_string());
    }
    
    Err(D::Error::custom("Expected string value for raw_event field"))
}

fn default_source_type() -> String {
    "Unknown".to_string()
}

fn default_event_category() -> String {
    "Unknown".to_string()
}

fn default_event_outcome() -> String {
    "Unknown".to_string()
}

fn default_event_action() -> String {
    "Unknown".to_string()
}

fn default_timestamp() -> u32 {
    // Use current time as fallback when timestamp is missing
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as u32
}

impl Event {
    /// Create an event from a Kafka message and parsed event data with taxonomy and CIM fields
    pub fn from_kafka_and_parsed_with_cim(
        kafka_msg: &KafkaMessage,
        parsed: &siem_parser::ParsedEvent,
        source_type: String,
        event_category: String,
        event_outcome: String,
        event_action: String,
    ) -> Self {
        Event {
            event_id: kafka_msg.event_id.clone(),
            tenant_id: kafka_msg.tenant_id.clone(),
            event_timestamp: parsed.event_timestamp.timestamp() as u32,
            ingestion_timestamp: chrono::Utc::now().timestamp() as u32,
            source_ip: parsed.source_ip.clone(),
            source_type,
            raw_event: kafka_msg.raw_event.clone(),
            event_category: parsed.additional_fields
                .get("event_category")
                .cloned()
                .unwrap_or(event_category),
            event_outcome: parsed.additional_fields
                .get("event_outcome")
                .cloned()
                .unwrap_or(event_outcome),
            event_action: parsed.additional_fields
                .get("event_action")
                .cloned()
                .unwrap_or(event_action),
            is_threat: parsed.additional_fields
                .get("is_threat")
                .and_then(|v| {
                    let trimmed = v.trim();
                    log::debug!("Parsing is_threat value: '{}' (trimmed: '{}')", v, trimmed);
                    trimmed.parse::<u8>().map_err(|e| {
                        log::warn!("Failed to parse is_threat '{}': {}", trimmed, e);
                        e
                    }).ok()
                })
                .unwrap_or(0),

            // Map all CIM fields from ParsedEvent
            user: parsed.user_name.clone(),
            src_user: parsed.src_user.clone(),
            dest_user: parsed.dest_user.clone(),
            user_type: parsed.user_type.clone(),
            dest_ip: parsed.destination_ip.clone(),
            src_port: parsed.source_port,
            dest_port: parsed.destination_port,
            protocol: parsed.protocol.clone(),
            bytes_in: None,
            bytes_out: None,
            packets_in: None,
            packets_out: None,
            duration: None,
            transport: None,
            direction: None,
            process_name: None,
            parent_process: None,
            process_id: None,
            parent_process_id: None,
            file_hash: None,
            file_path: None,
            file_name: None,
            file_size: None,
            command_line: None,
            registry_key: None,
            registry_value: None,
            url: parsed.url_original.clone(),
            uri_path: None,
            uri_query: None,
            http_method: parsed.http_method.clone(),
            http_status_code: parsed.http_response_status_code,
            http_user_agent: parsed.user_agent.clone(),
            http_referrer: None,
            http_content_type: parsed.http_content_type.clone(),
            http_content_length: parsed.http_content_length,
            src_host: parsed.src_host.clone(),
            dest_host: parsed.dest_host.clone(),
            device_type: None,
            vendor: parsed.device_vendor.clone(),
            product: parsed.device_product.clone(),
            version: parsed.version.clone(),
            src_country: parsed.src_country.clone(),
            dest_country: parsed.dest_country.clone(),
            src_zone: parsed.src_zone.clone(),
            dest_zone: parsed.dest_zone.clone(),
            interface_in: parsed.interface_in.clone(),
            interface_out: parsed.interface_out.clone(),
            vlan_id: parsed.vlan_id,
            rule_id: None,
            rule_name: None,
            policy_id: parsed.policy_id.clone(),
            policy_name: parsed.policy_name.clone(),
            signature_id: parsed.signature_id.clone(),
            signature_name: parsed.signature_name.clone(),
            threat_name: None,
            threat_category: parsed.threat_category.clone(),
            severity: Some(parsed.severity.clone()),
            priority: None,
            auth_method: parsed.auth_method.clone(),
            auth_app: parsed.auth_app.clone(),
            failure_reason: parsed.failure_reason.clone(),
            session_id: parsed.session_id.clone(),
            app_name: parsed.app_name.clone(),
            app_category: parsed.app_category.clone(),
            service_name: parsed.service_name.clone(),
            email_sender: parsed.email_sender.clone(),
            email_recipient: parsed.email_recipient.clone(),
            email_subject: parsed.email_subject.clone(),
            tags: parsed.tags.clone(),
            message: parsed.message.clone(),
            details: parsed.details.clone(),
            custom_fields: parsed.additional_fields.clone()
        }
    }

    /// Create an event from a Kafka message and parsed event data with taxonomy
    #[allow(dead_code)]
    pub fn from_kafka_and_parsed_with_taxonomy(
        kafka_msg: &KafkaMessage,
        parsed: &siem_parser::ParsedEvent,
        source_type: String,
        event_category: String,
        event_outcome: String,
        event_action: String,
    ) -> Self {
        // Use the new CIM method for complete field mapping
        Self::from_kafka_and_parsed_with_cim(
            kafka_msg,
            parsed,
            source_type,
            event_category,
            event_outcome,
            event_action,
        )
    }

    /// Create an event from a Kafka message and parsed event data
    #[allow(dead_code)]
    pub fn from_kafka_and_parsed(
        kafka_msg: &KafkaMessage,
        parsed: &siem_parser::ParsedEvent,
        source_type: String,
    ) -> Self {
        Event {
            event_id: kafka_msg.event_id.clone(),
            tenant_id: kafka_msg.tenant_id.clone(),
            event_timestamp: parsed.event_timestamp.timestamp() as u32,
            ingestion_timestamp: chrono::Utc::now().timestamp() as u32,
            source_ip: parsed.source_ip.clone(),
            source_type,
            raw_event: kafka_msg.raw_event.clone(),
            event_category: "Unknown".to_string(),
            event_outcome: "Unknown".to_string(),
            event_action: "Unknown".to_string(),
            is_threat: 0, // Placeholder, will be updated by parser
            user: parsed.user_name.clone(),
            src_user: parsed.src_user.clone(),
            dest_user: parsed.dest_user.clone(),
            user_type: parsed.user_type.clone(),
            dest_ip: parsed.destination_ip.clone(),
            src_port: parsed.source_port,
            dest_port: parsed.destination_port,
            protocol: parsed.protocol.clone(),
            bytes_in: None,
            bytes_out: None,
            packets_in: None,
            packets_out: None,
            duration: None,
            transport: None,
            direction: None,
            process_name: None,
            parent_process: None,
            process_id: None,
            parent_process_id: None,
            file_hash: None,
            file_path: None,
            file_name: None,
            file_size: None,
            command_line: None,
            registry_key: None,
            registry_value: None,
            url: parsed.url_original.clone(),
            uri_path: None,
            uri_query: None,
            http_method: parsed.http_method.clone(),
            http_status_code: parsed.http_response_status_code,
            http_user_agent: parsed.user_agent.clone(),
            http_referrer: None,
            http_content_type: parsed.http_content_type.clone(),
            http_content_length: parsed.http_content_length,
            src_host: parsed.src_host.clone(),
            dest_host: parsed.dest_host.clone(),
            device_type: None,
            vendor: parsed.device_vendor.clone(),
            product: parsed.device_product.clone(),
            version: parsed.version.clone(),
            src_country: parsed.src_country.clone(),
            dest_country: parsed.dest_country.clone(),
            src_zone: parsed.src_zone.clone(),
            dest_zone: parsed.dest_zone.clone(),
            interface_in: parsed.interface_in.clone(),
            interface_out: parsed.interface_out.clone(),
            vlan_id: parsed.vlan_id,
            rule_id: None,
            rule_name: None,
            policy_id: parsed.policy_id.clone(),
            policy_name: parsed.policy_name.clone(),
            signature_id: parsed.signature_id.clone(),
            signature_name: parsed.signature_name.clone(),
            threat_name: None,
            threat_category: parsed.threat_category.clone(),
            severity: Some(parsed.severity.clone()),
            priority: None,
            auth_method: parsed.auth_method.clone(),
            auth_app: parsed.auth_app.clone(),
            failure_reason: parsed.failure_reason.clone(),
            session_id: parsed.session_id.clone(),
            app_name: parsed.app_name.clone(),
            app_category: parsed.app_category.clone(),
            service_name: parsed.service_name.clone(),
            email_sender: parsed.email_sender.clone(),
            email_recipient: parsed.email_recipient.clone(),
            email_subject: parsed.email_subject.clone(),
            tags: parsed.tags.clone(),
            message: parsed.message.clone(),
            details: parsed.details.clone(),
            custom_fields: parsed.additional_fields.clone(),
        }
    }

    /// Create a default event when parsing fails
    pub fn from_kafka_unparsed(kafka_msg: &KafkaMessage, source_type: String) -> Self {
        Event {
            event_id: kafka_msg.event_id.clone(),
            tenant_id: kafka_msg.tenant_id.clone(),
            event_timestamp: kafka_msg.event_timestamp,
            ingestion_timestamp: chrono::Utc::now().timestamp() as u32,
            source_ip: kafka_msg.source_ip.clone(),
            source_type,
            raw_event: kafka_msg.raw_event.clone(),
            event_category: "Unknown".to_string(),
            event_outcome: "Unknown".to_string(),
            event_action: "Unknown".to_string(),
            is_threat: 0, // Placeholder, will be updated by parser
            user: None,
            src_user: None,
            dest_user: None,
            user_type: None,
            dest_ip: None,
            src_port: None,
            dest_port: None,
            protocol: None,
            bytes_in: None,
            bytes_out: None,
            packets_in: None,
            packets_out: None,
            duration: None,
            transport: None,
            direction: None,
            process_name: None,
            parent_process: None,
            process_id: None,
            parent_process_id: None,
            file_hash: None,
            file_path: None,
            file_name: None,
            file_size: None,
            command_line: None,
            registry_key: None,
            registry_value: None,
            url: None,
            uri_path: None,
            uri_query: None,
            http_method: None,
            http_status_code: None,
            http_user_agent: None,
            http_referrer: None,
            http_content_type: None,
            http_content_length: None,
            src_host: None,
            dest_host: None,
            device_type: None,
            vendor: None,
            product: None,
            version: None,
            src_country: None,
            dest_country: None,
            src_zone: None,
            dest_zone: None,
            interface_in: None,
            interface_out: None,
            vlan_id: None,
            rule_id: None,
            rule_name: None,
            policy_id: None,
            policy_name: None,
            signature_id: None,
            signature_name: None,
            threat_name: None,
            threat_category: None,
            severity: None,
            priority: None,
            auth_method: None,
            auth_app: None,
            failure_reason: None,
            session_id: None,
            app_name: None,
            app_category: None,
            service_name: None,
            email_sender: None,
            email_recipient: None,
            email_subject: None,
            tags: None,
            message: None,
            details: None,
            custom_fields: HashMap::new(),
        }
    }
}
