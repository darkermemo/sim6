use std::sync::Arc;
use std::time::Duration;
use tokio::time::{sleep, timeout};
use serde_json::Value;
// use chrono::Utc;
use rdkafka::{
    config::RDKafkaLogLevel,
    consumer::{CommitMode, Consumer, StreamConsumer},
    message::{BorrowedMessage, Message},
    ClientConfig, Offset, TopicPartitionList,
};
use rdkafka::consumer::ConsumerContext;
use rdkafka::client::ClientContext;
// use rdkafka::error::KafkaResult;

use crate::v2::{state::AppState, models::SiemEvent, metrics};
use crate::error::{Result, PipelineError};

// Simple consumer context
struct CustomContext;

impl ClientContext for CustomContext {}

impl ConsumerContext for CustomContext {
    fn pre_rebalance(&self, rebalance: &rdkafka::consumer::Rebalance) {
        tracing::info!("Pre-rebalance: {:?}", rebalance);
        metrics::inc_v2_kafka_rebalances_total();
    }

    fn post_rebalance(&self, rebalance: &rdkafka::consumer::Rebalance) {
        tracing::info!("Post-rebalance: {:?}", rebalance);
    }
}

type LoggingConsumer = StreamConsumer<CustomContext>;

pub struct KafkaConsumerWorker {
    state: Arc<AppState>,
    consumer: LoggingConsumer,
    topic: String,
    max_batch: usize,
    #[allow(dead_code)]
    max_inflight: usize,
}

impl KafkaConsumerWorker {
    pub fn new(state: Arc<AppState>) -> Result<Self> {
        let brokers = std::env::var("KAFKA_BROKERS")
            .unwrap_or_else(|_| "localhost:9092".to_string());
        let topic = std::env::var("KAFKA_TOPIC")
            .unwrap_or_else(|_| "siem.events.v1".to_string());
        let group_id = std::env::var("KAFKA_GROUP_ID")
            .unwrap_or_else(|_| "siem-v2".to_string());
        let max_batch = std::env::var("KAFKA_MAX_BATCH")
            .unwrap_or_else(|_| "1000".to_string())
            .parse::<usize>()
            .unwrap_or(1000);
        let max_inflight = std::env::var("KAFKA_MAX_INFLIGHT")
            .unwrap_or_else(|_| "64".to_string())
            .parse::<usize>()
            .unwrap_or(64);

        let context = CustomContext;
        
        let consumer: LoggingConsumer = ClientConfig::new()
            .set("group.id", &group_id)
            .set("bootstrap.servers", &brokers)
            .set("enable.auto.commit", "false")
            .set("auto.offset.reset", "earliest")
            .set("session.timeout.ms", "6000")
            .set("max.poll.interval.ms", "300000")
            .set_log_level(RDKafkaLogLevel::Debug)
            .create_with_context(context)
            .map_err(|e| PipelineError::config(format!("Failed to create Kafka consumer: {}", e)))?;

        consumer
            .subscribe(&[&topic])
            .map_err(|e| PipelineError::config(format!("Failed to subscribe to topic: {}", e)))?;

        tracing::info!(
            "Kafka consumer initialized: brokers={}, topic={}, group={}",
            brokers, topic, group_id
        );

        Ok(Self {
            state,
            consumer,
            topic,
            max_batch,
            max_inflight,
        })
    }

    pub async fn run(&mut self) -> Result<()> {
        let mut batch = Vec::new();
        let mut tpl = TopicPartitionList::new();
        
        loop {
            match self.consumer.recv().await {
                Ok(msg) => {
                    if let Err(e) = self.process_message(&msg, &mut batch, &mut tpl).await {
                        tracing::error!("Error processing message: {}", e);
                        // Don't commit on error
                    }
                    
                    // Flush batch if full
                    if batch.len() >= self.max_batch {
                        self.flush_batch(&mut batch, &mut tpl).await?;
                    }
                }
                Err(e) => {
                    tracing::error!("Kafka consumer error: {}", e);
                    sleep(Duration::from_secs(1)).await;
                }
            }
            
            // Periodic flush
            if !batch.is_empty() {
                // Use timeout to avoid blocking forever
                match timeout(Duration::from_secs(2), async {
                    self.flush_batch(&mut batch, &mut tpl).await
                }).await {
                    Ok(Ok(_)) => {},
                    Ok(Err(e)) => tracing::error!("Flush error: {}", e),
                    Err(_) => tracing::warn!("Flush timeout"),
                }
            }
        }
    }

    async fn process_message(
        &self,
        msg: &BorrowedMessage<'_>,
        batch: &mut Vec<SiemEvent>,
        tpl: &mut TopicPartitionList,
    ) -> Result<()> {
        let payload = msg.payload()
            .ok_or_else(|| PipelineError::parsing("Empty Kafka message"))?;
        
        let value: Value = match serde_json::from_slice(payload) {
            Ok(v) => v,
            Err(e) => {
                // Send to DLQ
                self.send_to_dlq(payload, "invalid_json", &e.to_string()).await;
                return Err(PipelineError::parsing(format!("JSON parse error: {}", e)));
            }
        };
        
        // Transform to SiemEvent (reuse logic from ingest handler)
        let tenant_id = value.get("tenant_id")
            .and_then(|v| v.as_u64())
            .unwrap_or(1);
        
        let source_id = value.get("source_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        
        // Check if parser is bound
        let parser_id = if let Some(ref sid) = source_id {
            self.get_parser_id(sid).await
        } else {
            None
        };
        
        // Transform with normalization
        match self.transform_event(value, parser_id.as_deref()).await {
            Ok(event) => {
                batch.push(event);
                
                // Track offset for commit
                tpl.add_partition_offset(
                    msg.topic(),
                    msg.partition(),
                    Offset::Offset(msg.offset() + 1),
                ).map_err(|e| PipelineError::internal(format!("Failed to track offset: {}", e)))?;
            }
            Err(e) => {
                // Quarantine
                metrics::inc_v2_ingest_kafka_total("quarantine");
                self.quarantine_event(tenant_id, payload, &e.to_string()).await;
            }
        }
        
        Ok(())
    }

    async fn transform_event(&self, value: Value, parser_id: Option<&str>) -> Result<SiemEvent> {
        // Similar to transform_to_siem_event in ingest handler
        use crate::v2::handlers::ingest::transform_to_siem_event;
        
        transform_to_siem_event(value, parser_id, &self.state).await
            .ok_or_else(|| PipelineError::validation("Failed to transform event"))
    }

    async fn flush_batch(
        &self,
        batch: &mut Vec<SiemEvent>,
        tpl: &mut TopicPartitionList,
    ) -> Result<()> {
        if batch.is_empty() {
            return Ok(());
        }
        
        let count = batch.len();
        tracing::debug!("Flushing batch of {} events", count);
        
        // Check EPS limits
        for event in batch.iter() {
            let tenant_id = event.tenant_id.parse::<u64>().unwrap_or(0);
            let source = event.source_type.clone();
            
            use crate::v2::util::rate_limit::check_eps;
            let decision = check_eps(&self.state, tenant_id, source).await?;
            
            if !decision.allowed {
                tracing::warn!("EPS limit exceeded for tenant {}, sleeping", tenant_id);
                sleep(Duration::from_secs(decision.retry_after.unwrap_or(1) as u64)).await;
                
                // Don't commit - keep lag as backpressure signal
                return Ok(());
            }
        }
        
        // Insert to ClickHouse
        let insert_sql = format!(
            "INSERT INTO {} (event_id, event_timestamp, tenant_id, event_category, event_action, event_outcome, source_ip, destination_ip, user_id, user_name, severity, message, raw_event, metadata, created_at, source_type, retention_days, event_type, action, user, host, severity_int, vendor, product, parsed_fields, ti_hits, ti_match) FORMAT JSONEachRow",
            self.state.events_table
        );
        
        // Convert to JSON
        let json_rows: Vec<String> = batch.iter()
            .map(|e| serde_json::to_string(e).unwrap())
            .collect();
        let body = json_rows.join("\n");
        
        // Execute insert with retry
        use crate::v2::util::retry::retry_idempotent;
        match retry_idempotent(3, || async {
            self.state.ch.query(&insert_sql)
                .bind(body.as_bytes())
                .execute()
                .await
        }).await {
            Ok(_) => {
                metrics::inc_v2_ingest_kafka_total_by("ok", count as u64);
                
                // Commit offsets
                self.consumer.commit(tpl, CommitMode::Sync)
                    .map_err(|e| PipelineError::internal(format!("Failed to commit offsets: {}", e)))?;
                metrics::inc_v2_kafka_commits_total();
                
                // Clear for next batch
                batch.clear();
                *tpl = TopicPartitionList::new();
                
                Ok(())
            }
            Err(e) => {
                tracing::error!("Failed to insert batch after retries: {}", e);
                // Don't commit - will retry
                Err(PipelineError::database(format!("Failed to insert batch: {}", e)))
            }
        }
    }

    async fn get_parser_id(&self, source_id: &str) -> Option<String> {
        #[derive(clickhouse::Row, serde::Deserialize)]
        struct ParserRow {
            parser_id: String,
        }
        
        match self.state.ch.query("SELECT parser_id FROM dev.log_sources_admin WHERE id = ? AND enabled = 1")
            .bind(source_id)
            .fetch_one::<ParserRow>()
            .await
        {
            Ok(row) if !row.parser_id.is_empty() => Some(row.parser_id),
            _ => None,
        }
    }

    async fn quarantine_event(&self, tenant_id: u64, payload: &[u8], reason: &str) {
        let _ = self.state.ch.query(
            "INSERT INTO dev.events_quarantine (tenant_id, source, reason, payload) VALUES (?, ?, ?, ?)"
        )
            .bind(tenant_id)
            .bind("kafka")
            .bind(reason)
            .bind(std::str::from_utf8(payload).unwrap_or("<binary>"))
            .execute()
            .await;
    }

    async fn send_to_dlq(&self, payload: &[u8], reason: &str, _detail: &str) {
        let tenant_id = 0u64; // Unknown tenant for parse failures
        let source_id = self.topic.clone();
        
        let _ = self.state.ch.query(
            "INSERT INTO dev.ingest_dlq (tenant_id, source_id, reason, raw) VALUES (?, ?, ?, ?)"
        )
            .bind(tenant_id)
            .bind(&source_id)
            .bind(reason)
            .bind(std::str::from_utf8(payload).unwrap_or("<binary>"))
            .execute()
            .await;
        
        metrics::inc_v2_ingest_kafka_total("dlq");
    }

    pub async fn get_status(&self) -> Value {
        // Simplified status - in production would query actual lag
        serde_json::json!({
            "running": true,
            "topic": self.topic,
            "group": std::env::var("KAFKA_GROUP_ID").unwrap_or_else(|_| "siem-v2".to_string()),
            "assignments": [
                {
                    "partition": 0,
                    "lag": 0,
                    "committed": 0,
                    "high_watermark": 0,
                }
            ],
            "poll_ms": 500,
        })
    }
}