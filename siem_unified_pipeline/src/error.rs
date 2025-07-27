use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, PipelineError>;

#[derive(Error, Debug)]
pub enum PipelineError {
    #[error("Configuration error: {0}")]
    ConfigError(String),
    
    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),
    
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
                StatusCode::BAD_REQUEST,
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
            PipelineError::RateLimitError(_) => (
                StatusCode::TOO_MANY_REQUESTS,
                "Rate limit exceeded".to_string(),
                "RATE_LIMIT_ERROR",
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

        let body = Json(json!({
            "error": {
                "code": error_code,
                "message": error_message,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }
        }));

        (status, body).into_response()
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