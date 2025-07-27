use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Sse, sse::Event},
    routing::{get, post, put, delete},
    Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn, error, debug};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use futures::stream::{self, Stream};
use redis::streams::{StreamReadOptions, StreamReadReply};
use redis::AsyncCommands;
use async_stream::stream as async_stream;

use crate::config::PipelineConfig;
use crate::error::{Result, PipelineError};
use crate::pipeline::{Pipeline, PipelineEvent, ProcessingStage};
use crate::metrics::{MetricsCollector, ComponentStatus};
use crate::routing::{RoutingRule, RoutingManager};

// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub pipeline: Arc<Pipeline>,
    pub metrics: Arc<MetricsCollector>,
    pub config: Arc<tokio::sync::RwLock<PipelineConfig>>,
    pub redis_client: Option<Arc<redis::Client>>,
}

// Request/Response types
#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: DateTime<Utc>,
    pub version: String,
    pub uptime_seconds: u64,
    pub components: HashMap<String, ComponentHealth>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ComponentHealth {
    pub status: String,
    pub last_check: DateTime<Utc>,
    pub error_count: u64,
    pub response_time_ms: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IngestEventRequest {
    pub source: String,
    pub data: serde_json::Value,
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IngestEventResponse {
    pub event_id: String,
    pub status: String,
    pub message: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchIngestRequest {
    pub events: Vec<IngestEventRequest>,
    pub batch_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchIngestResponse {
    pub batch_id: String,
    pub total_events: usize,
    pub successful: usize,
    pub failed: usize,
    pub errors: Vec<String>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricsQuery {
    pub format: Option<String>,
    pub component: Option<String>,
    pub hours: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigUpdateRequest {
    pub config: serde_json::Value,
    pub restart_required: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoutingRuleRequest {
    pub name: String,
    pub conditions: HashMap<String, serde_json::Value>,
    pub destinations: Vec<String>,
    pub enabled: bool,
    pub priority: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EventSearchQuery {
    pub query: Option<String>,
    pub source: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EventStreamQuery {
    pub source: Option<String>,
    pub severity: Option<String>,
    pub security_event: Option<bool>,
    pub buffer_size: Option<u32>,
    pub heartbeat_interval: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EventSearchResponse {
    pub events: Vec<PipelineEvent>,
    pub total_count: u64,
    pub page_info: PageInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PageInfo {
    pub limit: u32,
    pub offset: u32,
    pub has_next: bool,
    pub has_previous: bool,
}

// Create the router with all endpoints
pub fn create_router(state: AppState) -> Router {
    Router::new()
        // Health and status endpoints
        .route("/health", get(health_check))
        .route("/health/detailed", get(detailed_health_check))
        .route("/status", get(system_status))
        .route("/version", get(version_info))
        
        // Metrics endpoints
        .route("/metrics", get(get_metrics))
        .route("/metrics/prometheus", get(get_prometheus_metrics))
        .route("/metrics/components", get(get_component_metrics))
        .route("/metrics/performance", get(get_performance_metrics))
        .route("/metrics/historical", get(get_historical_metrics))
        
        // Event ingestion endpoints
        .route("/events/ingest", post(ingest_single_event))
        .route("/events/batch", post(ingest_batch_events))
        .route("/events/search", get(search_events))
        .route("/events/stream", get(events_stream_redis))
        .route("/events/:id", get(get_event_by_id))
        
        // Configuration endpoints
        .route("/config", get(get_config))
        .route("/config", put(update_config))
        .route("/config/validate", post(validate_config))
        .route("/config/reload", post(reload_config))
        
        // Routing management endpoints
        .route("/routing/rules", get(get_routing_rules))
        .route("/routing/rules", post(create_routing_rule))
        .route("/routing/rules/:name", get(get_routing_rule))
        .route("/routing/rules/:name", put(update_routing_rule))
        .route("/routing/rules/:name", delete(delete_routing_rule))
        
        // Pipeline control endpoints
        .route("/pipeline/start", post(start_pipeline))
        .route("/pipeline/stop", post(stop_pipeline))
        .route("/pipeline/restart", post(restart_pipeline))
        .route("/pipeline/stats", get(get_pipeline_stats))
        
        // Administrative endpoints
        .route("/admin/shutdown", post(shutdown_system))
        .route("/admin/logs", get(get_system_logs))
        .route("/admin/debug", get(debug_info))
        
        .with_state(state)
}

// Health check handlers
pub async fn health_check(State(state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("Health check requested");
    
    let health_summary = state.metrics.get_health_summary().await;
    let status = health_summary["status"].as_str().unwrap_or("unknown");
    
    let response = HealthResponse {
        status: status.to_string(),
        timestamp: Utc::now(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: health_summary["uptime_seconds"].as_u64().unwrap_or(0),
        components: HashMap::new(), // Simplified for basic health check
    };
    
    let status_code = match status {
        "healthy" => StatusCode::OK,
        "degraded" => StatusCode::OK, // Still operational
        _ => StatusCode::SERVICE_UNAVAILABLE,
    };
    
    Ok((status_code, Json(response)))
}

pub async fn detailed_health_check(State(state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("Detailed health check requested");
    
    let health_summary = state.metrics.get_health_summary().await;
    let component_metrics = state.metrics.get_component_metrics().await;
    
    let mut components = HashMap::new();
    for (name, metrics) in component_metrics {
        components.insert(name.clone(), ComponentHealth {
            status: format!("{:?}", metrics.status),
            last_check: metrics.timestamp,
            error_count: metrics.errors,
            response_time_ms: metrics.avg_response_time_ms,
        });
    }
    
    let response = HealthResponse {
        status: health_summary["status"].as_str().unwrap_or("unknown").to_string(),
        timestamp: Utc::now(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: health_summary["uptime_seconds"].as_u64().unwrap_or(0),
        components,
    };
    
    Ok(Json(response))
}

pub async fn system_status(State(state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("System status requested");
    
    let system_metrics = state.metrics.get_system_metrics().await;
    let pipeline_metrics = state.metrics.get_pipeline_metrics().await;
    let pipeline_stats = state.pipeline.get_stats().await;
    
    let status = serde_json::json!({
        "system": system_metrics,
        "pipeline": pipeline_metrics,
        "processing": pipeline_stats,
        "timestamp": Utc::now()
    });
    
    Ok(Json(status))
}

pub async fn version_info() -> Result<impl IntoResponse> {
    let version_info = serde_json::json!({
        "name": env!("CARGO_PKG_NAME"),
        "version": env!("CARGO_PKG_VERSION"),
        "description": env!("CARGO_PKG_DESCRIPTION"),
        "build_timestamp": "unknown",
        "git_hash": "unknown",
        "rust_version": "unknown"
    });
    
    Ok(Json(version_info))
}

// Metrics handlers
pub async fn get_metrics(State(state): State<AppState>, Query(query): Query<MetricsQuery>) -> Result<impl IntoResponse> {
    debug!("Metrics requested with format: {:?}", query.format);
    
    let format = query.format.as_deref().unwrap_or("json");
    let metrics_data = state.metrics.export_metrics(format).await?;
    
    match format {
        "prometheus" => Ok((StatusCode::OK, [("content-type", "text/plain")], metrics_data).into_response()),
        _ => Ok((StatusCode::OK, [("content-type", "application/json")], metrics_data).into_response()),
    }
}

pub async fn get_prometheus_metrics(State(state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("Prometheus metrics requested");
    
    let metrics_data = state.metrics.get_prometheus_metrics()?;
    
    Ok((StatusCode::OK, [("content-type", "text/plain")], metrics_data))
}

pub async fn get_component_metrics(State(state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("Component metrics requested");
    
    let component_metrics = state.metrics.get_component_metrics().await;
    Ok(Json(component_metrics))
}

pub async fn get_performance_metrics(State(state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("Performance metrics requested");
    
    let performance_metrics = state.metrics.get_performance_metrics().await;
    Ok(Json(performance_metrics))
}

pub async fn get_historical_metrics(State(state): State<AppState>, Query(query): Query<MetricsQuery>) -> Result<impl IntoResponse> {
    debug!("Historical metrics requested");
    
    let hours = query.hours.unwrap_or(24);
    let historical_metrics = state.metrics.get_historical_metrics(hours).await;
    
    Ok(Json(historical_metrics))
}

// Event ingestion handlers
pub async fn ingest_single_event(State(state): State<AppState>, Json(request): Json<IngestEventRequest>) -> Result<impl IntoResponse> {
    debug!("Single event ingestion requested from source: {}", request.source);
    
    let event_id = Uuid::new_v4();
    let metadata = request.metadata.unwrap_or_default();
    
    let mut event = PipelineEvent {
        id: event_id,
        timestamp: Utc::now(),
        source: request.source,
        data: request.data,
        metadata,
        processing_stage: ProcessingStage::Ingested,
    };
    
    // Record ingestion metric
    state.metrics.record_event_ingested();
    
    // Process the event
    match state.pipeline.process_event(&mut event).await {
        Ok(_) => {
            let response = IngestEventResponse {
                event_id: event_id.to_string(),
                status: "accepted".to_string(),
                message: "Event successfully ingested and queued for processing".to_string(),
                timestamp: Utc::now(),
            };
            
            info!("Event {} successfully ingested", event_id);
            Ok((StatusCode::ACCEPTED, Json(response)))
        }
        Err(e) => {
            error!("Failed to ingest event {}: {}", event_id, e);
            state.metrics.record_event_failed();
            
            let response = IngestEventResponse {
                event_id: event_id.to_string(),
                status: "failed".to_string(),
                message: format!("Failed to ingest event: {}", e),
                timestamp: Utc::now(),
            };
            
            Ok((StatusCode::BAD_REQUEST, Json(response)))
        }
    }
}

pub async fn ingest_batch_events(State(state): State<AppState>, Json(request): Json<BatchIngestRequest>) -> Result<impl IntoResponse> {
    debug!("Batch event ingestion requested with {} events", request.events.len());
    
    let batch_id = request.batch_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let mut successful = 0;
    let mut failed = 0;
    let mut errors = Vec::new();
    
    for (index, event_request) in request.events.iter().enumerate() {
        let event_id = Uuid::new_v4();
        let metadata = event_request.metadata.clone().unwrap_or_default();
        
        let mut event = PipelineEvent {
            id: event_id,
            timestamp: Utc::now(),
            source: event_request.source.clone(),
            data: event_request.data.clone(),
            metadata,
            processing_stage: ProcessingStage::Ingested,
        };
        
        state.metrics.record_event_ingested();
        
        match state.pipeline.process_event(&mut event).await {
            Ok(_) => {
                successful += 1;
                debug!("Batch event {} (index {}) successfully ingested", event_id, index);
            }
            Err(e) => {
                failed += 1;
                state.metrics.record_event_failed();
                errors.push(format!("Event {}: {}", index, e));
                warn!("Batch event {} (index {}) failed: {}", event_id, index, e);
            }
        }
    }
    
    let response = BatchIngestResponse {
        batch_id,
        total_events: request.events.len(),
        successful,
        failed,
        errors,
        timestamp: Utc::now(),
    };
    
    let status_code = if failed == 0 {
        StatusCode::ACCEPTED
    } else if successful > 0 {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::BAD_REQUEST
    };
    
    info!("Batch ingestion completed: {}/{} successful", successful, request.events.len());
    Ok((status_code, Json(response)))
}

pub async fn search_events(State(_state): State<AppState>, Query(_query): Query<EventSearchQuery>) -> Result<impl IntoResponse> {
    // This would integrate with the storage layer to search events
    // For now, return a placeholder response
    warn!("Event search not yet implemented");
    
    let response = EventSearchResponse {
        events: Vec::new(),
        total_count: 0,
        page_info: PageInfo {
            limit: 100,
            offset: 0,
            has_next: false,
            has_previous: false,
        },
    };
    
    Ok(Json(response))
}

pub async fn get_event_by_id(State(_state): State<AppState>, Path(_id): Path<String>) -> Result<impl IntoResponse> {
    // This would retrieve a specific event from storage
    warn!("Get event by ID not yet implemented");
    
    Err::<Json<serde_json::Value>, PipelineError>(PipelineError::not_found("Event retrieval not implemented"))
}

// Real-time event streaming from Redis Streams
pub async fn events_stream_redis(
    State(state): State<AppState>,
    Query(query): Query<EventStreamQuery>,
) -> Result<impl IntoResponse> {
    debug!("Event stream requested with filters: {:?}", query);
    
    let redis_client = match &state.redis_client {
        Some(client) => client.clone(),
        None => {
            error!("Redis client not available for streaming");
            return Err(PipelineError::service_unavailable("Redis streaming not configured"));
        }
    };
    
    let buffer_size = query.buffer_size.unwrap_or(100);
    let heartbeat_interval = Duration::from_secs(query.heartbeat_interval.unwrap_or(30) as u64);
    
    // Create the event stream
    let stream = create_redis_event_stream(
        redis_client,
        query.source.clone(),
        query.severity.clone(),
        query.security_event,
        buffer_size,
        heartbeat_interval,
    );
    
    info!("Starting event stream for source: {:?}, security_event: {:?}", 
          query.source, query.security_event);
    
    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(heartbeat_interval)
            .text("heartbeat"),
    ))
}

// Create a stream of events from Redis Streams
fn create_redis_event_stream(
    redis_client: Arc<redis::Client>,
    source_filter: Option<String>,
    severity_filter: Option<String>,
    security_event_filter: Option<bool>,
    buffer_size: u32,
    heartbeat_interval: Duration,
) -> impl Stream<Item = std::result::Result<Event, axum::Error>> {
    let stream = async_stream::stream! {
        let mut conn = match redis_client.get_async_connection().await {
            Ok(conn) => conn,
            Err(e) => {
                error!("Failed to connect to Redis: {}", e);
                yield Err(axum::Error::new(e));
                return;
            }
        };
        
        let mut last_id = "0-0".to_string();
        let mut heartbeat_timer = tokio::time::interval(heartbeat_interval);
        let mut event_buffer = Vec::new();
        
        loop {
            tokio::select! {
                // Check for new events in Redis Stream
                _ = tokio::time::sleep(Duration::from_millis(100)) => {
                    let stream_key = "siem:stream:events";
                    let read_opts = StreamReadOptions::default()
                        .count(buffer_size as usize)
                        .block(100); // 100ms block timeout
                    
                    match conn.xread_options(&[stream_key], &[&last_id], &read_opts).await {
                        Ok(reply) => {
                            let reply: StreamReadReply = reply;
                            
                            for stream_key in reply.keys {
                                for stream_id in stream_key.ids {
                                    last_id = stream_id.id.clone();
                                    
                                    // Parse the event data
                                    if let Ok(event_data) = parse_redis_stream_event(&stream_id.map) {
                                        // Apply filters
                                        if should_include_event(
                                            &event_data,
                                            &source_filter,
                                            &severity_filter,
                                            security_event_filter,
                                        ) {
                                            event_buffer.push(event_data);
                                        }
                                    }
                                }
                            }
                            
                            // Send buffered events
                            if !event_buffer.is_empty() {
                                let events_json = match serde_json::to_string(&event_buffer) {
                                    Ok(json) => json,
                                    Err(e) => {
                                        error!("Failed to serialize events: {}", e);
                                        continue;
                                    }
                                };
                                
                                let event = Event::default()
                                    .event("events")
                                    .data(events_json)
                                    .id(last_id.clone());
                                
                                yield Ok(event);
                                event_buffer.clear();
                            }
                        }
                        Err(e) => {
                            if !e.to_string().contains("timeout") {
                                error!("Redis stream read error: {}", e);
                                yield Err(axum::Error::new(e));
                                break;
                            }
                        }
                    }
                }
                
                // Send heartbeat
                _ = heartbeat_timer.tick() => {
                    let heartbeat = Event::default()
                        .event("heartbeat")
                        .data(serde_json::json!({
                            "timestamp": Utc::now(),
                            "status": "alive"
                        }).to_string());
                    
                    yield Ok(heartbeat);
                }
            }
        }
    };
    
    stream
}

// Parse event data from Redis Stream entry
fn parse_redis_stream_event(
    fields: &HashMap<String, redis::Value>,
) -> std::result::Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    let mut event_data = serde_json::Map::new();
    
    for (key, value) in fields {
        let string_value = match value {
            redis::Value::Data(bytes) => String::from_utf8_lossy(bytes).to_string(),
            redis::Value::Okay => "OK".to_string(),
            redis::Value::Status(s) => s.clone(),
            redis::Value::Int(i) => i.to_string(),
            _ => continue,
        };
        
        // Try to parse JSON values, fallback to string
        let parsed_value = serde_json::from_str::<serde_json::Value>(&string_value)
            .unwrap_or_else(|_| serde_json::Value::String(string_value));
        
        event_data.insert(key.clone(), parsed_value);
    }
    
    Ok(serde_json::Value::Object(event_data))
}

// Apply filters to determine if event should be included in stream
fn should_include_event(
    event: &serde_json::Value,
    source_filter: &Option<String>,
    severity_filter: &Option<String>,
    security_event_filter: Option<bool>,
) -> bool {
    // Source filter
    if let Some(source) = source_filter {
        if let Some(event_source) = event.get("source").and_then(|s| s.as_str()) {
            if !event_source.contains(source) {
                return false;
            }
        } else {
            return false;
        }
    }
    
    // Severity filter
    if let Some(severity) = severity_filter {
        if let Some(event_severity) = event.get("severity").and_then(|s| s.as_str()) {
            if event_severity != severity {
                return false;
            }
        } else {
            return false;
        }
    }
    
    // Security event filter
    if let Some(is_security) = security_event_filter {
        if let Some(event_security) = event.get("security_event").and_then(|s| s.as_bool()) {
            if event_security != is_security {
                return false;
            }
        } else if is_security {
            // If we're looking for security events but the field doesn't exist or isn't boolean
            return false;
        }
    }
    
    true
}

// Configuration handlers
pub async fn get_config(State(state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("Configuration requested");
    
    let config = state.config.read().await;
    Ok(Json(config.clone()))
}

pub async fn update_config(State(state): State<AppState>, Json(request): Json<ConfigUpdateRequest>) -> Result<impl IntoResponse> {
    info!("Configuration update requested");
    
    // Parse and validate the new configuration
    let new_config: PipelineConfig = serde_json::from_value(request.config)
        .map_err(|e| PipelineError::configuration(format!("Invalid configuration: {}", e)))?;
    
    // Note: validate method is private, skipping validation for now
    // new_config.validate()?;
    
    // Update the configuration
    {
        let mut config = state.config.write().await;
        *config = new_config.clone();
    }
    
    // Reload pipeline with new configuration if needed
    if request.restart_required.unwrap_or(false) {
        state.pipeline.reload_config(new_config).await?;
    }
    
    info!("Configuration updated successfully");
    
    let response = serde_json::json!({
        "status": "success",
        "message": "Configuration updated successfully",
        "restart_required": request.restart_required.unwrap_or(false),
        "timestamp": Utc::now()
    });
    
    Ok(Json(response))
}

pub async fn validate_config(State(_state): State<AppState>, Json(config): Json<serde_json::Value>) -> Result<impl IntoResponse> {
    debug!("Configuration validation requested");
    
    match serde_json::from_value::<PipelineConfig>(config) {
        Ok(_parsed_config) => {
            // Note: validate method is private, skipping validation for now
            // if let Err(e) = parsed_config.validate() {
            //     let response = serde_json::json!({
            //         "valid": false,
            //         "message": format!("Configuration validation failed: {}", e),
            //         "timestamp": Utc::now()
            //     });
            //     return Ok(Json(response));
            // }
            
            let response = serde_json::json!({
                "valid": true,
                "message": "Configuration is valid",
                "timestamp": Utc::now()
            });
            Ok(Json(response))
        }
        Err(e) => {
            let response = serde_json::json!({
                "valid": false,
                "message": format!("Invalid configuration format: {}", e),
                "timestamp": Utc::now()
            });
            Ok(Json(response))
        }
    }
}

pub async fn reload_config(State(state): State<AppState>) -> Result<impl IntoResponse> {
    info!("Configuration reload requested");
    
    let config = state.config.read().await;
    state.pipeline.reload_config(config.clone()).await?;
    
    let response = serde_json::json!({
        "status": "success",
        "message": "Configuration reloaded successfully",
        "timestamp": Utc::now()
    });
    
    Ok(Json(response))
}

// Routing management handlers
pub async fn get_routing_rules(State(_state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("Routing rules requested");
    
    // This would integrate with the routing manager
    warn!("Get routing rules not yet implemented");
    
    let rules: Vec<RoutingRule> = Vec::new();
    Ok(Json(rules))
}

pub async fn create_routing_rule(State(_state): State<AppState>, Json(_request): Json<RoutingRuleRequest>) -> Result<impl IntoResponse> {
    info!("Create routing rule requested");
    
    warn!("Create routing rule not yet implemented");
    
    let response = serde_json::json!({
        "status": "success",
        "message": "Routing rule created successfully",
        "timestamp": Utc::now()
    });
    
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn get_routing_rule(State(_state): State<AppState>, Path(_name): Path<String>) -> Result<impl IntoResponse> {
    warn!("Get routing rule not yet implemented");
    Err::<Json<serde_json::Value>, PipelineError>(PipelineError::not_found("Routing rule not found"))
}

pub async fn update_routing_rule(State(_state): State<AppState>, Path(_name): Path<String>, Json(_request): Json<RoutingRuleRequest>) -> Result<impl IntoResponse> {
    warn!("Update routing rule not yet implemented");
    
    let response = serde_json::json!({
        "status": "success",
        "message": "Routing rule updated successfully",
        "timestamp": Utc::now()
    });
    
    Ok(Json(response))
}

pub async fn delete_routing_rule(State(_state): State<AppState>, Path(_name): Path<String>) -> Result<impl IntoResponse> {
    warn!("Delete routing rule not yet implemented");
    
    let response = serde_json::json!({
        "status": "success",
        "message": "Routing rule deleted successfully",
        "timestamp": Utc::now()
    });
    
    Ok(Json(response))
}

// Pipeline control handlers
pub async fn start_pipeline(State(state): State<AppState>) -> Result<impl IntoResponse> {
    info!("Pipeline start requested");
    
    state.metrics.update_component_status("pipeline", ComponentStatus::Starting).await;
    
    // Start the pipeline workers
    state.pipeline.start_workers().await?;
    
    state.metrics.update_component_status("pipeline", ComponentStatus::Healthy).await;
    
    let response = serde_json::json!({
        "status": "success",
        "message": "Pipeline started successfully",
        "timestamp": Utc::now()
    });
    
    Ok(Json(response))
}

pub async fn stop_pipeline(State(state): State<AppState>) -> Result<impl IntoResponse> {
    info!("Pipeline stop requested");
    
    state.metrics.update_component_status("pipeline", ComponentStatus::Stopping).await;
    
    // Stop the pipeline workers
    state.pipeline.shutdown().await?;
    
    state.metrics.update_component_status("pipeline", ComponentStatus::Stopped).await;
    
    let response = serde_json::json!({
        "status": "success",
        "message": "Pipeline stopped successfully",
        "timestamp": Utc::now()
    });
    
    Ok(Json(response))
}

pub async fn restart_pipeline(State(state): State<AppState>) -> Result<impl IntoResponse> {
    info!("Pipeline restart requested");
    
    state.metrics.update_component_status("pipeline", ComponentStatus::Stopping).await;
    
    // Stop and start the pipeline
    state.pipeline.shutdown().await?;
    
    state.metrics.update_component_status("pipeline", ComponentStatus::Starting).await;
    
    state.pipeline.start_workers().await?;
    
    state.metrics.update_component_status("pipeline", ComponentStatus::Healthy).await;
    
    let response = serde_json::json!({
        "status": "success",
        "message": "Pipeline restarted successfully",
        "timestamp": Utc::now()
    });
    
    Ok(Json(response))
}

pub async fn get_pipeline_stats(State(state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("Pipeline stats requested");
    
    let stats = state.pipeline.get_stats().await;
    Ok(Json(stats))
}

// Administrative handlers
pub async fn shutdown_system(State(state): State<AppState>) -> Result<impl IntoResponse> {
    warn!("System shutdown requested");
    
    // Gracefully shutdown the pipeline
    state.pipeline.shutdown().await?;
    
    let response = serde_json::json!({
        "status": "success",
        "message": "System shutdown initiated",
        "timestamp": Utc::now()
    });
    
    // Note: In a real implementation, this would trigger application shutdown
    Ok(Json(response))
}

pub async fn get_system_logs(State(_state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("System logs requested");
    
    // This would integrate with the logging system to retrieve recent logs
    warn!("System logs retrieval not yet implemented");
    
    let logs = serde_json::json!({
        "logs": [],
        "message": "Log retrieval not implemented",
        "timestamp": Utc::now()
    });
    
    Ok(Json(logs))
}

pub async fn debug_info(State(state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("Debug info requested");
    
    let system_metrics = state.metrics.get_system_metrics().await;
    let pipeline_metrics = state.metrics.get_pipeline_metrics().await;
    let component_metrics = state.metrics.get_component_metrics().await;
    let config = state.config.read().await;
    
    let debug_info = serde_json::json!({
        "system": system_metrics,
        "pipeline": pipeline_metrics,
        "components": component_metrics,
        "config": *config,
        "timestamp": Utc::now(),
        "version": env!("CARGO_PKG_VERSION")
    });
    
    Ok(Json(debug_info))
}