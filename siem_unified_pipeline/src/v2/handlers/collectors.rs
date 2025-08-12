use axum::{
    extract::{State, Path, Query},
    Json,
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use chrono::Utc;

use crate::v2::{state::AppState, metrics};
use crate::error::{Result, PipelineError};

#[derive(Debug, Serialize)]
pub struct CollectorHealth {
    pub status: String,
    pub version: String,
    pub uptime_seconds: i64,
    pub listeners: Vec<ListenerStatus>,
    pub spool: SpoolStatus,
    pub egress: EgressStatus,
}

#[derive(Debug, Serialize)]
pub struct ListenerStatus {
    pub name: String,
    pub protocol: String,
    pub address: String,
    pub active_connections: u64,
    pub total_received: u64,
}

#[derive(Debug, Serialize)]
pub struct SpoolStatus {
    pub path: String,
    pub size_bytes: u64,
    pub max_size_bytes: u64,
    pub usage_percent: f32,
    pub events_spooled: u64,
}

#[derive(Debug, Serialize)]
pub struct EgressStatus {
    pub target: String,
    pub connected: bool,
    pub last_success: Option<String>,
    pub events_sent: u64,
    pub events_failed: u64,
    pub current_eps: u64,
}

static START_TIME: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

/// GET /health - Collector health endpoint
pub async fn health(State(_st): State<Arc<AppState>>) -> Result<Json<CollectorHealth>> {
    let start = START_TIME.get_or_init(|| std::time::Instant::now());
    let uptime = start.elapsed().as_secs() as i64;
    
    // In a real implementation, these would come from actual collector state
    let health = CollectorHealth {
        status: "healthy".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: uptime,
        listeners: vec![
            ListenerStatus {
                name: "syslog_tcp".to_string(),
                protocol: "tcp".to_string(),
                address: "0.0.0.0:514".to_string(),
                active_connections: 5,
                total_received: 125000,
            },
            ListenerStatus {
                name: "syslog_udp".to_string(),
                protocol: "udp".to_string(),
                address: "0.0.0.0:514".to_string(),
                active_connections: 0,
                total_received: 75000,
            },
            ListenerStatus {
                name: "http_receiver".to_string(),
                protocol: "http".to_string(),
                address: "0.0.0.0:8514".to_string(),
                active_connections: 2,
                total_received: 50000,
            },
        ],
        spool: SpoolStatus {
            path: "/var/spool/siem-collector".to_string(),
            size_bytes: 1024 * 1024 * 50, // 50MB
            max_size_bytes: 1024 * 1024 * 1024 * 2, // 2GB
            usage_percent: 2.5,
            events_spooled: 1000,
        },
        egress: EgressStatus {
            target: std::env::var("SIEM_BASE_URL").unwrap_or_else(|_| "http://localhost:9999".to_string()),
            connected: true,
            last_success: Some(Utc::now().to_rfc3339()),
            events_sent: 249000,
            events_failed: 1000,
            current_eps: 5000,
        },
    };
    
    Ok(Json(health))
}

/// GET /metrics - Collector metrics endpoint (Prometheus format)
pub async fn metrics() -> Result<String> {
    // In production, this would expose actual collector metrics
    let metrics = r#"# HELP siem_collector_events_received_total Total events received by protocol
# TYPE siem_collector_events_received_total counter
siem_collector_events_received_total{protocol="syslog_tcp"} 125000
siem_collector_events_received_total{protocol="syslog_udp"} 75000
siem_collector_events_received_total{protocol="http"} 50000

# HELP siem_collector_events_sent_total Total events sent to SIEM
# TYPE siem_collector_events_sent_total counter
siem_collector_events_sent_total 249000

# HELP siem_collector_events_failed_total Total events failed to send
# TYPE siem_collector_events_failed_total counter
siem_collector_events_failed_total 1000

# HELP siem_collector_spool_usage_bytes Current spool disk usage
# TYPE siem_collector_spool_usage_bytes gauge
siem_collector_spool_usage_bytes 52428800

# HELP siem_collector_spool_events Current events in spool
# TYPE siem_collector_spool_events gauge
siem_collector_spool_events 1000

# HELP siem_collector_current_eps Current events per second
# TYPE siem_collector_current_eps gauge
siem_collector_current_eps 5000
"#;
    
    Ok(metrics.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CollectorConfigRequest {
    pub tenant_id: u64,
    pub site_tag: String,
    pub source_id: String,
}

/// POST /api/v2/collectors/configure - Generate collector configuration
pub async fn configure(
    State(st): State<Arc<AppState>>,
    Json(req): Json<CollectorConfigRequest>,
) -> Result<String> {
    // Read template
    let template = include_str!("../../../config/collectors/edge-collector.toml");
    
    // Get base URL
    let base_url = std::env::var("SIEM_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:9999".to_string());
    
    // Generate API key (in production, this would be properly managed)
    let api_key = format!("k_{}", ulid::Ulid::new());
    
    // Replace placeholders
    let config = template
        .replace("{{SIEM_BASE_URL}}", &base_url)
        .replace("{{API_KEY}}", &api_key)
        .replace("get_env!(\"TENANT_ID\")", &req.tenant_id.to_string())
        .replace("get_env!(\"SOURCE_ID\")", &format!("\"{}\"", req.source_id))
        .replace("get_env!(\"SITE_TAG\")", &format!("\"{}\"", req.site_tag));
    
    // Store collector registration (simplified - in production use proper storage)
    st.ch.query("INSERT INTO dev.agents (tenant_id, agent_id, source_id, name, kind, api_key) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(req.tenant_id)
        .bind(format!("c_{}", ulid::Ulid::new()))
        .bind(&req.source_id)
        .bind(format!("collector-{}", req.site_tag))
        .bind("edge_collector")
        .bind(&api_key)
        .execute()
        .await
        .map_err(|e| PipelineError::database(format!("Failed to register collector: {}", e)))?;
    
    Ok(config)
}
