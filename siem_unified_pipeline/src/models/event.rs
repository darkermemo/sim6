//! Event models for the SIEM unified pipeline
//!
//! This module defines the SiemEvent struct that maps to the ClickHouse events table.
//! The struct includes fields for event categorization, network information, and metadata.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use clickhouse::Row;

/// SiemEvent represents a security event stored in ClickHouse
/// This struct maps directly to the events table schema
#[derive(Debug, Clone, Serialize, Deserialize, Row)]
#[serde(rename_all = "snake_case")]
pub struct SiemEvent {
    pub event_id: String,
    pub event_timestamp: u32, // Unix timestamp
    pub tenant_id: String,
    pub event_category: String,
    pub event_action: String,
    pub event_outcome: Option<String>,
    pub source_ip: Option<String>,
    pub destination_ip: Option<String>,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub severity: Option<String>,
    pub message: Option<String>,
    pub raw_event: String,
    pub metadata: String,
    pub source_type: Option<String>, // Added to match ClickHouse schema
    pub created_at: u32, // Unix timestamp
}

/// Simplified event summary for API responses and streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventSummary {
    /// Unique identifier for the event
    pub event_id: String,
    
    /// Tenant identifier for multi-tenancy support
    pub tenant_id: String,
    
    /// Timestamp when the event occurred (Unix timestamp)
    pub event_timestamp: u32,
    
    /// Type of the source that generated this event
    pub source_type: Option<String>,
    
    /// Severity level of the event
    pub severity: Option<String>,
    
    /// Human-readable message describing the event
    pub message: Option<String>,
}

impl SiemEvent {
    /// Create a new SiemEvent with required fields
    pub fn new(
        event_id: String,
        tenant_id: String,
        event_category: String,
        event_action: String,
        raw_event: String,
        metadata: String,
    ) -> Self {
        let now = Utc::now().timestamp() as u32;
        Self {
            event_id,
            event_timestamp: now,
            tenant_id,
            event_category,
            event_action,
            event_outcome: None,
            source_ip: None,
            destination_ip: None,
            user_id: None,
            user_name: None,
            severity: None,
            message: None,
            raw_event,
            metadata,
            source_type: None,
            created_at: now,
        }
    }

    /// Set the event timestamp from a DateTime
    pub fn with_timestamp(mut self, timestamp: DateTime<Utc>) -> Self {
        self.event_timestamp = timestamp.timestamp() as u32;
        self
    }

    /// Set the severity level
    pub fn with_severity(mut self, severity: String) -> Self {
        self.severity = Some(severity);
        self
    }

    /// Set the message
    pub fn with_message(mut self, message: String) -> Self {
        self.message = Some(message);
        self
    }

    /// Set the source IP address
    pub fn with_source_ip(mut self, source_ip: String) -> Self {
        self.source_ip = Some(source_ip);
        self
    }

    /// Set the destination IP address
    pub fn with_destination_ip(mut self, destination_ip: String) -> Self {
        self.destination_ip = Some(destination_ip);
        self
    }

    /// Set the user information
    pub fn with_user(mut self, user_id: String, user_name: Option<String>) -> Self {
        self.user_id = Some(user_id);
        self.user_name = user_name;
        self
    }

    /// Set the event outcome
    pub fn with_outcome(mut self, outcome: String) -> Self {
        self.event_outcome = Some(outcome);
        self
    }

    /// Set the source type
    pub fn with_source_type(mut self, source_type: String) -> Self {
        self.source_type = Some(source_type);
        self
    }

    /// Check if this is a network-related event
    pub fn is_network_event(&self) -> bool {
        self.event_category.to_lowercase().contains("network") ||
        self.source_ip.is_some() ||
        self.destination_ip.is_some()
    }

    /// Check if this is a security-related event
    pub fn is_security_event(&self) -> bool {
        matches!(self.event_category.to_lowercase().as_str(), 
            "authentication" | "authorization" | "intrusion_detection" | 
            "malware" | "vulnerability" | "threat_intelligence")
    }

    /// Get the event timestamp as DateTime<Utc>
    pub fn timestamp_as_datetime(&self) -> DateTime<Utc> {
        DateTime::from_timestamp(self.event_timestamp as i64, 0)
            .unwrap_or_else(|| Utc::now())
    }

    /// Get the created_at timestamp as DateTime<Utc>
    pub fn created_at_as_datetime(&self) -> DateTime<Utc> {
        DateTime::from_timestamp(self.created_at as i64, 0)
            .unwrap_or_else(|| Utc::now())
    }
}

impl Default for SiemEvent {
    fn default() -> Self {
        let now = Utc::now().timestamp() as u32;
        Self {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_timestamp: now,
            tenant_id: "default".to_string(),
            event_category: "unknown".to_string(),
            event_action: "unknown".to_string(),
            event_outcome: None,
            source_ip: None,
            destination_ip: None,
            user_id: None,
            user_name: None,
            severity: None,
            message: None,
            raw_event: "{}".to_string(),
            metadata: "{}".to_string(),
            source_type: None,
            created_at: now,
        }
    }
}