//! Modular handlers for the SIEM unified pipeline
//!
//! This module contains domain-specific handlers that use the DAL (Data Access Layer)
//! for database operations. Each handler focuses on a specific domain (events, alerts, etc.)
//! and provides clean separation of concerns.

// Core handlers (always available)
pub mod events;
pub mod events_ch;
pub mod insert_events;
pub mod sse_ch;
pub mod health;
pub mod log_sources;
pub mod rules;

// Re-export core handlers with explicit names to avoid conflicts
pub use events_ch::{
    search_events,       // make these the canonical names
    get_eps_stats,
    get_event_by_id,
    get_event_count,
};
pub use sse_ch::stream_events_ch;
pub use insert_events::insert_events;
pub use health::health_check;
// Note: log_sources and rules handlers don't have conflicting exports

// Legacy handlers moved to _legacy directory
// pub mod alerts;     // moved to src/_legacy/alerts.rs
// pub mod metrics;    // moved to src/_legacy/metrics.rs
// pub mod system;     // moved to src/_legacy/system.rs

use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde_json::json;
use tracing::error;

use crate::error::PipelineError;
use crate::types::api::ErrorResponse;

/// Convert SiemError to HTTP response
pub fn error_to_response(error: PipelineError) -> impl IntoResponse {
    let (status, message) = match &error {
        PipelineError::ConfigError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
        PipelineError::DatabaseError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
        PipelineError::ClickHouseError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "ClickHouse operation failed".to_string()),
        PipelineError::RedisError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Redis operation failed".to_string()),
        PipelineError::KafkaError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Kafka operation failed".to_string()),
        PipelineError::SerializationError(_) => (StatusCode::BAD_REQUEST, "Serialization failed".to_string()),
        PipelineError::ValidationError(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
        PipelineError::NotFoundError(msg) => (StatusCode::NOT_FOUND, msg.clone()),
        PipelineError::AuthenticationError(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
        PipelineError::InternalError(msg) => {
            error!("Internal error: {}", msg);
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
        }
        _ => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    };

    let error_response = ErrorResponse {
        error: message.clone(),
        message,
        code: status.as_u16(),
        timestamp: chrono::Utc::now(),
        request_id: Some(crate::types::api::generate_request_id()),
        details: None,
    };

    (status, Json(error_response))
}

/// Helper macro for handling repository results
macro_rules! handle_result {
    ($result:expr) => {
        match $result {
            Ok(data) => Ok(Json(data)),
            Err(e) => Err(crate::handlers::error_to_response(e)),
        }
    };
}

pub(crate) use handle_result;