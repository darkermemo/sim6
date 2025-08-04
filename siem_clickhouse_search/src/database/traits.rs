//! Database service trait abstractions for improved testability and dependency injection

use crate::dto::*;
use anyhow::Result;
use async_trait::async_trait;
use std::collections::HashMap;

/// Database service trait for search operations
/// 
/// This trait abstracts database operations to enable dependency injection
/// and improve testability through mocking.
#[async_trait]
pub trait DatabaseService: Send + Sync {
    /// Perform a search query with the given request
    async fn search(&self, request: SearchRequest) -> Result<SearchResponse>;
    
    /// Get dashboard data for the specified time range and tenant
    async fn get_dashboard_data(
        &self, 
        time_range: Option<TimeRange>, 
        tenant_id: Option<String>
    ) -> Result<DashboardV2Response>;
    
    /// Get events with the specified filters
    async fn get_events(
        &self, 
        filters: EventFilters
    ) -> Result<Vec<Event>, Box<dyn std::error::Error + Send + Sync>>;
    
    /// Perform a health check on the database connection
    async fn health_check(&self) -> Result<()>;
    
    /// Get database metrics
    fn get_metrics(&self) -> crate::database::DatabaseMetrics;
}

/// Ingest service trait for data ingestion operations
/// 
/// This trait handles the ingestion of log events and batch processing.
#[async_trait]
pub trait IngestService: Send + Sync {
    /// Ingest a single log event
    async fn ingest_event(&self, event: LogEvent) -> Result<IngestResponse>;
    
    /// Ingest multiple log events in a batch
    async fn ingest_batch(&self, events: Vec<LogEvent>) -> Result<BatchIngestResponse>;
    
    /// Get the current size/count of events in the database
    async fn get_size(&self, tenant_id: Option<String>) -> Result<SizeResponse>;
}

/// Validation service trait for input validation
/// 
/// This trait provides validation capabilities for various input types.
#[async_trait]
pub trait ValidationService: Send + Sync {
    /// Validate a search request
    fn validate_search_request(&self, request: &SearchRequest) -> Result<()>;
    
    /// Validate event filters
    fn validate_event_filters(&self, filters: &EventFilters) -> Result<()>;
    
    /// Validate a log event for ingestion
    fn validate_log_event(&self, event: &LogEvent) -> Result<()>;
    
    /// Validate field names against allowed fields
    fn validate_field_name(&self, field_name: &str) -> Result<()>;
    
    /// Sanitize user input to prevent injection attacks
    fn sanitize_input(&self, input: &str) -> Result<String>;
}

/// Response types for ingest operations
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestResponse {
    pub success: bool,
    pub event_id: String,
    pub message: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchIngestResponse {
    pub success: bool,
    pub processed_count: usize,
    pub failed_count: usize,
    pub errors: Vec<String>,
    pub message: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeResponse {
    pub total_events: u64,
    pub tenant_id: Option<String>,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}