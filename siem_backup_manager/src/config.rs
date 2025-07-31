use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use tokio::fs;

use crate::storage::StorageProvider;

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupConfig {
    /// Cron schedule for automated backups (e.g., "0 2 * * *" for daily at 2 AM)
    pub schedule: String,
    
    /// ClickHouse configuration
    pub clickhouse: ClickHouseConfig,
    
    /// Storage provider configuration
    pub storage: StorageProvider,
    
    /// Configuration file paths to backup
    pub config_paths: Vec<PathBuf>,
    
    /// Path to store backup metadata
    pub metadata_path: PathBuf,
    
    /// Backup retention in days (0 = keep forever)
    pub retention_days: u32,
    
    /// Whether to backup service state (Redis, etc.)
    pub backup_service_state: bool,
    
    /// Compression level (0-9, where 9 is maximum compression)
    pub compression_level: u32,
    
    /// Encryption settings
    pub encryption: Option<EncryptionConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClickHouseConfig {
    /// ClickHouse host
    pub host: String,
    
    /// ClickHouse port
    pub port: u16,
    
    /// Database name
    pub database: String,
    
    /// Username
    pub username: String,
    
    /// Password
    pub password: String,
    
    /// Backup command (defaults to clickhouse-backup)
    pub backup_command: String,
    
    /// Additional backup arguments
    pub backup_args: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptionConfig {
    /// Encryption key (base64 encoded)
    pub key: String,
    
    /// Encryption algorithm
    pub algorithm: String,
}

impl BackupConfig {
    pub async fn load(path: &Path) -> Result<Self> {
        let content = fs::read_to_string(path).await
            .with_context(|| format!("Failed to read config file: {:?}", path))?;
        
        let config: BackupConfig = toml::from_str(&content)
            .with_context(|| format!("Failed to parse config file: {:?}", path))?;
        
        config.validate()?;
        Ok(config)
    }
    
    pub fn validate(&self) -> Result<()> {
        // Validate cron schedule
        cron::Schedule::from_str(&self.schedule)
            .context("Invalid cron schedule")?;
        
        // Validate compression level
        if self.compression_level > 9 {
            anyhow::bail!("Compression level must be between 0 and 9");
        }
        
        // Validate ClickHouse config
        if self.clickhouse.host.is_empty() {
            anyhow::bail!("ClickHouse host cannot be empty");
        }
        
        if self.clickhouse.database.is_empty() {
            anyhow::bail!("ClickHouse database cannot be empty");
        }
        
        Ok(())
    }
    
    /// Create a default configuration file
    #[allow(dead_code)]
    pub fn create_default() -> Self {
        Self {
            schedule: "0 2 * * *".to_string(), // Daily at 2 AM
            clickhouse: ClickHouseConfig {
                host: "localhost".to_string(),
                port: 8123,
                database: "dev".to_string(),
                username: "default".to_string(),
                password: "".to_string(),
                backup_command: "clickhouse-backup".to_string(),
                backup_args: vec![
                    "create".to_string(),
                    "--rbac".to_string(),
                    "--configs".to_string(),
                ],
            },
            storage: StorageProvider::Local {
                path: "/var/backups/siem".to_string(),
            },
            config_paths: vec![
                PathBuf::from("/etc/siem"),
                PathBuf::from("./haproxy.cfg"),
            ],
            metadata_path: PathBuf::from("/var/backups/siem/metadata"),
            retention_days: 30,
            backup_service_state: true,
            compression_level: 6,
            encryption: None,
        }
    }
    
    /// Save configuration to file
    #[allow(dead_code)]
    pub async fn save(&self, path: &Path) -> Result<()> {
        let content = toml::to_string_pretty(self)
            .context("Failed to serialize configuration")?;
        
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await
                .context("Failed to create config directory")?;
        }
        
        fs::write(path, content).await
            .with_context(|| format!("Failed to write config file: {:?}", path))?;
        
        Ok(())
    }
}