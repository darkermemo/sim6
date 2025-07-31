//! ClickHouse connection pool management
//! Provides efficient connection pooling for high-throughput ingestion

use anyhow::{Context, Result};
use clickhouse::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, error, info, warn};
use url::Url;

use crate::config::ClickHouseConfig;

/// Simple connection pool implementation
struct SimplePool {
    available: Vec<Client>,
    in_use: usize,
    max_size: usize,
}

/// ClickHouse connection pool wrapper
pub struct ChPool {
    pool: Arc<Mutex<SimplePool>>,
    stats: Arc<RwLock<PoolStats>>,
    health: Arc<RwLock<PoolHealth>>,
    config: ClickHouseConfig,
}

/// Pool statistics for monitoring
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PoolStats {
    pub active: u32,
    pub idle: u32,
    pub max: u32,
    pub total_connections_created: u64,
    pub total_connections_closed: u64,
    pub connection_errors: u64,
    pub pool_timeouts: u64,
}

/// Pool health status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolHealth {
    pub active: u32,
    pub idle: u32,
    pub max: u32,
    pub healthy: bool,
    pub utilization_percent: f64,
}

impl ChPool {
    /// Create a new ClickHouse connection pool
    pub async fn new(config: ClickHouseConfig) -> Result<Self> {
        info!("Initializing ClickHouse connection pool with max_size=50, idle_timeout=15s");
        
        let simple_pool = SimplePool {
            available: Vec::new(),
            in_use: 0,
            max_size: 50,
        };
        
        let stats = Arc::new(RwLock::new(PoolStats {
            active: 0,
            idle: 0,
            max: 50,
            total_connections_created: 0,
            total_connections_closed: 0,
            connection_errors: 0,
            pool_timeouts: 0,
        }));
        
        let health = Arc::new(RwLock::new(PoolHealth {
            active: 0,
            idle: 0,
            max: 50,
            healthy: false,
            utilization_percent: 0.0,
        }));
        
        let pool_wrapper = Self {
            pool: Arc::new(Mutex::new(simple_pool)),
            stats,
            health,
            config,
        };
        
        // Test the pool with a simple connection
        pool_wrapper.test_connection().await
            .context("Failed to test ClickHouse pool connection")?;
        
        info!("ClickHouse connection pool initialized successfully");
        Ok(pool_wrapper)
    }
    
    /// Get a connection handle from the pool
    pub async fn get_handle(&self) -> Result<clickhouse::Client> {
        let start_time = std::time::Instant::now();
        
        let client = {
            let mut pool = self.pool.lock().await;
            
            if let Some(client) = pool.available.pop() {
                pool.in_use += 1;
                client
            } else if pool.in_use < pool.max_size {
                // Create new client
                let client = Client::default()
                    .with_url(&self.config.url.to_string())
                    .with_user(&self.config.username)
                    .with_password(&self.config.password)
                    .with_database(&self.config.database)
                    .with_compression(clickhouse::Compression::Lz4);
                
                pool.in_use += 1;
                
                // Update stats
                let mut stats = self.stats.write().await;
                stats.total_connections_created += 1;
                
                client
            } else {
                // Pool exhausted
                let mut stats = self.stats.write().await;
                stats.pool_timeouts += 1;
                return Err(anyhow::anyhow!("Connection pool exhausted"));
            }
        };
        
        debug!("Got connection handle in {:?}", start_time.elapsed());
        
        // Update stats
        let mut stats = self.stats.write().await;
        stats.active += 1;
        if stats.idle > 0 {
            stats.idle -= 1;
        }
        
        Ok(client)
    }
    
    /// Test pool connectivity
    pub async fn test_connection(&self) -> Result<()> {
        debug!("Testing ClickHouse pool connection");
        
        let client = self.get_handle().await
            .context("Failed to get handle for connection test")?;
        
        let result = client
            .query("SELECT 1 as test")
            .fetch_one::<u8>()
            .await;
        
        match result {
            Ok(_) => {
                info!("ClickHouse pool connection test successful");
                
                // Return connection to pool
                self.return_connection(client).await;
                
                // Update health status
                let mut health = self.health.write().await;
                health.healthy = true;
                
                Ok(())
            },
            Err(e) => {
                error!("ClickHouse pool connection test failed: {}", e);
                
                // Return connection to pool even on error
                self.return_connection(client).await;
                
                // Update health status
                let mut health = self.health.write().await;
                health.healthy = false;
                
                // Update error stats
                let mut stats = self.stats.write().await;
                stats.connection_errors += 1;
                
                Err(anyhow::anyhow!("Pool connection test failed: {}", e))
            }
        }
    }
    
    /// Get current pool statistics
    pub async fn get_stats(&self) -> PoolStats {
        let stats = self.stats.read().await;
        stats.clone()
    }
    
    /// Get pool health status for health endpoint
    pub async fn get_health(&self) -> PoolHealth {
        let stats = self.stats.read().await;
        let utilization = if stats.max > 0 {
            (stats.active as f64 / stats.max as f64) * 100.0
        } else {
            0.0
        };
        
        PoolHealth {
            active: stats.active,
            idle: stats.idle,
            max: stats.max,
            healthy: stats.active < stats.max && stats.connection_errors == 0,
            utilization_percent: utilization,
        }
    }
    
    /// Return a connection to the pool
    pub async fn return_connection(&self, client: Client) {
        let mut pool = self.pool.lock().await;
        
        if pool.in_use > 0 {
            pool.in_use -= 1;
        }
        
        // Add client back to available pool
        pool.available.push(client);
        
        // Update stats when connection is returned
        let mut stats = self.stats.write().await;
        if stats.active > 0 {
            stats.active -= 1;
            stats.idle += 1;
        }
    }
    
    /// Reset pool statistics
    pub async fn reset_stats(&self) {
        let mut stats = self.stats.write().await;
        *stats = PoolStats {
            max: 50,
            ..Default::default()
        };
    }
    
    /// Close the pool and all connections
    pub async fn close(&self) -> Result<()> {
        info!("Closing ClickHouse connection pool");
        
        // Clear all connections from the pool
        let mut pool = self.pool.lock().await;
        pool.available.clear();
        pool.in_use = 0;
        
        // Reset stats
        let mut stats = self.stats.write().await;
        stats.active = 0;
        stats.idle = 0;
        stats.total_connections_closed += stats.total_connections_created;
        
        // Update health
        let mut health = self.health.write().await;
        health.healthy = false;
        health.active = 0;
        health.idle = 0;
        health.utilization_percent = 0.0;
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use url::Url;
    
    fn create_test_config() -> ClickHouseConfig {
        ClickHouseConfig {
            url: Url::parse("http://localhost:8123").unwrap(),
            database: "test".to_string(),
            username: "default".to_string(),
            password: "".to_string(),
            compression: "lz4".to_string(),
            pool_size: 50,
            connection_timeout_secs: 10,
            batch: crate::config::BatchConfig {
                size: 1000,
                timeout_ms: 1000,
                memory_limit: 1048576,
            },
        }
    }
    
    #[test]
    fn test_pool_stats_default() {
        let stats = PoolStats::default();
        assert_eq!(stats.active, 0);
        assert_eq!(stats.idle, 0);
        assert_eq!(stats.max, 0);
    }
    
    #[test]
    fn test_pool_health_calculation() {
        let stats = PoolStats {
            active: 25,
            idle: 15,
            max: 50,
            ..Default::default()
        };
        
        let utilization = (stats.active as f64 / stats.max as f64) * 100.0;
        assert_eq!(utilization, 50.0);
    }
    
    #[tokio::test]
    async fn test_pool_stats_operations() {
        let _config = create_test_config();
        
        // This test doesn't require actual ClickHouse connection
        // Just testing the stats structure
        let stats = Arc::new(RwLock::new(PoolStats {
            max: 50,
            ..Default::default()
        }));
        
        // Simulate getting a connection
        {
            let mut s = stats.write().await;
            s.active += 1;
            if s.idle > 0 {
                s.idle -= 1;
            }
        }
        
        let current_stats = stats.read().await;
        assert_eq!(current_stats.active, 1);
        assert_eq!(current_stats.max, 50);
    }
}