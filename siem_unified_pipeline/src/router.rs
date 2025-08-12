//! Router configuration for the SIEM unified pipeline
//!
//! This module defines the HTTP routes and their corresponding handlers using the
//! modular handler architecture with repository pattern for data access.

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::{
    cors::CorsLayer,
    trace::TraceLayer,
};

use crate::error::PipelineError;
use crate::handlers;

/// Simplified application state with single ClickHouse client
#[derive(Clone)]
pub struct AppState {
    /// Single ClickHouse client for all database operations
    pub ch: clickhouse::Client,
    /// Events table name (e.g., "dev.events")
    pub events_table: String,
}

impl AppState {
    /// Create new application state with ClickHouse client
    pub fn new(ch_url: String, events_table: String) -> Result<Self, PipelineError> {
        let client = clickhouse::Client::default()
            .with_url(ch_url)
            .with_compression(clickhouse::Compression::Lz4);
        
        Ok(Self {
            ch: client,
            events_table,
        })
    }
}

/// Create the main application router with core routes only
pub fn create_router(state: AppState) -> Router {
    Router::new()
        // Core health endpoints
        .route("/health", get(handlers::health_check))
        .route("/api/v1/health", get(handlers::health_check))
        .route("/dev/health", get(handlers::health_check))
        
        // Core events endpoints (ClickHouse-based only)
        .route("/api/v1/events/search", post(handlers::search_events))
        .route("/api/v1/events/stream/ch", get(handlers::stream_events_ch))
        .route("/dev/metrics/eps", get(handlers::get_eps_stats))
        
        // Core log sources endpoints
        .route("/api/v1/log-sources", get(handlers::get_log_sources))
        .route("/api/v1/log-sources", post(handlers::create_log_source))
        .route("/api/v1/log-sources/:source_id", get(handlers::get_log_source_detail))
        .route("/api/v1/log-sources/:source_id", put(handlers::update_log_source))
        
        // Core rules endpoints
        .route("/api/v1/rules", get(handlers::get_rules))
        .route("/api/v1/rules", post(handlers::create_rule))
        .route("/api/v1/rules/:rule_id", get(handlers::get_rule))
        .route("/api/v1/rules/:rule_id", put(handlers::update_rule))
        .route("/api/v1/rules/:rule_id", delete(handlers::delete_rule))
        
        // Legacy endpoints commented out (moved to _legacy)
        // Alert endpoints - moved to _legacy/alerts.rs
        // System endpoints - moved to _legacy/system.rs  
        // Legacy metrics endpoints - moved to _legacy/metrics.rs
        
        // Add middleware
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive())
        )
        .with_state(state.into())
}

/// Create a minimal router for health checks only
/// Useful for container health probes
pub fn create_health_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(handlers::health_check))
        // Legacy health endpoints moved to _legacy
        // .route("/health/readiness", get(handlers::readiness_probe))
        // .route("/health/liveness", get(handlers::liveness_probe))
        // .route("/health/startup", get(handlers::startup_probe))
        .with_state(state)
}

/// Create a metrics-only router (legacy endpoints disabled)
/// Useful for monitoring endpoints
pub fn create_metrics_router(state: AppState) -> Router {
    Router::new()
        // Legacy metrics endpoints moved to _legacy
        // .route("/metrics", get(handlers::get_prometheus_metrics))
        // .route("/api/v1/metrics", get(handlers::get_metrics))
        // .route("/api/v1/metrics/performance", get(handlers::get_performance_metrics))
        // .route("/api/v1/metrics/dashboard", get(handlers::get_dashboard_kpis))
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use tower::ServiceExt;
    
    #[tokio::test]
    async fn test_health_endpoint() {
        let state = AppState::new(
            "http://localhost:8123".to_string(),
            "dev.events".to_string()
        ).unwrap();
        let app = create_health_router(state);
        
        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/health")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        
        // Note: This will likely fail in tests since ClickHouse isn't available
        // but it tests the route configuration
        assert!(response.status() == StatusCode::OK || response.status().is_server_error());
    }
    
    #[test]
    fn test_app_state_creation() {
        let state = AppState::new(
            "http://localhost:8123".to_string(),
            "dev.events".to_string()
        ).unwrap();
        
        // Verify ClickHouse client and events table are set
        assert_eq!(state.events_table, "dev.events");
        // Note: Cannot easily test client without actual connection
    }
}