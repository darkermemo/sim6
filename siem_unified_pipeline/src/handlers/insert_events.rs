//! Event insertion handlers for ClickHouse
//!
//! This module provides functionality for inserting events into ClickHouse
//! using batch operations with back-pressure handling for optimal performance.

use axum::extract::State;
use axum::response::{IntoResponse, Json};
use axum::http::StatusCode;
use clickhouse::{Client, inserter::Inserter};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::Semaphore;
use tracing::{debug, error, info, warn};
use chrono::Utc;

use crate::error::{PipelineError, Result};
use crate::models::SiemEvent;
use crate::state::AppState;
use crate::types::api::*;

/// Maximum batch size for event insertion
const MAX_BATCH_SIZE: usize = 50_000;
/// Minimum batch size for event insertion
const MIN_BATCH_SIZE: usize = 5_000;
/// Default batch size
const DEFAULT_BATCH_SIZE: usize = 10_000;
/// Maximum concurrent insert operations
const MAX_CONCURRENT_INSERTS: usize = 4;

/// Global semaphore for controlling concurrent inserts
static INSERT_SEMAPHORE: once_cell::sync::Lazy<Semaphore> = 
    once_cell::sync::Lazy::new(|| Semaphore::new(MAX_CONCURRENT_INSERTS));

/// Handler for inserting events via HTTP API
/// 
/// This endpoint accepts a batch of events and inserts them into ClickHouse.
/// It validates the events and uses efficient batch insertion with back-pressure.
pub async fn insert_events_api(
    State(app_state): State<Arc<AppState>>,
    Json(request): Json<InsertEventsRequest>,
) -> impl IntoResponse {
    debug!("Inserting {} events via API", request.events.len());
    
    // Validate request
    if request.events.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Validation failed",
                "message": "Events array cannot be empty"
            }))
        ).into_response();
    }
    
    if request.events.len() > MAX_BATCH_SIZE {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Validation failed",
                "message": format!("Batch size cannot exceed {}", MAX_BATCH_SIZE)
            }))
        ).into_response();
    }
    
    // Convert API events to SiemEvent
    let mut siem_events = Vec::with_capacity(request.events.len());
    for (index, api_event) in request.events.iter().enumerate() {
        match convert_api_event_to_siem(api_event) {
            Ok(siem_event) => siem_events.push(siem_event),
            Err(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": "Validation failed",
                        "message": format!("Invalid event at index {}: {}", index, e)
                    }))
                ).into_response();
            }
        }
    }
    
    match insert_events(
        &app_state.ch,
        &app_state.events_table,
        siem_events,
    ).await {
        Ok(inserted_count) => {
            info!("Successfully inserted {} events", inserted_count);
            Json(InsertEventsResponse {
                inserted_count,
                success: true,
                message: Some(format!("Successfully inserted {} events", inserted_count)),
            }).into_response()
        }
        Err(e) => {
            error!("Failed to insert events: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Insert failed",
                    "message": e.to_string()
                }))
            ).into_response()
        }
    }
}

/// Core function for inserting events into ClickHouse
/// 
/// This function handles batch insertion with back-pressure control.
/// It uses ClickHouse's inserter for optimal performance.
pub async fn insert_events(
    client: &Client,
    table_name: &str,
    events: Vec<SiemEvent>,
) -> Result<usize> {
    if events.is_empty() {
        return Ok(0);
    }
    
    let event_count = events.len();
    info!("Starting insertion of {} events into {}", event_count, table_name);
    
    // Acquire semaphore permit for back-pressure control
    let _permit = INSERT_SEMAPHORE.acquire().await
        .map_err(|e| PipelineError::internal(format!("Failed to acquire insert permit: {}", e)))?;
    
    // Determine batch size based on event count
    let batch_size = determine_batch_size(event_count);
    debug!("Using batch size: {}", batch_size);
    
    // Create inserter
    let mut inserter = client
        .insert(table_name)
        .map_err(|e| {
            error!("Failed to create inserter: {}", e);
            PipelineError::database(format!("Failed to create inserter: {}", e))
        })?;
    
    // Insert events in batches
    let mut inserted_count = 0;
    for (batch_index, chunk) in events.chunks(batch_size).enumerate() {
        debug!("Inserting batch {} with {} events", batch_index + 1, chunk.len());
        
        for event in chunk {
            inserter.write(event)
                .await
                .map_err(|e| {
                    error!("Failed to write event to inserter: {}", e);
                    PipelineError::database(format!("Failed to write event: {}", e))
                })?;
        }
        
        inserted_count += chunk.len();
        
        debug!("Successfully processed batch {} ({} events)", batch_index + 1, chunk.len());
    }
    
    // Final commit to ensure all data is written
    inserter.end().await
        .map_err(|e| {
            error!("Failed to finalize inserter: {}", e);
            PipelineError::database(format!("Failed to finalize insertion: {}", e))
        })?;
    
    info!("Successfully inserted {} events into {}", inserted_count, table_name);
    Ok(inserted_count)
}

/// Determines optimal batch size based on event count
fn determine_batch_size(event_count: usize) -> usize {
    match event_count {
        0..=1000 => 1000,
        1001..=5000 => MIN_BATCH_SIZE,
        5001..=20000 => DEFAULT_BATCH_SIZE,
        20001..=50000 => 20_000,
        _ => MAX_BATCH_SIZE,
    }
}

/// Converts API event format to SiemEvent
fn convert_api_event_to_siem(api_event: &EventInsert) -> Result<SiemEvent> {
    let now = Utc::now().timestamp() as u32;
    
    // Validate required fields
    if api_event.event_type.is_empty() {
        return Err(PipelineError::ValidationError("event_type is required".to_string()));
    }
    
    if api_event.source.is_empty() {
        return Err(PipelineError::ValidationError("source is required".to_string()));
    }
    
    if api_event.severity.is_empty() {
        return Err(PipelineError::ValidationError("severity is required".to_string()));
    }
    
    if api_event.message.is_empty() {
        return Err(PipelineError::ValidationError("message is required".to_string()));
    }
    
    // Validate severity
    if !is_valid_severity(&api_event.severity) {
        return Err(PipelineError::ValidationError(
            format!("Invalid severity: {}", api_event.severity)
        ));
    }
    
    // Validate IP addresses if provided
    if let Some(ip) = &api_event.source_ip {
        if !is_valid_ip(ip) {
            return Err(PipelineError::ValidationError(
                format!("Invalid source IP: {}", ip)
            ));
        }
    }
    
    if let Some(ip) = &api_event.dest_ip {
        if !is_valid_ip(ip) {
            return Err(PipelineError::ValidationError(
                format!("Invalid destination IP: {}", ip)
            ));
        }
    }
    
    // Generate ID if not provided
    let id = api_event.id.clone().unwrap_or_else(|| {
        format!("evt_{}", uuid::Uuid::new_v4().to_string().replace('-', ""))
    });
    
    // Convert timestamp
    let timestamp = api_event.timestamp
        .map(|ts| ts.timestamp() as u32)
        .unwrap_or(now);
    
    // Serialize parsed_fields if provided
    let parsed_fields = api_event.parsed_fields.as_ref()
        .map(|fields| serde_json::to_string(fields))
        .transpose()
        .map_err(|e| PipelineError::ValidationError(
            format!("Invalid parsed_fields JSON: {}", e)
        ))?;
    
    Ok(SiemEvent {
        id,
        timestamp,
        event_type: api_event.event_type.clone(),
        source: api_event.source.clone(),
        severity: api_event.severity.clone(),
        message: api_event.message.clone(),
        raw_log: api_event.raw_log.clone(),
        parsed_fields,
        source_ip: api_event.source_ip.clone(),
        dest_ip: api_event.dest_ip.clone(),
        source_port: api_event.source_port,
        dest_port: api_event.dest_port,
        protocol: api_event.protocol.clone(),
        user_agent: api_event.user_agent.clone(),
        http_method: api_event.http_method.clone(),
        url: api_event.url.clone(),
        status_code: api_event.status_code,
        bytes_in: api_event.bytes_in,
        bytes_out: api_event.bytes_out,
        duration_ms: api_event.duration_ms,
        tenant_id: api_event.tenant_id.clone(),
        tags: api_event.tags.clone().unwrap_or_default(),
        correlation_id: api_event.correlation_id.clone(),
        rule_id: api_event.rule_id.clone(),
        alert_id: api_event.alert_id.clone(),
        created_at: now,
        updated_at: None,
    })
}

/// Validates IP address format
fn is_valid_ip(ip: &str) -> bool {
    ip.parse::<std::net::IpAddr>().is_ok()
}

/// Validates severity level
fn is_valid_severity(severity: &str) -> bool {
    matches!(severity.to_lowercase().as_str(), "low" | "medium" | "high" | "critical")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    
    #[test]
    fn test_determine_batch_size() {
        assert_eq!(determine_batch_size(500), 1000);
        assert_eq!(determine_batch_size(3000), MIN_BATCH_SIZE);
        assert_eq!(determine_batch_size(10000), DEFAULT_BATCH_SIZE);
        assert_eq!(determine_batch_size(30000), 20_000);
        assert_eq!(determine_batch_size(100000), MAX_BATCH_SIZE);
    }
    
    #[test]
    fn test_convert_api_event_to_siem_valid() {
        let api_event = EventInsert {
            id: Some("test-id".to_string()),
            timestamp: Some(Utc::now()),
            event_type: "login".to_string(),
            source: "test-source".to_string(),
            severity: "high".to_string(),
            message: "Test message".to_string(),
            raw_log: Some("raw log data".to_string()),
            parsed_fields: Some(serde_json::json!({"key": "value"})),
            source_ip: Some("192.168.1.1".to_string()),
            dest_ip: Some("10.0.0.1".to_string()),
            source_port: Some(8080),
            dest_port: Some(443),
            protocol: Some("TCP".to_string()),
            user_agent: Some("test-agent".to_string()),
            http_method: Some("GET".to_string()),
            url: Some("/test".to_string()),
            status_code: Some(200),
            bytes_in: Some(1024),
            bytes_out: Some(2048),
            duration_ms: Some(100),
            tenant_id: Some("test-tenant".to_string()),
            tags: Some(vec!["tag1".to_string(), "tag2".to_string()]),
            correlation_id: Some("corr-123".to_string()),
            rule_id: Some("rule-456".to_string()),
            alert_id: Some("alert-789".to_string()),
        };
        
        let result = convert_api_event_to_siem(&api_event);
        assert!(result.is_ok());
        
        let siem_event = result.unwrap();
        assert_eq!(siem_event.id, "test-id");
        assert_eq!(siem_event.event_type, "login");
        assert_eq!(siem_event.source, "test-source");
        assert_eq!(siem_event.severity, "high");
    }
    
    #[test]
    fn test_convert_api_event_to_siem_missing_required() {
        let api_event = EventInsert {
            id: None,
            timestamp: None,
            event_type: "".to_string(), // Empty required field
            source: "test-source".to_string(),
            severity: "high".to_string(),
            message: "Test message".to_string(),
            raw_log: None,
            parsed_fields: None,
            source_ip: None,
            dest_ip: None,
            source_port: None,
            dest_port: None,
            protocol: None,
            user_agent: None,
            http_method: None,
            url: None,
            status_code: None,
            bytes_in: None,
            bytes_out: None,
            duration_ms: None,
            tenant_id: None,
            tags: None,
            correlation_id: None,
            rule_id: None,
            alert_id: None,
        };
        
        let result = convert_api_event_to_siem(&api_event);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_convert_api_event_to_siem_invalid_ip() {
        let api_event = EventInsert {
            id: None,
            timestamp: None,
            event_type: "login".to_string(),
            source: "test-source".to_string(),
            severity: "high".to_string(),
            message: "Test message".to_string(),
            raw_log: None,
            parsed_fields: None,
            source_ip: Some("invalid-ip".to_string()),
            dest_ip: None,
            source_port: None,
            dest_port: None,
            protocol: None,
            user_agent: None,
            http_method: None,
            url: None,
            status_code: None,
            bytes_in: None,
            bytes_out: None,
            duration_ms: None,
            tenant_id: None,
            tags: None,
            correlation_id: None,
            rule_id: None,
            alert_id: None,
        };
        
        let result = convert_api_event_to_siem(&api_event);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_is_valid_ip() {
        assert!(is_valid_ip("192.168.1.1"));
        assert!(is_valid_ip("::1"));
        assert!(!is_valid_ip("invalid-ip"));
        assert!(!is_valid_ip("999.999.999.999"));
    }
    
    #[test]
    fn test_is_valid_severity() {
        assert!(is_valid_severity("low"));
        assert!(is_valid_severity("HIGH"));
        assert!(is_valid_severity("Critical"));
        assert!(!is_valid_severity("invalid"));
    }
}