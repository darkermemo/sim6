//! Health check module for SIEM Unified Pipeline
//! Provides comprehensive health checks for all pipeline components
//! Uses existing configuration without creating new files

use crate::config::PipelineConfig;
use crate::error::PipelineError;
use anyhow::{Context, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tokio::time::{timeout, interval};
use tracing::{debug, info, warn, error};

/// Trait abstractions for dependency health probing
/// These traits enable mocking and testing of health checks
pub mod probes {
    use super::*;

    /// ClickHouse health probe trait
    #[async_trait]
    pub trait ClickHouseProbe: Send + Sync {
        /// Perform a simple ping to ClickHouse
        async fn ping(&self) -> Result<(), PipelineError>;
        /// Execute a trivial query to test read/write capability
        async fn trivial_query(&self) -> Result<(), PipelineError>;
    }

    /// Redis health probe trait
    #[async_trait]
    pub trait RedisProbe: Send + Sync {
        /// Perform a Redis ping command
        async fn ping(&self) -> Result<(), PipelineError>;
    }

    /// Kafka health probe trait
    #[async_trait]
    pub trait KafkaProbe: Send + Sync {
        /// Check Kafka cluster metadata
        async fn metadata(&self) -> Result<(), PipelineError>;
    }

    /// Vector health probe trait
    #[async_trait]
    pub trait VectorProbe: Send + Sync {
        /// Check Vector health endpoint
        async fn health(&self) -> Result<bool, PipelineError>;
    }

    /// Real ClickHouse probe implementation
    pub struct RealClickHouseProbe {
        pub client: Client,
        pub base_url: String,
        pub timeout_ms: u64,
    }

    #[async_trait]
    impl ClickHouseProbe for RealClickHouseProbe {
        async fn ping(&self) -> Result<(), PipelineError> {
            let ping_url = format!("{}/ping", self.base_url);
            let response = timeout(
                 Duration::from_millis(self.timeout_ms),
                 self.client.get(&ping_url).send()
             ).await
             .map_err(|_| PipelineError::timeout("ClickHouse ping timeout"))?
            .map_err(|e| PipelineError::HttpError(e))?;

            if response.status().is_success() {
                Ok(())
            } else {
                Err(PipelineError::ConnectionError(format!("ClickHouse ping returned status: {}", response.status())))
            }
        }

        async fn trivial_query(&self) -> Result<(), PipelineError> {
            let query_url = format!("{}/", self.base_url);
            let query = "SELECT 1";
            
            let response = timeout(
                Duration::from_millis(self.timeout_ms),
                self.client.post(&query_url)
                    .header("Content-Type", "text/plain")
                    .body(query)
                    .send()
            ).await
            .map_err(|_| PipelineError::timeout("ClickHouse query timeout"))?
            .map_err(|e| PipelineError::HttpError(e))?;

            if response.status().is_success() {
                Ok(())
            } else {
                Err(PipelineError::ConnectionError(format!("ClickHouse query returned status: {}", response.status())))
            }
        }
    }

    /// Real Redis probe implementation
    pub struct RealRedisProbe {
        pub connection_string: String,
        pub timeout_ms: u64,
    }

    #[async_trait]
    impl RedisProbe for RealRedisProbe {
        async fn ping(&self) -> Result<(), PipelineError> {
            use redis::{AsyncCommands, cmd};
            
            let client = redis::Client::open(self.connection_string.as_str())
                .map_err(|e| PipelineError::RedisError(e))?;
            
            let mut conn = timeout(
                Duration::from_millis(self.timeout_ms),
                client.get_async_connection()
            ).await
            .map_err(|_| PipelineError::timeout("Redis connection timeout"))?
            .map_err(|e| PipelineError::RedisError(e))?;

            timeout(
                Duration::from_millis(self.timeout_ms),
                cmd("PING").query_async::<_, String>(&mut conn)
            ).await
            .map_err(|_| PipelineError::timeout("Redis ping timeout"))?
            .map_err(|e| PipelineError::RedisError(e))?;

            Ok(())
        }
    }

    /// Real Kafka probe implementation
    pub struct RealKafkaProbe {
        pub brokers: Vec<String>,
        pub timeout_ms: u64,
    }

    #[async_trait]
    impl KafkaProbe for RealKafkaProbe {
        async fn metadata(&self) -> Result<(), PipelineError> {
            use rdkafka::config::ClientConfig;
            use rdkafka::consumer::{BaseConsumer, Consumer};
            
            let consumer: BaseConsumer = ClientConfig::new()
                .set("bootstrap.servers", self.brokers.join(","))
                .set("session.timeout.ms", "6000")
                .set("enable.auto.commit", "false")
                .create()
                .map_err(|e| PipelineError::KafkaError(e))?;

            timeout(
                Duration::from_millis(self.timeout_ms),
                async {
                    consumer.fetch_metadata(None, Duration::from_millis(self.timeout_ms))
                        .map_err(|e| PipelineError::KafkaError(e))
                }
            ).await
            .map_err(|_| PipelineError::timeout("Kafka metadata timeout"))??;

            Ok(())
        }
    }

    /// Real Vector probe implementation
    pub struct RealVectorProbe {
        pub client: Client,
        pub health_url: String,
        pub timeout_ms: u64,
    }

    #[async_trait]
    impl VectorProbe for RealVectorProbe {
        async fn health(&self) -> Result<bool, PipelineError> {
            let response = timeout(
                Duration::from_millis(self.timeout_ms),
                self.client.get(&self.health_url).send()
            ).await
            .map_err(|_| PipelineError::timeout("Vector health timeout"))?
            .map_err(|e| PipelineError::HttpError(e))?;

            Ok(response.status().is_success())
        }
    }
}

/// Health check status for individual components
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
    NotConfigured,
}

/// Health check result for a single component
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ComponentHealth {
    pub name: String,
    pub status: HealthStatus,
    pub message: String,
    pub response_time_ms: Option<u64>,
    pub details: HashMap<String, String>,
}

/// Overall health check report
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HealthReport {
    pub overall_status: HealthStatus,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub components: Vec<ComponentHealth>,
    pub summary: HealthSummary,
}

/// Summary statistics for health check
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HealthSummary {
    pub total_components: usize,
    pub healthy_count: usize,
    pub degraded_count: usize,
    pub unhealthy_count: usize,
    pub unknown_count: usize,
    pub not_configured_count: usize,
    pub total_check_time_ms: u64,
}

/// Health checker configuration with component-specific timeouts
#[derive(Debug, Clone)]
pub struct HealthCheckConfig {
    pub timeout: Duration,
    pub enable_e2e: bool,
    pub detailed: bool,
    pub skip_optional: bool,
    /// ClickHouse timeout (1 second as per requirements)
    pub clickhouse_timeout_ms: u64,
    /// Redis ping timeout (500-800ms as per requirements)
    pub redis_timeout_ms: u64,
    /// Kafka metadata timeout (1-2s as per requirements)
    pub kafka_timeout_ms: u64,
    /// Vector health timeout (≤1500ms as per requirements)
    pub vector_timeout_ms: u64,
}

impl Default for HealthCheckConfig {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(10),
            enable_e2e: false,
            detailed: false,
            skip_optional: true,
            clickhouse_timeout_ms: 1000,
            redis_timeout_ms: 800,
            kafka_timeout_ms: 2000,
            vector_timeout_ms: 1500,
        }
    }
}

/// Main health checker
pub struct HealthChecker {
    config: PipelineConfig,
    check_config: HealthCheckConfig,
    client: Client,
}

/// Background health service that runs health checks on an interval
/// and caches the last result for fast HTTP responses
pub struct HealthService {
    checker: HealthChecker,
    last_report: Arc<RwLock<Option<HealthReport>>>,
    app_state: crate::handlers_legacy::AppState,
}

impl HealthService {
    /// Create a new HealthService with the given app state
    pub async fn new(app_state: crate::handlers_legacy::AppState) -> Self {
        let config = app_state.config.read().await.clone();
        let check_config = HealthCheckConfig::default();
        let checker = HealthChecker::new(config, check_config);
        
        Self {
            checker,
            last_report: Arc::new(RwLock::new(None)),
            app_state,
        }
    }
    
    /// Create a new HealthService with custom configuration
    pub async fn with_config(app_state: crate::handlers_legacy::AppState, check_config: HealthCheckConfig) -> Self {
        let config = app_state.config.read().await.clone();
        let checker = HealthChecker::new(config, check_config);
        
        Self {
            checker,
            last_report: Arc::new(RwLock::new(None)),
            app_state,
        }
    }
    
    /// Run health checks in a loop with the specified interval
    pub async fn run_health_checks_loop(&mut self, check_interval: Duration) {
        let mut interval_timer = interval(check_interval);
        
        info!("Starting health service with interval: {:?}", check_interval);
        
        loop {
            interval_timer.tick().await;
            
            match self.checker.run_health_checks().await {
                Ok(report) => {
                    debug!("Health check completed successfully");
                    
                    // Update Prometheus metrics
                    self.update_health_metrics(&report).await;
                    
                    // Cache the result
                    *self.last_report.write().await = Some(report);
                }
                Err(e) => {
                    error!("Health check failed: {}", e);
                }
            }
        }
    }
    
    /// Get the last cached health report
    pub async fn get_last_report(&self) -> Option<HealthReport> {
        self.last_report.read().await.clone()
    }
    
    /// Update Prometheus metrics and MetricsCollector based on health check results
    async fn update_health_metrics(&self, report: &HealthReport) {
        use crate::metrics::{HEALTH_STATUS, HEALTH_CHECK_SECONDS, HEALTH_LAST_SUCCESS_TS, ComponentStatus};
        
        for component in &report.components {
            let component_name = component.name.to_lowercase();
            
            // Set health status: 1 = healthy, 0 = degraded, -1 = unhealthy, -2 = not configured
            let status_value = match component.status {
                HealthStatus::Healthy => 1.0,
                HealthStatus::Degraded => 0.0,
                HealthStatus::Unhealthy => -1.0,
                HealthStatus::Unknown => -1.0,
                HealthStatus::NotConfigured => -2.0,
            };
            
            HEALTH_STATUS.with_label_values(&[&component_name]).set(status_value);
            
            // Record response time if available
            if let Some(response_time_ms) = component.response_time_ms {
                HEALTH_CHECK_SECONDS.with_label_values(&[&component_name])
                    .observe(response_time_ms as f64 / 1000.0);
            }
            
            // Update last success timestamp for healthy components
            if matches!(component.status, HealthStatus::Healthy) {
                 HEALTH_LAST_SUCCESS_TS.with_label_values(&[&component_name])
                     .set(chrono::Utc::now().timestamp() as f64);
             }
             
             // Update MetricsCollector component status
             let component_status = match component.status {
                 HealthStatus::Healthy => ComponentStatus::Healthy,
                 HealthStatus::Degraded => ComponentStatus::Degraded,
                 HealthStatus::Unhealthy => ComponentStatus::Unhealthy,
                 HealthStatus::Unknown => ComponentStatus::Unhealthy,
                 HealthStatus::NotConfigured => ComponentStatus::Stopped,
             };
             
             self.app_state.metrics.update_component_status(&component_name, component_status).await;
        }
    }
}

impl HealthChecker {
    /// Create a new health checker with the given configuration
    pub fn new(config: PipelineConfig, check_config: HealthCheckConfig) -> Self {
        let client = Client::builder()
            .timeout(check_config.timeout)
            .build()
            .expect("Failed to create HTTP client");

        Self {
            config,
            check_config,
            client,
        }
    }
    
    /// Create health probes based on configuration
    fn create_probes(&self) -> (
        Box<dyn probes::ClickHouseProbe>,
        Option<Box<dyn probes::RedisProbe>>,
        Option<Box<dyn probes::KafkaProbe>>,
        Option<Box<dyn probes::VectorProbe>>,
    ) {
        // Extract ClickHouse URL from destinations configuration
        debug!("Looking for ClickHouse destinations in config: {:?}", self.config.destinations.keys().collect::<Vec<_>>());
        
        let clickhouse_base_url = self.config.destinations.iter()
            .find(|(name, dest)| {
                debug!("Checking destination '{}': {:?}", name, dest.destination_type);
                matches!(dest.destination_type, crate::config::DestinationType::ClickHouse { .. })
            })
            .and_then(|(name, dest)| {
                if let crate::config::DestinationType::ClickHouse { connection_string, .. } = &dest.destination_type {
                    debug!("Found ClickHouse destination '{}' with connection_string: {}", name, connection_string);
                    Some(connection_string.clone())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| {
                let fallback_url = format!("http://{}:{}", self.config.database.host, self.config.database.port);
                debug!("No ClickHouse destination found, using fallback URL: {}", fallback_url);
                fallback_url
            });
        
        debug!("Using ClickHouse base URL for health check: {}", clickhouse_base_url);
        
        let clickhouse_probe = Box::new(probes::RealClickHouseProbe {
            client: self.client.clone(),
            base_url: clickhouse_base_url,
            timeout_ms: self.check_config.clickhouse_timeout_ms,
        });
        
        // Create Redis probe only if feature is enabled and destination is configured
        let redis_probe = if self.config.features.enable_redis {
            self.config.destinations.iter()
                .find(|(_, dest)| matches!(dest.destination_type, crate::config::DestinationType::Redis { .. }))
                .and_then(|(_, dest)| {
                    if let crate::config::DestinationType::Redis { connection_string, .. } = &dest.destination_type {
                        Some(Box::new(probes::RealRedisProbe {
                            connection_string: connection_string.clone(),
                            timeout_ms: self.check_config.redis_timeout_ms,
                        }) as Box<dyn probes::RedisProbe>)
                    } else {
                        None
                    }
                })
        } else {
            None
        };
        
        // Create Kafka probe only if feature is enabled and destination is configured
        let kafka_probe = if self.config.features.enable_kafka {
            self.config.destinations.iter()
                .find(|(_, dest)| matches!(dest.destination_type, crate::config::DestinationType::Kafka { .. }))
                .and_then(|(_, dest)| {
                    if let crate::config::DestinationType::Kafka { brokers, .. } = &dest.destination_type {
                        Some(Box::new(probes::RealKafkaProbe {
                            brokers: brokers.clone(),
                            timeout_ms: self.check_config.kafka_timeout_ms,
                        }) as Box<dyn probes::KafkaProbe>)
                    } else {
                        None
                    }
                })
        } else {
            None
        };
        
        // Create Vector probe only if feature is enabled and base URL is configured
        let vector_probe = if self.config.features.enable_vector {
            if let Some(ref base_url) = self.config.vector.base_url {
                Some(Box::new(probes::RealVectorProbe {
                    client: self.client.clone(),
                    health_url: format!("{}{}", base_url.trim_end_matches('/'), self.config.vector.health_path),
                    timeout_ms: self.check_config.vector_timeout_ms,
                }) as Box<dyn probes::VectorProbe>)
            } else {
                None
            }
        } else {
            None
        };
        
        (clickhouse_probe, redis_probe, kafka_probe, vector_probe)
    }

    /// Run comprehensive health checks on all components
    pub async fn run_health_checks(&self) -> Result<HealthReport> {
        let start_time = Instant::now();
        let mut components = Vec::new();

        info!("Starting health checks...");

        // Create probes
        let (clickhouse_probe, redis_probe, kafka_probe, vector_probe) = self.create_probes();

        // Check ClickHouse
        components.push(self.check_clickhouse(clickhouse_probe.as_ref()).await);

        // Check Redis (if configured)
        if let Some(probe) = redis_probe {
            components.push(self.check_redis_with_probe(probe.as_ref()).await);
        } else if !self.check_config.skip_optional {
            components.push(ComponentHealth {
                name: "Redis".to_string(),
                status: HealthStatus::Unknown,
                message: "Redis not configured".to_string(),
                response_time_ms: None,
                details: HashMap::new(),
            });
        }

        // Check Kafka (if configured)
        if let Some(probe) = kafka_probe {
            components.push(self.check_kafka_with_probe(probe.as_ref()).await);
        } else if !self.check_config.skip_optional {
            components.push(ComponentHealth {
                name: "Kafka".to_string(),
                status: HealthStatus::Unknown,
                message: "Kafka not configured".to_string(),
                response_time_ms: None,
                details: HashMap::new(),
            });
        }

        // Check Vector (if configured)
        if let Some(probe) = vector_probe {
            components.push(self.check_vector_with_probe(probe.as_ref()).await);
        }

        // Check SIEM Pipeline itself
        components.push(self.check_siem_pipeline().await);

        // Run E2E test if enabled
        if self.check_config.enable_e2e {
            if let Some(e2e_health) = self.run_e2e_test().await {
                components.push(e2e_health);
            }
        }

        let total_time = start_time.elapsed();
        let summary = self.calculate_summary(&components, total_time);
        let overall_status = self.determine_overall_status(&components);

        Ok(HealthReport {
            overall_status,
            timestamp: chrono::Utc::now(),
            components,
            summary,
        })
    }

    /// Check Redis health using probe
    async fn check_redis_with_probe(&self, probe: &dyn probes::RedisProbe) -> ComponentHealth {
        let start_time = Instant::now();
        let mut details = HashMap::new();

        match probe.ping().await {
            Ok(()) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                ComponentHealth {
                    name: "Redis".to_string(),
                    status: HealthStatus::Healthy,
                    message: "Redis connection successful".to_string(),
                    response_time_ms: Some(response_time),
                    details,
                }
            }
            Err(e) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                details.insert("error".to_string(), e.to_string());
                ComponentHealth {
                    name: "Redis".to_string(),
                    status: HealthStatus::Unhealthy,
                    message: format!("Redis connection failed: {}", e),
                    response_time_ms: Some(response_time),
                    details,
                }
            }
        }
    }

    /// Check Redis health (legacy method)
    async fn check_redis(&self) -> Option<ComponentHealth> {
        // Find Redis destination in config
        let redis_config = self.config.destinations.iter()
            .find(|(_, dest)| matches!(dest.destination_type, crate::config::DestinationType::Redis { .. }))
            .map(|(_, dest)| dest);

        let redis_config = match redis_config {
            Some(config) => config,
            None => {
                if !self.check_config.skip_optional {
                    return Some(ComponentHealth {
                        name: "Redis".to_string(),
                        status: HealthStatus::Unknown,
                        message: "Redis not configured".to_string(),
                        response_time_ms: None,
                        details: HashMap::new(),
                    });
                }
                return None;
            }
        };

        let start_time = Instant::now();
        let mut details = HashMap::new();

        // Extract Redis connection details
        if let crate::config::DestinationType::Redis { connection_string, .. } = &redis_config.destination_type {
            details.insert("connection_string".to_string(), connection_string.clone());

            // Try to connect to Redis
            match self.test_redis_connection(&connection_string).await {
                Ok(()) => {
                    let response_time = start_time.elapsed().as_millis() as u64;
                    ComponentHealth {
                        name: "Redis".to_string(),
                        status: HealthStatus::Healthy,
                        message: "Redis connection successful".to_string(),
                        response_time_ms: Some(response_time),
                        details,
                    }
                }
                Err(e) => {
                    let response_time = start_time.elapsed().as_millis() as u64;
                    details.insert("error".to_string(), e.to_string());
                    ComponentHealth {
                        name: "Redis".to_string(),
                        status: HealthStatus::Unhealthy,
                        message: format!("Redis connection failed: {}", e),
                        response_time_ms: Some(response_time),
                        details,
                    }
                }
            }
        } else {
            ComponentHealth {
                name: "Redis".to_string(),
                status: HealthStatus::Unknown,
                message: "Invalid Redis configuration".to_string(),
                response_time_ms: None,
                details,
            }
        }
        .into()
    }

    /// Test Redis connection
    async fn test_redis_connection(&self, connection_string: &str) -> Result<()> {
        // Simple Redis URL parsing (redis://host:port)
        let (host, port) = if connection_string.starts_with("redis://") {
            let without_scheme = connection_string.strip_prefix("redis://").unwrap_or(connection_string);
            if let Some(colon_pos) = without_scheme.find(':') {
                let host = &without_scheme[..colon_pos];
                let port_str = &without_scheme[colon_pos + 1..];
                let port = port_str.parse().unwrap_or(6379);
                (host, port)
            } else {
                (without_scheme, 6379)
            }
        } else {
            ("localhost", 6379)
        };
        
        // Try to connect using TCP
        let addr = format!("{}:{}", host, port);
        let _stream = timeout(
            self.check_config.timeout,
            tokio::net::TcpStream::connect(&addr)
        ).await
        .context("Connection timeout")?
        .context("Failed to connect to Redis")?;
        
        debug!("Successfully connected to Redis at {}", addr);
        Ok(())
    }

    /// Check ClickHouse health using probe
    async fn check_clickhouse(&self, probe: &dyn probes::ClickHouseProbe) -> ComponentHealth {
        let start_time = Instant::now();
        let mut details = HashMap::new();

        let clickhouse_url = format!("http://{}:{}", self.config.database.host, self.config.database.port);
        details.insert("url".to_string(), clickhouse_url);

        // Test ping endpoint
        match probe.ping().await {
            Ok(()) => {
                // Test basic query
                match probe.trivial_query().await {
                    Ok(()) => {
                        let response_time = start_time.elapsed().as_millis() as u64;
                        ComponentHealth {
                            name: "ClickHouse".to_string(),
                            status: HealthStatus::Healthy,
                            message: "ClickHouse is healthy".to_string(),
                            response_time_ms: Some(response_time),
                            details,
                        }
                    }
                    Err(e) => {
                        let response_time = start_time.elapsed().as_millis() as u64;
                        details.insert("query_error".to_string(), e.to_string());
                        ComponentHealth {
                            name: "ClickHouse".to_string(),
                            status: HealthStatus::Degraded,
                            message: format!("ClickHouse ping OK but query failed: {}", e),
                            response_time_ms: Some(response_time),
                            details,
                        }
                    }
                }
            }
            Err(e) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                details.insert("ping_error".to_string(), e.to_string());
                ComponentHealth {
                    name: "ClickHouse".to_string(),
                    status: HealthStatus::Unhealthy,
                    message: format!("ClickHouse ping failed: {}", e),
                    response_time_ms: Some(response_time),
                    details,
                }
            }
        }
    }

    /// Test ClickHouse ping endpoint
    async fn test_clickhouse_ping(&self, base_url: String) -> Result<()> {
        let ping_url = format!("{}/ping", base_url.trim_end_matches('/'));
        
        let response = timeout(
            self.check_config.timeout,
            self.client.get(&ping_url).send()
        ).await
        .context("ClickHouse ping timeout")?
        .context("Failed to send ClickHouse ping request")?;

        if response.status().is_success() {
            debug!("ClickHouse ping successful");
            Ok(())
        } else {
            Err(anyhow::anyhow!("ClickHouse ping returned status: {}", response.status()))
        }
    }

    /// Test ClickHouse basic query
    async fn test_clickhouse_query(&self, base_url: String) -> Result<()> {
        let query_url = format!("{}/?query=SELECT%201", base_url.trim_end_matches('/'));
        
        let response = timeout(
            self.check_config.timeout,
            self.client.get(&query_url).send()
        ).await
        .context("ClickHouse query timeout")?
        .context("Failed to send ClickHouse query")?;

        if response.status().is_success() {
            debug!("ClickHouse query successful");
            Ok(())
        } else {
            Err(anyhow::anyhow!("ClickHouse query returned status: {}", response.status()))
        }
    }

    /// Check Kafka health using probe
    async fn check_kafka_with_probe(&self, probe: &dyn probes::KafkaProbe) -> ComponentHealth {
        let start_time = Instant::now();
        let mut details = HashMap::new();

        match probe.metadata().await {
            Ok(()) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                ComponentHealth {
                    name: "Kafka".to_string(),
                    status: HealthStatus::Healthy,
                    message: "Kafka connectivity successful".to_string(),
                    response_time_ms: Some(response_time),
                    details,
                }
            }
            Err(e) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                details.insert("error".to_string(), e.to_string());
                ComponentHealth {
                    name: "Kafka".to_string(),
                    status: HealthStatus::Unhealthy,
                    message: format!("Kafka connectivity failed: {}", e),
                    response_time_ms: Some(response_time),
                    details,
                }
            }
        }
    }

    /// Check Kafka health (legacy method)
    async fn check_kafka(&self) -> Option<ComponentHealth> {
        // Find Kafka destination in config
        let kafka_config = self.config.destinations.iter()
            .find(|(_, dest)| matches!(dest.destination_type, crate::config::DestinationType::Kafka { .. }))
            .map(|(_, dest)| dest);

        let kafka_config = match kafka_config {
            Some(config) => config,
            None => {
                if !self.check_config.skip_optional {
                    return Some(ComponentHealth {
                        name: "Kafka".to_string(),
                        status: HealthStatus::Unknown,
                        message: "Kafka not configured".to_string(),
                        response_time_ms: None,
                        details: HashMap::new(),
                    });
                }
                return None;
            }
        };

        let start_time = Instant::now();
        let mut details = HashMap::new();

        if let crate::config::DestinationType::Kafka { brokers, topic } = &kafka_config.destination_type {
            details.insert("brokers".to_string(), brokers.join(","));
            details.insert("topic".to_string(), topic.clone());

            // Test Kafka connectivity (simplified - would need kafka client for full test)
            match self.test_kafka_connectivity(&brokers).await {
                Ok(()) => {
                    let response_time = start_time.elapsed().as_millis() as u64;
                    ComponentHealth {
                        name: "Kafka".to_string(),
                        status: HealthStatus::Healthy,
                        message: "Kafka connectivity successful".to_string(),
                        response_time_ms: Some(response_time),
                        details,
                    }
                }
                Err(e) => {
                    let response_time = start_time.elapsed().as_millis() as u64;
                    details.insert("error".to_string(), e.to_string());
                    ComponentHealth {
                        name: "Kafka".to_string(),
                        status: HealthStatus::Unhealthy,
                        message: format!("Kafka connectivity failed: {}", e),
                        response_time_ms: Some(response_time),
                        details,
                    }
                }
            }
        } else {
            ComponentHealth {
                name: "Kafka".to_string(),
                status: HealthStatus::Unknown,
                message: "Invalid Kafka configuration".to_string(),
                response_time_ms: None,
                details,
            }
        }
        .into()
    }

    /// Test Kafka connectivity (simplified TCP check)
    async fn test_kafka_connectivity(&self, brokers: &[String]) -> Result<()> {
        for broker in brokers {
            let addr = if broker.contains(':') {
                broker.clone()
            } else {
                format!("{}:9092", broker)
            };

            match timeout(
                self.check_config.timeout,
                tokio::net::TcpStream::connect(&addr)
            ).await {
                Ok(Ok(_)) => {
                    debug!("Successfully connected to Kafka broker: {}", addr);
                    return Ok(());
                }
                Ok(Err(e)) => {
                    warn!("Failed to connect to Kafka broker {}: {}", addr, e);
                }
                Err(_) => {
                    warn!("Timeout connecting to Kafka broker: {}", addr);
                }
            }
        }
        
        Err(anyhow::anyhow!("Failed to connect to any Kafka broker"))
    }

    /// Check Vector health using probe
    async fn check_vector_with_probe(&self, probe: &dyn probes::VectorProbe) -> ComponentHealth {
        let start_time = Instant::now();
        let mut details = HashMap::new();

        match probe.health().await {
            Ok(true) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                ComponentHealth {
                    name: "Vector".to_string(),
                    status: HealthStatus::Healthy,
                    message: "Vector is healthy".to_string(),
                    response_time_ms: Some(response_time),
                    details,
                }
            }
            Ok(false) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                ComponentHealth {
                    name: "Vector".to_string(),
                    status: HealthStatus::Degraded,
                    message: "Vector health check returned false".to_string(),
                    response_time_ms: Some(response_time),
                    details,
                }
            }
            Err(e) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                details.insert("error".to_string(), e.to_string());
                ComponentHealth {
                    name: "Vector".to_string(),
                    status: HealthStatus::Unhealthy,
                    message: format!("Vector health check failed: {}", e),
                    response_time_ms: Some(response_time),
                    details,
                }
            }
        }
    }

    /// Check Vector health (legacy method)
    async fn check_vector(&self) -> Option<ComponentHealth> {
        let start_time = Instant::now();
        let mut details = HashMap::new();

        // Check if Vector is enabled
        if !self.config.vector.enabled {
            return Some(ComponentHealth {
                name: "Vector".to_string(),
                status: HealthStatus::NotConfigured,
                message: "Vector is disabled in configuration".to_string(),
                response_time_ms: None,
                details,
            });
        }

        // Check if base_url is configured
        let vector_url = match &self.config.vector.base_url {
            Some(url) => url,
            None => {
                return Some(ComponentHealth {
                    name: "Vector".to_string(),
                    status: HealthStatus::NotConfigured,
                    message: "Vector base_url not configured".to_string(),
                    response_time_ms: None,
                    details,
                });
            }
        };

        let health_path = &self.config.vector.health_path;
        
        details.insert("base_url".to_string(), vector_url.clone());
        details.insert("health_path".to_string(), health_path.clone());

        let health_url = format!("{}{}", vector_url.trim_end_matches('/'), health_path);

        match self.test_vector_health(&health_url).await {
            Ok(()) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                Some(ComponentHealth {
                    name: "Vector".to_string(),
                    status: HealthStatus::Healthy,
                    message: "Vector is healthy".to_string(),
                    response_time_ms: Some(response_time),
                    details,
                })
            }
            Err(e) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                details.insert("error".to_string(), e.to_string());
                Some(ComponentHealth {
                    name: "Vector".to_string(),
                    status: HealthStatus::Unhealthy,
                    message: format!("Vector health check failed: {}", e),
                    response_time_ms: Some(response_time),
                    details,
                })
            }
        }
    }

    /// Test Vector health endpoint
    async fn test_vector_health(&self, health_url: &str) -> Result<()> {
        let response = timeout(
            self.check_config.timeout,
            self.client.get(health_url).send()
        ).await
        .context("Vector health check timeout")?
        .context("Failed to send Vector health request")?;

        if response.status().is_success() {
            debug!("Vector health check successful");
            Ok(())
        } else {
            Err(anyhow::anyhow!("Vector health check returned status: {}", response.status()))
        }
    }

    /// Check SIEM Pipeline health
    async fn check_siem_pipeline(&self) -> ComponentHealth {
        let start_time = Instant::now();
        let mut details = HashMap::new();

        let server_url = format!("http://{}:{}", self.config.server.host, self.config.server.port);
        details.insert("server_url".to_string(), server_url.clone());

        let health_url = format!("{}/health", server_url);

        match self.test_siem_health(&health_url).await {
            Ok(()) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                ComponentHealth {
                    name: "SIEM Pipeline".to_string(),
                    status: HealthStatus::Healthy,
                    message: "SIEM Pipeline is healthy".to_string(),
                    response_time_ms: Some(response_time),
                    details,
                }
            }
            Err(e) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                details.insert("error".to_string(), e.to_string());
                ComponentHealth {
                    name: "SIEM Pipeline".to_string(),
                    status: HealthStatus::Unhealthy,
                    message: format!("SIEM Pipeline health check failed: {}", e),
                    response_time_ms: Some(response_time),
                    details,
                }
            }
        }
    }

    /// Test SIEM Pipeline health endpoint
    async fn test_siem_health(&self, health_url: &str) -> Result<()> {
        let response = timeout(
            self.check_config.timeout,
            self.client.get(health_url).send()
        ).await
        .context("SIEM health check timeout")?
        .context("Failed to send SIEM health request")?;

        if response.status().is_success() {
            debug!("SIEM Pipeline health check successful");
            Ok(())
        } else {
            Err(anyhow::anyhow!("SIEM health check returned status: {}", response.status()))
        }
    }

    /// Run end-to-end test (if enabled and test resources are configured)
    async fn run_e2e_test(&self) -> Option<ComponentHealth> {
        let start_time = Instant::now();
        let mut details = HashMap::new();

        // Check if test resources are configured
        // This would require additional configuration for test topics/tables
        // For now, we'll return a placeholder
        
        details.insert("note".to_string(), "E2E test requires test topic and table configuration".to_string());
        
        Some(ComponentHealth {
            name: "End-to-End Test".to_string(),
            status: HealthStatus::Unknown,
            message: "E2E test not implemented yet".to_string(),
            response_time_ms: Some(start_time.elapsed().as_millis() as u64),
            details,
        })
    }

    /// Calculate summary statistics
    fn calculate_summary(&self, components: &[ComponentHealth], total_time: Duration) -> HealthSummary {
        let total_components = components.len();
        let mut healthy_count = 0;
        let mut degraded_count = 0;
        let mut unhealthy_count = 0;
        let mut unknown_count = 0;
        let mut not_configured_count = 0;

        for component in components {
            match component.status {
                HealthStatus::Healthy => healthy_count += 1,
                HealthStatus::Degraded => degraded_count += 1,
                HealthStatus::Unhealthy => unhealthy_count += 1,
                HealthStatus::Unknown => unknown_count += 1,
                HealthStatus::NotConfigured => not_configured_count += 1,
            }
        }

        HealthSummary {
            total_components,
            healthy_count,
            degraded_count,
            unhealthy_count,
            unknown_count,
            not_configured_count,
            total_check_time_ms: total_time.as_millis() as u64,
        }
    }

    /// Determine overall health status
    fn determine_overall_status(&self, components: &[ComponentHealth]) -> HealthStatus {
        // Filter out NotConfigured components - they should not affect overall health
        let active_components: Vec<&ComponentHealth> = components
            .iter()
            .filter(|c| !matches!(c.status, HealthStatus::NotConfigured))
            .collect();

        let has_unhealthy = active_components.iter().any(|c| matches!(c.status, HealthStatus::Unhealthy));
        let has_degraded = active_components.iter().any(|c| matches!(c.status, HealthStatus::Degraded));
        let has_unknown = active_components.iter().any(|c| matches!(c.status, HealthStatus::Unknown));

        if has_unhealthy {
            HealthStatus::Unhealthy
        } else if has_degraded {
            HealthStatus::Degraded
        } else if has_unknown {
            HealthStatus::Unknown
        } else {
            HealthStatus::Healthy
        }
    }
}

/// Format health report for display
pub fn format_health_report(report: &HealthReport, detailed: bool) -> String {
    let mut output = String::new();
    
    output.push_str(&format!("SIEM Pipeline Health Report\n"));
    output.push_str(&format!("==========================\n\n"));
    
    output.push_str(&format!("Overall Status: {:?}\n", report.overall_status));
    output.push_str(&format!("Timestamp: {}\n", report.timestamp.format("%Y-%m-%d %H:%M:%S UTC")));
    output.push_str(&format!("Total Check Time: {}ms\n\n", report.summary.total_check_time_ms));
    
    output.push_str(&format!("Summary:\n"));
    output.push_str(&format!("  Total Components: {}\n", report.summary.total_components));
    output.push_str(&format!("  Healthy: {}\n", report.summary.healthy_count));
    output.push_str(&format!("  Degraded: {}\n", report.summary.degraded_count));
    output.push_str(&format!("  Unhealthy: {}\n", report.summary.unhealthy_count));
    output.push_str(&format!("  Unknown: {}\n\n", report.summary.unknown_count));
    
    output.push_str(&format!("Component Details:\n"));
    for component in &report.components {
        let status_symbol = match component.status {
            HealthStatus::Healthy => "✓",
            HealthStatus::Degraded => "⚠",
            HealthStatus::Unhealthy => "✗",
            HealthStatus::Unknown => "?",
            HealthStatus::NotConfigured => "○",
        };
        
        output.push_str(&format!("  {} {} ({:?})", status_symbol, component.name, component.status));
        
        if let Some(response_time) = component.response_time_ms {
            output.push_str(&format!(" - {}ms", response_time));
        }
        
        output.push_str(&format!("\n    {}", component.message));
        
        if detailed && !component.details.is_empty() {
            output.push_str(&format!("\n    Details:"));
            for (key, value) in &component.details {
                output.push_str(&format!("\n      {}: {}", key, value));
            }
        }
        
        output.push_str(&format!("\n\n"));
    }
    
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::*;
    use async_trait::async_trait;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    fn create_test_config() -> PipelineConfig {
        PipelineConfig {
            server: ServerConfig {
                host: "127.0.0.1".to_string(),
                port: 8080,
                workers: 4,
                max_connections: 1000,
                request_timeout: 30,
                enable_cors: false,
            },
            database: DatabaseConfig {
                host: "localhost".to_string(),
                port: 8123,
                database: "test_db".to_string(),
                username: "default".to_string(),
                password: "".to_string(),
                max_connections: 10,
                min_connections: 1,
                connection_timeout: 5,
                idle_timeout: 300,
                max_lifetime: 3600,
            },
            sources: HashMap::new(),
            transformations: HashMap::new(),
            destinations: HashMap::new(),
            routing: RoutingConfig {
                rules: vec![],
                default_destination: "default".to_string(),
                load_balancing: LoadBalancingStrategy::RoundRobin,
            },
            storage: StorageConfig {
                data_lake: DataLakeConfig {
                    provider: "s3".to_string(),
                    bucket: "test-bucket".to_string(),
                    region: "us-east-1".to_string(),
                    access_key: "test".to_string(),
                    secret_key: "test".to_string(),
                    endpoint: None,
                },
                hot_storage: HotStorageConfig {
                    clickhouse_url: "http://localhost:8123".to_string(),
                    database: "test_db".to_string(),
                    retention_days: 30,
                },
                cold_storage: ColdStorageConfig {
                    s3_bucket: "cold-bucket".to_string(),
                    compression: CompressionType::Gzip,
                    format: DataFormat::Parquet,
                },
                retention: RetentionConfig {
                    hot_days: 7,
                    warm_days: 30,
                    cold_days: 365,
                    delete_after_days: Some(2555),
                },
            },
            metrics: MetricsConfig {
                enabled: true,
                port: 9090,
                path: "/metrics".to_string(),
                labels: HashMap::new(),
            },
            security: SecurityConfig {
                tls: None,
                authentication: None,
                rate_limiting: None,
            },
            performance: PerformanceConfig {
                workers: WorkersConfig {
                    ingestion_workers: 4,
                    transformation_workers: 4,
                    routing_workers: 2,
                    storage_workers: 2,
                },
                buffers: BuffersConfig {
                    event_buffer_size: 10000,
                    batch_buffer_size: 1000,
                    flush_interval_ms: 1000,
                },
                memory: MemoryConfig {
                    max_memory_usage: "1GB".to_string(),
                    gc_threshold: "100MB".to_string(),
                },
                parallel_processing: None,
            },
            rate_limiting: RateLimitingConfig {
                enabled: false,
                requests_per_second: 1000,
                burst_size: 100,
            },
            vector: VectorConfig {
                enabled: true,
                base_url: Some("http://localhost:8686".to_string()),
                health_path: "/health".to_string(),
                metrics_path: "/metrics".to_string(),
                timeout_ms: 1500,
            },
            features: FeatureFlags {
                enable_kafka: false,
                enable_vector: true,
                enable_redis: false,
                enable_ch_sse: true,
            },
        }
    }

    // Mock probe implementations for testing
    struct MockClickHouseProbe {
        should_fail: Arc<AtomicBool>,
    }

    #[async_trait]
    impl probes::ClickHouseProbe for MockClickHouseProbe {
        async fn ping(&self) -> Result<(), PipelineError> {
            if self.should_fail.load(Ordering::Relaxed) {
                Err(PipelineError::ConnectionError("Mock ping failure".to_string()))
            } else {
                Ok(())
            }
        }

        async fn trivial_query(&self) -> Result<(), PipelineError> {
            if self.should_fail.load(Ordering::Relaxed) {
                Err(PipelineError::ConnectionError("Mock query failure".to_string()))
            } else {
                Ok(())
            }
        }
    }

    struct MockRedisProbe {
        should_fail: Arc<AtomicBool>,
    }

    #[async_trait]
    impl probes::RedisProbe for MockRedisProbe {
        async fn ping(&self) -> Result<(), PipelineError> {
            if self.should_fail.load(Ordering::Relaxed) {
                Err(PipelineError::ConnectionError("Mock Redis failure".to_string()))
            } else {
                Ok(())
            }
        }
    }

    struct MockKafkaProbe {
        should_fail: Arc<AtomicBool>,
    }

    #[async_trait]
    impl probes::KafkaProbe for MockKafkaProbe {
        async fn metadata(&self) -> Result<(), PipelineError> {
            if self.should_fail.load(Ordering::Relaxed) {
                Err(PipelineError::ConnectionError("Mock Kafka failure".to_string()))
            } else {
                Ok(())
            }
        }
    }

    struct MockVectorProbe {
        should_fail: Arc<AtomicBool>,
    }

    #[async_trait]
    impl probes::VectorProbe for MockVectorProbe {
        async fn health(&self) -> Result<bool, PipelineError> {
            if self.should_fail.load(Ordering::Relaxed) {
                Err(PipelineError::ConnectionError("Mock Vector failure".to_string()))
            } else {
                Ok(true)
            }
        }
    }

    #[tokio::test]
    async fn test_health_checker_creation() {
        let config = create_test_config();
        let check_config = HealthCheckConfig::default();
        let checker = HealthChecker::new(config, check_config);
        
        // Just verify it was created successfully
        assert!(true);
    }

    #[test]
    fn test_health_status_serialization() {
        let status = HealthStatus::Healthy;
        let serialized = serde_json::to_string(&status).unwrap();
        assert_eq!(serialized, "\"Healthy\"");
    }

    #[test]
    fn test_component_health_creation() {
        let health = ComponentHealth {
            name: "Test".to_string(),
            status: HealthStatus::Healthy,
            message: "All good".to_string(),
            response_time_ms: Some(100),
            details: HashMap::new(),
        };
        
        assert_eq!(health.name, "Test");
        assert_eq!(health.status, HealthStatus::Healthy);
    }

    #[tokio::test]
    async fn test_clickhouse_probe_success() {
        let config = create_test_config();
        let check_config = HealthCheckConfig::default();
        let checker = HealthChecker::new(config, check_config);
        
        let probe = MockClickHouseProbe {
            should_fail: Arc::new(AtomicBool::new(false)),
        };
        
        let result = checker.check_clickhouse(&probe).await;
        assert_eq!(result.status, HealthStatus::Healthy);
        assert_eq!(result.name, "ClickHouse");
    }

    #[tokio::test]
    async fn test_clickhouse_probe_failure() {
        let config = create_test_config();
        let check_config = HealthCheckConfig::default();
        let checker = HealthChecker::new(config, check_config);
        
        let probe = MockClickHouseProbe {
            should_fail: Arc::new(AtomicBool::new(true)),
        };
        
        let result = checker.check_clickhouse(&probe).await;
        assert_eq!(result.status, HealthStatus::Unhealthy);
        assert!(result.message.contains("Mock ping failure"));
    }

    #[tokio::test]
    async fn test_redis_probe_success() {
        let config = create_test_config();
        let check_config = HealthCheckConfig::default();
        let checker = HealthChecker::new(config, check_config);
        
        let probe = MockRedisProbe {
            should_fail: Arc::new(AtomicBool::new(false)),
        };
        
        let result = checker.check_redis_with_probe(&probe).await;
        assert_eq!(result.status, HealthStatus::Healthy);
        assert_eq!(result.name, "Redis");
    }

    #[tokio::test]
    async fn test_redis_probe_failure() {
        let config = create_test_config();
        let check_config = HealthCheckConfig::default();
        let checker = HealthChecker::new(config, check_config);
        
        let probe = MockRedisProbe {
            should_fail: Arc::new(AtomicBool::new(true)),
        };
        
        let result = checker.check_redis_with_probe(&probe).await;
        assert_eq!(result.status, HealthStatus::Unhealthy);
        assert!(result.message.contains("Mock Redis failure"));
    }

    #[tokio::test]
    async fn test_kafka_probe_success() {
        let config = create_test_config();
        let check_config = HealthCheckConfig::default();
        let checker = HealthChecker::new(config, check_config);
        
        let probe = MockKafkaProbe {
            should_fail: Arc::new(AtomicBool::new(false)),
        };
        
        let result = checker.check_kafka_with_probe(&probe).await;
        assert_eq!(result.status, HealthStatus::Healthy);
        assert_eq!(result.name, "Kafka");
    }

    #[tokio::test]
    async fn test_vector_probe_success() {
        let config = create_test_config();
        let check_config = HealthCheckConfig::default();
        let checker = HealthChecker::new(config, check_config);
        
        let probe = MockVectorProbe {
            should_fail: Arc::new(AtomicBool::new(false)),
        };
        
        let result = checker.check_vector_with_probe(&probe).await;
        assert_eq!(result.status, HealthStatus::Healthy);
        assert_eq!(result.name, "Vector");
    }

    #[test]
    fn test_health_check_config_defaults() {
        let config = HealthCheckConfig::default();
        assert_eq!(config.clickhouse_timeout_ms, 1000);
        assert_eq!(config.redis_timeout_ms, 800);
        assert_eq!(config.kafka_timeout_ms, 2000);
        assert_eq!(config.vector_timeout_ms, 1500);
        assert!(!config.enable_e2e);
        assert!(!config.detailed);
        assert!(config.skip_optional);
    }

    #[test]
    fn test_determine_overall_status() {
        let config = create_test_config();
        let check_config = HealthCheckConfig::default();
        let checker = HealthChecker::new(config, check_config);
        
        // All healthy
        let components = vec![
            ComponentHealth {
                name: "Test1".to_string(),
                status: HealthStatus::Healthy,
                message: "OK".to_string(),
                response_time_ms: Some(100),
                details: HashMap::new(),
            },
            ComponentHealth {
                name: "Test2".to_string(),
                status: HealthStatus::Healthy,
                message: "OK".to_string(),
                response_time_ms: Some(150),
                details: HashMap::new(),
            },
        ];
        
        let status = checker.determine_overall_status(&components);
        assert_eq!(status, HealthStatus::Healthy);
        
        // One unhealthy
        let components = vec![
            ComponentHealth {
                name: "Test1".to_string(),
                status: HealthStatus::Healthy,
                message: "OK".to_string(),
                response_time_ms: Some(100),
                details: HashMap::new(),
            },
            ComponentHealth {
                name: "Test2".to_string(),
                status: HealthStatus::Unhealthy,
                message: "Failed".to_string(),
                response_time_ms: None,
                details: HashMap::new(),
            },
        ];
        
        let status = checker.determine_overall_status(&components);
        assert_eq!(status, HealthStatus::Unhealthy);
    }
}