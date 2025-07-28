//! High-throughput ClickHouse log ingestion pipeline
//! Handles 500K EPS across 150-200 tenants with native compression

mod config;
mod receiver;
mod tenant_registry;
mod router;
mod clickhouse_writer;
mod metrics;
mod schema;

use anyhow::Result;
use std::sync::Arc;
use tokio::signal;
use tracing::{info, error};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    config::Config,
    receiver::start_http_server,
    tenant_registry::TenantRegistry,
    router::LogRouter,
    clickhouse_writer::ClickHouseWriter,
    metrics::MetricsCollector,
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

    // Load configuration
    let config = Config::load()?;
    info!("Configuration loaded successfully");
    info!("Server will listen on: {}", config.server.bind_address);
    info!("ClickHouse URL: {}", config.clickhouse.url);
    info!("Target throughput: {} EPS", config.performance.target_eps);

    // Initialize tenant registry
    let tenant_registry = Arc::new(TenantRegistry::load(&config.tenant_config_path)?);
    info!("Loaded {} tenants", tenant_registry.tenant_count());

    // Initialize ClickHouse writer
    let clickhouse_writer = Arc::new(ClickHouseWriter::new(&config.clickhouse).await?);
    info!("ClickHouse writer initialized");

    // Initialize metrics collector
    let metrics = Arc::new(MetricsCollector::new());
    info!("Metrics collector initialized");

    // Initialize log router
    let router = Arc::new(LogRouter::new(
        tenant_registry.clone(),
        clickhouse_writer.clone(),
        metrics.clone(),
        config.performance.clone(),
    ));
    info!("Log router initialized");

    // Start HTTP server
    let server_handle = tokio::spawn(start_http_server(
        config.server.clone(),
        router.clone(),
        metrics.clone(),
    ));

    // Start background tasks
    let flush_handle = tokio::spawn(async move {
        let mut interval = tokio::time::interval(
            std::time::Duration::from_millis(config.performance.flush_interval_ms)
        );
        loop {
            interval.tick().await;
            if let Err(e) = clickhouse_writer.flush_all().await {
                error!("Failed to flush buffers: {}", e);
            }
        }
    });

    let metrics_handle = tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));
        loop {
            interval.tick().await;
            metrics.log_current_stats();
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

    // Final flush
    if let Err(e) = clickhouse_writer.flush_all().await {
        error!("Failed final flush: {}", e);
    }

    info!("Shutdown complete");
    Ok(())
}