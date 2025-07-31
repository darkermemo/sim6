//! ClickHouse writer module for high-performance log ingestion
//! Handles connection pooling, batch writing, and compression

use anyhow::{Context, Result};
use clickhouse::{Client, Row};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};
use regex::Regex;

use crate::{
    config::Config,
    metrics::MetricsCollector,
    schema::LogEvent,
};

/// ClickHouse row representation for log events
#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct ClickHouseLogRow {
    pub tenant_id: String,
    pub timestamp: u64, // Unix timestamp in milliseconds
    pub level: String,
    pub message: String,
    pub source: String,
    pub fields: String, // JSON string of additional fields
    pub ingestion_time: u64, // Unix timestamp when ingested
}

impl From<LogEvent> for ClickHouseLogRow {
    fn from(event: LogEvent) -> Self {
        let timestamp = event.timestamp
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        
        let ingestion_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        
        let fields = serde_json::to_string(&event.fields)
            .unwrap_or_else(|_| "{}".to_string());
        
        Self {
            tenant_id: event.tenant_id,
            timestamp,
            level: event.level,
            message: event.message,
            source: event.source.unwrap_or_else(|| "unknown".to_string()),
            fields,
            ingestion_time,
        }
    }
}

/// ClickHouse connection statistics
#[derive(Debug, Clone, Default)]
pub struct ConnectionStats {
    pub total_connections: u32,
    pub active_connections: u32,
    pub failed_connections: u32,
    pub total_queries: u64,
    pub failed_queries: u64,
    pub average_query_time_ms: f64,
}

/// ClickHouse writer for batch log ingestion
pub struct ClickHouseWriter {
    client: Client,
    config: Arc<Config>,
    metrics: Arc<MetricsCollector>,
    connection_stats: Arc<RwLock<ConnectionStats>>,
    table_schemas: Arc<RwLock<HashMap<String, bool>>>, // Track which tables exist
}

impl ClickHouseWriter {
    /// Create a new ClickHouse writer
    pub async fn new(
        config: Arc<Config>,
        metrics: Arc<MetricsCollector>,
    ) -> Result<Self> {
        info!("Initializing ClickHouse writer with URL: {}", config.clickhouse.url);
        
        let client = Client::default()
            .with_url(&config.clickhouse.url.to_string())
            .with_user(&config.clickhouse.username)
            .with_password(&config.clickhouse.password)
            .with_database(&config.clickhouse.database)
            .with_compression(clickhouse::Compression::Lz4);
        
        let writer = Self {
            client,
            config,
            metrics,
            connection_stats: Arc::new(RwLock::new(ConnectionStats::default())),
            table_schemas: Arc::new(RwLock::new(HashMap::new())),
        };
        
        // Test connection
        writer.test_connection().await
            .context("Failed to establish ClickHouse connection")?;
        
        info!("ClickHouse writer initialized successfully");
        Ok(writer)
    }
    
    /// Test ClickHouse connection
    pub async fn test_connection(&self) -> Result<()> {
        let start_time = Instant::now();
        
        debug!("Testing ClickHouse connection");
        
        let result = self.client
            .query("SELECT 1 as test")
            .fetch_one::<u8>()
            .await;
        
        let duration = start_time.elapsed();
        
        match result {
            Ok(_) => {
                info!("ClickHouse connection test successful in {:?}", duration);
                
                // Update connection stats
                let mut stats = self.connection_stats.write().await;
                stats.total_connections += 1;
                stats.active_connections += 1;
                
                // Connection test successful - no specific metrics needed
                
                Ok(())
            }
            Err(e) => {
                error!("ClickHouse connection test failed: {}", e);
                
                // Update connection stats
                let mut stats = self.connection_stats.write().await;
                stats.failed_connections += 1;
                
                // Record connection failure
                self.metrics.record_error("clickhouse_connection_failure", None);
                
                Err(anyhow::anyhow!("ClickHouse connection failed: {}", e))
            }
        }
    }
    
    /// Ensure table exists with proper schema
    pub async fn ensure_table_exists(&self, table_name: &str) -> Result<()> {
        // Validate table name to prevent SQL injection
        let validated_table_name = Self::validate_table_name(table_name)
            .context("Invalid table name")?;
        
        // Check if we've already verified this table
        {
            let schemas = self.table_schemas.read().await;
            if schemas.get(&validated_table_name).copied().unwrap_or(false) {
                return Ok(());
            }
        }
        
        debug!("Ensuring table '{}' exists", validated_table_name);
        
        let create_table_sql = format!(
            r#"
            CREATE TABLE IF NOT EXISTS {table_name} (
                tenant_id String,
                timestamp UInt64,
                level String,
                message String,
                source String,
                fields String,
                ingestion_time UInt64
            ) ENGINE = MergeTree()
            PARTITION BY toYYYYMM(toDateTime(timestamp / 1000))
            ORDER BY (tenant_id, timestamp)
            SETTINGS index_granularity = 8192
            "#,
            table_name = validated_table_name
        );
        
        let start_time = Instant::now();
        
        match self.client.query(&create_table_sql).execute().await {
            Ok(_) => {
                let duration = start_time.elapsed();
                info!("Table '{}' ensured in {:?}", validated_table_name, duration);
                
                // Mark table as existing
                let mut schemas = self.table_schemas.write().await;
                schemas.insert(validated_table_name.clone(), true);
                
                // Table creation successful - no specific metrics needed
                
                Ok(())
            }
            Err(e) => {
                error!("Failed to ensure table '{}': {}", validated_table_name, e);
                
                self.metrics.record_error("clickhouse_table_creation_failure", Some(&validated_table_name));
                
                Err(anyhow::anyhow!("Failed to create table '{}': {}", validated_table_name, e))
            }
        }
    }
    
    /// Write a batch of log events to ClickHouse
    pub async fn write_batch(&self, table_name: &str, events: Vec<LogEvent>) -> Result<()> {
        if events.is_empty() {
            return Ok(());
        }
        
        let batch_size = events.len();
        let start_time = Instant::now();
        
        debug!("Writing batch of {} events to table '{}'", batch_size, table_name);
        
        // Ensure table exists
        self.ensure_table_exists(table_name).await
            .context("Failed to ensure table exists")?;
        
        // Convert events to ClickHouse rows
        let rows: Vec<ClickHouseLogRow> = events.into_iter()
            .map(ClickHouseLogRow::from)
            .collect();
        
        // Retry logic with exponential backoff
        let max_retries = 3;
        let mut retry_count = 0;
        let mut last_error = None;
        
        while retry_count <= max_retries {
            // Prepare insert query
            let insert_result = async {
                let mut insert = self.client.insert(table_name)?;
                
                // Add rows to insert
                for row in &rows {
                    insert.write(row).await
                        .context("Failed to write row to insert")?;
                }
                
                // Execute the insert
                insert.end().await
                    .context("Failed to execute insert")
            }.await;
            
            let duration = start_time.elapsed();
            
            // Update connection stats
            let mut stats = self.connection_stats.write().await;
            stats.total_queries += 1;
            
            match insert_result {
                Ok(_) => {
                    if retry_count > 0 {
                        info!(
                            "Successfully wrote {} events to table '{}' in {:?} after {} retries",
                            batch_size, table_name, duration, retry_count
                        );
                    } else {
                        info!(
                            "Successfully wrote {} events to table '{}' in {:?}",
                            batch_size, table_name, duration
                        );
                    }
                    
                    // Update stats
                    if stats.total_queries > 0 {
                        stats.average_query_time_ms = 
                            (stats.average_query_time_ms * (stats.total_queries - 1) as f64 + duration.as_millis() as f64) 
                            / stats.total_queries as f64;
                    }
                    
                    // Record successful batch write
                    self.metrics.record_event_processed(table_name, batch_size, duration);
                    
                    return Ok(());
                }
                Err(e) => {
                    last_error = Some(e);
                    retry_count += 1;
                    
                    if retry_count <= max_retries {
                        let backoff_ms = 100 * (2_u64.pow(retry_count as u32 - 1));
                        warn!(
                            "Retrying batch write to table '{}' (attempt {}/{}) after {}ms backoff: {}",
                            table_name, retry_count, max_retries, backoff_ms, last_error.as_ref().unwrap()
                        );
                        tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                    }
                }
            }
        }
        
        // All retries exhausted
        let mut stats = self.connection_stats.write().await;
        stats.failed_queries += 1;
        
        // Update error metrics
        self.metrics.record_error("clickhouse_write_error", Some(table_name));
        
        error!(
            "Failed to write {} events to table '{}' after {} retries: {}",
            batch_size, table_name, max_retries, last_error.as_ref().unwrap()
        );
        
        Err(anyhow::anyhow!(
            "Failed to write batch to table '{}' after {} retries: {}",
            table_name, max_retries, last_error.unwrap()
        ))
    }
    
    /// Get connection statistics
    pub async fn get_connection_stats(&self) -> ConnectionStats {
        self.connection_stats.read().await.clone()
    }
    
    /// Get table information
    pub async fn get_table_info(&self, table_name: &str) -> Result<HashMap<String, serde_json::Value>> {
        let query = format!(
            "SELECT count() as row_count, 
             min(timestamp) as min_timestamp,
             max(timestamp) as max_timestamp,
             uniq(tenant_id) as unique_tenants
             FROM {}",
            table_name
        );
        
        let start_time = Instant::now();
        
        match self.client.query(&query).fetch_one::<(u64, u64, u64, u64)>().await {
            Ok((row_count, min_ts, max_ts, unique_tenants)) => {
                let duration = start_time.elapsed();
                
                let mut info = HashMap::new();
                info.insert("row_count".to_string(), serde_json::Value::from(row_count));
                info.insert("min_timestamp".to_string(), serde_json::Value::from(min_ts));
                info.insert("max_timestamp".to_string(), serde_json::Value::from(max_ts));
                info.insert("unique_tenants".to_string(), serde_json::Value::from(unique_tenants));
                info.insert("query_duration_ms".to_string(), serde_json::Value::from(duration.as_millis() as u64));
                
                // Record query duration using available metrics method
                self.metrics.record_event_processed(table_name, row_count as usize, duration);
                
                Ok(info)
            }
            Err(e) => {
                warn!("Failed to get table info for '{}': {}", table_name, e);
                
                // Record query failure using available metrics method
                self.metrics.record_error("clickhouse_query_failure", Some(table_name));
                
                Err(anyhow::anyhow!("Failed to get table info: {}", e))
            }
        }
    }
    
    /// Get database health status
    pub async fn get_health_status(&self) -> HashMap<String, serde_json::Value> {
        let mut health = HashMap::new();
        let stats = self.get_connection_stats().await;
        
        health.insert("total_connections".to_string(), serde_json::Value::from(stats.total_connections));
        health.insert("active_connections".to_string(), serde_json::Value::from(stats.active_connections));
        health.insert("failed_connections".to_string(), serde_json::Value::from(stats.failed_connections));
        health.insert("total_queries".to_string(), serde_json::Value::from(stats.total_queries));
        health.insert("failed_queries".to_string(), serde_json::Value::from(stats.failed_queries));
        health.insert("average_query_time_ms".to_string(), serde_json::Value::from(stats.average_query_time_ms));
        
        // Calculate success rates
        if stats.total_connections > 0 {
            let connection_success_rate = ((stats.total_connections - stats.failed_connections) as f64 / stats.total_connections as f64) * 100.0;
            health.insert("connection_success_rate_percent".to_string(), serde_json::Value::from(connection_success_rate));
        }
        
        if stats.total_queries > 0 {
            let query_success_rate = ((stats.total_queries - stats.failed_queries) as f64 / stats.total_queries as f64) * 100.0;
            health.insert("query_success_rate_percent".to_string(), serde_json::Value::from(query_success_rate));
        }
        
        // Test current connection
        match self.test_connection().await {
            Ok(_) => {
                health.insert("connection_status".to_string(), serde_json::Value::from("healthy"));
            }
            Err(e) => {
                health.insert("connection_status".to_string(), serde_json::Value::from("unhealthy"));
                health.insert("connection_error".to_string(), serde_json::Value::from(e.to_string()));
            }
        }
        
        health
    }
    
    /// Reset connection statistics
    pub async fn reset_stats(&self) {
        let mut stats = self.connection_stats.write().await;
        *stats = ConnectionStats::default();
        info!("ClickHouse connection statistics reset");
    }
    
    /// Get list of existing tables
    pub async fn list_tables(&self) -> Result<Vec<String>> {
        let query = "SHOW TABLES";
        
        match self.client.query(query).fetch_all::<String>().await {
            Ok(tables) => {
                debug!("Found {} tables in ClickHouse", tables.len());
                Ok(tables)
            }
            Err(e) => {
                error!("Failed to list tables: {}", e);
                Err(anyhow::anyhow!("Failed to list tables: {}", e))
            }
        }
    }
    
    /// Drop a table (use with caution)
    pub async fn drop_table(&self, table_name: &str) -> Result<()> {
        // Validate table name to prevent SQL injection
        let validated_table_name = Self::validate_table_name(table_name)
            .context("Invalid table name")?;
        
        warn!("Dropping table: {}", validated_table_name);
        
        let query = format!("DROP TABLE IF EXISTS {}", validated_table_name);
        
        match self.client.query(&query).execute().await {
            Ok(_) => {
                info!("Successfully dropped table: {}", validated_table_name);
                
                // Remove from schema cache
                let mut schemas = self.table_schemas.write().await;
                schemas.remove(&validated_table_name);
                
                Ok(())
            }
            Err(e) => {
                error!("Failed to drop table '{}': {}", validated_table_name, e);
                Err(anyhow::anyhow!("Failed to drop table: {}", e))
            }
        }
    }
    
    /// Validate table name to prevent SQL injection
    fn validate_table_name(table_name: &str) -> Result<String> {
        // Only allow alphanumeric characters, underscores, and dots
        let valid_pattern = Regex::new(r"^[a-zA-Z0-9_\.]+$").unwrap();
        
        if table_name.is_empty() {
            return Err(anyhow::anyhow!("Table name cannot be empty"));
        }
        
        if table_name.len() > 64 {
            return Err(anyhow::anyhow!("Table name too long (max 64 characters)"));
        }
        
        if !valid_pattern.is_match(table_name) {
            return Err(anyhow::anyhow!("Table name contains invalid characters"));
        }
        
        // Prevent SQL keywords and dangerous patterns
        let dangerous_keywords = ["DROP", "DELETE", "INSERT", "UPDATE", "CREATE", "ALTER", "TRUNCATE"];
        let upper_table = table_name.to_uppercase();
        
        for keyword in &dangerous_keywords {
            if upper_table.contains(keyword) {
                return Err(anyhow::anyhow!("Table name contains dangerous SQL keyword"));
            }
        }
        
        Ok(table_name.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::time::SystemTime;

    #[test]
    fn test_clickhouse_log_row_from_log_event() {
        let mut fields = HashMap::new();
        fields.insert("key1".to_string(), serde_json::Value::from("value1"));
        fields.insert("key2".to_string(), serde_json::Value::from(42));
        
        let event = LogEvent {
            tenant_id: "test_tenant".to_string(),
            timestamp: SystemTime::now(),
            level: "INFO".to_string(),
            message: "Test message".to_string(),
            source: Some("test_source".to_string()),
            fields,
        };
        
        let row = ClickHouseLogRow::from(event);
        
        assert_eq!(row.tenant_id, "test_tenant");
        assert_eq!(row.level, "INFO");
        assert_eq!(row.message, "Test message");
        assert_eq!(row.source, "test_source");
        assert!(row.timestamp > 0);
        assert!(row.ingestion_time > 0);
        assert!(row.fields.contains("key1"));
        assert!(row.fields.contains("value1"));
    }
    
    #[test]
    fn test_clickhouse_log_row_with_none_source() {
        let event = LogEvent {
            tenant_id: "test".to_string(),
            timestamp: SystemTime::now(),
            level: "ERROR".to_string(),
            message: "Error message".to_string(),
            source: None,
            fields: HashMap::new(),
        };
        
        let row = ClickHouseLogRow::from(event);
        
        assert_eq!(row.source, "unknown");
        assert_eq!(row.fields, "{}");
    }
    
    #[test]
    fn test_connection_stats_default() {
        let stats = ConnectionStats::default();
        assert_eq!(stats.total_connections, 0);
        assert_eq!(stats.active_connections, 0);
        assert_eq!(stats.failed_connections, 0);
        assert_eq!(stats.total_queries, 0);
        assert_eq!(stats.failed_queries, 0);
        assert_eq!(stats.average_query_time_ms, 0.0);
    }
}