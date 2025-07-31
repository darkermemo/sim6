//! ClickHouse database client with connection pooling and query optimization
//! Handles tenant isolation, query building, and performance monitoring

use crate::config::{Config, ClickHouseConfig};
use crate::dto::*;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use clickhouse::{Client, Row};
// use deadpool::managed::{Manager, Pool, PoolError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};
use uuid::Uuid;
use regex::Regex;
use phf::phf_set;



/// Allowed event fields for filtering to prevent SQL injection
/// Only these field names are permitted in filter clauses
static ALLOWED_EVENT_FIELDS: phf::Set<&'static str> = phf_set! {
    "event_id",
    "tenant_id", 
    "event_timestamp",
    "source_ip",
    "source_type",
    "raw_event",
    "event_category",
    "event_outcome",
    "event_action",
    "log_source_id",
    "parsing_status",
    "parse_error_msg",
    "dest_ip",
    "src_port",
    "dest_port",
    "protocol",
    "bytes_in",
    "bytes_out",
    "packets_in",
    "packets_out",
    "duration",
    "user_name",
    "user_domain",
    "user_id",
    "process_name",
    "process_id",
    "parent_process_name",
    "parent_process_id",
    "file_path",
    "file_name",
    "file_size",
    "command_line",
    "registry_key",
    "registry_value",
    "url",
    "uri_path",
    "uri_query",
    "http_method",
    "http_status_code",
    "http_user_agent",
    "http_referrer",
    "http_content_type",
    "http_content_length",
    "src_host",
    "dest_host",
    "device_type",
    "vendor",
    "product",
    "version",
    "src_country",
    "dest_country",
    "src_zone",
    "dest_zone",
    "interface_in",
    "interface_out",
    "vlan_id",
    "rule_id",
    "rule_name",
    "policy_id",
    "policy_name",
    "signature_id",
    "signature_name",
    "threat_name",
    "threat_category",
    "severity",
    "priority",
    "auth_method",
    "auth_app",
    "failure_reason",
    "session_id",
    "app_name",
    "app_category",
    "service_name",
    "email_sender",
    "email_recipient",
    "email_subject",
    "tags",
    "message",
    "details",
    "custom_fields",
    "ingestion_timestamp",
};

// Simplified ClickHouse client without connection pooling for now

/// ClickHouse database service
pub struct ClickHouseService {
    client: Client,
    config: Arc<Config>,
    query_cache: Arc<RwLock<HashMap<String, CachedQuery>>>,
    metrics: Arc<DatabaseMetrics>,
}

/// Cached query result
#[derive(Debug, Clone)]
struct CachedQuery {
    result: String,
    created_at: Instant,
    ttl: Duration,
}

/// Database performance metrics
#[derive(Debug, Default)]
pub struct DatabaseMetrics {
    pub total_queries: std::sync::atomic::AtomicU64,
    pub successful_queries: std::sync::atomic::AtomicU64,
    pub failed_queries: std::sync::atomic::AtomicU64,
    pub cache_hits: std::sync::atomic::AtomicU64,
    pub cache_misses: std::sync::atomic::AtomicU64,
    pub avg_query_time_ms: std::sync::atomic::AtomicU64,
}

impl ClickHouseService {
    /// Create a new ClickHouse service
    pub async fn new(config: Arc<Config>) -> Result<Self> {
        let client = Client::default()
            .with_url(config.clickhouse.url.as_str())
            .with_database(&config.clickhouse.database)
            .with_user(&config.clickhouse.username)
            .with_password(&config.clickhouse.password)
            .with_compression(clickhouse::Compression::Lz4);
        
        // Test connection
        client.query("SELECT 1").fetch_one::<u8>().await
            .context("Failed to connect to ClickHouse")?;
        
        let service = Self {
            client,
            config: config.clone(),
            query_cache: Arc::new(RwLock::new(HashMap::new())),
            metrics: Arc::new(DatabaseMetrics::default()),
        };
        
        // Initialize database schema if needed
        service.initialize_schema().await?;
        
        Ok(service)
    }
    
    /// Initialize database schema and tables
    async fn initialize_schema(&self) -> Result<()> {
        let client = self.get_client();
        
        // Create default logs table if it doesn't exist
        let create_table_sql = format!(
            r#"
            CREATE TABLE IF NOT EXISTS {} (
                timestamp DateTime64(3) CODEC(Delta, LZ4),
                event_id UUID DEFAULT generateUUIDv4(),
                level LowCardinality(String),
                message String CODEC(LZ4),
                source LowCardinality(String),
                source_ip IPv4,
                destination_ip IPv4,
                user_id String,
                session_id String,
                event_type LowCardinality(String),
                severity LowCardinality(String),
                tags Array(String),
                fields Map(String, String),
                tenant_id LowCardinality(String),
                detections Array(Tuple(
                    rule_id String,
                    rule_name String,
                    severity String,
                    confidence Float64,
                    matched_fields Array(String)
                ))
            ) ENGINE = MergeTree()
            PARTITION BY toYYYYMM(timestamp)
            ORDER BY (tenant_id, timestamp, event_type)
            TTL timestamp + INTERVAL {} DAY
            SETTINGS index_granularity = 8192
            "#,
            self.config.clickhouse.tables.default_table,
            self.config.clickhouse.tables.partition.retention_days
        );
        
        client.query(&create_table_sql).execute().await
            .context("Failed to create logs table")?;
        
        // Create full-text search index if enabled
        if self.config.search.enable_fulltext {
            let create_index_sql = format!(
                "ALTER TABLE {} ADD INDEX IF NOT EXISTS message_idx message TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 1",
                self.config.clickhouse.tables.default_table
            );
            
            if let Err(e) = client.query(&create_index_sql).execute().await {
                warn!("Failed to create full-text index: {}", e);
            }
        }
        
        info!("Database schema initialized successfully");
        Ok(())
    }
    
    /// Get a reference to the client
    pub fn get_client(&self) -> &Client {
        &self.client
    }
    
    /// Check database health
    pub async fn health_check(&self) -> Result<()> {
        self.client.query("SELECT 1").fetch_one::<u8>().await
            .context("Database health check failed")?;
        Ok(())
    }
    
    /// Execute a search query with comprehensive filtering and aggregation
    pub async fn search(&self, request: SearchRequest) -> Result<SearchResponse> {
        let start_time = Instant::now();
        
        // Increment total queries metric
        self.metrics.total_queries.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        
        // Check cache if enabled
        if let Some(cached_result) = self.check_cache(&request).await? {
            self.metrics.cache_hits.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            return Ok(cached_result);
        }
        
        self.metrics.cache_misses.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        
        // Build and execute query
        let query_builder = QueryBuilder::new(&self.config, &request);
        let (sql, params) = query_builder.build_search_query()?;
        
        debug!("Executing search query: {}", sql);
        
        let client = self.get_client();
        
        // Execute main search query
        let hits = self.execute_search_query(&client, &sql, &params, &request).await?;
        
        // Execute aggregations if requested
        let aggregations = if let Some(agg_requests) = &request.aggregations {
            Some(self.execute_aggregations(&client, agg_requests, &request).await?)
        } else {
            None
        };
        
        let query_time = start_time.elapsed();
        
        // Update metrics
        self.metrics.successful_queries.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        self.update_avg_query_time(query_time.as_millis() as u64);
        
        let response = SearchResponse {
            hits,
            aggregations,
            metadata: SearchMetadata {
                took: query_time.as_millis() as u64,
                timed_out: false,
                shards: None,
                query_id: Uuid::new_v4().to_string(),
                tenant_id: request.tenant_id.clone(),
                cache_hit: false,
                explanation: if request.options.as_ref().and_then(|o| o.explain).unwrap_or(false) {
                    Some(QueryExplanation {
                        sql: sql.clone(),
                        execution_plan: None,
                        statistics: None,
                    })
                } else {
                    None
                },
            },
            suggestions: None,
        };
        
        // Cache result if enabled
        if self.should_cache_result(&request) {
            self.cache_result(&request, &response).await?;
        }
        
        Ok(response)
    }
    
    /// Execute the main search query
    async fn execute_search_query(
        &self,
        client: &Client,
        sql: &str,
        params: &HashMap<String, String>,
        request: &SearchRequest,
    ) -> Result<SearchHits> {
        let mut query = client.query(sql);
        
        // Bind named parameters
        for (key, value) in params {
            // Handle comma-separated values for IN clauses
            if value.contains(',') {
                let values: Vec<&str> = value.split(',').collect();
                for (i, val) in values.iter().enumerate() {
                    let param_key = if key.contains("_in_") || key.contains("_not_in_") {
                        format!("{}_{}", key, i)
                    } else {
                        key.clone()
                    };
                    query = query.bind(val.trim());
                }
            } else {
                query = query.bind(value);
            }
        }
        
        // Execute query and fetch results
        let rows = query.fetch_all::<LogEventRow>().await
            .context("Failed to execute search query")?;
        
        // Convert rows to search hits
        let hits: Vec<SearchHit> = rows.into_iter().map(|row| {
            use chrono::{DateTime, Utc, TimeZone};
            
            SearchHit {
                id: row.event_id.clone(),
                score: None, // ClickHouse doesn't provide relevance scores by default
                source: LogEvent {
                    event_id: row.event_id,
                    tenant_id: row.tenant_id,
                    event_timestamp: Utc.timestamp_opt(row.event_timestamp as i64, 0).single().unwrap_or_else(|| Utc::now()),
                    source_ip: row.source_ip,
                    source_type: row.source_type,
                    raw_event: row.raw_event,
                    event_category: row.event_category,
                    event_outcome: row.event_outcome,
                    event_action: row.event_action,
                    log_source_id: row.log_source_id,
                    parsing_status: row.parsing_status,
                    parse_error_msg: row.parse_error_msg,
                    dest_ip: row.dest_ip,
                    src_port: row.src_port,
                    dest_port: row.dest_port,
                    protocol: row.protocol,
                    bytes_in: row.bytes_in,
                    bytes_out: row.bytes_out,
                    packets_in: row.packets_in,
                    packets_out: row.packets_out,
                    duration: row.duration,
                    user_name: row.user_name,
                    user_domain: row.user_domain,
                    user_id: row.user_id,
                    process_name: row.process_name,
                    process_id: row.process_id,
                    parent_process_name: row.parent_process_name,
                    parent_process_id: row.parent_process_id,
                    file_path: row.file_path,
                    file_name: row.file_name,
                    file_size: row.file_size,
                    command_line: row.command_line,
                    registry_key: row.registry_key,
                    registry_value: row.registry_value,
                    url: row.url,
                    uri_path: row.uri_path,
                    uri_query: row.uri_query,
                    http_method: row.http_method,
                    http_status_code: row.http_status_code,
                    http_user_agent: row.http_user_agent,
                    http_referrer: row.http_referrer,
                    http_content_type: row.http_content_type,
                    http_content_length: row.http_content_length,
                    src_host: row.src_host,
                    dest_host: row.dest_host,
                    device_type: row.device_type,
                    vendor: row.vendor,
                    product: row.product,
                    version: row.version,
                    src_country: row.src_country,
                    dest_country: row.dest_country,
                    src_zone: row.src_zone,
                    dest_zone: row.dest_zone,
                    interface_in: row.interface_in,
                    interface_out: row.interface_out,
                    vlan_id: row.vlan_id,
                    rule_id: row.rule_id,
                    rule_name: row.rule_name,
                    policy_id: row.policy_id,
                    policy_name: row.policy_name,
                    signature_id: row.signature_id,
                    signature_name: row.signature_name,
                    threat_name: row.threat_name,
                    threat_category: row.threat_category,
                    severity: row.severity,
                    priority: row.priority,
                    auth_method: row.auth_method,
                    auth_app: row.auth_app,
                    failure_reason: row.failure_reason,
                    session_id: row.session_id,
                    app_name: row.app_name,
                    app_category: row.app_category,
                    service_name: row.service_name,
                    email_sender: row.email_sender,
                    email_recipient: row.email_recipient,
                    email_subject: row.email_subject,
                    tags: row.tags,
                    message: row.message,
                    details: row.details,
                    custom_fields: row.custom_fields,
                    ingestion_timestamp: Utc.timestamp_opt(row.ingestion_timestamp as i64, 0).single().unwrap_or_else(|| Utc::now()),
                },
                highlight: None,
                sort: None,
            }
        }).collect();
        
        let default_pagination = Pagination::default();
        let pagination = request.pagination.as_ref().unwrap_or(&default_pagination);
        
        Ok(SearchHits {
            total: if pagination.include_total {
                Some(TotalHits {
                    value: hits.len() as u64,
                    relation: TotalRelation::Equal,
                })
            } else {
                None
            },
            max_score: None,
            hits,
            pagination: PaginationInfo {
                current_page: pagination.page,
                page_size: pagination.size,
                total_pages: None,
                has_next: false, // TODO: Implement proper pagination
                has_previous: pagination.page > 0,
                next_cursor: None,
                previous_cursor: None,
            },
        })
    }
    
    /// Execute aggregation queries
    async fn execute_aggregations(
        &self,
        client: &Client,
        agg_requests: &HashMap<String, AggregationRequest>,
        search_request: &SearchRequest,
    ) -> Result<HashMap<String, AggregationResult>> {
        let mut results = HashMap::new();
        
        for (name, agg_request) in agg_requests {
            let query_builder = QueryBuilder::new(&self.config, search_request);
            let (sql, params) = query_builder.build_aggregation_query(agg_request)?;
            
            let mut query = client.query(&sql);
            for (_, value) in &params {
                query = query.bind(value);
            }
            
            match &agg_request.agg_type {
                AggregationType::Count => {
                    let count: u64 = query.fetch_one().await
                        .context("Failed to execute count aggregation")?;
                    results.insert(name.clone(), AggregationResult::Count { value: count });
                }
                AggregationType::Terms => {
                    let buckets: Vec<(String, u64)> = query.fetch_all().await
                        .context("Failed to execute terms aggregation")?;
                    let term_buckets: Vec<TermsBucket> = buckets.into_iter().map(|(key, doc_count)| {
                        TermsBucket {
                            key,
                            doc_count,
                            sub_aggregations: None,
                        }
                    }).collect();
                    results.insert(name.clone(), AggregationResult::Terms {
                        buckets: term_buckets,
                        sum_other_doc_count: 0,
                    });
                }
                // TODO: Implement other aggregation types
                _ => {
                    warn!("Aggregation type {:?} not yet implemented", agg_request.agg_type);
                }
            }
        }
        
        Ok(results)
    }
    
    /// Check if result should be cached
    fn should_cache_result(&self, request: &SearchRequest) -> bool {
        request.options.as_ref()
            .and_then(|o| o.enable_caching)
            .unwrap_or(self.config.clickhouse.query.enable_caching)
    }
    
    /// Check cache for existing result
    async fn check_cache(&self, request: &SearchRequest) -> Result<Option<SearchResponse>> {
        if !self.should_cache_result(request) {
            return Ok(None);
        }
        
        let cache_key = self.generate_cache_key(request);
        let cache = self.query_cache.read().await;
        
        if let Some(cached) = cache.get(&cache_key) {
            if cached.created_at.elapsed() < cached.ttl {
                let response: SearchResponse = serde_json::from_str(&cached.result)
                    .context("Failed to deserialize cached result")?;
                return Ok(Some(response));
            }
        }
        
        Ok(None)
    }
    
    /// Cache search result
    async fn cache_result(&self, request: &SearchRequest, response: &SearchResponse) -> Result<()> {
        let cache_key = self.generate_cache_key(request);
        let ttl = Duration::from_secs(
            request.options.as_ref()
                .and_then(|o| o.cache_ttl_secs)
                .unwrap_or(self.config.clickhouse.query.cache_ttl_secs)
        );
        
        let cached_query = CachedQuery {
            result: serde_json::to_string(response)
                .context("Failed to serialize response for caching")?,
            created_at: Instant::now(),
            ttl,
        };
        
        let mut cache = self.query_cache.write().await;
        cache.insert(cache_key, cached_query);
        
        // Clean up expired entries
        cache.retain(|_, v| v.created_at.elapsed() < v.ttl);
        
        Ok(())
    }
    
    /// Generate cache key for request
    fn generate_cache_key(&self, request: &SearchRequest) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        format!("{:?}", request).hash(&mut hasher);
        format!("search_{:x}", hasher.finish())
    }
    
    /// Update average query time metric
    fn update_avg_query_time(&self, query_time_ms: u64) {
        let current_avg = self.metrics.avg_query_time_ms.load(std::sync::atomic::Ordering::Relaxed);
        let total_queries = self.metrics.total_queries.load(std::sync::atomic::Ordering::Relaxed);
        
        if total_queries > 0 {
            let new_avg = (current_avg * (total_queries - 1) + query_time_ms) / total_queries;
            self.metrics.avg_query_time_ms.store(new_avg, std::sync::atomic::Ordering::Relaxed);
        }
    }
    
    /// Get dashboard data with aggregated metrics
    pub async fn get_dashboard_data(&self, time_range: Option<TimeRange>) -> Result<DashboardV2Response> {
        let client = self.get_client();
        let table_name = self.config.clickhouse.tables.default_table.clone();
        
        // Default time range: last 24 hours
        let end_time = chrono::Utc::now();
        let start_time = match time_range {
            Some(range) => range.start,
            None => end_time - chrono::Duration::hours(24),
        };
        
        // Get total events count - handle empty table gracefully
        let total_events_sql = format!(
            "SELECT count() as total FROM {} WHERE event_timestamp >= ? AND event_timestamp < ?",
            table_name
        );
        
        let total_events: u64 = client.query(&total_events_sql)
            .bind(start_time.timestamp())
            .bind(end_time.timestamp())
            .fetch_one()
            .await
            .unwrap_or(0); // Default to 0 if query fails
        
        // Get total alerts count (events with severity 'high' or 'critical') - handle gracefully
        let total_alerts_sql = format!(
            "SELECT count() as total FROM {} WHERE event_timestamp >= ? AND event_timestamp < ? AND (lower(severity) IN ('high', 'critical') OR lower(event_category) LIKE '%alert%' OR lower(event_category) LIKE '%security%')",
            table_name
        );
        
        let total_alerts: u64 = client.query(&total_alerts_sql)
            .bind(start_time.timestamp())
            .bind(end_time.timestamp())
            .fetch_one()
            .await
            .unwrap_or(0); // Default to 0 if query fails
        
        // Get alerts over time (last 24 hours, hourly buckets) - handle gracefully
        let alerts_over_time_sql = format!(
            "SELECT toStartOfHour(toDateTime(event_timestamp)) as bucket, count() as count FROM {} WHERE event_timestamp >= ? AND event_timestamp < ? AND (lower(severity) IN ('high', 'critical') OR lower(event_category) LIKE '%alert%' OR lower(event_category) LIKE '%security%') GROUP BY bucket ORDER BY bucket",
            table_name
        );
        
        let alerts_over_time_rows: Vec<AlertsOverTimeRow> = client.query(&alerts_over_time_sql)
            .bind(start_time.timestamp())
            .bind(end_time.timestamp())
            .fetch_all()
            .await
            .unwrap_or_else(|_| Vec::new()); // Default to empty vec if query fails

        let alerts_over_time: Vec<AlertsOverTimeData> = alerts_over_time_rows
            .into_iter()
            .map(|row| AlertsOverTimeData {
                ts: row.bucket.and_utc().timestamp(),
                critical: row.count as i64,
                high: 0,
                medium: 0,
                low: 0,
            })
            .collect();
        
        // Get top sources - handle gracefully
        let top_sources_sql = format!(
            "SELECT source_ip, count() as count FROM {} WHERE event_timestamp >= ? AND event_timestamp < ? AND source_ip IS NOT NULL GROUP BY source_ip ORDER BY count DESC LIMIT 10",
            table_name
        );
        
        let top_sources_rows: Vec<TopSourceRow> = client.query(&top_sources_sql)
            .bind(start_time.timestamp())
            .bind(end_time.timestamp())
            .fetch_all()
            .await
            .unwrap_or_else(|_| Vec::new()); // Default to empty vec if query fails
        
        let top_log_sources: Vec<TopLogSourceData> = top_sources_rows
            .into_iter()
            .map(|row| TopLogSourceData {
                source_type: row.source_ip,
                count: row.count as i64,
            })
            .collect();
        
        // Get recent alerts (last 10 high/critical severity events)
        // Handle NULL values and case-insensitive matching, use COALESCE for NULL fields
        let recent_alerts_sql = format!(
            "SELECT event_timestamp, COALESCE(severity, 'unknown') as severity, COALESCE(message, '') as message FROM {} WHERE event_timestamp >= ? AND event_timestamp < ? AND (lower(COALESCE(severity, '')) IN ('high', 'critical') OR lower(event_category) LIKE '%alert%' OR lower(event_category) LIKE '%security%') ORDER BY event_timestamp DESC LIMIT 10",
            table_name
        );
        
        let recent_alerts_rows: Vec<RecentAlertRow> = client.query(&recent_alerts_sql)
            .bind(start_time.timestamp())
            .bind(end_time.timestamp())
            .fetch_all()
            .await
            .unwrap_or_else(|_| Vec::new()); // Default to empty vec if query fails
        
        let recent_alerts: Vec<RecentAlertV2> = recent_alerts_rows
            .into_iter()
            .map(|row| RecentAlertV2 {
                alert_id: Uuid::new_v4().to_string(),
                ts: row.event_timestamp as i64,
                title: if row.message.is_empty() { "Security Alert".to_string() } else { row.message },
                severity: if row.severity.is_empty() { "unknown".to_string() } else { row.severity },
                source_ip: "".to_string(),
                dest_ip: "".to_string(),
            })
            .collect();
        
        Ok(DashboardV2Response {
            total_events: total_events as i64,
            total_alerts: total_alerts as i64,
            alerts_over_time,
            top_log_sources,
            recent_alerts,
        })
    }

    /// Get database metrics
    pub fn get_metrics(&self) -> DatabaseMetrics {
        DatabaseMetrics {
            total_queries: std::sync::atomic::AtomicU64::new(
                self.metrics.total_queries.load(std::sync::atomic::Ordering::Relaxed)
            ),
            successful_queries: std::sync::atomic::AtomicU64::new(
                self.metrics.successful_queries.load(std::sync::atomic::Ordering::Relaxed)
            ),
            failed_queries: std::sync::atomic::AtomicU64::new(
                self.metrics.failed_queries.load(std::sync::atomic::Ordering::Relaxed)
            ),
            cache_hits: std::sync::atomic::AtomicU64::new(
                self.metrics.cache_hits.load(std::sync::atomic::Ordering::Relaxed)
            ),
            cache_misses: std::sync::atomic::AtomicU64::new(
                self.metrics.cache_misses.load(std::sync::atomic::Ordering::Relaxed)
            ),
            avg_query_time_ms: std::sync::atomic::AtomicU64::new(
                self.metrics.avg_query_time_ms.load(std::sync::atomic::Ordering::Relaxed)
            ),
        }
    }

    /// Get events from events table
    pub async fn get_events(&self, filters: EventFilters) -> Result<Vec<Event>, Box<dyn std::error::Error + Send + Sync>> {
        let client = &self.client;
        
        let table_name = format!("{}.events", &self.config.clickhouse.database);
        let mut query = format!("SELECT event_id, tenant_id, event_timestamp, source_ip, source_type, message, severity FROM {}", table_name);
        let mut conditions = Vec::new();
        
        // Add filters
        if let Some(severity) = &filters.severity {
            conditions.push(format!("severity = '{}'", severity));
        }
        
        if let Some(source_type) = &filters.source_type {
            conditions.push(format!("source_type = '{}'", source_type));
        }
        
        if let Some(tenant_id) = &filters.tenant_id {
            conditions.push(format!("tenant_id = '{}'", tenant_id));
        }
        
        if let Some(search) = &filters.search {
            conditions.push(format!("(message ILIKE '%{}%' OR source_ip ILIKE '%{}%')", search, search));
        }
        
        if !conditions.is_empty() {
            query.push_str(" WHERE ");
            query.push_str(&conditions.join(" AND "));
        }
        
        query.push_str(" ORDER BY event_timestamp DESC");
        
        let limit = filters.limit.unwrap_or(100).min(1000);
        query.push_str(&format!(" LIMIT {}", limit));
        
        let events: Vec<Event> = client
            .query(&query)
            .fetch_all()
            .await
            .unwrap_or_default();
        
        Ok(events)
    }
}

/// ClickHouse row structure for log events matching dev.events table schema
#[derive(Debug, Row, Deserialize)]
struct AlertsOverTimeRow {
    bucket: chrono::NaiveDateTime,
    count: u64,
}

#[derive(Debug, Row, Deserialize)]
struct TopSourceRow {
    source_ip: String,
    count: u64,
}

#[derive(Debug, Row, Deserialize)]
struct RecentAlertRow {
    event_timestamp: u32,
    severity: String,
    message: String,
}

#[derive(Debug, Row, Deserialize)]
struct LogEventRow {
    event_id: String,
    tenant_id: String,
    event_timestamp: u32,
    source_ip: String,
    source_type: String,
    raw_event: String,
    event_category: String,
    event_outcome: String,
    event_action: String,
    log_source_id: Option<String>,
    parsing_status: Option<String>,
    parse_error_msg: Option<String>,
    dest_ip: Option<String>,
    src_port: Option<u16>,
    dest_port: Option<u16>,
    protocol: Option<String>,
    bytes_in: Option<u64>,
    bytes_out: Option<u64>,
    packets_in: Option<u64>,
    packets_out: Option<u64>,
    duration: Option<u32>,
    user_name: Option<String>,
    user_domain: Option<String>,
    user_id: Option<String>,
    process_name: Option<String>,
    process_id: Option<u32>,
    parent_process_name: Option<String>,
    parent_process_id: Option<u32>,
    file_path: Option<String>,
    file_name: Option<String>,
    file_size: Option<u64>,
    command_line: Option<String>,
    registry_key: Option<String>,
    registry_value: Option<String>,
    url: Option<String>,
    uri_path: Option<String>,
    uri_query: Option<String>,
    http_method: Option<String>,
    http_status_code: Option<u16>,
    http_user_agent: Option<String>,
    http_referrer: Option<String>,
    http_content_type: Option<String>,
    http_content_length: Option<u64>,
    src_host: Option<String>,
    dest_host: Option<String>,
    device_type: Option<String>,
    vendor: Option<String>,
    product: Option<String>,
    version: Option<String>,
    src_country: Option<String>,
    dest_country: Option<String>,
    src_zone: Option<String>,
    dest_zone: Option<String>,
    interface_in: Option<String>,
    interface_out: Option<String>,
    vlan_id: Option<u16>,
    rule_id: Option<String>,
    rule_name: Option<String>,
    policy_id: Option<String>,
    policy_name: Option<String>,
    signature_id: Option<String>,
    signature_name: Option<String>,
    threat_name: Option<String>,
    threat_category: Option<String>,
    severity: Option<String>,
    priority: Option<String>,
    auth_method: Option<String>,
    auth_app: Option<String>,
    failure_reason: Option<String>,
    session_id: Option<String>,
    app_name: Option<String>,
    app_category: Option<String>,
    service_name: Option<String>,
    email_sender: Option<String>,
    email_recipient: Option<String>,
    email_subject: Option<String>,
    tags: Option<String>,
    message: Option<String>,
    details: Option<String>,
    custom_fields: Option<HashMap<String, String>>,
    ingestion_timestamp: u32,
}

/// Query builder for ClickHouse SQL generation
struct QueryBuilder<'a> {
    config: &'a Config,
    request: &'a SearchRequest,
}

impl<'a> QueryBuilder<'a> {
    fn new(config: &'a Config, request: &'a SearchRequest) -> Self {
        Self { config, request }
    }
    
    /// Build main search query with filters and pagination
    fn build_search_query(&self) -> Result<(String, HashMap<String, String>)> {
        let mut sql = String::new();
        let mut params = HashMap::new();
        let mut where_clauses = Vec::new();
        
        // SELECT clause
        if let Some(fields) = &self.request.fields {
            sql.push_str(&format!("SELECT {} FROM {}", fields.join(", "), self.get_table_name()));
        } else {
            sql.push_str(&format!("SELECT * FROM {}", self.get_table_name()));
        }
        
        // Tenant isolation
        if let Some(tenant_id) = &self.request.tenant_id {
            where_clauses.push("tenant_id = ?".to_string());
            params.insert("tenant_id".to_string(), tenant_id.clone());
        }
        
        // Time range filter
        if let Some(time_range) = &self.request.time_range {
            where_clauses.push("event_timestamp >= ? AND event_timestamp < ?".to_string());
            params.insert("start_time".to_string(), time_range.start.timestamp().to_string());
            params.insert("end_time".to_string(), time_range.end.timestamp().to_string());
        }
        
        // Text search with proper encoding
        if let Some(query) = &self.request.query {
            if !query.is_empty() {
                // URL encode the search query to prevent injection
                let encoded_query = urlencoding::encode(query);
                if self.config.search.enable_fulltext {
                    where_clauses.push("hasToken(message, ?)".to_string());
                } else {
                    where_clauses.push("message ILIKE ?".to_string());
                }
                params.insert("search_query".to_string(), encoded_query.to_string());
            }
        }
        
        // Field filters
        if let Some(filters) = &self.request.filters {
            for (field, filter_value) in filters {
                let (clause, param_value) = self.build_filter_clause(field, filter_value)?;
                where_clauses.push(clause);
                if let Some(value) = param_value {
                    params.insert(format!("filter_{}", field), value);
                }
            }
        }
        
        // WHERE clause
        if !where_clauses.is_empty() {
            sql.push_str(&format!(" WHERE {}", where_clauses.join(" AND ")));
        }
        
        // ORDER BY clause
        if let Some(sort_fields) = &self.request.sort {
            let sort_clauses: Vec<String> = sort_fields.iter().map(|sort| {
                let direction = match sort.direction {
                    SortDirection::Ascending => "ASC",
                    SortDirection::Descending => "DESC",
                };
                format!("{} {}", sort.field, direction)
            }).collect();
            sql.push_str(&format!(" ORDER BY {}", sort_clauses.join(", ")));
        } else {
            sql.push_str(" ORDER BY event_timestamp DESC");
        }
        
        // LIMIT clause
        let default_pagination = Pagination {
            page: 0,
            size: 100,
            cursor: None,
            include_total: false,
        };
        let pagination = self.request.pagination.as_ref().unwrap_or(&default_pagination);
        let limit = std::cmp::min(pagination.size, self.config.clickhouse.query.max_page_size);
        let offset = pagination.page * pagination.size;
        sql.push_str(&format!(" LIMIT {} OFFSET {}", limit, offset));
        
        Ok((sql, params))
    }
    
    /// Build aggregation query
    fn build_aggregation_query(&self, agg_request: &AggregationRequest) -> Result<(String, HashMap<String, String>)> {
        let mut sql = String::new();
        let mut params = HashMap::new();
        
        match &agg_request.agg_type {
            AggregationType::Count => {
                sql.push_str(&format!("SELECT count() FROM {}", self.get_table_name()));
            }
            AggregationType::Terms => {
                let size = agg_request.size.unwrap_or(10);
                sql.push_str(&format!(
                    "SELECT {}, count() as doc_count FROM {} GROUP BY {} ORDER BY doc_count DESC LIMIT {}",
                    agg_request.field, self.get_table_name(), agg_request.field, size
                ));
            }
            AggregationType::DateHistogram { interval } => {
                sql.push_str(&format!(
                    "SELECT toStartOfInterval(toDateTime(event_timestamp), INTERVAL {}) as bucket, count() as doc_count FROM {} GROUP BY bucket ORDER BY bucket",
                    interval, self.get_table_name()
                ));
            }
            _ => {
                return Err(anyhow::anyhow!("Aggregation type not implemented: {:?}", agg_request.agg_type));
            }
        }
        
        // Add same WHERE conditions as main query
        // TODO: Implement filter conditions for aggregations
        
        Ok((sql, params))
    }
    
    /// Build filter clause for a specific field and filter value
    /// Validates field names against whitelist to prevent SQL injection
    fn build_filter_clause(&self, field: &str, filter_value: &FilterValue) -> Result<(String, Option<String>)> {
        // Validate field name against whitelist to prevent SQL injection
        if !ALLOWED_EVENT_FIELDS.contains(field) {
            return Err(anyhow::anyhow!("Invalid filter field: {}", field));
        }
        
        match filter_value {
            FilterValue::Equals(value) => {
                Ok((format!("{} = :{}", field, field), Some(value.clone())))
            }
            FilterValue::NotEquals(value) => {
                Ok((format!("{} != :{}", field, field), Some(value.clone())))
            }
            FilterValue::Contains(value) => {
                Ok((format!("{} ILIKE :{}_contains", field, field), Some(format!("%{}%", value))))
            }
            FilterValue::NotContains(value) => {
                Ok((format!("{} NOT ILIKE :{}_not_contains", field, field), Some(format!("%{}%", value))))
            }
            FilterValue::StartsWith(value) => {
                Ok((format!("{} ILIKE :{}_starts", field, field), Some(format!("{}%", value))))
            }
            FilterValue::EndsWith(value) => {
                Ok((format!("{} ILIKE :{}_ends", field, field), Some(format!("%{}", value))))
            }
            FilterValue::Regex(pattern) => {
                if self.config.search.enable_regex {
                    Ok((format!("match({}, :{}_regex)", field, field), Some(pattern.clone())))
                } else {
                    Err(anyhow::anyhow!("Regex search is disabled"))
                }
            }
            FilterValue::In(values) => {
                // For IN clauses, we need to create individual parameters for each value
                let param_names: Vec<String> = (0..values.len())
                    .map(|i| format!(":{}_in_{}", field, i))
                    .collect();
                let placeholders = param_names.join(", ");
                Ok((format!("{} IN ({})", field, placeholders), Some(values.join(","))))
            }
            FilterValue::NotIn(values) => {
                // For NOT IN clauses, we need to create individual parameters for each value
                let param_names: Vec<String> = (0..values.len())
                    .map(|i| format!(":{}_not_in_{}", field, i))
                    .collect();
                let placeholders = param_names.join(", ");
                Ok((format!("{} NOT IN ({})", field, placeholders), Some(values.join(","))))
            }
            FilterValue::GreaterThan(value) => {
                Ok((format!("{} > :{}_gt", field, field), Some(value.clone())))
            }
            FilterValue::GreaterThanOrEqual(value) => {
                Ok((format!("{} >= :{}_gte", field, field), Some(value.clone())))
            }
            FilterValue::LessThan(value) => {
                Ok((format!("{} < :{}_lt", field, field), Some(value.clone())))
            }
            FilterValue::LessThanOrEqual(value) => {
                Ok((format!("{} <= :{}_lte", field, field), Some(value.clone())))
            }
            FilterValue::Between(start, end) => {
                Ok((format!("{} BETWEEN :{}_start AND :{}_end", field, field, field), Some(format!("{},{}", start, end))))
            }
            FilterValue::Exists => {
                Ok((format!("{} IS NOT NULL", field), None))
            }
            FilterValue::NotExists => {
                Ok((format!("{} IS NULL", field), None))
            }
        }
    }
    
    /// Get table name with tenant isolation
    fn get_table_name(&self) -> String {
        let table_name = self.config.get_table_name(self.request.tenant_id.as_deref());
        Self::validate_table_name(&table_name).unwrap_or_else(|_| {
            warn!("Invalid table name '{}', using default", table_name);
            "events".to_string()
        })
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