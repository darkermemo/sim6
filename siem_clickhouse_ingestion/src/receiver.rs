//! HTTP receiver module for log ingestion
//! Handles incoming HTTP requests and processes log data

use anyhow::{Context, Result};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::RwLock;
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    cors::CorsLayer,
    decompression::RequestDecompressionLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use axum::error_handling::HandleErrorLayer;
use tracing::{debug, error, info, warn};

use crate::{
    config::{Config, TenantConfig, TenantRegistry},
    metrics::MetricsCollector,
    router::LogRouter,
    schema::LogEvent,
    pool::ChPool,
};
use std::time::{SystemTime, UNIX_EPOCH};
use chrono::{DateTime, Utc};
use uuid;

/// Transform massive_log_gen format to LogEvent
fn transform_massive_log_gen_to_log_event(log_value: Value, tenant_id: &str) -> Result<LogEvent> {
    // Parse timestamp from RFC3339 format to SystemTime
    let timestamp = log_value.get("timestamp")
        .and_then(|v| v.as_str())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc).into())
        .unwrap_or_else(|| SystemTime::now());
    
    let level = log_value.get("level")
        .and_then(|v| v.as_str())
        .unwrap_or("info")
        .to_string();
    
    // Create a meaningful message from the log data
    let message = if let Some(msg) = log_value.get("message").and_then(|v| v.as_str()) {
        msg.to_string()
    } else {
        // Create a message from log_type and other fields
        let log_type = log_value.get("log_type").and_then(|v| v.as_str()).unwrap_or("unknown");
        let vendor = log_value.get("vendor").and_then(|v| v.as_str()).unwrap_or("unknown");
        let product = log_value.get("product").and_then(|v| v.as_str()).unwrap_or("unknown");
        format!("{} {} {} log event", vendor, product, log_type)
    };
    
    let source = log_value.get("source")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            log_value.get("product")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });
    
    // Create fields map with all the original data
    let mut fields = HashMap::new();
    if let Some(obj) = log_value.as_object() {
        for (k, v) in obj {
            if !["timestamp", "level", "message", "source", "tenant_id"].contains(&k.as_str()) {
                fields.insert(k.clone(), v.clone());
            }
        }
    }
    
    // Create LogEvent with transformed data
    let log_event = LogEvent {
        tenant_id: tenant_id.to_string(),
        timestamp,
        level,
        message,
        source,
        fields,
    };
    
    Ok(log_event)
}

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub tenant_registry: Arc<RwLock<TenantRegistry>>,
    pub log_router: Arc<LogRouter>,
    pub metrics: Arc<MetricsCollector>,
    pub ch_pool: Arc<ChPool>,
}

/// Request payload for log ingestion
#[derive(Debug, Deserialize, Serialize)]
pub struct LogIngestionRequest {
    pub logs: Vec<Value>,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

/// Response for log ingestion
#[derive(Debug, Serialize)]
pub struct LogIngestionResponse {
    pub accepted: usize,
    pub rejected: usize,
    pub errors: Vec<String>,
    pub request_id: String,
}

/// Health check response
#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: String,
    pub version: String,
    pub uptime_seconds: u64,
}

/// Tenant information response
#[derive(Debug, Serialize)]
pub struct TenantInfoResponse {
    pub tenant_id: String,
    pub name: String,
    pub table_name: String,
    pub enabled: bool,
    pub rate_limit: RateLimitInfo,
}

#[derive(Debug, Serialize)]
pub struct RateLimitInfo {
    pub requests_per_second: u32,
    pub bytes_per_second: u64,
    pub burst_capacity: u32,
}

/// Response for database pool health endpoint
#[derive(Debug, Serialize)]
pub struct PoolHealthResponse {
    pub active: usize,
    pub idle: usize,
    pub max: usize,
}

/// Rate limiting state
#[derive(Debug, Clone)]
pub struct RateLimitState {
    pub last_reset: Instant,
    pub request_count: u32,
    pub byte_count: u64,
    pub burst_tokens: u32,
}

impl Default for RateLimitState {
    fn default() -> Self {
        Self {
            last_reset: Instant::now(),
            request_count: 0,
            byte_count: 0,
            burst_tokens: 0,
        }
    }
}

/// HTTP receiver for log ingestion
pub struct LogReceiver {
    state: AppState,
    rate_limits: Arc<RwLock<HashMap<String, RateLimitState>>>,
    start_time: Instant,
}

impl LogReceiver {
    /// Create a new log receiver
    pub fn new(
        config: Arc<Config>,
        tenant_registry: Arc<RwLock<TenantRegistry>>,
        log_router: Arc<LogRouter>,
        metrics: Arc<MetricsCollector>,
        ch_pool: Arc<ChPool>,
    ) -> Self {
        let state = AppState {
            config,
            tenant_registry,
            log_router,
            metrics,
            ch_pool,
        };

        Self {
            state,
            rate_limits: Arc::new(RwLock::new(HashMap::new())),
            start_time: Instant::now(),
        }
    }

    /// Create the HTTP router
    pub fn create_router(&self) -> Router {
        let cors = CorsLayer::new()
            .allow_origin(tower_http::cors::Any)
            .allow_methods([axum::http::Method::GET, axum::http::Method::POST])
            .allow_headers(tower_http::cors::Any);

        let middleware = ServiceBuilder::new()
            .layer(TraceLayer::new_for_http())
            .layer(CompressionLayer::new())
            .layer(RequestDecompressionLayer::new())
            .layer(cors)
            .layer(TimeoutLayer::new(Duration::from_secs(
                self.state.config.server.request_timeout_secs as u64,
            )));

        Router::new()
            .route("/health", get(health_check))
            .route("/api/v1/db/pool", get(db_pool_health))
            .route("/metrics", get(metrics_handler))
            .route("/debug/:tid", get(|Path(tid): Path<String>| async move { format!("OK:{tid}") }))
            .route("/tenants/:tenant_id", get(tenant_info))
            .route("/ingest/:tenant_id", post(ingest_logs))
            .route("/ingest/:tenant_id/batch", post(ingest_logs_batch))
            .with_state(self.state.clone())
            .layer(middleware)
    }

    /// Check rate limits for a tenant
    async fn check_rate_limit(
        &self,
        tenant_id: &str,
        tenant_config: &TenantConfig,
        request_size: u64,
    ) -> Result<bool> {
        let mut rate_limits = self.rate_limits.write().await;
        let now = Instant::now();
        
        let state = rate_limits
            .entry(tenant_id.to_string())
            .or_insert_with(RateLimitState::default);

        // Reset counters if a second has passed
        if now.duration_since(state.last_reset) >= Duration::from_secs(1) {
            state.request_count = 0;
            state.byte_count = 0;
            state.burst_tokens = tenant_config.rate_limit.burst_capacity;
            state.last_reset = now;
        }

        // Check request rate limit
        if state.request_count >= tenant_config.rate_limit.requests_per_second {
            if state.burst_tokens == 0 {
                return Ok(false);
            }
            state.burst_tokens -= 1;
        }

        // Check byte rate limit
        if state.byte_count + request_size > tenant_config.rate_limit.bytes_per_second {
            return Ok(false);
        }

        // Update counters
        state.request_count += 1;
        state.byte_count += request_size;

        Ok(true)
    }
}

/// Health check handler
async fn health_check(State(state): State<AppState>) -> Result<Json<HealthResponse>, StatusCode> {
    let response = HealthResponse {
        status: "healthy".to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: 0, // TODO: Calculate actual uptime
    };

    Ok(Json(response))
}

/// Metrics handler
async fn metrics_handler(State(state): State<AppState>) -> Result<String, StatusCode> {
    let snapshot = state.metrics.get_snapshot().await;
    let prometheus_metrics = crate::metrics::export_prometheus_metrics(&snapshot);
    Ok(prometheus_metrics)
}

/// Database pool health handler
async fn db_pool_health(State(state): State<AppState>) -> Result<Json<PoolHealthResponse>, StatusCode> {
    let pool_stats = state.ch_pool.get_stats().await;
    
    let response = PoolHealthResponse {
        active: pool_stats.active as usize,
        idle: pool_stats.idle as usize,
        max: pool_stats.max as usize,
    };
    
    Ok(Json(response))
}

/// Tenant information handler
async fn tenant_info(
    Path(tenant_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<TenantInfoResponse>, StatusCode> {
    debug!("Received tenant info request for tenant: {}", tenant_id);
    let registry = state.tenant_registry.read().await;
    
    match registry.get_tenant(&tenant_id) {
        Some(tenant) => {
            let response = TenantInfoResponse {
                tenant_id: tenant.id.clone(),
                name: tenant.name.clone(),
                table_name: tenant.table_name.clone(),
                enabled: tenant.enabled,
                rate_limit: RateLimitInfo {
                    requests_per_second: tenant.rate_limit.requests_per_second,
                    bytes_per_second: tenant.rate_limit.bytes_per_second,
                    burst_capacity: tenant.rate_limit.burst_capacity,
                },
            };
            Ok(Json(response))
        }
        None => {
            warn!("Tenant not found: {}", tenant_id);
            Err(StatusCode::NOT_FOUND)
        }
    }
}

/// Log ingestion handler
async fn ingest_logs(
    Path(tenant_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Json(request): axum::extract::Json<LogIngestionRequest>,
) -> Result<Json<LogIngestionResponse>, StatusCode> {
    let request_id = uuid::Uuid::new_v4().to_string();
    let start_time = Instant::now();
    
    debug!(
        "Processing log ingestion request for tenant: {}, logs: {}, request_id: {}",
        tenant_id,
        request.logs.len(),
        request_id
    );

    // Get tenant configuration
    let registry = state.tenant_registry.read().await;
    let tenant_config = match registry.get_tenant(&tenant_id) {
        Some(config) if config.enabled => config.clone(),
        Some(_) => {
            warn!("Tenant is disabled: {}", tenant_id);
            return Err(StatusCode::FORBIDDEN);
        }
        None => {
            warn!("Tenant not found: {}", tenant_id);
            return Err(StatusCode::NOT_FOUND);
        }
    };
    drop(registry);

    // Authenticate request
    if state.config.security.require_auth {
        let api_key = headers
            .get("x-api-key")
            .and_then(|h| h.to_str().ok())
            .unwrap_or_default();
        
        if api_key != tenant_config.api_key {
            warn!("Invalid API key for tenant: {}", tenant_id);
            state.metrics.record_error("auth", Some(&tenant_id));
            return Err(StatusCode::UNAUTHORIZED);
        }
    }

    // Calculate request size
    let request_size = serde_json::to_vec(&request)
        .map(|v| v.len() as u64)
        .unwrap_or(0);

    // Check rate limits (placeholder - would need actual implementation)
    // if !check_rate_limit(&tenant_id, &tenant_config, request_size).await {
    //     warn!("Rate limit exceeded for tenant: {}", tenant_id);
    //     state.metrics.increment_counter("rate_limit_exceeded", &[("tenant", &tenant_id)]).await;
    //     return Err(StatusCode::TOO_MANY_REQUESTS);
    // }

    // Process logs
    let mut accepted = 0;
    let mut rejected = 0;
    let mut errors = Vec::new();

    for (index, log_value) in request.logs.into_iter().enumerate() {
        // Try to parse as LogEvent first, if that fails, try to transform from massive_log_gen format
        let log_event_result = serde_json::from_value::<LogEvent>(log_value.clone())
            .or_else(|_| transform_massive_log_gen_to_log_event(log_value, &tenant_id));
            
        match log_event_result {
            Ok(log_event) => {
                match state.log_router.route_log(log_event).await {
                    Ok(_) => accepted += 1,
                    Err(e) => {
                        rejected += 1;
                        errors.push(format!("Log {}: {}", index, e));
                        error!("Failed to route log {}: {}", index, e);
                    }
                }
            }
            Err(e) => {
                rejected += 1;
                errors.push(format!("Log {}: Invalid format - {}", index, e));
                debug!("Failed to parse log {}: {}", index, e);
            }
        }
    }

    // Update metrics
    let duration = start_time.elapsed();
    state.metrics.record_event_processed(&tenant_id, request_size as usize, duration);
    if rejected > 0 {
        state.metrics.record_error("validation", Some(&tenant_id));
    }

    info!(
        "Completed log ingestion for tenant: {}, accepted: {}, rejected: {}, duration: {:?}, request_id: {}",
        tenant_id, accepted, rejected, duration, request_id
    );

    let response = LogIngestionResponse {
        accepted,
        rejected,
        errors,
        request_id,
    };

    Ok(Json(response))
}

/// Batch log ingestion handler (alias for regular ingestion)
async fn ingest_logs_batch(
    tenant_id: Path<String>,
    state: State<AppState>,
    headers: HeaderMap,
    request: axum::extract::Json<LogIngestionRequest>,
) -> Result<Json<LogIngestionResponse>, StatusCode> {
    ingest_logs(tenant_id, state, headers, request).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{RateLimitConfig, TenantConfig};
    use std::collections::HashMap;

    #[test]
    fn test_rate_limit_state_default() {
        let state = RateLimitState::default();
        assert_eq!(state.request_count, 0);
        assert_eq!(state.byte_count, 0);
        assert_eq!(state.burst_tokens, 0);
    }

    #[test]
    fn test_log_ingestion_request_deserialization() {
        let json = r#"{
            "logs": [{"message": "test"}],
            "metadata": {"source": "test"}
        }"#;
        
        let request: LogIngestionRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.logs.len(), 1);
        assert_eq!(request.metadata.get("source").unwrap(), "test");
    }

    #[test]
    fn test_health_response_serialization() {
        let response = HealthResponse {
            status: "healthy".to_string(),
            timestamp: "2023-01-01T00:00:00Z".to_string(),
            version: "1.0.0".to_string(),
            uptime_seconds: 3600,
        };
        
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("healthy"));
        assert!(json.contains("3600"));
    }
}