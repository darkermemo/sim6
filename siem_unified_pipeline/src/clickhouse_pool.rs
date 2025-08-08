//! ClickHouse connection pool using bb8
//! Provides a simple connection manager for ClickHouse clients

use async_trait::async_trait;
use bb8::{ManageConnection, Pool, PooledConnection};
use clickhouse::Client;
use std::fmt;
use tracing::{debug, error};

/// ClickHouse connection manager for bb8 pool
#[derive(Debug, Clone)]
pub struct ClickHouseConnectionManager {
    url: String,
    database: String,
    username: String,
    password: String,
}

impl ClickHouseConnectionManager {
    /// Create a new ClickHouse connection manager
    pub fn new(url: String, database: String, username: String, password: String) -> Self {
        Self {
            url,
            database,
            username,
            password,
        }
    }
}

#[async_trait]
impl ManageConnection for ClickHouseConnectionManager {
    type Connection = Client;
    type Error = clickhouse::error::Error;

    /// Create a new ClickHouse connection
    async fn connect(&self) -> Result<Self::Connection, Self::Error> {
        debug!("Creating new ClickHouse connection to {}", self.url);
        
        let client = Client::default()
            .with_url(&self.url)
            .with_database(&self.database)
            .with_user(&self.username)
            .with_password(&self.password)
            .with_compression(clickhouse::Compression::Lz4);
        
        // Test the connection
        client.query("SELECT 1").fetch_one::<u8>().await?;
        
        debug!("Successfully created ClickHouse connection");
        Ok(client)
    }

    /// Check if a connection is still valid
    async fn is_valid(&self, conn: &mut Self::Connection) -> Result<(), Self::Error> {
        conn.query("SELECT 1").fetch_one::<u8>().await?;
        Ok(())
    }

    /// Check if an error indicates the connection has failed
    fn has_broken(&self, _conn: &mut Self::Connection) -> bool {
        // For now, assume connection is not broken
        false
    }
}

/// Type alias for ClickHouse connection pool
pub type ClickHousePool = Pool<ClickHouseConnectionManager>;

/// Type alias for pooled ClickHouse connection
pub type PooledClickHouseConnection = PooledConnection<'static, ClickHouseConnectionManager>;

/// Helper function to create a ClickHouse connection pool
pub async fn create_clickhouse_pool(
    url: String,
    database: String,
    username: String,
    password: String,
    max_size: u32,
) -> Result<ClickHousePool, bb8::RunError<clickhouse::error::Error>> {
    let manager = ClickHouseConnectionManager::new(url, database, username, password);
    
    Pool::builder()
        .max_size(max_size)
        .build(manager)
        .await
        .map_err(bb8::RunError::User)
}

/// Helper function to execute a query with a pooled connection
pub async fn query_ch_counts(
    pool: &ClickHousePool,
    sql: &str,
) -> Result<Vec<CountRow>, Box<dyn std::error::Error + Send + Sync>> {
    let conn = pool.get().await?;
    
    let rows = conn
        .query(sql)
        .fetch_all::<CountRow>()
        .await?;
    
    Ok(rows)
}

/// Row structure for count queries
#[derive(Debug, Clone, serde::Deserialize, clickhouse::Row)]
pub struct CountRow {
    pub cnt: u64,
    pub tenant_id: Option<String>,
}