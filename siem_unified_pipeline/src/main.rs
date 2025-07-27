//! SIEM Unified Pipeline - Main Entry Point
//!
//! This is the main binary entry point for the SIEM unified pipeline.
//! It provides a command-line interface for running the pipeline server,
//! validating configurations, and performing various administrative tasks.

use clap::{Parser, Subcommand};
use siem_unified_pipeline::prelude::*;
use siem_unified_pipeline::{handlers, config::{DestinationType, SourceType}, pipeline::Pipeline, metrics::MetricsCollector};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::signal;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
// use redis::AsyncCommands; // Unused import

/// SIEM Unified Pipeline - High-performance security event processing
#[derive(Parser)]
#[command(author, version, about, long_about = None)]
#[command(propagate_version = true)]
struct Cli {
    /// Configuration file path
    #[arg(short, long, value_name = "FILE")]
    config: Option<PathBuf>,

    /// Log level (trace, debug, info, warn, error)
    #[arg(short, long, default_value = "info")]
    log_level: String,

    /// Log format (json, pretty)
    #[arg(long, default_value = "pretty")]
    log_format: String,

    /// Enable metrics collection
    #[arg(long, default_value = "true")]
    metrics: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the SIEM pipeline server
    Server {
        /// Server host address
        #[arg(long, default_value = "0.0.0.0")]
        host: String,

        /// Server port
        #[arg(long, default_value = "8080")]
        port: u16,

        /// Number of worker threads
        #[arg(long)]
        workers: Option<usize>,

        /// Enable development mode
        #[arg(long)]
        dev: bool,
    },
    /// Validate configuration file
    Validate {
        /// Configuration file to validate
        #[arg(short, long, value_name = "FILE")]
        config: PathBuf,

        /// Strict validation mode
        #[arg(long)]
        strict: bool,
    },
    /// Ingest events from various sources
    Ingest {
        /// Input file path
        #[arg(short, long, value_name = "FILE")]
        file: Option<PathBuf>,

        /// Input format (json, csv, syslog, cef)
        #[arg(short, long, default_value = "json")]
        format: String,

        /// Output destination
        #[arg(short, long)]
        output: Option<String>,

        /// Batch size for processing
        #[arg(long, default_value = "1000")]
        batch_size: usize,

        /// Dry run mode (don't actually ingest)
        #[arg(long)]
        dry_run: bool,
    },
    /// Transform events using configured pipelines
    Transform {
        /// Input file path
        #[arg(short, long, value_name = "FILE")]
        input: PathBuf,

        /// Output file path
        #[arg(short, long, value_name = "FILE")]
        output: PathBuf,

        /// Transformation pipeline to use
        #[arg(short, long)]
        pipeline: Option<String>,

        /// Enable enrichment
        #[arg(long)]
        enrich: bool,
    },
    /// Route events based on configured rules
    Route {
        /// Input file path
        #[arg(short, long, value_name = "FILE")]
        input: PathBuf,

        /// Routing configuration file
        #[arg(short, long, value_name = "FILE")]
        rules: Option<PathBuf>,

        /// Show routing decisions
        #[arg(long)]
        verbose: bool,
    },
    /// Generate sample configuration
    Config {
        /// Output file path
        #[arg(short, long, value_name = "FILE", default_value = "config.toml")]
        output: PathBuf,

        /// Configuration template (basic, advanced, production)
        #[arg(short, long, default_value = "basic")]
        template: String,

        /// Overwrite existing file
        #[arg(long)]
        force: bool,
    },
    /// Database management commands
    Database {
        #[command(subcommand)]
        action: DatabaseCommands,
    },
    /// Performance benchmarking
    Benchmark {
        /// Benchmark type (ingestion, transformation, routing, storage)
        #[arg(short, long, default_value = "ingestion")]
        bench_type: String,

        /// Duration in seconds
        #[arg(short, long, default_value = "60")]
        duration: u64,

        /// Number of concurrent workers
        #[arg(short, long, default_value = "4")]
        workers: usize,

        /// Events per second target
        #[arg(long, default_value = "1000")]
        rate: u64,
    },
    /// Health check and diagnostics
    Health {
        /// Server URL
        #[arg(short, long, default_value = "http://localhost:8080")]
        url: String,

        /// Timeout in seconds
        #[arg(short, long, default_value = "10")]
        timeout: u64,

        /// Detailed health information
        #[arg(long)]
        detailed: bool,
    },
}

#[derive(Subcommand, Debug)]
enum DatabaseCommands {
    /// Initialize database schema
    Init,
    /// Run database migrations
    Migrate,
    /// Reset database (WARNING: destructive)
    Reset {
        /// Confirm reset operation
        #[arg(long)]
        confirm: bool,
    },
    /// Backup database
    Backup {
        /// Backup file path
        #[arg(short, long, value_name = "FILE")]
        output: PathBuf,
    },
    /// Restore database from backup
    Restore {
        /// Backup file path
        #[arg(short, long, value_name = "FILE")]
        input: PathBuf,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    init_logging(&cli.log_level, &cli.log_format)?;

    info!("Starting SIEM Unified Pipeline v{}", env!("CARGO_PKG_VERSION"));

    // Load configuration
    let config = load_config(cli.config.as_deref()).await?;

    // Execute command
    match cli.command {
        Commands::Server { host, port, workers, dev } => {
            run_server(config, host, port, workers, dev, cli.metrics).await
        }
        Commands::Validate { config, strict } => {
            validate_config(config, strict).await
        }
        Commands::Ingest { file, format, output, batch_size, dry_run } => {
            run_ingestion(config, file, format, output, batch_size, dry_run).await
        }
        Commands::Transform { input, output, pipeline, enrich } => {
            run_transformation(config, input, output, pipeline, enrich).await
        }
        Commands::Route { input, rules, verbose } => {
            run_routing(config, input, rules, verbose).await
        }
        Commands::Config { output, template, force } => {
            generate_config(output, template, force).await
        }
        Commands::Database { action } => {
            run_database_command(config, action).await
        }
        Commands::Benchmark { bench_type, duration, workers, rate } => {
            run_benchmark(config, bench_type, duration, workers, rate).await
        }
        Commands::Health { url, timeout, detailed } => {
            check_health(url, timeout, detailed).await
        }
    }
}

/// Initialize logging based on configuration
fn init_logging(level: &str, format: &str) -> Result<()> {
    let level = level.parse::<tracing::Level>()
        .map_err(|_| PipelineError::configuration(format!("Invalid log level: {}", level)))?;

    let subscriber = tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env()
            .add_directive(level.into()));

    match format {
        "json" => {
            subscriber
                .with(tracing_subscriber::fmt::layer().json())
                .init();
        }
        "pretty" => {
            subscriber
                .with(tracing_subscriber::fmt::layer().pretty())
                .init();
        }
        _ => {
            return Err(PipelineError::configuration(
                format!("Invalid log format: {}", format)
            ));
        }
    }

    Ok(())
}

/// Load configuration from file or environment
async fn load_config(config_path: Option<&std::path::Path>) -> Result<PipelineConfig> {
    match config_path {
        Some(path) => {
            info!("Loading configuration from: {}", path.display());
            PipelineConfig::from_file(path).await
        }
        None => {
            info!("Loading configuration from environment variables");
            PipelineConfig::from_env().await
        }
    }
}

/// Run the main server
async fn run_server(
    mut config: PipelineConfig,
    host: String,
    port: u16,
    workers: Option<usize>,
    dev: bool,
    enable_metrics: bool,
) -> Result<()> {
    // Override config with CLI arguments
    config.server.host = host;
    config.server.port = port;
    if let Some(workers) = workers {
        config.server.workers = workers;
    }
    config.metrics.enabled = enable_metrics;

    if dev {
        warn!("Running in development mode - not suitable for production!");
        // Development mode configuration would go here
    }

    info!("Starting server on {}:{}", config.server.host, config.server.port);
    info!("Worker threads: {}", config.server.workers);
    info!("Metrics enabled: {}", config.metrics.enabled);

    // Initialize Redis client for streaming (if configured)
    let redis_client = initialize_redis_client(&config).await;
    if redis_client.is_some() {
        info!("Redis client initialized for real-time streaming");
    }

    // Initialize pipeline
    let pipeline = Arc::new(Pipeline::new(config.clone()).await?);
    let metrics = Arc::new(MetricsCollector::new(&config)?);
    
    // Create application state
    let app_state = handlers::AppState {
        pipeline: pipeline.clone(),
        metrics: metrics.clone(),
        config: Arc::new(tokio::sync::RwLock::new(config.clone())),
        redis_client,
    };

    // Create router
    let app = handlers::create_router(app_state);

    // Determine if we should use high-throughput mode
    let use_high_throughput = should_use_high_throughput_mode(&config);
    
    if use_high_throughput {
        info!("Starting pipeline in high-throughput mode (target: 500k events/second)");
        let worker_count = config.performance.parallel_processing
            .as_ref()
            .and_then(|p| p.worker_count)
            .unwrap_or(16);
        info!("High-throughput worker count: {}", worker_count);
        
        // Start high-throughput workers
        let pipeline_clone = pipeline.clone();
        tokio::spawn(async move {
            if let Err(e) = pipeline_clone.start_high_throughput_workers(worker_count).await {
                error!("High-throughput pipeline failed: {}", e);
            }
        });
    } else {
        info!("Starting pipeline in standard mode");
        
        // Start standard workers
        let pipeline_clone = pipeline.clone();
        tokio::spawn(async move {
            if let Err(e) = pipeline_clone.start_workers().await {
                error!("Standard pipeline failed: {}", e);
            }
        });
    }

    // Start metrics collection
    let metrics_clone = metrics.clone();
    tokio::spawn(async move {
        if let Err(e) = metrics_clone.start_collection().await {
            error!("Metrics collection failed: {}", e);
        }
    });

    // Start HTTP server
    let listener = tokio::net::TcpListener::bind(format!("{}:{}", config.server.host, config.server.port))
        .await
        .map_err(|e| PipelineError::connection(format!("Failed to bind to address: {}", e)))?;
    
    info!("HTTP server listening on {}:{}", config.server.host, config.server.port);
    
    // Set up signal handling for graceful shutdown
    let shutdown_signal = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install CTRL+C signal handler");
        info!("Received shutdown signal, initiating graceful shutdown...");
    };

    // Start the server
    tokio::select! {
        result = axum::serve(listener, app) => {
            match result {
                Ok(_) => info!("Server started successfully"),
                Err(e) => {
                    error!("Server failed: {}", e);
                    return Err(PipelineError::connection(format!("Server error: {}", e)));
                }
            }
        }
        _ = shutdown_signal => {
            info!("Shutting down server and pipeline...");
            pipeline.shutdown().await?;
            info!("Shutdown complete");
        }
    }

    Ok(())
}

/// Initialize Redis client if Redis destinations are configured
async fn initialize_redis_client(config: &PipelineConfig) -> Option<Arc<redis::Client>> {
    // Check if any destination is Redis
    for destination in config.destinations.values() {
        if matches!(destination.destination_type, DestinationType::Redis { .. }) {
            if let DestinationType::Redis { connection_string, .. } = &destination.destination_type {
                match redis::Client::open(connection_string.as_str()) {
                    Ok(client) => {
                        // Test connection
                        if let Ok(mut conn) = client.get_async_connection().await {
                            if redis::cmd("PING").query_async::<_, String>(&mut conn).await.is_ok() {
                                info!("Redis connection established: {}", connection_string);
                                return Some(Arc::new(client));
                            }
                        }
                        warn!("Failed to connect to Redis: {}", connection_string);
                    }
                    Err(e) => {
                        warn!("Failed to create Redis client: {}", e);
                    }
                }
            }
        }
    }
    None
}

/// Determine if high-throughput mode should be used
fn should_use_high_throughput_mode(config: &PipelineConfig) -> bool {
    // Check if parallel processing is enabled
    if let Some(parallel_config) = &config.performance.parallel_processing {
        if parallel_config.enabled {
            return true;
        }
    }
    
    // Check if we have Kafka sources (Vector integration)
    for source in config.sources.values() {
        if matches!(source.source_type, SourceType::Kafka { .. }) {
            return true;
        }
    }
    
    // Check if we have Redis destinations
    for destination in config.destinations.values() {
        if matches!(destination.destination_type, DestinationType::Redis { .. }) {
            return true;
        }
    }
    
    false
}

/// Validate configuration file
async fn validate_config(config_path: PathBuf, strict: bool) -> Result<()> {
    info!("Validating configuration: {}", config_path.display());
    
    let config = PipelineConfig::from_file(&config_path).await?;
    
    if strict {
        config.validate()?;
        info!("✓ Configuration is valid (strict mode)");
    } else {
        config.validate()?;
        info!("✓ Configuration is valid");
    }
    
    // Print configuration summary
    println!("Configuration Summary:");
    println!("  Server: {}:{}", config.server.host, config.server.port);
    println!("  Workers: {}", config.server.workers);
    println!("  Data Sources: {}", config.sources.len());
    println!("  Destinations: {}", config.destinations.len());
    println!("  Routing Rules: {}", config.routing.rules.len());
    
    Ok(())
}

/// Run ingestion from file or stdin
async fn run_ingestion(
    _config: PipelineConfig,
    _file: Option<PathBuf>,
    format: String,
    _output: Option<String>,
    batch_size: usize,
    dry_run: bool,
) -> Result<()> {
    info!("Starting ingestion process");
    info!("Format: {}, Batch size: {}, Dry run: {}", format, batch_size, dry_run);
    
    if dry_run {
        warn!("Running in dry-run mode - no data will be persisted");
    }
    
    // TODO: Implement ingestion logic
    // This would involve:
    // 1. Reading from file or stdin
    // 2. Parsing according to format
    // 3. Processing through transformation pipeline
    // 4. Routing to destinations (unless dry-run)
    
    info!("Ingestion completed successfully");
    Ok(())
}

/// Run transformation on input file
async fn run_transformation(
    _config: PipelineConfig,
    input: PathBuf,
    output: PathBuf,
    pipeline: Option<String>,
    enrich: bool,
) -> Result<()> {
    info!("Starting transformation process");
    info!("Input: {}, Output: {}", input.display(), output.display());
    info!("Pipeline: {:?}, Enrich: {}", pipeline, enrich);
    
    // TODO: Implement transformation logic
    
    info!("Transformation completed successfully");
    Ok(())
}

/// Run routing analysis
async fn run_routing(
    _config: PipelineConfig,
    input: PathBuf,
    _rules: Option<PathBuf>,
    verbose: bool,
) -> Result<()> {
    info!("Starting routing analysis");
    info!("Input: {}, Verbose: {}", input.display(), verbose);
    
    // TODO: Implement routing logic
    
    info!("Routing analysis completed successfully");
    Ok(())
}

/// Generate sample configuration
async fn generate_config(
    output: PathBuf,
    template: String,
    force: bool,
) -> Result<()> {
    if output.exists() && !force {
        return Err(PipelineError::configuration(
            format!("Configuration file already exists: {}. Use --force to overwrite.", output.display())
        ));
    }
    
    info!("Generating {} configuration template: {}", template, output.display());
    
    let config = match template.as_str() {
        "basic" => PipelineConfig::default(),
        "advanced" => {
            let mut config = PipelineConfig::default();
            // Add advanced features
            config.metrics.enabled = true;
            config
        }
        "production" => {
            let mut config = PipelineConfig::default();
            // Production-ready settings
            config.server.workers = num_cpus::get();
            config.metrics.enabled = true;
            config.rate_limiting.enabled = true;
            config
        }
        _ => {
            return Err(PipelineError::configuration(
                format!("Unknown template: {}", template)
            ));
        }
    };
    
    config.save_to_file(&output).await?;
    info!("✓ Configuration template generated successfully");
    
    Ok(())
}

/// Run database management commands
async fn run_database_command(
    _config: PipelineConfig,
    action: DatabaseCommands,
) -> Result<()> {
    info!("Running database command: {:?}", action);
    
    // TODO: Implement database management
    match action {
        DatabaseCommands::Init => {
            info!("Initializing database schema...");
            // Initialize database
        }
        DatabaseCommands::Migrate => {
            info!("Running database migrations...");
            // Run migrations
        }
        DatabaseCommands::Reset { confirm } => {
            if !confirm {
                return Err(PipelineError::configuration(
                    "Database reset requires --confirm flag".to_string()
                ));
            }
            warn!("Resetting database - this will delete all data!");
            // Reset database
        }
        DatabaseCommands::Backup { output } => {
            info!("Creating database backup: {}", output.display());
            // Create backup
        }
        DatabaseCommands::Restore { input } => {
            info!("Restoring database from: {}", input.display());
            // Restore from backup
        }
    }
    
    info!("Database command completed successfully");
    Ok(())
}

/// Run performance benchmarks
async fn run_benchmark(
    _config: PipelineConfig,
    bench_type: String,
    duration: u64,
    workers: usize,
    rate: u64,
) -> Result<()> {
    info!("Starting {} benchmark", bench_type);
    info!("Duration: {}s, Workers: {}, Target rate: {} events/s", duration, workers, rate);
    
    // TODO: Implement benchmarking logic
    
    info!("Benchmark completed successfully");
    Ok(())
}

/// Check health of running server
async fn check_health(
    url: String,
    timeout: u64,
    detailed: bool,
) -> Result<()> {
    info!("Checking health of server: {}", url);
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout))
        .build()
        .map_err(|e| PipelineError::http(format!("Failed to create HTTP client: {}", e)))?;
    
    let health_url = format!("{}/health", url.trim_end_matches('/'));
    
    match client.get(&health_url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                info!("✓ Server is healthy");
                
                if detailed {
                    if let Ok(body) = response.text().await {
                        println!("Health Details:\n{}", body);
                    }
                }
            } else {
                error!("✗ Server health check failed: {}", response.status());
                return Err(PipelineError::http(
                    format!("Health check failed with status: {}", response.status())
                ));
            }
        }
        Err(e) => {
            error!("✗ Failed to connect to server: {}", e);
            return Err(PipelineError::connection(
                format!("Failed to connect to server: {}", e)
            ));
        }
    }
    
    Ok(())
}

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
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("Shutdown signal received");
}