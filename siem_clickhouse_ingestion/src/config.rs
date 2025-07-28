//! Configuration management for the ingestion pipeline

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use config::{Config as ConfigBuilder, File, FileFormat};
use std::net::SocketAddr;
use url::Url;

/// Main configuration structure for the ingestion pipeline
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Config {
    pub server: ServerConfig,
    pub clickhouse: ClickHouseConfig,
    pub performance: PerformanceConfig,
    pub security: SecurityConfig,
    pub tenants: TenantsConfig,
    pub metrics: MetricsConfig,
    pub logging: LoggingConfig,
}

/// HTTP server configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerConfig {
    pub bind_address: SocketAddr,
    pub enable_tls: bool,
    pub tls_cert_path: Option<String>,
    pub tls_key_path: Option<String>,
    pub max_connections: usize,
    pub request_timeout_secs: u64,
    #[serde(default = "default_max_body_size")]
    pub max_body_size: usize,
    #[serde(default = "default_enable_http2")]
    pub enable_http2: bool,
    #[serde(default = "default_keepalive_timeout")]
    pub keepalive_timeout: u64,
}

/// ClickHouse connection configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ClickHouseConfig {
    pub url: Url,
    pub database: String,
    pub username: String,
    pub password: String,
    pub compression: String, // "lz4", "gzip", or "none"
    pub pool_size: usize,
    pub connection_timeout_secs: u64,
    pub batch: BatchConfig,
}

/// Performance tuning configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PerformanceConfig {
    pub target_eps: u64,
    pub max_buffer_size: usize,
    pub worker_threads: usize,
    pub enable_compression: bool,
}

/// Batch processing configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BatchConfig {
    #[serde(default = "default_batch_size")]
    pub size: usize,
    #[serde(default = "default_batch_timeout")]
    pub timeout_ms: u64,
    #[serde(default = "default_batch_memory_limit")]
    pub memory_limit: usize,
}

/// Security configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SecurityConfig {
    pub jwt_secret: Option<String>,
    pub require_auth: bool,
    pub allowed_origins: Vec<String>,
    #[serde(default = "default_enable_tls")]
    pub enable_tls: bool,
    pub cert_file: Option<String>,
    pub key_file: Option<String>,
}

/// Tenant registry configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TenantsConfig {
    /// Path to tenant registry file
    pub registry_file: String,
    /// Auto-reload interval in seconds (0 = disabled)
    #[serde(default = "default_reload_interval")]
    pub reload_interval: u64,
    /// Default tenant for unmatched requests
    pub default_tenant: Option<String>,
}

/// Individual tenant configuration
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct TenantConfig {
    /// Tenant unique identifier
    pub id: String,
    /// Human-readable tenant name
    pub name: String,
    /// API key for authentication
    pub api_key: String,
    /// ClickHouse table name for this tenant
    pub table_name: String,
    /// Rate limiting configuration
    pub rate_limit: RateLimitConfig,
    /// Tenant-specific schema mappings
    #[serde(default)]
    pub schema_mappings: HashMap<String, String>,
    /// Enable/disable tenant
    #[serde(default = "default_tenant_enabled")]
    pub enabled: bool,
}

/// Rate limiting configuration per tenant
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct RateLimitConfig {
    /// Maximum requests per second
    pub requests_per_second: u32,
    /// Maximum bytes per second
    pub bytes_per_second: u64,
    /// Burst capacity
    pub burst_capacity: u32,
}

/// Metrics and monitoring configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MetricsConfig {
    /// Enable Prometheus metrics
    #[serde(default = "default_enable_metrics")]
    pub enabled: bool,
    /// Metrics endpoint path
    #[serde(default = "default_metrics_path")]
    pub path: String,
    /// Metrics collection interval in seconds
    #[serde(default = "default_metrics_interval")]
    pub interval: u64,
}

/// Logging configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LoggingConfig {
    /// Log level ("trace", "debug", "info", "warn", "error")
    #[serde(default = "default_log_level")]
    pub level: String,
    /// Log format ("json", "pretty")
    #[serde(default = "default_log_format")]
    pub format: String,
    /// Enable structured logging
    #[serde(default = "default_structured_logging")]
    pub structured: bool,
}

/// Tenant registry containing all tenant configurations
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TenantRegistry {
    /// Map of tenant ID to tenant configuration
    pub tenants: HashMap<String, TenantConfig>,
    /// Registry metadata
    pub metadata: RegistryMetadata,
}

/// Registry metadata
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RegistryMetadata {
    /// Registry version
    pub version: String,
    /// Last updated timestamp
    pub updated_at: String,
    /// Description
    pub description: Option<String>,
}

// Default value functions
fn default_max_body_size() -> usize { 16 * 1024 * 1024 } // 16MB
fn default_enable_http2() -> bool { true }
fn default_keepalive_timeout() -> u64 { 60 }

fn default_batch_size() -> usize { 1000 }
fn default_batch_timeout() -> u64 { 5000 } // 5 seconds
fn default_batch_memory_limit() -> usize { 64 * 1024 * 1024 } // 64MB

fn default_reload_interval() -> u64 { 300 } // 5 minutes
fn default_tenant_enabled() -> bool { true }

fn default_enable_metrics() -> bool { true }
fn default_metrics_path() -> String { "/metrics".to_string() }
fn default_metrics_interval() -> u64 { 10 }

fn default_log_level() -> String { "info".to_string() }
fn default_log_format() -> String { "json".to_string() }
fn default_structured_logging() -> bool { true }

fn default_enable_tls() -> bool { false }

impl Config {
    /// Load configuration from file or environment
    pub fn load() -> Result<Self> {
        let config_path = std::env::var("SIEM_CONFIG_PATH")
            .unwrap_or_else(|_| "config.toml".to_string());
        
        if Path::new(&config_path).exists() {
            Self::from_file(&config_path)
        } else {
            Self::default_config()
        }
    }

    /// Load configuration using the config crate for more flexibility
    pub fn load_with_overrides() -> Result<Self> {
        let mut builder = ConfigBuilder::builder();
        
        // Load from file if it exists
        let config_path = std::env::var("SIEM_CONFIG_PATH")
            .unwrap_or_else(|_| "config.toml".to_string());
        
        if Path::new(&config_path).exists() {
            let format = if config_path.ends_with(".yaml") || config_path.ends_with(".yml") {
                FileFormat::Yaml
            } else {
                FileFormat::Toml
            };
            builder = builder.add_source(File::new(&config_path, format));
        }
        
        // Override with environment variables
        builder = builder.add_source(
            config::Environment::with_prefix("SIEM")
                .separator("__")
                .try_parsing(true)
        );
        
        let config: Config = builder.build()?.try_deserialize()?;
        config.validate()?;
        Ok(config)
    }

    /// Load configuration from a specific file
    pub fn from_file(path: &str) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read config file: {}", path))?;
        
        if path.ends_with(".toml") {
            toml::from_str(&content)
                .with_context(|| format!("Failed to parse TOML config: {}", path))
        } else if path.ends_with(".yaml") || path.ends_with(".yml") {
            serde_yaml::from_str(&content)
                .with_context(|| format!("Failed to parse YAML config: {}", path))
        } else {
            anyhow::bail!("Unsupported config file format. Use .toml or .yaml")
        }
    }

    /// Generate default configuration
    pub fn default_config() -> Result<Self> {
        Ok(Config {
            server: ServerConfig {
                bind_address: "0.0.0.0:8080".parse()?,
                enable_tls: false,
                tls_cert_path: None,
                tls_key_path: None,
                max_connections: 10000,
                request_timeout_secs: 30,
                max_body_size: default_max_body_size(),
                enable_http2: default_enable_http2(),
                keepalive_timeout: default_keepalive_timeout(),
            },
            clickhouse: ClickHouseConfig {
                url: "tcp://localhost:9000".parse()?,
                database: "siem_logs".to_string(),
                username: "default".to_string(),
                password: "".to_string(),
                compression: "lz4".to_string(),
                pool_size: 50,
                connection_timeout_secs: 10,
                batch: BatchConfig {
                    size: default_batch_size(),
                    timeout_ms: default_batch_timeout(),
                    memory_limit: default_batch_memory_limit(),
                },
            },
            performance: PerformanceConfig {
                target_eps: 500_000,
                max_buffer_size: 10_000,
                worker_threads: 50,
                enable_compression: true,
            },
            security: SecurityConfig {
                jwt_secret: None,
                require_auth: true,
                allowed_origins: vec!["*".to_string()],
                enable_tls: default_enable_tls(),
                cert_file: None,
                key_file: None,
            },
            tenants: TenantsConfig {
                registry_file: "tenants.toml".to_string(),
                reload_interval: default_reload_interval(),
                default_tenant: None,
            },
            metrics: MetricsConfig {
                enabled: default_enable_metrics(),
                path: default_metrics_path(),
                interval: default_metrics_interval(),
            },
            logging: LoggingConfig {
                level: default_log_level(),
                format: default_log_format(),
                structured: default_structured_logging(),
            },
        })
    }

    /// Validate configuration
    pub fn validate(&self) -> Result<()> {
        // Validate server configuration
        if self.server.max_connections == 0 {
            anyhow::bail!("Server max_connections must be greater than 0");
        }
        
        // Validate ClickHouse configuration
        if self.clickhouse.pool_size == 0 {
            anyhow::bail!("ClickHouse pool_size must be greater than 0");
        }
        
        if self.clickhouse.batch.size == 0 {
            anyhow::bail!("ClickHouse batch size must be greater than 0");
        }
        
        // Validate performance configuration
        if self.performance.worker_threads == 0 {
            anyhow::bail!("Performance worker_threads must be greater than 0");
        }
        
        // Validate tenant registry file exists
        if !Path::new(&self.tenants.registry_file).exists() {
            tracing::warn!("Tenant registry file does not exist: {}", self.tenants.registry_file);
        }
        
        Ok(())
    }

    /// Save configuration to file
    pub fn save_to_file(&self, path: &str) -> Result<()> {
        let content = if path.ends_with(".toml") {
            toml::to_string_pretty(self)?
        } else if path.ends_with(".yaml") || path.ends_with(".yml") {
            serde_yaml::to_string(self)?
        } else {
            anyhow::bail!("Unsupported config file format. Use .toml or .yaml")
        };
        
        std::fs::write(path, content)
            .with_context(|| format!("Failed to write config file: {}", path))?;
        
        Ok(())
    }
}

impl Default for Config {
    fn default() -> Self {
        Self::default_config().expect("Failed to create default config")
    }
}

impl TenantRegistry {
    /// Load tenant registry from file
    pub fn load_from_file(path: &str) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read tenant registry file: {}", path))?;
        
        if path.ends_with(".toml") {
            toml::from_str(&content)
                .with_context(|| format!("Failed to parse TOML tenant registry: {}", path))
        } else if path.ends_with(".yaml") || path.ends_with(".yml") {
            serde_yaml::from_str(&content)
                .with_context(|| format!("Failed to parse YAML tenant registry: {}", path))
        } else {
            anyhow::bail!("Unsupported tenant registry file format. Use .toml or .yaml")
        }
    }
    
    /// Save tenant registry to file
    pub fn save_to_file(&self, path: &str) -> Result<()> {
        let content = if path.ends_with(".toml") {
            toml::to_string_pretty(self)?
        } else if path.ends_with(".yaml") || path.ends_with(".yml") {
            serde_yaml::to_string(self)?
        } else {
            anyhow::bail!("Unsupported tenant registry file format. Use .toml or .yaml")
        };
        
        std::fs::write(path, content)
            .with_context(|| format!("Failed to write tenant registry file: {}", path))?;
        
        Ok(())
    }
    
    /// Get tenant by ID
    pub fn get_tenant(&self, tenant_id: &str) -> Option<&TenantConfig> {
        self.tenants.get(tenant_id)
    }
    
    /// Get tenant by API key
    pub fn get_tenant_by_api_key(&self, api_key: &str) -> Option<&TenantConfig> {
        self.tenants.values().find(|tenant| tenant.api_key == api_key)
    }
    
    /// Add or update tenant
    pub fn upsert_tenant(&mut self, tenant: TenantConfig) {
        self.tenants.insert(tenant.id.clone(), tenant);
    }
    
    /// Remove tenant
    pub fn remove_tenant(&mut self, tenant_id: &str) -> Option<TenantConfig> {
        self.tenants.remove(tenant_id)
    }
    
    /// List all enabled tenants
    pub fn enabled_tenants(&self) -> impl Iterator<Item = &TenantConfig> {
        self.tenants.values().filter(|tenant| tenant.enabled)
    }
    
    /// Validate tenant registry
    pub fn validate(&self) -> Result<()> {
        // Check for duplicate API keys
        let mut api_keys = std::collections::HashSet::new();
        for tenant in self.tenants.values() {
            if !api_keys.insert(&tenant.api_key) {
                anyhow::bail!("Duplicate API key found: {}", tenant.api_key);
            }
        }
        
        // Check for duplicate table names
        let mut table_names = std::collections::HashSet::new();
        for tenant in self.tenants.values() {
            if !table_names.insert(&tenant.table_name) {
                anyhow::bail!("Duplicate table name found: {}", tenant.table_name);
            }
        }
        
        Ok(())
    }
    
    /// Create a default tenant registry for testing
    pub fn default_registry() -> Self {
        let mut tenants = HashMap::new();
        
        // Add a default tenant
        tenants.insert(
            "default".to_string(),
            TenantConfig {
                id: "default".to_string(),
                name: "Default Tenant".to_string(),
                api_key: "default-api-key".to_string(),
                table_name: "logs_default".to_string(),
                rate_limit: RateLimitConfig {
                    requests_per_second: 1000,
                    bytes_per_second: 10 * 1024 * 1024, // 10MB/s
                    burst_capacity: 5000,
                },
                schema_mappings: HashMap::new(),
                enabled: true,
            },
        );
        
        Self {
            tenants,
            metadata: RegistryMetadata {
                version: "1.0.0".to_string(),
                updated_at: chrono::Utc::now().to_rfc3339(),
                description: Some("Default tenant registry".to_string()),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.server.bind_address.port(), 8080);
        assert_eq!(config.clickhouse.database, "siem_logs");
        assert_eq!(config.performance.target_eps, 500_000);
        assert_eq!(config.clickhouse.batch.size, 1000);
        assert!(config.metrics.enabled);
    }

    #[test]
    fn test_config_serialization() {
        let config = Config::default();
        let toml_str = toml::to_string(&config).unwrap();
        let parsed: Config = toml::from_str(&toml_str).unwrap();
        assert_eq!(config.server.bind_address, parsed.server.bind_address);
        assert_eq!(config.clickhouse.database, parsed.clickhouse.database);
    }

    #[test]
    fn test_config_file_operations() {
        let config = Config::default();
        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path().with_extension("toml");
        
        config.save_to_file(path.to_str().unwrap()).unwrap();
        let loaded = Config::from_file(path.to_str().unwrap()).unwrap();
        
        assert_eq!(config.server.bind_address, loaded.server.bind_address);
        assert_eq!(config.clickhouse.database, loaded.clickhouse.database);
    }
    
    #[test]
    fn test_tenant_registry() {
        let registry = TenantRegistry::default_registry();
        assert_eq!(registry.tenants.len(), 1);
        
        let default_tenant = registry.get_tenant("default").unwrap();
        assert_eq!(default_tenant.name, "Default Tenant");
        assert!(default_tenant.enabled);
        
        let tenant_by_key = registry.get_tenant_by_api_key("default-api-key").unwrap();
        assert_eq!(tenant_by_key.id, "default");
    }
    
    #[test]
    fn test_tenant_registry_validation() {
        let registry = TenantRegistry::default_registry();
        assert!(registry.validate().is_ok());
        
        // Test duplicate API key validation
        let mut invalid_registry = registry.clone();
        invalid_registry.tenants.insert(
            "duplicate".to_string(),
            TenantConfig {
                id: "duplicate".to_string(),
                name: "Duplicate Tenant".to_string(),
                api_key: "default-api-key".to_string(), // Same API key
                table_name: "logs_duplicate".to_string(),
                rate_limit: RateLimitConfig {
                    requests_per_second: 100,
                    bytes_per_second: 1024 * 1024,
                    burst_capacity: 500,
                },
                schema_mappings: HashMap::new(),
                enabled: true,
            },
        );
        
        assert!(invalid_registry.validate().is_err());
    }
    
    #[test]
    fn test_config_validation() {
        let mut config = Config::default();
        assert!(config.validate().is_ok());
        
        // Test invalid configuration
        config.server.max_connections = 0;
        assert!(config.validate().is_err());
    }
}