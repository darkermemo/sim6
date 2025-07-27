use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn, error, debug};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc, Duration};
use std::time::Instant;
use prometheus::{Counter, Gauge, Histogram, Registry, Encoder, TextEncoder};
use tokio::time::{interval, Duration as TokioDuration};

use crate::config::PipelineConfig;
use crate::error::{Result, PipelineError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub timestamp: DateTime<Utc>,
    pub cpu_usage: f64,
    pub memory_usage: f64,
    pub disk_usage: f64,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub open_file_descriptors: u64,
    pub thread_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineMetrics {
    pub timestamp: DateTime<Utc>,
    pub events_ingested: u64,
    pub events_processed: u64,
    pub events_stored: u64,
    pub events_dropped: u64,
    pub events_failed: u64,
    pub processing_rate_per_sec: f64,
    pub avg_processing_time_ms: f64,
    pub queue_depth: u64,
    pub active_connections: u64,
    pub error_rate: f64,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentMetrics {
    pub component_name: String,
    pub timestamp: DateTime<Utc>,
    pub status: ComponentStatus,
    pub events_processed: u64,
    pub errors: u64,
    pub avg_response_time_ms: f64,
    pub last_activity: Option<DateTime<Utc>>,
    pub custom_metrics: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ComponentStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Stopped,
    Starting,
    Stopping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertMetrics {
    pub timestamp: DateTime<Utc>,
    pub alerts_triggered: u64,
    pub alerts_resolved: u64,
    pub active_alerts: u64,
    pub alert_rate_per_hour: f64,
    pub avg_resolution_time_minutes: f64,
    pub severity_breakdown: HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub timestamp: DateTime<Utc>,
    pub throughput_events_per_sec: f64,
    pub latency_p50_ms: f64,
    pub latency_p95_ms: f64,
    pub latency_p99_ms: f64,
    pub resource_utilization: f64,
    pub bottleneck_component: Option<String>,
    pub optimization_suggestions: Vec<String>,
}

pub struct MetricsCollector {
    config: PipelineConfig,
    start_time: Instant,
    registry: Registry,
    
    // Prometheus metrics
    events_ingested_counter: Counter,
    events_processed_counter: Counter,
    events_stored_counter: Counter,
    events_dropped_counter: Counter,
    events_failed_counter: Counter,
    processing_time_histogram: Histogram,
    queue_depth_gauge: Gauge,
    active_connections_gauge: Gauge,
    component_status_gauge: Gauge,
    
    // Internal metrics storage
    system_metrics: Arc<RwLock<SystemMetrics>>,
    pipeline_metrics: Arc<RwLock<PipelineMetrics>>,
    component_metrics: Arc<RwLock<HashMap<String, ComponentMetrics>>>,
    alert_metrics: Arc<RwLock<AlertMetrics>>,
    performance_metrics: Arc<RwLock<PerformanceMetrics>>,
    
    // Historical data (last 24 hours)
    historical_metrics: Arc<RwLock<Vec<PipelineMetrics>>>,
    
    // Performance tracking
    latency_samples: Arc<RwLock<Vec<f64>>>,
    throughput_samples: Arc<RwLock<Vec<f64>>>,
}

impl MetricsCollector {
    pub fn new(config: &PipelineConfig) -> Result<Self> {
        info!("Initializing metrics collector");
        
        let registry = Registry::new();
        
        // Initialize Prometheus metrics
        let events_ingested_counter = Counter::new(
            "siem_events_ingested_total",
            "Total number of events ingested"
        ).map_err(|e| PipelineError::metrics(format!("Failed to create counter: {}", e)))?;
        
        let events_processed_counter = Counter::new(
            "siem_events_processed_total",
            "Total number of events processed"
        ).map_err(|e| PipelineError::metrics(format!("Failed to create counter: {}", e)))?;
        
        let events_stored_counter = Counter::new(
            "siem_events_stored_total",
            "Total number of events stored"
        ).map_err(|e| PipelineError::metrics(format!("Failed to create counter: {}", e)))?;
        
        let events_dropped_counter = Counter::new(
            "siem_events_dropped_total",
            "Total number of events dropped"
        ).map_err(|e| PipelineError::metrics(format!("Failed to create counter: {}", e)))?;
        
        let events_failed_counter = Counter::new(
            "siem_events_failed_total",
            "Total number of events that failed processing"
        ).map_err(|e| PipelineError::metrics(format!("Failed to create counter: {}", e)))?;
        
        let processing_time_histogram = Histogram::with_opts(
            prometheus::HistogramOpts::new(
                "siem_processing_time_seconds",
                "Time spent processing events"
            ).buckets(vec![0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0])
        ).map_err(|e| PipelineError::metrics(format!("Failed to create histogram: {}", e)))?;
        
        let queue_depth_gauge = Gauge::new(
            "siem_queue_depth",
            "Current depth of processing queue"
        ).map_err(|e| PipelineError::metrics(format!("Failed to create gauge: {}", e)))?;
        
        let active_connections_gauge = Gauge::new(
            "siem_active_connections",
            "Number of active connections"
        ).map_err(|e| PipelineError::metrics(format!("Failed to create gauge: {}", e)))?;
        
        let component_status_gauge = Gauge::new(
            "siem_component_status",
            "Status of pipeline components (0=stopped, 1=starting, 2=healthy, 3=degraded, 4=unhealthy, 5=stopping)"
        ).map_err(|e| PipelineError::metrics(format!("Failed to create gauge: {}", e)))?;
        
        // Register metrics
        registry.register(Box::new(events_ingested_counter.clone()))
            .map_err(|e| PipelineError::metrics(format!("Failed to register metric: {}", e)))?;
        registry.register(Box::new(events_processed_counter.clone()))
            .map_err(|e| PipelineError::metrics(format!("Failed to register metric: {}", e)))?;
        registry.register(Box::new(events_stored_counter.clone()))
            .map_err(|e| PipelineError::metrics(format!("Failed to register metric: {}", e)))?;
        registry.register(Box::new(events_dropped_counter.clone()))
            .map_err(|e| PipelineError::metrics(format!("Failed to register metric: {}", e)))?;
        registry.register(Box::new(events_failed_counter.clone()))
            .map_err(|e| PipelineError::metrics(format!("Failed to register metric: {}", e)))?;
        registry.register(Box::new(processing_time_histogram.clone()))
            .map_err(|e| PipelineError::metrics(format!("Failed to register metric: {}", e)))?;
        registry.register(Box::new(queue_depth_gauge.clone()))
            .map_err(|e| PipelineError::metrics(format!("Failed to register metric: {}", e)))?;
        registry.register(Box::new(active_connections_gauge.clone()))
            .map_err(|e| PipelineError::metrics(format!("Failed to register metric: {}", e)))?;
        registry.register(Box::new(component_status_gauge.clone()))
            .map_err(|e| PipelineError::metrics(format!("Failed to register metric: {}", e)))?;
        
        let now = Utc::now();
        
        Ok(MetricsCollector {
            config: config.clone(),
            start_time: Instant::now(),
            registry,
            events_ingested_counter,
            events_processed_counter,
            events_stored_counter,
            events_dropped_counter,
            events_failed_counter,
            processing_time_histogram,
            queue_depth_gauge,
            active_connections_gauge,
            component_status_gauge,
            system_metrics: Arc::new(RwLock::new(SystemMetrics {
                timestamp: now,
                cpu_usage: 0.0,
                memory_usage: 0.0,
                disk_usage: 0.0,
                network_rx_bytes: 0,
                network_tx_bytes: 0,
                open_file_descriptors: 0,
                thread_count: 0,
            })),
            pipeline_metrics: Arc::new(RwLock::new(PipelineMetrics {
                timestamp: now,
                events_ingested: 0,
                events_processed: 0,
                events_stored: 0,
                events_dropped: 0,
                events_failed: 0,
                processing_rate_per_sec: 0.0,
                avg_processing_time_ms: 0.0,
                queue_depth: 0,
                active_connections: 0,
                error_rate: 0.0,
                uptime_seconds: 0,
            })),
            component_metrics: Arc::new(RwLock::new(HashMap::new())),
            alert_metrics: Arc::new(RwLock::new(AlertMetrics {
                timestamp: now,
                alerts_triggered: 0,
                alerts_resolved: 0,
                active_alerts: 0,
                alert_rate_per_hour: 0.0,
                avg_resolution_time_minutes: 0.0,
                severity_breakdown: HashMap::new(),
            })),
            performance_metrics: Arc::new(RwLock::new(PerformanceMetrics {
                timestamp: now,
                throughput_events_per_sec: 0.0,
                latency_p50_ms: 0.0,
                latency_p95_ms: 0.0,
                latency_p99_ms: 0.0,
                resource_utilization: 0.0,
                bottleneck_component: None,
                optimization_suggestions: Vec::new(),
            })),
            historical_metrics: Arc::new(RwLock::new(Vec::new())),
            latency_samples: Arc::new(RwLock::new(Vec::new())),
            throughput_samples: Arc::new(RwLock::new(Vec::new())),
        })
    }
    
    pub async fn start_collection(&self) -> Result<()> {
        info!("Starting metrics collection");
        
        // Start system metrics collection
        let system_metrics = self.system_metrics.clone();
        tokio::spawn(async move {
            let mut interval = interval(TokioDuration::from_secs(10));
            loop {
                interval.tick().await;
                if let Err(e) = Self::collect_system_metrics(&system_metrics).await {
                    error!("Failed to collect system metrics: {}", e);
                }
            }
        });
        
        // Start pipeline metrics aggregation
        let pipeline_metrics = self.pipeline_metrics.clone();
        let historical_metrics = self.historical_metrics.clone();
        let start_time = self.start_time;
        tokio::spawn(async move {
            let mut interval = interval(TokioDuration::from_secs(60));
            loop {
                interval.tick().await;
                Self::aggregate_pipeline_metrics(&pipeline_metrics, &historical_metrics, start_time).await;
            }
        });
        
        // Start performance analysis
        let performance_metrics = self.performance_metrics.clone();
        let latency_samples = self.latency_samples.clone();
        let throughput_samples = self.throughput_samples.clone();
        let component_metrics = self.component_metrics.clone();
        tokio::spawn(async move {
            let mut interval = interval(TokioDuration::from_secs(30));
            loop {
                interval.tick().await;
                Self::analyze_performance(&performance_metrics, &latency_samples, &throughput_samples, &component_metrics).await;
            }
        });
        
        Ok(())
    }
    
    async fn collect_system_metrics(system_metrics: &Arc<RwLock<SystemMetrics>>) -> Result<()> {
        // In a real implementation, this would use system APIs to collect actual metrics
        // For now, we'll simulate some basic metrics
        
        let mut metrics = system_metrics.write().await;
        metrics.timestamp = Utc::now();
        
        // Simulate CPU usage (would use sysinfo or similar crate)
        metrics.cpu_usage = (rand::random::<u64>() % 100) as f64;
        
        // Simulate memory usage
        metrics.memory_usage = 50.0 + (rand::random::<u64>() % 30) as f64;
        
        // Simulate disk usage
        metrics.disk_usage = 20.0 + (rand::random::<u64>() % 10) as f64;
        
        // Simulate network metrics
        metrics.network_rx_bytes += (rand::random::<u64>() % 10000) + 1000;
        metrics.network_tx_bytes += (rand::random::<u64>() % 8000) + 800;
        
        // Simulate file descriptors and threads
        metrics.open_file_descriptors = 100 + (rand::random::<u64>() % 50);
        metrics.thread_count = 20 + (rand::random::<u64>() % 10);
        
        debug!("System metrics updated: CPU {:.1}%, Memory {:.1}%", 
               metrics.cpu_usage, metrics.memory_usage);
        
        Ok(())
    }
    
    async fn aggregate_pipeline_metrics(
        pipeline_metrics: &Arc<RwLock<PipelineMetrics>>,
        historical_metrics: &Arc<RwLock<Vec<PipelineMetrics>>>,
        start_time: Instant
    ) {
        let mut metrics = pipeline_metrics.write().await;
        metrics.timestamp = Utc::now();
        metrics.uptime_seconds = start_time.elapsed().as_secs();
        
        // Calculate rates and averages
        if metrics.uptime_seconds > 0 {
            metrics.processing_rate_per_sec = metrics.events_processed as f64 / metrics.uptime_seconds as f64;
        }
        
        if metrics.events_processed > 0 {
            metrics.error_rate = (metrics.events_failed + metrics.events_dropped) as f64 / metrics.events_processed as f64;
        }
        
        // Store historical data (keep last 24 hours)
        {
            let mut historical = historical_metrics.write().await;
            historical.push(metrics.clone());
            
            // Keep only last 24 hours (1440 minutes)
            let len = historical.len();
            if len > 1440 {
                historical.drain(0..len - 1440);
            }
        }
        
        debug!("Pipeline metrics aggregated: {} events/sec, {:.2}% error rate", 
               metrics.processing_rate_per_sec, metrics.error_rate * 100.0);
    }
    
    async fn analyze_performance(
        performance_metrics: &Arc<RwLock<PerformanceMetrics>>,
        latency_samples: &Arc<RwLock<Vec<f64>>>,
        throughput_samples: &Arc<RwLock<Vec<f64>>>,
        component_metrics: &Arc<RwLock<HashMap<String, ComponentMetrics>>>
    ) {
        let mut perf_metrics = performance_metrics.write().await;
        perf_metrics.timestamp = Utc::now();
        
        // Calculate latency percentiles
        {
            let mut samples = latency_samples.write().await;
            if !samples.is_empty() {
                samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
                
                let len = samples.len();
                perf_metrics.latency_p50_ms = samples[len / 2];
                perf_metrics.latency_p95_ms = samples[(len * 95) / 100];
                perf_metrics.latency_p99_ms = samples[(len * 99) / 100];
                
                // Keep only recent samples (last 1000)
                let len = samples.len();
                if len > 1000 {
                    samples.drain(0..len - 1000);
                }
            }
        }
        
        // Calculate throughput
        {
            let throughput = throughput_samples.read().await;
            if !throughput.is_empty() {
                perf_metrics.throughput_events_per_sec = throughput.iter().sum::<f64>() / throughput.len() as f64;
            }
        }
        
        // Identify bottlenecks
        {
            let components = component_metrics.read().await;
            let mut slowest_component = None;
            let mut slowest_time = 0.0;
            
            for (name, metrics) in components.iter() {
                if metrics.avg_response_time_ms > slowest_time {
                    slowest_time = metrics.avg_response_time_ms;
                    slowest_component = Some(name.clone());
                }
            }
            
            perf_metrics.bottleneck_component = slowest_component;
        }
        
        // Generate optimization suggestions
        perf_metrics.optimization_suggestions.clear();
        
        if perf_metrics.latency_p95_ms > 1000.0 {
            perf_metrics.optimization_suggestions.push("High latency detected - consider scaling processing workers".to_string());
        }
        
        if perf_metrics.throughput_events_per_sec < 100.0 {
            perf_metrics.optimization_suggestions.push("Low throughput - check for processing bottlenecks".to_string());
        }
        
        if perf_metrics.resource_utilization > 80.0 {
            perf_metrics.optimization_suggestions.push("High resource utilization - consider adding more resources".to_string());
        }
    }
    
    // Event tracking methods
    pub fn record_event_ingested(&self) {
        self.events_ingested_counter.inc();
    }
    
    pub fn record_event_processed(&self, processing_time_ms: f64) {
        self.events_processed_counter.inc();
        self.processing_time_histogram.observe(processing_time_ms / 1000.0);
        
        // Add to latency samples
        tokio::spawn({
            let latency_samples = self.latency_samples.clone();
            async move {
                let mut samples = latency_samples.write().await;
                samples.push(processing_time_ms);
            }
        });
    }
    
    pub fn record_event_stored(&self) {
        self.events_stored_counter.inc();
    }
    
    pub fn record_event_dropped(&self) {
        self.events_dropped_counter.inc();
    }
    
    pub fn record_event_failed(&self) {
        self.events_failed_counter.inc();
    }
    
    pub fn update_queue_depth(&self, depth: u64) {
        self.queue_depth_gauge.set(depth as f64);
    }
    
    pub fn update_active_connections(&self, count: u64) {
        self.active_connections_gauge.set(count as f64);
    }
    
    pub async fn update_component_status(&self, component: &str, status: ComponentStatus) {
        let status_value = match status {
            ComponentStatus::Stopped => 0.0,
            ComponentStatus::Starting => 1.0,
            ComponentStatus::Healthy => 2.0,
            ComponentStatus::Degraded => 3.0,
            ComponentStatus::Unhealthy => 4.0,
            ComponentStatus::Stopping => 5.0,
        };
        
        self.component_status_gauge.set(status_value);
        
        // Update component metrics
        {
            let mut components = self.component_metrics.write().await;
            let component_metrics = components.entry(component.to_string()).or_insert_with(|| {
                ComponentMetrics {
                    component_name: component.to_string(),
                    timestamp: Utc::now(),
                    status: ComponentStatus::Starting,
                    events_processed: 0,
                    errors: 0,
                    avg_response_time_ms: 0.0,
                    last_activity: None,
                    custom_metrics: HashMap::new(),
                }
            });
            
            component_metrics.status = status;
            component_metrics.timestamp = Utc::now();
        }
    }
    
    pub async fn record_component_activity(&self, component: &str, response_time_ms: f64, success: bool) {
        let mut components = self.component_metrics.write().await;
        let component_metrics = components.entry(component.to_string()).or_insert_with(|| {
            ComponentMetrics {
                component_name: component.to_string(),
                timestamp: Utc::now(),
                status: ComponentStatus::Healthy,
                events_processed: 0,
                errors: 0,
                avg_response_time_ms: 0.0,
                last_activity: None,
                custom_metrics: HashMap::new(),
            }
        });
        
        component_metrics.events_processed += 1;
        component_metrics.last_activity = Some(Utc::now());
        
        if !success {
            component_metrics.errors += 1;
        }
        
        // Update moving average of response time
        if component_metrics.avg_response_time_ms == 0.0 {
            component_metrics.avg_response_time_ms = response_time_ms;
        } else {
            component_metrics.avg_response_time_ms = 
                (component_metrics.avg_response_time_ms + response_time_ms) / 2.0;
        }
    }
    
    pub async fn update_pipeline_stats(&self, stats: &std::collections::HashMap<String, crate::ingestion::IngestionStats>) -> Result<()> {
        let mut pipeline_metrics = self.pipeline_metrics.write().await;
        
        // Aggregate stats from all sources
        let mut total_events = 0;
        let mut total_bytes = 0;
        let mut total_errors = 0;
        let mut active_connections = 0;
        
        for (source_name, source_stats) in stats {
            total_events += source_stats.events_received;
            total_bytes += source_stats.bytes_received;
            total_errors += source_stats.errors;
            
            if matches!(source_stats.connection_status, crate::ingestion::ConnectionStatus::Connected) {
                active_connections += 1;
            }
            
            // Update component metrics for each source
            let status = match source_stats.connection_status {
                crate::ingestion::ConnectionStatus::Connected => ComponentStatus::Healthy,
                crate::ingestion::ConnectionStatus::Connecting => ComponentStatus::Starting,
                crate::ingestion::ConnectionStatus::Disconnected => ComponentStatus::Stopped,
                crate::ingestion::ConnectionStatus::Error(_) => ComponentStatus::Unhealthy,
            };
            
            self.update_component_status(source_name, status).await;
        }
        
        // Update pipeline metrics
        pipeline_metrics.events_ingested = total_events;
        pipeline_metrics.active_connections = active_connections;
        pipeline_metrics.timestamp = Utc::now();
        
        // Update Prometheus counters
        self.events_ingested_counter.inc_by(total_events as f64);
        self.active_connections_gauge.set(active_connections as f64);
        
        debug!("Updated pipeline stats: {} events, {} active connections", total_events, active_connections);
        
        Ok(())
    }
    
    // Getter methods
    pub async fn get_system_metrics(&self) -> SystemMetrics {
        let metrics = self.system_metrics.read().await;
        metrics.clone()
    }
    
    pub async fn get_pipeline_metrics(&self) -> PipelineMetrics {
        let metrics = self.pipeline_metrics.read().await;
        metrics.clone()
    }
    
    pub async fn get_component_metrics(&self) -> HashMap<String, ComponentMetrics> {
        let metrics = self.component_metrics.read().await;
        metrics.clone()
    }
    
    pub async fn get_performance_metrics(&self) -> PerformanceMetrics {
        let metrics = self.performance_metrics.read().await;
        metrics.clone()
    }
    
    pub async fn get_historical_metrics(&self, hours: u32) -> Vec<PipelineMetrics> {
        let historical = self.historical_metrics.read().await;
        let cutoff_time = Utc::now() - Duration::hours(hours as i64);
        
        historical.iter()
            .filter(|m| m.timestamp >= cutoff_time)
            .cloned()
            .collect()
    }
    
    pub fn get_prometheus_metrics(&self) -> Result<String> {
        let encoder = TextEncoder::new();
        let metric_families = self.registry.gather();
        
        let mut buffer = Vec::new();
        encoder.encode(&metric_families, &mut buffer)
            .map_err(|e| PipelineError::metrics(format!("Failed to encode metrics: {}", e)))?;
        
        String::from_utf8(buffer)
            .map_err(|e| PipelineError::metrics(format!("Failed to convert metrics to string: {}", e)))
    }
    
    pub async fn get_health_summary(&self) -> serde_json::Value {
        let system = self.get_system_metrics().await;
        let pipeline = self.get_pipeline_metrics().await;
        let components = self.get_component_metrics().await;
        let performance = self.get_performance_metrics().await;
        
        let healthy_components = components.values()
            .filter(|c| matches!(c.status, ComponentStatus::Healthy))
            .count();
        
        let total_components = components.len();
        
        let overall_health = if healthy_components == total_components && pipeline.error_rate < 0.05 {
            "healthy"
        } else if healthy_components > total_components / 2 && pipeline.error_rate < 0.20 {
            "degraded"
        } else {
            "unhealthy"
        };
        
        serde_json::json!({
            "status": overall_health,
            "timestamp": Utc::now(),
            "uptime_seconds": pipeline.uptime_seconds,
            "system": {
                "cpu_usage": system.cpu_usage,
                "memory_usage": system.memory_usage,
                "disk_usage": system.disk_usage
            },
            "pipeline": {
                "events_processed": pipeline.events_processed,
                "processing_rate": pipeline.processing_rate_per_sec,
                "error_rate": pipeline.error_rate,
                "queue_depth": pipeline.queue_depth
            },
            "performance": {
                "throughput": performance.throughput_events_per_sec,
                "latency_p95_ms": performance.latency_p95_ms,
                "bottleneck": performance.bottleneck_component
            },
            "components": {
                "healthy": healthy_components,
                "total": total_components,
                "details": components
            }
        })
    }
    
    pub async fn export_metrics(&self, format: &str) -> Result<String> {
        match format.to_lowercase().as_str() {
            "prometheus" => self.get_prometheus_metrics(),
            "json" => {
                let health = self.get_health_summary().await;
                serde_json::to_string_pretty(&health)
                    .map_err(|e| PipelineError::serialization(format!("Failed to serialize metrics: {}", e)))
            }
            _ => Err(PipelineError::bad_request(format!("Unsupported metrics format: {}", format)))
        }
    }
}

// Helper trait for components to report metrics
#[async_trait::async_trait]
pub trait MetricsReporter {
    async fn report_activity(&self, metrics: &MetricsCollector, response_time_ms: f64, success: bool);
    async fn report_status(&self, metrics: &MetricsCollector, status: ComponentStatus);
    fn component_name(&self) -> &str;
}

// Utility functions
pub fn calculate_percentile(values: &[f64], percentile: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    
    let mut sorted_values = values.to_vec();
    sorted_values.sort_by(|a, b| a.partial_cmp(b).unwrap());
    
    let index = ((percentile / 100.0) * (sorted_values.len() - 1) as f64).round() as usize;
    sorted_values[index.min(sorted_values.len() - 1)]
}

pub fn calculate_moving_average(values: &[f64], window_size: usize) -> Vec<f64> {
    if values.len() < window_size {
        return vec![values.iter().sum::<f64>() / values.len() as f64];
    }
    
    values.windows(window_size)
        .map(|window| window.iter().sum::<f64>() / window_size as f64)
        .collect()
}

// Mock random function for simulation (would be removed in production)
mod rand {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::time::{SystemTime, UNIX_EPOCH};
    
    pub fn random<T>() -> T 
    where 
        T: From<u64> + std::ops::Rem<Output = T> + Copy,
        u64: From<T>,
    {
        let mut hasher = DefaultHasher::new();
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos().hash(&mut hasher);
        let hash = hasher.finish();
        T::from(hash % 1000)
    }
}