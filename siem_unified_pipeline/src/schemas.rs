use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use validator::{Validate, ValidationError};
use std::collections::HashMap;

// Event Search and Retrieval Schemas
#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct EventSearchRequest {
    #[validate(custom = "validate_tenant_id")]
    pub tenant_id: Option<Uuid>,
    
    #[validate(custom = "validate_ip")]
    pub source_ip: Option<String>,
    
    #[validate(length(min = 1, max = 100))]
    pub event_type: Option<String>,
    
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    
    #[validate(range(min = 1, max = 1000))]
    pub limit: Option<u32>,
    
    #[validate(range(min = 0))]
    pub offset: Option<u32>,
    
    #[validate(length(min = 1, max = 500))]
    pub query: Option<String>,
    
    #[validate(length(min = 1, max = 100))]
    pub severity: Option<String>,
    
    #[validate(length(min = 1, max = 100))]
    pub source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EventSearchResponse {
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
    pub events: Vec<EventDetail>,
    pub query_time_ms: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EventDetail {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub source: String,
    pub source_type: String,
    pub severity: String,
    pub facility: String,
    pub hostname: String,
    pub process: String,
    pub message: String,
    pub raw_message: String,
    pub source_ip: String,
    pub source_port: i32,
    pub protocol: String,
    pub tags: Vec<String>,
    pub fields: serde_json::Value,
    pub processing_stage: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// Routing Rules CRUD Schemas
#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct CreateRoutingRuleRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    
    #[validate(length(min = 1, max = 1000))]
    pub description: Option<String>,
    
    pub conditions: serde_json::Value,
    pub actions: serde_json::Value,
    
    pub enabled: Option<bool>,
    
    #[validate(range(min = 0, max = 1000))]
    pub priority: Option<u32>,
    
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct UpdateRoutingRuleRequest {
    #[validate(length(min = 1, max = 1000))]
    pub description: Option<String>,
    
    pub conditions: Option<serde_json::Value>,
    pub actions: Option<serde_json::Value>,
    
    pub enabled: Option<bool>,
    
    #[validate(range(min = 0, max = 1000))]
    pub priority: Option<u32>,
    
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RoutingRuleResponse {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub conditions: serde_json::Value,
    pub actions: serde_json::Value,
    pub enabled: bool,
    pub priority: u32,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub tenant_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoutingRulesListResponse {
    pub rules: Vec<RoutingRuleResponse>,
    pub total: u64,
}

// System Logs Schemas
#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct SystemLogsRequest {
    #[validate(length(min = 1, max = 50))]
    pub level: Option<String>,

    #[validate(length(min = 1, max = 100))]
    pub module: Option<String>,

    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,

    #[validate(range(min = 1, max = 1000))]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemLogEntry {
    pub timestamp: DateTime<Utc>,
    pub level: String,
    pub message: String,
    pub module: String,
    pub thread: Option<String>,
    pub file: Option<String>,
    pub line: Option<u32>,
    pub fields: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemLogsResponse {
    pub logs: Vec<SystemLogEntry>,
    pub total: u64,
}

// Common Error Response Schema
#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
    pub code: u16,
    pub timestamp: DateTime<Utc>,
    pub request_id: Option<String>,
    pub details: Option<serde_json::Value>,
}

// Pagination Schema
#[derive(Debug, Serialize, Deserialize)]
pub struct PaginationInfo {
    pub page: u32,
    pub page_size: u32,
    pub total_pages: u32,
    pub total_items: u64,
    pub has_next: bool,
    pub has_previous: bool,
}

// Validation functions
fn validate_tenant_id(tenant_id: &Uuid) -> Result<(), ValidationError> {
    if tenant_id.is_nil() {
        return Err(ValidationError::new("tenant_id cannot be nil UUID"));
    }
    Ok(())
}

fn validate_ip(ip: &String) -> Result<(), ValidationError> {
    if ip.parse::<std::net::IpAddr>().is_err() {
        return Err(ValidationError::new("invalid IP address format"));
    }
    Ok(())
}

// Helper functions for schema conversion
impl From<crate::models::Event> for EventDetail {
    fn from(event: crate::models::Event) -> Self {
        Self {
            id: event.id,
            timestamp: event.timestamp,
            source: event.source,
            source_type: event.source_type,
            severity: event.severity,
            facility: event.facility,
            hostname: event.hostname,
            process: event.process,
            message: event.message,
            raw_message: event.raw_message,
            source_ip: event.source_ip,
            source_port: event.source_port,
            protocol: event.protocol,
            tags: event.tags,
            fields: event.fields,
            processing_stage: event.processing_stage,
            created_at: event.created_at,
            updated_at: event.updated_at,
        }
    }
}

impl From<crate::routing::RoutingRule> for RoutingRuleResponse {
    fn from(rule: crate::routing::RoutingRule) -> Self {
        Self {
            id: rule.id,
            name: rule.name,
            description: Some(rule.description),
            conditions: serde_json::json!(rule.conditions),
            actions: serde_json::json!(rule.destinations),
            enabled: rule.enabled,
            priority: rule.priority,
            tags: rule.tags,
            created_at: Utc::now(), // TODO: Add to RoutingRule struct
            updated_at: Utc::now(), // TODO: Add to RoutingRule struct
            tenant_id: Uuid::new_v4(), // TODO: Add tenant support
        }
    }
}

// Request ID generation for tracing
pub fn generate_request_id() -> String {
    Uuid::new_v4().to_string()
}

// Common validation helpers
pub fn validate_time_range(start: &Option<DateTime<Utc>>, end: &Option<DateTime<Utc>>) -> Result<(), ValidationError> {
    if let (Some(start_time), Some(end_time)) = (start, end) {
        if start_time >= end_time {
            return Err(ValidationError::new("start_time must be before end_time"));
        }
        
        let max_range = chrono::Duration::days(30);
        if *end_time - *start_time > max_range {
            return Err(ValidationError::new("time range cannot exceed 30 days"));
        }
    }
    Ok(())
}