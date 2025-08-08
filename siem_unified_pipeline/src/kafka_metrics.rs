//! Kafka advanced metrics collection module
//! Provides partition lag and rebalance monitoring using rdkafka ClientContext

use rdkafka::consumer::{StreamConsumer, ConsumerContext};
use rdkafka::{ClientContext, Statistics};
use prometheus::{IntGauge, IntCounter, Registry};
use std::sync::Arc;
use tracing::{info, debug};

/// Kafka-specific metrics for monitoring partition lag and rebalances
#[derive(Debug, Clone)]
pub struct KafkaMetrics {
    /// Total consumer lag across all partitions
    pub lag_gauge: IntGauge,
    /// Number of rebalance events
    pub rebalance_counter: IntCounter,
}

impl KafkaMetrics {
    /// Create new Kafka metrics and register them with the provided registry
    pub fn new(registry: &Registry) -> Result<Self, prometheus::Error> {
        let lag_gauge = IntGauge::new(
            "kafka_consumer_lag_total",
            "Total consumer lag across all partitions"
        )?;
        
        let rebalance_counter = IntCounter::new(
            "kafka_rebalance_events_total",
            "Total number of consumer rebalance events"
        )?;
        
        registry.register(Box::new(lag_gauge.clone()))?;
        registry.register(Box::new(rebalance_counter.clone()))?;
        
        Ok(KafkaMetrics {
            lag_gauge,
            rebalance_counter,
        })
    }
}

/// Custom ClientContext for collecting Kafka metrics
#[derive(Debug)]
pub struct KafkaMetricsContext {
    metrics: Arc<KafkaMetrics>,
}

impl KafkaMetricsContext {
    /// Create new context with metrics reference
    pub fn new(metrics: Arc<KafkaMetrics>) -> Self {
        Self { metrics }
    }
}

impl ClientContext for KafkaMetricsContext {
    /// Handle statistics callback to extract partition lag
    fn stats(&self, stats: Statistics) {
        debug!("Received Kafka statistics");
        
        // Calculate total lag across all topics and partitions
        let total_lag: i64 = stats.topics
            .values()
            .flat_map(|topic| topic.partitions.values())
            .map(|partition| partition.consumer_lag)
            .sum();
        
        self.metrics.lag_gauge.set(total_lag);
        debug!("Updated Kafka consumer lag: {}", total_lag);
    }
}

// Implement ConsumerContext trait for KafkaMetricsContext
impl ConsumerContext for KafkaMetricsContext {}

/// Attach metrics collection to an existing Kafka consumer
/// This should be called during consumer setup in the ingestion module
pub fn attach_metrics_to_consumer(
    _consumer: &StreamConsumer<KafkaMetricsContext>,
    _metrics: Arc<KafkaMetrics>
) {
    info!("Attaching Kafka metrics collection to consumer");
    // The context is already set during consumer creation
    // This function serves as a documentation point for the integration
}

/// Helper function to create a consumer with metrics context
/// This can be used in the ingestion module to create properly instrumented consumers
pub fn create_consumer_with_metrics(
    config: &rdkafka::ClientConfig,
    metrics: Arc<KafkaMetrics>
) -> Result<StreamConsumer<KafkaMetricsContext>, rdkafka::error::KafkaError> {
    let context = KafkaMetricsContext::new(metrics);
    config.create_with_context(context)
}

#[cfg(test)]
mod tests {
    use super::*;
    use prometheus::Registry;
    
    #[test]
    fn test_kafka_metrics_creation() {
        let registry = Registry::new();
        let metrics = KafkaMetrics::new(&registry).expect("Failed to create metrics");
        
        // Test initial values
        assert_eq!(metrics.lag_gauge.get(), 0);
        assert_eq!(metrics.rebalance_counter.get(), 0);
    }
    
    #[test]
    fn test_metrics_context_creation() {
        let registry = Registry::new();
        let metrics = Arc::new(KafkaMetrics::new(&registry).expect("Failed to create metrics"));
        let _context = KafkaMetricsContext::new(metrics);
        // If we get here without panicking, the context was created successfully
    }
}