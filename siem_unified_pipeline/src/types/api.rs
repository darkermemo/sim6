//! API request and response types for the SIEM unified pipeline
//!
//! All types use snake_case serialization for consistency with Rust conventions
//! and proper integration with frontend TypeScript interfaces.

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use uuid::Uuid;
use validator::Validate;

// ============================================================================
// Health and Status Types
// ============================================================================

/// Health check response with component status details
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: DateTime<Utc>,
    pub version: String,
    pub uptime_seconds: u64,
    pub components: HashMap<String, ComponentHealth>,
}

/// Individual component health information
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ComponentHealth {
    pub status: String,
    pub last_check: DateTime<Utc>,
    pub error_count: u64,
    pub response_time_ms: f64,
}

/// Vector health check response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct VectorHealthResponse {
    pub status: String,
    pub healthy: bool,
    pub events_processed: Option<i64>,
}

/// Kubernetes readiness probe response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ReadinessResponse {
    pub ready: bool,
    pub timestamp: DateTime<Utc>,
    pub components: Vec<ComponentReadiness>,
}

/// Component readiness information
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ComponentReadiness {
    pub name: String,
    pub ready: bool,
}

/// Kubernetes liveness probe response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LivenessResponse {
    pub alive: bool,
    pub timestamp: DateTime<Utc>,
    pub uptime_seconds: u64,
}

/// Kubernetes startup probe response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct StartupResponse {
    pub started: bool,
    pub timestamp: DateTime<Utc>,
    pub initialization_time_seconds: u64,
}

/// Event count query parameters
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct EventCountQuery {
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub tenant_id: Option<String>,
}

/// Event count response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EventCountResponse {
    pub count: u64,
}

/// EPS (Events Per Second) query parameters
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct EpsQuery {
    #[validate(range(min = 1, max = 3600))]
    pub window_seconds: Option<u32>,
}

// ============================================================================
// Event Ingestion Types
// ============================================================================

/// Single event ingestion request
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct IngestEventRequest {
    #[validate(length(min = 1, max = 255))]
    pub source: String,
    pub data: serde_json::Value,
    pub metadata: Option<HashMap<String, String>>,
    pub raw_message: Option<String>,
    pub tenant_id: Option<String>,
    pub severity: Option<String>,
    pub source_ip: Option<String>,
    pub user: Option<String>,
}

/// Event insertion request for API
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct EventInsert {
    pub id: Option<String>,
    pub timestamp: Option<DateTime<Utc>>,
    #[validate(length(min = 1, max = 255))]
    pub event_type: String,
    #[validate(length(min = 1, max = 255))]
    pub source: String,
    #[validate(length(min = 1, max = 50))]
    pub severity: String,
    #[validate(length(min = 1, max = 2000))]
    pub message: String,
    pub raw_log: Option<String>,
    pub parsed_fields: Option<serde_json::Value>,
    pub source_ip: Option<String>,
    pub dest_ip: Option<String>,
    pub source_port: Option<u16>,
    pub dest_port: Option<u16>,
    pub protocol: Option<String>,
    pub user_agent: Option<String>,
    pub http_method: Option<String>,
    pub url: Option<String>,
    pub status_code: Option<u16>,
    pub bytes_in: Option<u64>,
    pub bytes_out: Option<u64>,
    pub duration_ms: Option<u32>,
    pub tenant_id: Option<String>,
    pub tags: Option<Vec<String>>,
    pub correlation_id: Option<String>,
    pub rule_id: Option<String>,
    pub alert_id: Option<String>,
}

/// Batch event insertion request
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct InsertEventsRequest {
    #[validate(length(min = 1, max = 50000))]
    pub events: Vec<EventInsert>,
    pub batch_id: Option<String>,
}

/// Response for event insertion
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct InsertEventsResponse {
    pub inserted_count: usize,
    pub success: bool,
    pub message: Option<String>,
}

/// Response for single event ingestion
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct IngestEventResponse {
    pub event_id: String,
    pub status: String,
    pub message: String,
    pub timestamp: DateTime<Utc>,
}

/// Batch event ingestion request
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct BatchIngestRequest {
    #[validate(length(min = 1, max = 1000))]
    pub events: Vec<IngestEventRequest>,
    pub batch_id: Option<String>,
}

/// Response for batch event ingestion
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct BatchIngestResponse {
    pub batch_id: String,
    pub total_events: usize,
    pub successful: usize,
    pub failed: usize,
    pub errors: Vec<String>,
    pub timestamp: DateTime<Utc>,
}

// ============================================================================
// Event Search and Retrieval Types
// ============================================================================

/// Event search query parameters
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct EventSearchQuery {
    pub query: Option<String>,
    pub source: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    #[validate(range(min = 1, max = 1000))]
    pub limit: Option<u32>,
    #[validate(range(min = 0))]
    pub offset: Option<u32>,
    pub tenant_id: Option<String>,
    pub severity: Option<String>,
    pub event_type: Option<String>,
}

/// Event search response with pagination
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EventSearchResponse {
    pub events: Vec<EventDetail>,
    pub total_count: u64,
    pub page_info: PageInfo,
    pub query_time_ms: f64,
}

/// Recent events query
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct RecentEventsQuery {
    #[validate(range(min = 1, max = 1000))]
    pub limit: Option<u32>,
    pub source: Option<String>,
    pub severity: Option<String>,
}

/// Recent events response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RecentEventsResponse {
    pub events: Vec<EventDetail>,
}

/// Event summary with essential information for streaming
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EventSummary {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub event_type: String,
    pub source: String,
    pub severity: String,
    pub message: String,
    pub source_ip: Option<String>,
    pub dest_ip: Option<String>,
    pub user: Option<String>,
    pub tenant_id: Option<String>,
}

/// Detailed event information
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EventDetail {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub source: String,
    pub source_type: String,
    pub severity: String,
    pub message: String,
    pub raw_message: String,
    pub source_ip: Option<String>,
    pub destination_ip: Option<String>,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub tenant_id: String,
    pub event_category: String,
    pub event_action: String,
    pub event_outcome: Option<String>,
    pub metadata: serde_json::Value,
    pub tags: Option<Vec<String>>,
    pub correlation_id: Option<String>,
    pub rule_id: Option<String>,
    pub alert_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: Option<DateTime<Utc>>,
}

/// Event streaming query parameters
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EventStreamQuery {
    pub source: Option<String>,
    pub severity: Option<String>,
    pub security_event: Option<bool>,
    pub buffer_size: Option<u32>,
    pub heartbeat_interval: Option<u32>,
}

/// Pagination information
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PageInfo {
    pub limit: u32,
    pub offset: u32,
    pub has_next: bool,
    pub has_previous: bool,
    pub total_pages: u32,
    pub current_page: u32,
}

// ============================================================================
// Metrics Types
// ============================================================================

/// Metrics query parameters
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MetricsQuery {
    pub format: Option<String>,
    pub component: Option<String>,
    pub hours: Option<u32>,
}

/// EPS (Events Per Second) statistics
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct EpsStats {
    pub avg_eps: f64,
    pub current_eps: f64,
    pub peak_eps: f64,
    pub window_seconds: u64,
}

/// EPS metrics response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EpsResponse {
    pub global: EpsStats,
    pub per_tenant: HashMap<String, EpsStats>,
    pub timestamp: DateTime<Utc>,
    pub sql: String,
    pub rows_used: u64,
}

// ============================================================================
// Configuration Types
// ============================================================================

/// Configuration update request
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ConfigUpdateRequest {
    pub config: serde_json::Value,
    pub restart_required: Option<bool>,
}

/// Configuration validation response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ConfigValidationResponse {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

// ============================================================================
// Routing Rules Types
// ============================================================================

/// Routing rule creation request
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct RoutingRuleRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub conditions: HashMap<String, serde_json::Value>,
    pub destinations: Vec<String>,
    pub enabled: bool,
    #[validate(range(min = 0, max = 1000))]
    pub priority: i32,
    pub description: Option<String>,
}

/// Routing rule response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoutingRuleResponse {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub conditions: HashMap<String, serde_json::Value>,
    pub destinations: Vec<String>,
    pub enabled: bool,
    pub priority: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// List of routing rules response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoutingRulesListResponse {
    pub rules: Vec<RoutingRuleResponse>,
    pub total: u64,
}

// ============================================================================
// Alert Types
// ============================================================================

/// Alert creation request
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct CreateAlertRequest {
    #[validate(length(min = 1, max = 255))]
    pub title: String,
    #[validate(length(min = 1, max = 1000))]
    pub description: String,
    pub severity: String,
    pub rule_id: Option<String>,
    pub event_ids: Vec<String>,
    pub metadata: Option<serde_json::Value>,
}

/// Alert response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AlertResponse {
    pub id: String,
    pub title: String,
    pub description: String,
    pub severity: String,
    pub status: String,
    pub rule_id: Option<String>,
    pub event_ids: Vec<String>,
    pub assignee: Option<String>,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// List of alerts response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AlertsListResponse {
    pub alerts: Vec<AlertResponse>,
    pub total: u64,
    pub page_info: PageInfo,
}

/// Alert status update request
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UpdateAlertStatusRequest {
    pub status: String,
    pub comment: Option<String>,
}

/// Alert assignee update request
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UpdateAlertAssigneeRequest {
    pub assignee: String,
    pub comment: Option<String>,
}

// ============================================================================
// Rule Types
// ============================================================================

/// Detection rule creation request
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct CreateRuleRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    #[validate(length(min = 1, max = 1000))]
    pub description: String,
    pub rule_type: String,
    pub query: String,
    pub severity: String,
    pub enabled: bool,
    pub metadata: Option<serde_json::Value>,
}

/// Detection rule response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RuleResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub rule_type: String,
    pub query: String,
    pub severity: String,
    pub enabled: bool,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// List of rules response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RulesListResponse {
    pub rules: Vec<RuleResponse>,
    pub total: u64,
    pub page_info: PageInfo,
}

// ============================================================================
// Dashboard Types
// ============================================================================

/// Dashboard KPI data
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DashboardKpis {
    pub total_events_24h: u64,
    pub total_alerts_24h: u64,
    pub active_rules: u64,
    pub avg_eps: f64,
    pub system_health: String,
}

/// Dashboard response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DashboardResponse {
    pub kpis: DashboardKpis,
    pub recent_alerts: Vec<AlertResponse>,
    pub top_sources: Vec<LogSourceStats>,
    pub timestamp: DateTime<Utc>,
}

// ============================================================================
// Log Source Types
// ============================================================================

/// Log source statistics
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LogSourceStats {
    pub source_name: String,
    pub event_count: u64,
    pub last_seen: DateTime<Utc>,
    pub avg_eps: f64,
}

/// Log source response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LogSourceResponse {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub ip_address: Option<String>,
    pub hostname: Option<String>,
    pub status: String,
    pub last_seen: Option<DateTime<Utc>>,
    pub event_count: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// List of log sources response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LogSourcesListResponse {
    pub log_sources: Vec<LogSourceResponse>,
    pub total: u64,
    pub page_info: PageInfo,
}

// ============================================================================
// User and Authentication Types
// ============================================================================

/// User login request
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct LoginRequest {
    #[validate(email)]
    pub username: String,
    #[validate(length(min = 8))]
    pub password: String,
}

/// Authentication response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AuthResponse {
    pub token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub user: UserResponse,
}

/// User information response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UserResponse {
    pub id: String,
    pub username: String,
    pub email: String,
    pub role: String,
    pub permissions: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub last_login: Option<DateTime<Utc>>,
}

// ============================================================================
// Error Types
// ============================================================================

/// Standard API error response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
    pub code: u16,
    pub timestamp: DateTime<Utc>,
    pub request_id: Option<String>,
    pub details: Option<serde_json::Value>,
}

// ============================================================================
// System Types
// ============================================================================

/// System logs query parameters
#[derive(Debug, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct SystemLogsQuery {
    pub level: Option<String>,
    pub module: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    #[validate(range(min = 1, max = 1000))]
    pub limit: Option<u32>,
}

/// System log entry
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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

/// System logs response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SystemLogsResponse {
    pub logs: Vec<SystemLogEntry>,
    pub total: u64,
    pub page_info: PageInfo,
}

// ============================================================================
// Utility Functions
// ============================================================================

/// Generate a unique request ID for tracing
pub fn generate_request_id() -> String {
    Uuid::new_v4().to_string()
}

/// Validate time range for search queries
pub fn validate_time_range(
    start: &Option<DateTime<Utc>>,
    end: &Option<DateTime<Utc>>,
) -> Result<(), validator::ValidationError> {
    if let (Some(start_time), Some(end_time)) = (start, end) {
        if start_time >= end_time {
            return Err(validator::ValidationError::new(
                "start_time must be before end_time",
            ));
        }

        let max_range = chrono::Duration::days(30);
        if *end_time - *start_time > max_range {
            return Err(validator::ValidationError::new(
                "time range cannot exceed 30 days",
            ));
        }
    }
    Ok(())
}