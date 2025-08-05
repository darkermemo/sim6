use serde::{Deserialize, Deserializer};
use serde_json::Value;
use std::collections::HashMap;

// Enhanced KafkaMessage with multiple fallback strategies
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum FlexibleKafkaMessage {
    // Standard format with event_timestamp
    Standard(StandardMessage),
    // Legacy format with timestamp
    Legacy(LegacyMessage),
    // Fallback for unknown formats
    Generic(GenericMessage),
}

#[derive(Debug, Deserialize)]
pub struct StandardMessage {
    pub event_id: String,
    pub tenant_id: String,
    pub event_timestamp: u32,
    pub source_ip: String,
    #[serde(default)]
    pub source_type: String,
    #[serde(default)]
    pub raw_event: String,
}

#[derive(Debug, Deserialize)]
pub struct LegacyMessage {
    pub event_id: String,
    pub tenant_id: String,
    pub timestamp: u32,
    pub source_ip: String,
    #[serde(default)]
    pub source_type: String,
    #[serde(default)]
    pub raw_event: String,
}

#[derive(Debug, Deserialize)]
pub struct GenericMessage {
    #[serde(flatten)]
    pub fields: HashMap<String, Value>,
}

// Implement conversion to unified Event structure
impl FlexibleKafkaMessage {
    pub fn to_event(self) -> Result<Event, String> {
        match self {
            FlexibleKafkaMessage::Standard(msg) => Ok(Event {
                event_id: msg.event_id,
                tenant_id: msg.tenant_id,
                event_timestamp: msg.event_timestamp,
                source_ip: msg.source_ip,
                source_type: msg.source_type,
                raw_event: msg.raw_event,
                // ... other fields with defaults
            }),
            FlexibleKafkaMessage::Legacy(msg) => Ok(Event {
                event_id: msg.event_id,
                tenant_id: msg.tenant_id,
                event_timestamp: msg.timestamp, // Map timestamp to event_timestamp
                source_ip: msg.source_ip,
                source_type: msg.source_type,
                raw_event: msg.raw_event,
                // ... other fields with defaults
            }),
            FlexibleKafkaMessage::Generic(msg) => {
                // Extract fields from generic map
                let event_id = msg.fields.get("event_id")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing event_id")?
                    .to_string();
                
                let tenant_id = msg.fields.get("tenant_id")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing tenant_id")?
                    .to_string();
                
                // Try multiple timestamp field names
                let timestamp = msg.fields.get("event_timestamp")
                    .or_else(|| msg.fields.get("timestamp"))
                    .or_else(|| msg.fields.get("time"))
                    .and_then(|v| v.as_u64())
                    .ok_or("Missing timestamp field")? as u32;
                
                let source_ip = msg.fields.get("source_ip")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                
                let raw_event = msg.fields.get("raw_event")
                    .or_else(|| msg.fields.get("raw_message"))
                    .or_else(|| msg.fields.get("message"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                
                Ok(Event {
                    event_id,
                    tenant_id,
                    event_timestamp: timestamp,
                    source_ip,
                    source_type: "unknown".to_string(),
                    raw_event,
                    // ... other fields with defaults
                })
            }
        }
    }
}

// Alternative approach: Custom deserializer for timestamp field
pub fn deserialize_timestamp<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    
    // Try to extract timestamp from various possible locations
    if let Some(ts) = value.as_u64() {
        return Ok(ts as u32);
    }
    
    if let Some(obj) = value.as_object() {
        // Try different field names
        for field_name in &["event_timestamp", "timestamp", "time", "@timestamp"] {
            if let Some(ts) = obj.get(*field_name).and_then(|v| v.as_u64()) {
                return Ok(ts as u32);
            }
        }
    }
    
    Err(serde::de::Error::custom("No valid timestamp field found"))
}

// Recommended fix for your existing KafkaMessage struct
#[derive(Debug, Deserialize)]
pub struct FixedKafkaMessage {
    pub event_id: String,
    pub tenant_id: String,
    
    // Use custom deserializer that tries multiple field names
    #[serde(deserialize_with = "deserialize_timestamp_flexible")]
    pub event_timestamp: u32,
    
    pub source_ip: String,
    
    #[serde(default = "default_source_type")]
    pub source_type: String,
    
    #[serde(alias = "raw_message", alias = "raw_log", alias = "message", default)]
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

// Flexible timestamp deserializer
pub fn deserialize_timestamp_flexible<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    // This will be called for the event_timestamp field
    // First, try to deserialize directly as u32
    if let Ok(timestamp) = u32::deserialize(deserializer) {
        return Ok(timestamp);
    }
    
    // If that fails, we need a more complex approach
    // You'll need to implement a custom visitor pattern here
    Err(serde::de::Error::custom("Failed to deserialize timestamp"))
}

// Default functions
fn default_source_type() -> String {
    "unknown".to_string()
}

fn default_event_category() -> String {
    "unknown".to_string()
}

fn default_event_outcome() -> String {
    "unknown".to_string()
}

fn default_event_action() -> String {
    "unknown".to_string()
}

// Placeholder Event struct
pub struct Event {
    pub event_id: String,
    pub tenant_id: String,
    pub event_timestamp: u32,
    pub source_ip: String,
    pub source_type: String,
    pub raw_event: String,
    // ... other fields
}