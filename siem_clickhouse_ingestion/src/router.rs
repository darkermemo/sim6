//! Log router module for directing logs to appropriate destinations
//! Handles routing logic, buffering, and delivery to ClickHouse

use anyhow::{Context, Result};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{
    sync::{mpsc, RwLock},
    time::timeout,
};
use tracing::{debug, error, info, warn};

use crate::{
    clickhouse::ClickHouseWriter,
    config::{Config, TenantConfig, TenantRegistry},
    metrics::MetricsCollector,
    schema::LogEvent,
};

/// Log routing destination
#[derive(Debug, Clone)]
pub enum RoutingDestination {
    ClickHouse {
        table_name: String,
        tenant_id: String,
    },
    DeadLetter {
        reason: String,
    },
}

/// Routed log with destination information
#[derive(Debug, Clone)]
pub struct RoutedLog {
    pub event: LogEvent,
    pub destination: RoutingDestination,
    pub routing_timestamp: Instant,
    pub retry_count: u32,
}

/// Routing statistics
#[derive(Debug, Clone, Default)]
pub struct RoutingStats {
    pub total_routed: u64,
    pub clickhouse_routed: u64,
    pub dead_letter_routed: u64,
    pub routing_errors: u64,
    pub average_routing_time_ms: f64,
}

/// Log router for directing logs to appropriate destinations
pub struct LogRouter {
    config: Arc<Config>,
    tenant_registry: Arc<RwLock<TenantRegistry>>,
    clickhouse_writer: Arc<ClickHouseWriter>,
    metrics: Arc<MetricsCollector>,
    routing_stats: Arc<RwLock<HashMap<String, RoutingStats>>>,
    log_sender: mpsc::UnboundedSender<RoutedLog>,
    _routing_task: tokio::task::JoinHandle<()>,
}

impl LogRouter {
    /// Create a new log router
    pub fn new(
        config: Arc<Config>,
        tenant_registry: Arc<RwLock<TenantRegistry>>,
        clickhouse_writer: Arc<ClickHouseWriter>,
        metrics: Arc<MetricsCollector>,
    ) -> Self {
        let (log_sender, log_receiver) = mpsc::unbounded_channel();
        let routing_stats = Arc::new(RwLock::new(HashMap::new()));

        // Start the routing task
        let routing_task = Self::start_routing_task(
            config.clone(),
            clickhouse_writer.clone(),
            metrics.clone(),
            routing_stats.clone(),
            log_receiver,
        );

        Self {
            config,
            tenant_registry,
            clickhouse_writer,
            metrics,
            routing_stats,
            log_sender,
            _routing_task: routing_task,
        }
    }

    /// Route a log event to its destination
    pub async fn route_log(&self, event: LogEvent) -> Result<()> {
        let start_time = Instant::now();
        
        // Determine routing destination
        let destination = self.determine_destination(&event).await?;
        
        // Create routed log
        // Record metrics before moving the event
        let routing_time = start_time.elapsed();
        self.metrics.record_event_processed(&event.tenant_id, 
                                           event.message.len(), routing_time);

        let routed_log = RoutedLog {
            event,
            destination,
            routing_timestamp: Instant::now(),
            retry_count: 0,
        };

        // Send to routing task
        self.log_sender.send(routed_log)
            .map_err(|_| anyhow::anyhow!("Failed to send log to routing task"))?;

        Ok(())
    }

    /// Determine the routing destination for a log event
    async fn determine_destination(&self, event: &LogEvent) -> Result<RoutingDestination> {
        let registry = self.tenant_registry.read().await;
        
        match registry.get_tenant(&event.tenant_id) {
            Some(tenant_config) if tenant_config.enabled => {
                // Route to ClickHouse
                Ok(RoutingDestination::ClickHouse {
                    table_name: tenant_config.table_name.clone(),
                    tenant_id: event.tenant_id.clone(),
                })
            }
            Some(_) => {
                // Tenant is disabled
                Ok(RoutingDestination::DeadLetter {
                    reason: format!("Tenant '{}' is disabled", event.tenant_id),
                })
            }
            None => {
                // Tenant not found
                Ok(RoutingDestination::DeadLetter {
                    reason: format!("Tenant '{}' not found", event.tenant_id),
                })
            }
        }
    }

    /// Start the background routing task
    fn start_routing_task(
        config: Arc<Config>,
        clickhouse_writer: Arc<ClickHouseWriter>,
        metrics: Arc<MetricsCollector>,
        routing_stats: Arc<RwLock<HashMap<String, RoutingStats>>>,
        mut log_receiver: mpsc::UnboundedReceiver<RoutedLog>,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let mut batch_buffer: HashMap<String, Vec<RoutedLog>> = HashMap::new();
            let mut last_flush = Instant::now();
            let batch_timeout = Duration::from_millis(config.clickhouse.batch.timeout_ms);
            let batch_size = config.clickhouse.batch.size;

            info!("Started log routing task with batch size: {}, timeout: {:?}", batch_size, batch_timeout);

            loop {
                // Check if we should flush based on timeout
                let should_flush_timeout = last_flush.elapsed() >= batch_timeout;
                
                // Try to receive a log with timeout
                let log_result = if should_flush_timeout {
                    // Force flush if timeout reached
                    None
                } else {
                    // Wait for log or timeout
                    match timeout(batch_timeout - last_flush.elapsed(), log_receiver.recv()).await {
                        Ok(Some(log)) => Some(log),
                        Ok(None) => {
                            info!("Log routing task shutting down");
                            break;
                        }
                        Err(_) => None, // Timeout
                    }
                };

                // Process received log
                if let Some(routed_log) = log_result {
                    let table_key = match &routed_log.destination {
                        RoutingDestination::ClickHouse { table_name, .. } => table_name.clone(),
                        RoutingDestination::DeadLetter { .. } => "dead_letter".to_string(),
                    };

                    batch_buffer.entry(table_key).or_insert_with(Vec::new).push(routed_log);
                }

                // Check if any batch is ready to flush
                let mut tables_to_flush = Vec::new();
                for (table_name, logs) in &batch_buffer {
                    if logs.len() >= batch_size || should_flush_timeout {
                        tables_to_flush.push(table_name.clone());
                    }
                }

                // Flush ready batches
                for table_name in tables_to_flush {
                    if let Some(logs) = batch_buffer.remove(&table_name) {
                        if !logs.is_empty() {
                            Self::flush_batch(
                                &table_name,
                                logs,
                                &clickhouse_writer,
                                &metrics,
                                &routing_stats,
                            ).await;
                        }
                    }
                }

                // Update last flush time if we flushed
                if should_flush_timeout {
                    last_flush = Instant::now();
                }
            }

            // Flush remaining logs on shutdown
            for (table_name, logs) in batch_buffer {
                if !logs.is_empty() {
                    Self::flush_batch(
                        &table_name,
                        logs,
                        &clickhouse_writer,
                        &metrics,
                        &routing_stats,
                    ).await;
                }
            }

            info!("Log routing task completed");
        })
    }

    /// Flush a batch of logs to their destination
    async fn flush_batch(
        table_name: &str,
        logs: Vec<RoutedLog>,
        clickhouse_writer: &ClickHouseWriter,
        metrics: &MetricsCollector,
        routing_stats: &Arc<RwLock<HashMap<String, RoutingStats>>>,
    ) {
        let batch_size = logs.len();
        let start_time = Instant::now();
        
        debug!("Flushing batch of {} logs to table: {}", batch_size, table_name);

        // Separate logs by destination type
        let mut clickhouse_logs = Vec::new();
        let mut dead_letter_logs = Vec::new();

        for log in logs {
            match &log.destination {
                RoutingDestination::ClickHouse { .. } => {
                    clickhouse_logs.push(log.event);
                }
                RoutingDestination::DeadLetter { reason } => {
                    warn!("Log sent to dead letter queue: {}", reason);
                    dead_letter_logs.push(log);
                }
            }
        }

        // Write ClickHouse logs
        if !clickhouse_logs.is_empty() {
            match clickhouse_writer.write_batch(table_name, clickhouse_logs.clone()).await {
                Ok(_) => {
                    let duration = start_time.elapsed();
                    info!(
                        "Successfully wrote {} logs to ClickHouse table '{}' in {:?}",
                        clickhouse_logs.len(),
                        table_name,
                        duration
                    );

                    // Update success metrics - record each log as processed
                    for log_event in &clickhouse_logs {
                        metrics.record_event_processed(&log_event.tenant_id, 
                                                      log_event.message.len(), 
                                                      duration);
                    }
                    
                    metrics.record_batch_processed(clickhouse_logs.len(), duration);

                    // Update routing stats
                    Self::update_routing_stats(
                        routing_stats,
                        table_name,
                        clickhouse_logs.len() as u64,
                        0,
                        duration.as_millis() as f64,
                    ).await;
                }
                Err(e) => {
                    error!(
                        "Failed to write {} logs to ClickHouse table '{}': {}",
                        clickhouse_logs.len(),
                        table_name,
                        e
                    );

                    // Update error metrics
                    metrics.record_error("clickhouse", None);

                    // TODO: Implement retry logic or send to dead letter queue
                }
            }
        }

        // Handle dead letter logs
        if !dead_letter_logs.is_empty() {
            // TODO: Implement actual dead letter queue (file, separate table, etc.)
            warn!("Dropping {} logs to dead letter queue", dead_letter_logs.len());
            
            // Record dead letter queue metrics
            for _ in 0..dead_letter_logs.len() {
                metrics.record_error("dead_letter", None);
            }

            Self::update_routing_stats(
                routing_stats,
                "dead_letter",
                0,
                dead_letter_logs.len() as u64,
                start_time.elapsed().as_millis() as f64,
            ).await;
        }
    }

    /// Update routing statistics
    async fn update_routing_stats(
        routing_stats: &Arc<RwLock<HashMap<String, RoutingStats>>>,
        table_name: &str,
        clickhouse_count: u64,
        dead_letter_count: u64,
        routing_time_ms: f64,
    ) {
        let mut stats = routing_stats.write().await;
        let table_stats = stats.entry(table_name.to_string()).or_insert_with(RoutingStats::default);
        
        table_stats.total_routed += clickhouse_count + dead_letter_count;
        table_stats.clickhouse_routed += clickhouse_count;
        table_stats.dead_letter_routed += dead_letter_count;
        
        // Update average routing time (simple moving average)
        if table_stats.total_routed > 0 {
            table_stats.average_routing_time_ms = 
                (table_stats.average_routing_time_ms * (table_stats.total_routed - 1) as f64 + routing_time_ms) 
                / table_stats.total_routed as f64;
        }
    }

    /// Get routing statistics
    pub async fn get_routing_stats(&self) -> HashMap<String, RoutingStats> {
        self.routing_stats.read().await.clone()
    }

    /// Get routing statistics for a specific table
    pub async fn get_table_stats(&self, table_name: &str) -> Option<RoutingStats> {
        self.routing_stats.read().await.get(table_name).cloned()
    }

    /// Reset routing statistics
    pub async fn reset_stats(&self) {
        let mut stats = self.routing_stats.write().await;
        stats.clear();
        info!("Routing statistics reset");
    }

    /// Get total logs routed across all tables
    pub async fn get_total_routed(&self) -> u64 {
        let stats = self.routing_stats.read().await;
        stats.values().map(|s| s.total_routed).sum()
    }

    /// Get routing health status
    pub async fn get_health_status(&self) -> HashMap<String, serde_json::Value> {
        let stats = self.routing_stats.read().await;
        let mut health = HashMap::new();
        
        let total_routed: u64 = stats.values().map(|s| s.total_routed).sum();
        let total_errors: u64 = stats.values().map(|s| s.routing_errors).sum();
        let total_dead_letter: u64 = stats.values().map(|s| s.dead_letter_routed).sum();
        
        health.insert("total_routed".to_string(), serde_json::Value::from(total_routed));
        health.insert("total_errors".to_string(), serde_json::Value::from(total_errors));
        health.insert("total_dead_letter".to_string(), serde_json::Value::from(total_dead_letter));
        health.insert("active_tables".to_string(), serde_json::Value::from(stats.len()));
        
        if total_routed > 0 {
            let error_rate = (total_errors as f64 / total_routed as f64) * 100.0;
            let dead_letter_rate = (total_dead_letter as f64 / total_routed as f64) * 100.0;
            health.insert("error_rate_percent".to_string(), serde_json::Value::from(error_rate));
            health.insert("dead_letter_rate_percent".to_string(), serde_json::Value::from(dead_letter_rate));
        }
        
        health
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{RateLimitConfig, TenantConfig};
    use std::collections::HashMap;
    use std::time::SystemTime;

    #[test]
    fn test_routing_destination_debug() {
        let dest = RoutingDestination::ClickHouse {
            table_name: "test_table".to_string(),
            tenant_id: "test_tenant".to_string(),
        };
        
        let debug_str = format!("{:?}", dest);
        assert!(debug_str.contains("ClickHouse"));
        assert!(debug_str.contains("test_table"));
    }

    #[test]
    fn test_routed_log_creation() {
        let event = LogEvent {
            tenant_id: "test".to_string(),
            timestamp: SystemTime::now(),
            level: "INFO".to_string(),
            message: "test message".to_string(),
            source: Some("test_source".to_string()),
            fields: HashMap::new(),
        };
        
        let destination = RoutingDestination::ClickHouse {
            table_name: "logs_test".to_string(),
            tenant_id: "test".to_string(),
        };
        
        let routed_log = RoutedLog {
            event,
            destination,
            routing_timestamp: Instant::now(),
            retry_count: 0,
        };
        
        assert_eq!(routed_log.retry_count, 0);
        assert_eq!(routed_log.event.tenant_id, "test");
    }

    #[test]
    fn test_routing_stats_default() {
        let stats = RoutingStats::default();
        assert_eq!(stats.total_routed, 0);
        assert_eq!(stats.clickhouse_routed, 0);
        assert_eq!(stats.dead_letter_routed, 0);
        assert_eq!(stats.routing_errors, 0);
        assert_eq!(stats.average_routing_time_ms, 0.0);
    }
}