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

// v2 is the only module enabled by default
pub mod v2;
pub mod error;

// Legacy code is quarantined behind the `legacy` feature
#[cfg(feature = "legacy")]
pub mod legacy;

// Version information
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const NAME: &str = env!("CARGO_PKG_NAME");
pub const DESCRIPTION: &str = env!("CARGO_PKG_DESCRIPTION");



// Remove large v1/v0 convenience initializers to keep v2 minimal

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
    use crate::error::PipelineError;
    use std::time::{SystemTime, UNIX_EPOCH};
    use base64::{engine::general_purpose, Engine as _};
    
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
        general_purpose::STANDARD.encode(data)
    }
    
    /// Decode base64 data
    pub fn decode_base64(data: &str) -> Result<Vec<u8>, PipelineError> {
        general_purpose::STANDARD.decode(data).map_err(|e| {
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
#[cfg(feature = "core")]
pub mod prelude {
    pub use crate::{
        config::PipelineConfig,
        pipeline::{Pipeline, PipelineEvent, PipelineStats},
        error::{PipelineError, Result},
        models::*,
        auth::{AuthManager, Claims},
        metrics::{MetricsCollector, SystemMetrics, PipelineMetrics},
        types::api::*,
        dal::traits::*,
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
    pub fn create_ui_router() -> Router {
        Router::new()
            .route("/", axum::routing::get(dashboard))
            .route("/events", axum::routing::get(events_page))
            .route("/alerts", axum::routing::get(alerts_page))
            .route("/rules", axum::routing::get(rules_page))
            .route("/settings", axum::routing::get(settings_page))
            .nest_service("/static", ServeDir::new("static"))
    }
    
    async fn dashboard() -> Html<&'static str> {
        Html(include_str!("../web/dashboard.html"))
    }
    
    async fn events_page() -> Html<&'static str> {
        Html(include_str!("../web/events.html"))
    }
    
    async fn alerts_page() -> Html<&'static str> {
        Html(include_str!("../web/alerts.html"))
    }
    
    async fn rules_page() -> Html<&'static str> {
        Html(include_str!("../web/rules.html"))
    }
    
    async fn settings_page() -> Html<&'static str> {
        Html(include_str!("../web/settings.html"))
    }
}

#[cfg(feature = "plugin-system")]
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