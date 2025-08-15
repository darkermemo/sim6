use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

/// Comprehensive health summary for real-time monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthSummary {
    pub ts: DateTime<Utc>,
    pub overall: OverallStatus,
    pub errors: u32,
    pub pipeline: PipelineMetrics,
    pub kafka
    : KafkaMetrics,
    pub redis: RedisMetrics,
    pub clickhouse: ClickHouseMetrics,
    pub services: ServiceMetrics,
    pub ui: UiMetrics,
}

impl Default for HealthSummary {
    fn default() -> Self {
        Self {
            ts: chrono::Utc::now(),
            overall: OverallStatus::Up,
            errors: 0,
            pipeline: PipelineMetrics {
                eps_raw: 0,
                eps_parsed: 0,
                parse_success_pct: 100.0,
                dlq_eps: 0,
                ingest_latency_ms_p50: 0,
                ingest_latency_ms_p95: 0,
            },
            kafka: KafkaMetrics {
                ok: true,
                brokers: vec![],
                topics: std::collections::HashMap::new(),
                consumer_groups: vec![],
                bytes_in_sec: 0,
                bytes_out_sec: 0,
            },
            redis: RedisMetrics {
                ok: true,
                role: "unknown".to_string(),
                connected_clients: 0,
                ops_per_sec: 0,
                used_memory_mb: 0,
                maxmemory_mb: 0,
                hit_ratio_pct: 0.0,
                evictions_per_min: 0,
            },
            clickhouse: ClickHouseMetrics {
                ok: true,
                version: "unknown".to_string(),
                inserts_per_sec: 0,
                queries_per_sec: 0,
                last_event_ts: None,
                ingest_delay_ms: 0,
                parts: 0,
                merges_in_progress: 0,
                replication_lag_s: 0,
            },
            services: ServiceMetrics {
                ingestors: vec![],
                parsers: vec![],
                detectors: vec![],
                sinks: vec![],
            },
            ui: UiMetrics {
                sse_clients: 0,
                ws_clients: 0,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OverallStatus {
    Up,
    Degraded,
    Down,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineMetrics {
    pub eps_raw: u32,
    pub eps_parsed: u32,
    pub parse_success_pct: f64,
    pub dlq_eps: u32,
    pub ingest_latency_ms_p50: u32,
    pub ingest_latency_ms_p95: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KafkaMetrics {
    pub ok: bool,
    pub brokers: Vec<String>,
    pub topics: HashMap<String, TopicMetrics>,
    pub consumer_groups: Vec<ConsumerGroupMetrics>,
    pub bytes_in_sec: u64,
    pub bytes_out_sec: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicMetrics {
    pub ok: bool,
    pub partitions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumerGroupMetrics {
    pub group: String,
    pub lag: u64,
    pub tps: u32,
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisMetrics {
    pub ok: bool,
    pub role: String,
    pub connected_clients: u32,
    pub ops_per_sec: u32,
    pub used_memory_mb: u32,
    pub maxmemory_mb: u32,
    pub hit_ratio_pct: f64,
    pub evictions_per_min: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickHouseMetrics {
    pub ok: bool,
    pub version: String,
    pub inserts_per_sec: u32,
    pub queries_per_sec: u32,
    pub last_event_ts: Option<DateTime<Utc>>,
    pub ingest_delay_ms: u32,
    pub parts: u32,
    pub merges_in_progress: u32,
    pub replication_lag_s: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceMetrics {
    pub ingestors: Vec<ServiceInfo>,
    pub parsers: Vec<ServiceInfo>,
    pub detectors: Vec<ServiceInfo>,
    pub sinks: Vec<ServiceInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceInfo {
    pub name: String,
    pub ok: bool,
    #[serde(flatten)]
    pub metrics: ServiceSpecificMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ServiceSpecificMetrics {
    Ingestor { rps: u32 },
    Parser { parse_eps: u32, error_eps: u32 },
    Detector { alerts_per_min: u32, rules_loaded: u32 },
    Sink { batch_ms: u32, ok_batches_pct: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiMetrics {
    pub sse_clients: u32,
    pub ws_clients: u32,
}

// Diagnostic and auto-fix types

#[derive(Debug, Deserialize)]
pub struct DiagnoseRequest {
    pub component: String,
}

#[derive(Debug, Serialize)]
pub struct DiagnoseResponse {
    pub component: String,
    pub status: String,
    pub details: serde_json::Value,
    pub issues: Vec<HealthIssue>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct HealthIssue {
    pub severity: String,
    pub description: String,
    pub playbook: Option<String>,
    pub auto_fixable: bool,
}

#[derive(Debug, Deserialize)]
pub struct AutoFixRequest {
    pub kind: String,
    pub params: serde_json::Value,
    pub confirm: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct AutoFixResponse {
    pub success: bool,
    pub message: String,
    pub actions_taken: Vec<String>,
    pub dry_run: bool,
}

// SSE delta updates
#[derive(Debug, Clone, Serialize)]
pub struct HealthDelta {
    pub ts: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pipeline: Option<PipelineMetrics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kafka: Option<KafkaMetrics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redis: Option<RedisMetrics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clickhouse: Option<ClickHouseMetrics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub services: Option<ServiceMetrics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overall: Option<OverallStatus>,
}

// Enhanced health summary with error detection
#[derive(Debug, Clone, Serialize)]
pub struct HealthSummaryWithErrors {
    #[serde(flatten)]
    pub health: HealthSummary,
    pub active_errors: Vec<DetectedError>,
    pub total_active_errors: u32,
    pub auto_fixes_triggered: u32,
}

// Forward declaration for DetectedError (will be imported from health module)
pub use crate::v2::health::error_detector::DetectedError;
