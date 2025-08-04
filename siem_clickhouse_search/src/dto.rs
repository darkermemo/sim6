//! Data Transfer Objects for ClickHouse search service
//! Defines request/response structures for API endpoints

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;
use clickhouse::Row;
use std::fmt;

/// Event detail response structure for frontend compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDetailResponse {
    pub id: String,
    pub timestamp: String,
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
    pub fields: std::collections::HashMap<String, serde_json::Value>,
    pub processing_stage: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Search events response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchEventsResponse {
    pub events: Vec<EventDetailResponse>,
    pub total: usize,
    pub status: String,
}

/// Paged events response structure for the redesigned Log Activities page
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagedEvents {
    pub events: Vec<Event>,
    pub total: u64,
    pub page: u32,
    pub limit: u32,
    pub has_next: bool,
}

/// Search request structure with comprehensive filtering options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    /// Search query string (supports full-text and regex)
    pub query: Option<String>,
    
    /// Time range filter
    pub time_range: Option<TimeRange>,
    
    /// Field-specific filters
    pub filters: Option<HashMap<String, FilterValue>>,
    
    /// Pagination settings
    pub pagination: Option<Pagination>,
    
    /// Sorting configuration
    pub sort: Option<Vec<SortField>>,
    
    /// Fields to include in response (projection)
    pub fields: Option<Vec<String>>,
    
    /// Search options and behavior
    pub options: Option<SearchOptions>,
    
    /// Tenant ID for multi-tenant isolation
    pub tenant_id: Option<String>,
    
    /// Aggregation requests
    pub aggregations: Option<HashMap<String, AggregationRequest>>,
}

/// Time range filter for log events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRange {
    /// Start time (inclusive)
    pub start: DateTime<Utc>,
    
    /// End time (exclusive)
    pub end: DateTime<Utc>,
    
    /// Time zone for display (optional)
    pub timezone: Option<String>,
}

/// Filter value with different comparison operators
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "operator", content = "value")]
pub enum FilterValue {
    /// Exact match
    Equals(String),
    
    /// Not equal
    NotEquals(String),
    
    /// Contains substring
    Contains(String),
    
    /// Does not contain substring
    NotContains(String),
    
    /// Starts with prefix
    StartsWith(String),
    
    /// Ends with suffix
    EndsWith(String),
    
    /// Regular expression match
    Regex(String),
    
    /// In list of values
    In(Vec<String>),
    
    /// Not in list of values
    NotIn(Vec<String>),
    
    /// Greater than (for numeric/date fields)
    GreaterThan(String),
    
    /// Greater than or equal
    GreaterThanOrEqual(String),
    
    /// Less than
    LessThan(String),
    
    /// Less than or equal
    LessThanOrEqual(String),
    
    /// Between two values (inclusive)
    Between(String, String),
    
    /// Field exists (not null)
    Exists,
    
    /// Field does not exist (is null)
    NotExists,
}

/// Pagination configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    /// Page number (0-based)
    pub page: u32,
    
    /// Number of items per page
    pub size: u32,
    
    /// Cursor for cursor-based pagination (optional)
    pub cursor: Option<String>,
    
    /// Enable total count calculation (expensive for large datasets)
    pub include_total: bool,
}

/// Sort field configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SortField {
    /// Field name to sort by
    pub field: String,
    
    /// Sort direction
    pub direction: SortDirection,
    
    /// Sort priority (lower numbers have higher priority)
    pub priority: Option<u32>,
}

/// Sort direction enumeration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SortDirection {
    Ascending,
    Descending,
}

/// Search options and behavior configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    /// Enable full-text search
    pub enable_fulltext: Option<bool>,
    
    /// Enable regex search
    pub enable_regex: Option<bool>,
    
    /// Case-sensitive search
    pub case_sensitive: Option<bool>,
    
    /// Enable search highlighting
    pub enable_highlighting: Option<bool>,
    
    /// Search timeout in seconds
    pub timeout_secs: Option<u64>,
    
    /// Enable result caching
    pub enable_caching: Option<bool>,
    
    /// Cache TTL in seconds
    pub cache_ttl_secs: Option<u64>,
    
    /// Enable streaming response
    pub enable_streaming: Option<bool>,
    
    /// Explain query execution plan
    pub explain: Option<bool>,
}

/// Aggregation request configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregationRequest {
    /// Aggregation type
    pub agg_type: AggregationType,
    
    /// Field to aggregate on
    pub field: String,
    
    /// Size limit for aggregation results
    pub size: Option<u32>,
    
    /// Sub-aggregations
    pub sub_aggregations: Option<HashMap<String, AggregationRequest>>,
}

/// Dashboard V2 response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardV2Response {
    /// Total number of events
    pub total_events: i64,
    /// Total number of alerts
    pub total_alerts: i64,
    /// Alerts over time data for charts
    pub alerts_over_time: Vec<AlertsOverTimeData>,
    /// Top log sources by count
    pub top_log_sources: Vec<TopLogSourceData>,
    /// Recent alerts
    pub recent_alerts: Vec<RecentAlertV2>,
}

/// Alerts over time data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertsOverTimeData {
    /// Unix timestamp
    pub ts: i64,
    /// Critical alerts count
    pub critical: i64,
    /// High alerts count
    pub high: i64,
    /// Medium alerts count
    pub medium: i64,
    /// Low alerts count
    pub low: i64,
}

/// Top log source data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopLogSourceData {
    /// Source type name
    pub source_type: String,
    /// Count of events from this source
    pub count: i64,
}

/// Recent alert V2 structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentAlertV2 {
    /// Alert ID
    pub alert_id: String,
    /// Unix timestamp
    pub ts: i64,
    /// Alert title
    pub title: String,
    /// Alert severity
    pub severity: String,
    /// Source IP address
    pub source_ip: String,
    /// Destination IP address
    pub dest_ip: String,
}

/// Event structure for dev.events table
#[derive(Debug, Clone, Serialize, Deserialize, Row)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub event_id: String,
    pub tenant_id: String,
    #[serde(with = "timestamp_serde")]
    pub event_timestamp: DateTime<Utc>,
    pub source_ip: String,
    pub source_type: String,
    pub message: Option<String>,
    pub severity: Option<String>,
}

/// Event filters for querying
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventFilters {
    pub page: Option<u32>,
    pub limit: Option<u32>,
    pub search: Option<String>,
    pub severity: Option<String>,
    pub source_type: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub tenant_id: Option<String>,
}

/// Search query parameters for the new search handler
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub tenant_id: String,
    pub page: Option<u32>,
    pub limit: Option<u32>,
    pub filters: Option<HashMap<String, String>>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub search: Option<String>,
}

/// Legacy EventFilters for backward compatibility
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventFiltersLegacy {
    pub page: Option<u32>,
    pub limit: Option<u32>,
    pub search: Option<String>,
    pub severity: Option<String>,
    pub source_type: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub tenant_id: Option<String>,
}

/// Types of aggregations supported
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AggregationType {
    /// Count of documents
    Count,
    
    /// Terms aggregation (top values)
    Terms,
    
    /// Date histogram
    DateHistogram {
        interval: String,
    },
    
    /// Numeric histogram
    Histogram {
        interval: f64,
    },
    
    /// Statistical aggregation (min, max, avg, sum)
    Stats,
    
    /// Cardinality (unique count)
    Cardinality,
    
    /// Percentiles
    Percentiles {
        percents: Vec<f64>,
    },
}

/// Search response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    /// Search results
    pub hits: SearchHits,
    
    /// Aggregation results
    pub aggregations: Option<HashMap<String, AggregationResult>>,
    
    /// Query execution metadata
    pub metadata: SearchMetadata,
    
    /// Suggestions for query improvement
    pub suggestions: Option<Vec<SearchSuggestion>>,
}

/// Search hits container
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHits {
    /// Total number of matching documents
    pub total: Option<TotalHits>,
    
    /// Maximum relevance score
    pub max_score: Option<f64>,
    
    /// Array of matching documents
    pub hits: Vec<SearchHit>,
    
    /// Pagination information
    pub pagination: PaginationInfo,
}

/// Total hits information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TotalHits {
    /// Total count
    pub value: u64,
    
    /// Relation to actual total (exact or lower bound)
    pub relation: TotalRelation,
}

/// Relation of total count to actual total
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TotalRelation {
    Equal,
    GreaterThanOrEqual,
}

/// Individual search hit
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    /// Document ID
    pub id: String,
    
    /// Relevance score
    pub score: Option<f64>,
    
    /// Document source data
    pub source: LogEvent,
    
    /// Highlighted fields
    pub highlight: Option<HashMap<String, Vec<String>>>,
    
    /// Sort values for cursor-based pagination
    pub sort: Option<Vec<serde_json::Value>>,
}

/// Log event structure matching dev.events table schema
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    /// Event ID
    pub event_id: String,
    
    /// Tenant ID
    pub tenant_id: String,
    
    /// Event timestamp (Unix timestamp)
    #[serde(with = "timestamp_serde")]
    pub event_timestamp: DateTime<Utc>,
    
    /// Source IP address
    pub source_ip: String,
    
    /// Source type
    pub source_type: String,
    
    /// Raw event data
    pub raw_event: String,
    
    /// Event category
    pub event_category: String,
    
    /// Event outcome
    pub event_outcome: String,
    
    /// Event action
    pub event_action: String,
    
    /// Log source ID
    pub log_source_id: Option<String>,
    
    /// Parsing status
    pub parsing_status: Option<String>,
    
    /// Parse error message
    pub parse_error_msg: Option<String>,
    
    /// Destination IP address
    pub dest_ip: Option<String>,
    
    /// Source port
    pub src_port: Option<u16>,
    
    /// Destination port
    pub dest_port: Option<u16>,
    
    /// Protocol
    pub protocol: Option<String>,
    
    /// Bytes in
    pub bytes_in: Option<u64>,
    
    /// Bytes out
    pub bytes_out: Option<u64>,
    
    /// Packets in
    pub packets_in: Option<u64>,
    
    /// Packets out
    pub packets_out: Option<u64>,
    
    /// Duration
    pub duration: Option<u32>,
    
    /// User name
    pub user_name: Option<String>,
    
    /// User domain
    pub user_domain: Option<String>,
    
    /// User ID
    pub user_id: Option<String>,
    
    /// Process name
    pub process_name: Option<String>,
    
    /// Process ID
    pub process_id: Option<u32>,
    
    /// Parent process name
    pub parent_process_name: Option<String>,
    
    /// Parent process ID
    pub parent_process_id: Option<u32>,
    
    /// File path
    pub file_path: Option<String>,
    
    /// File name
    pub file_name: Option<String>,
    
    /// File size
    pub file_size: Option<u64>,
    
    /// Command line
    pub command_line: Option<String>,
    
    /// Registry key
    pub registry_key: Option<String>,
    
    /// Registry value
    pub registry_value: Option<String>,
    
    /// URL
    pub url: Option<String>,
    
    /// URI path
    pub uri_path: Option<String>,
    
    /// URI query
    pub uri_query: Option<String>,
    
    /// HTTP method
    pub http_method: Option<String>,
    
    /// HTTP status code
    pub http_status_code: Option<u16>,
    
    /// HTTP user agent
    pub http_user_agent: Option<String>,
    
    /// HTTP referrer
    pub http_referrer: Option<String>,
    
    /// HTTP content type
    pub http_content_type: Option<String>,
    
    /// HTTP content length
    pub http_content_length: Option<u64>,
    
    /// Source host
    pub src_host: Option<String>,
    
    /// Destination host
    pub dest_host: Option<String>,
    
    /// Device type
    pub device_type: Option<String>,
    
    /// Vendor
    pub vendor: Option<String>,
    
    /// Product
    pub product: Option<String>,
    
    /// Version
    pub version: Option<String>,
    
    /// Source country
    pub src_country: Option<String>,
    
    /// Destination country
    pub dest_country: Option<String>,
    
    /// Source zone
    pub src_zone: Option<String>,
    
    /// Destination zone
    pub dest_zone: Option<String>,
    
    /// Interface in
    pub interface_in: Option<String>,
    
    /// Interface out
    pub interface_out: Option<String>,
    
    /// VLAN ID
    pub vlan_id: Option<u16>,
    
    /// Rule ID
    pub rule_id: Option<String>,
    
    /// Rule name
    pub rule_name: Option<String>,
    
    /// Policy ID
    pub policy_id: Option<String>,
    
    /// Policy name
    pub policy_name: Option<String>,
    
    /// Signature ID
    pub signature_id: Option<String>,
    
    /// Signature name
    pub signature_name: Option<String>,
    
    /// Threat name
    pub threat_name: Option<String>,
    
    /// Threat category
    pub threat_category: Option<String>,
    
    /// Severity
    pub severity: Option<String>,
    
    /// Priority
    pub priority: Option<String>,
    
    /// Authentication method
    pub auth_method: Option<String>,
    
    /// Authentication application
    pub auth_app: Option<String>,
    
    /// Failure reason
    pub failure_reason: Option<String>,
    
    /// Session ID
    pub session_id: Option<String>,
    
    /// Application name
    pub app_name: Option<String>,
    
    /// Application category
    pub app_category: Option<String>,
    
    /// Service name
    pub service_name: Option<String>,
    
    /// Email sender
    pub email_sender: Option<String>,
    
    /// Email recipient
    pub email_recipient: Option<String>,
    
    /// Email subject
    pub email_subject: Option<String>,
    
    /// Tags
    pub tags: Option<String>,
    
    /// Message
    pub message: Option<String>,
    
    /// Details
    pub details: Option<String>,
    
    /// Custom fields (Map from ClickHouse)
    pub custom_fields: Option<HashMap<String, String>>,
    
    /// Ingestion timestamp (Unix timestamp)
    #[serde(with = "timestamp_serde")]
    pub ingestion_timestamp: DateTime<Utc>,
}

/// Custom serde module for Unix timestamp conversion
mod timestamp_serde {
    use chrono::{DateTime, Utc, TimeZone};
    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(date: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let timestamp = date.timestamp() as u32;
        serializer.serialize_u32(timestamp)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let timestamp = u32::deserialize(deserializer)?;
        Ok(Utc.timestamp_opt(timestamp as i64, 0).single().unwrap_or_else(|| Utc::now()))
    }
}

/// Detection rule match information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectionMatch {
    /// Rule ID
    pub rule_id: String,
    
    /// Rule name
    pub rule_name: String,
    
    /// Rule severity
    pub severity: String,
    
    /// Match confidence score
    pub confidence: f64,
    
    /// Matched fields
    pub matched_fields: Vec<String>,
    
    /// Rule description
    pub description: Option<String>,
}

/// Pagination information in response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginationInfo {
    /// Current page number
    pub current_page: u32,
    
    /// Page size
    pub page_size: u32,
    
    /// Total pages (if total count is available)
    pub total_pages: Option<u32>,
    
    /// Has next page
    pub has_next: bool,
    
    /// Has previous page
    pub has_previous: bool,
    
    /// Next page cursor
    pub next_cursor: Option<String>,
    
    /// Previous page cursor
    pub previous_cursor: Option<String>,
}

/// Aggregation result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AggregationResult {
    /// Count result
    Count {
        value: u64,
    },
    
    /// Terms aggregation result
    Terms {
        buckets: Vec<TermsBucket>,
        sum_other_doc_count: u64,
    },
    
    /// Date histogram result
    DateHistogram {
        buckets: Vec<DateHistogramBucket>,
    },
    
    /// Numeric histogram result
    Histogram {
        buckets: Vec<HistogramBucket>,
    },
    
    /// Statistics result
    Stats {
        count: u64,
        min: Option<f64>,
        max: Option<f64>,
        avg: Option<f64>,
        sum: f64,
    },
    
    /// Cardinality result
    Cardinality {
        value: u64,
    },
    
    /// Percentiles result
    Percentiles {
        values: HashMap<String, f64>,
    },
}

/// Terms aggregation bucket
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermsBucket {
    /// Term value
    pub key: String,
    
    /// Document count
    pub doc_count: u64,
    
    /// Sub-aggregations
    pub sub_aggregations: Option<HashMap<String, AggregationResult>>,
}

/// Date histogram bucket
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DateHistogramBucket {
    /// Bucket timestamp
    pub key: DateTime<Utc>,
    
    /// Bucket key as string
    pub key_as_string: String,
    
    /// Document count
    pub doc_count: u64,
    
    /// Sub-aggregations
    pub sub_aggregations: Option<HashMap<String, AggregationResult>>,
}

/// Numeric histogram bucket
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistogramBucket {
    /// Bucket value
    pub key: f64,
    
    /// Document count
    pub doc_count: u64,
    
    /// Sub-aggregations
    pub sub_aggregations: Option<HashMap<String, AggregationResult>>,
}

/// Search execution metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMetadata {
    /// Query execution time in milliseconds
    pub took: u64,
    
    /// Whether the query timed out
    pub timed_out: bool,
    
    /// Number of shards searched
    pub shards: Option<ShardInfo>,
    
    /// Query ID for tracking
    pub query_id: String,
    
    /// Tenant ID
    pub tenant_id: Option<String>,
    
    /// Cache hit information
    pub cache_hit: bool,
    
    /// Query explanation (if requested)
    pub explanation: Option<QueryExplanation>,
}

/// Shard information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShardInfo {
    /// Total shards
    pub total: u32,
    
    /// Successful shards
    pub successful: u32,
    
    /// Skipped shards
    pub skipped: u32,
    
    /// Failed shards
    pub failed: u32,
}

/// Query execution explanation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryExplanation {
    /// SQL query executed
    pub sql: String,
    
    /// Query execution plan
    pub execution_plan: Option<String>,
    
    /// Query statistics
    pub statistics: Option<QueryStatistics>,
}

/// Query execution statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryStatistics {
    /// Rows read
    pub rows_read: u64,
    
    /// Bytes read
    pub bytes_read: u64,
    
    /// Memory usage in bytes
    pub memory_usage: u64,
    
    /// CPU time in milliseconds
    pub cpu_time_ms: u64,
}

/// Search suggestion
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSuggestion {
    /// Suggestion type
    pub suggestion_type: SuggestionType,
    
    /// Suggested text
    pub text: String,
    
    /// Suggestion score
    pub score: f64,
    
    /// Additional context
    pub context: Option<String>,
}

/// Types of search suggestions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SuggestionType {
    /// Query completion
    Completion,
    
    /// Spelling correction
    Correction,
    
    /// Field name suggestion
    Field,
    
    /// Value suggestion
    Value,
}

/// Error response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    /// Error code
    pub code: String,
    
    /// Error message
    pub message: String,
    
    /// Additional error details
    pub details: Option<HashMap<String, serde_json::Value>>,
    
    /// Request ID for tracking
    pub request_id: String,
    
    /// Timestamp of error
    pub timestamp: DateTime<Utc>,
}

/// Health check response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    /// Service status
    pub status: HealthStatus,
    
    /// Service version
    pub version: String,
    
    /// Uptime in seconds
    pub uptime: u64,
    
    /// Component health checks
    pub components: HashMap<String, ComponentHealth>,
    
    /// Timestamp
    pub timestamp: DateTime<Utc>,
}

/// Health status enumeration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

/// Component health information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentHealth {
    /// Component status
    pub status: HealthStatus,
    
    /// Response time in milliseconds
    pub response_time_ms: Option<u64>,
    
    /// Error message if unhealthy
    pub error: Option<String>,
    
    /// Last check timestamp
    pub last_check: DateTime<Utc>,
}

// Default implementations
impl Default for Pagination {
    fn default() -> Self {
        Self {
            page: 0,
            size: 100,
            cursor: None,
            include_total: false,
        }
    }
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            enable_fulltext: Some(true),
            enable_regex: Some(false),
            case_sensitive: Some(false),
            enable_highlighting: Some(false),
            timeout_secs: Some(30),
            enable_caching: Some(true),
            cache_ttl_secs: Some(300),
            enable_streaming: Some(false),
            explain: Some(false),
        }
    }
}

impl Default for SortDirection {
    fn default() -> Self {
        SortDirection::Descending
    }
}