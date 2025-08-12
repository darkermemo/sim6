//! ClickHouse-based event handlers for the SIEM unified pipeline
//!
//! This module provides HTTP handlers for event-related operations using
//! direct ClickHouse client integration, replacing the repository pattern
//! for improved performance and simplified architecture.

use axum::extract::{Path, Query, State};
use axum::response::{IntoResponse, Json};
use axum::http::StatusCode;
use clickhouse::Client;
use serde_json::json;
use std::sync::Arc;
use tracing::{debug, error, info, warn};
use chrono::{DateTime, Utc};

use crate::error::{PipelineError, Result};
use crate::models::SiemEvent;
use crate::state::AppState;
use crate::types::api::*;

/// Handler for searching events using ClickHouse
/// 
/// This endpoint allows searching for events with various filters including
/// time range, tenant, IP addresses, user, severity, and free-text search.
/// Results are paginated and returned in snake_case format.
pub async fn search_events(
    State(app_state): State<Arc<AppState>>,
    Query(query): Query<EventSearchQuery>,
) -> std::result::Result<Json<EventSearchResponse>, impl IntoResponse> {
    debug!("Searching events with query: {:?}", query);
    
    // Validate query parameters
    if let Err(validation_error) = validate_event_search_query(&query) {
        return Err((StatusCode::BAD_REQUEST, Json(json!({"error": validation_error}))));
    }
    
    match search_events_impl(&app_state.ch, &app_state.events_table, &query).await {
        Ok(response) => {
            info!("Event search completed, found {} events", response.events.len());
            Ok(Json(response))
        }
        Err(e) => {
            error!("Failed to search events: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "Failed to search events",
                "details": e.to_string()
            }))))
        }
    }
}

/// Handler for getting a single event by ID
/// 
/// Returns detailed information about a specific event identified by its ID.
/// Returns 404 if the event is not found.
pub async fn get_event_by_id(
    State(app_state): State<Arc<AppState>>,
    Path(event_id): Path<String>,
) -> std::result::Result<Json<EventDetail>, impl IntoResponse> {
    debug!("Getting event by ID: {}", event_id);
    
    match get_event_by_id_impl(&app_state.ch, &app_state.events_table, &event_id).await {
        Ok(Some(event)) => {
            info!("Event found: {}", event_id);
            Ok(Json(event))
        }
        Ok(None) => {
            debug!("Event not found: {}", event_id);
            Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "error": "Not found",
                    "message": format!("Event not found: {}", event_id)
                }))
            ))
        }
        Err(e) => {
            error!("Failed to get event by ID: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error occurred"}))))
        }
    }
}

/// Handler for getting event count
/// 
/// Returns the total number of events, optionally filtered by time range and tenant.
/// Useful for dashboard statistics and monitoring.
pub async fn get_event_count(
    State(app_state): State<Arc<AppState>>,
    Query(query): Query<EventCountQuery>,
) -> std::result::Result<Json<EventCountResponse>, impl IntoResponse> {
    debug!("Getting event count with query: {:?}", query);
    
    match get_event_count_impl(
        &app_state.ch,
        &app_state.events_table,
        query.start_time,
        query.end_time,
        query.tenant_id.as_deref(),
    ).await {
        Ok(count) => {
            info!("Event count retrieved: {}", count);
            Ok(Json(EventCountResponse { count }))
        }
        Err(e) => {
            error!("Failed to execute search query: {}", e);
            return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "Failed to get event count",
                "details": e.to_string()
            }))));
        }
    }
}

/// Handler for getting EPS (Events Per Second) statistics
/// 
/// Returns real-time EPS metrics for monitoring pipeline performance.
/// Includes global EPS and per-tenant breakdown.
pub async fn get_eps_stats(
    State(app_state): State<Arc<AppState>>,
    Query(query): Query<EpsQuery>,
) -> std::result::Result<Json<EpsResponse>, impl IntoResponse> {
    debug!("Getting EPS stats with query: {:?}", query);
    
    let window_seconds = query.window_seconds.unwrap_or(60);
    
    match get_eps_stats_impl(
        &app_state.ch,
        &app_state.events_table,
        window_seconds,
    ).await {
        Ok(eps_data) => {
            info!("EPS stats retrieved: global={:.2}, tenants={}", 
                  eps_data.global.current_eps, eps_data.per_tenant.len());
            Ok(Json(eps_data))
        }
        Err(e) => {
            error!("Failed to parse query: {}", e);
            return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error occurred"}))));
        }
    }
}

/// Implementation function for searching events
async fn search_events_impl(
    client: &Client,
    table_name: &str,
    query: &EventSearchQuery,
) -> Result<EventSearchResponse> {
    let mut sql = format!("SELECT * FROM {}", table_name);
    let mut conditions = Vec::new();
    let mut bind_values = Vec::new();
    
    // Build WHERE conditions with bind parameters
    if let Some(start_time) = query.start_time {
        conditions.push("event_timestamp >= ?".to_string());
        bind_values.push(start_time.timestamp().to_string());
    }
    
    if let Some(end_time) = query.end_time {
        conditions.push("event_timestamp <= ?".to_string());
        bind_values.push(end_time.timestamp().to_string());
    }
    
    if let Some(tenant_id) = &query.tenant_id {
        conditions.push("tenant_id = ?".to_string());
        bind_values.push(tenant_id.clone());
    }
    
    if let Some(source) = &query.source {
        conditions.push("source_type = ?".to_string());
        bind_values.push(source.clone());
    }
    
    if let Some(severity) = &query.severity {
        conditions.push("severity = ?".to_string());
        bind_values.push(severity.clone());
    }
    
    if let Some(event_type) = &query.event_type {
        conditions.push("event_category = ?".to_string());
        bind_values.push(event_type.clone());
    }
    
    if let Some(search_text) = &query.query {
        conditions.push("message ILIKE ?".to_string());
        let search_pattern = format!("%{}%", search_text);
        bind_values.push(search_pattern);
    }
    
    // Add WHERE clause if we have conditions
    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }
    
    // Add ORDER BY
    sql.push_str(" ORDER BY timestamp DESC");
    
    // Add LIMIT and OFFSET
    let limit = query.limit.unwrap_or(100).min(1000); // Cap at 1000
    let offset = query.offset.unwrap_or(0);
    sql.push_str(&format!(" LIMIT {} OFFSET {}", limit, offset));
    
    debug!("Executing query: {} with {} bind values", sql, bind_values.len());
    
    // Execute query with bind parameters
    let mut query_builder = client.query(&sql);
    for value in bind_values {
        query_builder = query_builder.bind(value);
    }
    
    let events: Vec<SiemEvent> = query_builder
        .fetch_all()
        .await
        .map_err(|e| {
            error!("ClickHouse query failed: {}", e);
            PipelineError::database(format!("Query execution failed: {}", e))
        })?;
    
    // Convert to API format
    let api_events: Vec<EventDetail> = events
        .into_iter()
        .map(|event| EventDetail {
            id: event.event_id,
            timestamp: DateTime::from_timestamp(event.event_timestamp as i64, 0)
                .unwrap_or_else(|| Utc::now()),
            source: event.source_type.clone().unwrap_or_else(|| "unknown".to_string()),
            source_type: event.source_type.unwrap_or_else(|| "unknown".to_string()),
            severity: event.severity.unwrap_or_else(|| "info".to_string()),
            message: event.message.unwrap_or_else(|| "No message".to_string()),
            raw_message: event.raw_event,
            source_ip: event.source_ip,
            destination_ip: event.destination_ip,
            user_id: event.user_id,
            user_name: event.user_name,
            tenant_id: event.tenant_id,
            event_category: event.event_category,
            event_action: event.event_action,
            event_outcome: event.event_outcome,
            metadata: serde_json::from_str(&event.metadata).unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new())),
            tags: None,
            correlation_id: None,
            rule_id: None,
            alert_id: None,
            created_at: DateTime::from_timestamp(event.created_at as i64, 0)
                .unwrap_or_else(|| Utc::now()),
            updated_at: None,
        })
        .collect();
    
    Ok(EventSearchResponse {
        events: api_events,
        total_count: api_events.len() as u64,
        page_info: PageInfo {
            limit: limit,
            offset: offset,
            has_next: api_events.len() == limit as usize,
            has_previous: offset > 0,
            total_pages: 1, // Simplified for now
            current_page: (offset / limit) + 1,
        },
        query_time_ms: 0.0, // Could be measured with timing
    })
}

/// Implementation function for getting event by ID
async fn get_event_by_id_impl(
    client: &Client,
    table_name: &str,
    event_id: &str,
) -> Result<Option<EventDetail>> {
    let sql = format!("SELECT * FROM {} WHERE id = ? LIMIT 1", table_name);
    
    debug!("Getting event by ID: {}", event_id);
    
    let events: Vec<SiemEvent> = client
        .query(&sql)
        .bind(event_id)
        .fetch_all()
        .await
        .map_err(|e| {
            error!("ClickHouse query failed: {}", e);
            PipelineError::database(format!("Query execution failed: {}", e))
        })?;
    
    if let Some(event) = events.into_iter().next() {
        Ok(Some(EventDetail {
            id: event.event_id,
            timestamp: DateTime::from_timestamp(event.event_timestamp as i64, 0)
                .unwrap_or_else(|| Utc::now()),
            source: event.source_type.clone().unwrap_or_else(|| "unknown".to_string()),
            source_type: event.source_type.unwrap_or_else(|| "unknown".to_string()),
            severity: event.severity.unwrap_or_else(|| "info".to_string()),
            message: event.message.unwrap_or_else(|| "No message".to_string()),
            raw_message: event.raw_event,
            source_ip: event.source_ip,
            destination_ip: event.destination_ip,
            user_id: event.user_id,
            user_name: event.user_name,
            tenant_id: event.tenant_id,
            event_category: event.event_category,
            event_action: event.event_action,
            event_outcome: event.event_outcome,
            metadata: serde_json::from_str(&event.metadata).unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new())),
            tags: None, // Not available in storage SiemEvent
            correlation_id: None, // Not available in storage SiemEvent
            rule_id: None, // Not available in storage SiemEvent
            alert_id: None, // Not available in storage SiemEvent
            created_at: DateTime::from_timestamp(event.created_at as i64, 0)
                .unwrap_or_else(|| Utc::now()),
            updated_at: None, // Not available in storage SiemEvent
        }))
    } else {
        Ok(None)
    }
}

/// Implementation function for getting event count
async fn get_event_count_impl(
    client: &Client,
    table_name: &str,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    tenant_id: Option<&str>,
) -> Result<u64> {
    let mut sql = format!("SELECT COUNT(*) as count FROM {}", table_name);
    let mut conditions = Vec::new();
    
    if start_time.is_some() {
        conditions.push("timestamp >= ?".to_string());
    }
    
    if end_time.is_some() {
        conditions.push("timestamp <= ?".to_string());
    }
    
    if tenant_id.is_some() {
        conditions.push("tenant_id = ?".to_string());
    }
    
    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }
    
    debug!("Executing count query: {}", sql);
    
    let mut query_builder = client.query(&sql);
    
    if let Some(start_time) = start_time {
        query_builder = query_builder.bind(start_time.timestamp() as u32);
    }
    
    if let Some(end_time) = end_time {
        query_builder = query_builder.bind(end_time.timestamp() as u32);
    }
    
    if let Some(tenant_id) = tenant_id {
        query_builder = query_builder.bind(tenant_id);
    }
    
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct CountResult {
        count: u64,
    }
    
    let result: Vec<CountResult> = query_builder
        .fetch_all()
        .await
        .map_err(|e| {
            error!("ClickHouse count query failed: {}", e);
            PipelineError::database(format!("Count query execution failed: {}", e))
        })?;
    
    Ok(result.into_iter().next().map(|r| r.count).unwrap_or(0))
}

/// Implementation function for getting EPS statistics
async fn get_eps_stats_impl(
    client: &Client,
    table_name: &str,
    window_seconds: u32,
) -> Result<EpsResponse> {
    let now = Utc::now().timestamp() as u32;
    let start_time = now - window_seconds;
    
    // Global EPS query
    let global_sql = format!(
        "SELECT COUNT(*) as count FROM {} WHERE timestamp >= ? AND timestamp <= ?",
        table_name
    );
    
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct CountResult {
        count: u64,
    }
    
    let global_result: Vec<CountResult> = client
        .query(&global_sql)
        .bind(start_time)
        .bind(now)
        .fetch_all()
        .await
        .map_err(|e| {
            error!("ClickHouse global EPS query failed: {}", e);
            PipelineError::database(format!("Global EPS query failed: {}", e))
        })?;
    
    let total_events = global_result.into_iter().next().map(|r| r.count).unwrap_or(0);
    let global_eps = total_events as f64 / window_seconds as f64;
    
    // Per-tenant EPS query
    let tenant_sql = format!(
        "SELECT tenant_id, COUNT(*) as count FROM {} WHERE timestamp >= ? AND timestamp <= ? AND tenant_id IS NOT NULL GROUP BY tenant_id",
        table_name
    );
    
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct TenantCountResult {
        tenant_id: String,
        count: u64,
    }
    
    let tenant_results: Vec<TenantCountResult> = client
        .query(&tenant_sql)
        .bind(start_time)
        .bind(now)
        .fetch_all()
        .await
        .map_err(|e| {
            warn!("ClickHouse per-tenant EPS query failed: {}", e);
            // Don't fail the entire request for per-tenant stats
            Vec::<TenantCountResult>::new()
        })
        .unwrap_or_default();
    
    let per_tenant_eps: Vec<(String, f64)> = tenant_results
        .into_iter()
        .map(|result| {
            let eps = result.count as f64 / window_seconds as f64;
            (result.tenant_id, eps)
        })
        .collect();
    
    Ok(EpsResponse {
        global: EpsStats {
            avg_eps: global_eps,
            current_eps: global_eps,
            peak_eps: global_eps,
            window_seconds: window_seconds as u64,
        },
        per_tenant: per_tenant_eps.into_iter().map(|(tenant_id, eps)| {
            (tenant_id, EpsStats {
                avg_eps: eps,
                current_eps: eps,
                peak_eps: eps,
                window_seconds: window_seconds as u64,
            })
        }).collect(),
        timestamp: Utc::now(),
        sql: "EPS calculation query".to_string(),
        rows_used: total_events,
    })
}

/// Validates event search query parameters
fn validate_event_search_query(query: &EventSearchQuery) -> std::result::Result<(), String> {
    // Validate time range
    if let (Some(start), Some(end)) = (query.start_time, query.end_time) {
        if start >= end {
            return Err("start_time must be before end_time".to_string());
        }
        
        let now = Utc::now();
        if start > now {
            return Err("start_time cannot be in the future".to_string());
        }
        
        // Limit time range to prevent excessive queries
        let max_range = chrono::Duration::days(30);
        if end - start > max_range {
            return Err("Time range cannot exceed 30 days".to_string());
        }
    }
    
    // Validate IP addresses
    if let Some(ip) = &query.source_ip {
        if !is_valid_ip(ip) {
            return Err(format!("Invalid source IP address: {}", ip));
        }
    }
    
    if let Some(ip) = &query.dest_ip {
        if !is_valid_ip(ip) {
            return Err(format!("Invalid destination IP address: {}", ip));
        }
    }
    
    // Validate severity
    if let Some(severity) = &query.severity {
        if !is_valid_severity(severity) {
            return Err(format!("Invalid severity level: {}", severity));
        }
    }
    
    // Validate pagination
    if let Some(limit) = query.limit {
        if limit == 0 || limit > 1000 {
            return Err("Limit must be between 1 and 1000".to_string());
        }
    }
    
    // Validate search text length
    if let Some(search) = &query.search {
        if search.len() < 3 {
            return Err("Search text must be at least 3 characters".to_string());
        }
        if search.len() > 500 {
            return Err("Search text cannot exceed 500 characters".to_string());
        }
    }
    
    Ok(())
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
    fn test_validate_event_search_query_valid() {
        let query = EventSearchQuery {
            query: Some("test search".to_string()),
            source: Some("test-source".to_string()),
            start_time: Some(Utc::now() - chrono::Duration::hours(1)),
            end_time: Some(Utc::now()),
            limit: Some(50),
            offset: Some(0),
            tenant_id: Some("test-tenant".to_string()),
            severity: Some("high".to_string()),
            event_type: Some("login".to_string()),
        };
        
        assert!(validate_event_search_query(&query).is_ok());
    }
    
    #[test]
    fn test_validate_event_search_query_invalid_time_range() {
        let query = EventSearchQuery {
            query: None,
            source: None,
            start_time: Some(Utc::now()),
            end_time: Some(Utc::now() - chrono::Duration::hours(1)),
            limit: None,
            offset: None,
            tenant_id: None,
            severity: None,
            event_type: None,
        };
        
        assert!(validate_event_search_query(&query).is_err());
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