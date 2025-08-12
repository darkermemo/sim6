//! Repository traits for data access operations
//!
//! These traits define the interface for data operations across different domains.
//! Implementations can use different storage backends (ClickHouse, PostgreSQL, etc.)

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use std::collections::HashMap;

use crate::error::Result;
use crate::types::api::*;
// Models are imported via types::api

// ============================================================================
// Event Repository Trait
// ============================================================================

/// Repository trait for event-related operations
#[async_trait]
pub trait EventRepository: Send + Sync {
    /// Search for events based on query parameters
    async fn search_events(&self, query: &EventSearchQuery) -> Result<EventSearchResponse>;
    
    /// Get a single event by ID
    async fn get_event_by_id(&self, event_id: &str) -> Result<Option<EventDetail>>;
    
    /// Get event count for a time range
    async fn get_event_count(
        &self,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        tenant_id: Option<&str>,
    ) -> Result<u64>;
    
    /// Get events per second statistics
    async fn get_eps_stats(&self, window_seconds: u64) -> Result<EpsResponse>;
    
    /// Get recent events for streaming
    async fn get_recent_events(
        &self,
        limit: u32,
        source_filter: Option<&str>,
        severity_filter: Option<&str>,
    ) -> Result<Vec<EventDetail>>;
}

// ============================================================================
// Alert Repository Trait
// ============================================================================

/// Repository trait for alert-related operations
#[async_trait]
pub trait AlertRepository: Send + Sync {
    /// Get all alerts with pagination
    async fn get_alerts(
        &self,
        limit: u32,
        offset: u32,
        status_filter: Option<&str>,
    ) -> Result<AlertsListResponse>;
    
    /// Create a new alert
    async fn create_alert(&self, request: &CreateAlertRequest) -> Result<AlertResponse>;
    
    /// Get a single alert by ID
    async fn get_alert_by_id(&self, alert_id: &str) -> Result<Option<AlertResponse>>;
    
    /// Update alert status
    async fn update_alert_status(
        &self,
        alert_id: &str,
        request: &UpdateAlertStatusRequest,
    ) -> Result<AlertResponse>;
    
    /// Update alert assignee
    async fn update_alert_assignee(
        &self,
        alert_id: &str,
        request: &UpdateAlertAssigneeRequest,
    ) -> Result<AlertResponse>;
    
    /// Get alert count for dashboard
    async fn get_alert_count_24h(&self) -> Result<u64>;
    
    /// Get recent alerts for dashboard
    async fn get_recent_alerts(&self, limit: u32) -> Result<Vec<AlertResponse>>;
}

// ============================================================================
// Rule Repository Trait
// ============================================================================

/// Repository trait for detection rule operations
#[async_trait]
pub trait RuleRepository: Send + Sync {
    /// Get all rules with pagination
    async fn get_rules(
        &self,
        limit: u32,
        offset: u32,
        enabled_filter: Option<bool>,
    ) -> Result<RulesListResponse>;
    
    /// Create a new detection rule
    async fn create_rule(&self, request: &CreateRuleRequest) -> Result<RuleResponse>;
    
    /// Get a single rule by ID
    async fn get_rule_by_id(&self, rule_id: &str) -> Result<Option<RuleResponse>>;
    
    /// Update an existing rule
    async fn update_rule(
        &self,
        rule_id: &str,
        request: &CreateRuleRequest,
    ) -> Result<RuleResponse>;
    
    /// Delete a rule
    async fn delete_rule(&self, rule_id: &str) -> Result<()>;
    
    /// Get active rule count
    async fn get_active_rule_count(&self) -> Result<u64>;
    
    /// Test a rule against sample data
    async fn test_rule(
        &self,
        query: &str,
        sample_data: &serde_json::Value,
    ) -> Result<bool>;
}

// ============================================================================
// Metrics Repository Trait
// ============================================================================

/// Repository trait for metrics and statistics operations
#[async_trait]
pub trait MetricsRepository: Send + Sync {
    /// Get system metrics in various formats
    async fn get_metrics(&self, query: &MetricsQuery) -> Result<serde_json::Value>;
    
    /// Get component-specific metrics
    async fn get_component_metrics(&self, component: &str) -> Result<serde_json::Value>;
    
    /// Get performance metrics
    async fn get_performance_metrics(&self) -> Result<serde_json::Value>;
    
    /// Get historical metrics
    async fn get_historical_metrics(&self, hours: u32) -> Result<serde_json::Value>;
    
    /// Get dashboard KPIs
    async fn get_dashboard_kpis(&self) -> Result<DashboardKpis>;
    
    /// Get log source statistics
    async fn get_log_source_stats(&self) -> Result<Vec<LogSourceStats>>;
}

// ============================================================================
// Health Repository Trait
// ============================================================================

/// Repository trait for health check operations
#[async_trait]
pub trait HealthRepository: Send + Sync {
    /// Perform basic health check
    async fn health_check(&self) -> Result<HealthResponse>;
    
    /// Perform detailed health check with component status
    async fn detailed_health_check(&self) -> Result<HealthResponse>;
    
    /// Check ClickHouse connection health
    async fn check_clickhouse_health(&self) -> Result<ComponentHealth>;
    
    /// Check Redis connection health
    async fn check_redis_health(&self) -> Result<ComponentHealth>;
    
    /// Check Vector health
    async fn check_vector_health(&self) -> Result<VectorHealthResponse>;
    
    /// Get system status
    async fn get_system_status(&self) -> Result<serde_json::Value>;
}

// ============================================================================
// Log Source Repository Trait
// ============================================================================

/// Repository trait for log source operations
#[async_trait]
pub trait LogSourceRepository: Send + Sync {
    /// Get all log sources with pagination
    async fn get_log_sources(
        &self,
        limit: u32,
        offset: u32,
    ) -> Result<LogSourcesListResponse>;
    
    /// Get log source by ID
    async fn get_log_source_by_id(&self, source_id: &str) -> Result<Option<LogSourceResponse>>;
    
    /// Get log sources by IP address
    async fn get_log_sources_by_ip(&self, ip: &str) -> Result<Vec<LogSourceResponse>>;
    
    /// Get log source statistics
    async fn get_log_source_statistics(&self) -> Result<Vec<LogSourceStats>>;
    
    /// Update log source last seen timestamp
    async fn update_log_source_last_seen(
        &self,
        source_id: &str,
        timestamp: DateTime<Utc>,
    ) -> Result<()>;
}

// ============================================================================
// System Repository Trait
// ============================================================================

/// Repository trait for system operations
#[async_trait]
pub trait SystemRepository: Send + Sync {
    /// Get system logs with filtering
    async fn get_system_logs(&self, query: &SystemLogsQuery) -> Result<SystemLogsResponse>;
    
    /// Get system version information
    async fn get_version_info(&self) -> Result<serde_json::Value>;
    
    /// Get debug information
    async fn get_debug_info(&self) -> Result<serde_json::Value>;
    
    /// Validate configuration
    async fn validate_config(
        &self,
        config: &serde_json::Value,
    ) -> Result<ConfigValidationResponse>;
}