//! SIEM ClickHouse Search Service
//! High-performance log search service with multi-tenant support

mod config;
mod database;
mod dto;
mod handlers;
mod security;

use crate::config::Config;
use crate::database::ClickHouseService;
use crate::handlers::{create_router, AppState};
use crate::security::{AuditLogger, SecurityService};
use anyhow::{Context, Result};
// use axum::Server; // Not needed in newer axum versions
use clap::{Arg, Command};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::signal;
use tower::ServiceBuilder;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    init_tracing();
    
    // Parse command line arguments
    let matches = Command::new("siem-clickhouse-search")
        .version("1.0.0")
        .author("SIEM Team")
        .about("High-performance ClickHouse search service for SIEM")
        .arg(
            Arg::new("config")
                .short('c')
                .long("config")
                .value_name("FILE")
                .help("Configuration file path")
                .default_value("config.toml")
        )
        .arg(
            Arg::new("port")
                .short('p')
                .long("port")
                .value_name("PORT")
                .help("Server port")
                .value_parser(clap::value_parser!(u16))
        )
        .arg(
            Arg::new("host")
                .long("host")
                .value_name("HOST")
                .help("Server host")
                .default_value("0.0.0.0")
        )
        .arg(
            Arg::new("validate-config")
                .long("validate-config")
                .help("Validate configuration and exit")
                .action(clap::ArgAction::SetTrue)
        )
        .arg(
            Arg::new("init-schema")
                .long("init-schema")
                .help("Initialize ClickHouse schema and exit")
                .action(clap::ArgAction::SetTrue)
        )
        .get_matches();
    
    let config_path = matches.get_one::<String>("config").unwrap();
    
    // Load configuration
    info!("Loading configuration from: {}", config_path);
    let mut config = Config::from_file(config_path)
        .with_context(|| format!("Failed to load configuration from {}", config_path))?;
    
    // Override with command line arguments
    if let Some(port) = matches.get_one::<u16>("port") {
        config.server.port = *port;
    }
    
    if let Some(host) = matches.get_one::<String>("host") {
        config.server.host = host.clone();
    }
    
    // Validate configuration
    config.validate()
        .context("Configuration validation failed")?;
    
    if matches.get_flag("validate-config") {
        info!("Configuration is valid");
        return Ok(());
    }
    
    let config = Arc::new(config);
    
    // Initialize services
    info!("Initializing services...");
    
    // Initialize ClickHouse service
    let clickhouse_service = ClickHouseService::new(config.clone()).await
        .context("Failed to initialize ClickHouse service")?;
    
    // Initialize schema if requested
    if matches.get_flag("init-schema") {
        info!("Initializing ClickHouse schema...");
        // Schema initialization is handled automatically in ClickHouseService::new()
        info!("Schema initialized successfully");
        return Ok(());
    }
    
    // Initialize security service
    let security_service = SecurityService::new(config.clone())
        .context("Failed to initialize security service")?;
    
    // Initialize audit logger
    let audit_logger = AuditLogger::new(config.clone());
    
    // Create application state
    let app_state = AppState {
        config: config.clone(),
        db_service: Arc::new(clickhouse_service),
        security_service: Arc::new(security_service),
        start_time: std::time::Instant::now(),
    };
    
    // Create router with middleware
    let app = create_router(app_state)
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(
                    CorsLayer::new()
                        .allow_origin(Any)
                        .allow_methods(Any)
                        .allow_headers(Any)
                )
        );
    
    // Start server
    let addr = SocketAddr::new(
        config.server.host.parse()
            .context("Invalid server host")?,
        config.server.port,
    );
    
    info!("Starting SIEM ClickHouse Search Service on {}", addr);
    info!("API Documentation: http://{}/docs", addr);
    info!("Health Check: http://{}/health", addr);
    info!("Metrics: http://{}/metrics", addr);
    
    // Print configuration summary
    print_config_summary(&config);
    
    let listener = tokio::net::TcpListener::bind(&addr).await
        .context("Failed to bind to address")?;
    
    if let Err(e) = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown_signal())
        .await {
        error!("Server error: {}", e);
        return Err(e.into());
    }
    
    info!("Server shutdown complete");
    Ok(())
}

/// Initialize tracing/logging
fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "siem_clickhouse_search=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();
}

/// Print configuration summary
fn print_config_summary(config: &Config) {
    info!("=== Configuration Summary ===");
    info!("Server: {}:{}", config.server.host, config.server.port);
    info!("ClickHouse: {}", config.clickhouse.url);
    info!("Database: {}", config.clickhouse.database);
    info!("Connection Pool: {} connections", config.clickhouse.pool.max_size);
    info!("Query Timeout: {}s", config.clickhouse.query.default_timeout_secs);
    info!("Pool Size: {}", config.clickhouse.pool.max_size);
    info!("Redis URL: {}", config.redis.url);
    info!("Cache TTL: {}s", config.clickhouse.query.cache_ttl_secs);
    info!("Max Page Size: {}", config.clickhouse.query.max_page_size);
    info!("================================");
}

/// Graceful shutdown signal handler
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };
    
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };
    
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    
    tokio::select! {
        _ = ctrl_c => {
            info!("Received Ctrl+C, initiating graceful shutdown...");
        },
        _ = terminate => {
            info!("Received SIGTERM, initiating graceful shutdown...");
        },
    }
}

/// Health check for the service
pub async fn health_check(config: &Config) -> Result<()> {
    // Test ClickHouse connection
    let clickhouse_service = ClickHouseService::new(Arc::new(config.clone())).await
        .context("Failed to connect to ClickHouse")?;
    
    // Test basic query
    let _ = clickhouse_service.health_check().await
        .context("ClickHouse health check failed")?;
    
    info!("Health check passed");
    Ok(())
}

/// Performance benchmark utility
pub async fn benchmark(config: &Config, queries: u32, concurrency: u32) -> Result<()> {
    use std::time::Instant;
    use tokio::sync::Semaphore;
    use futures::future::join_all;
    
    info!("Starting benchmark: {} queries with {} concurrent connections", queries, concurrency);
    
    let clickhouse_service = Arc::new(
        ClickHouseService::new(Arc::new(config.clone())).await
            .context("Failed to initialize ClickHouse service")?)
    ;
    
    let semaphore = Arc::new(Semaphore::new(concurrency as usize));
    let start_time = Instant::now();
    
    let tasks: Vec<_> = (0..queries)
        .map(|i| {
            let service = clickhouse_service.clone();
            let sem = semaphore.clone();
            
            tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();
                
                let search_request = crate::dto::SearchRequest {
                    query: Some("test".to_string()),
                    time_range: None,
                    filters: None,
                    pagination: Some(crate::dto::Pagination {
                        page: 0,
                        size: 100,
                        cursor: None,
                        include_total: false,
                    }),
                    sort: None,
                    fields: None,
                    options: None,
                    tenant_id: Some("benchmark".to_string()),
                    aggregations: None,
                };
                
                let start = Instant::now();
                let result = service.search(search_request).await;
                let duration = start.elapsed();
                
                (result.is_ok(), duration)
            })
        })
        .collect();
    
    let results = join_all(tasks).await;
    let total_duration = start_time.elapsed();
    
    let mut successful = 0;
    let mut total_query_time = std::time::Duration::ZERO;
    
    for result in results {
        if let Ok((success, duration)) = result {
            if success {
                successful += 1;
            }
            total_query_time += duration;
        }
    }
    
    let qps = queries as f64 / total_duration.as_secs_f64();
    let avg_query_time = total_query_time / queries;
    
    info!("=== Benchmark Results ===");
    info!("Total Queries: {}", queries);
    info!("Successful: {}", successful);
    info!("Failed: {}", queries - successful);
    info!("Total Time: {:.2}s", total_duration.as_secs_f64());
    info!("Queries per Second: {:.2}", qps);
    info!("Average Query Time: {:.2}ms", avg_query_time.as_millis());
    info!("========================");
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_config_loading() {
        // Create a temporary config file
        let config_content = r#"
[server]
host = "127.0.0.1"
port = 8080
request_timeout_secs = 30
max_request_size = 1048576
enable_cors = true
cors_origins = ["http://localhost:3000"]

[clickhouse]
url = "http://localhost:8123"
database = "test_siem"
username = "default"
password = ""

[clickhouse.pool]
max_size = 10
min_idle = 2
connection_timeout_secs = 10
max_lifetime_secs = 3600
idle_timeout_secs = 600
health_check_interval_secs = 30

[clickhouse.query]
default_timeout_secs = 30
max_timeout_secs = 300
default_page_size = 100
max_page_size = 10000
cache_ttl_secs = 300
max_concurrent_queries = 50
max_concurrent_queries_per_tenant = 10
enable_caching = true
max_memory_usage = 1073741824
enable_optimization = true

[clickhouse.tables]
default_table = "events"
tenant_table_pattern = "tenant_{tenant_id}.events"
auto_create_tables = false

[clickhouse.tables.partition]
time_interval = "daily"
retention_days = 90
auto_prune = true

[security]
enable_tenant_isolation = true
jwt_secret = "test-secret-key-that-is-long-enough"
token_expiration_secs = 3600
enable_rate_limiting = true
rate_limit_per_tenant = 100
enable_audit_logging = true
allowed_tenants = []

[search]
max_results_per_query = 10000
default_page_size = 100
cache_ttl_secs = 300
enable_query_cache = true
enable_aggregation_cache = true
max_concurrent_queries = 50
enable_fulltext = true
enable_regex = true
max_regex_complexity = 1000
enable_streaming = true
streaming_chunk_size = 1000
enable_analytics = true
ranking_algorithm = "relevance"
enable_suggestions = true

[redis]
url = "redis://localhost:6379"
host = "localhost"
port = 6379
db = 0
password = ""
pool_size = 10
connection_timeout_secs = 5
default_ttl_secs = 3600
max_cache_size = 104857600
enable_compression = true

[monitoring]
enable_metrics = true
metrics_port = 9090
enable_health_check = true
log_level = "info"
metrics_path = "/metrics"
health_check_path = "/health"
enable_performance_monitoring = true
performance_interval_secs = 60
enable_query_logging = true
slow_query_threshold_ms = 1000
"#;
        
        // Write to temporary file
        let temp_file = "/tmp/test_config.toml";
        tokio::fs::write(temp_file, config_content).await.unwrap();
        
        // Test loading
        let config = Config::from_file(temp_file).unwrap();
        assert_eq!(config.server.host, "127.0.0.1");
        assert_eq!(config.server.port, 8080);
        assert_eq!(config.clickhouse.database, "test_siem");
        
        // Clean up
        let _ = tokio::fs::remove_file(temp_file).await;
    }
    
    #[test]
    fn test_config_validation() {
        let mut config = Config::default();
        
        // Valid config should pass
        config.security.jwt_secret = "this-is-a-long-enough-secret-key-for-testing".to_string();
        assert!(config.validate().is_ok());
        
        // Invalid JWT secret should fail
        config.security.jwt_secret = "short".to_string();
        assert!(config.validate().is_err());
    }
}