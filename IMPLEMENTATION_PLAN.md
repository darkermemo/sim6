# SIEM Unified Pipeline - High-Performance Streaming Architecture Implementation

## Overview

This document outlines the implementation plan for transforming the SIEM Unified Pipeline to support:
- **Event Flow:** Vector → Kafka → [Pipeline Processing] → Redis + ClickHouse → UI
- **Performance:** 500,000 events per second
- **Guarantees:** Exactly-once delivery
- **Real-time Streaming:** UI connects directly to Redis/Kafka with filtering support

## Current Architecture Analysis

### Existing Components
1. **Kafka Integration:** Already implemented in `ingestion.rs` with basic consumer support
2. **ClickHouse Storage:** Fully implemented in `storage.rs` with table creation and event storage
3. **Redis Dependencies:** Listed in `Cargo.toml` but not fully integrated for caching
4. **UI Streaming:** Uses EventSource (SSE) for real-time updates via `/events/stream` endpoint

### Required Modifications

## 1. Enhanced Kafka Integration

### 1.1 Kafka Producer for Output Stream
**File:** `src/storage.rs`

```rust
// Add Redis destination type to DestinationType enum
pub enum DestinationType {
    // ... existing types
    Redis {
        connection_string: String,
        key_pattern: String,
        ttl: Option<u64>,
    },
}

// Enhanced Kafka configuration for exactly-once delivery
async fn initialize_kafka_producer(&self, dest_name: &str, dest_config: &DataDestination) -> Result<()> {
    let brokers = dest_config.connection_string.as_deref()
        .ok_or_else(|| PipelineError::configuration("Kafka brokers not specified"))?;
    
    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("enable.idempotence", "true")  // Exactly-once semantics
        .set("acks", "all")                 // Wait for all replicas
        .set("retries", "2147483647")       // Infinite retries
        .set("max.in.flight.requests.per.connection", "5")
        .set("compression.type", "lz4")     // High performance compression
        .set("batch.size", "65536")        // 64KB batches
        .set("linger.ms", "5")             // Low latency
        .set("buffer.memory", "134217728")  // 128MB buffer
        .create()
        .map_err(|e| PipelineError::kafka(format!("Failed to create Kafka producer: {}", e)))?;
    
    // Store producer with destination name
    let mut producers_guard = self.kafka_producers.write().await;
    producers_guard.insert(dest_name.to_string(), producer);
    
    Ok(())
}
```

### 1.2 Kafka Consumer Enhancement
**File:** `src/ingestion.rs`

```rust
// Enhanced Kafka consumer for high throughput
async fn run_kafka_source_enhanced(
    source_name: &str,
    config: &DataSource,
    event_tx: mpsc::UnboundedSender<PipelineEvent>,
    stats: Arc<RwLock<HashMap<String, IngestionStats>>>,
    mut shutdown_rx: mpsc::Receiver<()>,
) -> Result<()> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("group.id", &format!("siem-pipeline-{}", source_name))
        .set("bootstrap.servers", brokers)
        .set("enable.auto.commit", "false")     // Manual commit for exactly-once
        .set("isolation.level", "read_committed") // Read only committed messages
        .set("fetch.min.bytes", "1048576")      // 1MB minimum fetch
        .set("fetch.max.wait.ms", "100")        // Low latency
        .set("max.partition.fetch.bytes", "10485760") // 10MB max per partition
        .create()
        .map_err(|e| PipelineError::kafka(format!("Failed to create Kafka consumer: {}", e)))?;
    
    // Batch processing for high throughput
    let mut batch = Vec::with_capacity(1000);
    let batch_timeout = Duration::from_millis(100);
    
    loop {
        tokio::select! {
            message_result = consumer.recv() => {
                match message_result {
                    Ok(message) => {
                        batch.push(message);
                        
                        // Process batch when full or timeout
                        if batch.len() >= 1000 {
                            process_kafka_batch(&batch, &event_tx, &stats, source_name).await?;
                            consumer.commit_consumer_state(CommitMode::Async)?;
                            batch.clear();
                        }
                    }
                    Err(e) => {
                        error!("Kafka receive error: {}", e);
                        Self::increment_error_count(&stats, source_name).await;
                    }
                }
            }
            _ = tokio::time::sleep(batch_timeout) => {
                if !batch.is_empty() {
                    process_kafka_batch(&batch, &event_tx, &stats, source_name).await?;
                    consumer.commit_consumer_state(CommitMode::Async)?;
                    batch.clear();
                }
            }
            _ = shutdown_rx.recv() => {
                info!("Shutting down Kafka source: {}", source_name);
                break;
            }
        }
    }
    
    Ok(())
}
```

## 2. Redis Cache Layer Implementation

### 2.1 Redis Backend
**File:** `src/storage.rs`

```rust
use redis::{Client as RedisClient, Commands, Connection};

pub struct RedisBackend {
    client: RedisClient,
    destination_name: String,
    key_pattern: String,
    ttl: Option<u64>,
}

impl RedisBackend {
    pub async fn new(dest_name: &str, dest_config: &DataDestination) -> Result<Self> {
        let connection_string = dest_config.connection_string.as_deref()
            .ok_or_else(|| PipelineError::configuration("Redis connection string not specified"))?;
        
        let client = RedisClient::open(connection_string)
            .map_err(|e| PipelineError::redis(format!("Failed to create Redis client: {}", e)))?;
        
        // Test connection
        let mut conn = client.get_connection()
            .map_err(|e| PipelineError::redis(format!("Redis connection failed: {}", e)))?;
        let _: String = redis::cmd("PING").query(&mut conn)
            .map_err(|e| PipelineError::redis(format!("Redis ping failed: {}", e)))?;
        
        let key_pattern = dest_config.parameters.get("key_pattern")
            .unwrap_or(&"siem:events:{timestamp}:{source}".to_string()).clone();
        
        let ttl = dest_config.parameters.get("ttl")
            .and_then(|t| t.parse().ok());
        
        Ok(Self {
            client,
            destination_name: dest_name.to_string(),
            key_pattern,
            ttl,
        })
    }
    
    pub async fn store_event(&self, event: &PipelineEvent) -> Result<()> {
        let mut conn = self.client.get_connection()
            .map_err(|e| PipelineError::redis(format!("Redis connection failed: {}", e)))?;
        
        // Generate Redis key
        let key = self.key_pattern
            .replace("{timestamp}", &event.timestamp.timestamp().to_string())
            .replace("{source}", &event.source)
            .replace("{id}", &event.id.to_string());
        
        // Serialize event
        let event_json = serde_json::to_string(event)
            .map_err(|e| PipelineError::serialization(format!("Failed to serialize event: {}", e)))?;
        
        // Store in Redis with optional TTL
        if let Some(ttl) = self.ttl {
            conn.set_ex(&key, &event_json, ttl)
                .map_err(|e| PipelineError::redis(format!("Redis SET with TTL failed: {}", e)))?;
        } else {
            conn.set(&key, &event_json)
                .map_err(|e| PipelineError::redis(format!("Redis SET failed: {}", e)))?;
        }
        
        // Add to real-time stream for UI
        let stream_key = format!("siem:stream:{}", event.source);
        conn.xadd(&stream_key, "*", &[("event", &event_json)])
            .map_err(|e| PipelineError::redis(format!("Redis XADD failed: {}", e)))?;
        
        // Trim stream to keep only recent events (last 10000)
        conn.xtrim(&stream_key, "MAXLEN", "~", 10000)
            .map_err(|e| PipelineError::redis(format!("Redis XTRIM failed: {}", e)))?;
        
        Ok(())
    }
}
```

## 3. Enhanced Pipeline Processing

### 3.1 Parallel Processing
**File:** `src/pipeline.rs`

```rust
// Enhanced process_events for high throughput
pub async fn process_events_parallel(&mut self) -> Result<()> {
    let (batch_tx, mut batch_rx) = mpsc::channel::<Vec<PipelineEvent>>(100);
    let batch_size = 1000;
    let mut current_batch = Vec::with_capacity(batch_size);
    
    // Spawn multiple processing workers
    let num_workers = num_cpus::get();
    for worker_id in 0..num_workers {
        let mut batch_rx_clone = batch_rx.clone();
        let transformation_manager = self.transformation_manager.clone();
        let routing_manager = self.routing_manager.clone();
        let storage_manager = self.storage_manager.clone();
        
        tokio::spawn(async move {
            while let Some(batch) = batch_rx_clone.recv().await {
                if let Err(e) = process_event_batch(
                    batch,
                    &transformation_manager,
                    &routing_manager,
                    &storage_manager,
                    worker_id
                ).await {
                    error!("Worker {} failed to process batch: {}", worker_id, e);
                }
            }
        });
    }
    
    // Main event collection loop
    loop {
        tokio::select! {
            Some(event) = self.event_rx.recv() => {
                current_batch.push(event);
                
                if current_batch.len() >= batch_size {
                    if let Err(e) = batch_tx.send(std::mem::take(&mut current_batch)).await {
                        error!("Failed to send batch to workers: {}", e);
                    }
                    current_batch = Vec::with_capacity(batch_size);
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(100)) => {
                if !current_batch.is_empty() {
                    if let Err(e) = batch_tx.send(std::mem::take(&mut current_batch)).await {
                        error!("Failed to send partial batch to workers: {}", e);
                    }
                    current_batch = Vec::with_capacity(batch_size);
                }
            }
            _ = self.shutdown_rx.recv() => {
                info!("Shutting down pipeline processing");
                break;
            }
        }
    }
    
    Ok(())
}
```

## 4. Real-time UI Streaming Enhancement

### 4.1 Redis Stream API
**File:** `siem_api/src/handlers.rs`

```rust
use redis::{Client as RedisClient, Commands, streams::StreamReadOptions};

// Enhanced real-time streaming with Redis
pub async fn events_stream_redis(
    Query(params): Query<EventStreamParams>,
    headers: HeaderMap,
    State(app_state): State<AppState>,
) -> impl IntoResponse {
    // Validate JWT token
    if let Err(response) = validate_jwt_token(&headers, &app_state.jwt_secret).await {
        return response;
    }
    
    let stream = async_stream::stream! {
        let redis_client = RedisClient::open("redis://127.0.0.1:6379")
            .expect("Failed to create Redis client");
        let mut conn = redis_client.get_connection()
            .expect("Failed to connect to Redis");
        
        let mut last_id = "0-0".to_string();
        let mut heartbeat_counter = 0;
        
        loop {
            // Build stream keys based on filters
            let stream_keys: Vec<String> = if let Some(source_filter) = &params.source {
                vec![format!("siem:stream:{}", source_filter)]
            } else {
                // Get all available streams
                let keys: Vec<String> = conn.keys("siem:stream:*")
                    .unwrap_or_default();
                keys
            };
            
            if stream_keys.is_empty() {
                // Send heartbeat
                yield Ok::<_, Infallible>(Event::default().data("heartbeat"));
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
            
            // Read from Redis streams
            let read_opts = StreamReadOptions::default()
                .count(100)
                .block(2000); // 2 second timeout
            
            let results: Result<Vec<(String, Vec<(String, Vec<(String, String)>)>)>, _> = 
                conn.xread_options(&stream_keys, &[&last_id], &read_opts);
            
            match results {
                Ok(streams) => {
                    let mut events_sent = 0;
                    
                    for (stream_key, entries) in streams {
                        for (entry_id, fields) in entries {
                            // Parse event from Redis stream
                            if let Some((_, event_json)) = fields.iter().find(|(k, _)| k == "event") {
                                if let Ok(event) = serde_json::from_str::<PipelineEvent>(event_json) {
                                    // Apply filters
                                    if apply_event_filters(&event, &params) {
                                        let event_data = serde_json::to_string(&event)
                                            .unwrap_or_else(|_| "{}".to_string());
                                        
                                        yield Ok(Event::default()
                                            .event("event")
                                            .data(event_data));
                                        
                                        events_sent += 1;
                                        last_id = entry_id;
                                    }
                                }
                            }
                        }
                    }
                    
                    if events_sent == 0 {
                        heartbeat_counter += 1;
                        if heartbeat_counter % 5 == 0 {
                            yield Ok(Event::default().data("heartbeat"));
                        }
                    } else {
                        heartbeat_counter = 0;
                    }
                }
                Err(_) => {
                    // Send heartbeat on error
                    yield Ok(Event::default().data("heartbeat"));
                }
            }
            
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    };
    
    Sse::new(stream)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(15)).text("keep-alive"))
}

fn apply_event_filters(event: &PipelineEvent, params: &EventStreamParams) -> bool {
    // Apply source filter
    if let Some(source_filter) = &params.source {
        if !event.source.contains(source_filter) {
            return false;
        }
    }
    
    // Apply severity filter
    if let Some(severity_filter) = &params.severity {
        if let Some(severity) = event.metadata.get("severity") {
            if severity != severity_filter {
                return false;
            }
        }
    }
    
    // Apply time range filter
    if let Some(start_time) = &params.start_time {
        if event.timestamp < *start_time {
            return false;
        }
    }
    
    if let Some(end_time) = &params.end_time {
        if event.timestamp > *end_time {
            return false;
        }
    }
    
    true
}
```

## 5. Configuration Updates

### 5.1 Enhanced Configuration
**File:** `config/pipeline.yaml`

```yaml
server:
  host: "0.0.0.0"
  port: 8080
  workers: 16  # Increased for high throughput
  max_connections: 10000
  request_timeout: 30
  enable_cors: true

sources:
  vector_kafka:
    source_type:
      type: "Kafka"
      topic: "siem-events"
      brokers: ["localhost:9092"]
    config:
      format: "Json"
      encoding: "utf-8"
    enabled: true
    batch_size: 1000  # High throughput batching
    buffer_size: 100000
    retry_attempts: 3
    retry_delay: 1000

destinations:
  clickhouse_primary:
    destination_type:
      type: "ClickHouse"
      connection_string: "http://localhost:8123"
      table: "siem_events"
      database: "siem"
    config:
      format: "Json"
    enabled: true
    batch_size: 1000
    flush_interval: 5000
    retry_attempts: 3
  
  redis_cache:
    destination_type:
      type: "Redis"
      connection_string: "redis://localhost:6379"
      key_pattern: "siem:events:{timestamp}:{source}"
      ttl: 3600  # 1 hour TTL
    config:
      format: "Json"
    enabled: true
    batch_size: 1000
    flush_interval: 1000
    retry_attempts: 3
  
  kafka_output:
    destination_type:
      type: "Kafka"
      topic: "siem-processed-events"
      brokers: ["localhost:9092"]
    config:
      format: "Json"
    enabled: true
    batch_size: 1000
    flush_interval: 1000
    retry_attempts: 3

routing:
  rules:
    - name: "all_events"
      condition: "true"
      destinations: ["clickhouse_primary", "redis_cache", "kafka_output"]
      priority: 1
      enabled: true
  default_destination: "clickhouse_primary"
  load_balancing: "RoundRobin"

storage:
  hot_storage:
    clickhouse_url: "http://localhost:8123"
    database: "siem"
    retention_days: 30
  data_lake:
    provider: "s3"
    bucket: "siem-data-lake"
    region: "us-east-1"
    access_key: "${AWS_ACCESS_KEY_ID}"
    secret_key: "${AWS_SECRET_ACCESS_KEY}"

metrics:
  enabled: true
  port: 9090
  path: "/metrics"
```

## 6. Vector Configuration

### 6.1 Vector Configuration Template
**File:** `config/vector.toml`

```toml
[api]
enabled = true
address = "127.0.0.1:8686"

# Sources - collect from various inputs
[sources.syslog]
type = "syslog"
address = "0.0.0.0:514"
mode = "udp"

[sources.file_logs]
type = "file"
includes = ["/var/log/**/*.log"]
read_from = "beginning"

[sources.beats]
type = "logstash"
address = "0.0.0.0:5044"

# Transforms - basic processing
[transforms.parse_json]
type = "remap"
inputs = ["syslog", "file_logs", "beats"]
source = '''
  # Parse JSON if possible
  if is_string(.message) {
    parsed = parse_json(.message) ?? {}
    . = merge(., parsed)
  }
  
  # Add metadata
  .pipeline_timestamp = now()
  .vector_source = .source_type
  
  # Ensure required fields
  .id = uuid_v4()
  .processing_stage = "ingested"
'''

[transforms.enrich]
type = "remap"
inputs = ["parse_json"]
source = '''
  # Add enrichment data
  .enriched_at = now()
  .hostname = get_hostname() ?? "unknown"
  
  # Normalize severity
  if exists(.severity) {
    .severity = downcase(string!(.severity))
  } else {
    .severity = "info"
  }
  
  # Extract source IP if available
  if exists(.source_ip) {
    .source_ip = string!(.source_ip)
  } else if exists(.host) {
    .source_ip = string!(.host)
  } else {
    .source_ip = "unknown"
  }
'''

# Sinks - output to Kafka
[sinks.kafka_output]
type = "kafka"
inputs = ["enrich"]
bootstrap_servers = "localhost:9092"
topic = "siem-events"
compression = "lz4"

# Kafka producer settings for exactly-once delivery
[sinks.kafka_output.encoding]
codec = "json"

[sinks.kafka_output.batch]
max_bytes = 1048576  # 1MB
max_events = 1000
timeout_secs = 5

# Exactly-once delivery configuration
[sinks.kafka_output.librdkafka_options]
"enable.idempotence" = "true"
"acks" = "all"
"retries" = "2147483647"
"max.in.flight.requests.per.connection" = "5"
"delivery.timeout.ms" = "300000"
"request.timeout.ms" = "30000"
"retry.backoff.ms" = "100"

# Buffer settings for high throughput
[sinks.kafka_output.buffer]
type = "memory"
max_events = 100000
when_full = "block"

# Health check
[sinks.kafka_output.healthcheck]
enabled = true
```

## 7. Performance Optimizations

### 7.1 System Tuning

```bash
# Kafka optimizations
echo 'vm.swappiness=1' >> /etc/sysctl.conf
echo 'vm.dirty_background_ratio=5' >> /etc/sysctl.conf
echo 'vm.dirty_ratio=60' >> /etc/sysctl.conf
echo 'vm.dirty_expire_centisecs=12000' >> /etc/sysctl.conf
echo 'net.core.rmem_default=262144' >> /etc/sysctl.conf
echo 'net.core.rmem_max=16777216' >> /etc/sysctl.conf
echo 'net.core.wmem_default=262144' >> /etc/sysctl.conf
echo 'net.core.wmem_max=16777216' >> /etc/sysctl.conf

# Apply settings
sysctl -p
```

### 7.2 Kafka Configuration

```properties
# server.properties
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600
num.partitions=16
default.replication.factor=3
min.insync.replicas=2
log.retention.hours=168
log.segment.bytes=1073741824
log.retention.check.interval.ms=300000
log.cleanup.policy=delete
compression.type=lz4
```

## 8. Monitoring and Metrics

### 8.1 Key Performance Indicators

1. **Throughput Metrics:**
   - Events per second ingested
   - Events per second processed
   - Events per second stored

2. **Latency Metrics:**
   - End-to-end processing latency
   - Kafka producer/consumer lag
   - Redis operation latency
   - ClickHouse insert latency

3. **Error Metrics:**
   - Failed event processing rate
   - Kafka connection errors
   - Redis connection errors
   - ClickHouse insert failures

4. **Resource Metrics:**
   - CPU utilization
   - Memory usage
   - Network I/O
   - Disk I/O

## 9. Testing Strategy

### 9.1 Load Testing

```bash
# Generate test events
kafka-producer-perf-test.sh \
  --topic siem-events \
  --num-records 1000000 \
  --record-size 1024 \
  --throughput 500000 \
  --producer-props bootstrap.servers=localhost:9092
```

### 9.2 Exactly-Once Delivery Testing

```bash
# Test idempotent producer
kafka-console-producer.sh \
  --topic siem-events \
  --bootstrap-server localhost:9092 \
  --producer-property enable.idempotence=true
```

## 10. Deployment Considerations

### 10.1 Resource Requirements

- **CPU:** 16+ cores for pipeline processing
- **Memory:** 32GB+ RAM for buffering and caching
- **Storage:** NVMe SSD for Kafka logs and ClickHouse data
- **Network:** 10Gbps+ for high throughput

### 10.2 Scaling Strategy

1. **Horizontal Scaling:**
   - Multiple pipeline instances
   - Kafka partition scaling
   - ClickHouse cluster scaling

2. **Vertical Scaling:**
   - Increase worker threads
   - Larger batch sizes
   - More memory for buffering

## Implementation Timeline

1. **Week 1:** Kafka integration enhancement and Redis backend implementation
2. **Week 2:** Pipeline processing optimization and parallel processing
3. **Week 3:** UI streaming enhancement and real-time filtering
4. **Week 4:** Performance testing and optimization
5. **Week 5:** Production deployment and monitoring setup

This implementation plan provides a comprehensive roadmap for achieving the high-performance streaming architecture with exactly-once delivery guarantees and real-time UI capabilities.