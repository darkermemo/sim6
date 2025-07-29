use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tokio::time::{interval, Duration};
use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::UdpSocket;
use tracing::{info, warn, error, debug};
use uuid::Uuid;
use serde::{Deserialize, Serialize};
use reqwest::Client;
use rdkafka::consumer::{Consumer, StreamConsumer, CommitMode};
use rdkafka::config::ClientConfig;
use rdkafka::message::Message;

use crate::config::{PipelineConfig, DataSource, SourceType};
use crate::error::{Result, PipelineError};
use crate::pipeline::{PipelineEvent, ProcessingStage};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestionStats {
    pub source_name: String,
    pub events_received: u64,
    pub bytes_received: u64,
    pub errors: u64,
    pub last_event_time: Option<chrono::DateTime<chrono::Utc>>,
    pub connection_status: ConnectionStatus,
    pub throughput_events_per_sec: f64,
    pub throughput_bytes_per_sec: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConnectionStatus {
    Connected,
    Disconnected,
    Connecting,
    Error(String),
}

pub struct IngestionManager {
    config: PipelineConfig,
    stats: Arc<RwLock<HashMap<String, IngestionStats>>>,
    http_client: Client,
    active_sources: Arc<RwLock<HashMap<String, SourceHandle>>>,
}

#[derive(Debug)]
struct SourceHandle {
    shutdown_tx: mpsc::Sender<()>,
    task_handle: tokio::task::JoinHandle<()>,
}

impl IngestionManager {
    pub async fn new(config: &PipelineConfig) -> Result<Self> {
        info!("Initializing ingestion manager");
        
        let http_client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| PipelineError::http(format!("Failed to create HTTP client: {}", e)))?;
        
        Ok(IngestionManager {
            config: config.clone(),
            stats: Arc::new(RwLock::new(HashMap::new())),
            http_client,
            active_sources: Arc::new(RwLock::new(HashMap::new())),
        })
    }
    
    pub async fn start_source(
        &self,
        source_name: &str,
        source_config: &DataSource,
        event_tx: mpsc::UnboundedSender<PipelineEvent>,
    ) -> Result<()> {
        info!("Starting ingestion source: {}", source_name);
        
        // Initialize stats for this source
        {
            let mut stats_guard = self.stats.write().await;
            stats_guard.insert(source_name.to_string(), IngestionStats {
                source_name: source_name.to_string(),
                events_received: 0,
                bytes_received: 0,
                errors: 0,
                last_event_time: None,
                connection_status: ConnectionStatus::Connecting,
                throughput_events_per_sec: 0.0,
                throughput_bytes_per_sec: 0.0,
            });
        }
        
        let (shutdown_tx, shutdown_rx) = mpsc::channel(1);
        let stats = self.stats.clone();
        let source_name = source_name.to_string();
        let source_config = source_config.clone();
        let http_client = self.http_client.clone();
        
        let task_handle = match source_config.source_type {
            SourceType::Syslog { .. } => {
                let source_name = source_name.clone();
                tokio::spawn(async move {
                    if let Err(e) = Self::run_syslog_source(
                        &source_name,
                        &source_config,
                        event_tx,
                        stats,
                        shutdown_rx,
                    ).await {
                        error!("Syslog source {} failed: {}", source_name, e);
                    }
                })
            }
            SourceType::File { .. } => {
                let source_name = source_name.clone();
                tokio::spawn(async move {
                    if let Err(e) = Self::run_file_source(
                        &source_name,
                        &source_config,
                        event_tx,
                        stats,
                        shutdown_rx,
                    ).await {
                        error!("File source {} failed: {}", source_name, e);
                    }
                })
            }
            SourceType::Http { .. } => {
                let source_name = source_name.clone();
                tokio::spawn(async move {
                    if let Err(e) = Self::run_http_source(
                        &source_name,
                        &source_config,
                        event_tx,
                        stats,
                        http_client,
                        shutdown_rx,
                    ).await {
                        error!("HTTP source {} failed: {}", source_name, e);
                    }
                })
            }
            SourceType::Kafka { .. } => {
                let source_name = source_name.clone();
                tokio::spawn(async move {
                    if let Err(e) = Self::run_kafka_source(
                        &source_name,
                        &source_config,
                        event_tx,
                        stats,
                        shutdown_rx,
                    ).await {
                        error!("Kafka source {} failed: {}", source_name, e);
                    }
                })
            }
            SourceType::Database { .. } => {
                let source_name = source_name.clone();
                tokio::spawn(async move {
                    if let Err(e) = Self::run_database_source(
                        &source_name,
                        &source_config,
                        event_tx,
                        stats,
                        shutdown_rx,
                    ).await {
                        error!("Database source {} failed: {}", source_name, e);
                    }
                })
            }
            SourceType::S3 { .. } => {
                let source_name = source_name.clone();
                tokio::spawn(async move {
                    if let Err(e) = Self::run_s3_source(
                        &source_name,
                        &source_config,
                        event_tx,
                        stats,
                        shutdown_rx,
                    ).await {
                        error!("S3 source {} failed: {}", source_name, e);
                    }
                })
            }
            SourceType::Beats { .. } => {
                let source_name = source_name.clone();
                tokio::spawn(async move {
                    error!("Beats source not yet implemented: {}", source_name);
                })
            }
            SourceType::Fluentd { .. } => {
                let source_name = source_name.clone();
                tokio::spawn(async move {
                    error!("Fluentd source not yet implemented: {}", source_name);
                })
            }
            SourceType::Custom { .. } => {
                let source_name = source_name.clone();
                tokio::spawn(async move {
                    error!("Custom source not yet implemented: {}", source_name);
                })
            }
        };
        
        // Store the source handle
        {
            let mut active_sources = self.active_sources.write().await;
            active_sources.insert(source_name.clone(), SourceHandle {
                shutdown_tx,
                task_handle,
            });
        }
        
        info!("Source {} started successfully", source_name);
        Ok(())
    }
    
    async fn run_syslog_source(
        source_name: &str,
        config: &DataSource,
        event_tx: mpsc::UnboundedSender<PipelineEvent>,
        stats: Arc<RwLock<HashMap<String, IngestionStats>>>,
        mut shutdown_rx: mpsc::Receiver<()>,
    ) -> Result<()> {
        info!("Starting syslog source: {}", source_name);
        
        let bind_addr = match &config.source_type {
            SourceType::Syslog { port, .. } => format!("0.0.0.0:{}", port),
            _ => "0.0.0.0:514".to_string(), // Default syslog port
        };
        let socket = UdpSocket::bind(bind_addr).await
            .map_err(|e| PipelineError::connection(format!("Failed to bind UDP socket: {}", e)))?;
        
        // Update connection status
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Connected).await;
        
        let mut buffer = [0; 65536];
        
        loop {
            tokio::select! {
                result = socket.recv_from(&mut buffer) => {
                    match result {
                        Ok((len, addr)) => {
                            let data = String::from_utf8_lossy(&buffer[..len]);
                            debug!("Received syslog message from {}: {}", addr, data);
                            
                            let event = PipelineEvent {
                                id: Uuid::new_v4(),
                                timestamp: chrono::Utc::now(),
                                source: source_name.to_string(),
                                data: serde_json::json!({
                                    "raw_message": data.to_string(),
                                    "source_ip": addr.ip().to_string(),
                                    "source_port": addr.port(),
                                    "protocol": "syslog",
                                    "transport": "udp"
                                }),
                                metadata: {
                                    let mut meta = HashMap::new();
                                    meta.insert("source_type".to_string(), "syslog".to_string());
                                    meta.insert("source_ip".to_string(), addr.ip().to_string());
                                    meta.insert("bytes_received".to_string(), len.to_string());
                                    meta
                                },
                                processing_stage: ProcessingStage::Ingested,
                            };
                            
                            if let Err(e) = event_tx.send(event) {
                                error!("Failed to send syslog event: {}", e);
                                Self::increment_error_count(&stats, source_name).await;
                            } else {
                                Self::update_stats(&stats, source_name, len as u64).await;
                            }
                        }
                        Err(e) => {
                            error!("Syslog receive error: {}", e);
                            Self::increment_error_count(&stats, source_name).await;
                        }
                    }
                }
                _ = shutdown_rx.recv() => {
                    info!("Shutting down syslog source: {}", source_name);
                    break;
                }
            }
        }
        
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Disconnected).await;
        Ok(())
    }
    
    async fn run_file_source(
        source_name: &str,
        config: &DataSource,
        event_tx: mpsc::UnboundedSender<PipelineEvent>,
        stats: Arc<RwLock<HashMap<String, IngestionStats>>>,
        mut shutdown_rx: mpsc::Receiver<()>,
    ) -> Result<()> {
        info!("Starting file source: {}", source_name);
        
        let file_path = match &config.source_type {
            SourceType::File { path, .. } => path.clone(),
            _ => return Err(PipelineError::configuration("Invalid source type for file source")),
        };
        
        if !Path::new(&file_path).exists() {
            return Err(PipelineError::not_found(format!("File not found: {}", file_path)));
        }
        
        let file_path_clone = file_path.clone();
        let file = File::open(file_path).await
            .map_err(|e| PipelineError::io(format!("Failed to open file {}: {}", file_path_clone, e)))?;
        
        let reader = BufReader::new(file);
        let mut lines = reader.lines();
        
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Connected).await;
        
        loop {
            tokio::select! {
                line_result = lines.next_line() => {
                    match line_result {
                        Ok(Some(line)) => {
                            debug!("Read line from file: {}", line);
                            
                            let event = PipelineEvent {
                                id: Uuid::new_v4(),
                                timestamp: chrono::Utc::now(),
                                source: source_name.to_string(),
                                data: serde_json::json!({
                                    "raw_message": line,
                                    "file_path": file_path_clone,
                                    "protocol": "file"
                                }),
                                metadata: {
                                    let mut meta = HashMap::new();
                                    meta.insert("source_type".to_string(), "file".to_string());
                                    meta.insert("file_path".to_string(), file_path_clone.to_string());
                                    meta.insert("bytes_received".to_string(), line.len().to_string());
                                    meta
                                },
                                processing_stage: ProcessingStage::Ingested,
                            };
                            
                            if let Err(e) = event_tx.send(event) {
                                error!("Failed to send file event: {}", e);
                                Self::increment_error_count(&stats, source_name).await;
                            } else {
                                Self::update_stats(&stats, source_name, line.len() as u64).await;
                            }
                        }
                        Ok(None) => {
                            // End of file reached, wait for new content or shutdown
                            tokio::time::sleep(Duration::from_millis(100)).await;
                        }
                        Err(e) => {
                            error!("File read error: {}", e);
                            Self::increment_error_count(&stats, source_name).await;
                        }
                    }
                }
                _ = shutdown_rx.recv() => {
                    info!("Shutting down file source: {}", source_name);
                    break;
                }
            }
        }
        
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Disconnected).await;
        Ok(())
    }
    
    async fn run_http_source(
        source_name: &str,
        config: &DataSource,
        event_tx: mpsc::UnboundedSender<PipelineEvent>,
        stats: Arc<RwLock<HashMap<String, IngestionStats>>>,
        http_client: Client,
        mut shutdown_rx: mpsc::Receiver<()>,
    ) -> Result<()> {
        info!("Starting HTTP source: {}", source_name);
        
        let url = match &config.source_type {
            SourceType::Http { endpoint, .. } => endpoint.clone(),
            _ => return Err(PipelineError::configuration("Invalid source type for HTTP source")),
        };
        
        let poll_interval = Duration::from_secs(60); // Default poll interval
        let mut interval = interval(poll_interval);
        
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Connected).await;
        
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    match http_client.get(&url).send().await {
                        Ok(response) => {
                            match response.text().await {
                                Ok(body) => {
                                    debug!("Received HTTP response: {} bytes", body.len());
                                    
                                    let event = PipelineEvent {
                                        id: Uuid::new_v4(),
                                        timestamp: chrono::Utc::now(),
                                        source: source_name.to_string(),
                                        data: serde_json::json!({
                                            "raw_message": body,
                                            "url": url,
                                            "protocol": "http"
                                        }),
                                        metadata: {
                                            let mut meta = HashMap::new();
                                            meta.insert("source_type".to_string(), "http".to_string());
                                            meta.insert("url".to_string(), url.to_string());
                                            meta.insert("bytes_received".to_string(), body.len().to_string());
                                            meta
                                        },
                                        processing_stage: ProcessingStage::Ingested,
                                    };
                                    
                                    if let Err(e) = event_tx.send(event) {
                                        error!("Failed to send HTTP event: {}", e);
                                        Self::increment_error_count(&stats, source_name).await;
                                    } else {
                                        Self::update_stats(&stats, source_name, body.len() as u64).await;
                                    }
                                }
                                Err(e) => {
                                    error!("Failed to read HTTP response body: {}", e);
                                    Self::increment_error_count(&stats, source_name).await;
                                }
                            }
                        }
                        Err(e) => {
                            error!("HTTP request failed: {}", e);
                            Self::increment_error_count(&stats, source_name).await;
                        }
                    }
                }
                _ = shutdown_rx.recv() => {
                    info!("Shutting down HTTP source: {}", source_name);
                    break;
                }
            }
        }
        
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Disconnected).await;
        Ok(())
    }
    
    async fn run_kafka_source(
        source_name: &str,
        config: &DataSource,
        event_tx: mpsc::UnboundedSender<PipelineEvent>,
        stats: Arc<RwLock<HashMap<String, IngestionStats>>>,
        mut shutdown_rx: mpsc::Receiver<()>,
    ) -> Result<()> {
        info!("Starting Kafka source: {}", source_name);
        
        let (brokers, topic) = match &config.source_type {
            SourceType::Kafka { topic, brokers } => {
                (brokers.join(","), topic.clone())
            }
            _ => return Err(PipelineError::configuration("Invalid source type for Kafka consumer")),
        };
        
        let group_id = format!("siem-pipeline-{}", source_name);
        
        // Enhanced Kafka consumer configuration for high-throughput
        let consumer: StreamConsumer = ClientConfig::new()
            .set("group.id", group_id)
            .set("bootstrap.servers", brokers)
            .set("enable.partition.eof", "false")
            .set("session.timeout.ms", "30000")
            .set("heartbeat.interval.ms", "3000")
            .set("enable.auto.commit", "false")  // Manual commit for exactly-once
            .set("auto.offset.reset", "latest")
            .set("fetch.min.bytes", "1024")
            .set("fetch.max.wait.ms", "100")
            .set("max.partition.fetch.bytes", "1048576")  // 1MB
            .set("receive.message.max.bytes", "10485760")  // 10MB
            .set("queued.min.messages", "100000")
            .set("queued.max.messages.kbytes", "65536")  // 64MB
            .set("batch.num.messages", "10000")
            .set("compression.codec", "snappy")
            .create()
            .map_err(|e| PipelineError::kafka(format!("Failed to create Kafka consumer: {}", e)))?;
        
        consumer.subscribe(&[&topic])
            .map_err(|e| PipelineError::kafka(format!("Failed to subscribe to topic {}: {}", topic, e)))?;
        
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Connected).await;
        
        let batch_size = 1000; // Default batch size
        let commit_interval = 5000; // Default commit interval in ms
        
        let mut batch_events = Vec::with_capacity(batch_size);
        let mut last_commit = std::time::Instant::now();
        let mut pending_messages = Vec::new();
        
        loop {
            tokio::select! {
                message_result = consumer.recv() => {
                    match message_result {
                        Ok(message) => {
                            if let Some(payload) = message.payload() {
                                let data = String::from_utf8_lossy(payload);
                                
                                let event = PipelineEvent {
                                    id: Uuid::new_v4(),
                                    timestamp: chrono::Utc::now(),
                                    source: source_name.to_string(),
                                    data: serde_json::json!({
                                        "raw_message": data.to_string(),
                                        "topic": topic,
                                        "partition": message.partition(),
                                        "offset": message.offset(),
                                        "protocol": "kafka"
                                    }),
                                    metadata: {
                                        let mut meta = HashMap::new();
                                        meta.insert("source_type".to_string(), "kafka".to_string());
                                        meta.insert("topic".to_string(), topic.to_string());
                                        meta.insert("partition".to_string(), message.partition().to_string());
                                        meta.insert("offset".to_string(), message.offset().to_string());
                                        meta.insert("bytes_received".to_string(), payload.len().to_string());
                                        meta
                                    },
                                    processing_stage: ProcessingStage::Ingested,
                                };
                                
                                batch_events.push(event);
                                pending_messages.push(message);
                                
                                // Process batch when full or commit interval reached
                                if batch_events.len() >= batch_size || 
                                   last_commit.elapsed().as_millis() >= commit_interval as u128 {
                                    
                                    // Send all events in batch
                                    let mut batch_bytes = 0u64;
                                    for event in batch_events.drain(..) {
                                        if let Some(bytes) = event.metadata.get("bytes_received")
                                            .and_then(|s| s.parse::<u64>().ok()) {
                                            batch_bytes += bytes;
                                        }
                                        
                                        if let Err(e) = event_tx.send(event) {
                                            error!("Failed to send Kafka event: {}", e);
                                            Self::increment_error_count(&stats, source_name).await;
                                        }
                                    }
                                    
                                    // Commit offsets for exactly-once delivery
                                    if !pending_messages.is_empty() {
                                        if let Some(last_message) = pending_messages.last() {
                                            if let Err(e) = consumer.commit_message(last_message, CommitMode::Async) {
                                                error!("Failed to commit Kafka offset: {}", e);
                                                Self::increment_error_count(&stats, source_name).await;
                                            } else {
                                                debug!("Committed batch of {} messages", pending_messages.len());
                                            }
                                        }
                                        pending_messages.clear();
                                    }
                                    
                                    Self::update_stats(&stats, source_name, batch_bytes).await;
                                    last_commit = std::time::Instant::now();
                                }
                            }
                        }
                        Err(e) => {
                            error!("Kafka receive error: {}", e);
                            Self::increment_error_count(&stats, source_name).await;
                        }
                    }
                }
                _ = shutdown_rx.recv() => {
                    info!("Shutting down Kafka source: {}", source_name);
                    
                    // Process remaining events in batch before shutdown
                    if !batch_events.is_empty() {
                        let mut batch_bytes = 0u64;
                        for event in batch_events.drain(..) {
                            if let Some(bytes) = event.metadata.get("bytes_received")
                                .and_then(|s| s.parse::<u64>().ok()) {
                                batch_bytes += bytes;
                            }
                            let _ = event_tx.send(event);
                        }
                        
                        // Final commit
                        if let Some(last_message) = pending_messages.last() {
                            let _ = consumer.commit_message(last_message, CommitMode::Sync);
                        }
                        
                        Self::update_stats(&stats, source_name, batch_bytes).await;
                    }
                    break;
                }
            }
        }
        
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Disconnected).await;
        Ok(())
    }
    
    async fn run_database_source(
        source_name: &str,
        config: &DataSource,
        event_tx: mpsc::UnboundedSender<PipelineEvent>,
        stats: Arc<RwLock<HashMap<String, IngestionStats>>>,
        mut shutdown_rx: mpsc::Receiver<()>,
    ) -> Result<()> {
        info!("Starting database source: {}", source_name);
        
        let connection_string = match &config.source_type {
            SourceType::Database { connection_string, .. } => connection_string.clone(),
            _ => return Err(PipelineError::configuration("Invalid source type for database source")),
        };
        // Database source implementation placeholder
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Connected).await;
        
        loop {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(60)) => {
                    // Database polling logic would go here
                    info!("Database source {} polling (not implemented)", source_name);
                }
                _ = shutdown_rx.recv() => {
                    info!("Shutting down database source: {}", source_name);
                    break;
                }
            }
        }
        
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Disconnected).await;
        Ok(())
    }
    
    async fn run_s3_source(
        source_name: &str,
        config: &DataSource,
        event_tx: mpsc::UnboundedSender<PipelineEvent>,
        stats: Arc<RwLock<HashMap<String, IngestionStats>>>,
        mut shutdown_rx: mpsc::Receiver<()>,
    ) -> Result<()> {
        info!("Starting S3 source: {}", source_name);
        
        let (bucket, prefix): (String, String) = match &config.source_type {
            SourceType::S3 { bucket, prefix, .. } => (bucket.clone(), prefix.clone()),
            _ => return Err(PipelineError::configuration("Invalid source type for S3 source")),
        };
        
        // S3 source implementation placeholder
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Connected).await;
        
        loop {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(300)) => {
                    // S3 polling logic would go here
                    info!("S3 source {} polling bucket {} (not implemented)", source_name, bucket);
                }
                _ = shutdown_rx.recv() => {
                    info!("Shutting down S3 source: {}", source_name);
                    break;
                }
            }
        }
        
        Self::update_connection_status(&stats, source_name, ConnectionStatus::Disconnected).await;
        Ok(())
    }
    

    
    async fn update_stats(stats: &Arc<RwLock<HashMap<String, IngestionStats>>>, source_name: &str, bytes: u64) {
        let mut stats_guard = stats.write().await;
        if let Some(source_stats) = stats_guard.get_mut(source_name) {
            source_stats.events_received += 1;
            source_stats.bytes_received += bytes;
            source_stats.last_event_time = Some(chrono::Utc::now());
        }
    }
    
    async fn increment_error_count(stats: &Arc<RwLock<HashMap<String, IngestionStats>>>, source_name: &str) {
        let mut stats_guard = stats.write().await;
        if let Some(source_stats) = stats_guard.get_mut(source_name) {
            source_stats.errors += 1;
        }
    }
    
    async fn update_connection_status(
        stats: &Arc<RwLock<HashMap<String, IngestionStats>>>,
        source_name: &str,
        status: ConnectionStatus,
    ) {
        let mut stats_guard = stats.write().await;
        if let Some(source_stats) = stats_guard.get_mut(source_name) {
            source_stats.connection_status = status;
        }
    }
    
    pub async fn get_stats(&self) -> HashMap<String, IngestionStats> {
        let stats_guard = self.stats.read().await;
        stats_guard.clone()
    }
    
    pub async fn get_health(&self) -> serde_json::Value {
        let stats = self.get_stats().await;
        
        let mut healthy_sources = 0;
        let mut total_sources = 0;
        let mut total_events = 0;
        let mut total_errors = 0;
        
        for source_stats in stats.values() {
            total_sources += 1;
            total_events += source_stats.events_received;
            total_errors += source_stats.errors;
            
            if matches!(source_stats.connection_status, ConnectionStatus::Connected) {
                healthy_sources += 1;
            }
        }
        
        let health_status = if healthy_sources == total_sources {
            "healthy"
        } else if healthy_sources > 0 {
            "degraded"
        } else {
            "unhealthy"
        };
        
        serde_json::json!({
            "status": health_status,
            "healthy_sources": healthy_sources,
            "total_sources": total_sources,
            "total_events_received": total_events,
            "total_errors": total_errors,
            "sources": stats
        })
    }
    
    pub async fn reload_config(&self, _new_config: &PipelineConfig) -> Result<()> {
        info!("Reloading ingestion configuration");
        // Implementation would restart sources with new configuration
        Ok(())
    }
    
    pub async fn shutdown(&self) -> Result<()> {
        info!("Shutting down ingestion manager");
        
        let active_sources = {
            let mut sources_guard = self.active_sources.write().await;
            std::mem::take(&mut *sources_guard)
        };
        
        for (source_name, handle) in active_sources {
            info!("Shutting down source: {}", source_name);
            
            if let Err(e) = handle.shutdown_tx.send(()).await {
                warn!("Failed to send shutdown signal to source {}: {}", source_name, e);
            }
            
            if let Err(e) = handle.task_handle.await {
                warn!("Source {} task failed during shutdown: {}", source_name, e);
            }
        }
        
        info!("Ingestion manager shutdown complete");
        Ok(())
    }
}