//! Standardized error handling module for the SIEM system
//! Provides consistent error types, logging, and recovery patterns


use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};

use tracing::{error, warn, info};

/// Standard error response structure for API endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}

/// Standardized error types for the SIEM system
#[derive(Debug, thiserror::Error)]
pub enum SiemError {
    #[error("Database error: {message}")]
    Database {
        message: String,
        #[source]
        source: Option<anyhow::Error>,
    },
    
    #[error("Configuration error: {message}")]
    Configuration {
        message: String,
        #[source]
        source: Option<anyhow::Error>,
    },
    
    #[error("Validation error: {message}")]
    Validation {
        message: String,
        field: Option<String>,
    },
    
    #[error("Authentication error: {message}")]
    Authentication {
        message: String,
    },
    
    #[error("Authorization error: {message}")]
    Authorization {
        message: String,
    },
    
    #[error("Network error: {message}")]
    Network {
        message: String,
        #[source]
        source: Option<anyhow::Error>,
    },
    
    #[error("Internal server error: {message}")]
    Internal {
        message: String,
        #[source]
        source: Option<anyhow::Error>,
    },
    
    #[error("Resource not found: {resource}")]
    NotFound {
        resource: String,
    },
    
    #[error("Rate limit exceeded: {message}")]
    RateLimit {
        message: String,
        retry_after: Option<u64>,
    },
    
    #[error("Timeout error: {message}")]
    Timeout {
        message: String,
        timeout_ms: u64,
    },
}

impl SiemError {
    /// Create a database error with context
    pub fn database<S: Into<String>>(message: S) -> Self {
        Self::Database {
            message: message.into(),
            source: None,
        }
    }
    
    /// Create a database error with source
    pub fn database_with_source<S: Into<String>>(message: S, source: anyhow::Error) -> Self {
        Self::Database {
            message: message.into(),
            source: Some(source),
        }
    }
    
    /// Create a configuration error
    pub fn configuration<S: Into<String>>(message: S) -> Self {
        Self::Configuration {
            message: message.into(),
            source: None,
        }
    }
    
    /// Create a validation error
    pub fn validation<S: Into<String>>(message: S) -> Self {
        Self::Validation {
            message: message.into(),
            field: None,
        }
    }
    
    /// Create a validation error with field
    pub fn validation_field<S: Into<String>, F: Into<String>>(message: S, field: F) -> Self {
        Self::Validation {
            message: message.into(),
            field: Some(field.into()),
        }
    }
    
    /// Create an internal error
    pub fn internal<S: Into<String>>(message: S) -> Self {
        Self::Internal {
            message: message.into(),
            source: None,
        }
    }
    
    /// Create an internal error with source
    pub fn internal_with_source<S: Into<String>>(message: S, source: anyhow::Error) -> Self {
        Self::Internal {
            message: message.into(),
            source: Some(source),
        }
    }
    
    /// Create a not found error
    pub fn not_found<S: Into<String>>(resource: S) -> Self {
        Self::NotFound {
            resource: resource.into(),
        }
    }
    
    /// Create a timeout error
    pub fn timeout<S: Into<String>>(message: S, timeout_ms: u64) -> Self {
        Self::Timeout {
            message: message.into(),
            timeout_ms,
        }
    }
    
    /// Get the error code for API responses
    pub fn error_code(&self) -> &'static str {
        match self {
            Self::Database { .. } => "DATABASE_ERROR",
            Self::Configuration { .. } => "CONFIG_ERROR",
            Self::Validation { .. } => "VALIDATION_ERROR",
            Self::Authentication { .. } => "AUTH_ERROR",
            Self::Authorization { .. } => "AUTHZ_ERROR",
            Self::Network { .. } => "NETWORK_ERROR",
            Self::Internal { .. } => "INTERNAL_ERROR",
            Self::NotFound { .. } => "NOT_FOUND",
            Self::RateLimit { .. } => "RATE_LIMIT",
            Self::Timeout { .. } => "TIMEOUT_ERROR",
        }
    }
    
    /// Get the HTTP status code for this error
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::Database { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            Self::Configuration { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            Self::Validation { .. } => StatusCode::BAD_REQUEST,
            Self::Authentication { .. } => StatusCode::UNAUTHORIZED,
            Self::Authorization { .. } => StatusCode::FORBIDDEN,
            Self::Network { .. } => StatusCode::BAD_GATEWAY,
            Self::Internal { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            Self::NotFound { .. } => StatusCode::NOT_FOUND,
            Self::RateLimit { .. } => StatusCode::TOO_MANY_REQUESTS,
            Self::Timeout { .. } => StatusCode::REQUEST_TIMEOUT,
        }
    }
    
    /// Convert to ErrorResponse for API responses
    pub fn to_error_response(&self) -> ErrorResponse {
        ErrorResponse {
            error: self.error_code().to_string(),
            message: self.to_string(),
            code: self.error_code().to_string(),
            details: self.get_details(),
            request_id: None, // Can be set by middleware
        }
    }
    
    /// Get additional error details
    fn get_details(&self) -> Option<serde_json::Value> {
        match self {
            Self::Validation { field: Some(field), .. } => {
                Some(serde_json::json!({ "field": field }))
            },
            Self::RateLimit { retry_after: Some(retry), .. } => {
                Some(serde_json::json!({ "retry_after_seconds": retry }))
            },
            Self::Timeout { timeout_ms, .. } => {
                Some(serde_json::json!({ "timeout_ms": timeout_ms }))
            },
            _ => None,
        }
    }
}

/// Convert SiemError to Axum response
impl IntoResponse for SiemError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let error_response = self.to_error_response();
        
        // Log the error with appropriate level
        match &self {
            SiemError::Internal { .. } | SiemError::Database { .. } => {
                error!("Internal error: {}", self);
            },
            SiemError::Configuration { .. } => {
                error!("Configuration error: {}", self);
            },
            SiemError::Network { .. } | SiemError::Timeout { .. } => {
                warn!("Network/timeout error: {}", self);
            },
            _ => {
                info!("Client error: {}", self);
            }
        }
        
        (status, Json(error_response)).into_response()
    }
}

/// Result type alias for SIEM operations
pub type SiemResult<T> = std::result::Result<T, SiemError>;

/// Trait for adding context to errors
pub trait ErrorContext<T> {
    fn with_context<F>(self, f: F) -> SiemResult<T>
    where
        F: FnOnce() -> String;
    
    fn with_database_context<F>(self, f: F) -> SiemResult<T>
    where
        F: FnOnce() -> String;
    
    fn with_validation_context<F>(self, f: F) -> SiemResult<T>
    where
        F: FnOnce() -> String;
}

impl<T, E> ErrorContext<T> for std::result::Result<T, E>
where
    E: Into<anyhow::Error>,
{
    fn with_context<F>(self, f: F) -> SiemResult<T>
    where
        F: FnOnce() -> String,
    {
        self.map_err(|e| SiemError::internal_with_source(f(), e.into()))
    }
    
    fn with_database_context<F>(self, f: F) -> SiemResult<T>
    where
        F: FnOnce() -> String,
    {
        self.map_err(|e| SiemError::database_with_source(f(), e.into()))
    }
    
    fn with_validation_context<F>(self, f: F) -> SiemResult<T>
    where
        F: FnOnce() -> String,
    {
        self.map_err(|_| SiemError::validation(f()))
    }
}

/// Macro for creating database errors with context
#[macro_export]
macro_rules! db_error {
    ($msg:expr) => {
        $crate::error_handling::SiemError::database($msg)
    };
    ($msg:expr, $source:expr) => {
        $crate::error_handling::SiemError::database_with_source($msg, $source.into())
    };
}

/// Macro for creating validation errors
#[macro_export]
macro_rules! validation_error {
    ($msg:expr) => {
        $crate::error_handling::SiemError::validation($msg)
    };
    ($msg:expr, $field:expr) => {
        $crate::error_handling::SiemError::validation_field($msg, $field)
    };
}

/// Macro for creating configuration errors
#[macro_export]
macro_rules! config_error {
    ($msg:expr) => {
        $crate::error_handling::SiemError::configuration($msg)
    };
}

/// Database connection health checker
pub struct DatabaseHealthChecker;

impl DatabaseHealthChecker {
    /// Check ClickHouse connection health
    pub async fn check_clickhouse(client: &clickhouse::Client) -> SiemResult<()> {
        client
            .query("SELECT 1")
            .fetch_one::<u8>()
            .await
            .with_database_context(|| "Failed to ping ClickHouse database".to_string())?;
        
        info!("ClickHouse health check passed");
        Ok(())
    }
    
    /// Check database with timeout
    pub async fn check_with_timeout<F, Fut>(
        check_fn: F,
        timeout_ms: u64,
    ) -> SiemResult<()>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = SiemResult<()>>,
    {
        let timeout = std::time::Duration::from_millis(timeout_ms);
        
        match tokio::time::timeout(timeout, check_fn()).await {
            Ok(result) => result,
            Err(_) => Err(SiemError::timeout(
                "Database health check timed out".to_string(),
                timeout_ms,
            )),
        }
    }
}

/// Retry mechanism for database operations
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
    pub backoff_multiplier: f64,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay_ms: 100,
            max_delay_ms: 5000,
            backoff_multiplier: 2.0,
        }
    }
}

impl RetryPolicy {
    /// Execute a function with retry logic
    pub async fn execute<F, Fut, T>(&self, mut operation: F) -> SiemResult<T>
    where
        F: FnMut() -> Fut,
        Fut: std::future::Future<Output = SiemResult<T>>,
    {
        let mut last_error = None;
        
        for attempt in 1..=self.max_attempts {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(error) => {
                    last_error = Some(error);
                    
                    if attempt < self.max_attempts {
                        let delay = self.calculate_delay(attempt);
                        warn!(
                            "Operation failed on attempt {}/{}, retrying in {}ms",
                            attempt, self.max_attempts, delay
                        );
                        tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                    }
                }
            }
        }
        
        Err(last_error.unwrap_or_else(|| {
            SiemError::internal("Retry operation failed with no error details")
        }))
    }
    
    fn calculate_delay(&self, attempt: u32) -> u64 {
        let delay = (self.base_delay_ms as f64 * self.backoff_multiplier.powi(attempt as i32 - 1)) as u64;
        delay.min(self.max_delay_ms)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_siem_error_creation() {
        let db_error = SiemError::database("Connection failed");
        assert_eq!(db_error.error_code(), "DATABASE_ERROR");
        assert_eq!(db_error.status_code(), StatusCode::INTERNAL_SERVER_ERROR);
        
        let validation_error = SiemError::validation_field("Invalid email", "email");
        assert_eq!(validation_error.error_code(), "VALIDATION_ERROR");
        assert_eq!(validation_error.status_code(), StatusCode::BAD_REQUEST);
    }
    
    #[test]
    fn test_error_response_serialization() {
        let error = SiemError::validation_field("Invalid input", "username");
        let response = error.to_error_response();
        
        assert_eq!(response.error, "VALIDATION_ERROR");
        assert_eq!(response.code, "VALIDATION_ERROR");
        assert!(response.details.is_some());
    }
    
    #[test]
    fn test_retry_policy_delay_calculation() {
        let policy = RetryPolicy::default();
        
        assert_eq!(policy.calculate_delay(1), 100);
        assert_eq!(policy.calculate_delay(2), 200);
        assert_eq!(policy.calculate_delay(3), 400);
    }
}