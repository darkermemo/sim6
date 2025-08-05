use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tokio::time::{interval, Duration};
use tracing::{info, warn, error, debug};
use uuid::Uuid;

use crate::config::PipelineConfig;
use crate::error::{Result, PipelineError};
use crate::ingestion::IngestionManager;
use crate::transformation::TransformationManager;
use crate::routing::RoutingManager;
use crate::storage::StorageManager;
use crate::metrics::MetricsCollector;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PipelineEvent {
    pub id: Uuid,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub source: String,
    pub data: serde_json::Value,
    pub metadata: HashMap<String, String>,
    pub processing_stage: ProcessingStage,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum ProcessingStage {
    Ingested,
    Parsed,
    Enriched,
    Filtered,
    Normalized,
    Routed,
    Stored,
    Failed(String),
}

#[derive(Debug, serde::Serialize)]
pub struct PipelineStats {
    pub events_ingested: u64,
    pub events_processed: u64,
    pub events_failed: u64,
    pub events_dropped: u64,
    pub processing_rate: f64,
    pub error_rate: f64,
    pub uptime: Duration,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

pub struct Pipeline {
    config: PipelineConfig,
    ingestion_manager: Arc<IngestionManager>,
    transformation_manager: Arc<TransformationManager>,
    routing_manager: Arc<RoutingManager>,
    storage_manager: Arc<StorageManager>,
    metrics_collector: Arc<MetricsCollector>,
    stats: Arc<RwLock<PipelineStats>>,
    event_tx: mpsc::UnboundedSender<PipelineEvent>,
    event_rx: Arc<RwLock<Option<mpsc::UnboundedReceiver<PipelineEvent>>>>,
    shutdown_tx: mpsc::Sender<()>,
    shutdown_rx: Arc<RwLock<Option<mpsc::Receiver<()>>>>,
    start_time: chrono::DateTime<chrono::Utc>,
}

impl Pipeline {
    pub async fn new(config: PipelineConfig) -> Result<Self> {
        info!("Initializing SIEM Unified Pipeline");
        
        // Initialize managers
        let ingestion_manager = Arc::new(IngestionManager::new(&config).await?);
        let transformation_manager = Arc::new(TransformationManager::new(&config).await?);
        let routing_manager = Arc::new(RoutingManager::new(&config).await?);
        let storage_manager = Arc::new(StorageManager::new(&config).await?);
        let metrics_collector = Arc::new(MetricsCollector::new(&config)?);
        
        // Create event channel
        let (event_tx, event_rx) = mpsc::unbounded_channel();
        let (shutdown_tx, shutdown_rx) = mpsc::channel(1);
        
        // Initialize stats
        let stats = Arc::new(RwLock::new(PipelineStats {
            events_ingested: 0,
            events_processed: 0,
            events_failed: 0,
            events_dropped: 0,
            processing_rate: 0.0,
            error_rate: 0.0,
            uptime: Duration::from_secs(0),
            last_updated: chrono::Utc::now(),
        }));
        
        let start_time = chrono::Utc::now();
        
        Ok(Pipeline {
            config,
            ingestion_manager,
            transformation_manager,
            routing_manager,
            storage_manager,
            metrics_collector,
            stats,
            event_tx,
            event_rx: Arc::new(RwLock::new(Some(event_rx))),
            shutdown_tx,
            shutdown_rx: Arc::new(RwLock::new(Some(shutdown_rx))),
            start_time,
        })
    }
    
    pub async fn start_workers(&self) -> Result<()> {
        info!("Starting pipeline workers");
        
        // Start ingestion workers
        for (source_name, source_config) in &self.config.sources {
            if source_config.enabled {
                let ingestion_manager = self.ingestion_manager.clone();
                let event_tx = self.event_tx.clone();
                let source_name = source_name.clone();
                let source_config = source_config.clone();
                
                tokio::spawn(async move {
                    if let Err(e) = ingestion_manager.start_source(&source_name, &source_config, event_tx).await {
                        error!("Ingestion worker failed for source {}: {}", source_name, e);
                    }
                });
            }
        }
        
        // Start main processing loop (standard mode)
        let event_rx = {
            let mut rx_guard = self.event_rx.write().await;
            rx_guard.take().ok_or_else(|| PipelineError::internal("Event receiver already taken"))?
        };
        
        let transformation_manager = self.transformation_manager.clone();
        let routing_manager = self.routing_manager.clone();
        let storage_manager = self.storage_manager.clone();
        let stats = self.stats.clone();
        let metrics_collector = self.metrics_collector.clone();
        
        tokio::spawn(async move {
            Self::process_events(
                event_rx,
                transformation_manager,
                routing_manager,
                storage_manager,
                stats,
                metrics_collector,
            ).await;
        });
        
        // Start metrics collection
        let ingestion_clone = self.ingestion_manager.clone();
        let metrics_clone = self.metrics_collector.clone();
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(10));
            loop {
                interval.tick().await;
                if let Err(e) = Self::update_metrics(ingestion_clone.clone(), metrics_clone.clone()).await {
                    warn!("Failed to update metrics: {}", e);
                }
            }
        });
        
        // Start health check
        let stats_clone = self.stats.clone();
        let start_time = self.start_time;
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(30));
            loop {
                interval.tick().await;
                Self::update_stats(stats_clone.clone(), start_time).await;
            }
        });
        
        info!("Pipeline workers started successfully");
        Ok(())
    }
    
    pub async fn start_high_throughput_workers(&self, worker_count: usize) -> Result<()> {
        info!("Starting high-throughput pipeline workers with {} parallel workers", worker_count);
        info!("DEBUG: About to start ingestion workers");
        
        // Start ingestion workers
        info!("DEBUG: Found {} sources in configuration", self.config.sources.len());
        for (source_name, source_config) in &self.config.sources {
            info!("DEBUG: Processing source: {} (enabled: {})", source_name, source_config.enabled);
            if source_config.enabled {
                let ingestion_manager = self.ingestion_manager.clone();
                let event_tx = self.event_tx.clone();
                let source_name = source_name.clone();
                let source_config = source_config.clone();
                
                tokio::spawn(async move {
                    if let Err(e) = ingestion_manager.start_source(&source_name, &source_config, event_tx).await {
                        error!("Ingestion worker failed for source {}: {}", source_name, e);
                    }
                });
            }
        }
        
        // Start parallel processing loop
        let event_rx = {
            let mut rx_guard = self.event_rx.write().await;
            rx_guard.take().ok_or_else(|| PipelineError::internal("Event receiver already taken"))?
        };
        
        let shutdown_rx = {
            let mut shutdown_guard = self.shutdown_rx.write().await;
            shutdown_guard.take().ok_or_else(|| PipelineError::internal("Shutdown receiver already taken"))?
        };
        
        let transformation_manager = self.transformation_manager.clone();
        let routing_manager = self.routing_manager.clone();
        let storage_manager = self.storage_manager.clone();
        let stats = self.stats.clone();
        let metrics_collector = self.metrics_collector.clone();
        
        tokio::spawn(async move {
            Self::process_events_parallel(
                event_rx,
                transformation_manager,
                routing_manager,
                storage_manager,
                metrics_collector,
                stats,
                shutdown_rx,
                worker_count,
            ).await;
        });
        
        // Start metrics collection
        let ingestion_clone = self.ingestion_manager.clone();
        let metrics_clone = self.metrics_collector.clone();
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(5)); // More frequent for high-throughput
            loop {
                interval.tick().await;
                if let Err(e) = Self::update_metrics(ingestion_clone.clone(), metrics_clone.clone()).await {
                    warn!("Failed to update metrics: {}", e);
                }
            }
        });
        
        // Start health check
        let stats_clone = self.stats.clone();
        let start_time = self.start_time;
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(10)); // More frequent for high-throughput
            loop {
                interval.tick().await;
                Self::update_stats(stats_clone.clone(), start_time).await;
            }
        });
        
        info!("High-throughput pipeline workers started successfully");
        Ok(())
    }
    
    async fn process_events(
        mut event_rx: mpsc::UnboundedReceiver<PipelineEvent>,
        transformation_manager: Arc<TransformationManager>,
        routing_manager: Arc<RoutingManager>,
        storage_manager: Arc<StorageManager>,
        stats: Arc<RwLock<PipelineStats>>,
        metrics_collector: Arc<MetricsCollector>,
    ) {
        info!("Starting event processing loop");
        
        while let Some(mut event) = event_rx.recv().await {
            let event_id = event.id;
            debug!("Processing event: {}", event_id);
            
            // Update ingestion stats
            {
                let mut stats_guard = stats.write().await;
                stats_guard.events_ingested += 1;
            }
            
            // Process through transformation pipeline
            match transformation_manager.process_event(&mut event).await {
                Ok(_) => {
                    debug!("Event {} transformed successfully", event_id);
                    event.processing_stage = ProcessingStage::Normalized;
                }
                Err(e) => {
                    error!("Transformation failed for event {}: {}", event_id, e);
                    event.processing_stage = ProcessingStage::Failed(e.to_string());
                    
                    let mut stats_guard = stats.write().await;
                    stats_guard.events_failed += 1;
                    continue;
                }
            }
            
            // Route event to destinations
            match routing_manager.route_event(&event).await {
                Ok(destinations) => {
                    debug!("Event {} routed to {} destinations", event_id, destinations.len());
                    event.processing_stage = ProcessingStage::Routed;
                    
                    // Store in each destination
                    for destination in destinations {
                        if let Err(e) = storage_manager.store_event(&event, &destination).await {
                            error!("Storage failed for event {} in destination {}: {}", event_id, destination, e);
                        } else {
                            debug!("Event {} stored in destination {}", event_id, destination);
                        }
                    }
                    
                    event.processing_stage = ProcessingStage::Stored;
                    
                    let mut stats_guard = stats.write().await;
                    stats_guard.events_processed += 1;
                }
                Err(e) => {
                    error!("Routing failed for event {}: {}", event_id, e);
                    event.processing_stage = ProcessingStage::Failed(e.to_string());
                    
                    let mut stats_guard = stats.write().await;
                    stats_guard.events_failed += 1;
                }
            }
            
            // Update metrics
            let processing_time = 0.0; // Default processing time for single event processing
            metrics_collector.record_event_processed(processing_time);
        }
        
        info!("Event processing loop terminated");
    }
    
    // Enhanced parallel event processing for high-throughput (500k eps)
    async fn process_events_parallel(
        mut event_rx: mpsc::UnboundedReceiver<PipelineEvent>,
        transformation_manager: Arc<TransformationManager>,
        routing_manager: Arc<RoutingManager>,
        storage_manager: Arc<StorageManager>,
        metrics_collector: Arc<MetricsCollector>,
        stats: Arc<RwLock<PipelineStats>>,
        mut shutdown_rx: mpsc::Receiver<()>,
        worker_count: usize,
    ) {
        info!("Starting parallel event processing with {} workers", worker_count);
        
        let (batch_tx, batch_rx) = mpsc::unbounded_channel::<Vec<PipelineEvent>>();
        let batch_size = 1000;
        let batch_timeout = Duration::from_millis(100);
        
        // Batching task
        let batch_tx_clone = batch_tx.clone();
        let batching_task = tokio::spawn(async move {
            let mut current_batch = Vec::with_capacity(batch_size);
            let mut last_batch_time = std::time::Instant::now();
            
            loop {
                tokio::select! {
                    event_opt = event_rx.recv() => {
                        match event_opt {
                            Some(event) => {
                                current_batch.push(event);
                                
                                // Send batch if full or timeout reached
                                if (current_batch.len() >= batch_size || last_batch_time.elapsed() >= batch_timeout) && !current_batch.is_empty() {
                                    if batch_tx_clone.send(current_batch.clone()).is_err() {
                                        break;
                                    }
                                    current_batch.clear();
                                    last_batch_time = std::time::Instant::now();
                                }
                            }
                            None => {
                                // Send remaining events
                                if !current_batch.is_empty() {
                                    let _ = batch_tx_clone.send(current_batch);
                                }
                                break;
                            }
                        }
                    }
                    _ = tokio::time::sleep(batch_timeout) => {
                        if !current_batch.is_empty() && last_batch_time.elapsed() >= batch_timeout {
                            if batch_tx_clone.send(current_batch.clone()).is_err() {
                                break;
                            }
                            current_batch.clear();
                            last_batch_time = std::time::Instant::now();
                        }
                    }
                }
            }
        });
        
        // Worker tasks
        let batch_rx = Arc::new(tokio::sync::Mutex::new(batch_rx));
        let mut worker_handles = Vec::new();
        for worker_id in 0..worker_count {
            let batch_rx_clone = batch_rx.clone();
            let transformation_manager = transformation_manager.clone();
            let routing_manager = routing_manager.clone();
            let storage_manager = storage_manager.clone();
            let metrics_collector = metrics_collector.clone();
            let stats = stats.clone();
            
            let worker_handle = tokio::spawn(async move {
                info!("Worker {} started", worker_id);
                
                loop {
                    let batch = {
                        let mut rx = batch_rx_clone.lock().await;
                        rx.recv().await
                    };
                    
                    let batch = match batch {
                        Some(batch) => batch,
                        None => break,
                    };
                    let batch_start = std::time::Instant::now();
                    let mut processed_count = 0u64;
                    let mut failed_count = 0u64;
                    
                    for mut event in batch {
                        let event_id = event.id;
                        
                        // Transform event
                        match transformation_manager.process_event(&mut event).await {
                            Ok(_) => {
                                event.processing_stage = ProcessingStage::Normalized;
                            }
                            Err(e) => {
                                error!("Transformation failed for event {}: {}", event_id, e);
                                event.processing_stage = ProcessingStage::Failed(e.to_string());
                                failed_count += 1;
                                continue;
                            }
                        }
                        
                        // Route and store event
                        match routing_manager.route_event(&event).await {
                            Ok(destinations) => {
                                event.processing_stage = ProcessingStage::Routed;
                                
                                // Store in parallel to all destinations
                                let storage_futures: Vec<_> = destinations.iter()
                                    .map(|dest| storage_manager.store_event(&event, dest))
                                    .collect();
                                
                                let storage_results = futures::future::join_all(storage_futures).await;
                                let mut storage_success = true;
                                
                                for (i, result) in storage_results.into_iter().enumerate() {
                                    if let Err(e) = result {
                                        error!("Storage failed for event {} in destination {}: {}", 
                                               event_id, destinations[i], e);
                                        storage_success = false;
                                    }
                                }
                                
                                if storage_success {
                                    event.processing_stage = ProcessingStage::Stored;
                                    processed_count += 1;
                                } else {
                                    failed_count += 1;
                                }
                            }
                            Err(e) => {
                                error!("Routing failed for event {}: {}", event_id, e);
                                event.processing_stage = ProcessingStage::Failed(e.to_string());
                                failed_count += 1;
                            }
                        }
                        
                        // Record metrics
                        let processing_time = batch_start.elapsed().as_millis() as f64 / processed_count as f64;
                        metrics_collector.record_event_processed(processing_time);
                    }
                    
                    // Update batch statistics
                    {
                        let mut stats_guard = stats.write().await;
                        stats_guard.events_processed += processed_count;
                        stats_guard.events_failed += failed_count;
                    }
                    
                    let batch_duration = batch_start.elapsed();
                    debug!("Worker {} processed batch: {} events, {} failed, took {:?}", 
                           worker_id, processed_count, failed_count, batch_duration);
                }
                
                info!("Worker {} terminated", worker_id);
            });
            
            worker_handles.push(worker_handle);
        }
        
        // Wait for shutdown signal
        let _ = shutdown_rx.recv().await;
        info!("Shutdown signal received, stopping parallel processing");
        
        // Stop batching task
        batching_task.abort();
        
        // Wait for all workers to complete
        for handle in worker_handles {
            let _ = handle.await;
        }
        
        info!("Parallel event processing terminated");
    }
    
    async fn update_metrics(
        ingestion_manager: Arc<IngestionManager>,
        metrics_collector: Arc<MetricsCollector>,
    ) -> Result<()> {
        let ingestion_stats = ingestion_manager.get_stats().await;
        
        if let Err(e) = metrics_collector.update_pipeline_stats(&ingestion_stats).await {
            warn!("Failed to update pipeline stats: {}", e);
        }
        
        Ok(())
    }
    
    async fn update_stats(stats: Arc<RwLock<PipelineStats>>, start_time: chrono::DateTime<chrono::Utc>) {
        let mut stats_guard = stats.write().await;
        let now = chrono::Utc::now();
        
        stats_guard.uptime = (now - start_time).to_std().unwrap_or(Duration::from_secs(0));
        stats_guard.last_updated = now;
        
        // Calculate rates
        let uptime_seconds = stats_guard.uptime.as_secs() as f64;
        if uptime_seconds > 0.0 {
            stats_guard.processing_rate = stats_guard.events_processed as f64 / uptime_seconds;
            stats_guard.error_rate = if stats_guard.events_ingested > 0 {
                stats_guard.events_failed as f64 / stats_guard.events_ingested as f64
            } else {
                0.0
            };
        }
    }
    
    pub async fn get_stats(&self) -> PipelineStats {
        let stats_guard = self.stats.read().await;
        stats_guard.clone()
    }
    
    /// Get access to the routing manager
    pub fn get_routing_manager(&self) -> Arc<RoutingManager> {
        self.routing_manager.clone()
    }
    
    pub async fn process_event(&self, event: &mut PipelineEvent) -> Result<()> {
        // Transform the event
        self.transformation_manager.process_event(event).await?;
        
        // Route and store the event
        let destinations = self.routing_manager.route_event(event).await?;
        
        for destination in destinations {
            if let Err(e) = self.storage_manager.store_event(event, &destination).await {
                error!("Failed to store event to destination {}: {}", destination, e);
                event.processing_stage = ProcessingStage::Failed(e.to_string());
                return Err(e);
            }
        }
        
        event.processing_stage = ProcessingStage::Stored;
        
        // Update stats
        {
            let mut stats_guard = self.stats.write().await;
            stats_guard.events_processed += 1;
        }
        
        Ok(())
    }
    
    pub async fn get_health(&self) -> Result<serde_json::Value> {
        let stats = self.get_stats().await;
        
        let health_status = if stats.error_rate < 0.05 {
            "healthy"
        } else if stats.error_rate < 0.20 {
            "degraded"
        } else {
            "unhealthy"
        };
        
        // Get component health status
        let ingestion_health = self.ingestion_manager.get_health().await;
        let transformation_health = self.transformation_manager.get_health().await;
        let routing_health = self.routing_manager.get_health().await;
        let storage_health = self.storage_manager.get_health().await;
        
        Ok(serde_json::json!({
            "status": health_status,
            "uptime_seconds": stats.uptime.as_secs(),
            "events_ingested": stats.events_ingested,
            "events_processed": stats.events_processed,
            "events_failed": stats.events_failed,
            "processing_rate": stats.processing_rate,
            "error_rate": stats.error_rate,
            "last_updated": stats.last_updated.to_rfc3339(),
            "components": {
                "ingestion": ingestion_health,
                "transformation": transformation_health,
                "routing": routing_health,
                "storage": storage_health
            }
        }))
    }
    
    pub async fn run_ingestion_worker(&self, source_name: &str) -> Result<()> {
        let source_config = self.config.sources.get(source_name)
            .ok_or_else(|| PipelineError::not_found(format!("Source '{}' not found", source_name)))?;
        
        if !source_config.enabled {
            return Err(PipelineError::bad_request(format!("Source '{}' is disabled", source_name)));
        }
        
        info!("Starting ingestion worker for source: {}", source_name);
        
        self.ingestion_manager
            .start_source(source_name, source_config, self.event_tx.clone())
            .await
    }
    
    pub async fn run_transformation_worker(&self, pipeline_name: &str) -> Result<()> {
        let pipeline_config = self.config.transformations.get(pipeline_name)
            .ok_or_else(|| PipelineError::not_found(format!("Transformation pipeline '{}' not found", pipeline_name)))?;
        
        info!("Starting transformation worker for pipeline: {}", pipeline_name);
        
        // This would typically run a dedicated transformation worker
        // For now, transformations are handled in the main processing loop
        Ok(())
    }
    
    pub async fn run_routing_worker(&self, rules_path: &str) -> Result<()> {
        info!("Starting routing worker with rules: {}", rules_path);
        
        // Load and apply routing rules
        self.routing_manager.load_rules(rules_path).await?;
        
        Ok(())
    }
    
    pub async fn shutdown(&self) -> Result<()> {
        info!("Shutting down pipeline");
        
        if let Err(e) = self.shutdown_tx.send(()).await {
            warn!("Failed to send shutdown signal: {}", e);
        }
        
        // Graceful shutdown of components
        self.ingestion_manager.shutdown().await?;
        self.transformation_manager.shutdown().await?;
        self.routing_manager.shutdown().await?;
        self.storage_manager.shutdown().await?;
        
        info!("Pipeline shutdown complete");
        Ok(())
    }
    
    pub async fn reload_config(&self, new_config: PipelineConfig) -> Result<()> {
        info!("Reloading pipeline configuration");
        
        // Validate new configuration
        new_config.validate()?;
        
        // Apply configuration changes
        self.ingestion_manager.reload_config(&new_config).await?;
        self.transformation_manager.reload_config(&new_config).await?;
        self.routing_manager.reload_config(&new_config).await?;
        self.storage_manager.reload_config(&new_config).await?;
        
        info!("Configuration reloaded successfully");
        Ok(())
    }
}

impl Clone for PipelineStats {
    fn clone(&self) -> Self {
        Self {
            events_ingested: self.events_ingested,
            events_processed: self.events_processed,
            events_failed: self.events_failed,
            events_dropped: self.events_dropped,
            processing_rate: self.processing_rate,
            error_rate: self.error_rate,
            uptime: self.uptime,
            last_updated: self.last_updated,
        }
    }
}