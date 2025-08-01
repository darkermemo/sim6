use axum::{
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde_json::json;
use thiserror::Error;

/// API Error types for consistent error handling
#[derive(Error, Debug)]
pub enum ApiError {
    #[error("Authentication failed: {0}")]
    Unauthorized(String),
    
    #[error("Bad request: {0}")]
    BadRequest(String),
    
    #[error("Forbidden: {0}")]
    Forbidden(String),
    
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Rate limit exceeded: {0}")]
    RateLimitExceeded(String),
    
    #[error("Database error: {0}")]
    Database(String),
    
    #[error("Internal server error: {0}")]
    InternalServerError(String),
    
    #[error("Validation error: {0}")]
    ValidationError(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let (status, error_message) = match self {
            ApiError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg),
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            ApiError::RateLimitExceeded(msg) => (StatusCode::TOO_MANY_REQUESTS, msg),
            ApiError::Database(msg) => (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", msg)),
            ApiError::InternalServerError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
            ApiError::ValidationError(msg) => (StatusCode::BAD_REQUEST, format!("Validation error: {}", msg)),
        };

        let body = Json(json!({
            "error": error_message,
            "status": status.as_u16()
        }));

        (status, body).into_response()
    }
}

/// Convert anyhow errors to ApiError
impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        ApiError::InternalServerError(err.to_string())
    }
}

/// Convert database errors to ApiError
impl From<clickhouse::error::Error> for ApiError {
    fn from(err: clickhouse::error::Error) -> Self {
        ApiError::Database(err.to_string())
    }
}