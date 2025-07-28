//! Configuration management for the ingestion pipeline

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Main configuration structure
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Config {
    pub server: ServerConfig,
    pub clickhouse: ClickHouseConfig,
    pub performance: PerformanceConfig,
    pub security: SecurityConfig,
    pub tenant_config_path: String,
}

/// HTTP server configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerConfig {
    pub bind_address: String,
    pub port: u16,
    pub enable_tls: bool,
    pub tls_cert_path: Option<String>,
    pub tls_key_path: Option<String>,
    pub max_connections: usize,
    pub request_timeout_secs: u64,
}

/// ClickHouse connection configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ClickHouseConfig {
    pub url: String,
    pub database: String,
    pub username: String,
    pub password: String,
    pub compression: String, // "lz4", "gzip", or "none"
    pub pool_size: usize,
    pub connection_timeout_secs: u64,
}

/// Performance tuning configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PerformanceConfig {
    pub target_eps: u64,
    pub batch_size: usize,
    pub flush_interval_ms: u64,
    pub max_buffer_size: usize,
    pub worker_threads: usize,
    pub enable_compression: bool,
}

/// Security configuration
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SecurityConfig {
    pub jwt_secret: Option<String>,
    pub require_auth: bool,
    pub allowed_origins: Vec<String>,
}

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
                bind_address: "0.0.0.0".to_string(),
                port: 8080,
                enable_tls: false,
                tls_cert_path: None,
                tls_key_path: None,
                max_connections: 10000,
                request_timeout_secs: 30,
            },
            clickhouse: ClickHouseConfig {
                url: "tcp://localhost:9000".to_string(),
                database: "siem_logs".to_string(),
                username: "default".to_string(),
                password: "".to_string(),
                compression: "lz4".to_string(),
                pool_size: 50,
                connection_timeout_secs: 10,
            },
            performance: PerformanceConfig {
                target_eps: 500_000,
                batch_size: 1000,
                flush_interval_ms: 1000,
                max_buffer_size: 10_000,
                worker_threads: 50,
                enable_compression: true,
            },
            security: SecurityConfig {
                jwt_secret: None,
                require_auth: true,
                allowed_origins: vec!["*".to_string()],
            },
            tenant_config_path: "tenants.toml".to_string(),
        })
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.server.port, 8080);
        assert_eq!(config.clickhouse.database, "siem_logs");
        assert_eq!(config.performance.target_eps, 500_000);
    }

    #[test]
    fn test_config_serialization() {
        let config = Config::default();
        let toml_str = toml::to_string(&config).unwrap();
        let parsed: Config = toml::from_str(&toml_str).unwrap();
        assert_eq!(config.server.port, parsed.server.port);
    }

    #[test]
    fn test_config_file_operations() {
        let config = Config::default();
        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path().with_extension("toml");
        
        config.save_to_file(path.to_str().unwrap()).unwrap();
        let loaded = Config::from_file(path.to_str().unwrap()).unwrap();
        
        assert_eq!(config.server.port, loaded.server.port);
        assert_eq!(config.clickhouse.database, loaded.clickhouse.database);
    }
}