//! Metrics handlers for the SIEM unified pipeline
//!
//! This module provides HTTP handlers for metrics and statistics operations including
//! system metrics, component metrics, performance data, and dashboard KPIs.
//! It uses the MetricsRepository trait for data access operations.

use axum::extract::{Path, Query, State};
use axum::response::{IntoResponse, Json};
use std::sync::Arc;
use tracing::{debug, info, warn};

use crate::dal::traits::MetricsRepository;
use crate::handlers::handle_result;
use crate::types::api::*;

/// Handler for getting system metrics
/// 
/// Returns system metrics in various formats (JSON, Prometheus, etc.).
/// Supports filtering by component and time range for detailed analysis.
pub async fn get_metrics<R>(
    State(metrics_repo): State<Arc<R>>,
    Query(query): Query<MetricsQuery>,
) -> Result<Json<serde_json::Value>, impl IntoResponse>
where
    R: MetricsRepository,
{
    debug!("Getting metrics with query: {:?}", query);
    
    // Validate query parameters
    if let Err(validation_error) = validate_metrics_query(&query) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(validation_error)
        ));
    }
    
    let result = metrics_repo.get_metrics(&query).await;
    
    match &result {
        Ok(metrics) => {
            info!("Metrics retrieved successfully for format: {}", 
                  query.format.as_deref().unwrap_or("json"));
        }
        Err(e) => {
            warn!("Failed to retrieve metrics: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting component-specific metrics
/// 
/// Returns detailed metrics for a specific system component (ClickHouse, Redis, etc.).
/// Useful for component-level monitoring and troubleshooting.
pub async fn get_component_metrics<R>(
    State(metrics_repo): State<Arc<R>>,
    Path(component): Path<String>,
) -> Result<Json<serde_json::Value>, impl IntoResponse>
where
    R: MetricsRepository,
{
    debug!("Getting metrics for component: {}", component);
    
    // Validate component name
    if !is_valid_component(&component) {
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(
                format!("Invalid component name: {}", component)
            )
        ));
    }
    
    let result = metrics_repo.get_component_metrics(&component).await;
    
    match &result {
        Ok(metrics) => {
            info!("Component metrics retrieved for: {}", component);
        }
        Err(e) => {
            warn!("Failed to retrieve component metrics for {}: {:?}", component, e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting performance metrics
/// 
/// Returns system performance metrics including throughput, latency,
/// and resource utilization statistics.
pub async fn get_performance_metrics<R>(
    State(metrics_repo): State<Arc<R>>,
) -> Result<Json<serde_json::Value>, impl IntoResponse>
where
    R: MetricsRepository,
{
    debug!("Getting performance metrics");
    
    let result = metrics_repo.get_performance_metrics().await;
    
    match &result {
        Ok(metrics) => {
            info!("Performance metrics retrieved successfully");
        }
        Err(e) => {
            warn!("Failed to retrieve performance metrics: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting historical metrics
/// 
/// Returns historical metrics data for the specified time period.
/// Useful for trend analysis and capacity planning.
pub async fn get_historical_metrics<R>(
    State(metrics_repo): State<Arc<R>>,
    Query(query): Query<HistoricalMetricsQuery>,
) -> Result<Json<serde_json::Value>, impl IntoResponse>
where
    R: MetricsRepository,
{
    let hours = query.hours.unwrap_or(24);
    debug!("Getting historical metrics for {} hours", hours);
    
    // Validate hours parameter
    if hours == 0 || hours > 8760 { // Max 1 year
        return Err(crate::handlers::error_to_response(
            crate::error::SiemError::BadRequest(
                "Hours must be between 1 and 8760 (1 year)".to_string()
            )
        ));
    }
    
    let result = metrics_repo.get_historical_metrics(hours).await;
    
    match &result {
        Ok(metrics) => {
            info!("Historical metrics retrieved for {} hours", hours);
        }
        Err(e) => {
            warn!("Failed to retrieve historical metrics: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting dashboard KPIs
/// 
/// Returns key performance indicators (KPIs) for the main dashboard.
/// Includes high-level statistics and summary metrics.
pub async fn get_dashboard_kpis<R>(
    State(metrics_repo): State<Arc<R>>,
) -> Result<Json<DashboardKpis>, impl IntoResponse>
where
    R: MetricsRepository,
{
    debug!("Getting dashboard KPIs");
    
    let result = metrics_repo.get_dashboard_kpis().await;
    
    match &result {
        Ok(kpis) => {
            info!("Dashboard KPIs retrieved: {} total events, {} events in 24h", 
                  kpis.total_events, kpis.events_24h);
        }
        Err(e) => {
            warn!("Failed to retrieve dashboard KPIs: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for getting log source statistics
/// 
/// Returns statistics about log sources including event counts,
/// last seen timestamps, and source health status.
pub async fn get_log_source_stats<R>(
    State(metrics_repo): State<Arc<R>>,
) -> Result<Json<LogSourceStatsResponse>, impl IntoResponse>
where
    R: MetricsRepository,
{
    debug!("Getting log source statistics");
    
    let result = metrics_repo.get_log_source_stats().await;
    
    match &result {
        Ok(stats) => {
            info!("Log source statistics retrieved: {} sources", stats.len());
        }
        Err(e) => {
            warn!("Failed to retrieve log source statistics: {:?}", e);
        }
    }
    
    match result {
        Ok(stats) => Ok(Json(LogSourceStatsResponse { stats })),
        Err(e) => Err(crate::handlers::error_to_response(e)),
    }
}

/// Handler for getting Prometheus metrics
/// 
/// Returns metrics in Prometheus format for integration with Prometheus
/// monitoring and alerting systems.
pub async fn get_prometheus_metrics<R>(
    State(metrics_repo): State<Arc<R>>,
) -> Result<impl IntoResponse, impl IntoResponse>
where
    R: MetricsRepository,
{
    debug!("Getting Prometheus metrics");
    
    let query = MetricsQuery {
        format: Some("prometheus".to_string()),
        component: None,
        start_time: None,
        end_time: None,
    };
    
    let result = metrics_repo.get_metrics(&query).await;
    
    match result {
        Ok(metrics) => {
            info!("Prometheus metrics retrieved successfully");
            
            // Extract the metrics string from the JSON response
            let metrics_text = metrics
                .get("metrics")
                .and_then(|m| m.as_str())
                .unwrap_or("# No metrics available\n");
            
            Ok((
                [("content-type", "text/plain; version=0.0.4; charset=utf-8")],
                metrics_text.to_string(),
            ))
        }
        Err(e) => {
            warn!("Failed to retrieve Prometheus metrics: {:?}", e);
            Err(crate::handlers::error_to_response(e))
        }
    }
}

/// Handler for getting real-time metrics
/// 
/// Returns current real-time metrics including events per second,
/// active connections, and system load.
pub async fn get_realtime_metrics<R>(
    State(metrics_repo): State<Arc<R>>,
) -> Result<Json<RealtimeMetricsResponse>, impl IntoResponse>
where
    R: MetricsRepository,
{
    debug!("Getting real-time metrics");
    
    // Get current performance metrics
    let performance_result = metrics_repo.get_performance_metrics().await;
    
    match performance_result {
        Ok(performance_data) => {
            info!("Real-time metrics retrieved successfully");
            
            let response = RealtimeMetricsResponse {
                timestamp: chrono::Utc::now(),
                events_per_second: performance_data
                    .get("performance_metrics")
                    .and_then(|pm| pm.get("events_last_hour"))
                    .and_then(|elh| elh.as_u64())
                    .map(|elh| elh / 3600) // Convert hourly to per second
                    .unwrap_or(0),
                total_events: performance_data
                    .get("performance_metrics")
                    .and_then(|pm| pm.get("total_events"))
                    .and_then(|te| te.as_u64())
                    .unwrap_or(0),
                active_sources: performance_data
                    .get("performance_metrics")
                    .and_then(|pm| pm.get("unique_source_ips"))
                    .and_then(|usi| usi.as_u64())
                    .unwrap_or(0),
                system_load: 0.0, // TODO: Implement actual system load monitoring
                memory_usage_percent: 0.0, // TODO: Implement memory monitoring
                cpu_usage_percent: 0.0, // TODO: Implement CPU monitoring
            };
            
            Ok(Json(response))
        }
        Err(e) => {
            warn!("Failed to retrieve real-time metrics: {:?}", e);
            Err(crate::handlers::error_to_response(e))
        }
    }
}

/// Handler for getting metrics summary
/// 
/// Returns a summary of key metrics for quick overview.
/// Useful for status pages and executive dashboards.
pub async fn get_metrics_summary<R>(
    State(metrics_repo): State<Arc<R>>,
) -> Result<Json<MetricsSummaryResponse>, impl IntoResponse>
where
    R: MetricsRepository,
{
    debug!("Getting metrics summary");
    
    // Get dashboard KPIs and performance metrics
    let kpis_result = metrics_repo.get_dashboard_kpis().await;
    let performance_result = metrics_repo.get_performance_metrics().await;
    
    match (kpis_result, performance_result) {
        (Ok(kpis), Ok(performance)) => {
            info!("Metrics summary retrieved successfully");
            
            let response = MetricsSummaryResponse {
                total_events: kpis.total_events,
                events_24h: kpis.events_24h,
                active_alerts: kpis.active_alerts,
                active_rules: kpis.active_rules,
                unique_sources: kpis.unique_sources,
                events_last_hour: performance
                    .get("performance_metrics")
                    .and_then(|pm| pm.get("events_last_hour"))
                    .and_then(|elh| elh.as_u64())
                    .unwrap_or(0),
                unique_users: performance
                    .get("performance_metrics")
                    .and_then(|pm| pm.get("unique_users"))
                    .and_then(|uu| uu.as_u64())
                    .unwrap_or(0),
                timestamp: chrono::Utc::now(),
            };
            
            Ok(Json(response))
        }
        (Err(e), _) | (_, Err(e)) => {
            warn!("Failed to retrieve metrics summary: {:?}", e);
            Err(crate::handlers::error_to_response(e))
        }
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Validate metrics query parameters
fn validate_metrics_query(query: &MetricsQuery) -> Result<(), String> {
    // Validate format
    if let Some(format) = &query.format {
        if !is_valid_metrics_format(format) {
            return Err(format!("Invalid metrics format: {}", format));
        }
    }
    
    // Validate component
    if let Some(component) = &query.component {
        if !is_valid_component(component) {
            return Err(format!("Invalid component name: {}", component));
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

/// Validate metrics format
fn is_valid_metrics_format(format: &str) -> bool {
    matches!(format.to_lowercase().as_str(), "json" | "prometheus" | "csv")
}

/// Validate component name
fn is_valid_component(component: &str) -> bool {
    matches!(
        component.to_lowercase().as_str(),
        "clickhouse" | "redis" | "vector" | "events" | "alerts" | "rules" | "system"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    
    #[test]
    fn test_validate_metrics_query_valid() {
        let query = MetricsQuery {
            format: Some("json".to_string()),
            component: Some("clickhouse".to_string()),
            start_time: Some(Utc::now() - chrono::Duration::hours(1)),
            end_time: Some(Utc::now()),
        };
        
        assert!(validate_metrics_query(&query).is_ok());
    }
    
    #[test]
    fn test_validate_metrics_query_invalid_format() {
        let query = MetricsQuery {
            format: Some("invalid".to_string()),
            component: None,
            start_time: None,
            end_time: None,
        };
        
        assert!(validate_metrics_query(&query).is_err());
    }
    
    #[test]
    fn test_validate_metrics_query_invalid_component() {
        let query = MetricsQuery {
            format: None,
            component: Some("invalid".to_string()),
            start_time: None,
            end_time: None,
        };
        
        assert!(validate_metrics_query(&query).is_err());
    }
    
    #[test]
    fn test_validate_metrics_query_invalid_time_range() {
        let now = Utc::now();
        let query = MetricsQuery {
            format: None,
            component: None,
            start_time: Some(now),
            end_time: Some(now - chrono::Duration::hours(1)), // End before start
        };
        
        assert!(validate_metrics_query(&query).is_err());
    }
    
    #[test]
    fn test_is_valid_metrics_format() {
        assert!(is_valid_metrics_format("json"));
        assert!(is_valid_metrics_format("prometheus"));
        assert!(is_valid_metrics_format("csv"));
        assert!(is_valid_metrics_format("JSON")); // Case insensitive
        assert!(!is_valid_metrics_format("invalid"));
    }
    
    #[test]
    fn test_is_valid_component() {
        assert!(is_valid_component("clickhouse"));
        assert!(is_valid_component("redis"));
        assert!(is_valid_component("vector"));
        assert!(is_valid_component("events"));
        assert!(is_valid_component("CLICKHOUSE")); // Case insensitive
        assert!(!is_valid_component("invalid"));
    }
}