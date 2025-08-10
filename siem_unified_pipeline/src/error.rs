use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::body::Body;
use serde_json::json;
use thiserror::Error;
use std::fmt::Write as _;

pub type Result<T> = std::result::Result<T, PipelineError>;

#[derive(Error, Debug)]
#[allow(clippy::enum_variant_names)]
pub enum PipelineError {
    #[error("Configuration error: {0}")]
    ConfigError(String),
    
    #[error("Database error: {0}")]
    DatabaseError(String),
    
    #[error("ClickHouse error: {0}")]
    ClickHouseError(#[from] clickhouse::error::Error),
    
    #[error("Redis error: {0}")]
    RedisError(#[from] redis::RedisError),
    
    #[error("Kafka error: {0}")]
    KafkaError(#[from] rdkafka::error::KafkaError),
    
    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
    
    #[error("YAML error: {0}")]
    YamlError(#[from] serde_yaml::Error),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("HTTP error: {0}")]
    HttpError(#[from] reqwest::Error),
    
    #[error("Validation error: {0}")]
    ValidationError(String),
    
    #[error("Parsing error: {0}")]
    ParsingError(String),
    
    #[error("Transformation error: {0}")]
    TransformationError(String),
    
    #[error("Routing error: {0}")]
    RoutingError(String),
    
    #[error("Storage error: {0}")]
    StorageError(String),
    
    #[error("Authentication error: {0}")]
    AuthenticationError(String),
    
    #[error("Authorization error: {0}")]
    AuthorizationError(String),
    
    #[error("Rate limit exceeded: {0}")]
    RateLimitError(String),
    
    #[error("Resource not found: {0}")]
    NotFoundError(String),
    
    #[error("Resource conflict: {0}")]
    ConflictError(String),
    
    #[error("Bad request: {0}")]
    BadRequestError(String),
    
    #[error("Internal server error: {0}")]
    InternalError(String),
    
    #[error("Service unavailable: {0}")]
    ServiceUnavailableError(String),
    
    #[error("Timeout error: {0}")]
    TimeoutError(String),
    
    #[error("Connection error: {0}")]
    ConnectionError(String),
    
    #[error("Plugin error: {0}")]
    PluginError(String),
    
    #[error("Schema error: {0}")]
    SchemaError(String),
    
    #[error("Compression error: {0}")]
    CompressionError(String),
    
    #[error("Decompression error: {0}")]
    DecompressionError(String),
    
    #[error("Encoding error: {0}")]
    EncodingError(String),
    
    #[error("Decoding error: {0}")]
    DecodingError(String),
    
    #[error("Buffer overflow: {0}")]
    BufferOverflowError(String),
    
    #[error("Resource exhausted: {0}")]
    ResourceExhaustedError(String),
    
    #[error("Dependency error: {0}")]
    DependencyError(String),
    
    #[error("Migration error: {0}")]
    MigrationError(String),
    
    #[error("Backup error: {0}")]
    BackupError(String),
    
    #[error("Recovery error: {0}")]
    RecoveryError(String),
    
    #[error("Monitoring error: {0}")]
    MonitoringError(String),
    
    #[error("Metrics error: {0}")]
    MetricsError(String),
    
    #[error("Health check error: {0}")]
    HealthCheckError(String),
    
    #[error("Security error: {0}")]
    SecurityError(String),
    
    #[error("Encryption error: {0}")]
    EncryptionError(String),
    
    #[error("Decryption error: {0}")]
    DecryptionError(String),
    
    #[error("Certificate error: {0}")]
    CertificateError(String),
    
    #[error("TLS error: {0}")]
    TlsError(String),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Protocol error: {0}")]
    ProtocolError(String),
    
    #[error("Format error: {0}")]
    FormatError(String),
    
    #[error("Version mismatch: {0}")]
    VersionMismatchError(String),
    
    #[error("Compatibility error: {0}")]
    CompatibilityError(String),
    
    #[error("License error: {0}")]
    LicenseError(String),
    
    #[error("Quota exceeded: {0}")]
    QuotaExceededError(String),
    
    #[error("Maintenance mode: {0}")]
    MaintenanceModeError(String),
    
    #[error("Feature not available: {0}")]
    FeatureNotAvailableError(String),
    
    #[error("Deprecated feature: {0}")]
    DeprecatedFeatureError(String),
    
    #[error("Unknown error: {0}")]
    UnknownError(String),
}

impl IntoResponse for PipelineError {
    fn into_response(self) -> Response {
        let (status, error_message, error_code) = match &self {
            PipelineError::ConfigError(_) => (
                StatusCode::BAD_REQUEST,
                self.to_string(),
                "CONFIG_ERROR",
            ),
            PipelineError::DatabaseError(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Database operation failed".to_string(),
                "DATABASE_ERROR",
            ),
            PipelineError::ClickHouseError(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "ClickHouse operation failed".to_string(),
                "CLICKHOUSE_ERROR",
            ),
            PipelineError::RedisError(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Redis operation failed".to_string(),
                "REDIS_ERROR",
            ),
            PipelineError::KafkaError(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Kafka operation failed".to_string(),
                "KAFKA_ERROR",
            ),
            PipelineError::SerializationError(_) => (
                StatusCode::BAD_REQUEST,
                "Data serialization failed".to_string(),
                "SERIALIZATION_ERROR",
            ),
            PipelineError::YamlError(_) => (
                StatusCode::BAD_REQUEST,
                "YAML parsing failed".to_string(),
                "YAML_ERROR",
            ),
            PipelineError::IoError(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "IO operation failed".to_string(),
                "IO_ERROR",
            ),
            PipelineError::HttpError(_) => (
                StatusCode::BAD_GATEWAY,
                "HTTP request failed".to_string(),
                "HTTP_ERROR",
            ),
            PipelineError::ValidationError(_) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                self.to_string(),
                "VALIDATION_ERROR",
            ),
            PipelineError::ParsingError(_) => (
                StatusCode::BAD_REQUEST,
                self.to_string(),
                "PARSING_ERROR",
            ),
            PipelineError::TransformationError(_) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                self.to_string(),
                "TRANSFORMATION_ERROR",
            ),
            PipelineError::RoutingError(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                self.to_string(),
                "ROUTING_ERROR",
            ),
            PipelineError::StorageError(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                self.to_string(),
                "STORAGE_ERROR",
            ),
            PipelineError::AuthenticationError(_) => (
                StatusCode::UNAUTHORIZED,
                "Authentication failed".to_string(),
                "AUTHENTICATION_ERROR",
            ),
            PipelineError::AuthorizationError(_) => (
                StatusCode::FORBIDDEN,
                "Access denied".to_string(),
                "AUTHORIZATION_ERROR",
            ),
            PipelineError::RateLimitError(msg) => (
                StatusCode::TOO_MANY_REQUESTS,
                if msg.is_empty() { "Rate limit exceeded".to_string() } else { msg.clone() },
                "RATE_LIMIT",
            ),
            PipelineError::NotFoundError(_) => (
                StatusCode::NOT_FOUND,
                self.to_string(),
                "NOT_FOUND_ERROR",
            ),
            PipelineError::ConflictError(_) => (
                StatusCode::CONFLICT,
                self.to_string(),
                "CONFLICT_ERROR",
            ),
            PipelineError::BadRequestError(_) => (
                StatusCode::BAD_REQUEST,
                self.to_string(),
                "BAD_REQUEST_ERROR",
            ),
            PipelineError::InternalError(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error".to_string(),
                "INTERNAL_ERROR",
            ),
            PipelineError::ServiceUnavailableError(_) => (
                StatusCode::SERVICE_UNAVAILABLE,
                "Service temporarily unavailable".to_string(),
                "SERVICE_UNAVAILABLE_ERROR",
            ),
            PipelineError::TimeoutError(_) => (
                StatusCode::REQUEST_TIMEOUT,
                "Request timeout".to_string(),
                "TIMEOUT_ERROR",
            ),
            PipelineError::ConnectionError(_) => (
                StatusCode::BAD_GATEWAY,
                "Connection failed".to_string(),
                "CONNECTION_ERROR",
            ),
            _ => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "An unexpected error occurred".to_string(),
                "UNKNOWN_ERROR",
            ),
        };

        let body_str = serde_json::to_string(&json!({
            "error": {
                "code": error_code,
                "message": error_message,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }
        })).unwrap();
        let mut resp = Response::new(Body::from(body_str));
        *resp.status_mut() = status;
        resp.headers_mut().insert(axum::http::header::CONTENT_TYPE, axum::http::HeaderValue::from_static("application/json"));
        if error_code == "RATE_LIMIT" {
            // Best-effort parse retry_after=N from message
            let retry_after = error_message.split("retry_after=").nth(1).and_then(|s| s.split(|c: char| !c.is_ascii_digit()).next()).unwrap_or("1");
            if let Ok(hv) = axum::http::HeaderValue::from_str(retry_after) {
                resp.headers_mut().insert(axum::http::header::RETRY_AFTER, hv);
            }
        }
        resp
    }
}

// Helper functions for creating specific errors
impl PipelineError {
    pub fn config<S: Into<String>>(msg: S) -> Self {
        PipelineError::ConfigError(msg.into())
    }
    
    pub fn validation<S: Into<String>>(msg: S) -> Self {
        PipelineError::ValidationError(msg.into())
    }
    
    pub fn parsing<S: Into<String>>(msg: S) -> Self {
        PipelineError::ParsingError(msg.into())
    }
    
    pub fn transformation<S: Into<String>>(msg: S) -> Self {
        PipelineError::TransformationError(msg.into())
    }
    
    pub fn routing<S: Into<String>>(msg: S) -> Self {
        PipelineError::RoutingError(msg.into())
    }
    
    pub fn storage<S: Into<String>>(msg: S) -> Self {
        PipelineError::StorageError(msg.into())
    }
    
    pub fn not_found<S: Into<String>>(msg: S) -> Self {
        PipelineError::NotFoundError(msg.into())
    }
    
    pub fn bad_request<S: Into<String>>(msg: S) -> Self {
        PipelineError::BadRequestError(msg.into())
    }
    
    pub fn internal<S: Into<String>>(msg: S) -> Self {
        PipelineError::InternalError(msg.into())
    }
    
    pub fn service_unavailable<S: Into<String>>(msg: S) -> Self {
        PipelineError::ServiceUnavailableError(msg.into())
    }
    
    pub fn metrics<S: Into<String>>(msg: S) -> Self {
        PipelineError::MetricsError(msg.into())
    }
    
    pub fn connection<S: Into<String>>(msg: S) -> Self {
        PipelineError::ConnectionError(msg.into())
    }
    
    pub fn authentication<S: Into<String>>(msg: S) -> Self {
        PipelineError::AuthenticationError(msg.into())
    }
    
    pub fn authorization<S: Into<String>>(msg: S) -> Self {
        PipelineError::AuthorizationError(msg.into())
    }
    
    pub fn rate_limit<S: Into<String>>(msg: S) -> Self {
        PipelineError::RateLimitError(msg.into())
    }
    
    pub fn timeout<S: Into<String>>(msg: S) -> Self {
        PipelineError::TimeoutError(msg.into())
    }
    
    pub fn database<S: Into<String>>(msg: S) -> Self {
        PipelineError::InternalError(msg.into())
    }
    
    pub fn serialization<S: Into<String>>(msg: S) -> Self {
        PipelineError::InternalError(msg.into())
    }
    
    pub fn configuration<S: Into<String>>(msg: S) -> Self {
        PipelineError::ConfigError(msg.into())
    }
    
    pub fn io<S: Into<String>>(msg: S) -> Self {
        PipelineError::InternalError(msg.into())
    }
    
    pub fn http<S: Into<String>>(msg: S) -> Self {
        PipelineError::InternalError(msg.into())
    }

    pub fn kafka<S: Into<String>>(msg: S) -> Self {
        PipelineError::InternalError(msg.into())
    }
    
    pub fn compression<S: Into<String>>(msg: S) -> Self {
        PipelineError::CompressionError(msg.into())
    }
    
    pub fn encoding<S: Into<String>>(msg: S) -> Self {
        PipelineError::EncodingError(msg.into())
    }
}

/// Map ClickHouse HTTP error responses to user-friendly HTTP errors with guardrails
pub fn map_clickhouse_http_error(
    http_status: reqwest::StatusCode,
    ch_body: &str,
    compiled_sql_snippet: Option<&str>,
) -> PipelineError {
    // Try to extract "Code: <num>" from CH body
    let mut code_num: Option<i32> = None;
    if let Some(pos) = ch_body.find("Code:") {
        let tail = &ch_body[pos + 5..];
        let digits: String = tail
            .chars()
            .skip_while(|c| c.is_whitespace())
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if let Ok(n) = digits.parse::<i32>() { code_num = Some(n); }
    }

    let mut msg = String::new();
    let _ = write!(&mut msg, "ClickHouse error{}: {}",
        code_num.map(|n| format!(" (code {})", n)).unwrap_or_default(),
        ch_body.trim());
    if let Some(sql) = compiled_sql_snippet {
        let snippet = if sql.len() > 120 { &sql[..120] } else { sql };
        let _ = write!(&mut msg, " | sql: {}", snippet);
    }

    match code_num {
        // SQL parse / unknown identifier / syntax errors
        Some(47) | Some(62) => PipelineError::ValidationError(msg),
        // Table not found
        Some(60) => {
            // If HTTP is 404 or 503, map to Service Unavailable (likely transient)
            if http_status.as_u16() == 404 || http_status.as_u16() == 503 {
                PipelineError::ServiceUnavailableError(msg)
            } else {
                PipelineError::InternalError(msg)
            }
        }
        // Type mismatch / cannot parse / conversion
        Some(241) | Some(242) => PipelineError::ValidationError(msg),
        // Default: if CH gave 4xx -> BadRequest; 5xx -> ServiceUnavailable; else Internal
        _ => {
            if http_status.is_client_error() {
                PipelineError::BadRequestError(msg)
            } else if http_status.is_server_error() {
                PipelineError::ServiceUnavailableError(msg)
            } else {
                PipelineError::InternalError(msg)
            }
        }
    }
}