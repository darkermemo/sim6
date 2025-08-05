// Add to siem_consumer/src/main.rs or create a new module

use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::ClientConfig;
use serde::{Serialize, Deserialize};
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct DeadLetterMessage {
    pub original_topic: String,
    pub original_partition: i32,
    pub original_offset: i64,
    pub error_type: String,
    pub error_message: String,
    pub retry_count: u32,
    pub first_failure_timestamp: u32,
    pub last_failure_timestamp: u32,
    pub payload: String,
}

pub struct DeadLetterQueue {
    producer: FutureProducer,
    topic: String,
    max_retries: u32,
}

impl DeadLetterQueue {
    pub fn new(brokers: &str, dlq_topic: &str) -> Result<Self, ConsumerError> {
        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000")
            .create()
            .map_err(|e| ConsumerError::Config(format!("Failed to create DLQ producer: {}", e)))?;
        
        Ok(DeadLetterQueue {
            producer,
            topic: dlq_topic.to_string(),
            max_retries: 3,
        })
    }
    
    pub async fn send_to_dlq(
        &self,
        original_topic: &str,
        partition: i32,
        offset: i64,
        error_type: &str,
        error_message: &str,
        payload: &str,
        retry_count: u32,
    ) -> Result<(), ConsumerError> {
        let dlq_message = DeadLetterMessage {
            original_topic: original_topic.to_string(),
            original_partition: partition,
            original_offset: offset,
            error_type: error_type.to_string(),
            error_message: error_message.to_string(),
            retry_count,
            first_failure_timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as u32,
            last_failure_timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as u32,
            payload: payload.to_string(),
        };
        
        let dlq_payload = serde_json::to_string(&dlq_message)
            .map_err(|e| ConsumerError::Json(e))?;
        
        let record = FutureRecord::to(&self.topic)
            .payload(&dlq_payload)
            .key(&format!("{}:{}:{}", original_topic, partition, offset));
        
        match self.producer.send(record, Duration::from_secs(5)).await {
            Ok(_) => {
                info!("Sent message to DLQ: topic={}, partition={}, offset={}", 
                      original_topic, partition, offset);
                Ok(())
            }
            Err((e, _)) => {
                error!("Failed to send to DLQ: {}", e);
                Err(ConsumerError::Kafka(e))
            }
        }
    }
}

// Add these to your existing metrics
pub static DLQ_SENT: AtomicU64 = AtomicU64::new(0);
pub static SCHEMA_ERRORS: AtomicU64 = AtomicU64::new(0);
pub static PARSE_ERRORS: AtomicU64 = AtomicU64::new(0);
pub static VALIDATION_ERRORS: AtomicU64 = AtomicU64::new(0);
pub static CLICKHOUSE_ERRORS: AtomicU64 = AtomicU64::new(0);

// Updated process_message with DLQ support
async fn process_message_with_dlq(
    msg: &BorrowedMessage<'_>,
    log_source_cache: &LogSourceCache,
    taxonomy_cache: &TaxonomyCache,
    threat_intel_cache: &ThreatIntelCache,
    dlq: &DeadLetterQueue,
) -> Result<Event> {
    let payload = msg.payload().ok_or(ConsumerError::Config("Empty payload".to_string()))?;
    let payload_str = std::str::from_utf8(payload)
        .map_err(|e| ConsumerError::Config(format!("Invalid UTF-8: {}", e)))?;
    
    // Try to parse the message
    let kafka_msg: KafkaMessage = match serde_json::from_str(payload_str) {
        Ok(msg) => msg,
        Err(e) => {
            error!("Failed to deserialize Kafka message: {}", e);
            
            // Categorize the error
            let error_type = if e.to_string().contains("missing field") {
                SCHEMA_ERRORS.fetch_add(1, Ordering::Relaxed);
                "schema_error"
            } else if e.to_string().contains("invalid type") {
                PARSE_ERRORS.fetch_add(1, Ordering::Relaxed);
                "parse_error"
            } else {
                PARSE_ERRORS.fetch_add(1, Ordering::Relaxed);
                "unknown_parse_error"
            };
            
            // Send to DLQ
            if let Err(dlq_err) = dlq.send_to_dlq(
                msg.topic(),
                msg.partition(),
                msg.offset(),
                error_type,
                &e.to_string(),
                payload_str,
                0, // First failure
            ).await {
                error!("Failed to send to DLQ: {}", dlq_err);
            } else {
                DLQ_SENT.fetch_add(1, Ordering::Relaxed);
            }
            
            return Err(ConsumerError::Json(e));
        }
    };
    
    // Validate the message
    if kafka_msg.event_id.is_empty() {
        VALIDATION_ERRORS.fetch_add(1, Ordering::Relaxed);
        
        // Send validation errors to DLQ
        if let Err(dlq_err) = dlq.send_to_dlq(
            msg.topic(),
            msg.partition(),
            msg.offset(),
            "validation_error",
            "Missing event_id field",
            payload_str,
            0,
        ).await {
            error!("Failed to send to DLQ: {}", dlq_err);
        } else {
            DLQ_SENT.fetch_add(1, Ordering::Relaxed);
        }
        
        return Err(ConsumerError::Config("Missing event_id field".to_string()));
    }
    
    // Continue with normal processing...
    // (rest of your existing process_message logic)
    
    Ok(event)
}

// Enhanced metrics endpoint
async fn get_detailed_metrics() -> Json<serde_json::Value> {
    let total_errors = SCHEMA_ERRORS.load(Ordering::Relaxed) +
                      PARSE_ERRORS.load(Ordering::Relaxed) +
                      VALIDATION_ERRORS.load(Ordering::Relaxed) +
                      CLICKHOUSE_ERRORS.load(Ordering::Relaxed);
    
    let processed = PROCESSED.load(Ordering::Relaxed);
    let parsed = PARSED.load(Ordering::Relaxed);
    let error_rate = if processed > 0 {
        ((total_errors as f64) / (processed as f64)) * 100.0
    } else {
        0.0
    };
    
    Json(json!({
        "processed": processed,
        "parsed": parsed,
        "queued": QUEUED.load(Ordering::Relaxed),
        "errors": {
            "total": total_errors,
            "schema": SCHEMA_ERRORS.load(Ordering::Relaxed),
            "parse": PARSE_ERRORS.load(Ordering::Relaxed),
            "validation": VALIDATION_ERRORS.load(Ordering::Relaxed),
            "clickhouse": CLICKHOUSE_ERRORS.load(Ordering::Relaxed),
            "dlq_sent": DLQ_SENT.load(Ordering::Relaxed),
        },
        "rates": {
            "success_rate": if processed > 0 { 
                ((parsed as f64) / (processed as f64)) * 100.0 
            } else { 
                0.0 
            },
            "error_rate": error_rate,
        }
    }))
}

// DLQ Consumer for reprocessing failed messages
pub async fn consume_dlq(
    brokers: &str,
    dlq_topic: &str,
    max_retries: u32,
) -> Result<(), ConsumerError> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("group.id", "dlq-reprocessor")
        .set("bootstrap.servers", brokers)
        .set("enable.auto.commit", "true")
        .set("auto.offset.reset", "earliest")
        .create()
        .map_err(|e| ConsumerError::Config(format!("Failed to create DLQ consumer: {}", e)))?;
    
    consumer.subscribe(&[dlq_topic])
        .map_err(|e| ConsumerError::Kafka(e))?;
    
    info!("Started DLQ consumer for topic: {}", dlq_topic);
    
    loop {
        match consumer.recv().await {
            Ok(msg) => {
                if let Some(payload) = msg.payload() {
                    if let Ok(dlq_msg) = serde_json::from_slice::<DeadLetterMessage>(payload) {
                        if dlq_msg.retry_count < max_retries {
                            // Attempt to reprocess
                            info!("Reprocessing message from DLQ: {:?}", dlq_msg);
                            // TODO: Implement reprocessing logic
                        } else {
                            warn!("Message exceeded max retries: {:?}", dlq_msg);
                        }
                    }
                }
            }
            Err(e) => {
                error!("DLQ consumer error: {}", e);
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    }
}