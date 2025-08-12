//! System handlers for the SIEM unified pipeline
//!
//! This module provides HTTP handlers for system-level operations including
//! configuration management, system logs, maintenance tasks, and administrative functions.
//! It uses the SystemRepository trait for data access operations.

use axum::extract::{Path, Query, State};
use axum::response::{IntoResponse, Json};
use std::sync::Arc;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::dal::traits::SystemRepository;
use crate::handlers::handle_result;
use crate::types::api::*;

/// Handler for getting system configuration
/// 
/// Returns the current system configuration including global settings,
/// feature flags, and operational parameters.
pub async fn get_system_config<R>(
    State(system_repo): State<Arc<R>>,
) -> Result<Json<SystemConfigResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Getting system configuration");
    
    let result = system_repo.get_system_config().await;
    
    match &result {
        Ok(config) => {
            info!("Retrieved system configuration with {} settings", config.settings.len());
        }
        Err(e) => {
            warn!("Failed to retrieve system configuration: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for updating system configuration
/// 
/// Updates system configuration settings. Changes may require
/// service restart depending on the setting type.
pub async fn update_system_config<R>(
    State(system_repo): State<Arc<R>>,
    Json(request): Json<UpdateSystemConfigRequest>,
) -> Result<Json<SystemConfigResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Updating system configuration with {} settings", request.settings.len());
    
    // Validate request
    if let Err(validation_error) = validate_system_config_request(&request) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(validation_error)
        ));
    }
    
    let result = system_repo.update_system_config(&request).await;
    
    match &result {
        Ok(config) => {
            info!("Updated system configuration successfully");
        }
        Err(e) => {
            warn!("Failed to update system configuration: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting system logs
/// 
/// Returns system logs with optional filtering by level, component,
/// and time range. Supports pagination and search.
pub async fn get_system_logs<R>(
    State(system_repo): State<Arc<R>>,
    Query(query): Query<SystemLogsQuery>,
) -> Result<Json<SystemLogsResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Getting system logs with query: {:?}", query);
    
    // Validate query parameters
    if let Err(validation_error) = validate_system_logs_query(&query) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(validation_error)
        ));
    }
    
    let result = system_repo.get_system_logs(&query).await;
    
    match &result {
        Ok(logs) => {
            info!("Retrieved {} system log entries", logs.logs.len());
        }
        Err(e) => {
            warn!("Failed to retrieve system logs: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting system status
/// 
/// Returns comprehensive system status including component health,
/// resource usage, and operational metrics.
pub async fn get_system_status<R>(
    State(system_repo): State<Arc<R>>,
) -> Result<Json<SystemStatusResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Getting system status");
    
    let result = system_repo.get_system_status().await;
    
    match &result {
        Ok(status) => {
            info!("Retrieved system status: {} components, overall status: {}", 
                  status.components.len(), status.overall_status);
        }
        Err(e) => {
            warn!("Failed to retrieve system status: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting system metrics
/// 
/// Returns system-level metrics including performance counters,
/// resource utilization, and operational statistics.
pub async fn get_system_metrics<R>(
    State(system_repo): State<Arc<R>>,
    Query(query): Query<SystemMetricsQuery>,
) -> Result<Json<SystemMetricsResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Getting system metrics with query: {:?}", query);
    
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
    
    let result = system_repo.get_system_metrics(&query).await;
    
    match &result {
        Ok(metrics) => {
            info!("Retrieved system metrics: CPU {}%, Memory {}%, Disk {}%", 
                  metrics.cpu_usage_percent, metrics.memory_usage_percent, metrics.disk_usage_percent);
        }
        Err(e) => {
            warn!("Failed to retrieve system metrics: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for performing system maintenance tasks
/// 
/// Executes various maintenance tasks such as cleanup, optimization,
/// and data archival. Tasks run asynchronously.
pub async fn perform_maintenance<R>(
    State(system_repo): State<Arc<R>>,
    Json(request): Json<MaintenanceRequest>,
) -> Result<Json<MaintenanceResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Performing maintenance task: {:?}", request.task_type);
    
    // Validate request
    if let Err(validation_error) = validate_maintenance_request(&request) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(validation_error)
        ));
    }
    
    let result = system_repo.perform_maintenance(&request).await;
    
    match &result {
        Ok(response) => {
            info!("Maintenance task {} started with ID: {}", 
                  request.task_type, response.task_id);
        }
        Err(e) => {
            warn!("Failed to start maintenance task {:?}: {:?}", request.task_type, e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting maintenance task status
/// 
/// Returns the status and progress of a maintenance task.
pub async fn get_maintenance_status<R>(
    State(system_repo): State<Arc<R>>,
    Path(task_id): Path<Uuid>,
) -> Result<Json<MaintenanceStatusResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Getting maintenance task status: {}", task_id);
    
    let result = system_repo.get_maintenance_status(task_id).await;
    
    match &result {
        Ok(status) => {
            info!("Retrieved maintenance task status: {} - {}", 
                  task_id, status.status);
        }
        Err(e) => {
            warn!("Failed to retrieve maintenance task status {}: {:?}", task_id, e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting audit logs
/// 
/// Returns audit logs for system activities including user actions,
/// configuration changes, and administrative operations.
pub async fn get_audit_logs<R>(
    State(system_repo): State<Arc<R>>,
    Query(query): Query<AuditLogsQuery>,
) -> Result<Json<AuditLogsResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Getting audit logs with query: {:?}", query);
    
    // Validate query parameters
    if let Err(validation_error) = validate_audit_logs_query(&query) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(validation_error)
        ));
    }
    
    let result = system_repo.get_audit_logs(&query).await;
    
    match &result {
        Ok(logs) => {
            info!("Retrieved {} audit log entries", logs.logs.len());
        }
        Err(e) => {
            warn!("Failed to retrieve audit logs: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for creating system backup
/// 
/// Initiates a system backup including configuration, rules, and metadata.
/// Returns backup job information for tracking progress.
pub async fn create_backup<R>(
    State(system_repo): State<Arc<R>>,
    Json(request): Json<CreateBackupRequest>,
) -> Result<Json<BackupResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Creating system backup: {}", request.backup_name);
    
    // Validate request
    if let Err(validation_error) = validate_backup_request(&request) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(validation_error)
        ));
    }
    
    let result = system_repo.create_backup(&request).await;
    
    match &result {
        Ok(response) => {
            info!("Backup job started: {} with ID: {}", 
                  request.backup_name, response.backup_id);
        }
        Err(e) => {
            warn!("Failed to start backup '{}': {:?}", request.backup_name, e);
        }
    }
    
    handle_result!(result)
}

/// Handler for restoring from backup
/// 
/// Initiates a system restore from a specified backup.
/// This is a critical operation that may affect system availability.
pub async fn restore_backup<R>(
    State(system_repo): State<Arc<R>>,
    Path(backup_id): Path<Uuid>,
    Json(request): Json<RestoreBackupRequest>,
) -> Result<Json<RestoreResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Restoring from backup: {}", backup_id);
    
    // Validate request
    if let Err(validation_error) = validate_restore_request(&request) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(validation_error)
        ));
    }
    
    let result = system_repo.restore_backup(backup_id, &request).await;
    
    match &result {
        Ok(response) => {
            info!("Restore job started from backup {} with ID: {}", 
                  backup_id, response.restore_id);
        }
        Err(e) => {
            warn!("Failed to start restore from backup {}: {:?}", backup_id, e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting backup list
/// 
/// Returns a list of available backups with their metadata and status.
pub async fn get_backups<R>(
    State(system_repo): State<Arc<R>>,
    Query(query): Query<BackupsQuery>,
) -> Result<Json<BackupsResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Getting backups list with query: {:?}", query);
    
    // Validate query parameters
    if let Some(limit) = query.limit {
        if limit == 0 || limit > 1000 {
            return Err(crate::handlers::error_to_response(
                crate::error::SiemError::BadRequest(
                    "Limit must be between 1 and 1000".to_string()
                )
            ));
        }
    }
    
    let result = system_repo.get_backups(&query).await;
    
    match &result {
        Ok(backups) => {
            info!("Retrieved {} backups", backups.backups.len());
        }
        Err(e) => {
            warn!("Failed to retrieve backups: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for deleting a backup
/// 
/// Deletes a specified backup from storage.
/// This operation is irreversible.
pub async fn delete_backup<R>(
    State(system_repo): State<Arc<R>>,
    Path(backup_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Deleting backup: {}", backup_id);
    
    let result = system_repo.delete_backup(backup_id).await;
    
    match &result {
        Ok(_) => {
            info!("Deleted backup: {}", backup_id);
        }
        Err(e) => {
            warn!("Failed to delete backup {}: {:?}", backup_id, e);
        }
    }
    
    match result {
        Ok(_) => Ok(Json(serde_json::json!({
            "success": true,
            "message": "Backup deleted successfully",
            "backup_id": backup_id
        }))),
        Err(e) => Err(crate::handlers::error_to_response(e)),
    }
}

/// Handler for getting system information
/// 
/// Returns detailed system information including version, build info,
/// installed components, and system capabilities.
pub async fn get_system_info<R>(
    State(system_repo): State<Arc<R>>,
) -> Result<Json<SystemInfoResponse>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Getting system information");
    
    let result = system_repo.get_system_info().await;
    
    match &result {
        Ok(info) => {
            info!("Retrieved system information: version {}, build {}", 
                  info.version, info.build_info.build_number);
        }
        Err(e) => {
            warn!("Failed to retrieve system information: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for updating system settings
/// 
/// Updates specific system settings without requiring a full configuration update.
/// Supports hot-reloading for certain settings.
pub async fn update_system_settings<R>(
    State(system_repo): State<Arc<R>>,
    Json(request): Json<UpdateSystemSettingsRequest>,
) -> Result<Json<serde_json::Value>, impl IntoResponse>
where
    R: SystemRepository,
{
    debug!("Updating system settings: {:?}", request.settings.keys().collect::<Vec<_>>());
    
    // Validate request
    if request.settings.is_empty() {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(
                "Settings cannot be empty".to_string()
            )
        ));
    }
    
    let result = system_repo.update_settings(&request).await;
    
    match &result {
        Ok(_) => {
            info!("Updated {} system settings", request.settings.len());
        }
        Err(e) => {
            warn!("Failed to update system settings: {:?}", e);
        }
    }
    
    match result {
        Ok(_) => Ok(Json(serde_json::json!({
            "success": true,
            "message": "System settings updated successfully",
            "updated_count": request.settings.len()
        }))),
        Err(e) => Err(crate::handlers::error_to_response(e)),
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Validate system configuration request
fn validate_system_config_request(request: &UpdateSystemConfigRequest) -> Result<(), String> {
    if request.settings.is_empty() {
        return Err("Settings cannot be empty".to_string());
    }
    
    // Validate individual settings
    for (key, value) in &request.settings {
        if key.trim().is_empty() {
            return Err("Setting key cannot be empty".to_string());
        }
        
        if key.len() > 255 {
            return Err("Setting key cannot exceed 255 characters".to_string());
        }
        
        // Validate critical settings
        if is_critical_setting(key) && !validate_critical_setting_value(key, value) {
            return Err(format!("Invalid value for critical setting: {}", key));
        }
    }
    
    Ok(())
}

/// Validate system logs query
fn validate_system_logs_query(query: &SystemLogsQuery) -> Result<(), String> {
    // Validate page and limit
    if let Some(page) = query.page {
        if page == 0 {
            return Err("Page number must be greater than 0".to_string());
        }
    }
    
    if let Some(limit) = query.limit {
        if limit == 0 || limit > 10000 {
            return Err("Limit must be between 1 and 10000".to_string());
        }
    }
    
    // Validate log level
    if let Some(level) = &query.level {
        if !is_valid_log_level(level) {
            return Err(format!("Invalid log level: {}", level));
        }
    }
    
    // Validate time range
    if let (Some(start), Some(end)) = (&query.start_time, &query.end_time) {
        if start >= end {
            return Err("Start time must be before end time".to_string());
        }
    }
    
    Ok(())
}

/// Validate maintenance request
fn validate_maintenance_request(request: &MaintenanceRequest) -> Result<(), String> {
    if !is_valid_maintenance_task(&request.task_type) {
        return Err(format!("Invalid maintenance task type: {}", request.task_type));
    }
    
    // Validate task-specific parameters
    match request.task_type.as_str() {
        "cleanup" => {
            if let Some(params) = &request.parameters {
                if let Some(days) = params.get("retention_days") {
                    if let Some(days_num) = days.as_u64() {
                        if days_num == 0 || days_num > 3650 {
                            return Err("Retention days must be between 1 and 3650".to_string());
                        }
                    }
                }
            }
        }
        "optimize" => {
            // Optimization tasks don't require additional validation
        }
        "archive" => {
            if let Some(params) = &request.parameters {
                if params.get("archive_path").is_none() {
                    return Err("Archive path is required for archive tasks".to_string());
                }
            } else {
                return Err("Parameters are required for archive tasks".to_string());
            }
        }
        _ => {
            return Err(format!("Unsupported maintenance task: {}", request.task_type));
        }
    }
    
    Ok(())
}

/// Validate audit logs query
fn validate_audit_logs_query(query: &AuditLogsQuery) -> Result<(), String> {
    // Validate page and limit
    if let Some(page) = query.page {
        if page == 0 {
            return Err("Page number must be greater than 0".to_string());
        }
    }
    
    if let Some(limit) = query.limit {
        if limit == 0 || limit > 10000 {
            return Err("Limit must be between 1 and 10000".to_string());
        }
    }
    
    // Validate action type
    if let Some(action) = &query.action {
        if !is_valid_audit_action(action) {
            return Err(format!("Invalid audit action: {}", action));
        }
    }
    
    // Validate time range
    if let (Some(start), Some(end)) = (&query.start_time, &query.end_time) {
        if start >= end {
            return Err("Start time must be before end time".to_string());
        }
    }
    
    Ok(())
}

/// Validate backup request
fn validate_backup_request(request: &CreateBackupRequest) -> Result<(), String> {
    if request.backup_name.trim().is_empty() {
        return Err("Backup name cannot be empty".to_string());
    }
    
    if request.backup_name.len() > 255 {
        return Err("Backup name cannot exceed 255 characters".to_string());
    }
    
    // Validate backup name format (alphanumeric, hyphens, underscores)
    if !request.backup_name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Backup name can only contain alphanumeric characters, hyphens, and underscores".to_string());
    }
    
    Ok(())
}

/// Validate restore request
fn validate_restore_request(request: &RestoreBackupRequest) -> Result<(), String> {
    if request.components.is_empty() {
        return Err("At least one component must be selected for restore".to_string());
    }
    
    // Validate component names
    for component in &request.components {
        if !is_valid_backup_component(component) {
            return Err(format!("Invalid backup component: {}", component));
        }
    }
    
    Ok(())
}

/// Check if a setting is critical
fn is_critical_setting(key: &str) -> bool {
    matches!(
        key,
        "database.connection_string" | "security.encryption_key" | "auth.jwt_secret" |
        "clickhouse.host" | "clickhouse.port" | "redis.host" | "redis.port"
    )
}

/// Validate critical setting value
fn validate_critical_setting_value(key: &str, value: &serde_json::Value) -> bool {
    match key {
        "clickhouse.port" | "redis.port" => {
            if let Some(port) = value.as_u64() {
                port > 0 && port <= 65535
            } else {
                false
            }
        }
        "database.connection_string" | "security.encryption_key" | "auth.jwt_secret" => {
            if let Some(s) = value.as_str() {
                !s.trim().is_empty()
            } else {
                false
            }
        }
        _ => true, // Other settings are assumed valid
    }
}

/// Validate log level
fn is_valid_log_level(level: &str) -> bool {
    matches!(level.to_lowercase().as_str(), "trace" | "debug" | "info" | "warn" | "error")
}

/// Validate maintenance task type
fn is_valid_maintenance_task(task_type: &str) -> bool {
    matches!(task_type.to_lowercase().as_str(), "cleanup" | "optimize" | "archive" | "reindex")
}

/// Validate audit action
fn is_valid_audit_action(action: &str) -> bool {
    matches!(
        action.to_lowercase().as_str(),
        "create" | "update" | "delete" | "login" | "logout" | "config_change" |
        "rule_create" | "rule_update" | "rule_delete" | "alert_create" | "alert_update"
    )
}

/// Validate backup component
fn is_valid_backup_component(component: &str) -> bool {
    matches!(
        component.to_lowercase().as_str(),
        "configuration" | "rules" | "alerts" | "users" | "log_sources" | "dashboards" | "metadata"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    
    #[test]
    fn test_validate_system_config_request_valid() {
        let request = UpdateSystemConfigRequest {
            settings: vec![
                ("log_level".to_string(), json!("info")),
                ("max_events_per_second".to_string(), json!(1000)),
            ].into_iter().collect(),
        };
        
        assert!(validate_system_config_request(&request).is_ok());
    }
    
    #[test]
    fn test_validate_system_logs_query_valid() {
        let query = SystemLogsQuery {
            page: Some(1),
            limit: Some(100),
            level: Some("info".to_string()),
            component: Some("api".to_string()),
            start_time: None,
            end_time: None,
            search: None,
        };
        
        assert!(validate_system_logs_query(&query).is_ok());
    }
    
    #[test]
    fn test_validate_backup_request_valid() {
        let request = CreateBackupRequest {
            backup_name: "daily_backup_2024_01_15".to_string(),
            description: Some("Daily automated backup".to_string()),
            components: vec!["configuration".to_string(), "rules".to_string()],
            compression: Some(true),
        };
        
        assert!(validate_backup_request(&request).is_ok());
    }
    
    #[test]
    fn test_validate_backup_request_invalid_name() {
        let request = CreateBackupRequest {
            backup_name: "invalid name with spaces!".to_string(),
            description: None,
            components: vec!["configuration".to_string()],
            compression: None,
        };
        
        assert!(validate_backup_request(&request).is_err());
    }
    
    #[test]
    fn test_is_valid_log_level() {
        assert!(is_valid_log_level("info"));
        assert!(is_valid_log_level("ERROR")); // Case insensitive
        assert!(is_valid_log_level("debug"));
        assert!(!is_valid_log_level("invalid"));
    }
    
    #[test]
    fn test_is_valid_maintenance_task() {
        assert!(is_valid_maintenance_task("cleanup"));
        assert!(is_valid_maintenance_task("OPTIMIZE")); // Case insensitive
        assert!(is_valid_maintenance_task("archive"));
        assert!(!is_valid_maintenance_task("invalid"));
    }
    
    #[test]
    fn test_is_critical_setting() {
        assert!(is_critical_setting("database.connection_string"));
        assert!(is_critical_setting("clickhouse.port"));
        assert!(!is_critical_setting("log_level"));
    }
}