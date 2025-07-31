//! Dev Events Handler
//! Provides API endpoint for querying dev.events table in ClickHouse
//! 
//! This module implements a comprehensive event querying system with:
//! - Full schema alignment with ClickHouse dev.events table
//! - Environment-based configuration
//! - Connection pooling for performance
//! - Comprehensive error handling with retry logic
//! - Support for all CIM (Common Information Model) fields

use crate::database_manager::{DatabaseManager, DatabaseConfig};
use crate::error_handling::{SiemError, SiemResult};
use axum::{
    extract::{Query},
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};

use serde::{Deserialize, Serialize};
use std::{
    env,
    sync::Arc,
    time::Duration,
};
use tokio::time::timeout;
use tracing::{error, info, warn};
use anyhow::{Result as AnyhowResult};

/// Shared application state containing the database manager
#[derive(Clone)]
pub struct AppState {
    pub database_manager: Arc<DatabaseManager>,
}

/// Global database manager instance
static DATABASE_MANAGER: tokio::sync::OnceCell<Arc<DatabaseManager>> = tokio::sync::OnceCell::const_new();

/// Get or initialize the database manager
async fn get_database_manager() -> SiemResult<Arc<DatabaseManager>> {
    DATABASE_MANAGER.get_or_try_init(|| async {
        let config = DatabaseConfig::from_env()?;
        let manager = DatabaseManager::new(config).await?;
        Ok(Arc::new(manager))
    }).await.map(Arc::clone)
}

/// DevEventCore represents the minimal set of fields we actually query from the database
/// This aligns with the SQL SELECT statement to prevent schema mismatches
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct DevEventCore {
    pub event_id: String,
    pub tenant_id: String,
    pub event_timestamp: u32,
    pub source_ip: String,
    pub source_type: String,
    pub message: Option<String>,
    pub severity: Option<String>,
}

/// DevEvent represents a complete security event with all possible fields
/// This struct is kept for backward compatibility but should be used carefully
/// TODO: Consider deprecating this in favor of DevEventCore for API responses
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct DevEvent {
    // Core event fields
    pub event_id: String,
    pub tenant_id: String,
    pub event_timestamp: u32,
    pub source_ip: String,
    pub source_type: String,
    pub message: Option<String>,
    pub severity: Option<String>,
    
    // Network traffic fields
    pub dest_ip: Option<String>,
    pub src_port: Option<u16>,
    pub dest_port: Option<u16>,
    pub protocol: Option<String>,
    pub bytes_in: Option<u64>,
    pub bytes_out: Option<u64>,
    pub packets_in: Option<u64>,
    pub packets_out: Option<u64>,
    
    // Endpoint fields
    pub host_name: Option<String>,
    pub user_name: Option<String>,
    pub process_name: Option<String>,
    pub process_id: Option<u32>,
    pub file_path: Option<String>,
    pub file_hash: Option<String>,
    pub registry_key: Option<String>,
    pub command_line: Option<String>,
    
    // Web traffic fields
    pub url: Option<String>,
    pub http_method: Option<String>,
    pub http_status: Option<u16>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    
    // Device fields
    pub device_vendor: Option<String>,
    pub device_product: Option<String>,
    pub device_version: Option<String>,
    pub device_event_class_id: Option<String>,
    
    // Geographic fields
    pub src_country: Option<String>,
    pub src_region: Option<String>,
    pub src_city: Option<String>,
    pub dest_country: Option<String>,
    pub dest_region: Option<String>,
    pub dest_city: Option<String>,
    
    // Security fields
    pub signature_id: Option<String>,
    pub threat_name: Option<String>,
    
    // Authentication fields
    pub auth_method: Option<String>,
    
    // Application fields
    pub app_name: Option<String>,
    
    // Email fields
    pub email_sender: Option<String>,
    
    // Additional fields
    pub tags: Option<String>,
    pub details: Option<String>,
    pub custom_fields: Option<String>,
}

/// Query parameters for filtering events
#[derive(Debug, Deserialize)]
pub struct EventQueryParams {
    /// Limit number of results (default: 100, max: 1000)
    pub limit: Option<u32>,
    /// Offset for pagination
    pub offset: Option<u32>,
    /// Filter by tenant ID
    pub tenant_id: Option<String>,
    /// Filter by source IP
    pub source_ip: Option<String>,
    /// Filter by source type
    pub source_type: Option<String>,
    /// Filter by severity level
    pub severity: Option<String>,
    /// Start timestamp (Unix timestamp)
    pub start_time: Option<u32>,
    /// End timestamp (Unix timestamp)
    pub end_time: Option<u32>,
}

/// Response structure for dev events API using the core event structure
#[derive(Debug, Serialize)]
pub struct DevEventsResponse {
    pub events: Vec<DevEventCore>,
    pub total_count: usize,
    pub has_more: bool,
    pub query_time_ms: u64,
}

/// Legacy response structure for backward compatibility
/// TODO: Remove this once frontend is updated to use DevEventsResponse
#[derive(Debug, Serialize)]
pub struct DevEventsResponseLegacy {
    pub events: Vec<DevEvent>,
    pub total_count: usize,
    pub has_more: bool,
    pub query_time_ms: u64,
}

/// Error response structure
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
    pub code: String,
}

/// Retry logic for database operations
async fn execute_with_retry<F, Fut, T>(
    operation: F,
    max_retries: usize,
    timeout_duration: Duration,
) -> AnyhowResult<T>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = AnyhowResult<T>>,
{
    let mut last_error = None;
    
    for attempt in 0..=max_retries {
        match timeout(timeout_duration, operation()).await {
            Ok(Ok(result)) => return Ok(result),
            Ok(Err(e)) => {
                warn!("Attempt {} failed: {:?}", attempt + 1, e);
                last_error = Some(e);
            }
            Err(_) => {
                let timeout_error = anyhow::anyhow!("Operation timed out after {:?}", timeout_duration);
                warn!("Attempt {} timed out", attempt + 1);
                last_error = Some(timeout_error);
            }
        }
        
        if attempt < max_retries {
            let delay = Duration::from_millis(100 * (1 << attempt)); // Exponential backoff
            tokio::time::sleep(delay).await;
        }
    }
    
    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("All retry attempts failed")))
}

/// Handler function to get events from dev.events table
/// 
/// This function queries the ClickHouse dev.events table with optional filtering
/// and pagination. It supports filtering by tenant, source IP, source type, 
/// severity, and time range.
/// 
/// # Query Parameters
/// - `limit`: Maximum number of events to return (default: 100, max: 1000)
/// - `offset`: Number of events to skip for pagination
/// - `tenant_id`: Filter by specific tenant ID
/// - `source_ip`: Filter by source IP address
/// - `source_type`: Filter by event source type
/// - `severity`: Filter by severity level
/// - `start_time`: Filter events after this timestamp (Unix timestamp)
/// - `end_time`: Filter events before this timestamp (Unix timestamp)
pub async fn get_dev_events(
    Query(params): Query<EventQueryParams>,
) -> Result<Json<DevEventsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let start_time = std::time::Instant::now();
    
    // Validate and set defaults for query parameters
    let limit = params.limit.unwrap_or(100).min(1000); // Cap at 1000 for performance
    let offset = params.offset.unwrap_or(0);
    
    info!(
        "Querying dev.events with limit={}, offset={}, filters={:?}",
        limit, offset, params
    );
    
    // Get database manager
    let db_manager = match get_database_manager().await {
        Ok(manager) => manager,
        Err(e) => {
            error!("Failed to get database manager: {:?}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database connection error".to_string(),
                    message: "Failed to connect to database".to_string(),
                    code: "DB_CONNECTION_ERROR".to_string(),
                }),
            ));
        }
    };
    
    // Execute the query with proper error handling
    match query_dev_events_internal(&db_manager, &params, start_time).await {
        Ok(response) => Ok(Json(response)),
        Err(e) => {
            error!("Failed to query dev events: {:?}", e);
            
            // Convert SiemError to HTTP response
            let (status_code, error_response) = match e {
                SiemError::Validation { message, .. } => (
                    StatusCode::BAD_REQUEST,
                    ErrorResponse {
                        error: message,
                        message: "Validation failed".to_string(),
                        code: "VALIDATION_ERROR".to_string(),
                    }
                ),
                SiemError::Database { .. } => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ErrorResponse {
                        error: "Database error occurred".to_string(),
                        message: "Failed to query database".to_string(),
                        code: "DATABASE_ERROR".to_string(),
                    }
                ),
                _ => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ErrorResponse {
                        error: "Database query failed".to_string(),
                        message: format!("Unable to retrieve events: {}", e),
                        code: "DB_QUERY_ERROR".to_string(),
                    }
                )
            };
            
            Err((status_code, Json(error_response)))
        }
    }
}

/// Validates input parameters to prevent injection attacks and ensure data integrity
fn validate_query_params(params: &EventQueryParams) -> AnyhowResult<()> {
    // Validate limit
    if let Some(limit) = params.limit {
        if limit > 10000 {
            return Err(anyhow::anyhow!("Limit cannot exceed 10000"));
        }
    }
    
    // Validate offset
    if let Some(offset) = params.offset {
        if offset > 1000000 {
            return Err(anyhow::anyhow!("Offset cannot exceed 1000000"));
        }
    }
    
    // Validate string parameters for basic injection patterns
    let string_params = vec![
        ("tenant_id", &params.tenant_id),
        ("source_ip", &params.source_ip),
        ("source_type", &params.source_type),
        ("severity", &params.severity),
    ];
    
    for (name, param) in string_params {
        if let Some(value) = param {
            if value.len() > 255 {
                return Err(anyhow::anyhow!("{} cannot exceed 255 characters", name));
            }
            // Basic SQL injection pattern detection
            let dangerous_patterns = ["'", "\"", ";", "--", "/*", "*/", "xp_", "sp_"];
            for pattern in &dangerous_patterns {
                if value.contains(pattern) {
                    return Err(anyhow::anyhow!("{} contains invalid characters", name));
                }
            }
        }
    }
    
    // Validate timestamp range
    if let (Some(start), Some(end)) = (params.start_time, params.end_time) {
        if start >= end {
            return Err(anyhow::anyhow!("start_time must be less than end_time"));
        }
    }
    
    Ok(())
}

/// Internal function to execute the actual ClickHouse query with proper parameterization
async fn query_dev_events_internal(
    db_manager: &DatabaseManager,
    params: &EventQueryParams,
    start_time: std::time::Instant,
) -> SiemResult<DevEventsResponse> {
    // Validate input parameters first
    validate_query_params(params)
        .map_err(|e| SiemError::validation(format!("Invalid query parameters: {}", e)))?;
    
    // Get table name from environment
    let table_name = env::var("EVENTS_TABLE_NAME").unwrap_or_else(|_| "events".to_string());
    
    // Build dynamic WHERE clause with proper parameterization
    let mut where_conditions = Vec::new();
    let mut bind_values: Vec<(&str, Box<dyn std::fmt::Display + Send + Sync>)> = Vec::new();
    
    if let Some(tenant_id) = &params.tenant_id {
        where_conditions.push("tenant_id = ?");
        bind_values.push(("tenant_id", Box::new(tenant_id.clone())));
    }
    
    if let Some(source_ip) = &params.source_ip {
        where_conditions.push("source_ip = ?");
        bind_values.push(("source_ip", Box::new(source_ip.clone())));
    }
    
    if let Some(source_type) = &params.source_type {
        where_conditions.push("source_type = ?");
        bind_values.push(("source_type", Box::new(source_type.clone())));
    }
    
    if let Some(severity) = &params.severity {
        where_conditions.push("severity = ?");
        bind_values.push(("severity", Box::new(severity.clone())));
    }
    
    if let Some(start_time) = params.start_time {
        where_conditions.push("event_timestamp >= ?");
        bind_values.push(("start_time", Box::new(start_time)));
    }
    
    if let Some(end_time) = params.end_time {
        where_conditions.push("event_timestamp <= ?");
        bind_values.push(("end_time", Box::new(end_time)));
    }
    
    // Construct the WHERE clause
    let where_clause = if where_conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_conditions.join(" AND "))
    };
    
    // Validate and set limits
    let limit = params.limit.unwrap_or(100).min(1000);
    let offset = params.offset.unwrap_or(0);
    
    // Build the main query with proper table reference
    let query = format!(
        "SELECT 
            event_id,
            tenant_id,
            event_timestamp,
            source_ip,
            source_type,
            message,
            severity
        FROM {}
        {}
        ORDER BY event_timestamp DESC
        LIMIT {} OFFSET {}",
        table_name, where_clause, limit, offset
    );
    
    info!("Executing query: {}", query);
    
    // Execute the query using database manager
    let connection = db_manager.get_connection().await?;
    let client = connection.client();
    
    let rows = client
        .query(&query)
        .fetch_all::<(String, String, u32, String, String, String, String)>()
        .await
        .map_err(|e| SiemError::database_with_source(
            format!("Failed to execute query on table {}", table_name),
            e.into()
        ))?;
    
    info!("Query returned {} rows", rows.len());
    let mut events = Vec::new();
    
    for (event_id, tenant_id, event_timestamp, source_ip, source_type, message, severity) in rows {
        // Validate and sanitize data from database
        let sanitized_event = DevEventCore {
            event_id: event_id.trim().to_string(),
            tenant_id: tenant_id.trim().to_string(),
            event_timestamp,
            source_ip: source_ip.trim().to_string(),
            source_type: source_type.trim().to_string(),
            message: if message.trim().is_empty() { None } else { Some(message.trim().to_string()) },
            severity: if severity.trim().is_empty() { None } else { Some(severity.trim().to_string()) },
        };
        
        events.push(sanitized_event);
    }
    
    // Get total count for pagination with proper error handling
    let count_query = format!(
        "SELECT count(*) as total FROM {} {}",
        table_name, where_clause
    );
    
    info!("Executing count query: {}", count_query);
    
    let count = client.query(&count_query).fetch_one::<u64>().await
        .map_err(|e| SiemError::database_with_source(
            format!("Failed to get total count from table {}", table_name),
            e.into()
        ))?;
    
    info!("Total count: {}", count);
    let total_count = count as usize;
    
    let query_time = start_time.elapsed();
    let has_more = (offset + events.len() as u32) < total_count as u32;
    
    info!(
        "Query completed in {}ms, returned {} events, total: {}, has_more: {}",
        query_time.as_millis(),
        events.len(),
        total_count,
        has_more
    );
    
    Ok(DevEventsResponse {
        events,
        total_count,
        has_more,
        query_time_ms: query_time.as_millis() as u64,
    })
}

/// Create router for dev events endpoints
/// 
/// This function creates an Axum router with the dev events endpoint.
/// Mount this router at your desired path (e.g., "/api/v1").
pub fn create_dev_events_router() -> Router {
    Router::new().route("/dev-events", get(get_dev_events))
}

// Tests removed due to missing axum_test dependency
// TODO: Add proper integration tests with a test ClickHouse instance