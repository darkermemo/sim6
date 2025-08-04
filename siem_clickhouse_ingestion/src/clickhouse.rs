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
    pool::ChPool,
};

/// ClickHouse row representation for log events
#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct ClickHouseLogRow {
    // Core identification
    pub event_id: String,
    pub tenant_id: String,
    pub raw_event: String, // Original raw log data
    pub parsing_status: String, // "structured", "parsed", "raw", "failed"
    pub parse_error_msg: Option<String>,
    
    // Temporal fields
    pub timestamp: u64, // Unix timestamp in milliseconds
    pub ingestion_time: u64, // Unix timestamp when ingested
    
    // Core log fields
    pub level: String,
    pub message: String,
    pub source: Option<String>,
    
    // CIM Security fields
    pub source_ip: Option<String>,
    pub dest_ip: Option<String>,
    pub source_port: Option<u16>,
    pub dest_port: Option<u16>,
    pub protocol: Option<String>,
    pub action: Option<String>,
    pub result: Option<String>,
    
    // Identity fields
    pub user_name: Option<String>,
    pub user_id: Option<String>,
    pub user_domain: Option<String>,
    pub user_category: Option<String>,
    
    // Process fields
    pub process_name: Option<String>,
    pub process_id: Option<u32>,
    pub process_path: Option<String>,
    pub parent_process_name: Option<String>,
    pub parent_process_id: Option<u32>,
    
    // File fields
    pub file_name: Option<String>,
    pub file_path: Option<String>,
    pub file_hash: Option<String>,
    pub file_size: Option<u64>,
    
    // Network/Web fields
    pub url: Option<String>,
    pub http_method: Option<String>,
    pub http_status: Option<u16>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    
    // System fields
    pub host_name: Option<String>,
    pub os: Option<String>,
    pub severity: Option<String>,
    pub category: Option<String>,
    pub vendor: Option<String>,
    pub product: Option<String>,
    pub version: Option<String>,
    
    // Flexible storage for unmapped fields
    pub custom_fields: String, // JSON string for fields not mapped to CIM
}

impl From<LogEvent> for ClickHouseLogRow {
    fn from(event: LogEvent) -> Self {
        let timestamp_ms = event.timestamp
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        
        let ingestion_time_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        
        // Extract CIM fields from the fields HashMap
        let mut remaining_fields = event.fields.clone();
        
        // Helper function to extract and remove field
        let extract_string = |fields: &mut HashMap<String, serde_json::Value>, key: &str| -> Option<String> {
            fields.remove(key).and_then(|v| v.as_str().map(|s| s.to_string()))
        };
        
        let extract_u16 = |fields: &mut HashMap<String, serde_json::Value>, key: &str| -> Option<u16> {
            fields.remove(key).and_then(|v| v.as_u64().and_then(|n| u16::try_from(n).ok()))
        };
        
        let extract_u32 = |fields: &mut HashMap<String, serde_json::Value>, key: &str| -> Option<u32> {
            fields.remove(key).and_then(|v| v.as_u64().and_then(|n| u32::try_from(n).ok()))
        };
        
        let extract_u64 = |fields: &mut HashMap<String, serde_json::Value>, key: &str| -> Option<u64> {
            fields.remove(key).and_then(|v| v.as_u64())
        };
        
        // Extract CIM fields
        let source_ip = extract_string(&mut remaining_fields, "source_ip")
            .or_else(|| extract_string(&mut remaining_fields, "src_ip"))
            .or_else(|| extract_string(&mut remaining_fields, "client_ip"));
        
        let dest_ip = extract_string(&mut remaining_fields, "dest_ip")
            .or_else(|| extract_string(&mut remaining_fields, "dst_ip"))
            .or_else(|| extract_string(&mut remaining_fields, "server_ip"));
        
        let source_port = extract_u16(&mut remaining_fields, "source_port")
            .or_else(|| extract_u16(&mut remaining_fields, "src_port"));
        
        let dest_port = extract_u16(&mut remaining_fields, "dest_port")
            .or_else(|| extract_u16(&mut remaining_fields, "dst_port"));
        
        let protocol = extract_string(&mut remaining_fields, "protocol")
            .or_else(|| extract_string(&mut remaining_fields, "proto"));
        
        let action = extract_string(&mut remaining_fields, "action")
            .or_else(|| extract_string(&mut remaining_fields, "event_action"));
        
        let result = extract_string(&mut remaining_fields, "result")
            .or_else(|| extract_string(&mut remaining_fields, "outcome"));
        
        let user_name = extract_string(&mut remaining_fields, "user_name")
            .or_else(|| extract_string(&mut remaining_fields, "username"))
            .or_else(|| extract_string(&mut remaining_fields, "user"));
        
        let user_id = extract_string(&mut remaining_fields, "user_id")
            .or_else(|| extract_string(&mut remaining_fields, "uid"));
        
        let user_domain = extract_string(&mut remaining_fields, "user_domain")
            .or_else(|| extract_string(&mut remaining_fields, "domain"));
        
        let user_category = extract_string(&mut remaining_fields, "user_category")
            .or_else(|| extract_string(&mut remaining_fields, "user_type"));
        
        let process_name = extract_string(&mut remaining_fields, "process_name")
            .or_else(|| extract_string(&mut remaining_fields, "proc_name"));
        
        let process_id = extract_u32(&mut remaining_fields, "process_id")
            .or_else(|| extract_u32(&mut remaining_fields, "pid"));
        
        let process_path = extract_string(&mut remaining_fields, "process_path")
            .or_else(|| extract_string(&mut remaining_fields, "proc_path"));
        
        let parent_process_name = extract_string(&mut remaining_fields, "parent_process_name")
            .or_else(|| extract_string(&mut remaining_fields, "ppid_name"));
        
        let parent_process_id = extract_u32(&mut remaining_fields, "parent_process_id")
            .or_else(|| extract_u32(&mut remaining_fields, "ppid"));
        
        let file_name = extract_string(&mut remaining_fields, "file_name")
            .or_else(|| extract_string(&mut remaining_fields, "filename"));
        
        let file_path = extract_string(&mut remaining_fields, "file_path")
            .or_else(|| extract_string(&mut remaining_fields, "filepath"));
        
        let file_hash = extract_string(&mut remaining_fields, "file_hash")
            .or_else(|| extract_string(&mut remaining_fields, "hash"));
        
        let file_size = extract_u64(&mut remaining_fields, "file_size")
            .or_else(|| extract_u64(&mut remaining_fields, "size"));
        
        let url = extract_string(&mut remaining_fields, "url")
            .or_else(|| extract_string(&mut remaining_fields, "uri"));
        
        let http_method = extract_string(&mut remaining_fields, "http_method")
            .or_else(|| extract_string(&mut remaining_fields, "method"));
        
        let http_status = extract_u16(&mut remaining_fields, "http_status")
            .or_else(|| extract_u16(&mut remaining_fields, "status_code"))
            .or_else(|| extract_u16(&mut remaining_fields, "status"));
        
        let user_agent = extract_string(&mut remaining_fields, "user_agent")
            .or_else(|| extract_string(&mut remaining_fields, "useragent"));
        
        let referer = extract_string(&mut remaining_fields, "referer")
            .or_else(|| extract_string(&mut remaining_fields, "referrer"));
        
        let host_name = extract_string(&mut remaining_fields, "host_name")
            .or_else(|| extract_string(&mut remaining_fields, "hostname"))
            .or_else(|| extract_string(&mut remaining_fields, "host"));
        
        let os = extract_string(&mut remaining_fields, "os")
            .or_else(|| extract_string(&mut remaining_fields, "operating_system"));
        
        let severity = extract_string(&mut remaining_fields, "severity")
            .or_else(|| extract_string(&mut remaining_fields, "sev"));
        
        let category = extract_string(&mut remaining_fields, "category")
            .or_else(|| extract_string(&mut remaining_fields, "cat"));
        
        let vendor = extract_string(&mut remaining_fields, "vendor");
        let product = extract_string(&mut remaining_fields, "product");
        let version = extract_string(&mut remaining_fields, "version");
        
        // Store remaining unmapped fields as JSON
        let custom_fields = serde_json::to_string(&remaining_fields)
            .unwrap_or_else(|_| "{}".to_string());
        
        Self {
            event_id: event.event_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            tenant_id: event.tenant_id,
            raw_event: event.raw_event.unwrap_or_else(|| event.message.clone()),
            parsing_status: event.parsing_status.unwrap_or_else(|| "structured".to_string()),
            parse_error_msg: event.parse_error_msg,
            timestamp: timestamp_ms,
            ingestion_time: ingestion_time_ms,
            level: event.level,
            message: event.message,
            source: event.source,
            source_ip,
            dest_ip,
            source_port,
            dest_port,
            protocol,
            action,
            result,
            user_name,
            user_id,
            user_domain,
            user_category,
            process_name,
            process_id,
            process_path,
            parent_process_name,
            parent_process_id,
            file_name,
            file_path,
            file_hash,
            file_size,
            url,
            http_method,
            http_status,
            user_agent,
            referer,
            host_name,
            os,
            severity,
            category,
            vendor,
            product,
            version,
            custom_fields,
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
    pool: Arc<ChPool>,
    config: Arc<Config>,
    metrics: Arc<MetricsCollector>,
    connection_stats: Arc<RwLock<ConnectionStats>>,
    table_schemas: Arc<RwLock<HashMap<String, bool>>>, // Track which tables exist
}

impl ClickHouseWriter {
    /// Create a new ClickHouse writer with connection pool
    pub async fn new_with_pool(
        config: Arc<Config>,
        metrics: Arc<MetricsCollector>,
        pool: Arc<ChPool>,
    ) -> Result<Self> {
        info!("Initializing ClickHouse writer with connection pool");
        
        let writer = Self {
            pool,
            config,
            metrics,
            connection_stats: Arc::new(RwLock::new(ConnectionStats::default())),
            table_schemas: Arc::new(RwLock::new(HashMap::new())),
        };
        
        // Test connection using pool
        writer.test_connection().await
            .context("Failed to establish ClickHouse connection via pool")?;
        
        info!("ClickHouse writer initialized successfully with connection pool");
        Ok(writer)
    }
    
    /// Create a new ClickHouse writer (legacy method - creates own pool)
    pub async fn new(
        config: Arc<Config>,
        metrics: Arc<MetricsCollector>,
    ) -> Result<Self> {
        info!("Initializing ClickHouse writer with URL: {}", config.clickhouse.url);
        
        // Create a connection pool internally
        let pool = Arc::new(ChPool::new(config.clickhouse.clone()).await?);
        
        Self::new_with_pool(config, metrics, pool).await
    }
    
    /// Test ClickHouse connection
    pub async fn test_connection(&self) -> Result<()> {
        let start_time = Instant::now();
        
        debug!("Testing ClickHouse connection via pool");
        
        // Get a connection handle from the pool
        let client = self.pool.get_handle().await
            .context("Failed to get connection handle from pool")?;
        
        let result = client
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
                
                // Return connection to pool
                self.pool.return_connection(client).await;
                
                Ok(())
            }
            Err(e) => {
                error!("ClickHouse connection test failed: {}", e);
                
                // Update connection stats
                let mut stats = self.connection_stats.write().await;
                stats.failed_connections += 1;
                
                // Record connection failure
                self.metrics.record_error("clickhouse_connection_failure", None);
                
                // Return connection to pool even on error
                self.pool.return_connection(client).await;
                
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
                -- Core identification
                event_id String,
                tenant_id String,
                raw_event String,
                parsing_status String,
                parse_error_msg Nullable(String),
                
                -- Temporal fields
                timestamp UInt64,
                ingestion_time UInt64,
                
                -- Core log fields
                level String,
                message String,
                source Nullable(String),
                
                -- CIM Security fields
                source_ip Nullable(String),
                dest_ip Nullable(String),
                source_port Nullable(UInt16),
                dest_port Nullable(UInt16),
                protocol Nullable(String),
                action Nullable(String),
                result Nullable(String),
                
                -- Identity fields
                user_name Nullable(String),
                user_id Nullable(String),
                user_domain Nullable(String),
                user_category Nullable(String),
                
                -- Process fields
                process_name Nullable(String),
                process_id Nullable(UInt32),
                process_path Nullable(String),
                parent_process_name Nullable(String),
                parent_process_id Nullable(UInt32),
                
                -- File fields
                file_name Nullable(String),
                file_path Nullable(String),
                file_hash Nullable(String),
                file_size Nullable(UInt64),
                
                -- Network/Web fields
                url Nullable(String),
                http_method Nullable(String),
                http_status Nullable(UInt16),
                user_agent Nullable(String),
                referer Nullable(String),
                
                -- System fields
                host_name Nullable(String),
                os Nullable(String),
                severity Nullable(String),
                category Nullable(String),
                vendor Nullable(String),
                product Nullable(String),
                version Nullable(String),
                
                -- Flexible storage
                custom_fields String
            ) ENGINE = MergeTree()
            PARTITION BY toYYYYMM(toDateTime(timestamp / 1000))
            ORDER BY (tenant_id, timestamp, event_id)
            SETTINGS index_granularity = 8192
            "#,
            table_name = validated_table_name
        );
        
        let start_time = Instant::now();
        
        // Get connection handle from pool
        let client = self.pool.get_handle().await
            .context("Failed to get connection from pool for table creation")?;
        
        match client.query(&create_table_sql).execute().await {
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
            // Get connection handle from pool
            let client = match self.pool.get_handle().await {
                Ok(handle) => handle,
                Err(e) => {
                    last_error = Some(anyhow::anyhow!("Failed to get connection from pool: {}", e));
                    retry_count += 1;
                    if retry_count <= max_retries {
                        let backoff_ms = 100 * (2_u64.pow(retry_count as u32 - 1));
                        warn!("Retrying to get connection from pool (attempt {}/{}) after {}ms backoff", retry_count, max_retries, backoff_ms);
                        tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                    }
                    continue;
                }
            };
            
            // Prepare insert query
            let insert_result = async {
                let mut insert = client.insert(table_name)?;
                
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
        
        // Get connection handle from pool
        let client = self.pool.get_handle().await
            .context("Failed to get connection from pool for table info query")?;
        
        match client.query(&query).fetch_one::<(u64, u64, u64, u64)>().await {
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
        
        // Get connection handle from pool
        let client = self.pool.get_handle().await
            .context("Failed to get connection from pool for list tables query")?;
        
        match client.query(query).fetch_all::<String>().await {
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
        
        // Get connection handle from pool
        let client = self.pool.get_handle().await
            .context("Failed to get connection from pool for drop table query")?;
        
        match client.query(&query).execute().await {
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