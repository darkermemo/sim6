use serde::{Deserialize, Serialize};
use clickhouse::Row;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct SiemEvent {
    pub event_id: String,
    pub event_timestamp: u32,
    pub tenant_id: String,
    pub event_category: String,
    pub event_action: Option<String>,
    pub event_outcome: Option<String>,
    pub source_ip: Option<String>,
    pub destination_ip: Option<String>,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub severity: Option<String>,
    pub message: Option<String>,
    pub raw_event: String,
    pub metadata: String,
    pub created_at: u32,
    pub source_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retention_days: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_seq: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    // New normalized fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity_int: Option<i16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parsed_fields: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ti_hits: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ti_match: Option<u8>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EventSummary {
    pub event_id: String,
    pub event_timestamp: u32,
    pub source_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct CompactEvent {
    pub event_id: String,
    pub event_timestamp: u32,
    pub tenant_id: String,
    pub source_type: Option<String>,
    pub severity: Option<String>,
    pub event_category: String,
    pub event_action: Option<String>,
    pub user_name: Option<String>,
    pub user_id: Option<String>,
    pub message: Option<String>,
    pub raw_len: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub alert_id: String,
    pub event_id: String,
    pub rule_name: String,
    pub severity: String,
    pub created_at: u64,
}

