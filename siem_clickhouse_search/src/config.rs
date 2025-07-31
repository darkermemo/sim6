//! Configuration module for ClickHouse search service
//! Handles connection pooling, tenant isolation, and performance settings

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;

/// Main configuration structure for the search service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// Server configuration
    pub server: ServerConfig,
    /// ClickHouse database configuration
    pub clickhouse: ClickHouseConfig,
    /// Redis cache configuration
    pub redis: RedisConfig,
    /// Search performance settings
    pub search: SearchConfig,
    /// Security and tenant isolation settings
    pub security: SecurityConfig,
    /// Monitoring and metrics configuration
    pub monitoring: MonitoringConfig,
}

/// HTTP server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// Server bind address
    pub host: String,
    /// Server port
    pub port: u16,
    /// Request timeout in seconds
    pub request_timeout_secs: u64,
    /// Maximum request body size in bytes
    pub max_request_size: usize,
    /// Enable CORS
    pub enable_cors: bool,
    /// Allowed origins for CORS
    pub cors_origins: Vec<String>,
}

/// ClickHouse database configuration with connection pooling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickHouseConfig {
    /// ClickHouse server URL
    pub url: Url,
    /// Database name
    pub database: String,
    /// Username for authentication
    pub username: String,
    /// Password for authentication
    pub password: String,
    /// Connection pool settings
    pub pool: PoolConfig,
    /// Query performance settings
    pub query: QueryConfig,
    /// Table configuration
    pub tables: TableConfig,
}

/// Connection pool configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolConfig {
    /// Maximum number of connections in the pool
    pub max_size: u32,
    /// Minimum number of connections to maintain
    pub min_idle: u32,
    /// Connection timeout in seconds
    pub connection_timeout_secs: u64,
    /// Maximum lifetime of a connection in seconds
    pub max_lifetime_secs: u64,
    /// Idle timeout for connections in seconds
    pub idle_timeout_secs: u64,
    /// Health check interval in seconds
    pub health_check_interval_secs: u64,
}

/// Query performance configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryConfig {
    /// Default query timeout in seconds
    pub default_timeout_secs: u64,
    /// Maximum query timeout in seconds
    pub max_timeout_secs: u64,
    /// Default page size for search results
    pub default_page_size: u32,
    /// Maximum page size allowed
    pub max_page_size: u32,
    /// Maximum number of concurrent queries per tenant
    pub max_concurrent_queries_per_tenant: u32,
    /// Enable query result caching
    pub enable_caching: bool,
    /// Cache TTL in seconds
    pub cache_ttl_secs: u64,
    /// Maximum memory usage per query in bytes
    pub max_memory_usage: u64,
    /// Enable query optimization
    pub enable_optimization: bool,
}

/// Table configuration for ClickHouse
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableConfig {
    /// Default table name for logs
    pub default_table: String,
    /// Table name pattern for tenant-specific tables
    pub tenant_table_pattern: String,
    /// Enable automatic table creation
    pub auto_create_tables: bool,
    /// Partition settings
    pub partition: PartitionConfig,
}

/// Partition configuration for ClickHouse tables
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartitionConfig {
    /// Partition by time interval (daily, monthly)
    pub time_interval: String,
    /// Retention period in days
    pub retention_days: u32,
    /// Enable automatic partition pruning
    pub auto_prune: bool,
}

/// Redis cache configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConfig {
    /// Redis server URL
    pub url: String,
    /// Connection pool size
    pub pool_size: u32,
    /// Connection timeout in seconds
    pub connection_timeout_secs: u64,
    /// Default TTL for cached items in seconds
    pub default_ttl_secs: u64,
    /// Maximum cache size in bytes
    pub max_cache_size: u64,
    /// Enable cache compression
    pub enable_compression: bool,
}

/// Search performance and behavior configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchConfig {
    /// Enable full-text search
    pub enable_fulltext: bool,
    /// Enable regex search
    pub enable_regex: bool,
    /// Maximum regex complexity score
    pub max_regex_complexity: u32,
    /// Enable search result streaming
    pub enable_streaming: bool,
    /// Streaming chunk size
    pub streaming_chunk_size: u32,
    /// Enable search analytics
    pub enable_analytics: bool,
    /// Search result ranking algorithm
    pub ranking_algorithm: String,
    /// Enable search suggestions
    pub enable_suggestions: bool,
}

/// Security and tenant isolation configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    /// Enable tenant isolation
    pub enable_tenant_isolation: bool,
    /// JWT secret for token validation
    pub jwt_secret: String,
    /// Token expiration time in seconds
    pub token_expiration_secs: u64,
    /// Enable rate limiting
    pub enable_rate_limiting: bool,
    /// Rate limit per tenant (requests per minute)
    pub rate_limit_per_tenant: u32,
    /// Enable audit logging
    pub enable_audit_logging: bool,
    /// Allowed tenant IDs (empty means all allowed)
    pub allowed_tenants: Vec<String>,
}

/// Monitoring and metrics configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringConfig {
    /// Enable Prometheus metrics
    pub enable_metrics: bool,
    /// Metrics endpoint path
    pub metrics_path: String,
    /// Enable health check endpoint
    pub enable_health_check: bool,
    /// Health check endpoint path
    pub health_check_path: String,
    /// Enable performance monitoring
    pub enable_performance_monitoring: bool,
    /// Performance metrics collection interval in seconds
    pub performance_interval_secs: u64,
    /// Enable query logging
    pub enable_query_logging: bool,
    /// Log slow queries threshold in milliseconds
    pub slow_query_threshold_ms: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            clickhouse: ClickHouseConfig::default(),
            redis: RedisConfig::default(),
            search: SearchConfig::default(),
            security: SecurityConfig::default(),
            monitoring: MonitoringConfig::default(),
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 8084,
            request_timeout_secs: 30,
            max_request_size: 10 * 1024 * 1024, // 10MB
            enable_cors: true,
            cors_origins: vec!["*".to_string()],
        }
    }
}

impl Default for ClickHouseConfig {
    fn default() -> Self {
        Self {
            url: Url::parse("http://localhost:8123").unwrap(),
            database: "siem".to_string(),
            username: "default".to_string(),
            password: "".to_string(),
            pool: PoolConfig::default(),
            query: QueryConfig::default(),
            tables: TableConfig::default(),
        }
    }
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_size: 20,
            min_idle: 5,
            connection_timeout_secs: 10,
            max_lifetime_secs: 3600, // 1 hour
            idle_timeout_secs: 600,   // 10 minutes
            health_check_interval_secs: 30,
        }
    }
}

impl Default for QueryConfig {
    fn default() -> Self {
        Self {
            default_timeout_secs: 30,
            max_timeout_secs: 300, // 5 minutes
            default_page_size: 100,
            max_page_size: 10000,
            max_concurrent_queries_per_tenant: 10,
            enable_caching: true,
            cache_ttl_secs: 300, // 5 minutes
            max_memory_usage: 1024 * 1024 * 1024, // 1GB
            enable_optimization: true,
        }
    }
}

impl Default for TableConfig {
    fn default() -> Self {
        Self {
            default_table: "logs".to_string(),
            tenant_table_pattern: "logs_{tenant_id}".to_string(),
            auto_create_tables: true,
            partition: PartitionConfig::default(),
        }
    }
}

impl Default for PartitionConfig {
    fn default() -> Self {
        Self {
            time_interval: "monthly".to_string(),
            retention_days: 90,
            auto_prune: true,
        }
    }
}

impl Default for RedisConfig {
    fn default() -> Self {
        Self {
            url: "redis://localhost:6379".to_string(),
            pool_size: 10,
            connection_timeout_secs: 5,
            default_ttl_secs: 300, // 5 minutes
            max_cache_size: 512 * 1024 * 1024, // 512MB
            enable_compression: true,
        }
    }
}

impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            enable_fulltext: true,
            enable_regex: true,
            max_regex_complexity: 1000,
            enable_streaming: true,
            streaming_chunk_size: 1000,
            enable_analytics: true,
            ranking_algorithm: "relevance".to_string(),
            enable_suggestions: true,
        }
    }
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            enable_tenant_isolation: true,
            jwt_secret: "your-secret-key-change-in-production".to_string(),
            token_expiration_secs: 3600, // 1 hour
            enable_rate_limiting: true,
            rate_limit_per_tenant: 1000, // 1000 requests per minute
            enable_audit_logging: true,
            allowed_tenants: vec![], // Empty means all allowed
        }
    }
}

impl Default for MonitoringConfig {
    fn default() -> Self {
        Self {
            enable_metrics: true,
            metrics_path: "/metrics".to_string(),
            enable_health_check: true,
            health_check_path: "/health".to_string(),
            enable_performance_monitoring: true,
            performance_interval_secs: 60,
            enable_query_logging: true,
            slow_query_threshold_ms: 1000, // 1 second
        }
    }
}

impl Config {
    /// Load configuration from file
    pub fn from_file(path: &str) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read config file: {}", path))?;
        
        let config: Config = toml::from_str(&content)
            .with_context(|| format!("Failed to parse config file: {}", path))?;
        
        config.validate()?;
        Ok(config)
    }
    
    /// Load configuration from environment variables and defaults
    pub fn from_env() -> Result<Self> {
        let mut config = Config::default();
        
        // Override with environment variables
        if let Ok(host) = std::env::var("SEARCH_SERVER_HOST") {
            config.server.host = host;
        }
        
        if let Ok(port) = std::env::var("SEARCH_SERVER_PORT") {
            config.server.port = port.parse()
                .context("Invalid SEARCH_SERVER_PORT")?;
        }
        
        if let Ok(url) = std::env::var("CLICKHOUSE_URL") {
            config.clickhouse.url = Url::parse(&url)
                .context("Invalid CLICKHOUSE_URL")?;
        }
        
        if let Ok(database) = std::env::var("CLICKHOUSE_DATABASE") {
            config.clickhouse.database = database;
        }
        
        if let Ok(username) = std::env::var("CLICKHOUSE_USERNAME") {
            config.clickhouse.username = username;
        }
        
        if let Ok(password) = std::env::var("CLICKHOUSE_PASSWORD") {
            config.clickhouse.password = password;
        }
        
        if let Ok(redis_url) = std::env::var("REDIS_URL") {
            config.redis.url = redis_url;
        }
        
        if let Ok(jwt_secret) = std::env::var("JWT_SECRET") {
            config.security.jwt_secret = jwt_secret;
        }
        
        config.validate()?;
        Ok(config)
    }
    
    /// Validate configuration values
    pub fn validate(&self) -> Result<()> {
        // Validate server configuration
        if self.server.port == 0 {
            return Err(anyhow::anyhow!("Server port cannot be 0"));
        }
        
        if self.server.request_timeout_secs == 0 {
            return Err(anyhow::anyhow!("Request timeout cannot be 0"));
        }
        
        // Validate ClickHouse configuration
        if self.clickhouse.database.is_empty() {
            return Err(anyhow::anyhow!("ClickHouse database name cannot be empty"));
        }
        
        if self.clickhouse.pool.max_size == 0 {
            return Err(anyhow::anyhow!("Connection pool max_size cannot be 0"));
        }
        
        if self.clickhouse.pool.min_idle > self.clickhouse.pool.max_size {
            return Err(anyhow::anyhow!("Pool min_idle cannot be greater than max_size"));
        }
        
        // Validate query configuration
        if self.clickhouse.query.default_page_size == 0 {
            return Err(anyhow::anyhow!("Default page size cannot be 0"));
        }
        
        if self.clickhouse.query.max_page_size < self.clickhouse.query.default_page_size {
            return Err(anyhow::anyhow!("Max page size cannot be less than default page size"));
        }
        
        // Validate security configuration
        if self.security.jwt_secret.len() < 32 {
            return Err(anyhow::anyhow!("JWT secret must be at least 32 characters long"));
        }
        
        Ok(())
    }
    
    /// Get connection timeout as Duration
    pub fn connection_timeout(&self) -> Duration {
        Duration::from_secs(self.clickhouse.pool.connection_timeout_secs)
    }
    
    /// Get query timeout as Duration
    pub fn query_timeout(&self) -> Duration {
        Duration::from_secs(self.clickhouse.query.default_timeout_secs)
    }
    
    /// Get request timeout as Duration
    pub fn request_timeout(&self) -> Duration {
        Duration::from_secs(self.server.request_timeout_secs)
    }
    
    /// Get table name for a specific tenant
    pub fn get_table_name(&self, tenant_id: Option<&str>) -> String {
        match tenant_id {
            Some(id) if self.security.enable_tenant_isolation => {
                self.clickhouse.tables.tenant_table_pattern
                    .replace("{tenant_id}", id)
            }
            _ => self.clickhouse.tables.default_table.clone(),
        }
    }
}