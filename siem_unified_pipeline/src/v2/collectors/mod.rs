pub mod kafka_collector;
pub mod redis_collector;
pub mod clickhouse_collector;
pub mod service_collector;

use crate::v2::types::health::*;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::Utc;

/// Main health collector that aggregates metrics from all subsystems
pub struct HealthCollector {
    kafka: kafka_collector::KafkaCollector,
    redis: redis_collector::RedisCollector,
    clickhouse: clickhouse_collector::ClickHouseCollector,
    services: service_collector::ServiceCollector,
    events_table: String,
    // Cache for performance
    last_summary: Arc<RwLock<Option<HealthSummary>>>,
}

impl HealthCollector {
    pub fn new() -> Self {
        Self {
            kafka: kafka_collector::KafkaCollector::new(),
            redis: redis_collector::RedisCollector::new(),
            clickhouse: clickhouse_collector::ClickHouseCollector::new(
                std::env::var("EVENTS_TABLE").unwrap_or_else(|_| "dev.events".to_string()),
            ),
            services: service_collector::ServiceCollector::new(),
            events_table: std::env::var("EVENTS_TABLE").unwrap_or_else(|_| "dev.events".to_string()),
            last_summary: Arc::new(RwLock::new(None)),
        }
    }

    pub fn new_with_events_table(events_table: String) -> Self {
        Self {
            kafka: kafka_collector::KafkaCollector::new(),
            redis: redis_collector::RedisCollector::new(),
            clickhouse: clickhouse_collector::ClickHouseCollector::new(events_table.clone()),
            services: service_collector::ServiceCollector::new(),
            events_table,
            last_summary: Arc::new(RwLock::new(None)),
        }
    }

    /// Collect comprehensive health summary
    pub async fn collect_summary(&self) -> Result<HealthSummary, Box<dyn std::error::Error + Send + Sync>> {
        let start = std::time::Instant::now();
        
        // Collect all metrics in parallel for performance
        let (kafka_metrics, redis_metrics, clickhouse_metrics, service_metrics) = tokio::try_join!(
            self.kafka.collect_metrics(),
            self.redis.collect_metrics(),
            self.clickhouse.collect_metrics(),
            self.services.collect_metrics()
        )?;

        // Calculate pipeline metrics from component data
        let pipeline = self.calculate_pipeline_metrics(&kafka_metrics, &clickhouse_metrics).await?;
        
        // Determine overall status
        let overall = self.determine_overall_status(&kafka_metrics, &redis_metrics, &clickhouse_metrics);
        
        // Count errors across all components
        let errors = self.count_errors(&kafka_metrics, &redis_metrics, &clickhouse_metrics, &service_metrics);

        let summary = HealthSummary {
            ts: Utc::now(),
            overall,
            errors,
            pipeline,
            kafka: kafka_metrics,
            redis: redis_metrics,
            clickhouse: clickhouse_metrics,
            services: service_metrics,
            ui: UiMetrics {
                sse_clients: 0, // TODO: Track actual SSE connections
                ws_clients: 0,
            },
        };

        // Cache the summary
        *self.last_summary.write().await = Some(summary.clone());
        
        tracing::info!("Health summary collected in {:?}", start.elapsed());
        Ok(summary)
    }

    /// Get delta changes since last summary
    pub async fn collect_delta(&self) -> Result<HealthDelta, Box<dyn std::error::Error + Send + Sync>> {
        let current = self.collect_summary().await?;
        let last = self.last_summary.read().await.clone();

        let delta = match last {
            Some(previous) => self.calculate_delta(&previous, &current),
            None => self.full_delta(&current),
        };

        Ok(delta)
    }

    async fn calculate_pipeline_metrics(
        &self,
        kafka: &KafkaMetrics,
        clickhouse: &ClickHouseMetrics,
    ) -> Result<PipelineMetrics, Box<dyn std::error::Error + Send + Sync>> {
        // Calculate EPS from Kafka consumer groups
        let eps_parsed = kafka.consumer_groups
            .iter()
            .find(|cg| cg.group == "siem-parser")
            .map(|cg| cg.tps)
            .unwrap_or(0);

        let eps_raw = kafka.consumer_groups
            .iter()
            .find(|cg| cg.group == "siem-ingestor")
            .map(|cg| cg.tps)
            .unwrap_or(eps_parsed + 100); // Estimate if not available

        let dlq_eps = kafka.consumer_groups
            .iter()
            .find(|cg| cg.group == "siem-dlq")
            .map(|cg| cg.tps)
            .unwrap_or(0);

        let parse_success_pct = if eps_raw > 0 {
            ((eps_raw - dlq_eps) as f64 / eps_raw as f64) * 100.0
        } else {
            100.0
        };

        Ok(PipelineMetrics {
            eps_raw,
            eps_parsed,
            parse_success_pct,
            dlq_eps,
            ingest_latency_ms_p50: clickhouse.ingest_delay_ms / 2, // Rough estimate
            ingest_latency_ms_p95: clickhouse.ingest_delay_ms,
        })
    }

    fn determine_overall_status(
        &self,
        kafka: &KafkaMetrics,
        redis: &RedisMetrics,
        clickhouse: &ClickHouseMetrics,
    ) -> OverallStatus {
        if !kafka.ok || !redis.ok || !clickhouse.ok {
            return OverallStatus::Down;
        }

        // Check for degraded conditions
        if clickhouse.ingest_delay_ms > 5000 || 
           kafka.consumer_groups.iter().any(|cg| cg.lag > 10000) ||
           redis.hit_ratio_pct < 80.0 {
            return OverallStatus::Degraded;
        }

        OverallStatus::Up
    }

    fn count_errors(
        &self,
        kafka: &KafkaMetrics,
        redis: &RedisMetrics,
        clickhouse: &ClickHouseMetrics,
        services: &ServiceMetrics,
    ) -> u32 {
        let mut errors = 0;

        if !kafka.ok { errors += 1; }
        if !redis.ok { errors += 1; }
        if !clickhouse.ok { errors += 1; }

        errors += services.ingestors.iter().filter(|s| !s.ok).count() as u32;
        errors += services.parsers.iter().filter(|s| !s.ok).count() as u32;
        errors += services.detectors.iter().filter(|s| !s.ok).count() as u32;
        errors += services.sinks.iter().filter(|s| !s.ok).count() as u32;

        errors
    }

    fn calculate_delta(&self, previous: &HealthSummary, current: &HealthSummary) -> HealthDelta {
        HealthDelta {
            ts: current.ts,
            pipeline: if previous.pipeline.eps_raw != current.pipeline.eps_raw ||
                        previous.pipeline.eps_parsed != current.pipeline.eps_parsed {
                Some(current.pipeline.clone())
            } else {
                None
            },
            kafka: if previous.kafka.bytes_in_sec != current.kafka.bytes_in_sec {
                Some(current.kafka.clone())
            } else {
                None
            },
            redis: if previous.redis.ops_per_sec != current.redis.ops_per_sec {
                Some(current.redis.clone())
            } else {
                None
            },
            clickhouse: if previous.clickhouse.inserts_per_sec != current.clickhouse.inserts_per_sec {
                Some(current.clickhouse.clone())
            } else {
                None
            },
            services: None, // TODO: Implement service change detection
            errors: if previous.errors != current.errors {
                Some(current.errors)
            } else {
                None
            },
            overall: if std::mem::discriminant(&previous.overall) != std::mem::discriminant(&current.overall) {
                Some(current.overall.clone())
            } else {
                None
            },
        }
    }

    fn full_delta(&self, current: &HealthSummary) -> HealthDelta {
        HealthDelta {
            ts: current.ts,
            pipeline: Some(current.pipeline.clone()),
            kafka: Some(current.kafka.clone()),
            redis: Some(current.redis.clone()),
            clickhouse: Some(current.clickhouse.clone()),
            services: Some(current.services.clone()),
            errors: Some(current.errors),
            overall: Some(current.overall.clone()),
        }
    }
}
