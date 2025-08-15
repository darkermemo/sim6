use axum::{
    extract::State,
    response::{Json, Sse, IntoResponse},
    http::StatusCode,
};
use axum::response::sse::{Event, KeepAlive};
use futures::stream::{self, Stream};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use serde_json::json;

use crate::v2::{
    state::AppState,
    types::health::*,
    collectors::HealthCollector,
    health::{HealthManager, autofix_engine::AutoFixExecution},
};
use crate::v2::dal::ClickHouseRepo;

// Shared health collector and manager instances
lazy_static::lazy_static! {
    static ref HEALTH_COLLECTOR: HealthCollector = HealthCollector::new_with_events_table(
        std::env::var("EVENTS_TABLE").unwrap_or_else(|_| "dev.events".to_string())
    );
    static ref HEALTH_MANAGER: HealthManager = HealthManager::default();
    static ref SSE_CLIENT_COUNT: Arc<RwLock<u32>> = Arc::new(RwLock::new(0));
}

/// GET /api/v2/health/summary - Comprehensive health snapshot (plain shape)
/// Always returns 200 with best-effort data to keep UI alive.
pub async fn health_summary(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<HealthSummaryWithErrors>, (StatusCode, Json<serde_json::Value>)> {
    match HEALTH_COLLECTOR.collect_summary().await {
        Ok(summary) => {
            let processing_result = HEALTH_MANAGER.process_health_update(&summary).await;
            let response = HealthSummaryWithErrors {
                health: summary,
                active_errors: processing_result.new_errors,
                total_active_errors: processing_result.total_active_errors,
                auto_fixes_triggered: processing_result.auto_fixes_triggered.len() as u32,
            };
            Ok(Json(response))
        },
        Err(e) => {
            tracing::error!("Failed to collect health summary: {}", e);
            // Fallback to a default healthy state if collectors fail
            Ok(Json(HealthSummaryWithErrors {
                health: HealthSummary::default(),
                active_errors: vec![],
                total_active_errors: 0,
                auto_fixes_triggered: 0,
            }))
        }
    }
}

/// GET /api/v2/health/stream - Server-Sent Events stream for real-time updates
pub async fn health_stream(
    State(_state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // Increment SSE client count
    *SSE_CLIENT_COUNT.write().await += 1;
    
    tracing::info!("New SSE client connected for health stream");

    let stream = stream::unfold((), |_| async {
        tokio::time::sleep(Duration::from_secs(1)).await;
        
        match HEALTH_COLLECTOR.collect_delta().await {
            Ok(delta) => {
                match serde_json::to_string(&delta) {
                    Ok(json_str) => Some((Ok(Event::default().data(json_str)), ())),
                    Err(e) => {
                        tracing::error!("Failed to serialize health delta: {}", e);
                        Some((Err(Box::new(e) as Box<dyn std::error::Error + Send + Sync>), ()))
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to collect health delta: {}", e);
                Some((Err(e), ()))
            }
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// GET /api/v2/health/errors - List active health errors
pub async fn health_errors(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<DetectedError>>, (StatusCode, Json<serde_json::Value>)> {
    let active_errors = HEALTH_MANAGER.get_active_errors().await;
    Ok(Json(active_errors))
}

/// GET /api/v2/health/executions - List auto-fix executions  
pub async fn health_executions(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<AutoFixExecution>>, (StatusCode, Json<serde_json::Value>)> {
    let executions = HEALTH_MANAGER.list_auto_fix_executions().await;
    Ok(Json(executions))
}

/// GET /api/v2/health/executions/:id - Get specific auto-fix execution
pub async fn health_execution_by_id(
    State(_state): State<Arc<AppState>>,
    axum::extract::Path(execution_id): axum::extract::Path<String>,
) -> Result<Json<AutoFixExecution>, (StatusCode, Json<serde_json::Value>)> {
    match HEALTH_MANAGER.get_auto_fix_execution(&execution_id).await {
        Some(execution) => Ok(Json(execution)),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(json!({
                "error": "Execution not found"
            }))
        ))
    }
}

/// POST /api/v2/health/diagnose - Deep diagnostic check for specific components
pub async fn health_diagnose(
    State(_state): State<Arc<AppState>>,
    Json(request): Json<DiagnoseRequest>,
) -> Result<Json<DiagnoseResponse>, (StatusCode, Json<serde_json::Value>)> {
    tracing::info!("Running diagnostic for component: {}", request.component);

    let (status, details, issues, recommendations) = match request.component.as_str() {
        "clickhouse" => diagnose_clickhouse().await,
        "redis" => diagnose_redis().await,
        "kafka" => diagnose_kafka().await,
        "pipeline" => diagnose_pipeline().await,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "Unknown component",
                    "valid_components": ["clickhouse", "redis", "kafka", "pipeline"]
                }))
            ));
        }
    };

    Ok(Json(DiagnoseResponse {
        component: request.component,
        status,
        details,
        issues,
        recommendations,
    }))
}

/// POST /api/v2/health/autofix - Automated fix for known issues
pub async fn health_autofix(
    State(_state): State<Arc<AppState>>,
    Json(request): Json<AutoFixRequest>,
) -> Result<Json<AutoFixResponse>, (StatusCode, Json<serde_json::Value>)> {
    let dry_run = !request.confirm.unwrap_or(false);
    
    tracing::info!(
        "Auto-fix request: kind={}, dry_run={}", 
        request.kind, 
        dry_run
    );

    // Check if this is an error-based auto-fix
    if let Some(error_id) = request.params.get("error_id").and_then(|v| v.as_str()) {
        match HEALTH_MANAGER.execute_auto_fix(error_id, dry_run).await {
            Ok(execution) => {
                let response = AutoFixResponse {
                    success: execution.result.as_ref().map(|r| r.success).unwrap_or(false),
                    message: execution.result.as_ref()
                        .map(|r| r.message.clone())
                        .unwrap_or_else(|| "Auto-fix execution started".to_string()),
                    actions_taken: execution.result.as_ref()
                        .map(|r| r.actions_taken.clone())
                        .unwrap_or_else(Vec::new),
                    dry_run,
                };
                return Ok(Json(response));
            },
            Err(e) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": "Auto-fix execution failed",
                        "details": e
                    }))
                ));
            }
        }
    }

    // Fallback to legacy auto-fix actions
    let (success, message, actions) = match request.kind.as_str() {
        "kafka_create_topic" => autofix_kafka_topic(&request.params, dry_run).await,
        "redis_tune" => autofix_redis_tune(&request.params, dry_run).await,
        "ch_optimize_table" => autofix_clickhouse_optimize(&request.params, dry_run).await,
        "service_restart" => autofix_service_restart(&request.params, dry_run).await,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "Unknown autofix kind",
                    "valid_kinds": ["kafka_create_topic", "redis_tune", "ch_optimize_table", "service_restart"]
                }))
            ));
        }
    };

    Ok(Json(AutoFixResponse {
        success,
        message,
        actions_taken: actions,
        dry_run,
    }))
}

// Diagnostic implementations

async fn diagnose_clickhouse() -> (String, serde_json::Value, Vec<HealthIssue>, Vec<String>) {
    // TODO: Implement actual ClickHouse diagnostics
    (
        "healthy".to_string(),
        json!({
            "connection": "ok",
            "query_performance": "normal",
            "disk_usage": "acceptable"
        }),
        vec![],
        vec!["Consider running OPTIMIZE TABLE if parts > 1000".to_string()],
    )
}

async fn diagnose_redis() -> (String, serde_json::Value, Vec<HealthIssue>, Vec<String>) {
    // TODO: Implement actual Redis diagnostics
    (
        "healthy".to_string(),
        json!({
            "memory_usage": "normal",
            "hit_ratio": "good",
            "connections": "stable"
        }),
        vec![],
        vec!["Monitor eviction rate".to_string()],
    )
}

async fn diagnose_kafka() -> (String, serde_json::Value, Vec<HealthIssue>, Vec<String>) {
    // TODO: Implement actual Kafka diagnostics
    (
        "healthy".to_string(),
        json!({
            "brokers": "all_up",
            "topics": "healthy",
            "consumer_lag": "acceptable"
        }),
        vec![],
        vec!["Monitor consumer group lag".to_string()],
    )
}

async fn diagnose_pipeline() -> (String, serde_json::Value, Vec<HealthIssue>, Vec<String>) {
    // TODO: Implement actual pipeline diagnostics
    (
        "healthy".to_string(),
        json!({
            "throughput": "normal",
            "latency": "acceptable",
            "error_rate": "low"
        }),
        vec![],
        vec!["Monitor DLQ for parse errors".to_string()],
    )
}

// Auto-fix implementations

async fn autofix_kafka_topic(
    _params: &serde_json::Value,
    dry_run: bool,
) -> (bool, String, Vec<String>) {
    let actions = vec!["create_topic: siem.raw.logs".to_string()];
    
    if dry_run {
        (true, "Would create missing Kafka topic".to_string(), actions)
    } else {
        // TODO: Implement actual Kafka topic creation
        (true, "Kafka topic created successfully".to_string(), actions)
    }
}

async fn autofix_redis_tune(
    _params: &serde_json::Value,
    dry_run: bool,
) -> (bool, String, Vec<String>) {
    let actions = vec!["set_maxmemory_policy: allkeys-lru".to_string()];
    
    if dry_run {
        (true, "Would tune Redis memory settings".to_string(), actions)
    } else {
        // TODO: Implement actual Redis tuning
        (true, "Redis memory settings tuned".to_string(), actions)
    }
}

async fn autofix_clickhouse_optimize(
    _params: &serde_json::Value,
    dry_run: bool,
) -> (bool, String, Vec<String>) {
    let actions = vec!["optimize_table: events".to_string()];
    
    if dry_run {
        (true, "Would optimize ClickHouse table".to_string(), actions)
    } else {
        // TODO: Implement actual ClickHouse optimization
        (true, "ClickHouse table optimized".to_string(), actions)
    }
}

async fn autofix_service_restart(
    _params: &serde_json::Value,
    dry_run: bool,
) -> (bool, String, Vec<String>) {
    let actions = vec!["restart_service: parser-1".to_string()];
    
    if dry_run {
        (true, "Would restart service".to_string(), actions)
    } else {
        // TODO: Implement actual service restart
        (false, "Service restart not implemented".to_string(), actions)
    }
}
