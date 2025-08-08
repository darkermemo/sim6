//! Health check handlers for the SIEM unified pipeline
//!
//! This module provides HTTP handlers for health check operations including
//! basic health checks, detailed component health, and system status monitoring.
//! It uses the HealthRepository trait for health check operations.

use axum::extract::{Query, State};
use axum::response::{IntoResponse, Json};
use axum::http::StatusCode;
use std::sync::Arc;
use tracing::{debug, info, warn};

use crate::dal::traits::HealthRepository;
use crate::handlers::handle_result;
use crate::types::api::{HealthResponse, ComponentHealth, VectorHealthResponse, ReadinessResponse, ComponentReadiness, LivenessResponse, StartupResponse};

/// Handler for basic health check
/// 
/// Provides a simple health check endpoint that returns the overall system status.
/// This is typically used by load balancers and monitoring systems for basic
/// availability checks.
pub async fn health_check<R>(
    State(health_repo): State<Arc<R>>,
) -> Result<Json<HealthResponse>, impl IntoResponse>
where
    R: HealthRepository,
{
    debug!("Performing basic health check");
    
    let result = health_repo.health_check().await;
    
    match &result {
        Ok(health) => {
            if health.status == "healthy" {
                info!("Health check passed: system is healthy");
            } else {
                warn!("Health check failed: system is unhealthy");
            }
        }
        Err(e) => {
            warn!("Health check error: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for detailed health check
/// 
/// Provides comprehensive health information including the status of individual
/// components (ClickHouse, Redis, Vector, etc.). This endpoint is useful for
/// detailed monitoring and troubleshooting.
pub async fn detailed_health_check<R>(
    State(health_repo): State<Arc<R>>,
) -> Result<Json<HealthResponse>, impl IntoResponse>
where
    R: HealthRepository,
{
    debug!("Performing detailed health check");
    
    let result = health_repo.detailed_health_check().await;
    
    match &result {
        Ok(health) => {
            let component_count = health.components.len();
            info!("Detailed health check completed: {} components checked", component_count);
            
            for (component_name, component) in &health.components {
                if component.status != "healthy" {
                    warn!("Component {} is unhealthy: status={}", 
                          component_name, 
                          component.status);
                }
            }
        }
        Err(e) => {
            warn!("Detailed health check error: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for ClickHouse health check
/// 
/// Specifically checks the health of the ClickHouse database connection.
/// Returns detailed information about ClickHouse connectivity and status.
pub async fn clickhouse_health<R>(
    State(health_repo): State<Arc<R>>,
) -> Result<Json<ComponentHealth>, impl IntoResponse>
where
    R: HealthRepository,
{
    debug!("Checking ClickHouse health");
    
    let result = health_repo.check_clickhouse_health().await;
    
    match &result {
        Ok(health) => {
            if health.status == "healthy" {
                info!("ClickHouse health check passed");
            } else {
                warn!("ClickHouse health check failed with status: {}", health.status);
            }
        }
        Err(e) => {
            warn!("ClickHouse health check error: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for Redis health check
/// 
/// Specifically checks the health of the Redis connection.
/// Returns detailed information about Redis connectivity and status.
pub async fn redis_health<R>(
    State(health_repo): State<Arc<R>>,
) -> Result<Json<ComponentHealth>, impl IntoResponse>
where
    R: HealthRepository,
{
    debug!("Checking Redis health");
    
    let result = health_repo.check_redis_health().await;
    
    match &result {
        Ok(health) => {
            if health.status == "healthy" {
                info!("Redis health check passed");
            } else {
                warn!("Redis health check failed with status: {}", health.status);
            }
        }
        Err(e) => {
            warn!("Redis health check error: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for Vector health check
/// 
/// Specifically checks the health of the Vector log processing pipeline.
/// Returns detailed information about Vector status and performance.
pub async fn vector_health<R>(
    State(health_repo): State<Arc<R>>,
) -> Result<Json<VectorHealthResponse>, impl IntoResponse>
where
    R: HealthRepository,
{
    debug!("Checking Vector health");
    
    let result = health_repo.check_vector_health().await;
    
    match &result {
        Ok(health) => {
            if health.status == "healthy" {
                info!("Vector health check passed");
            } else {
                warn!("Vector health check failed with status: {}", health.status);
            }
        }
        Err(e) => {
            warn!("Vector health check error: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for system status
/// 
/// Provides comprehensive system status information including health,
/// performance metrics, and operational statistics. This endpoint is
/// useful for monitoring dashboards and system administration.
pub async fn system_status<R>(
    State(health_repo): State<Arc<R>>,
) -> Result<Json<serde_json::Value>, impl IntoResponse>
where
    R: HealthRepository,
{
    debug!("Getting system status");
    
    let result = health_repo.get_system_status().await;
    
    match &result {
        Ok(status) => {
            info!("System status retrieved successfully");
        }
        Err(e) => {
            warn!("System status retrieval error: {:?}", e);
        }
    }
    
    handle_result!(result)
}

/// Handler for readiness probe
/// 
/// Kubernetes-style readiness probe that indicates whether the service
/// is ready to accept traffic. This checks that all critical components
/// are operational and the service can handle requests.
pub async fn readiness_probe<R>(
    State(health_repo): State<Arc<R>>,
) -> Result<Json<ReadinessResponse>, (StatusCode, Json<serde_json::Value>)>
where
    R: HealthRepository,
{
    debug!("Performing readiness probe");
    
    // Check critical components for readiness
    let clickhouse_health = health_repo.check_clickhouse_health().await;
    
    let ready = match &clickhouse_health {
        Ok(health) => health.status == "healthy",
        Err(_) => false,
    };
    
    let response = ReadinessResponse {
        ready,
        timestamp: chrono::Utc::now(),
        components: vec![
            ComponentReadiness {
                name: "clickhouse".to_string(),
                ready: clickhouse_health.as_ref().map(|h| h.status == "healthy").unwrap_or(false),
            },
            // TODO: Add other critical components
        ],
    };
    
    if ready {
        info!("Readiness probe passed: service is ready");
    } else {
        warn!("Readiness probe failed: service is not ready");
    }
    
    Ok(Json(response))
}

/// Handler for liveness probe
/// 
/// Kubernetes-style liveness probe that indicates whether the service
/// is alive and should not be restarted. This is a basic check that
/// the service is running and responsive.
pub async fn liveness_probe() -> Result<Json<LivenessResponse>, (StatusCode, Json<serde_json::Value>)> {
    debug!("Performing liveness probe");
    
    // Basic liveness check - if we can respond, we're alive
    let response = LivenessResponse {
        alive: true,
        timestamp: chrono::Utc::now(),
        uptime_seconds: get_uptime_seconds(),
    };
    
    info!("Liveness probe passed: service is alive");
    Ok(Json(response))
}

/// Handler for startup probe
/// 
/// Kubernetes-style startup probe that indicates whether the service
/// has finished starting up. This is used to give the service time
/// to initialize before readiness and liveness probes begin.
pub async fn startup_probe<R>(
    State(health_repo): State<Arc<R>>,
) -> Result<Json<StartupResponse>, (StatusCode, Json<serde_json::Value>)>
where
    R: HealthRepository,
{
    debug!("Performing startup probe");
    
    // Check if critical components are initialized
    let clickhouse_health = health_repo.check_clickhouse_health().await;
    
    let started = match &clickhouse_health {
        Ok(health) => health.status == "healthy",
        Err(_) => false,
    };
    
    let response = StartupResponse {
        started,
        timestamp: chrono::Utc::now(),
        initialization_time_seconds: get_uptime_seconds(),
    };
    
    if started {
        info!("Startup probe passed: service has started");
    } else {
        warn!("Startup probe failed: service is still starting");
    }
    
    Ok(Json(response))
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get service uptime in seconds
/// 
/// TODO: Implement actual uptime tracking. For now, returns a placeholder.
fn get_uptime_seconds() -> u64 {
    // TODO: Track actual service start time and calculate uptime
    // For now, return a placeholder value
    0
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use chrono::Utc;
    use std::collections::HashMap;
    use std::sync::Arc;
    
    // Mock health repository for testing
    struct MockHealthRepository {
        healthy: bool,
    }
    
    #[async_trait]
    impl HealthRepository for MockHealthRepository {
        async fn health_check(&self) -> crate::error::Result<HealthResponse> {
            Ok(HealthResponse {
                status: if self.healthy { "healthy".to_string() } else { "unhealthy".to_string() },
                timestamp: Utc::now(),
                version: "1.0.0".to_string(),
                uptime_seconds: 3600,
                components: HashMap::new(),
            })
        }
        
        async fn detailed_health_check(&self) -> crate::error::Result<HealthResponse> {
            let mut components = HashMap::new();
            components.insert("clickhouse".to_string(), ComponentHealth {
                status: if self.healthy { "healthy".to_string() } else { "unhealthy".to_string() },
                last_check: Utc::now(),
                error_count: 0,
                response_time_ms: 10.5,
            });
            
            Ok(HealthResponse {
                status: if self.healthy { "healthy".to_string() } else { "unhealthy".to_string() },
                timestamp: Utc::now(),
                version: "1.0.0".to_string(),
                uptime_seconds: 3600,
                components,
            })
        }
        
        async fn check_clickhouse_health(&self) -> crate::error::Result<ComponentHealth> {
            Ok(ComponentHealth {
                status: if self.healthy { "healthy".to_string() } else { "unhealthy".to_string() },
                last_check: Utc::now(),
                error_count: 0,
                response_time_ms: 10.5,
            })
        }
        
        async fn check_redis_health(&self) -> crate::error::Result<ComponentHealth> {
            Ok(ComponentHealth {
                status: if self.healthy { "healthy".to_string() } else { "unhealthy".to_string() },
                last_check: Utc::now(),
                error_count: 0,
                response_time_ms: 5.2,
            })
        }
        
        async fn check_vector_health(&self) -> crate::error::Result<VectorHealthResponse> {
            Ok(VectorHealthResponse {
                status: if self.healthy { "healthy".to_string() } else { "unhealthy".to_string() },
                healthy: self.healthy,
                events_processed: Some(1000),
            })
        }
        
        async fn get_system_status(&self) -> crate::error::Result<serde_json::Value> {
            Ok(serde_json::json!({
                "status": if self.healthy { "healthy" } else { "unhealthy" },
                "test": true
            }))
        }
    }
    
    #[tokio::test]
    async fn test_health_check_healthy() {
        let repo = Arc::new(MockHealthRepository { healthy: true });
        let result = health_check(axum::extract::State(repo)).await;
        assert!(result.is_ok());
        
        let response = result.unwrap().0;
        assert_eq!(response.status, "healthy");
    }
    
    #[tokio::test]
    async fn test_health_check_unhealthy() {
        let repo = Arc::new(MockHealthRepository { healthy: false });
        let result = health_check(axum::extract::State(repo)).await;
        assert!(result.is_ok());
        
        let response = result.unwrap().0;
        assert_eq!(response.status, "unhealthy");
    }
    
    #[tokio::test]
    async fn test_liveness_probe() {
        let result = liveness_probe().await;
        assert!(result.is_ok());
        
        let response = result.unwrap().0;
        assert!(response.alive);
    }
}