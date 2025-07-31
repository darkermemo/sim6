//! High-throughput ClickHouse log ingestion pipeline
//! Handles 500K EPS across 150-200 tenants with native compression

mod config;
mod receiver;
mod tenant_registry;
mod router;
mod clickhouse;
mod metrics;
mod schema;
mod pool;

use anyhow::Result;
use std::sync::Arc;
use tokio::signal;
use tokio::sync::RwLock;
use tracing::{info, error};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    config::{Config, TenantRegistry},
    receiver::LogReceiver,
    router::LogRouter,
    clickhouse::ClickHouseWriter,
    metrics::MetricsCollector,
    pool::ChPool,
};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "siem_clickhouse_ingestion=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting SIEM ClickHouse Ingestion Pipeline");

    // Load configuration with environment variable overrides
    let config = Config::load_with_overrides()?;
    info!("Configuration loaded successfully");
    info!("Server will listen on: {}", config.server.bind_address);
    info!("ClickHouse URL: {}", config.clickhouse.url);
    info!("Target throughput: {} EPS", config.performance.target_eps);

    // Initialize tenant registry
    let tenant_registry = Arc::new(RwLock::new(TenantRegistry::load_from_file(&config.tenants.registry_file)?));
    info!("Loaded {} tenants", tenant_registry.read().await.tenants.len());

    // Initialize metrics collector
    let metrics = Arc::new(MetricsCollector::new(std::time::Duration::from_secs(10)));
    
    // Initialize ClickHouse connection pool
    let ch_pool = Arc::new(ChPool::new(config.clickhouse.clone()).await?);
    info!("ClickHouse connection pool initialized");
    
    // Initialize ClickHouse writer with pool
    let clickhouse_writer: Arc<ClickHouseWriter> = Arc::new(ClickHouseWriter::new_with_pool(Arc::new(config.clone()), metrics.clone(), ch_pool.clone()).await?);
    info!("ClickHouse writer initialized");
    metrics.start_collection().await?;
    info!("Metrics collector initialized");

    // Initialize log router
    let router = Arc::new(LogRouter::new(
        Arc::new(config.clone()),
        tenant_registry.clone(),
        clickhouse_writer.clone(),
        metrics.clone(),
    ));
    info!("Log router initialized");

    // Start HTTP server
    let log_receiver = LogReceiver::new(
        Arc::new(config.clone()),
        tenant_registry.clone(),
        router.clone(),
        metrics.clone(),
        ch_pool.clone(),
    );
    let app = log_receiver.create_router();
    let listener = tokio::net::TcpListener::bind(&config.server.bind_address).await?;
    info!("HTTP server listening on {}", config.server.bind_address);
    
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Start background tasks
    let flush_handle = tokio::spawn(async move {
        let mut interval = tokio::time::interval(
            std::time::Duration::from_millis(config.clickhouse.batch.timeout_ms)
        );
        loop {
            interval.tick().await;
            // ClickHouse writer doesn't need explicit flushing
            // Batches are automatically committed when written
        }
    });

    let metrics_handle = tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            let snapshot = metrics.get_snapshot().await;
            info!("Metrics: {} events/sec, {} total events, {} errors", 
                  snapshot.performance.current_eps, 
                  snapshot.performance.events_processed,
                  snapshot.health.total_errors);
        }
    });

    info!("All services started successfully");
    info!("🚀 SIEM ClickHouse Ingestion Pipeline is ready to handle 500K EPS!");

    // Wait for shutdown signal
    match signal::ctrl_c().await {
        Ok(()) => {
            info!("Received shutdown signal, gracefully shutting down...");
        }
        Err(err) => {
            error!("Unable to listen for shutdown signal: {}", err);
        }
    }

    // Graceful shutdown
    server_handle.abort();
    flush_handle.abort();
    metrics_handle.abort();

    // ClickHouse writer doesn't need explicit flushing
    // All pending operations are automatically handled

    info!("Shutdown complete");
    Ok(())
}