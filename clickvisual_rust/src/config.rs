use serde::{Deserialize, Serialize};
use std::path::Path;
use crate::error::{Result, ClickVisualError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub clickhouse: ClickHouseConfig,
    pub auth: AuthConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub max_age: u32,
    pub serve_from_sub_path: bool,
    pub root_url: String,
    pub sub_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub acquire_timeout: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickHouseConfig {
    pub url: String,
    pub username: String,
    pub password: String,
    pub database: String,
    pub read_timeout: u64,
    pub write_timeout: u64,
    pub debug: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub jwt_secret: String,
    pub jwt_expiration: u64,
    pub session_timeout: u64,
    pub oauth_providers: Vec<OAuthProvider>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthProvider {
    pub name: String,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_url: String,
    pub auth_url: String,
    pub token_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub format: String,
    pub file: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "0.0.0.0".to_string(),
                port: 19001,
                max_age: 31536000,
                serve_from_sub_path: false,
                root_url: "http://localhost:19001".to_string(),
                sub_url: "".to_string(),
            },
            database: DatabaseConfig {
                url: "postgres://clickvisual:clickvisual@localhost:5432/clickvisual".to_string(),
                max_connections: 10,
                min_connections: 1,
                acquire_timeout: 30,
            },
            clickhouse: ClickHouseConfig {
                url: "http://localhost:8123".to_string(),
                username: "default".to_string(),
                password: "".to_string(),
                database: "dev".to_string(),
                read_timeout: 10,
                write_timeout: 10,
                debug: false,
            },
            auth: AuthConfig {
                jwt_secret: "your-secret-key".to_string(),
                jwt_expiration: 3600,
                session_timeout: 86400,
                oauth_providers: vec![],
            },
            logging: LoggingConfig {
                level: "info".to_string(),
                format: "json".to_string(),
                file: None,
            },
        }
    }
}

impl Config {
    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| ClickVisualError::Config(format!("Failed to read config file: {}", e)))?;
        
        let config: Config = toml::from_str(&content)
            .map_err(|e| ClickVisualError::Config(format!("Failed to parse config: {}", e)))?;
        
        Ok(config)
    }

    pub fn from_env() -> Result<Self> {
        let mut config = Config::default();
        
        if let Ok(host) = std::env::var("CLICKVISUAL_HOST") {
            config.server.host = host;
        }
        
        if let Ok(port) = std::env::var("CLICKVISUAL_PORT") {
            config.server.port = port.parse()
                .map_err(|e| ClickVisualError::Config(format!("Invalid port: {}", e)))?;
        }
        
        if let Ok(db_url) = std::env::var("DATABASE_URL") {
            config.database.url = db_url;
        }
        
        if let Ok(ch_url) = std::env::var("CLICKHOUSE_URL") {
            config.clickhouse.url = ch_url;
        }
        
        if let Ok(ch_user) = std::env::var("CLICKHOUSE_USERNAME") {
            config.clickhouse.username = ch_user;
        }
        
        if let Ok(ch_pass) = std::env::var("CLICKHOUSE_PASSWORD") {
            config.clickhouse.password = ch_pass;
        }
        
        if let Ok(ch_db) = std::env::var("CLICKHOUSE_DATABASE") {
            config.clickhouse.database = ch_db;
        }
        
        if let Ok(jwt_secret) = std::env::var("JWT_SECRET") {
            config.auth.jwt_secret = jwt_secret;
        }
        
        Ok(config)
    }

    pub fn load_or_create<P: AsRef<Path>>(path: P) -> Result<Self> {
        if path.as_ref().exists() {
            Self::from_file(path)
        } else {
            let config = Self::from_env()?;
            config.save_to_file(&path)?;
            Ok(config)
        }
    }

    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let content = toml::to_string_pretty(self)
            .map_err(|e| ClickVisualError::Config(format!("Failed to serialize config: {}", e)))?;
        
        std::fs::write(path, content)
            .map_err(|e| ClickVisualError::Config(format!("Failed to write config file: {}", e)))?;
        
        Ok(())
    }
}