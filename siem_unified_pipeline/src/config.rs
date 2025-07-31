use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use crate::error::{Result, PipelineError};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PipelineConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub sources: HashMap<String, DataSource>,
    pub transformations: HashMap<String, TransformationPipeline>,
    pub destinations: HashMap<String, DataDestination>,
    pub routing: RoutingConfig,
    pub storage: StorageConfig,
    pub metrics: MetricsConfig,
    pub security: SecurityConfig,
    pub performance: PerformanceConfig,
    pub rate_limiting: RateLimitingConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub workers: usize,
    pub max_connections: usize,
    pub request_timeout: u64,
    pub enable_cors: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DataSource {
    pub source_type: SourceType,
    pub config: SourceConfig,
    pub enabled: bool,
    pub batch_size: usize,
    pub buffer_size: usize,
    pub retry_attempts: u32,
    pub retry_delay: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    Syslog { port: u16, protocol: String },
    Http { endpoint: String, method: String },
    Kafka { topic: String, brokers: Vec<String> },
    File { path: String, watch: bool },
    Database { connection_string: String, query: String },
    S3 { bucket: String, prefix: String, region: String },
    Beats { port: u16 },
    Fluentd { port: u16 },
    Custom { plugin: String, config: HashMap<String, String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SourceConfig {
    pub format: DataFormat,
    pub compression: Option<CompressionType>,
    pub encoding: String,
    pub timestamp_field: Option<String>,
    pub timestamp_format: Option<String>,
    pub fields: HashMap<String, FieldConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataFormat {
    Json,
    Csv,
    Syslog,
    CommonEventFormat,
    Leef,
    Xml,
    Parquet,
    Avro,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompressionType {
    Gzip,
    Zstd,
    Lz4,
    Snappy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FieldConfig {
    pub field_type: FieldType,
    pub required: bool,
    pub default_value: Option<String>,
    pub validation: Option<ValidationRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FieldType {
    String,
    Integer,
    Float,
    Boolean,
    Timestamp,
    IpAddress,
    Url,
    Email,
    Json,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationRule {
    Regex(String),
    Range { min: f64, max: f64 },
    Length { min: usize, max: usize },
    OneOf(Vec<String>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TransformationPipeline {
    pub steps: Vec<TransformationStep>,
    pub parallel: bool,
    pub error_handling: ErrorHandling,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
pub enum TransformationStep {
    Parse {
        parser: String,
        config: HashMap<String, String>,
    },
    Enrich {
        enricher: String,
        config: HashMap<String, String>,
    },
    Filter {
        condition: String,
        action: FilterAction,
    },
    Map {
        field_mappings: HashMap<String, String>,
    },
    Normalize {
        schema: String,
        strict: bool,
    },
    Aggregate {
        window: String,
        functions: Vec<AggregateFunction>,
    },
    Custom {
        plugin: String,
        config: HashMap<String, String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FilterAction {
    Drop,
    Route(String),
    Tag(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AggregateFunction {
    pub function: String,
    pub field: String,
    pub output_field: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorHandling {
    Drop,
    DeadLetter,
    Retry { max_attempts: u32, delay: u64 },
    Continue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DataDestination {
    pub destination_type: DestinationType,
    pub config: DestinationConfig,
    pub enabled: bool,
    pub batch_size: usize,
    pub flush_interval: u64,
    pub retry_attempts: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
pub enum DestinationType {
    ClickHouse {
        connection_string: String,
        table: String,
        database: String,
    },
    Kafka {
        topic: String,
        brokers: Vec<String>,
    },
    Redis {
        connection_string: String,
        key_pattern: String,
        ttl: Option<u64>,
    },
    S3 {
        bucket: String,
        prefix: String,
        region: String,
    },

    File {
        path: String,
        rotation: FileRotation,
    },
    Http {
        endpoint: String,
        method: String,
        headers: HashMap<String, String>,
    },
    Custom {
        plugin: String,
        config: HashMap<String, String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DestinationConfig {
    pub format: DataFormat,
    pub compression: Option<CompressionType>,
    pub partitioning: Option<PartitioningConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FileRotation {
    pub size_mb: u64,
    pub time_hours: u64,
    pub keep_files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PartitioningConfig {
    pub strategy: PartitioningStrategy,
    pub fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PartitioningStrategy {
    Time { format: String },
    Hash { buckets: u32 },
    Field { field: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoutingConfig {
    pub rules: Vec<RoutingRule>,
    pub default_destination: String,
    pub load_balancing: LoadBalancingStrategy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoutingRule {
    pub name: String,
    pub condition: String,
    pub destinations: Vec<String>,
    pub priority: u32,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LoadBalancingStrategy {
    RoundRobin,
    Random,
    Weighted(HashMap<String, u32>),
    LeastConnections,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct StorageConfig {
    pub data_lake: DataLakeConfig,
    pub hot_storage: HotStorageConfig,
    pub cold_storage: ColdStorageConfig,
    pub retention: RetentionConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DataLakeConfig {
    pub provider: String,
    pub bucket: String,
    pub region: String,
    pub access_key: String,
    pub secret_key: String,
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub connection_timeout: u64,
    pub idle_timeout: u64,
    pub max_lifetime: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct HotStorageConfig {
    pub clickhouse_url: String,
    pub database: String,
    pub retention_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ColdStorageConfig {
    pub s3_bucket: String,
    pub compression: CompressionType,
    pub format: DataFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RetentionConfig {
    pub hot_days: u32,
    pub warm_days: u32,
    pub cold_days: u32,
    pub delete_after_days: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MetricsConfig {
    pub enabled: bool,
    pub port: u16,
    pub path: String,
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SecurityConfig {
    pub tls: Option<TlsConfig>,
    pub authentication: Option<AuthConfig>,
    pub rate_limiting: Option<RateLimitConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TlsConfig {
    pub cert_file: String,
    pub key_file: String,
    pub ca_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AuthConfig {
    pub method: AuthMethod,
    pub config: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    ApiKey,
    JWT,
    Basic,
    OAuth2,
    Mutual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RateLimitConfig {
    pub requests_per_second: u32,
    pub burst_size: u32,
    pub window_seconds: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PerformanceConfig {
    pub workers: WorkersConfig,
    pub buffers: BuffersConfig,
    pub memory: MemoryConfig,
    pub parallel_processing: Option<ParallelProcessingConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct WorkersConfig {
    pub ingestion_workers: usize,
    pub transformation_workers: usize,
    pub routing_workers: usize,
    pub storage_workers: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct BuffersConfig {
    pub event_buffer_size: usize,
    pub batch_buffer_size: usize,
    pub flush_interval_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MemoryConfig {
    pub max_memory_usage: String,
    pub gc_threshold: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ParallelProcessingConfig {
    pub enabled: bool,
    pub worker_count: Option<usize>,
    pub batch_size: usize,
    pub batch_timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RateLimitingConfig {
    pub enabled: bool,
    pub requests_per_second: u32,
    pub burst_size: u32,
}

impl PipelineConfig {
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| PipelineError::ConfigError(format!("Failed to read config file: {}", e)))?;
        
        let config: PipelineConfig = toml::from_str(&content)
            .map_err(|e| PipelineError::ConfigError(format!("Failed to parse config: {}", e)))?;
        
        config.validate()?;
        Ok(config)
    }
    
    pub async fn from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let content = tokio::fs::read_to_string(path).await
            .map_err(|e| PipelineError::ConfigError(format!("Failed to read config file: {}", e)))?;
        
        // Try YAML first, then TOML
        if let Ok(config) = serde_yaml::from_str::<PipelineConfig>(&content) {
            config.validate()?;
            return Ok(config);
        }
        
        let config: PipelineConfig = toml::from_str(&content)
            .map_err(|e| PipelineError::ConfigError(format!("Failed to parse config: {}", e)))?;
        
        config.validate()?;
        Ok(config)
    }
    
    pub async fn from_env() -> Result<Self> {
        // Load from environment variables with SIEM_ prefix
        let mut config = Self::default();
        
        // Server configuration
        if let Ok(host) = std::env::var("SIEM_SERVER_HOST") {
            config.server.host = host;
        }
        if let Ok(port) = std::env::var("SIEM_SERVER_PORT") {
            config.server.port = port.parse().unwrap_or(8080);
        }
        if let Ok(workers) = std::env::var("SIEM_SERVER_WORKERS") {
            config.server.workers = workers.parse().unwrap_or(num_cpus::get());
        }
        
        // Database configuration
        if let Ok(db_host) = std::env::var("SIEM_DATABASE_HOST") {
            config.database.host = db_host;
        }
        if let Ok(db_port) = std::env::var("SIEM_DATABASE_PORT") {
            config.database.port = db_port.parse().unwrap_or(5432);
        }
        if let Ok(db_name) = std::env::var("SIEM_DATABASE_NAME") {
            config.database.database = db_name;
        }
        if let Ok(db_user) = std::env::var("SIEM_DATABASE_USER") {
            config.database.username = db_user;
        }
        if let Ok(db_pass) = std::env::var("SIEM_DATABASE_PASSWORD") {
            config.database.password = db_pass;
        }
        
        // ClickHouse hot storage configuration
        if let Ok(ch_url) = std::env::var("SIEM_CLICKHOUSE_URL") {
            config.storage.hot_storage.clickhouse_url = ch_url;
        }
        if let Ok(ch_db) = std::env::var("SIEM_CLICKHOUSE_DATABASE") {
            config.storage.hot_storage.database = ch_db;
        }
        
        config.validate()?;
        Ok(config)
    }
    
    pub fn save<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let content = toml::to_string_pretty(self)
            .map_err(|e| PipelineError::ConfigError(format!("Failed to serialize config: {}", e)))?;
        
        std::fs::write(path, content)
            .map_err(|e| PipelineError::ConfigError(format!("Failed to write config file: {}", e)))?;
        
        Ok(())
    }
    
    pub async fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let content = serde_yaml::to_string(self)
            .map_err(|e| PipelineError::ConfigError(format!("Failed to serialize config: {}", e)))?;
        
        tokio::fs::write(path, content).await
            .map_err(|e| PipelineError::ConfigError(format!("Failed to write config file: {}", e)))?;
        
        Ok(())
    }
    
    pub fn validate(&self) -> Result<()> {
        // Validate that referenced destinations exist
        if !self.destinations.contains_key(&self.routing.default_destination) {
            return Err(PipelineError::ConfigError(
                format!("Default destination '{}' not found", self.routing.default_destination)
            ));
        }
        
        // Validate routing rules
        for rule in &self.routing.rules {
            for dest in &rule.destinations {
                if !self.destinations.contains_key(dest) {
                    return Err(PipelineError::ConfigError(
                        format!("Destination '{}' in rule '{}' not found", dest, rule.name)
                    ));
                }
            }
        }
        
        Ok(())
    }
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "0.0.0.0".to_string(),
                port: 8080,
                workers: num_cpus::get(),
                max_connections: 1000,
                request_timeout: 30,
                enable_cors: true,
            },
            database: DatabaseConfig {
                host: "localhost".to_string(),
                port: 5432,
                database: "dev".to_string(),
                username: "siem_user".to_string(),
                password: "siem_password".to_string(),
                max_connections: 20,
                min_connections: 5,
                connection_timeout: 30,
                idle_timeout: 600,
                max_lifetime: 3600,
            },
            sources: HashMap::new(),
            transformations: HashMap::new(),
            destinations: HashMap::new(),
            routing: RoutingConfig {
                rules: Vec::new(),
                default_destination: "default".to_string(),
                load_balancing: LoadBalancingStrategy::RoundRobin,
            },
            storage: StorageConfig {
                data_lake: DataLakeConfig {
                    provider: "minio".to_string(),
                    bucket: "siem-data-lake".to_string(),
                    region: "us-east-1".to_string(),
                    access_key: "minioadmin".to_string(),
                    secret_key: "minioadmin".to_string(),
                    endpoint: Some("http://localhost:9000".to_string()),
                },
                hot_storage: HotStorageConfig {
                    clickhouse_url: "tcp://localhost:9000/default".to_string(),
                    database: "dev".to_string(),
                    retention_days: 30,
                },
                cold_storage: ColdStorageConfig {
                    s3_bucket: "siem-cold-storage".to_string(),
                    compression: CompressionType::Zstd,
                    format: DataFormat::Parquet,
                },
                retention: RetentionConfig {
                    hot_days: 7,
                    warm_days: 30,
                    cold_days: 365,
                    delete_after_days: Some(2555), // 7 years
                },
            },
            metrics: MetricsConfig {
                enabled: true,
                port: 9090,
                path: "/metrics".to_string(),
                labels: HashMap::new(),
            },
            security: SecurityConfig {
                tls: None,
                authentication: None,
                rate_limiting: Some(RateLimitConfig {
                    requests_per_second: 1000,
                    burst_size: 100,
                    window_seconds: 60,
                }),
            },
            performance: PerformanceConfig {
                workers: WorkersConfig {
                    ingestion_workers: 4,
                    transformation_workers: 8,
                    routing_workers: 4,
                    storage_workers: 8,
                },
                buffers: BuffersConfig {
                    event_buffer_size: 100000,
                    batch_buffer_size: 10000,
                    flush_interval_ms: 1000,
                },
                memory: MemoryConfig {
                    max_memory_usage: "8GB".to_string(),
                    gc_threshold: "6GB".to_string(),
                },
                parallel_processing: Some(ParallelProcessingConfig {
                    enabled: false,
                    worker_count: Some(16),
                    batch_size: 1000,
                    batch_timeout_ms: 100,
                }),
            },
            rate_limiting: RateLimitingConfig {
                enabled: true,
                requests_per_second: 10000,
                burst_size: 50000,
            },
        }
    }
}