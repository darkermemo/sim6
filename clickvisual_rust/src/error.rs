use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, ClickVisualError>;

#[derive(Error, Debug)]
pub enum ClickVisualError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    
    #[error("ClickHouse error: {0}")]
    ClickHouse(String),
    
    #[error("Authentication error: {0}")]
    Auth(String),
    
    #[error("Authorization error: {0}")]
    Authorization(String),
    
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Configuration error: {0}")]
    Config(String),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    
    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),
    
    #[error("BCrypt error: {0}")]
    BCrypt(#[from] bcrypt::BcryptError),
    
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Conflict: {0}")]
    Conflict(String),
    
    #[error("Bad request: {0}")]
    BadRequest(String),
    
    #[error("Internal server error: {0}")]
    Internal(String),
    
    #[error("Service unavailable: {0}")]
    ServiceUnavailable(String),
}

impl ClickVisualError {
    pub fn status_code(&self) -> StatusCode {
        match self {
            ClickVisualError::Auth(_) => StatusCode::UNAUTHORIZED,
            ClickVisualError::Authorization(_) => StatusCode::FORBIDDEN,
            ClickVisualError::Validation(_) => StatusCode::BAD_REQUEST,
            ClickVisualError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ClickVisualError::NotFound(_) => StatusCode::NOT_FOUND,
            ClickVisualError::Conflict(_) => StatusCode::CONFLICT,
            ClickVisualError::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            ClickVisualError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ClickVisualError::ClickHouse(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ClickVisualError::Config(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ClickVisualError::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ClickVisualError::Json(_) => StatusCode::BAD_REQUEST,
            ClickVisualError::Http(_) => StatusCode::BAD_GATEWAY,
            ClickVisualError::Jwt(_) => StatusCode::UNAUTHORIZED,
            ClickVisualError::BCrypt(_) => StatusCode::INTERNAL_SERVER_ERROR,
            ClickVisualError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn error_code(&self) -> &'static str {
        match self {
            ClickVisualError::Auth(_) => "AUTH_ERROR",
            ClickVisualError::Authorization(_) => "AUTHORIZATION_ERROR",
            ClickVisualError::Validation(_) => "VALIDATION_ERROR",
            ClickVisualError::BadRequest(_) => "BAD_REQUEST",
            ClickVisualError::NotFound(_) => "NOT_FOUND",
            ClickVisualError::Conflict(_) => "CONFLICT",
            ClickVisualError::ServiceUnavailable(_) => "SERVICE_UNAVAILABLE",
            ClickVisualError::Database(_) => "DATABASE_ERROR",
            ClickVisualError::ClickHouse(_) => "CLICKHOUSE_ERROR",
            ClickVisualError::Config(_) => "CONFIG_ERROR",
            ClickVisualError::Io(_) => "IO_ERROR",
            ClickVisualError::Json(_) => "JSON_ERROR",
            ClickVisualError::Http(_) => "HTTP_ERROR",
            ClickVisualError::Jwt(_) => "JWT_ERROR",
            ClickVisualError::BCrypt(_) => "BCRYPT_ERROR",
            ClickVisualError::Internal(_) => "INTERNAL_ERROR",
        }
    }
}

impl IntoResponse for ClickVisualError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let error_code = self.error_code();
        let message = self.to_string();
        
        tracing::error!("Error occurred: {} - {}", error_code, message);
        
        let body = Json(json!({
            "error": {
                "code": error_code,
                "message": message,
                "status": status.as_u16()
            }
        }));
        
        (status, body).into_response()
    }
}

// Helper functions for common errors
impl ClickVisualError {
    pub fn not_found(resource: &str) -> Self {
        Self::NotFound(format!("{} not found", resource))
    }
    
    pub fn unauthorized(message: &str) -> Self {
        Self::Auth(message.to_string())
    }
    
    pub fn forbidden(message: &str) -> Self {
        Self::Authorization(message.to_string())
    }
    
    pub fn bad_request(message: &str) -> Self {
        Self::BadRequest(message.to_string())
    }
    
    pub fn internal(message: &str) -> Self {
        Self::Internal(message.to_string())
    }
    
    pub fn validation(message: &str) -> Self {
        Self::Validation(message.to_string())
    }
}