//! Event handlers for the SIEM unified pipeline
//!
//! This module provides HTTP handlers for event-related operations including
//! event search, retrieval, and statistics. It uses the EventRepository trait
//! for database operations, ensuring clean separation of concerns.

use axum::extract::{Path, Query, State};
use axum::response::{IntoResponse, Json};
use std::sync::Arc;
use tracing::{debug, info};

use crate::dal::traits::EventRepository;
use crate::handlers::handle_result;
use crate::types::api::*;

/// Handler for searching events
/// 
/// This endpoint allows searching for events with various filters including
/// time range, tenant, IP addresses, user, severity, and free-text search.
/// Results are paginated and returned in snake_case format.
pub async fn search_events<R>(
    State(event_repo): State<Arc<R>>,
    Query(query): Query<EventSearchQuery>,
) -> Result<Json<EventSearchResponse>, impl IntoResponse>
where
    R: EventRepository,
{
    debug!("Searching events with query: {:?}", query);
    
    // Validate query parameters
    if let Err(validation_error) = validate_event_search_query(&query) {
        return Err(crate::handlers::error_to_response(
            crate::error::PipelineError::ValidationError(validation_error)
        ));
    }
    
    let result = event_repo.search_events(&query).await;
    info!("Event search completed, found {} events", 
          result.as_ref().map(|r| r.events.len()).unwrap_or(0));
    
    handle_result!(result)
}

/// Handler for getting a single event by ID
/// 
/// Returns detailed information about a specific event identified by its ID.
/// Returns 404 if the event is not found.
pub async fn get_event_by_id<R>(
    State(event_repo): State<Arc<R>>,
    Path(event_id): Path<String>,
) -> Result<Json<EventDetail>, impl IntoResponse>
where
    R: EventRepository,
{
    debug!("Getting event by ID: {}", event_id);
    
    let result = event_repo.get_event_by_id(&event_id).await;
    
    match result {
        Ok(Some(event)) => {
            info!("Event found: {}", event_id);
            Ok(Json(event))
        }
        Ok(None) => {
            debug!("Event not found: {}", event_id);
            Err(crate::handlers::error_to_response(
                crate::error::PipelineError::ValidationError(format!("Event not found: {}", event_id))
            ))
        }
        Err(e) => Err(crate::handlers::error_to_response(e)),
    }
}

/// Handler for getting event count
/// 
/// Returns the total number of events, optionally filtered by time range and tenant.
/// Useful for dashboard statistics and monitoring.
pub async fn get_event_count<R>(
    State(event_repo): State<Arc<R>>,
    Query(query): Query<EventCountQuery>,
) -> Result<Json<EventCountResponse>, impl IntoResponse>
where
    R: EventRepository,
{
    debug!("Getting event count with query: {:?}", query);
    
    let result = event_repo
        .get_event_count(
            query.start_time,
            query.end_time,
            query.tenant_id.as_deref(),
        )
        .await;
    
    match result {
        Ok(count) => {
            info!("Event count retrieved: {}", count);
            Ok(Json(EventCountResponse { count }))
        }
        Err(e) => Err(crate::handlers::error_to_response(e)),
    }
}

/// Handler for getting events per second (EPS) statistics
/// 
/// Returns current, average, and maximum events per second statistics
/// for the specified time window. Used for performance monitoring.
pub async fn get_eps_stats<R>(
    State(event_repo): State<Arc<R>>,
    Query(query): Query<EpsQuery>,
) -> Result<Json<EpsResponse>, impl IntoResponse>
where
    R: EventRepository,
{
    debug!("Getting EPS stats with window: {} seconds", query.window_seconds.unwrap_or(60));
    
    let window_seconds = query.window_seconds.unwrap_or(60);
    
    // Validate window size
    if window_seconds == 0 || window_seconds > 3600 {
        return Err(crate::handlers::error_to_response(
            crate::error::PipelineError::ValidationError(
                "Window seconds must be between 1 and 3600".to_string()
            )
        ));
    }
    
    let result = event_repo.get_eps_stats(window_seconds.into()).await;
    
    match result {
        Ok(eps_stats) => {
            info!("EPS stats retrieved: current={}, avg={}, peak={}", 
                  eps_stats.global.current_eps, eps_stats.global.avg_eps, eps_stats.global.peak_eps);
            Ok(Json(eps_stats))
        }
        Err(e) => Err(crate::handlers::error_to_response(e)),
    }
}

/// Handler for getting recent events
/// 
/// Returns the most recent events, optionally filtered by source type and severity.
/// Used for real-time monitoring and event streaming interfaces.
pub async fn get_recent_events<R>(
    State(event_repo): State<Arc<R>>,
    Query(query): Query<RecentEventsQuery>,
) -> Result<Json<RecentEventsResponse>, impl IntoResponse>
where
    R: EventRepository,
{
    debug!("Getting recent events with query: {:?}", query);
    
    let limit = query.limit.unwrap_or(50);
    
    // Validate limit
    if limit == 0 || limit > 1000 {
        return Err(crate::handlers::error_to_response(
            crate::error::PipelineError::ValidationError(
                "Limit must be between 1 and 1000".to_string()
            )
        ));
    }
    
    let result = event_repo
        .get_recent_events(
            limit,
            query.source.as_deref(),
        query.severity.as_deref(),
        )
        .await;
    
    match result {
        Ok(events) => {
            info!("Recent events retrieved: {} events", events.len());
            Ok(Json(RecentEventsResponse { events }))
        }
        Err(e) => Err(crate::handlers::error_to_response(e)),
    }
}

/// Handler for event streaming (Server-Sent Events)
/// 
/// Provides real-time event streaming using Server-Sent Events (SSE).
/// Clients can subscribe to receive new events as they arrive.
pub async fn stream_events<R>(
    State(event_repo): State<Arc<R>>,
    Query(query): Query<EventStreamQuery>,
) -> impl IntoResponse
where
    R: EventRepository,
{
    debug!("Starting event stream with query: {:?}", query);
    
    // For now, return a simple response indicating streaming is not yet implemented
    // TODO: Implement actual SSE streaming
    let response = serde_json::json!({
        "message": "Event streaming not yet implemented",
        "query": query
    });
    
    Json(response)
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Validate event search query parameters
fn validate_event_search_query(query: &EventSearchQuery) -> Result<(), String> {
    // Validate time range
    if let (Some(start), Some(end)) = (&query.start_time, &query.end_time) {
        if start >= end {
            return Err("Start time must be before end time".to_string());
        }
        
        let duration = *end - *start;
        if duration.num_days() > 30 {
            return Err("Time range cannot exceed 30 days".to_string());
        }
    }
    
    // Validate pagination
    if let Some(limit) = query.limit {
        if limit == 0 || limit > 1000 {
            return Err("Limit must be between 1 and 1000".to_string());
        }
    }
    
    if let Some(offset) = query.offset {
        if offset > 100000 {
            return Err("Offset cannot exceed 100000".to_string());
        }
    }
    
    // Validate IP addresses if provided
    if let Some(ip) = &query.source_ip {
        if !is_valid_ip(ip) {
            return Err("Invalid source IP address format".to_string());
        }
    }
    
    if let Some(ip) = &query.destination_ip {
        if !is_valid_ip(ip) {
            return Err("Invalid destination IP address format".to_string());
        }
    }
    
    // Validate severity if provided
    if let Some(severity) = &query.severity {
        if !is_valid_severity(severity) {
            return Err("Invalid severity level".to_string());
        }
    }
    
    // Validate search term length
    if let Some(search_term) = &query.search_term {
        if search_term.len() > 1000 {
            return Err("Search term cannot exceed 1000 characters".to_string());
        }
    }
    
    Ok(())
}

/// Validate IP address format (basic validation)
fn is_valid_ip(ip: &str) -> bool {
    ip.parse::<std::net::IpAddr>().is_ok()
}

/// Validate severity level
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
            start_time: Some(Utc::now() - chrono::Duration::hours(1)),
            end_time: Some(Utc::now()),
            tenant_id: Some("test-tenant".to_string()),
            source_ip: Some("192.168.1.1".to_string()),
            destination_ip: Some("10.0.0.1".to_string()),
            user_name: Some("testuser".to_string()),
            severity: Some("high".to_string()),
            event_category: Some("authentication".to_string()),
            search_term: Some("login".to_string()),
            limit: Some(100),
            offset: Some(0),
            sort_order: Some("desc".to_string()),
        };
        
        assert!(validate_event_search_query(&query).is_ok());
    }
    
    #[test]
    fn test_validate_event_search_query_invalid_time_range() {
        let now = Utc::now();
        let query = EventSearchQuery {
            start_time: Some(now),
            end_time: Some(now - chrono::Duration::hours(1)), // End before start
            tenant_id: None,
            source_ip: None,
            destination_ip: None,
            user_name: None,
            severity: None,
            event_category: None,
            search_term: None,
            limit: None,
            offset: None,
            sort_order: None,
        };
        
        assert!(validate_event_search_query(&query).is_err());
    }
    
    #[test]
    fn test_validate_event_search_query_invalid_ip() {
        let query = EventSearchQuery {
            start_time: None,
            end_time: None,
            tenant_id: None,
            source_ip: Some("invalid-ip".to_string()),
            destination_ip: None,
            user_name: None,
            severity: None,
            event_category: None,
            search_term: None,
            limit: None,
            offset: None,
            sort_order: None,
        };
        
        assert!(validate_event_search_query(&query).is_err());
    }
    
    #[test]
    fn test_validate_event_search_query_invalid_severity() {
        let query = EventSearchQuery {
            start_time: None,
            end_time: None,
            tenant_id: None,
            source_ip: None,
            destination_ip: None,
            user_name: None,
            severity: Some("invalid-severity".to_string()),
            event_category: None,
            search_term: None,
            limit: None,
            offset: None,
            sort_order: None,
        };
        
        assert!(validate_event_search_query(&query).is_err());
    }
    
    #[test]
    fn test_is_valid_ip() {
        assert!(is_valid_ip("192.168.1.1"));
        assert!(is_valid_ip("::1"));
        assert!(is_valid_ip("2001:db8::1"));
        assert!(!is_valid_ip("invalid-ip"));
        assert!(!is_valid_ip("999.999.999.999"));
    }
    
    #[test]
    fn test_is_valid_severity() {
        assert!(is_valid_severity("low"));
        assert!(is_valid_severity("medium"));
        assert!(is_valid_severity("high"));
        assert!(is_valid_severity("critical"));
        assert!(is_valid_severity("HIGH")); // Case insensitive
        assert!(!is_valid_severity("invalid"));
    }
}