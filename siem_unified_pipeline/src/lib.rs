//! SIEM Unified Pipeline
//!
//! A comprehensive Security Information and Event Management (SIEM) pipeline
//! built in Rust for high-performance log processing, threat detection, and
//! security analytics.
//!
//! # Features
//!
//! - **High-Performance Ingestion**: Multi-source data collection with support
//!   for syslog, files, HTTP, Kafka, TCP, and UDP sources
//! - **Real-time Processing**: Stream processing with configurable transformation
//!   pipelines including parsing, enrichment, normalization, and filtering
//! - **Intelligent Routing**: Rule-based event routing to multiple destinations
//!   with load balancing and failover capabilities
//! - **Scalable Storage**: Support for ClickHouse, Kafka, and
//!   file-based storage backends
//! - **Advanced Analytics**: Built-in correlation engine, anomaly detection,
//!   and threat intelligence integration
//! - **Security-First**: Comprehensive authentication, authorization, audit
//!   logging, and encryption support
//! - **Observability**: Detailed metrics, health monitoring, and performance
//!   analytics with Prometheus integration
//!
//! # Architecture
//!
//! The pipeline follows a modular architecture with the following components:
//!
//! ```text
//! ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
//! │  Ingestion  │───▶│Transformation│───▶│   Routing   │───▶│   Storage    │
//! │   Manager   │    │   Manager    │    │   Manager   │    │   Manager    │
//! └─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
//!        │                   │                   │                   │
//!        ▼                   ▼                   ▼                   ▼
//! ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
//! │   Sources   │    │   Parsers    │    │    Rules    │    │ Destinations │
//! │ • Syslog    │    │ • JSON       │    │ • Severity  │    │ • ClickHouse │
//! │ • File      │    │ • CEF        │    │ • Source    │    │ • Kafka      │
//! │ • HTTP      │    │ • Syslog     │    │ • Content   │    │ • Files      │
//! │ • Kafka     │    │ • Windows    │    │ • Regex     │    │ • S3         │
//! │ • TCP/UDP   │    │ • Custom     │    │ • Custom    │    │ • Elastic    │
//! └─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
//! ```
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use siem_unified_pipeline::{
//!     config::PipelineConfig,
//!     pipeline::Pipeline,
//!     error::PipelineError,
//! };
//!
//! #[tokio::main]
//! async fn main() -> Result<(), PipelineError> {
//!     // Load configuration
//!     let config = PipelineConfig::load("config.toml").await?;
//!     
//!     // Initialize pipeline
//!     let mut pipeline = Pipeline::new(config).await?;
//!     
//!     // Start processing
//!     pipeline.start().await?;
//!     
//!     // Wait for shutdown signal
//!     tokio::signal::ctrl_c().await.unwrap();
//!     
//!     // Graceful shutdown
//!     pipeline.shutdown().await?;
//!     
//!     Ok(())
//! }
//! ```
//!
//! # Configuration
//!
//! The pipeline is configured using TOML files. See the `config` module
//! for detailed configuration options.
//!
//! # Modules
//!
//! - [`config`] - Configuration management and validation
//! - [`pipeline`] - Core pipeline orchestration and workflow
//! - [`ingestion`] - Data source management and collection
//! - [`transformation`] - Event parsing, enrichment, and normalization
//! - [`routing`] - Intelligent event routing and distribution
//! - [`storage`] - Multi-backend storage management
//! - [`metrics`] - Performance monitoring and observability
//! - [`handlers`] - REST API endpoints and web interface
//! - [`middleware`] - HTTP middleware for security and monitoring
//! - [`models`] - Data models and database schemas
//! - [`database`] - Database operations and management
//! - [`auth`] - Authentication, authorization, and security
//! - [`error`] - Comprehensive error handling and reporting

pub mod config;
pub mod pipeline;
pub mod ingestion;
pub mod transformation;
pub mod routing;
pub mod storage;
pub mod metrics;
pub mod handlers;
pub mod middleware;
pub mod models;
pub mod database;
pub mod auth;
pub mod error;
pub mod schemas;

// Re-export commonly used types and traits
pub use config::PipelineConfig;
pub use pipeline::{Pipeline, PipelineEvent, PipelineStats};
pub use error::PipelineError;
pub use models::*;
pub use auth::{AuthManager, Claims};
pub use metrics::{MetricsCollector, SystemMetrics, PipelineMetrics};

// Version information
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const NAME: &str = env!("CARGO_PKG_NAME");
pub const DESCRIPTION: &str = env!("CARGO_PKG_DESCRIPTION");



/// Initialize the pipeline with default configuration
///
/// This is a convenience function that creates a pipeline with sensible
/// defaults for development and testing purposes.
///
/// # Example
///
/// ```rust,no_run
/// use siem_unified_pipeline;
///
/// #[tokio::main]
/// async fn main() {
///     let pipeline = siem_unified_pipeline::init_default().await.unwrap();
///     // Use pipeline...
/// }
/// ```
pub async fn init_default() -> Result<Pipeline, PipelineError> {
    let config = PipelineConfig::default();
    Pipeline::new(config).await
}

/// Initialize the pipeline from a configuration file
///
/// # Arguments
///
/// * `config_path` - Path to the configuration file (TOML format)
///
/// # Example
///
/// ```rust,no_run
/// use siem_unified_pipeline;
///
/// #[tokio::main]
/// async fn main() {
///     let pipeline = siem_unified_pipeline::init_from_file("config.toml")
///         .await
///         .unwrap();
///     // Use pipeline...
/// }
/// ```
pub async fn init_from_file<P: AsRef<std::path::Path>>(config_path: P) -> Result<Pipeline, PipelineError> {
    let config = PipelineConfig::load(config_path)?;
    Pipeline::new(config).await
}

/// Initialize the pipeline from environment variables
///
/// This function reads configuration from environment variables with the
/// prefix `SIEM_`. For example, `SIEM_SERVER_HOST` sets the server host.
///
/// # Example
///
/// ```rust,no_run
/// use siem_unified_pipeline;
///
/// #[tokio::main]
/// async fn main() {
///     std::env::set_var("SIEM_SERVER_HOST", "0.0.0.0");
///     std::env::set_var("SIEM_SERVER_PORT", "8080");
///     
///     let pipeline = siem_unified_pipeline::init_from_env()
///         .await
///         .unwrap();
///     // Use pipeline...
/// }
/// ```
pub async fn init_from_env() -> Result<Pipeline, PipelineError> {
    let config = PipelineConfig::from_env().await?;
    Pipeline::new(config).await
}

/// Health check information
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HealthInfo {
    pub status: HealthStatus,
    pub version: String,
    pub uptime_seconds: u64,
    pub components: std::collections::HashMap<String, ComponentHealth>,
}

/// Component health status
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ComponentHealth {
    pub status: HealthStatus,
    pub message: Option<String>,
    pub last_check: chrono::DateTime<chrono::Utc>,
    pub metrics: Option<serde_json::Value>,
}

/// Overall health status
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}

/// Utility functions for common operations
pub mod utils {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    
    /// Get current timestamp in milliseconds
    pub fn current_timestamp_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
    
    /// Get current timestamp in seconds
    pub fn current_timestamp_secs() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }
    
    /// Format bytes as human-readable string
    pub fn format_bytes(bytes: u64) -> String {
        const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB", "PB"];
        
        if bytes == 0 {
            return "0 B".to_string();
        }
        
        let base = 1024_f64;
        let log = (bytes as f64).log(base).floor() as usize;
        let unit_index = log.min(UNITS.len() - 1);
        let value = bytes as f64 / base.powi(unit_index as i32);
        
        format!("{:.1} {}", value, UNITS[unit_index])
    }
    
    /// Format duration as human-readable string
    pub fn format_duration(duration: std::time::Duration) -> String {
        let total_secs = duration.as_secs();
        
        if total_secs < 60 {
            format!("{}s", total_secs)
        } else if total_secs < 3600 {
            format!("{}m {}s", total_secs / 60, total_secs % 60)
        } else if total_secs < 86400 {
            let hours = total_secs / 3600;
            let minutes = (total_secs % 3600) / 60;
            format!("{}h {}m", hours, minutes)
        } else {
            let days = total_secs / 86400;
            let hours = (total_secs % 86400) / 3600;
            format!("{}d {}h", days, hours)
        }
    }
    
    /// Validate IP address
    pub fn is_valid_ip(ip: &str) -> bool {
        ip.parse::<std::net::IpAddr>().is_ok()
    }
    
    /// Validate hostname
    pub fn is_valid_hostname(hostname: &str) -> bool {
        if hostname.is_empty() || hostname.len() > 253 {
            return false;
        }
        
        hostname
            .split('.')
            .all(|label| {
                !label.is_empty()
                    && label.len() <= 63
                    && label.chars().all(|c| c.is_alphanumeric() || c == '-')
                    && !label.starts_with('-')
                    && !label.ends_with('-')
            })
    }
    
    /// Generate a random ID
    pub fn generate_id() -> String {
        uuid::Uuid::new_v4().to_string()
    }
    
    /// Hash a string using SHA-256
    pub fn hash_string(input: &str) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(input.as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    /// Encode data as base64
    pub fn encode_base64(data: &[u8]) -> String {
        base64::encode(data)
    }
    
    /// Decode base64 data
    pub fn decode_base64(data: &str) -> Result<Vec<u8>, PipelineError> {
        base64::decode(data).map_err(|e| {
            PipelineError::encoding(format!("Failed to decode base64: {}", e))
        })
    }
    
    /// Compress data using gzip
    pub fn compress_gzip(data: &[u8]) -> Result<Vec<u8>, PipelineError> {
        use flate2::{write::GzEncoder, Compression};
        use std::io::Write;
        
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(data).map_err(|e| {
            PipelineError::compression(format!("Failed to compress data: {}", e))
        })?;
        
        encoder.finish().map_err(|e| {
            PipelineError::compression(format!("Failed to finish compression: {}", e))
        })
    }
    
    /// Decompress gzip data
    pub fn decompress_gzip(data: &[u8]) -> Result<Vec<u8>, PipelineError> {
        use flate2::read::GzDecoder;
        use std::io::Read;
        
        let mut decoder = GzDecoder::new(data);
        let mut decompressed = Vec::new();
        
        decoder.read_to_end(&mut decompressed).map_err(|e| {
            PipelineError::compression(format!("Failed to decompress data: {}", e))
        })?;
        
        Ok(decompressed)
    }
}

/// Prelude module for convenient imports
pub mod prelude {
    pub use crate::{
        config::PipelineConfig,
        pipeline::{Pipeline, PipelineEvent, PipelineStats},
        error::{PipelineError, Result},
        models::*,
        auth::{AuthManager, Claims},
        metrics::{MetricsCollector, SystemMetrics, PipelineMetrics},
        utils,
    };
}

// Feature flags for optional functionality
#[cfg(feature = "web-ui")]
pub mod web_ui {
    //! Web-based user interface for the SIEM pipeline
    //!
    //! This module provides a web-based dashboard for monitoring and
    //! managing the SIEM pipeline. It includes real-time metrics,
    //! event visualization, alert management, and configuration tools.
    
    use axum::{Router, response::Html};
    use tower_http::services::ServeDir;
    
    /// Create the web UI router
    pub fn create_ui_router(state: crate::handlers::AppState) -> Router<crate::handlers::AppState> {
        tracing::info!("Creating UI router with routes: /, /test-ui, /events, /alerts, /rules, /settings, /console, /static");
        let router = Router::new()
            .route("/", axum::routing::get(dashboard))
            .route("/test-ui", axum::routing::get(|| async { 
                tracing::info!("Test UI route handler called from web_ui module");
                "Test UI route works from web_ui module!" 
            }))
            .route("/events", axum::routing::get(events_page))
            .route("/alerts", axum::routing::get(alerts_page))
            .route("/rules", axum::routing::get(rules_page))
            .route("/settings", axum::routing::get(settings_page))
            .nest("/console", console::create_console_router())
            .nest_service("/static", ServeDir::new("static"))
            .with_state(state);
        tracing::info!("UI router created successfully");
        router
    }
    
    async fn dashboard() -> Html<String> {
        tracing::info!("Dashboard route handler called");
        Html("<html><body><h1>Dashboard</h1><p>Welcome to the SIEM Dashboard</p></body></html>".to_string())
    }
    
    async fn events_page() -> Html<String> {
        Html("<html><body><h1>Events</h1><p>Event management page</p></body></html>".to_string())
    }
    
    async fn alerts_page() -> Html<String> {
        Html("<html><body><h1>Alerts</h1><p>Alert management page</p></body></html>".to_string())
    }
    
    async fn rules_page() -> Html<String> {
        Html("<html><body><h1>Rules</h1><p>Rule management page</p></body></html>".to_string())
    }
    
    async fn settings_page() -> Html<String> {
        Html("<html><body><h1>Settings</h1><p>Settings page</p></body></html>".to_string())
    }
    
    /// Admin Console module for system administration
    pub mod console {
        use axum::{
            extract::{State, Path, Query},
            http::{StatusCode, HeaderMap},
            response::{Html, IntoResponse},
            routing::{get, post},
            Router, Json,
        };
        use maud::{html, Markup, DOCTYPE};
        use serde::{Deserialize, Serialize};
        use std::collections::HashMap;
        use crate::handlers::AppState;
        use crate::error::Result;
        
        /// Admin token header for write operations
        const ADMIN_TOKEN_HEADER: &str = "X-Admin-Token";
        
        /// Create the admin console router
        pub fn create_console_router() -> Router<crate::handlers::AppState> {
            Router::new()
                .route("/", get(console_dashboard))
                .route("/health", get(health_console))
                .route("/metrics", get(metrics_console))
                .route("/events", get(events_console))
                .route("/config", get(config_console))
                .route("/config", post(update_config_console))
                .route("/routing", get(routing_console))
                .route("/system", get(system_console))
                .route("/api/health", get(api_health_data))
                .route("/api/metrics", get(api_metrics_data))
                .route("/api/events", get(api_events_data))
                .route("/api/config", get(api_config_data))
        }
        
        /// Check if admin token is valid for write operations
        fn check_admin_token(headers: &HeaderMap) -> bool {
            if let Some(token) = headers.get(ADMIN_TOKEN_HEADER) {
                if let Ok(token_str) = token.to_str() {
                    // In production, this should validate against a secure token
                    // For now, we'll use a simple check
                    return !token_str.is_empty() && token_str.len() > 8;
                }
            }
            false
        }
        
        /// Generate the base HTML layout
        fn base_layout(title: &str, content: Markup) -> Markup {
            html! {
                (DOCTYPE)
                html lang="en" {
                    head {
                        meta charset="utf-8";
                        meta name="viewport" content="width=device-width, initial-scale=1";
                        title { "SIEM Admin Console - " (title) }
                        style {
                            "
                            * { margin: 0; padding: 0; box-sizing: border-box; }
                            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
                            .header { background: #2c3e50; color: white; padding: 1rem 2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                            .header h1 { font-size: 1.5rem; font-weight: 600; }
                            .nav { background: white; border-bottom: 1px solid #e0e0e0; padding: 0 2rem; }
                            .nav ul { list-style: none; display: flex; }
                            .nav li { margin-right: 2rem; }
                            .nav a { display: block; padding: 1rem 0; text-decoration: none; color: #333; border-bottom: 2px solid transparent; }
                            .nav a:hover, .nav a.active { color: #3498db; border-bottom-color: #3498db; }
                            .container { max-width: 1200px; margin: 2rem auto; padding: 0 2rem; }
                            .card { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 2rem; }
                            .card-header { padding: 1.5rem; border-bottom: 1px solid #e0e0e0; }
                            .card-header h2 { font-size: 1.25rem; font-weight: 600; color: #2c3e50; }
                            .card-body { padding: 1.5rem; }
                            .status-healthy { color: #27ae60; font-weight: 600; }
                            .status-warning { color: #f39c12; font-weight: 600; }
                            .status-error { color: #e74c3c; font-weight: 600; }
                            .btn { display: inline-block; padding: 0.5rem 1rem; background: #3498db; color: white; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; }
                            .btn:hover { background: #2980b9; }
                            .btn-danger { background: #e74c3c; }
                            .btn-danger:hover { background: #c0392b; }
                            .table { width: 100%; border-collapse: collapse; }
                            .table th, .table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e0e0e0; }
                            .table th { background: #f8f9fa; font-weight: 600; }
                            .form-group { margin-bottom: 1rem; }
                            .form-label { display: block; margin-bottom: 0.5rem; font-weight: 600; }
                            .form-input { width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
                            .alert { padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
                            .alert-info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
                            .alert-warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
                            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
                            .metric { text-align: center; }
                            .metric-value { font-size: 2rem; font-weight: bold; color: #2c3e50; }
                            .metric-label { color: #7f8c8d; margin-top: 0.5rem; }
                            "
                        }
                    }
                    body {
                        header class="header" {
                            h1 { "SIEM Admin Console" }
                        }
                        nav class="nav" {
                            ul {
                                li { a href="/console/" { "Dashboard" } }
                                li { a href="/console/health" { "Health" } }
                                li { a href="/console/metrics" { "Metrics" } }
                                li { a href="/console/events" { "Events" } }
                                li { a href="/console/config" { "Config" } }
                                li { a href="/console/routing" { "Routing" } }
                                li { a href="/console/system" { "System" } }
                            }
                        }
                        main class="container" {
                            (content)
                        }
                    }
                }
            }
        }
        
        /// Console dashboard page
        async fn console_dashboard(State(state): State<crate::handlers::AppState>) -> Result<impl IntoResponse> {
            let content = html! {
                div class="card" {
                    div class="card-header" {
                        h2 { "System Overview" }
                    }
                    div class="card-body" {
                        div class="grid" {
                            div class="metric" {
                                div class="metric-value" id="total-events" { "Loading..." }
                                div class="metric-label" { "Total Events" }
                            }
                            div class="metric" {
                                div class="metric-value" id="events-per-second" { "Loading..." }
                                div class="metric-label" { "Events/Second" }
                            }
                            div class="metric" {
                                div class="metric-value" id="active-sources" { "Loading..." }
                                div class="metric-label" { "Active Sources" }
                            }
                            div class="metric" {
                                div class="metric-value" id="system-health" { "Loading..." }
                                div class="metric-label" { "System Health" }
                            }
                        }
                    }
                }
                
                div class="card" {
                    div class="card-header" {
                        h2 { "Quick Actions" }
                    }
                    div class="card-body" {
                        a href="/console/health" class="btn" { "View Health Status" }
                        " "
                        a href="/console/metrics" class="btn" { "View Metrics" }
                        " "
                        a href="/console/events" class="btn" { "Browse Events" }
                    }
                }
                
                script {
                    "
                    // Auto-refresh dashboard data
                    async function refreshDashboard() {
                        try {
                            const [healthRes, metricsRes] = await Promise.all([
                                fetch('/console/api/health'),
                                fetch('/console/api/metrics')
                            ]);
                            
                            if (healthRes.ok && metricsRes.ok) {
                                const health = await healthRes.json();
                                const metrics = await metricsRes.json();
                                
                                document.getElementById('system-health').textContent = health.status;
                                document.getElementById('total-events').textContent = metrics.total_events || '0';
                                document.getElementById('events-per-second').textContent = metrics.events_per_second || '0';
                                document.getElementById('active-sources').textContent = metrics.active_sources || '0';
                            }
                        } catch (error) {
                            console.error('Failed to refresh dashboard:', error);
                        }
                    }
                    
                    // Refresh every 5 seconds
                    refreshDashboard();
                    setInterval(refreshDashboard, 5000);
                    "
                }
            };
            
            Ok(Html(base_layout("Dashboard", content).into_string()))
        }
        
        /// Health status console page
        async fn health_console(State(_state): State<crate::handlers::AppState>) -> Result<impl IntoResponse> {
            let content = html! {
                div class="card" {
                    div class="card-header" {
                        h2 { "System Health Status" }
                    }
                    div class="card-body" {
                        div id="health-status" { "Loading health status..." }
                    }
                }
                
                script {
                    "
                    async function loadHealthStatus() {
                        try {
                            const response = await fetch('/console/api/health');
                            if (response.ok) {
                                const health = await response.json();
                                const statusDiv = document.getElementById('health-status');
                                
                                let html = '<table class=\"table\">';
                                html += '<thead><tr><th>Component</th><th>Status</th><th>Last Check</th><th>Response Time</th></tr></thead><tbody>';
                                
                                for (const [name, component] of Object.entries(health.components || {})) {
                                    const statusClass = component.status === 'Healthy' ? 'status-healthy' : 
                                                       component.status === 'Degraded' ? 'status-warning' : 'status-error';
                                    html += `<tr>`;
                                    html += `<td>${name}</td>`;
                                    html += `<td class=\"${statusClass}\">${component.status}</td>`;
                                    html += `<td>${new Date(component.last_check).toLocaleString()}</td>`;
                                    html += `<td>${component.response_time_ms.toFixed(2)}ms</td>`;
                                    html += `</tr>`;
                                }
                                
                                html += '</tbody></table>';
                                statusDiv.innerHTML = html;
                            }
                        } catch (error) {
                            document.getElementById('health-status').innerHTML = '<div class=\"alert alert-warning\">Failed to load health status</div>';
                        }
                    }
                    
                    loadHealthStatus();
                    setInterval(loadHealthStatus, 10000);
                    "
                }
            };
            
            Ok(Html(base_layout("Health", content).into_string()))
        }
        
        /// Metrics console page
        async fn metrics_console(State(_state): State<crate::handlers::AppState>) -> Result<impl IntoResponse> {
            let content = html! {
                div class="card" {
                    div class="card-header" {
                        h2 { "System Metrics" }
                    }
                    div class="card-body" {
                        div id="metrics-data" { "Loading metrics..." }
                    }
                }
                
                script {
                    "
                    async function loadMetrics() {
                        try {
                            const response = await fetch('/console/api/metrics');
                            if (response.ok) {
                                const metrics = await response.json();
                                const metricsDiv = document.getElementById('metrics-data');
                                
                                let html = '<div class=\"grid\">';
                                
                                // System metrics
                                if (metrics.system) {
                                    html += '<div class=\"card\">';
                                    html += '<div class=\"card-header\"><h3>System</h3></div>';
                                    html += '<div class=\"card-body\">';
                                    html += `<p>CPU Usage: ${(metrics.system.cpu_usage * 100).toFixed(1)}%</p>`;
                                    html += `<p>Memory Usage: ${(metrics.system.memory_usage * 100).toFixed(1)}%</p>`;
                                    html += `<p>Disk Usage: ${(metrics.system.disk_usage * 100).toFixed(1)}%</p>`;
                                    html += '</div></div>';
                                }
                                
                                // Pipeline metrics
                                if (metrics.pipeline) {
                                    html += '<div class=\"card\">';
                                    html += '<div class=\"card-header\"><h3>Pipeline</h3></div>';
                                    html += '<div class=\"card-body\">';
                                    html += `<p>Events Processed: ${metrics.pipeline.events_processed || 0}</p>`;
                                    html += `<p>Events Per Second: ${metrics.pipeline.events_per_second || 0}</p>`;
                                    html += `<p>Processing Errors: ${metrics.pipeline.processing_errors || 0}</p>`;
                                    html += '</div></div>';
                                }
                                
                                html += '</div>';
                                metricsDiv.innerHTML = html;
                            }
                        } catch (error) {
                            document.getElementById('metrics-data').innerHTML = '<div class=\"alert alert-warning\">Failed to load metrics</div>';
                        }
                    }
                    
                    loadMetrics();
                    setInterval(loadMetrics, 5000);
                    "
                }
            };
            
            Ok(Html(base_layout("Metrics", content).into_string()))
        }
        
        /// Events console page
        async fn events_console(State(state): State<crate::handlers::AppState>) -> Result<impl IntoResponse> {
            let content = html! {
                div class="card" {
                    div class="card-header" {
                        h2 { "Recent Events" }
                    }
                    div class="card-body" {
                        div class="alert alert-info" {
                            "This page shows the most recent events. Use the search filters to narrow down results."
                        }
                        div id="events-data" { "Loading events..." }
                    }
                }
                
                script {
                    "
                    async function loadEvents() {
                        try {
                            const response = await fetch('/console/api/events?limit=50');
                            if (response.ok) {
                                const data = await response.json();
                                const eventsDiv = document.getElementById('events-data');
                                
                                if (data.events && data.events.length > 0) {
                                    let html = '<table class=\"table\">';
                                    html += '<thead><tr><th>Timestamp</th><th>Source</th><th>Severity</th><th>Message</th></tr></thead><tbody>';
                                    
                                    data.events.forEach(event => {
                                        html += `<tr>`;
                                        html += `<td>${new Date(event.timestamp).toLocaleString()}</td>`;
                                        html += `<td>${event.source || 'Unknown'}</td>`;
                                        html += `<td>${event.severity || 'Info'}</td>`;
                                        html += `<td>${(event.message || '').substring(0, 100)}${(event.message || '').length > 100 ? '...' : ''}</td>`;
                                        html += `</tr>`;
                                    });
                                    
                                    html += '</tbody></table>';
                                    eventsDiv.innerHTML = html;
                                } else {
                                    eventsDiv.innerHTML = '<div class=\"alert alert-info\">No events found</div>';
                                }
                            }
                        } catch (error) {
                            document.getElementById('events-data').innerHTML = '<div class=\"alert alert-warning\">Failed to load events</div>';
                        }
                    }
                    
                    loadEvents();
                    setInterval(loadEvents, 10000);
                    "
                }
            };
            
            Ok(Html(base_layout("Events", content).into_string()))
        }
        
        /// Configuration console page
        async fn config_console(State(_state): State<crate::handlers::AppState>) -> Result<impl IntoResponse> {
            let content = html! {
                div class="card" {
                    div class="card-header" {
                        h2 { "Configuration Management" }
                    }
                    div class="card-body" {
                        div class="alert alert-warning" {
                            "⚠️ Configuration changes require admin token in X-Admin-Token header for write operations."
                        }
                        div id="config-data" { "Loading configuration..." }
                    }
                }
                
                script {
                    "
                    async function loadConfig() {
                        try {
                            const response = await fetch('/console/api/config');
                            if (response.ok) {
                                const config = await response.json();
                                const configDiv = document.getElementById('config-data');
                                
                                let html = '<pre style=\"background: #f8f9fa; padding: 1rem; border-radius: 4px; overflow-x: auto;\">';
                                html += JSON.stringify(config, null, 2);
                                html += '</pre>';
                                
                                configDiv.innerHTML = html;
                            }
                        } catch (error) {
                            document.getElementById('config-data').innerHTML = '<div class=\"alert alert-warning\">Failed to load configuration</div>';
                        }
                    }
                    
                    loadConfig();
                    "
                }
            };
            
            Ok(Html(base_layout("Configuration", content).into_string()))
        }
        
        /// Update configuration (requires admin token)
        async fn update_config_console(
            State(state): State<crate::handlers::AppState>,
            headers: HeaderMap,
            Json(config): Json<serde_json::Value>,
        ) -> Result<impl IntoResponse> {
            if !check_admin_token(&headers) {
                return Ok((StatusCode::UNAUTHORIZED, "Admin token required").into_response());
            }
            
            // Delegate to existing config update handler
            let request = crate::handlers::ConfigUpdateRequest {
                config,
                restart_required: Some(false),
            };
            
            match crate::handlers::update_config(State(state), Json(request)).await {
                Ok(response) => Ok(response.into_response()),
                Err(e) => Ok((StatusCode::INTERNAL_SERVER_ERROR, format!("Config update failed: {}", e)).into_response()),
            }
        }
        
        /// Routing console page
        async fn routing_console(State(_state): State<crate::handlers::AppState>) -> Result<impl IntoResponse> {
            let content = html! {
                div class="card" {
                    div class="card-header" {
                        h2 { "Routing Rules" }
                    }
                    div class="card-body" {
                        div class="alert alert-info" {
                            "Routing rules determine how events are processed and forwarded to destinations."
                        }
                        a href="/api/v1/routing/rules" class="btn" target="_blank" { "View Raw JSON" }
                    }
                }
            };
            
            Ok(Html(base_layout("Routing", content).into_string()))
        }
        
        /// System console page
        async fn system_console(State(_state): State<crate::handlers::AppState>) -> Result<impl IntoResponse> {
            let content = html! {
                div class="card" {
                    div class="card-header" {
                        h2 { "System Administration" }
                    }
                    div class="card-body" {
                        div class="alert alert-warning" {
                            "⚠️ System operations require admin token and may affect service availability."
                        }
                        
                        h3 { "Pipeline Control" }
                        p {
                            a href="/api/v1/pipeline/start" class="btn" { "Start Pipeline" }
                            " "
                            a href="/api/v1/pipeline/stop" class="btn btn-danger" { "Stop Pipeline" }
                            " "
                            a href="/api/v1/pipeline/restart" class="btn" { "Restart Pipeline" }
                        }
                        
                        h3 style="margin-top: 2rem;" { "System Information" }
                        p {
                            a href="/api/v1/system/status" class="btn" target="_blank" { "System Status" }
                            " "
                            a href="/api/v1/debug" class="btn" target="_blank" { "Debug Info" }
                            " "
                            a href="/api/v1/version" class="btn" target="_blank" { "Version Info" }
                        }
                    }
                }
            };
            
            Ok(Html(base_layout("System", content).into_string()))
        }
        
        // API endpoints for AJAX data loading
        
        /// API endpoint for health data
        async fn api_health_data(State(state): State<crate::handlers::AppState>) -> Result<impl IntoResponse> {
            // Delegate to existing health check handler
            crate::handlers::detailed_health_check(State(state)).await
        }
        
        /// API endpoint for metrics data
        async fn api_metrics_data(State(state): State<crate::handlers::AppState>) -> Result<impl IntoResponse> {
            // Delegate to existing metrics handler
            crate::handlers::get_metrics(State(state), Query(crate::handlers::MetricsQuery {
                format: None,
                component: None,
                hours: Some(1),
            })).await
        }
        
        /// API endpoint for events data
        async fn api_events_data(
            State(state): State<crate::handlers::AppState>,
            Query(params): Query<HashMap<String, String>>,
        ) -> Result<impl IntoResponse> {
            // Convert query params to EventSearchRequest
            let limit = params.get("limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(50);
            
            let search_request = crate::schemas::EventSearchRequest {
                tenant_id: None,
                source_ip: params.get("source_ip").cloned(),
                event_type: params.get("event_type").cloned(),
                start_time: None, // Use default time range
                end_time: None,
                limit: Some(limit),
                offset: Some(0),
                query: params.get("query").cloned(),
                severity: params.get("severity").cloned(),
                source: params.get("source").cloned(),
            };
            
            // Delegate to existing search handler
            crate::handlers::search_events(State(state), Query(search_request)).await
        }
        
        /// API endpoint for config data
        async fn api_config_data(State(state): State<crate::handlers::AppState>) -> Result<impl IntoResponse> {
            // Delegate to existing config handler
            crate::handlers::get_config(State(state)).await
        }
    }
}

/// Stub for create_ui_router when web-ui feature is not enabled
#[cfg(not(feature = "web-ui"))]
pub mod web_ui {
    use axum::Router;
    
    pub fn create_ui_router() -> Router<crate::handlers::AppState> {
        Router::new()
    }
}

#[cfg(feature = "plugins")]
pub mod plugins {
    //! Plugin system for extending pipeline functionality
    //!
    //! This module provides a plugin architecture that allows users to
    //! extend the pipeline with custom parsers, enrichers, filters,
    //! and output destinations.
    
    use async_trait::async_trait;
    use serde_json::Value;
    use crate::{PipelineEvent, Result};
    
    /// Plugin trait for custom functionality
    #[async_trait]
    pub trait Plugin: Send + Sync {
        /// Plugin name
        fn name(&self) -> &str;
        
        /// Plugin version
        fn version(&self) -> &str;
        
        /// Initialize the plugin
        async fn initialize(&mut self, config: Value) -> Result<(), PipelineError>;
        
        /// Process an event
        async fn process(&self, event: &mut PipelineEvent) -> Result<(), PipelineError>;
        
        /// Shutdown the plugin
        async fn shutdown(&mut self) -> Result<(), PipelineError>;
    }
    
    /// Plugin manager for loading and managing plugins
    pub struct PluginManager {
        plugins: Vec<Box<dyn Plugin>>,
    }
    
    impl PluginManager {
        pub fn new() -> Self {
            Self {
                plugins: Vec::new(),
            }
        }
        
        pub fn register_plugin(&mut self, plugin: Box<dyn Plugin>) {
            self.plugins.push(plugin);
        }
        
        pub async fn initialize_all(&mut self, configs: Vec<Value>) -> Result<(), PipelineError> {
            for (plugin, config) in self.plugins.iter_mut().zip(configs.iter()) {
                plugin.initialize(config.clone()).await?;
            }
            Ok(())
        }
        
        pub async fn process_event(&self, event: &mut PipelineEvent) -> Result<(), PipelineError> {
            for plugin in &self.plugins {
                plugin.process(event).await?;
            }
            Ok(())
        }
        
        pub async fn shutdown_all(&mut self) -> Result<(), PipelineError> {
            for plugin in &mut self.plugins {
                plugin.shutdown().await?;
            }
            Ok(())
        }
    }
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_version_info() {
        assert!(!VERSION.is_empty());
        assert!(!NAME.is_empty());
    }
    
    #[test]
    fn test_utils() {
        use utils::*;
        
        // Test timestamp functions
        let ts_ms = current_timestamp_ms();
        let ts_secs = current_timestamp_secs();
        assert!(ts_ms > ts_secs * 1000);
        
        // Test byte formatting
        assert_eq!(format_bytes(0), "0 B");
        assert_eq!(format_bytes(1024), "1.0 KB");
        assert_eq!(format_bytes(1024 * 1024), "1.0 MB");
        
        // Test IP validation
        assert!(is_valid_ip("192.168.1.1"));
        assert!(is_valid_ip("::1"));
        assert!(!is_valid_ip("invalid"));
        
        // Test hostname validation
        assert!(is_valid_hostname("example.com"));
        assert!(is_valid_hostname("sub.example.com"));
        assert!(!is_valid_hostname(""));
        assert!(!is_valid_hostname("invalid..hostname"));
        
        // Test ID generation
        let id1 = generate_id();
        let id2 = generate_id();
        assert_ne!(id1, id2);
        assert_eq!(id1.len(), 36); // UUID v4 length
        
        // Test hashing
        let hash1 = hash_string("test");
        let hash2 = hash_string("test");
        let hash3 = hash_string("different");
        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
        
        // Test base64 encoding/decoding
        let data = b"hello world";
        let encoded = encode_base64(data);
        let decoded = decode_base64(&encoded).unwrap();
        assert_eq!(data, decoded.as_slice());
        
        // Test compression/decompression
        let original = b"This is a test string for compression that is long enough to actually compress well. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";
        let compressed = compress_gzip(original).unwrap();
        let decompressed = decompress_gzip(&compressed).unwrap();
        assert_eq!(original, decompressed.as_slice());
        assert!(compressed.len() < original.len());
    }
    
    #[tokio::test]
    async fn test_default_initialization() {
        let result = init_default().await;
        assert!(result.is_ok());
    }
}