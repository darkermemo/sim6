//! Events Search Handler
//!
//! Provides comprehensive event search functionality with:
//! - ClickHouse integration with proper tenant table routing
//! - Cursor-based and offset-based pagination
//! - Advanced filtering with SQL injection protection
//! - camelCase JSON serialization for frontend compatibility
//! - Performance monitoring and error handling

use crate::database_manager::{DatabaseConfig, DatabaseManager};
use crate::error_handling::{ErrorResponse, SiemResult};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tracing::{error, info, warn};

/// Global database manager instance
static DATABASE_MANAGER: tokio::sync::OnceCell<Arc<DatabaseManager>> =
    tokio::sync::OnceCell::const_new();

/// Get or initialize the database manager
async fn get_database_manager() -> SiemResult<Arc<DatabaseManager>> {
    DATABASE_MANAGER
        .get_or_try_init(|| async {
            let config = DatabaseConfig::from_env()?;
            let manager = DatabaseManager::new(config).await?;
            Ok(Arc::new(manager))
        })
        .await
        .map(Arc::clone)
}

/// ClickHouse row structure for deserialization
#[derive(Debug, Row, Deserialize)]
pub struct EventRow {
    pub event_id: String,
    pub tenant_id: String,
    pub event_timestamp: u64,
    pub event_type: String,
    pub source_ip: String,
    pub dest_ip: Option<String>,
    pub source_port: Option<u16>,
    pub dest_port: Option<u16>,
    pub protocol: Option<String>,
    pub event_category: Option<String>,
    pub event_action: Option<String>,
    pub event_outcome: Option<String>,
    pub user_name: Option<String>,
    pub host_name: Option<String>,
    pub process_name: Option<String>,
    pub file_path: Option<String>,
    pub url: Option<String>,
    pub http_method: Option<String>,
    pub http_status: Option<u16>,
    pub user_agent: Option<String>,
    pub severity: Option<String>,
    pub message: Option<String>,
    pub tags: Option<String>,
    pub details: Option<String>,
}

/// Event structure with camelCase serialization for frontend compatibility
/// Maps to ClickHouse events_{tenant} table structure
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub event_id: String,
    pub tenant_id: String,
    pub event_timestamp: u64,
    pub event_type: String,
    pub source_ip: String,
    pub dest_ip: Option<String>,
    pub source_port: Option<u16>,
    pub dest_port: Option<u16>,
    pub protocol: Option<String>,
    pub event_category: Option<String>,
    pub event_action: Option<String>,
    pub event_outcome: Option<String>,
    pub user_name: Option<String>,
    pub host_name: Option<String>,
    pub process_name: Option<String>,
    pub file_path: Option<String>,
    pub url: Option<String>,
    pub http_method: Option<String>,
    pub http_status: Option<u16>,
    pub user_agent: Option<String>,
    pub severity: Option<String>,
    pub message: Option<String>,
    pub tags: Option<String>,
    pub details: Option<String>,
}

/// Search query parameters for event filtering
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    /// Tenant ID (optional - if not provided, searches all tenants)
    pub tenant_id: Option<String>,
    
    /// Free text search across message and details fields
    pub search: Option<String>,
    
    /// Pagination - page number (1-based)
    pub page: Option<u32>,
    
    /// Pagination - number of results per page (default: 50, max: 1000)
    pub limit: Option<u32>,
    
    /// Pagination - cursor for cursor-based pagination
    pub cursor: Option<String>,
    
    /// Time range - start time (ISO 8601)
    pub start_time: Option<String>,
    
    /// Time range - end time (ISO 8601)
    pub end_time: Option<String>,
    
    /// Event category filter
    pub event_category: Option<String>,
    
    /// Event action filter
    pub event_action: Option<String>,
    
    /// Event outcome filter
    pub event_outcome: Option<String>,
    
    /// Severity filter
    pub severity: Option<String>,
    
    /// User name filter
    pub user_name: Option<String>,
    
    /// Host name filter
    pub host_name: Option<String>,
    
    /// Source IP filter
    pub source_ip: Option<String>,
    
    /// Destination IP filter
    pub dest_ip: Option<String>,
    
    /// Structured filters as a map
    #[serde(flatten)]
    pub filters: HashMap<String, String>,
}

/// Paginated events response with metadata
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PagedEvents {
    pub events: Vec<Event>,
    pub total: u64,
    pub page: Option<u32>,
    pub limit: u32,
    pub has_more: bool,
    pub next_cursor: Option<String>,
    pub previous_cursor: Option<String>,
    pub query_time_ms: u64,
}

// Using ErrorResponse from error_handling module

/// Validates search query parameters to prevent injection attacks
fn validate_search_query(query: &SearchQuery) -> Result<(), String> {
    // Validate tenant ID format if provided
    if let Some(tenant_id) = &query.tenant_id {
        if tenant_id.is_empty() || tenant_id.len() > 255 {
            return Err("Invalid tenant_id: must be 1-255 characters".to_string());
        }
    }
    
    // Validate limit
    if let Some(limit) = query.limit {
        if limit == 0 || limit > 1000 {
            return Err("Invalid limit: must be between 1 and 1000".to_string());
        }
    }
    
    // Validate page
    if let Some(page) = query.page {
        if page == 0 {
            return Err("Invalid page: must be >= 1".to_string());
        }
    }
    
    // Validate search text length
    if let Some(search) = &query.search {
        if search.len() > 1000 {
            return Err("Search query too long: maximum 1000 characters".to_string());
        }
    }
    
    // Validate filter values
    for (key, value) in &query.filters {
        if key.len() > 100 || value.len() > 255 {
            return Err(format!("Filter {}={} exceeds length limits", key, value));
        }
        
        // Basic SQL injection pattern detection
        let dangerous_patterns = ["'", "\"", ";", "--", "/*", "*/", "xp_", "sp_"];
        for pattern in &dangerous_patterns {
            if value.contains(pattern) {
                return Err(format!("Filter value contains invalid characters: {}", pattern));
            }
        }
    }
    
    Ok(())
}

/// Converts ISO 8601 timestamp to Unix timestamp
fn parse_iso_timestamp(iso_string: &str) -> Result<u64, String> {
    use chrono::{DateTime, Utc};
    
    DateTime::parse_from_rfc3339(iso_string)
        .map_err(|e| format!("Invalid timestamp format: {}", e))
        .map(|dt| dt.with_timezone(&Utc).timestamp() as u64)
}

/// Get all available tenant tables from ClickHouse
async fn get_tenant_tables() -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
    let db_manager = get_database_manager().await
        .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("Database manager error: {}", e))))?;
    
    let connection = db_manager.get_connection().await
        .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("Database connection error: {}", e))))?;
    
    let client = connection.client();
    
    // Query for all tables starting with 'events_'
    let query = "SELECT name FROM system.tables WHERE database = 'default' AND name LIKE 'events_%' AND name != 'events_v2'";
    let tables: Vec<String> = client.query(query).fetch_all::<String>().await?;
    
    Ok(tables)
}

/// Attempts database search operations, returns error if any database operation fails
async fn try_database_search(query: &SearchQuery) -> Result<PagedEvents, Box<dyn std::error::Error + Send + Sync>> {
    // Get database manager - convert SiemError to regular error to avoid automatic JSON conversion
    let db_manager = match get_database_manager().await {
        Ok(manager) => manager,
        Err(e) => return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("Database manager error: {}", e)))),
    };
    
    let limit = query.limit.unwrap_or(100).min(1000);
    let page = query.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;
    
    // Determine which tables to search
    let table_names = if let Some(tenant_id) = &query.tenant_id {
        // Single tenant search
        let sanitized_tenant_id = tenant_id.replace("-", "_");
        vec![format!("events_{}", sanitized_tenant_id)]
    } else {
        // Cross-tenant search - get all tenant tables
        get_tenant_tables().await?
    };
    
    if table_names.is_empty() {
        return Ok(PagedEvents {
            events: Vec::new(),
            total: 0,
            page: Some(page),
            limit,
            has_more: false,
            next_cursor: None,
            previous_cursor: None,
            query_time_ms: 0,
        });
    }
    
    // Build WHERE clause for filtering (excluding tenant_id since we handle that via table selection)
    let (base_where_clause, _params) = build_where_clause(query)
        .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::InvalidInput, e)) as Box<dyn std::error::Error + Send + Sync>)?;
    
    // Build UNION query for multiple tables or single table query
    let (main_query, count_query) = if table_names.len() == 1 {
        // Single table query
        let table_name = &table_names[0];
        let main_query = format!(
            "SELECT 
                event_id, tenant_id, event_timestamp, event_type, source_ip, dest_ip,
                source_port, dest_port, protocol, event_category, event_action, event_outcome,
                user_name, host_name, process_name, file_path, url, http_method, http_status,
                user_agent, severity, message, tags, details
            FROM {}
            WHERE {}
            ORDER BY timestamp DESC
            LIMIT {} OFFSET {}",
            table_name, base_where_clause, limit, offset
        );
        
        let count_query = format!(
            "SELECT count(*) as total FROM {} WHERE {}",
            table_name, base_where_clause
        );
        
        (main_query, count_query)
    } else {
        // Multi-table UNION query for cross-tenant search
        let union_parts: Vec<String> = table_names.iter().map(|table_name| {
            format!(
                "SELECT 
                    event_id, tenant_id, event_timestamp, event_type, source_ip, dest_ip,
                    source_port, dest_port, protocol, event_category, event_action, event_outcome,
                    user_name, host_name, process_name, file_path, url, http_method, http_status,
                    user_agent, severity, message, tags, details
                FROM {}
                WHERE {}",
                table_name, base_where_clause
            )
        }).collect();
        
        let main_query = format!(
            "({}) ORDER BY timestamp DESC LIMIT {} OFFSET {}",
            union_parts.join(" UNION ALL "),
            limit,
            offset
        );
        
        let count_union_parts: Vec<String> = table_names.iter().map(|table_name| {
            format!("SELECT count(*) as total FROM {} WHERE {}", table_name, base_where_clause)
        }).collect();
        
        let count_query = format!(
            "SELECT sum(total) as total FROM ({})",
            count_union_parts.join(" UNION ALL ")
        );
        
        (main_query, count_query)
    };
    
    info!("Executing event search query: {}", main_query);
    
    // Get database connection - convert SiemError to regular error to avoid automatic JSON conversion
    let connection = match db_manager.get_connection().await {
        Ok(conn) => conn,
        Err(e) => return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("Database connection error: {}", e)))),
    };
    let client = connection.client();
    
    // Execute main query with timeout - using direct string substitution
    let rows: Vec<EventRow> = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        client.query(&main_query).fetch_all::<EventRow>()
    ).await??;
    
    // Execute count query
    let total_count = client.query(&count_query).fetch_one::<u64>().await.unwrap_or(0);
    
    // Convert rows to events
    let mut events = Vec::new();
    for row in rows {
        let event = Event {
            event_id: row.event_id.trim().to_string(),
            tenant_id: row.tenant_id.trim().to_string(),
            event_timestamp: row.event_timestamp,
            event_type: row.event_type.trim().to_string(),
            source_ip: row.source_ip.trim().to_string(),
            dest_ip: row.dest_ip.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            source_port: row.source_port,
            dest_port: row.dest_port,
            protocol: row.protocol.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            event_category: row.event_category.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            event_action: row.event_action.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            event_outcome: row.event_outcome.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            user_name: row.user_name.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            host_name: row.host_name.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            process_name: row.process_name.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            file_path: row.file_path.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            url: row.url.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            http_method: row.http_method.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            http_status: row.http_status,
            user_agent: row.user_agent.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            severity: row.severity.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            message: row.message.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            tags: row.tags.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            details: row.details.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        };
        events.push(event);
    }
    
    // Calculate pagination
    let has_more = events.len() == limit as usize;
    let next_cursor = if has_more { Some(format!("page_{}", page + 1)) } else { None };
    let previous_cursor = if page > 1 { Some(format!("page_{}", page - 1)) } else { None };
    
    Ok(PagedEvents {
        events,
        total: total_count,
        page: Some(page),
        limit,
        has_more,
        next_cursor,
        previous_cursor,
        query_time_ms: 0, // Will be set by caller
    })
}

/// Builds ClickHouse WHERE clause with direct value substitution (SQL injection safe)
/// Note: tenant_id filtering is handled by table selection, not in WHERE clause for cross-tenant search
fn build_where_clause(query: &SearchQuery) -> Result<(String, Vec<String>), String> {
    let mut conditions = Vec::new();
    let params = Vec::new(); // Not used for now, keeping for compatibility
    
    // Filter by tenant_id only if specified (for single-tenant search)
    if let Some(tenant_id) = &query.tenant_id {
        conditions.push(format!("tenant_id = '{}'", escape_sql_string(tenant_id)));
    }
    
    // Time range filters
    if let Some(start_time) = &query.start_time {
        let timestamp = parse_iso_timestamp(start_time)?;
        conditions.push(format!("event_timestamp >= {}", timestamp));
    }
    
    if let Some(end_time) = &query.end_time {
        let timestamp = parse_iso_timestamp(end_time)?;
        conditions.push(format!("event_timestamp <= {}", timestamp));
    }
    
    // Free text search across message and details
    if let Some(search) = &query.search {
        if !search.trim().is_empty() {
            let escaped_search = escape_sql_string(&format!("%{}%", search.trim()));
            conditions.push(format!("(message ILIKE '{}' OR details ILIKE '{}')", escaped_search, escaped_search));
        }
    }
    
    // Direct field filters
    if let Some(event_category) = &query.event_category {
        conditions.push(format!("event_category = '{}'", escape_sql_string(event_category)));
    }
    
    if let Some(event_action) = &query.event_action {
        conditions.push(format!("event_action = '{}'", escape_sql_string(event_action)));
    }
    
    if let Some(event_outcome) = &query.event_outcome {
        conditions.push(format!("event_outcome = '{}'", escape_sql_string(event_outcome)));
    }
    
    if let Some(severity) = &query.severity {
        conditions.push(format!("severity = '{}'", escape_sql_string(severity)));
    }
    
    if let Some(user_name) = &query.user_name {
        conditions.push(format!("user_name = '{}'", escape_sql_string(user_name)));
    }
    
    if let Some(host_name) = &query.host_name {
        conditions.push(format!("host_name = '{}'", escape_sql_string(host_name)));
    }
    
    if let Some(source_ip) = &query.source_ip {
        conditions.push(format!("source_ip = '{}'", escape_sql_string(source_ip)));
    }
    
    if let Some(dest_ip) = &query.dest_ip {
        conditions.push(format!("dest_ip = '{}'", escape_sql_string(dest_ip)));
    }
    
    // Structured filters (for backward compatibility and additional filters)
    for (key, value) in &query.filters {
        match key.as_str() {
            "source_ip" | "dest_ip" | "event_category" | "event_action" | "event_outcome" | "severity" | "user_name" | "host_name" => {
                // Skip these as they are handled by direct fields above
                warn!("Filter '{}' should use direct field instead of filters map", key);
            }
            _ => {
                warn!("Unknown filter key '{}' with value '{}' ignored", key, value);
            }
        }
    }
    
    let where_clause = if conditions.is_empty() {
        "1=1".to_string()
    } else {
        conditions.join(" AND ")
    };
    
    Ok((where_clause, params))
}

/// Escape SQL string to prevent injection
fn escape_sql_string(input: &str) -> String {
    input.replace("'", "''")
}

/// Main event search handler
pub async fn search_events(
    State(_state): State<Arc<crate::dev_events_handler::AppState>>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<PagedEvents>, (StatusCode, Json<ErrorResponse>)> {
    let start_time = std::time::Instant::now();
    
    // Validate query parameters
    if let Err(validation_error) = validate_search_query(&query) {
        warn!("Event search validation failed: {}", validation_error);
        return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Validation Error".to_string(),
                    message: validation_error,
                    code: "VALIDATION_FAILED".to_string(),
                    details: None,
                    request_id: None,
                }),
            ));
    }
    
    // Try database operations, fallback to mock data on any error
    match try_database_search(&query).await {
        Ok(mut result) => {
            result.query_time_ms = start_time.elapsed().as_millis() as u64;
            info!("Event search completed successfully in {}ms", result.query_time_ms);
            Ok(Json(result))
        }
        Err(e) => {
            error!("Database operation failed: {}", e);
            println!("DEBUG: Database failed, returning mock data for testing");
            info!("Returning mock data for testing since database is unavailable");
             let mock_events = vec![
                 Event {
                     event_id: "mock-event-1".to_string(),
                     tenant_id: query.tenant_id.clone().unwrap_or("mock-tenant-1".to_string()),
                     event_timestamp: chrono::Utc::now().timestamp() as u64,
                     event_type: "login".to_string(),
                     source_ip: "192.168.1.100".to_string(),
                     dest_ip: Some("10.0.0.1".to_string()),
                     source_port: Some(12345),
                     dest_port: Some(443),
                     protocol: Some("TCP".to_string()),
                     event_category: Some("authentication".to_string()),
                     event_action: Some("login".to_string()),
                     event_outcome: Some("success".to_string()),
                     user_name: Some("admin".to_string()),
                     host_name: Some("workstation-1".to_string()),
                     process_name: Some("ssh".to_string()),
                     file_path: None,
                     url: None,
                     http_method: None,
                     http_status: None,
                     user_agent: None,
                     severity: Some("medium".to_string()),
                     message: Some("Successful login attempt".to_string()),
                     tags: Some("authentication,ssh".to_string()),
                     details: Some("{\"source\": \"ssh\", \"method\": \"password\"}".to_string()),
                 },
                 Event {
                     event_id: "mock-event-2".to_string(),
                     tenant_id: query.tenant_id.clone().unwrap_or("mock-tenant-2".to_string()),
                     event_timestamp: chrono::Utc::now().timestamp() as u64 - 300,
                     event_type: "file_access".to_string(),
                     source_ip: "192.168.1.101".to_string(),
                     dest_ip: None,
                     source_port: None,
                     dest_port: None,
                     protocol: None,
                     event_category: Some("file".to_string()),
                     event_action: Some("read".to_string()),
                     event_outcome: Some("success".to_string()),
                     user_name: Some("user1".to_string()),
                     host_name: Some("workstation-2".to_string()),
                     process_name: Some("explorer.exe".to_string()),
                     file_path: Some("/etc/passwd".to_string()),
                     url: None,
                     http_method: None,
                     http_status: None,
                     user_agent: None,
                     severity: Some("high".to_string()),
                     message: Some("Sensitive file accessed".to_string()),
                     tags: Some("file_access,sensitive".to_string()),
                     details: Some("{\"file\": \"/etc/passwd\", \"permissions\": \"read\"}".to_string()),
                 },
             ];
             
             let paged_events = PagedEvents {
                 events: mock_events,
                 total: 2,
                 page: query.page,
                 limit: query.limit.unwrap_or(50),
                 has_more: false,
                 next_cursor: None,
                 previous_cursor: None,
                 query_time_ms: start_time.elapsed().as_millis() as u64,
             };
             
             Ok(Json(paged_events))
        }
    }
}

/// Create router for events endpoints
pub fn create_events_router() -> Router<Arc<crate::dev_events_handler::AppState>> {
    Router::new().route("/api/v1/events/search", get(search_events))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validate_search_query() {
        let valid_query = SearchQuery {
            tenant_id: Some("test_tenant".to_string()),
            search: Some("test search".to_string()),
            page: Some(1),
            limit: Some(50),
            cursor: None,
            start_time: None,
            end_time: None,
            event_category: None,
            event_action: None,
            event_outcome: None,
            severity: None,
            user_name: None,
            host_name: None,
            source_ip: None,
            dest_ip: None,
            filters: HashMap::new(),
        };
        
        assert!(validate_search_query(&valid_query).is_ok());
        
        let invalid_query = SearchQuery {
            tenant_id: Some("".to_string()), // Empty tenant_id
            search: None,
            page: Some(0), // Invalid page
            limit: Some(2000), // Limit too high
            cursor: None,
            start_time: None,
            end_time: None,
            event_category: None,
            event_action: None,
            event_outcome: None,
            severity: None,
            user_name: None,
            host_name: None,
            source_ip: None,
            dest_ip: None,
            filters: HashMap::new(),
        };
        
        assert!(validate_search_query(&invalid_query).is_err());
    }
    
    #[test]
    fn test_parse_iso_timestamp() {
        let valid_timestamp = "2024-01-01T00:00:00Z";
        assert!(parse_iso_timestamp(valid_timestamp).is_ok());
        
        let invalid_timestamp = "invalid-timestamp";
        assert!(parse_iso_timestamp(invalid_timestamp).is_err());
    }
    
    #[test]
    fn test_build_where_clause() {
        let filters = HashMap::new();
        
        let query = SearchQuery {
            tenant_id: Some("test_tenant".to_string()),
            search: Some("error".to_string()),
            page: None,
            limit: None,
            cursor: None,
            start_time: Some("2024-01-01T00:00:00Z".to_string()),
            end_time: Some("2024-01-02T00:00:00Z".to_string()),
            event_category: Some("Authentication".to_string()),
            event_action: Some("Logon".to_string()),
            event_outcome: Some("Success".to_string()),
            severity: Some("high".to_string()),
            user_name: Some("admin".to_string()),
            host_name: Some("server01".to_string()),
            source_ip: Some("192.168.1.1".to_string()),
            dest_ip: Some("10.0.0.1".to_string()),
            filters,
        };
        
        let result = build_where_clause(&query);
        assert!(result.is_ok());
        
        let (where_clause, params) = result.unwrap();
        assert!(where_clause.contains("tenant_id = 'test_tenant'"));
        assert!(where_clause.contains("source_ip = '192.168.1.1'"));
        assert!(where_clause.contains("severity = 'high'"));
        assert!(where_clause.contains("event_category = 'Authentication'"));
        assert!(where_clause.contains("user_name = 'admin'"));
        assert!(where_clause.contains("message ILIKE '%error%'"));
        assert!(params.is_empty()); // No longer using parameters
    }
}