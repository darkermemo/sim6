//! Metrics collection and monitoring for the ClickHouse ingestion pipeline
//! Provides comprehensive observability including performance, health, and business metrics

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Arc, RwLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::time;
use tracing::{debug, error, info, warn};

/// Global metrics collector for the ingestion pipeline
#[derive(Debug)]
pub struct MetricsCollector {
    /// Performance metrics
    performance: Arc<PerformanceMetrics>,
    
    /// Health metrics
    health: Arc<HealthMetrics>,
    
    /// Business metrics
    business: Arc<BusinessMetrics>,
    
    /// Tenant-specific metrics
    tenant_metrics: Arc<RwLock<HashMap<String, TenantMetrics>>>,
    
    /// Start time for uptime calculation
    start_time: Instant,
    
    /// Metrics collection interval
    collection_interval: Duration,
}

/// Performance-related metrics
#[derive(Debug, Default)]
pub struct PerformanceMetrics {
    /// Total events processed
    pub events_processed: AtomicU64,
    
    /// Events per second (current)
    pub current_eps: AtomicU64,
    
    /// Peak events per second
    pub peak_eps: AtomicU64,
    
    /// Average processing latency in microseconds
    pub avg_latency_us: AtomicU64,
    
    /// Peak processing latency in microseconds
    pub peak_latency_us: AtomicU64,
    
    /// Memory usage in bytes
    pub memory_usage_bytes: AtomicU64,
    
    /// CPU usage percentage (0-100)
    pub cpu_usage_percent: AtomicU64,
    
    /// Active connections
    pub active_connections: AtomicUsize,
    
    /// Queue depth
    pub queue_depth: AtomicUsize,
    
    /// Batch processing metrics
    pub batches_processed: AtomicU64,
    pub avg_batch_size: AtomicU64,
    pub batch_processing_time_us: AtomicU64,
}

/// Health and reliability metrics
#[derive(Debug, Default)]
pub struct HealthMetrics {
    /// Total errors encountered
    pub total_errors: AtomicU64,
    
    /// Validation errors
    pub validation_errors: AtomicU64,
    
    /// ClickHouse connection errors
    pub clickhouse_errors: AtomicU64,
    
    /// Rate limiting rejections
    pub rate_limit_rejections: AtomicU64,
    
    /// Authentication failures
    pub auth_failures: AtomicU64,
    
    /// Dead letter queue size
    pub dlq_size: AtomicU64,
    
    /// Circuit breaker trips
    pub circuit_breaker_trips: AtomicU64,
    
    /// Retry attempts
    pub retry_attempts: AtomicU64,
    
    /// Health check failures
    pub health_check_failures: AtomicU64,
    
    /// Last successful health check
    pub last_health_check: AtomicU64,
}

/// Business and operational metrics
#[derive(Debug, Default)]
pub struct BusinessMetrics {
    /// Total data volume processed (bytes)
    pub data_volume_bytes: AtomicU64,
    
    /// Unique tenants served
    pub unique_tenants: AtomicUsize,
    
    /// Log levels distribution
    pub log_levels: Arc<RwLock<HashMap<String, u64>>>,
    
    /// Source systems distribution
    pub source_systems: Arc<RwLock<HashMap<String, u64>>>,
    
    /// Geographic distribution (if available)
    pub geographic_distribution: Arc<RwLock<HashMap<String, u64>>>,
    
    /// Time-based distribution (hourly buckets)
    pub hourly_distribution: Arc<RwLock<HashMap<u8, u64>>>,
    
    /// Schema validation warnings
    pub schema_warnings: AtomicU64,
    
    /// Data quality score (0-100)
    pub data_quality_score: AtomicU64,
}

/// Tenant-specific metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantMetrics {
    /// Tenant identifier
    pub tenant_id: String,
    
    /// Events processed for this tenant
    pub events_processed: u64,
    
    /// Data volume for this tenant (bytes)
    pub data_volume_bytes: u64,
    
    /// Errors for this tenant
    pub errors: u64,
    
    /// Rate limit hits
    pub rate_limit_hits: u64,
    
    /// Last activity timestamp
    pub last_activity: SystemTime,
    
    /// Average events per second
    pub avg_eps: f64,
    
    /// Peak events per second
    pub peak_eps: u64,
    
    /// Schema validation errors
    pub validation_errors: u64,
}

/// Aggregated metrics snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsSnapshot {
    /// Timestamp of the snapshot
    pub timestamp: SystemTime,
    
    /// Uptime in seconds
    pub uptime_seconds: u64,
    
    /// Performance metrics
    pub performance: PerformanceSnapshot,
    
    /// Health metrics
    pub health: HealthSnapshot,
    
    /// Business metrics
    pub business: BusinessSnapshot,
    
    /// Top tenants by volume
    pub top_tenants: Vec<TenantMetrics>,
}

/// Performance metrics snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceSnapshot {
    pub events_processed: u64,
    pub current_eps: u64,
    pub peak_eps: u64,
    pub avg_latency_us: u64,
    pub peak_latency_us: u64,
    pub memory_usage_bytes: u64,
    pub cpu_usage_percent: u64,
    pub active_connections: usize,
    pub queue_depth: usize,
    pub batches_processed: u64,
    pub avg_batch_size: u64,
    pub batch_processing_time_us: u64,
}

/// Health metrics snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthSnapshot {
    pub total_errors: u64,
    pub validation_errors: u64,
    pub clickhouse_errors: u64,
    pub rate_limit_rejections: u64,
    pub auth_failures: u64,
    pub dlq_size: u64,
    pub circuit_breaker_trips: u64,
    pub retry_attempts: u64,
    pub health_check_failures: u64,
    pub error_rate_percent: f64,
    pub availability_percent: f64,
}

/// Business metrics snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessSnapshot {
    pub data_volume_bytes: u64,
    pub unique_tenants: usize,
    pub log_levels: HashMap<String, u64>,
    pub source_systems: HashMap<String, u64>,
    pub geographic_distribution: HashMap<String, u64>,
    pub hourly_distribution: HashMap<u8, u64>,
    pub schema_warnings: u64,
    pub data_quality_score: u64,
}

impl MetricsCollector {
    /// Create a new metrics collector
    pub fn new(collection_interval: Duration) -> Self {
        Self {
            performance: Arc::new(PerformanceMetrics::default()),
            health: Arc::new(HealthMetrics::default()),
            business: Arc::new(BusinessMetrics::default()),
            tenant_metrics: Arc::new(RwLock::new(HashMap::new())),
            start_time: Instant::now(),
            collection_interval,
        }
    }
    
    /// Start the metrics collection background task
    pub async fn start_collection(&self) -> Result<()> {
        let performance = Arc::clone(&self.performance);
        let health = Arc::clone(&self.health);
        let _business = Arc::clone(&self.business);
        let tenant_metrics = Arc::clone(&self.tenant_metrics);
        let interval = self.collection_interval;
        
        tokio::spawn(async move {
            let mut interval_timer = time::interval(interval);
            let mut last_events = 0u64;
            let mut last_timestamp = Instant::now();
            
            loop {
                interval_timer.tick().await;
                
                // Calculate current EPS
                let current_events = performance.events_processed.load(Ordering::Relaxed);
                let now = Instant::now();
                let duration = now.duration_since(last_timestamp).as_secs_f64();
                
                if duration > 0.0 {
                    let current_eps = ((current_events - last_events) as f64 / duration) as u64;
                    performance.current_eps.store(current_eps, Ordering::Relaxed);
                    
                    // Update peak EPS
                    let peak_eps = performance.peak_eps.load(Ordering::Relaxed);
                    if current_eps > peak_eps {
                        performance.peak_eps.store(current_eps, Ordering::Relaxed);
                    }
                }
                
                last_events = current_events;
                last_timestamp = now;
                
                // Update health check timestamp
                let timestamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                health.last_health_check.store(timestamp, Ordering::Relaxed);
                
                // Clean up old tenant metrics (older than 1 hour)
                Self::cleanup_old_tenant_metrics(&tenant_metrics).await;
                
                debug!("Metrics collection cycle completed");
            }
        });
        
        info!("Metrics collection started with interval: {:?}", self.collection_interval);
        Ok(())
    }
    
    /// Record an event being processed
    pub fn record_event_processed(&self, tenant_id: &str, data_size: usize, processing_time: Duration) {
        // Update performance metrics
        self.performance.events_processed.fetch_add(1, Ordering::Relaxed);
        
        let latency_us = processing_time.as_micros() as u64;
        self.performance.avg_latency_us.store(latency_us, Ordering::Relaxed);
        
        let peak_latency = self.performance.peak_latency_us.load(Ordering::Relaxed);
        if latency_us > peak_latency {
            self.performance.peak_latency_us.store(latency_us, Ordering::Relaxed);
        }
        
        // Update business metrics
        self.business.data_volume_bytes.fetch_add(data_size as u64, Ordering::Relaxed);
        
        // Update tenant metrics
        self.update_tenant_metrics(tenant_id, |metrics| {
            metrics.events_processed += 1;
            metrics.data_volume_bytes += data_size as u64;
            metrics.last_activity = SystemTime::now();
        });
    }
    
    /// Record a batch being processed
    pub fn record_batch_processed(&self, batch_size: usize, processing_time: Duration) {
        self.performance.batches_processed.fetch_add(1, Ordering::Relaxed);
        self.performance.avg_batch_size.store(batch_size as u64, Ordering::Relaxed);
        self.performance.batch_processing_time_us.store(
            processing_time.as_micros() as u64,
            Ordering::Relaxed,
        );
    }
    
    /// Record an error
    pub fn record_error(&self, error_type: &str, tenant_id: Option<&str>) {
        self.health.total_errors.fetch_add(1, Ordering::Relaxed);
        
        match error_type {
            "validation" => {
                self.health.validation_errors.fetch_add(1, Ordering::Relaxed);
            }
            "clickhouse" => {
                self.health.clickhouse_errors.fetch_add(1, Ordering::Relaxed);
            }
            "rate_limit" => {
                self.health.rate_limit_rejections.fetch_add(1, Ordering::Relaxed);
            }
            "auth" => {
                self.health.auth_failures.fetch_add(1, Ordering::Relaxed);
            }
            _ => {
                warn!("Unknown error type: {}", error_type);
            }
        }
        
        // Update tenant-specific error metrics
        if let Some(tenant_id) = tenant_id {
            self.update_tenant_metrics(tenant_id, |metrics| {
                metrics.errors += 1;
                if error_type == "validation" {
                    metrics.validation_errors += 1;
                } else if error_type == "rate_limit" {
                    metrics.rate_limit_hits += 1;
                }
            });
        }
    }
    
    /// Record log level distribution
    pub fn record_log_level(&self, level: &str) {
        if let Ok(mut levels) = self.business.log_levels.write() {
            *levels.entry(level.to_uppercase()).or_insert(0) += 1;
        }
    }
    
    /// Record source system
    pub fn record_source_system(&self, source: &str) {
        if let Ok(mut sources) = self.business.source_systems.write() {
            *sources.entry(source.to_string()).or_insert(0) += 1;
        }
    }
    
    /// Update system resource metrics
    pub fn update_system_metrics(&self, memory_bytes: u64, cpu_percent: u64) {
        self.performance.memory_usage_bytes.store(memory_bytes, Ordering::Relaxed);
        self.performance.cpu_usage_percent.store(cpu_percent, Ordering::Relaxed);
    }
    
    /// Update connection metrics
    pub fn update_connection_metrics(&self, active_connections: usize, queue_depth: usize) {
        self.performance.active_connections.store(active_connections, Ordering::Relaxed);
        self.performance.queue_depth.store(queue_depth, Ordering::Relaxed);
    }
    
    /// Get current metrics snapshot
    pub async fn get_snapshot(&self) -> MetricsSnapshot {
        let uptime = self.start_time.elapsed().as_secs();
        
        // Calculate error rate
        let total_events = self.performance.events_processed.load(Ordering::Relaxed);
        let total_errors = self.health.total_errors.load(Ordering::Relaxed);
        let error_rate = if total_events > 0 {
            (total_errors as f64 / total_events as f64) * 100.0
        } else {
            0.0
        };
        
        // Calculate availability (simplified)
        let availability = 100.0 - error_rate.min(100.0);
        
        // Get top tenants
        let top_tenants = self.get_top_tenants(10).await;
        
        MetricsSnapshot {
            timestamp: SystemTime::now(),
            uptime_seconds: uptime,
            performance: PerformanceSnapshot {
                events_processed: self.performance.events_processed.load(Ordering::Relaxed),
                current_eps: self.performance.current_eps.load(Ordering::Relaxed),
                peak_eps: self.performance.peak_eps.load(Ordering::Relaxed),
                avg_latency_us: self.performance.avg_latency_us.load(Ordering::Relaxed),
                peak_latency_us: self.performance.peak_latency_us.load(Ordering::Relaxed),
                memory_usage_bytes: self.performance.memory_usage_bytes.load(Ordering::Relaxed),
                cpu_usage_percent: self.performance.cpu_usage_percent.load(Ordering::Relaxed),
                active_connections: self.performance.active_connections.load(Ordering::Relaxed),
                queue_depth: self.performance.queue_depth.load(Ordering::Relaxed),
                batches_processed: self.performance.batches_processed.load(Ordering::Relaxed),
                avg_batch_size: self.performance.avg_batch_size.load(Ordering::Relaxed),
                batch_processing_time_us: self.performance.batch_processing_time_us.load(Ordering::Relaxed),
            },
            health: HealthSnapshot {
                total_errors: self.health.total_errors.load(Ordering::Relaxed),
                validation_errors: self.health.validation_errors.load(Ordering::Relaxed),
                clickhouse_errors: self.health.clickhouse_errors.load(Ordering::Relaxed),
                rate_limit_rejections: self.health.rate_limit_rejections.load(Ordering::Relaxed),
                auth_failures: self.health.auth_failures.load(Ordering::Relaxed),
                dlq_size: self.health.dlq_size.load(Ordering::Relaxed),
                circuit_breaker_trips: self.health.circuit_breaker_trips.load(Ordering::Relaxed),
                retry_attempts: self.health.retry_attempts.load(Ordering::Relaxed),
                health_check_failures: self.health.health_check_failures.load(Ordering::Relaxed),
                error_rate_percent: error_rate,
                availability_percent: availability,
            },
            business: BusinessSnapshot {
                data_volume_bytes: self.business.data_volume_bytes.load(Ordering::Relaxed),
                unique_tenants: self.business.unique_tenants.load(Ordering::Relaxed),
                log_levels: self.business.log_levels.read().unwrap().clone(),
                source_systems: self.business.source_systems.read().unwrap().clone(),
                geographic_distribution: self.business.geographic_distribution.read().unwrap().clone(),
                hourly_distribution: self.business.hourly_distribution.read().unwrap().clone(),
                schema_warnings: self.business.schema_warnings.load(Ordering::Relaxed),
                data_quality_score: self.business.data_quality_score.load(Ordering::Relaxed),
            },
            top_tenants,
        }
    }
    
    /// Get metrics for a specific tenant
    pub async fn get_tenant_metrics(&self, tenant_id: &str) -> Option<TenantMetrics> {
        self.tenant_metrics.read().ok()?.get(tenant_id).cloned()
    }
    
    /// Get top tenants by event volume
    pub async fn get_top_tenants(&self, limit: usize) -> Vec<TenantMetrics> {
        if let Ok(metrics) = self.tenant_metrics.read() {
            let mut tenants: Vec<_> = metrics.values().cloned().collect();
            tenants.sort_by(|a, b| b.events_processed.cmp(&a.events_processed));
            tenants.truncate(limit);
            tenants
        } else {
            Vec::new()
        }
    }
    
    /// Reset all metrics (useful for testing)
    pub fn reset(&self) {
        // Reset performance metrics
        self.performance.events_processed.store(0, Ordering::Relaxed);
        self.performance.current_eps.store(0, Ordering::Relaxed);
        self.performance.peak_eps.store(0, Ordering::Relaxed);
        self.performance.avg_latency_us.store(0, Ordering::Relaxed);
        self.performance.peak_latency_us.store(0, Ordering::Relaxed);
        self.performance.memory_usage_bytes.store(0, Ordering::Relaxed);
        self.performance.cpu_usage_percent.store(0, Ordering::Relaxed);
        self.performance.active_connections.store(0, Ordering::Relaxed);
        self.performance.queue_depth.store(0, Ordering::Relaxed);
        self.performance.batches_processed.store(0, Ordering::Relaxed);
        self.performance.avg_batch_size.store(0, Ordering::Relaxed);
        self.performance.batch_processing_time_us.store(0, Ordering::Relaxed);
        
        // Reset health metrics
        self.health.total_errors.store(0, Ordering::Relaxed);
        self.health.validation_errors.store(0, Ordering::Relaxed);
        self.health.clickhouse_errors.store(0, Ordering::Relaxed);
        self.health.rate_limit_rejections.store(0, Ordering::Relaxed);
        self.health.auth_failures.store(0, Ordering::Relaxed);
        self.health.dlq_size.store(0, Ordering::Relaxed);
        self.health.circuit_breaker_trips.store(0, Ordering::Relaxed);
        self.health.retry_attempts.store(0, Ordering::Relaxed);
        self.health.health_check_failures.store(0, Ordering::Relaxed);
        self.health.last_health_check.store(0, Ordering::Relaxed);
        
        // Reset business metrics
        self.business.data_volume_bytes.store(0, Ordering::Relaxed);
        self.business.unique_tenants.store(0, Ordering::Relaxed);
        self.business.schema_warnings.store(0, Ordering::Relaxed);
        self.business.data_quality_score.store(100, Ordering::Relaxed);
        
        if let Ok(mut levels) = self.business.log_levels.write() {
            levels.clear();
        }
        if let Ok(mut sources) = self.business.source_systems.write() {
            sources.clear();
        }
        if let Ok(mut geo) = self.business.geographic_distribution.write() {
            geo.clear();
        }
        if let Ok(mut hourly) = self.business.hourly_distribution.write() {
            hourly.clear();
        }
        
        // Reset tenant metrics
        if let Ok(mut tenants) = self.tenant_metrics.write() {
            tenants.clear();
        }
        
        info!("All metrics have been reset");
    }
    
    /// Update tenant-specific metrics
    fn update_tenant_metrics<F>(&self, tenant_id: &str, update_fn: F)
    where
        F: FnOnce(&mut TenantMetrics),
    {
        if let Ok(mut tenants) = self.tenant_metrics.write() {
            let metrics = tenants.entry(tenant_id.to_string()).or_insert_with(|| {
                TenantMetrics {
                    tenant_id: tenant_id.to_string(),
                    events_processed: 0,
                    data_volume_bytes: 0,
                    errors: 0,
                    rate_limit_hits: 0,
                    last_activity: SystemTime::now(),
                    avg_eps: 0.0,
                    peak_eps: 0,
                    validation_errors: 0,
                }
            });
            
            update_fn(metrics);
            
            // Update unique tenants count
            self.business.unique_tenants.store(tenants.len(), Ordering::Relaxed);
        }
    }
    
    /// Clean up old tenant metrics
    async fn cleanup_old_tenant_metrics(tenant_metrics: &Arc<RwLock<HashMap<String, TenantMetrics>>>) {
        let cutoff = SystemTime::now() - Duration::from_secs(3600); // 1 hour
        
        if let Ok(mut tenants) = tenant_metrics.write() {
            let initial_count = tenants.len();
            tenants.retain(|_, metrics| metrics.last_activity > cutoff);
            let final_count = tenants.len();
            
            if initial_count != final_count {
                debug!("Cleaned up {} old tenant metrics", initial_count - final_count);
            }
        }
    }
}

/// Export metrics in Prometheus format
pub fn export_prometheus_metrics(snapshot: &MetricsSnapshot) -> String {
    let mut output = String::new();
    
    // Performance metrics
    output.push_str(&format!("# HELP ingestion_events_processed_total Total number of events processed\n"));
    output.push_str(&format!("# TYPE ingestion_events_processed_total counter\n"));
    output.push_str(&format!("ingestion_events_processed_total {}\n", snapshot.performance.events_processed));
    
    output.push_str(&format!("# HELP ingestion_events_per_second Current events per second\n"));
    output.push_str(&format!("# TYPE ingestion_events_per_second gauge\n"));
    output.push_str(&format!("ingestion_events_per_second {}\n", snapshot.performance.current_eps));
    
    output.push_str(&format!("# HELP ingestion_latency_microseconds Average processing latency\n"));
    output.push_str(&format!("# TYPE ingestion_latency_microseconds gauge\n"));
    output.push_str(&format!("ingestion_latency_microseconds {}\n", snapshot.performance.avg_latency_us));
    
    output.push_str(&format!("# HELP ingestion_memory_bytes Memory usage in bytes\n"));
    output.push_str(&format!("# TYPE ingestion_memory_bytes gauge\n"));
    output.push_str(&format!("ingestion_memory_bytes {}\n", snapshot.performance.memory_usage_bytes));
    
    // Health metrics
    output.push_str(&format!("# HELP ingestion_errors_total Total number of errors\n"));
    output.push_str(&format!("# TYPE ingestion_errors_total counter\n"));
    output.push_str(&format!("ingestion_errors_total {}\n", snapshot.health.total_errors));
    
    output.push_str(&format!("# HELP ingestion_error_rate_percent Error rate percentage\n"));
    output.push_str(&format!("# TYPE ingestion_error_rate_percent gauge\n"));
    output.push_str(&format!("ingestion_error_rate_percent {}\n", snapshot.health.error_rate_percent));
    
    output.push_str(&format!("# HELP ingestion_availability_percent Service availability percentage\n"));
    output.push_str(&format!("# TYPE ingestion_availability_percent gauge\n"));
    output.push_str(&format!("ingestion_availability_percent {}\n", snapshot.health.availability_percent));
    
    // Business metrics
    output.push_str(&format!("# HELP ingestion_data_volume_bytes Total data volume processed\n"));
    output.push_str(&format!("# TYPE ingestion_data_volume_bytes counter\n"));
    output.push_str(&format!("ingestion_data_volume_bytes {}\n", snapshot.business.data_volume_bytes));
    
    output.push_str(&format!("# HELP ingestion_unique_tenants Number of unique tenants\n"));
    output.push_str(&format!("# TYPE ingestion_unique_tenants gauge\n"));
    output.push_str(&format!("ingestion_unique_tenants {}\n", snapshot.business.unique_tenants));
    
    // Log levels distribution
    for (level, count) in &snapshot.business.log_levels {
        output.push_str(&format!("# HELP ingestion_log_levels_total Log events by level\n"));
        output.push_str(&format!("# TYPE ingestion_log_levels_total counter\n"));
        output.push_str(&format!("ingestion_log_levels_total{{level=\"{}\"}} {}\n", level, count));
    }
    
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    
    #[tokio::test]
    async fn test_metrics_collector_creation() {
        let collector = MetricsCollector::new(Duration::from_secs(1));
        assert_eq!(collector.performance.events_processed.load(Ordering::Relaxed), 0);
        assert_eq!(collector.health.total_errors.load(Ordering::Relaxed), 0);
    }
    
    #[tokio::test]
    async fn test_record_event_processed() {
        let collector = MetricsCollector::new(Duration::from_secs(1));
        
        collector.record_event_processed("test_tenant", 1024, Duration::from_millis(10));
        
        assert_eq!(collector.performance.events_processed.load(Ordering::Relaxed), 1);
        assert_eq!(collector.business.data_volume_bytes.load(Ordering::Relaxed), 1024);
        
        let tenant_metrics = collector.get_tenant_metrics("test_tenant").await.unwrap();
        assert_eq!(tenant_metrics.events_processed, 1);
        assert_eq!(tenant_metrics.data_volume_bytes, 1024);
    }
    
    #[tokio::test]
    async fn test_record_error() {
        let collector = MetricsCollector::new(Duration::from_secs(1));
        
        collector.record_error("validation", Some("test_tenant"));
        collector.record_error("clickhouse", None);
        
        assert_eq!(collector.health.total_errors.load(Ordering::Relaxed), 2);
        assert_eq!(collector.health.validation_errors.load(Ordering::Relaxed), 1);
        assert_eq!(collector.health.clickhouse_errors.load(Ordering::Relaxed), 1);
        
        let tenant_metrics = collector.get_tenant_metrics("test_tenant").await.unwrap();
        assert_eq!(tenant_metrics.errors, 1);
        assert_eq!(tenant_metrics.validation_errors, 1);
    }
    
    #[tokio::test]
    async fn test_metrics_snapshot() {
        let collector = MetricsCollector::new(Duration::from_secs(1));
        
        // Record some metrics
        collector.record_event_processed("tenant1", 1024, Duration::from_millis(5));
        collector.record_event_processed("tenant2", 2048, Duration::from_millis(10));
        collector.record_error("validation", Some("tenant1"));
        collector.record_log_level("INFO");
        collector.record_source_system("app1");
        
        let snapshot = collector.get_snapshot().await;
        
        assert_eq!(snapshot.performance.events_processed, 2);
        assert_eq!(snapshot.business.data_volume_bytes, 3072);
        assert_eq!(snapshot.health.total_errors, 1);
        assert_eq!(snapshot.business.unique_tenants, 2);
        assert!(snapshot.business.log_levels.contains_key("INFO"));
        assert!(snapshot.business.source_systems.contains_key("app1"));
    }
    
    #[tokio::test]
    async fn test_top_tenants() {
        let collector = MetricsCollector::new(Duration::from_secs(1));
        
        // Record events for different tenants
        for _ in 0..10 {
            collector.record_event_processed("tenant1", 100, Duration::from_millis(1));
        }
        for _ in 0..5 {
            collector.record_event_processed("tenant2", 100, Duration::from_millis(1));
        }
        for _ in 0..15 {
            collector.record_event_processed("tenant3", 100, Duration::from_millis(1));
        }
        
        let top_tenants = collector.get_top_tenants(2).await;
        
        assert_eq!(top_tenants.len(), 2);
        assert_eq!(top_tenants[0].tenant_id, "tenant3");
        assert_eq!(top_tenants[0].events_processed, 15);
        assert_eq!(top_tenants[1].tenant_id, "tenant1");
        assert_eq!(top_tenants[1].events_processed, 10);
    }
    
    #[test]
    fn test_prometheus_export() {
        let snapshot = MetricsSnapshot {
            timestamp: SystemTime::now(),
            uptime_seconds: 3600,
            performance: PerformanceSnapshot {
                events_processed: 1000,
                current_eps: 100,
                peak_eps: 150,
                avg_latency_us: 5000,
                peak_latency_us: 10000,
                memory_usage_bytes: 1024 * 1024,
                cpu_usage_percent: 50,
                active_connections: 10,
                queue_depth: 5,
                batches_processed: 50,
                avg_batch_size: 20,
                batch_processing_time_us: 1000,
            },
            health: HealthSnapshot {
                total_errors: 5,
                validation_errors: 2,
                clickhouse_errors: 1,
                rate_limit_rejections: 1,
                auth_failures: 1,
                dlq_size: 0,
                circuit_breaker_trips: 0,
                retry_attempts: 3,
                health_check_failures: 0,
                error_rate_percent: 0.5,
                availability_percent: 99.5,
            },
            business: BusinessSnapshot {
                data_volume_bytes: 1024 * 1024,
                unique_tenants: 3,
                log_levels: {
                    let mut levels = HashMap::new();
                    levels.insert("INFO".to_string(), 800);
                    levels.insert("ERROR".to_string(), 200);
                    levels
                },
                source_systems: HashMap::new(),
                geographic_distribution: HashMap::new(),
                hourly_distribution: HashMap::new(),
                schema_warnings: 10,
                data_quality_score: 95,
            },
            top_tenants: Vec::new(),
        };
        
        let prometheus_output = export_prometheus_metrics(&snapshot);
        
        assert!(prometheus_output.contains("ingestion_events_processed_total 1000"));
        assert!(prometheus_output.contains("ingestion_events_per_second 100"));
        assert!(prometheus_output.contains("ingestion_error_rate_percent 0.5"));
        assert!(prometheus_output.contains("ingestion_log_levels_total{level=\"INFO\"} 800"));
    }
    
    #[tokio::test]
    async fn test_reset_metrics() {
        let collector = MetricsCollector::new(Duration::from_secs(1));
        
        // Record some metrics
        collector.record_event_processed("tenant1", 1024, Duration::from_millis(5));
        collector.record_error("validation", Some("tenant1"));
        
        // Verify metrics are recorded
        assert_eq!(collector.performance.events_processed.load(Ordering::Relaxed), 1);
        assert_eq!(collector.health.total_errors.load(Ordering::Relaxed), 1);
        
        // Reset metrics
        collector.reset();
        
        // Verify metrics are reset
        assert_eq!(collector.performance.events_processed.load(Ordering::Relaxed), 0);
        assert_eq!(collector.health.total_errors.load(Ordering::Relaxed), 0);
        assert_eq!(collector.business.data_volume_bytes.load(Ordering::Relaxed), 0);
        
        let tenant_metrics = collector.get_tenant_metrics("tenant1").await;
        assert!(tenant_metrics.is_none());
    }
}