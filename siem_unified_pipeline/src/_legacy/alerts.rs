//! Alert handlers for the SIEM unified pipeline
//!
//! This module provides HTTP handlers for alert management operations including
//! creating, retrieving, updating, and managing security alerts.
//! It uses the AlertRepository trait for data access operations.

use axum::extract::{Path, Query, State};
use axum::response::{IntoResponse, Json};
use std::sync::Arc;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::dal::traits::AlertRepository;
use crate::handlers::handle_result;
use crate::types::api::*;

/// Handler for getting all alerts
/// 
/// Returns a paginated list of alerts with optional filtering by status,
/// severity, and time range. Supports sorting and pagination.
pub async fn get_alerts<R>(
    State(alert_repo): State<Arc<R>>,
    Query(query): Query<AlertsQuery>,
) -> Result<Json<AlertsResponse>, impl IntoResponse>
where
    R: AlertRepository,
{
    debug!("Getting alerts with query: {:?}", query);
    
    // Validate query parameters
    if let Err(validation_error) = validate_alerts_query(&query) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(validation_error)
        ));
    }
    
    let result = alert_repo.get_alerts(&query).await;
    
    match &result {
        Ok(alerts) => {
            info!("Retrieved {} alerts", alerts.alerts.len());
        }
        Err(e) => {
            warn!("Failed to retrieve alerts: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting a specific alert by ID
/// 
/// Returns detailed information about a specific alert including
/// its history, related events, and current status.
pub async fn get_alert_by_id<R>(
    State(alert_repo): State<Arc<R>>,
    Path(alert_id): Path<Uuid>,
) -> Result<Json<AlertDetail>, impl IntoResponse>
where
    R: AlertRepository,
{
    debug!("Getting alert by ID: {}", alert_id);
    
    let result = alert_repo.get_alert_by_id(alert_id).await;
    
    match &result {
        Ok(alert) => {
            info!("Retrieved alert: {} ({})", alert.id, alert.title);
        }
        Err(e) => {
            warn!("Failed to retrieve alert {}: {:?}", alert_id, e);
        }
    }
    
    handle_result!(result)
}

/// Handler for creating a new alert
/// 
/// Creates a new security alert with the provided details.
/// Validates the alert data and assigns a unique ID.
pub async fn create_alert<R>(
    State(alert_repo): State<Arc<R>>,
    Json(request): Json<CreateAlertRequest>,
) -> Result<Json<AlertDetail>, impl IntoResponse>
where
    R: AlertRepository,
{
    debug!("Creating new alert: {}", request.title);
    
    // Validate request
    if let Err(validation_error) = validate_create_alert_request(&request) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(validation_error)
        ));
    }
    
    let result = alert_repo.create_alert(&request).await;
    
    match &result {
        Ok(alert) => {
            info!("Created alert: {} ({})", alert.id, alert.title);
        }
        Err(e) => {
            warn!("Failed to create alert '{}': {:?}", request.title, e);
        }
    }
    
    handle_result!(result)
}

/// Handler for updating an existing alert
/// 
/// Updates an existing alert with new information.
/// Supports partial updates and maintains audit trail.
pub async fn update_alert<R>(
    State(alert_repo): State<Arc<R>>,
    Path(alert_id): Path<Uuid>,
    Json(request): Json<UpdateAlertRequest>,
) -> Result<Json<AlertDetail>, impl IntoResponse>
where
    R: AlertRepository,
{
    debug!("Updating alert: {}", alert_id);
    
    // Validate request
    if let Err(validation_error) = validate_update_alert_request(&request) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(validation_error)
        ));
    }
    
    let result = alert_repo.update_alert(alert_id, &request).await;
    
    match &result {
        Ok(alert) => {
            info!("Updated alert: {} ({})", alert.id, alert.title);
        }
        Err(e) => {
            warn!("Failed to update alert {}: {:?}", alert_id, e);
        }
    }
    
    handle_result!(result)
}

/// Handler for deleting an alert
/// 
/// Soft deletes an alert by marking it as deleted.
/// Maintains audit trail and related data integrity.
pub async fn delete_alert<R>(
    State(alert_repo): State<Arc<R>>,
    Path(alert_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, impl IntoResponse>
where
    R: AlertRepository,
{
    debug!("Deleting alert: {}", alert_id);
    
    let result = alert_repo.delete_alert(alert_id).await;
    
    match &result {
        Ok(_) => {
            info!("Deleted alert: {}", alert_id);
        }
        Err(e) => {
            warn!("Failed to delete alert {}: {:?}", alert_id, e);
        }
    }
    
    match result {
        Ok(_) => Ok(Json(serde_json::json!({
            "success": true,
            "message": "Alert deleted successfully",
            "alert_id": alert_id
        }))),
        Err(e) => Err(crate::handlers::error_to_response(e)),
    }
}

/// Handler for updating alert status
/// 
/// Updates the status of an alert (e.g., open, investigating, resolved).
/// Maintains status history and audit trail.
pub async fn update_alert_status<R>(
    State(alert_repo): State<Arc<R>>,
    Path(alert_id): Path<Uuid>,
    Json(request): Json<UpdateAlertStatusRequest>,
) -> Result<Json<AlertDetail>, impl IntoResponse>
where
    R: AlertRepository,
{
    debug!("Updating alert status: {} -> {:?}", alert_id, request.status);
    
    // Validate status
    if !is_valid_alert_status(&request.status) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(
                format!("Invalid alert status: {}", request.status)
            )
        ));
    }
    
    let result = alert_repo.update_alert_status(alert_id, &request).await;
    
    match &result {
        Ok(alert) => {
            info!("Updated alert {} status to: {}", alert_id, request.status);
        }
        Err(e) => {
            warn!("Failed to update alert {} status: {:?}", alert_id, e);
        }
    }
    
    handle_result!(result)
}

/// Handler for assigning an alert to a user
/// 
/// Assigns an alert to a specific user for investigation.
/// Updates assignment history and notifications.
pub async fn assign_alert<R>(
    State(alert_repo): State<Arc<R>>,
    Path(alert_id): Path<Uuid>,
    Json(request): Json<AssignAlertRequest>,
) -> Result<Json<AlertDetail>, impl IntoResponse>
where
    R: AlertRepository,
{
    debug!("Assigning alert {} to user: {}", alert_id, request.assigned_to);
    
    // Validate user ID format
    if request.assigned_to.trim().is_empty() {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(
                "Assigned user cannot be empty".to_string()
            )
        ));
    }
    
    let result = alert_repo.assign_alert(alert_id, &request).await;
    
    match &result {
        Ok(alert) => {
            info!("Assigned alert {} to user: {}", alert_id, request.assigned_to);
        }
        Err(e) => {
            warn!("Failed to assign alert {} to user {}: {:?}", 
                  alert_id, request.assigned_to, e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting alert statistics
/// 
/// Returns statistics about alerts including counts by status,
/// severity, and time-based metrics.
pub async fn get_alert_stats<R>(
    State(alert_repo): State<Arc<R>>,
    Query(query): Query<AlertStatsQuery>,
) -> Result<Json<AlertStatsResponse>, impl IntoResponse>
where
    R: AlertRepository,
{
    debug!("Getting alert statistics with query: {:?}", query);
    
    // Validate time range if provided
    if let (Some(start), Some(end)) = (&query.start_time, &query.end_time) {
        if start >= end {
            return Err(crate::handlers::error_to_response(
                crate::error::SiemError::BadRequest(
                    "Start time must be before end time".to_string()
                )
            ));
        }
    }
    
    let result = alert_repo.get_alert_stats(&query).await;
    
    match &result {
        Ok(stats) => {
            info!("Retrieved alert statistics: {} total alerts", stats.total_alerts);
        }
        Err(e) => {
            warn!("Failed to retrieve alert statistics: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting alert history
/// 
/// Returns the history of changes for a specific alert including
/// status changes, assignments, and updates.
pub async fn get_alert_history<R>(
    State(alert_repo): State<Arc<R>>,
    Path(alert_id): Path<Uuid>,
) -> Result<Json<AlertHistoryResponse>, impl IntoResponse>
where
    R: AlertRepository,
{
    debug!("Getting alert history for: {}", alert_id);
    
    let result = alert_repo.get_alert_history(alert_id).await;
    
    match &result {
        Ok(history) => {
            info!("Retrieved {} history entries for alert {}", 
                  history.history.len(), alert_id);
        }
        Err(e) => {
            warn!("Failed to retrieve alert history for {}: {:?}", alert_id, e);
        }
    }
    
    handle_result!(result)
}

/// Handler for bulk alert operations
/// 
/// Performs bulk operations on multiple alerts such as status updates,
/// assignments, or deletions.
pub async fn bulk_alert_operations<R>(
    State(alert_repo): State<Arc<R>>,
    Json(request): Json<BulkAlertOperationRequest>,
) -> Result<Json<BulkAlertOperationResponse>, impl IntoResponse>
where
    R: AlertRepository,
{
    debug!("Performing bulk alert operation: {:?} on {} alerts", 
           request.operation, request.alert_ids.len());
    
    // Validate request
    if request.alert_ids.is_empty() {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(
                "Alert IDs list cannot be empty".to_string()
            )
        ));
    }
    
    if request.alert_ids.len() > 100 {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(
                "Cannot perform bulk operations on more than 100 alerts at once".to_string()
            )
        ));
    }
    
    let result = alert_repo.bulk_alert_operations(&request).await;
    
    match &result {
        Ok(response) => {
            info!("Bulk operation completed: {} successful, {} failed", 
                  response.successful_count, response.failed_count);
        }
        Err(e) => {
            warn!("Bulk alert operation failed: {:?}", e);
        }
    }
    
    handle_result!(result)
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Validate alerts query parameters
fn validate_alerts_query(query: &AlertsQuery) -> Result<(), String> {
    // Validate page and limit
    if let Some(page) = query.page {
        if page == 0 {
            return Err("Page number must be greater than 0".to_string());
        }
    }
    
    if let Some(limit) = query.limit {
        if limit == 0 || limit > 1000 {
            return Err("Limit must be between 1 and 1000".to_string());
        }
    }
    
    // Validate severity
    if let Some(severity) = &query.severity {
        if !is_valid_severity(severity) {
            return Err(format!("Invalid severity: {}", severity));
        }
    }
    
    // Validate status
    if let Some(status) = &query.status {
        if !is_valid_alert_status(status) {
            return Err(format!("Invalid status: {}", status));
        }
    }
    
    // Validate time range
    if let (Some(start), Some(end)) = (&query.start_time, &query.end_time) {
        if start >= end {
            return Err("Start time must be before end time".to_string());
        }
        
        let duration = *end - *start;
        if duration.num_days() > 365 {
            return Err("Time range cannot exceed 365 days".to_string());
        }
    }
    
    Ok(())
}

/// Validate create alert request
fn validate_create_alert_request(request: &CreateAlertRequest) -> Result<(), String> {
    if request.title.trim().is_empty() {
        return Err("Alert title cannot be empty".to_string());
    }
    
    if request.title.len() > 255 {
        return Err("Alert title cannot exceed 255 characters".to_string());
    }
    
    if !is_valid_severity(&request.severity) {
        return Err(format!("Invalid severity: {}", request.severity));
    }
    
    if request.description.len() > 5000 {
        return Err("Alert description cannot exceed 5000 characters".to_string());
    }
    
    Ok(())
}

/// Validate update alert request
fn validate_update_alert_request(request: &UpdateAlertRequest) -> Result<(), String> {
    if let Some(title) = &request.title {
        if title.trim().is_empty() {
            return Err("Alert title cannot be empty".to_string());
        }
        
        if title.len() > 255 {
            return Err("Alert title cannot exceed 255 characters".to_string());
        }
    }
    
    if let Some(severity) = &request.severity {
        if !is_valid_severity(severity) {
            return Err(format!("Invalid severity: {}", severity));
        }
    }
    
    if let Some(description) = &request.description {
        if description.len() > 5000 {
            return Err("Alert description cannot exceed 5000 characters".to_string());
        }
    }
    
    Ok(())
}

/// Validate alert severity
fn is_valid_severity(severity: &str) -> bool {
    matches!(severity.to_lowercase().as_str(), "low" | "medium" | "high" | "critical")
}

/// Validate alert status
fn is_valid_alert_status(status: &str) -> bool {
    matches!(
        status.to_lowercase().as_str(),
        "open" | "investigating" | "resolved" | "closed" | "false_positive"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    
    #[test]
    fn test_validate_alerts_query_valid() {
        let query = AlertsQuery {
            page: Some(1),
            limit: Some(50),
            status: Some("open".to_string()),
            severity: Some("high".to_string()),
            assigned_to: None,
            start_time: Some(Utc::now() - chrono::Duration::hours(24)),
            end_time: Some(Utc::now()),
            sort_by: Some("created_at".to_string()),
            sort_order: Some("desc".to_string()),
        };
        
        assert!(validate_alerts_query(&query).is_ok());
    }
    
    #[test]
    fn test_validate_alerts_query_invalid_page() {
        let query = AlertsQuery {
            page: Some(0),
            limit: None,
            status: None,
            severity: None,
            assigned_to: None,
            start_time: None,
            end_time: None,
            sort_by: None,
            sort_order: None,
        };
        
        assert!(validate_alerts_query(&query).is_err());
    }
    
    #[test]
    fn test_validate_create_alert_request_valid() {
        let request = CreateAlertRequest {
            title: "Test Alert".to_string(),
            description: "Test description".to_string(),
            severity: "high".to_string(),
            rule_id: Some(Uuid::new_v4()),
            event_ids: vec![],
            metadata: None,
        };
        
        assert!(validate_create_alert_request(&request).is_ok());
    }
    
    #[test]
    fn test_validate_create_alert_request_empty_title() {
        let request = CreateAlertRequest {
            title: "".to_string(),
            description: "Test description".to_string(),
            severity: "high".to_string(),
            rule_id: None,
            event_ids: vec![],
            metadata: None,
        };
        
        assert!(validate_create_alert_request(&request).is_err());
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
    
    #[test]
    fn test_is_valid_alert_status() {
        assert!(is_valid_alert_status("open"));
        assert!(is_valid_alert_status("investigating"));
        assert!(is_valid_alert_status("resolved"));
        assert!(is_valid_alert_status("closed"));
        assert!(is_valid_alert_status("false_positive"));
        assert!(is_valid_alert_status("OPEN")); // Case insensitive
        assert!(!is_valid_alert_status("invalid"));
    }
}