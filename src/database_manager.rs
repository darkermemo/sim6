//! Standardized database connection manager for the SIEM system
//! Provides unified interface for ClickHouse connections with proper pooling,
//! health monitoring, and error handling

use crate::error_handling::{SiemError, SiemResult, DatabaseHealthChecker, RetryPolicy};

use clickhouse::Client;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::RwLock;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Database configuration with validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub database: String,
    pub username: String,
    pub password: String,
    pub connection_timeout_ms: u64,
    pub query_timeout_ms: u64,
    pub max_connections: u32,
    pub min_connections: u32,
    pub connection_idle_timeout_ms: u64,
    pub health_check_interval_ms: u64,
}

impl DatabaseConfig {
    /// Load configuration from environment variables with validation
    pub fn from_env() -> SiemResult<Self> {
        let url = std::env::var("CLICKHOUSE_URL")
            .map_err(|_| SiemError::configuration("CLICKHOUSE_URL environment variable not set"))?;
        
        let database = std::env::var("CLICKHOUSE_DATABASE")
            .map_err(|_| SiemError::configuration("CLICKHOUSE_DATABASE environment variable not set"))?;
        
        let username = std::env::var("CLICKHOUSE_USERNAME")
            .map_err(|_| SiemError::configuration("CLICKHOUSE_USERNAME environment variable not set"))?;
        
        let password = std::env::var("CLICKHOUSE_PASSWORD").unwrap_or_default();
        
        // Validate required fields are not empty
        if url.trim().is_empty() {
            return Err(SiemError::configuration("CLICKHOUSE_URL cannot be empty"));
        }
        if database.trim().is_empty() {
            return Err(SiemError::configuration("CLICKHOUSE_DATABASE cannot be empty"));
        }
        if username.trim().is_empty() {
            return Err(SiemError::configuration("CLICKHOUSE_USERNAME cannot be empty"));
        }
        
        // Parse optional configuration with defaults
        let connection_timeout_ms = std::env::var("CLICKHOUSE_CONNECTION_TIMEOUT_MS")
            .unwrap_or_else(|_| "30000".to_string())
            .parse()
            .map_err(|_| SiemError::configuration("Invalid CLICKHOUSE_CONNECTION_TIMEOUT_MS"))?;
        
        let query_timeout_ms = std::env::var("CLICKHOUSE_QUERY_TIMEOUT_MS")
            .unwrap_or_else(|_| "60000".to_string())
            .parse()
            .map_err(|_| SiemError::configuration("Invalid CLICKHOUSE_QUERY_TIMEOUT_MS"))?;
        
        let max_connections = std::env::var("CLICKHOUSE_MAX_CONNECTIONS")
            .unwrap_or_else(|_| "10".to_string())
            .parse()
            .map_err(|_| SiemError::configuration("Invalid CLICKHOUSE_MAX_CONNECTIONS"))?;
        
        let min_connections = std::env::var("CLICKHOUSE_MIN_CONNECTIONS")
            .unwrap_or_else(|_| "2".to_string())
            .parse()
            .map_err(|_| SiemError::configuration("Invalid CLICKHOUSE_MIN_CONNECTIONS"))?;
        
        // Validate connection pool settings
        if max_connections < min_connections {
            return Err(SiemError::configuration(
                "CLICKHOUSE_MAX_CONNECTIONS must be >= CLICKHOUSE_MIN_CONNECTIONS"
            ));
        }
        
        if max_connections == 0 {
            return Err(SiemError::configuration(
                "CLICKHOUSE_MAX_CONNECTIONS must be > 0"
            ));
        }
        
        Ok(Self {
            url,
            database,
            username,
            password,
            connection_timeout_ms,
            query_timeout_ms,
            max_connections,
            min_connections,
            connection_idle_timeout_ms: 300000, // 5 minutes
            health_check_interval_ms: 30000,    // 30 seconds
        })
    }
    
    /// Create a ClickHouse client with this configuration
    pub fn create_client(&self) -> SiemResult<Client> {
        let client = Client::default()
            .with_url(&self.url)
            .with_database(&self.database)
            .with_user(&self.username)
            .with_password(&self.password)
            .with_compression(clickhouse::Compression::Lz4);
        
        info!(
            "Created ClickHouse client for database '{}' at '{}'",
            self.database, self.url
        );
        
        Ok(client)
    }
}

/// Connection pool statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStats {
    pub total_connections: u32,
    pub active_connections: u32,
    pub idle_connections: u32,
    pub failed_connections: u32,
    pub total_queries: u64,
    pub successful_queries: u64,
    pub failed_queries: u64,
    pub average_query_time_ms: f64,
    pub last_health_check: Option<chrono::DateTime<chrono::Utc>>,
    pub health_status: HealthStatus,
}

impl Default for ConnectionStats {
    fn default() -> Self {
        Self {
            total_connections: 0,
            active_connections: 0,
            idle_connections: 0,
            failed_connections: 0,
            total_queries: 0,
            successful_queries: 0,
            failed_queries: 0,
            average_query_time_ms: 0.0,
            last_health_check: None,
            health_status: HealthStatus::Unknown,
        }
    }
}

/// Health status of the database connection
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}

/// Managed database connection with metadata
struct ManagedConnection {
    client: Client,
    id: Uuid,
    created_at: Instant,
    last_used: Instant,
    query_count: u64,
    is_healthy: bool,
}

impl std::fmt::Debug for ManagedConnection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ManagedConnection")
            .field("client", &"Client { .. }")
            .field("id", &self.id)
            .field("created_at", &self.created_at)
            .field("last_used", &self.last_used)
            .field("query_count", &self.query_count)
            .field("is_healthy", &self.is_healthy)
            .finish()
    }
}

impl ManagedConnection {
    fn new(client: Client) -> Self {
        let now = Instant::now();
        Self {
            client,
            id: Uuid::new_v4(),
            created_at: now,
            last_used: now,
            query_count: 0,
            is_healthy: true,
        }
    }
    
    fn mark_used(&mut self) {
        self.last_used = Instant::now();
        self.query_count += 1;
    }
    
    fn is_idle(&self, idle_timeout: Duration) -> bool {
        self.last_used.elapsed() > idle_timeout
    }
}

/// Database connection manager with pooling and health monitoring
pub struct DatabaseManager {
    config: DatabaseConfig,
    connections: Arc<RwLock<Vec<ManagedConnection>>>,
    stats: Arc<RwLock<ConnectionStats>>,
    retry_policy: RetryPolicy,
    table_schemas: Arc<RwLock<HashMap<String, bool>>>,
}

impl DatabaseManager {
    /// Create a new database manager
    pub async fn new(config: DatabaseConfig) -> SiemResult<Self> {
        let manager = Self {
            config,
            connections: Arc::new(RwLock::new(Vec::new())),
            stats: Arc::new(RwLock::new(ConnectionStats::default())),
            retry_policy: RetryPolicy::default(),
            table_schemas: Arc::new(RwLock::new(HashMap::new())),
        };
        
        // Initialize minimum connections
        manager.initialize_connections().await?;
        
        // Start health monitoring
        manager.start_health_monitoring().await;
        
        Ok(manager)
    }
    
    /// Initialize minimum connections
    async fn initialize_connections(&self) -> SiemResult<()> {
        let mut connections = self.connections.write().await;
        
        for i in 0..self.config.min_connections {
            match self.create_connection().await {
                Ok(conn) => {
                    connections.push(conn);
                    info!("Initialized connection {}/{}", i + 1, self.config.min_connections);
                },
                Err(e) => {
                    error!("Failed to initialize connection {}: {}", i + 1, e);
                    return Err(e);
                }
            }
        }
        
        // Update stats
        let mut stats = self.stats.write().await;
        stats.total_connections = connections.len() as u32;
        stats.idle_connections = connections.len() as u32;
        
        Ok(())
    }
    
    /// Create a new connection
    async fn create_connection(&self) -> SiemResult<ManagedConnection> {
        let client = self.config.create_client()?;
        
        // Test the connection
        DatabaseHealthChecker::check_clickhouse(&client).await?;
        
        Ok(ManagedConnection::new(client))
    }
    
    /// Get a connection from the pool
    pub async fn get_connection(&self) -> SiemResult<DatabaseConnection> {
        let connection = self.retry_policy.execute(|| async {
            self.get_connection_internal().await
        }).await?;
        
        Ok(connection)
    }
    
    async fn get_connection_internal(&self) -> SiemResult<DatabaseConnection> {
        let mut connections = self.connections.write().await;
        
        // Find an idle healthy connection
        for conn in connections.iter_mut() {
            if conn.is_healthy {
                conn.mark_used();
                
                // Update stats
                let mut stats = self.stats.write().await;
                stats.active_connections += 1;
                stats.idle_connections = stats.idle_connections.saturating_sub(1);
                
                return Ok(DatabaseConnection {
                    client: conn.client.clone(),
                    manager: Arc::new(self.clone_manager_ref()),
                    connection_id: conn.id,
                });
            }
        }
        
        // No idle connections, create new one if under limit
        if connections.len() < self.config.max_connections as usize {
            let new_conn = self.create_connection().await?;
            let connection_id = new_conn.id;
            let client = new_conn.client.clone();
            
            connections.push(new_conn);
            
            // Update stats
            let mut stats = self.stats.write().await;
            stats.total_connections += 1;
            stats.active_connections += 1;
            
            return Ok(DatabaseConnection {
                client,
                manager: Arc::new(self.clone_manager_ref()),
                connection_id,
            });
        }
        
        Err(SiemError::database("No available connections and pool is at maximum capacity"))
    }
    
    /// Return a connection to the pool
    #[allow(dead_code)]
    async fn return_connection(&self, connection_id: Uuid) {
        let mut connections = self.connections.write().await;
        
        for conn in connections.iter_mut() {
            if conn.id == connection_id {
                conn.last_used = Instant::now();
                break;
            }
        }
        
        // Update stats
        let mut stats = self.stats.write().await;
        stats.active_connections = stats.active_connections.saturating_sub(1);
        stats.idle_connections += 1;
    }
    
    /// Execute a query with automatic connection management
    pub async fn execute_query<F, T>(&self, operation: F) -> SiemResult<T>
    where
        F: FnOnce(&Client) -> std::pin::Pin<Box<dyn std::future::Future<Output = SiemResult<T>> + Send>>,
    {
        let start_time = Instant::now();
        let connection = self.get_connection().await?;
        
        let result = operation(&connection.client).await;
        
        // Update query stats
        let query_time_ms = start_time.elapsed().as_millis() as f64;
        self.update_query_stats(result.is_ok(), query_time_ms).await;
        
        result
    }
    
    /// Update query statistics
    async fn update_query_stats(&self, success: bool, query_time_ms: f64) {
        let mut stats = self.stats.write().await;
        stats.total_queries += 1;
        
        if success {
            stats.successful_queries += 1;
        } else {
            stats.failed_queries += 1;
        }
        
        // Update average query time (exponential moving average)
        if stats.average_query_time_ms == 0.0 {
            stats.average_query_time_ms = query_time_ms;
        } else {
            stats.average_query_time_ms = (stats.average_query_time_ms * 0.9) + (query_time_ms * 0.1);
        }
    }
    
    /// Start health monitoring background task
    async fn start_health_monitoring(&self) {
        let connections = Arc::clone(&self.connections);
        let stats = Arc::clone(&self.stats);
        let config = self.config.clone();
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(
                Duration::from_millis(config.health_check_interval_ms)
            );
            
            loop {
                interval.tick().await;
                
                // Perform health check
                let health_status = Self::perform_health_check(&connections, &config).await;
                
                // Update stats
                {
                    let mut stats_guard = stats.write().await;
                    stats_guard.health_status = health_status;
                    stats_guard.last_health_check = Some(chrono::Utc::now());
                }
                
                // Clean up idle connections
                Self::cleanup_idle_connections(&connections, &config).await;
            }
        });
    }
    
    /// Perform health check on all connections
    async fn perform_health_check(
        connections: &Arc<RwLock<Vec<ManagedConnection>>>,
        config: &DatabaseConfig,
    ) -> HealthStatus {
        let mut connections_guard = connections.write().await;
        let mut healthy_count = 0;
        let total_count = connections_guard.len();
        
        for conn in connections_guard.iter_mut() {
            // Simple health check - try to execute SELECT 1
            match tokio::time::timeout(
                Duration::from_millis(config.connection_timeout_ms),
                conn.client.query("SELECT 1").fetch_one::<u8>()
            ).await {
                Ok(Ok(_)) => {
                    conn.is_healthy = true;
                    healthy_count += 1;
                },
                _ => {
                    conn.is_healthy = false;
                    warn!("Connection {} failed health check", conn.id);
                }
            }
        }
        
        // Determine overall health status
        if total_count == 0 {
            HealthStatus::Unknown
        } else if healthy_count == total_count {
            HealthStatus::Healthy
        } else if healthy_count > total_count / 2 {
            HealthStatus::Degraded
        } else {
            HealthStatus::Unhealthy
        }
    }
    
    /// Clean up idle connections
    async fn cleanup_idle_connections(
        connections: &Arc<RwLock<Vec<ManagedConnection>>>,
        config: &DatabaseConfig,
    ) {
        let mut connections_guard = connections.write().await;
        let idle_timeout = Duration::from_millis(config.connection_idle_timeout_ms);
        
        // Keep minimum connections, remove idle ones above minimum
        let min_connections = config.min_connections as usize;
        if connections_guard.len() > min_connections {
            let mut current_len = connections_guard.len();
            connections_guard.retain(|conn| {
                if current_len <= min_connections {
                    true // Keep minimum connections
                } else {
                    let should_remove = conn.is_idle(idle_timeout) && conn.is_healthy;
                    if should_remove {
                        current_len -= 1;
                    }
                    !should_remove
                }
            });
        }
    }
    
    /// Get connection statistics
    pub async fn get_stats(&self) -> ConnectionStats {
        self.stats.read().await.clone()
    }
    
    /// Check if a table exists (with caching)
    pub async fn table_exists(&self, table_name: &str) -> SiemResult<bool> {
        // Check cache first
        {
            let schemas = self.table_schemas.read().await;
            if let Some(&exists) = schemas.get(table_name) {
                return Ok(exists);
            }
        }
        
        // Query database
        let connection = self.get_connection().await?;
        let client = connection.client();
        let result = client
            .query("SELECT 1 FROM system.tables WHERE name = ?")
            .bind(table_name)
            .fetch_optional::<u8>()
            .await
            .map_err(|e| SiemError::database_with_source(
                format!("Failed to check table existence: {}", table_name),
                e.into()
            ))?;
        
        let exists = result.is_some();
        
        // Update cache
        {
            let mut schemas = self.table_schemas.write().await;
            schemas.insert(table_name.to_string(), exists);
        }
        
        Ok(exists)
    }
    
    /// Invalidate table cache
    pub async fn invalidate_table_cache(&self, table_name: Option<&str>) {
        let mut schemas = self.table_schemas.write().await;
        
        if let Some(table) = table_name {
            schemas.remove(table);
        } else {
            schemas.clear();
        }
    }
    
    /// Helper method to clone manager reference (for connection return)
    fn clone_manager_ref(&self) -> DatabaseManagerRef {
        DatabaseManagerRef {
            connections: Arc::clone(&self.connections),
            stats: Arc::clone(&self.stats),
        }
    }
}

/// Reference to database manager for connection management
#[derive(Clone)]
struct DatabaseManagerRef {
    connections: Arc<RwLock<Vec<ManagedConnection>>>,
    stats: Arc<RwLock<ConnectionStats>>,
}

/// A managed database connection that automatically returns to pool when dropped
pub struct DatabaseConnection {
    client: Client,
    manager: Arc<DatabaseManagerRef>,
    connection_id: Uuid,
}

impl DatabaseConnection {
    /// Get the underlying ClickHouse client
    pub fn client(&self) -> &Client {
        &self.client
    }
}

impl Drop for DatabaseConnection {
    fn drop(&mut self) {
        let manager = Arc::clone(&self.manager);
        let connection_id = self.connection_id;
        
        // Return connection to pool asynchronously
        tokio::spawn(async move {
            let mut connections = manager.connections.write().await;
            
            for conn in connections.iter_mut() {
                if conn.id == connection_id {
                    conn.last_used = Instant::now();
                    break;
                }
            }
            
            // Update stats
            let mut stats = manager.stats.write().await;
            stats.active_connections = stats.active_connections.saturating_sub(1);
            stats.idle_connections += 1;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_database_config_validation() {
        // Test empty URL validation
        std::env::set_var("CLICKHOUSE_URL", "");
        std::env::set_var("CLICKHOUSE_DATABASE", "test");
        std::env::set_var("CLICKHOUSE_USERNAME", "user");
        
        let result = DatabaseConfig::from_env();
        assert!(result.is_err());
        
        // Test valid configuration
        std::env::set_var("CLICKHOUSE_URL", "http://localhost:8123");
        std::env::set_var("CLICKHOUSE_DATABASE", "test");
        std::env::set_var("CLICKHOUSE_USERNAME", "user");
        std::env::set_var("CLICKHOUSE_PASSWORD", "pass");
        
        let result = DatabaseConfig::from_env();
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_connection_stats_default() {
        let stats = ConnectionStats::default();
        assert_eq!(stats.total_connections, 0);
        assert_eq!(stats.health_status, HealthStatus::Unknown);
    }
    
    #[test]
    fn test_managed_connection_idle_detection() {
        let client = Client::default();
        let mut conn = ManagedConnection::new(client);
        
        // Should not be idle immediately
        assert!(!conn.is_idle(Duration::from_secs(1)));
        
        // Simulate time passing
        conn.last_used = Instant::now() - Duration::from_secs(2);
        assert!(conn.is_idle(Duration::from_secs(1)));
    }
}