use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn, error, debug};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use clickhouse::{Client as ClickHouseClient, Row};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::config::ClientConfig;
use redis::{Client as RedisClient, Commands};
use tokio::fs::OpenOptions;
use tokio::io::AsyncWriteExt;
use reqwest::Client as HttpClient;
use regex::Regex;

#[cfg(feature = "aws")]
use aws_sdk_s3::Client as S3Client;
#[cfg(feature = "aws")]
use aws_config::BehaviorVersion;

use crate::config::{PipelineConfig, DataDestination, DestinationType};
use crate::error::{Result, PipelineError};
use crate::pipeline::PipelineEvent;
use crate::routing::DestinationHealth;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStats {
    pub destination_name: String,
    pub events_stored: u64,
    pub bytes_stored: u64,
    pub errors: u64,
    pub last_storage_time: Option<DateTime<Utc>>,
    pub avg_storage_time_ms: f64,
    pub connection_status: ConnectionStatus,
    pub storage_rate_per_sec: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConnectionStatus {
    Connected,
    Disconnected,
    Connecting,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct SiemEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub source: String,
    pub source_type: String,
    pub severity: String,
    pub facility: String,
    pub hostname: String,
    pub process: String,
    pub message: String,
    pub raw_message: String,
    pub source_ip: String,
    pub source_port: u16,
    pub protocol: String,
    pub tags: Vec<String>,
    pub fields: String, // JSON string of additional fields
    pub processing_stage: String,
    pub created_at: DateTime<Utc>,
}

pub struct StorageManager {
    config: PipelineConfig,
    stats: Arc<RwLock<HashMap<String, StorageStats>>>,
    clickhouse_clients: Arc<RwLock<HashMap<String, ClickHouseClient>>>,
    kafka_producers: Arc<RwLock<HashMap<String, FutureProducer>>>,
    redis_clients: Arc<RwLock<HashMap<String, RedisClient>>>,
    file_handles: Arc<RwLock<HashMap<String, tokio::fs::File>>>,
    #[cfg(feature = "aws")]
    s3_clients: Arc<RwLock<HashMap<String, S3Client>>>,
    http_clients: Arc<RwLock<HashMap<String, HttpClient>>>,
}

#[async_trait::async_trait]
pub trait StorageBackend: Send + Sync {
    async fn store_event(&self, event: &PipelineEvent, destination: &DataDestination) -> Result<()>;
    async fn health_check(&self) -> Result<DestinationHealth>;
    async fn get_stats(&self) -> Result<StorageStats>;
    fn name(&self) -> &str;
}

pub struct ClickHouseBackend {
    client: ClickHouseClient,
    destination_name: String,
    table_name: String,
}

pub struct KafkaBackend {
    producer: FutureProducer,
    destination_name: String,
    topic: String,
}

pub struct FileBackend {
    file_path: String,
    destination_name: String,
}



impl StorageManager {
    pub async fn new(config: &PipelineConfig) -> Result<Self> {
        info!("Initializing storage manager");
        
        let manager = StorageManager {
            config: config.clone(),
            stats: Arc::new(RwLock::new(HashMap::new())),
            clickhouse_clients: Arc::new(RwLock::new(HashMap::new())),
            kafka_producers: Arc::new(RwLock::new(HashMap::new())),
            redis_clients: Arc::new(RwLock::new(HashMap::new())),
            file_handles: Arc::new(RwLock::new(HashMap::new())),
            #[cfg(feature = "aws")]
            s3_clients: Arc::new(RwLock::new(HashMap::new())),
            http_clients: Arc::new(RwLock::new(HashMap::new())),
        };
        
        // Initialize connections for each destination
        for (dest_name, dest_config) in &config.destinations {
            if dest_config.enabled {
                manager.initialize_destination(dest_name, dest_config).await?;
            }
        }
        
        Ok(manager)
    }
    
    async fn initialize_destination(&self, dest_name: &str, dest_config: &DataDestination) -> Result<()> {
        info!("Initializing destination: {} ({})", dest_name, dest_config.destination_type.to_string());
        
        // Initialize stats
        {
            let mut stats_guard = self.stats.write().await;
            stats_guard.insert(dest_name.to_string(), StorageStats {
                destination_name: dest_name.to_string(),
                events_stored: 0,
                bytes_stored: 0,
                errors: 0,
                last_storage_time: None,
                avg_storage_time_ms: 0.0,
                connection_status: ConnectionStatus::Connecting,
                storage_rate_per_sec: 0.0,
            });
        }
        
        match &dest_config.destination_type {
            DestinationType::ClickHouse { .. } => {
                self.initialize_clickhouse(dest_name, dest_config).await?
            }
            DestinationType::Kafka { .. } => {
                self.initialize_kafka(dest_name, dest_config).await?
            }
            DestinationType::Redis { .. } => {
                self.initialize_redis(dest_name, dest_config).await?
            }
            DestinationType::File { .. } => {
                self.initialize_file(dest_name, dest_config).await?
            }
            #[cfg(feature = "aws")]
            DestinationType::S3 { .. } => {
                self.initialize_s3(dest_name, dest_config).await?
            }
            DestinationType::Http { .. } => {
                self.initialize_http(dest_name, dest_config).await?
            }
            DestinationType::Custom { .. } => {
                // TODO: Implement custom destination initialization
                warn!("Custom destination type not yet implemented");
            }
        }
        
        // Update connection status
        self.update_connection_status(dest_name, ConnectionStatus::Connected).await;
        
        info!("Destination {} initialized successfully", dest_name);
        Ok(())
    }
    
    async fn initialize_clickhouse(&self, dest_name: &str, dest_config: &DataDestination) -> Result<()> {
        let (connection_string, database) = match &dest_config.destination_type {
            DestinationType::ClickHouse { connection_string, database, .. } => {
                (connection_string, database)
            }
            _ => return Err(PipelineError::configuration("Invalid destination type for ClickHouse")),
        };
        
        let client = ClickHouseClient::default()
            .with_url(connection_string)
            .with_database(database);
        
        // Test connection
        client.query("SELECT 1").execute().await
            .map_err(|e| PipelineError::database(format!("ClickHouse connection failed: {}", e)))?;
        
        // Create table if it doesn't exist
        let table_name = match &dest_config.destination_type {
            DestinationType::ClickHouse { table, .. } => table,
            _ => return Err(PipelineError::configuration("Invalid destination type for ClickHouse")),
        };
        self.create_clickhouse_table(&client, table_name).await?;
        
        {
            let mut clients_guard = self.clickhouse_clients.write().await;
            clients_guard.insert(dest_name.to_string(), client);
        }
        
        Ok(())
    }
    
    async fn create_clickhouse_table(&self, client: &ClickHouseClient, table_name: &str) -> Result<()> {
        // Validate table name to prevent SQL injection
        let validated_table_name = Self::validate_table_name(table_name)
            .map_err(|e| PipelineError::validation(format!("Invalid table name '{}': {}", table_name, e)))?;
        
        let create_table_sql = format!(
            r#"
            CREATE TABLE IF NOT EXISTS {} (
                id String,
                timestamp DateTime64(3),
                source String,
                source_type String,
                severity String,
                facility String,
                hostname String,
                process String,
                message String,
                raw_message String,
                source_ip String,
                source_port UInt16,
                protocol String,
                tags Array(String),
                fields String,
                processing_stage String,
                created_at DateTime64(3)
            ) ENGINE = MergeTree()
            PARTITION BY toYYYYMM(timestamp)
            ORDER BY (timestamp, source, severity)
            SETTINGS index_granularity = 8192
            "#,
            validated_table_name
        );
        
        client.query(&create_table_sql).execute().await
            .map_err(|e| PipelineError::database(format!("Failed to create ClickHouse table: {}", e)))?;
        
        info!("ClickHouse table '{}' created/verified", validated_table_name);
        Ok(())
    }
    
    /// Validate table name to prevent SQL injection
    fn validate_table_name(table_name: &str) -> Result<String> {
        // Only allow alphanumeric characters, underscores, and dots
        let valid_pattern = Regex::new(r"^[a-zA-Z0-9_\.]+$").unwrap();
        
        if table_name.is_empty() {
            return Err(PipelineError::validation("Table name cannot be empty".to_string()));
        }
        
        if table_name.len() > 64 {
            return Err(PipelineError::validation("Table name too long (max 64 characters)".to_string()));
        }
        
        if !valid_pattern.is_match(table_name) {
            return Err(PipelineError::validation("Table name contains invalid characters".to_string()));
        }
        
        // Prevent SQL keywords and dangerous patterns
        let dangerous_keywords = ["DROP", "DELETE", "INSERT", "UPDATE", "CREATE", "ALTER", "TRUNCATE"];
        let upper_table = table_name.to_uppercase();
        
        for keyword in &dangerous_keywords {
            if upper_table.contains(keyword) {
                return Err(PipelineError::validation("Table name contains dangerous SQL keyword".to_string()));
            }
        }
        
        Ok(table_name.to_string())
    }
    
    async fn initialize_kafka(&self, dest_name: &str, dest_config: &DataDestination) -> Result<()> {
        let brokers = match &dest_config.destination_type {
            DestinationType::Kafka { brokers, .. } => brokers.join(","),
            _ => return Err(PipelineError::configuration("Invalid destination type for Kafka")),
        };
        
        // Enhanced Kafka producer with exactly-once delivery guarantees
        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", &brokers)
            .set("enable.idempotence", "true")        // Exactly-once semantics
            .set("acks", "all")                       // Wait for all replicas
            .set("retries", "2147483647")             // Infinite retries
            .set("max.in.flight.requests.per.connection", "5")
            .set("compression.type", "lz4")           // High performance compression
            .set("batch.size", "65536")              // 64KB batches
            .set("linger.ms", "5")                   // Low latency
            .set("buffer.memory", "134217728")        // 128MB buffer
            .set("delivery.timeout.ms", "300000")     // 5 minute delivery timeout
            .set("request.timeout.ms", "30000")       // 30 second request timeout
            .set("retry.backoff.ms", "100")          // 100ms retry backoff
            .create()
            .map_err(|e| PipelineError::kafka(format!("Failed to create Kafka producer: {}", e)))?;
        
        {
            let mut producers_guard = self.kafka_producers.write().await;
            producers_guard.insert(dest_name.to_string(), producer);
        }
        
        Ok(())
    }
    
    async fn initialize_redis(&self, dest_name: &str, dest_config: &DataDestination) -> Result<()> {
        let connection_string = match &dest_config.destination_type {
            DestinationType::Redis { connection_string, .. } => connection_string,
            _ => return Err(PipelineError::configuration("Invalid destination type for Redis")),
        };
        
        let client = RedisClient::open(connection_string.as_str())
            .map_err(|e| PipelineError::configuration(format!("Failed to create Redis client: {}", e)))?;
        
        // Test connection
        let mut conn = client.get_connection()
            .map_err(|e| PipelineError::connection(format!("Redis connection failed: {}", e)))?;
        let _: String = redis::cmd("PING").query(&mut conn)
            .map_err(|e| PipelineError::connection(format!("Redis ping failed: {}", e)))?;
        
        {
            let mut clients_guard = self.redis_clients.write().await;
            clients_guard.insert(dest_name.to_string(), client);
        }
        
        info!("Redis client for '{}' initialized successfully", dest_name);
        Ok(())
    }
    
    async fn initialize_file(&self, dest_name: &str, dest_config: &DataDestination) -> Result<()> {
        let file_path = match &dest_config.destination_type {
            DestinationType::File { path, .. } => path,
            _ => return Err(PipelineError::configuration("Invalid destination type for File")),
        };
        
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(file_path)
            .await
            .map_err(|e| PipelineError::io(format!("Failed to open file {}: {}", file_path, e)))?;
        
        {
            let mut files_guard = self.file_handles.write().await;
            files_guard.insert(dest_name.to_string(), file);
        }
        
        Ok(())
    }
    

    
    pub async fn store_event(&self, event: &PipelineEvent, destination: &str) -> Result<()> {
        let start_time = std::time::Instant::now();
        
        debug!("Storing event {} to destination: {}", event.id, destination);
        
        let dest_config = self.config.destinations.get(destination)
            .ok_or_else(|| PipelineError::not_found(format!("Destination '{}' not found", destination)))?;
        
        if !dest_config.enabled {
            return Err(PipelineError::bad_request(format!("Destination '{}' is disabled", destination)));
        }
        
        let result = match &dest_config.destination_type {
            DestinationType::ClickHouse { .. } => {
                self.store_to_clickhouse(event, destination, dest_config).await
            }
            DestinationType::Kafka { .. } => {
                self.store_to_kafka(event, destination, dest_config).await
            }
            DestinationType::Redis { .. } => {
                self.store_to_redis(event, destination, dest_config).await
            }
            DestinationType::File { .. } => {
                self.store_to_file(event, destination, dest_config).await
            }
            DestinationType::S3 { .. } => {
                self.store_to_s3(event, destination, dest_config).await
            }
            DestinationType::Http { .. } => {
                self.store_to_http(event, destination, dest_config).await
            }
            DestinationType::Custom { .. } => {
                // TODO: Implement custom storage
                Err(PipelineError::internal("Custom storage not yet implemented"))
            }
        };
        
        let storage_time = start_time.elapsed().as_millis() as f64;
        
        match result {
            Ok(bytes_stored) => {
                self.update_storage_stats(destination, bytes_stored, storage_time).await;
                debug!("Event {} stored successfully to {} in {:.2}ms", 
                       event.id, destination, storage_time);
                Ok(())
            }
            Err(e) => {
                error!("Failed to store event {} to {}: {}", event.id, destination, e);
                self.increment_error_count(destination).await;
                Err(e)
            }
        }
    }
    
    async fn store_to_clickhouse(&self, event: &PipelineEvent, destination: &str, dest_config: &DataDestination) -> Result<u64> {
        let clients_guard = self.clickhouse_clients.read().await;
        let client = clients_guard.get(destination)
            .ok_or_else(|| PipelineError::not_found(format!("ClickHouse client for '{}' not found", destination)))?;
        
        let table_name = match &dest_config.destination_type {
            DestinationType::ClickHouse { table, .. } => table,
            _ => return Err(PipelineError::configuration("Invalid destination type for ClickHouse")),
        };
        
        // Convert PipelineEvent to SiemEvent
        let siem_event = self.convert_to_siem_event(event)?;
        
        let mut insert = client.insert(table_name)?;
        insert.write(&siem_event).await
            .map_err(|e| PipelineError::database(format!("ClickHouse insert failed: {}", e)))?;
        insert.end().await
            .map_err(|e| PipelineError::database(format!("ClickHouse insert commit failed: {}", e)))?;
        
        // Estimate bytes stored (rough calculation)
        let bytes_stored = siem_event.message.len() + siem_event.raw_message.len() + 200; // Approximate overhead
        
        Ok(bytes_stored as u64)
    }
    
    async fn store_to_kafka(&self, event: &PipelineEvent, destination: &str, dest_config: &DataDestination) -> Result<u64> {
        let producers_guard = self.kafka_producers.read().await;
        let producer = producers_guard.get(destination)
            .ok_or_else(|| PipelineError::not_found(format!("Kafka producer for '{}' not found", destination)))?;
        
        let topic = match &dest_config.destination_type {
            DestinationType::Kafka { topic, .. } => topic,
            _ => return Err(PipelineError::configuration("Invalid destination type for Kafka")),
        };
        
        // Serialize event to JSON
        let event_json = serde_json::to_string(event)
            .map_err(|e| PipelineError::serialization(format!("Failed to serialize event: {}", e)))?;
        
        let event_id = event.id.to_string();
        let record = FutureRecord::to(topic)
            .key(&event_id)
            .payload(&event_json);
        
        producer.send(record, tokio::time::Duration::from_secs(5)).await
            .map_err(|e| PipelineError::kafka(format!("Kafka send failed: {:?}", e)))?;
        
        Ok(event_json.len() as u64)
    }
    
    async fn store_to_redis(&self, event: &PipelineEvent, destination: &str, dest_config: &DataDestination) -> Result<u64> {
        let clients_guard = self.redis_clients.read().await;
        let client = clients_guard.get(destination)
            .ok_or_else(|| PipelineError::not_found(format!("Redis client for '{}' not found", destination)))?;
        
        let mut conn = client.get_connection()
            .map_err(|e| PipelineError::connection(format!("Redis connection failed: {}", e)))?;
        
        // Get configuration parameters from Redis destination type
        let (key_pattern, ttl) = match &dest_config.destination_type {
            DestinationType::Redis { key_pattern, ttl, .. } => (key_pattern.as_str(), *ttl),
            _ => return Err(PipelineError::configuration("Invalid destination type for Redis")),
        };
        
        // Generate Redis key
        let event_id = event.id.to_string();
        let timestamp_str = event.timestamp.timestamp().to_string();
        let key = key_pattern
            .replace("{timestamp}", &timestamp_str)
            .replace("{source}", &event.source)
            .replace("{id}", &event_id);
        
        // Serialize event
        let event_json = serde_json::to_string(event)
            .map_err(|e| PipelineError::serialization(format!("Failed to serialize event: {}", e)))?;
        
        // Store in Redis with optional TTL
        if let Some(ttl_seconds) = ttl {
            conn.set_ex::<_, _, ()>(&key, &event_json, ttl_seconds)
                .map_err(|e| PipelineError::connection(format!("Redis SET with TTL failed: {}", e)))?;
        } else {
            conn.set::<_, _, ()>(&key, &event_json)
                .map_err(|e| PipelineError::connection(format!("Redis SET failed: {}", e)))?;
        }
        
        // Add to real-time stream for UI
        let stream_key = format!("siem:stream:{}", event.source);
        conn.xadd::<_, _, _, _, ()>(&stream_key, "*", &[("event", &event_json)])
            .map_err(|e| PipelineError::connection(format!("Redis XADD failed: {}", e)))?;
        
        // Trim stream to keep only recent events (last 10000)
        let _: std::result::Result<i32, redis::RedisError> = conn.xtrim(&stream_key, redis::streams::StreamMaxlen::Approx(10000));
        
        debug!("Event {} stored to Redis with key: {}", event.id, key);
        Ok(event_json.len() as u64)
    }
    
    async fn store_to_file(&self, event: &PipelineEvent, destination: &str, _dest_config: &DataDestination) -> Result<u64> {
        let mut files_guard = self.file_handles.write().await;
        let file = files_guard.get_mut(destination)
            .ok_or_else(|| PipelineError::not_found(format!("File handle for '{}' not found", destination)))?;
        
        // Serialize event to JSON and write to file
        let event_json = serde_json::to_string(event)
            .map_err(|e| PipelineError::serialization(format!("Failed to serialize event: {}", e)))?;
        
        let line = format!("{}\n", event_json);
        file.write_all(line.as_bytes()).await
            .map_err(|e| PipelineError::io(format!("Failed to write to file: {}", e)))?;
        
        file.flush().await
            .map_err(|e| PipelineError::io(format!("Failed to flush file: {}", e)))?;
        
        Ok(line.len() as u64)
    }

    #[cfg(feature = "aws")]
    async fn initialize_s3(&self, dest_name: &str, dest_config: &DataDestination) -> Result<()> {
        info!("Initializing S3 destination: {}", dest_name);
        
        let config = aws_config::defaults(BehaviorVersion::latest()).load().await;
        let client = S3Client::new(&config);
        
        // Test connection by listing buckets (or attempting to access the specified bucket)
        if let DestinationType::S3 { bucket, .. } = &dest_config.destination_type {
            match client.head_bucket().bucket(bucket).send().await {
                Ok(_) => {
                    info!("S3 bucket '{}' is accessible", bucket);
                    self.update_connection_status(dest_name, ConnectionStatus::Connected).await;
                }
                Err(e) => {
                    warn!("S3 bucket '{}' access test failed: {}", bucket, e);
                    self.update_connection_status(dest_name, ConnectionStatus::Error(e.to_string())).await;
                }
            }
        }
        
        let mut clients_guard = self.s3_clients.write().await;
        clients_guard.insert(dest_name.to_string(), client);
        
        Ok(())
    }

    async fn initialize_http(&self, dest_name: &str, dest_config: &DataDestination) -> Result<()> {
        info!("Initializing HTTP destination: {}", dest_name);
        
        let client = HttpClient::new();
        
        // Test connection by making a HEAD request to the endpoint
        if let DestinationType::Http { endpoint, .. } = &dest_config.destination_type {
            match client.head(endpoint).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        info!("HTTP endpoint '{}' is accessible", endpoint);
                        self.update_connection_status(dest_name, ConnectionStatus::Connected).await;
                    } else {
                        warn!("HTTP endpoint '{}' returned status: {}", endpoint, response.status());
                        self.update_connection_status(dest_name, ConnectionStatus::Error(format!("HTTP {}", response.status()))).await;
                    }
                }
                Err(e) => {
                    warn!("HTTP endpoint '{}' connection test failed: {}", endpoint, e);
                    self.update_connection_status(dest_name, ConnectionStatus::Error(e.to_string())).await;
                }
            }
        }
        
        let mut clients_guard = self.http_clients.write().await;
        clients_guard.insert(dest_name.to_string(), client);
        
        Ok(())
    }

    #[cfg(feature = "aws")]
    async fn store_to_s3(&self, event: &PipelineEvent, destination: &str, dest_config: &DataDestination) -> Result<u64> {
        let clients_guard = self.s3_clients.read().await;
        let client = clients_guard.get(destination)
            .ok_or_else(|| PipelineError::not_found(format!("S3 client for '{}' not found", destination)))?;
        
        let (bucket, key_prefix) = match &dest_config.destination_type {
            DestinationType::S3 { bucket, prefix, .. } => (bucket, prefix.as_str()),
            _ => return Err(PipelineError::configuration("Invalid destination type for S3")),
        };
        
        // Convert event to JSON
        let event_json = serde_json::to_string(&event)
            .map_err(|e| PipelineError::serialization(format!("Failed to serialize event: {}", e)))?;
        
        // Generate S3 key with timestamp and event ID
        let timestamp = event.timestamp.format("%Y/%m/%d/%H");
        let key = format!("{}/{}/{}.json", key_prefix, timestamp, event.id);
        
        // Upload to S3
        client.put_object()
            .bucket(bucket)
            .key(&key)
            .body(aws_sdk_s3::primitives::ByteStream::from(event_json.clone().into_bytes()))
            .content_type("application/json")
            .send()
            .await
            .map_err(|e| PipelineError::storage(format!("S3 upload failed: {}", e)))?;
        
        debug!("Event {} stored to S3 bucket '{}' with key '{}'", event.id, bucket, key);
        
        Ok(event_json.len() as u64)
    }

    async fn store_to_http(&self, event: &PipelineEvent, destination: &str, dest_config: &DataDestination) -> Result<u64> {
        let clients_guard = self.http_clients.read().await;
        let client = clients_guard.get(destination)
            .ok_or_else(|| PipelineError::not_found(format!("HTTP client for '{}' not found", destination)))?;
        
        let (endpoint_url, method, headers) = match &dest_config.destination_type {
            DestinationType::Http { endpoint, method, headers, .. } => {
                (endpoint, method.as_str(), headers)
            }
            _ => return Err(PipelineError::configuration("Invalid destination type for HTTP")),
        };
        
        // Convert event to JSON
        let event_json = serde_json::to_string(&event)
            .map_err(|e| PipelineError::serialization(format!("Failed to serialize event: {}", e)))?;
        
        // Build HTTP request
        let mut request = match method.to_uppercase().as_str() {
            "POST" => client.post(endpoint_url),
            "PUT" => client.put(endpoint_url),
            "PATCH" => client.patch(endpoint_url),
            _ => return Err(PipelineError::configuration(format!("Unsupported HTTP method: {}", method))),
        };
        
        // Add headers if specified
        for (key, value) in headers {
            request = request.header(key, value);
        }
        
        // Set content type and send request
        let response = request
            .header("Content-Type", "application/json")
            .body(event_json.clone())
            .send()
            .await
            .map_err(|e| PipelineError::http(format!("HTTP request failed: {}", e)))?;
        
        if !response.status().is_success() {
            return Err(PipelineError::storage(format!(
                "HTTP endpoint returned error status: {} - {}", 
                response.status(),
                response.text().await.unwrap_or_default()
            )));
        }
        
        debug!("Event {} sent to HTTP endpoint '{}' with status {}", event.id, endpoint_url, response.status());
        
        Ok(event_json.len() as u64)
    }

    fn convert_to_siem_event(&self, event: &PipelineEvent) -> Result<SiemEvent> {
        let source_ip = event.metadata.get("source_ip").unwrap_or(&"0.0.0.0".to_string()).clone();
        let source_port: u16 = event.metadata.get("source_port")
            .and_then(|p| p.parse().ok())
            .unwrap_or(0);
        
        let protocol = event.data.get("protocol")
            .and_then(|p| p.as_str())
            .unwrap_or("unknown")
            .to_string();
        
        let raw_message = event.data.get("raw_message")
            .and_then(|m| m.as_str())
            .unwrap_or("")
            .to_string();
        
        let fields_json = serde_json::to_string(&event.data)
            .map_err(|e| PipelineError::serialization(format!("Failed to serialize fields: {}", e)))?;
        
        Ok(SiemEvent {
            id: event.id.to_string(),
            timestamp: event.timestamp,
            source: event.source.clone(),
            source_type: event.metadata.get("source_type").unwrap_or(&"unknown".to_string()).clone(),
            severity: "info".to_string(), // Would be extracted from parsed data
            facility: "user".to_string(), // Would be extracted from parsed data
            hostname: "unknown".to_string(), // Would be extracted from parsed data
            process: "unknown".to_string(), // Would be extracted from parsed data
            message: raw_message.clone(),
            raw_message,
            source_ip,
            source_port,
            protocol,
            tags: vec![], // Would be populated from routing or enrichment
            fields: fields_json,
            processing_stage: format!("{:?}", event.processing_stage),
            created_at: Utc::now(),
        })
    }
    

    
    async fn update_storage_stats(&self, destination: &str, bytes_stored: u64, storage_time_ms: f64) {
        let mut stats_guard = self.stats.write().await;
        if let Some(stats) = stats_guard.get_mut(destination) {
            stats.events_stored += 1;
            stats.bytes_stored += bytes_stored;
            stats.last_storage_time = Some(Utc::now());
            
            // Update moving average of storage time
            if stats.avg_storage_time_ms == 0.0 {
                stats.avg_storage_time_ms = storage_time_ms;
            } else {
                stats.avg_storage_time_ms = (stats.avg_storage_time_ms + storage_time_ms) / 2.0;
            }
        }
    }
    
    async fn increment_error_count(&self, destination: &str) {
        let mut stats_guard = self.stats.write().await;
        if let Some(stats) = stats_guard.get_mut(destination) {
            stats.errors += 1;
        }
    }
    
    async fn update_connection_status(&self, destination: &str, status: ConnectionStatus) {
        let mut stats_guard = self.stats.write().await;
        if let Some(stats) = stats_guard.get_mut(destination) {
            stats.connection_status = status;
        }
    }
    
    pub async fn get_stats(&self) -> HashMap<String, StorageStats> {
        let stats_guard = self.stats.read().await;
        stats_guard.clone()
    }
    
    pub async fn get_health(&self) -> serde_json::Value {
        let stats = self.get_stats().await;
        
        let mut total_stored = 0;
        let mut total_errors = 0;
        let mut healthy_destinations = 0;
        let mut total_destinations = 0;
        let mut avg_storage_time = 0.0;
        
        for dest_stats in stats.values() {
            total_destinations += 1;
            total_stored += dest_stats.events_stored;
            total_errors += dest_stats.errors;
            avg_storage_time += dest_stats.avg_storage_time_ms;
            
            if matches!(dest_stats.connection_status, ConnectionStatus::Connected) {
                healthy_destinations += 1;
            }
        }
        
        if total_destinations > 0 {
            avg_storage_time /= total_destinations as f64;
        }
        
        let error_rate = if total_stored > 0 {
            total_errors as f64 / total_stored as f64
        } else {
            0.0
        };
        
        let health_status = if healthy_destinations == total_destinations && error_rate < 0.05 {
            "healthy"
        } else if healthy_destinations > 0 && error_rate < 0.20 {
            "degraded"
        } else {
            "unhealthy"
        };
        
        serde_json::json!({
            "status": health_status,
            "total_stored": total_stored,
            "total_errors": total_errors,
            "error_rate": error_rate,
            "healthy_destinations": healthy_destinations,
            "total_destinations": total_destinations,
            "avg_storage_time_ms": avg_storage_time,
            "destinations": stats
        })
    }
    
    pub async fn search_events(
        &self,
        search_query: &crate::models::SearchQuery,
    ) -> Result<crate::models::SearchResult<crate::models::Event>> {
        let query_start = std::time::Instant::now();
        info!("Searching events with ClickHouse query: {:?}", search_query);
        // Get the first available ClickHouse client
        let clients_guard = self.clickhouse_clients.read().await;
        let client = clients_guard.values().next()
            .ok_or_else(|| PipelineError::not_found("No ClickHouse client available".to_string()))?;
        
        // Build the ClickHouse query
        let mut query = "SELECT * FROM events WHERE 1=1".to_string();
        let mut count_query = "SELECT COUNT(*) FROM events WHERE 1=1".to_string();
        
        // Add time range filter
        query.push_str(&format!(" AND timestamp >= '{}'", search_query.time_range.start.format("%Y-%m-%d %H:%M:%S")));
        query.push_str(&format!(" AND timestamp <= '{}'", search_query.time_range.end.format("%Y-%m-%d %H:%M:%S")));
        count_query.push_str(&format!(" AND timestamp >= '{}'", search_query.time_range.start.format("%Y-%m-%d %H:%M:%S")));
        count_query.push_str(&format!(" AND timestamp <= '{}'", search_query.time_range.end.format("%Y-%m-%d %H:%M:%S")));
        
        // Add filters
        for (field, value) in &search_query.filters {
            if let Some(val) = value.as_str() {
                match field.as_str() {
                    "source" | "source_type" | "severity" | "hostname" => {
                        query.push_str(&format!(" AND {} = '{}'", field, val));
                        count_query.push_str(&format!(" AND {} = '{}'", field, val));
                    }
                    _ => {}
                }
            }
        }
        
        // Add text search
        if !search_query.query.is_empty() {
            query.push_str(&format!(" AND (message LIKE '%{}%' OR raw_message LIKE '%{}%')", search_query.query, search_query.query));
            count_query.push_str(&format!(" AND (message LIKE '%{}%' OR raw_message LIKE '%{}%')", search_query.query, search_query.query));
        }
        
        // Add sorting
        if let Some(sort_field) = &search_query.sort_by {
            let order = match search_query.sort_order {
                crate::models::SortOrder::Asc => "ASC",
                crate::models::SortOrder::Desc => "DESC",
            };
            query.push_str(&format!(" ORDER BY {} {}", sort_field, order));
        } else {
            query.push_str(" ORDER BY timestamp DESC");
        }
        
        // Add pagination
        query.push_str(&format!(" LIMIT {} OFFSET {}", search_query.limit, search_query.offset));
        
        // Execute count query
        let total_count: u64 = client.query(&count_query)
            .fetch_one::<u64>()
            .await
            .map_err(|e| PipelineError::database(format!("Failed to execute count query: {}", e)))?;
        
        // Execute main query
        let siem_events: Vec<SiemEvent> = client.query(&query)
            .fetch_all::<SiemEvent>()
            .await
            .map_err(|e| PipelineError::database(format!("Failed to execute search query: {}", e)))?;
        
        // Convert SiemEvent to Event
        let events: Vec<crate::models::Event> = siem_events.into_iter().map(|siem_event| {
            crate::models::Event {
                id: uuid::Uuid::parse_str(&siem_event.id).unwrap_or_else(|_| uuid::Uuid::new_v4()),
                timestamp: siem_event.timestamp,
                source: siem_event.source,
                source_type: siem_event.source_type,
                severity: siem_event.severity,
                facility: siem_event.facility,
                hostname: siem_event.hostname,
                process: siem_event.process,
                message: siem_event.message,
                raw_message: siem_event.raw_message,
                source_ip: siem_event.source_ip,
                source_port: siem_event.source_port as i32, // Convert u16 to i32
                protocol: siem_event.protocol,
                tags: siem_event.tags,
                fields: serde_json::from_str(&siem_event.fields).unwrap_or_default(),
                processing_stage: siem_event.processing_stage,
                created_at: siem_event.created_at,
                updated_at: siem_event.created_at, // Use created_at as default for updated_at
            }
        }).collect();
        
        let current_page = (search_query.offset / search_query.limit) + 1;
        let total_pages = (total_count as f64 / search_query.limit as f64).ceil() as u32;
        
        Ok(crate::models::SearchResult {
            items: events,
            total_count: total_count as i64,
            page_info: crate::models::PageInfo {
                current_page,
                total_pages,
                page_size: search_query.limit,
                has_next: current_page < total_pages,
                has_previous: search_query.offset > 0,
            },
            aggregations: None,
            query_time_ms: query_start.elapsed().as_millis() as f64,
        })
    }
    
    pub async fn reload_config(&self, new_config: &PipelineConfig) -> Result<()> {
        info!("Reloading storage configuration");
        // Implementation would reinitialize connections with new configuration
        Ok(())
    }
    
    pub async fn shutdown(&self) -> Result<()> {
        info!("Shutting down storage manager");
        
        // Close file handles
        {
            let mut files_guard = self.file_handles.write().await;
            for (dest_name, mut file) in files_guard.drain() {
                if let Err(e) = file.flush().await {
                    warn!("Failed to flush file for destination {}: {}", dest_name, e);
                }
            }
        }
        
        info!("Storage manager shutdown complete");
        Ok(())
    }
}

impl DestinationType {
    pub fn to_string(&self) -> &'static str {
        match self {
            DestinationType::ClickHouse { .. } => "clickhouse",
            DestinationType::Kafka { .. } => "kafka",
            DestinationType::Redis { .. } => "redis",
            DestinationType::S3 { .. } => "s3",
            DestinationType::File { .. } => "file",
            DestinationType::Http { .. } => "http",
            DestinationType::Custom { .. } => "custom",
        }
    }
}