#![allow(dead_code)]  // TODO: Remove when DLQ is integrated
use crate::errors::{ConsumerError, Result};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::ClientConfig;
use serde::{Serialize, Deserialize};
use std::time::Duration;
use log::{info, error};

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
    pub fn new(brokers: &str, dlq_topic: &str) -> Result<Self> {
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
    ) -> Result<()> {
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
        
        let key = format!("{}:{}:{}", original_topic, partition, offset);
        let record = FutureRecord::to(&self.topic)
            .payload(&dlq_payload)
            .key(&key);
        
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