//! HTTP handlers for ClickHouse search service
//! Provides REST API endpoints for log search, aggregation, and monitoring

use crate::auth::Auth;
use crate::config::Config;
use crate::database::ClickHouseService;
use crate::dto::*;
use crate::security::{SecurityService, Claims};
use crate::validation::ValidationService;
use axum::{
    extract::{Query, State, Request, FromRequestParts},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response, Sse},
    routing::{get, post},
    Json, Router,
};
use axum::response::sse::{Event as SseEvent, KeepAlive};
use futures::stream::{self, Stream};
use tokio_stream::StreamExt as _;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tracing::{debug, error, info, warn};
use crate::error::ApiError;
use uuid::Uuid;

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db_service: Arc<ClickHouseService>,
    pub security_service: Arc<SecurityService>,
    pub validation_service: Arc<ValidationService>,
    pub start_time: Instant,
}

/// Stream events using Server-Sent Events (SSE)
pub async fn stream_events(
    Query(filters): Query<EventFilters>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let stream = async_stream::stream! {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1));
        loop {
            interval.tick().await;
            
            // Get latest events from ClickHouse
            match state.db_service.get_events(filters.clone()).await {
                Ok(events) => {
                    for event in events {
                        let data = serde_json::to_string(&event).unwrap_or_default();
                        yield Ok::<SseEvent, std::convert::Infallible>(SseEvent::default().data(data));
                    }
                }
                Err(e) => {
                    let error_data = format!("{{\"error\": \"{}\"}}", e);
                    yield Ok::<SseEvent, std::convert::Infallible>(SseEvent::default().event("error").data(error_data));
                }
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// Search events with POST request (API v1) - SECURE VERSION
pub async fn search_events_v1(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<SearchRequest>,
) -> Result<Json<SearchEventsResponse>, ApiError> {
    // Validate JWT token and extract claims
    let claims = state.security_service.validate_request(&headers).await
        .map_err(|e| {
            warn!("Authentication failed: {}", e);
            ApiError::Unauthorized("Invalid or missing authentication token".to_string())
        })?;
    
    // Validate and sanitize the search request
    let validated_request = state.validation_service.validate_search_request(
        request,
        &claims,
        state.config.security.enable_tenant_isolation,
    ).map_err(|e| {
        warn!("Request validation failed: {}", e);
        ApiError::BadRequest(format!("Invalid request: {}", e))
    })?;
    
    // Convert to EventFilters with validated data
    let filters = EventFilters {
        page: None,
        limit: validated_request.pagination.as_ref().map(|p| p.size),
        search: validated_request.query,
        severity: None,
        source_type: None,
        start_time: validated_request.time_range.as_ref().map(|tr| tr.start.timestamp() as u32),
        end_time: validated_request.time_range.as_ref().map(|tr| tr.end.timestamp() as u32),
        tenant_id: validated_request.tenant_id, // This is now guaranteed to be from JWT claims
    };

    // Execute the search
    let events = state.db_service.get_events(filters).await
        .map_err(|e| {
            error!("Database query failed: {}", e);
            ApiError::InternalServerError("Failed to search events".to_string())
        })?;
    
    // Convert Event objects to EventDetailResponse objects
    let event_details: Vec<EventDetailResponse> = events.into_iter().map(|event| {
        let timestamp = DateTime::from_timestamp(event.event_timestamp as i64, 0)
            .unwrap_or_default()
            .to_rfc3339();
        
        EventDetailResponse {
            id: event.event_id.clone(),
            timestamp: timestamp.clone(),
            source: event.source_ip.clone(),
            source_type: event.source_type.clone(),
            severity: event.severity.clone().unwrap_or_else(|| "info".to_string()),
            facility: "local0".to_string(),
            hostname: "unknown".to_string(),
            process: "siem".to_string(),
            message: event.message.clone().unwrap_or_else(|| "No message".to_string()),
            raw_message: event.message.clone().unwrap_or_else(|| "No message".to_string()),
            source_ip: event.source_ip.clone(),
            source_port: 0,
            protocol: "tcp".to_string(),
            tags: vec![],
            fields: std::collections::HashMap::new(),
            processing_stage: "processed".to_string(),
            created_at: timestamp.clone(),
            updated_at: timestamp,
        }
    }).collect();

    let response = SearchEventsResponse {
        events: event_details.clone(),
        total: event_details.len(),
        status: "success".to_string(),
    };

    debug!("Search completed for tenant: {}, returned {} events", claims.tenant_id, event_details.len());
    
    Ok(Json(response))
}

/// Get events size/count
pub async fn get_events_size(
    Query(filters): Query<EventFilters>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    // For now, use the existing get_events and count the results
    // In production, this should be optimized with a COUNT query
    match state.db_service.get_events(filters).await {
        Ok(events) => Json(serde_json::json!({
            "size": events.len(),
            "status": "success"
        })).into_response(),
        Err(e) => {
            error!("Failed to get events size: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                "error": "Failed to get events size",
                "details": e.to_string()
            }))).into_response()
        }
    }
}

/// Ingest a single event
pub async fn ingest_single_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: String,
) -> impl IntoResponse {
    let content_type = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json");

    // For now, return a placeholder response
    // TODO: Implement actual event parsing and ingestion
    Json(serde_json::json!({
        "ingested": 1,
        "skipped": 0,
        "tenant_id": "00000000-0000-0000-0000-000000000000",
        "status": "accepted"
    }))
}

/// Ingest batch of events
pub async fn ingest_batch_events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(events): Json<serde_json::Value>,
) -> impl IntoResponse {
    // For now, return a placeholder response
    // TODO: Implement actual batch event parsing and ingestion
    let count = if events.is_array() {
        events.as_array().unwrap().len()
    } else {
        1
    };

    Json(serde_json::json!({
        "ingested": count,
        "skipped": 0,
        "tenant_id": "00000000-0000-0000-0000-000000000000",
        "status": "accepted"
    }))
}

/// Create the main application router
pub fn create_router(state: AppState) -> Router {
    // Public routes (no authentication required)
    let public_routes = Router::new()
        .route("/health", get(health_check))
        .route("/metrics", get(metrics))
        .route("/status", get(status));
    
    // Protected routes (authentication required)
    let protected_routes = Router::new()
        .route("/search", post(search_logs_protected))
        .route("/search", get(search_logs_get_protected))
        .route("/dashboard", get(get_dashboard_protected))
        .route("/events", get(get_events_protected))
        .route("/schema", get(get_schema_protected))
        .route("/suggest", post(suggest_query_protected))
        // New API v1 endpoints for SIEM ingestion pipeline
        .route("/api/v1/dashboard", get(get_dashboard_protected))
        .route("/api/v1/events/stream", get(stream_events_protected))
        .route("/api/v1/events/search", post(search_events_v1_protected))
        .route("/api/v1/events/size", get(get_events_size_protected))
        .route("/api/v1/events/ingest", post(ingest_single_event_protected))
        .route("/api/v1/events/batch", post(ingest_batch_events_protected))
        .layer(axum::middleware::from_fn_with_state(state.clone(), auth_middleware));
    
    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .with_state(state)
}

/// Main search endpoint (POST)
async fn search_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, ApiError> {
    let start_time = Instant::now();
    
    // Extract and validate tenant from JWT token
    let claims = state.security_service.validate_request(&headers).await
        .map_err(|e| ApiError::Unauthorized(e.to_string()))?;
    
    // Validate request
    let validated_request = validate_search_request(request, &claims, &state.config)?;
    
    debug!("Processing search request for tenant: {:?}", validated_request.tenant_id);
    
    // Execute search
    let response = state.db_service.search(validated_request).await
        .map_err(|e| {
            error!("Search query failed: {}", e);
            ApiError::InternalServerError("Search query failed".to_string())
        })?;
    
    let query_time = start_time.elapsed();
    info!("Search completed in {}ms", query_time.as_millis());
    
    Ok(Json(response))
}

/// Search endpoint with GET method for simple queries
async fn search_logs_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<SearchQueryParams>,
) -> Result<Json<SearchResponse>, ApiError> {
    // Convert query parameters to SearchRequest
    let request = SearchRequest {
        query: params.q,
        time_range: if let (Some(start), Some(end)) = (params.start, params.end) {
            Some(TimeRange {
                start,
                end,
                timezone: params.timezone,
            })
        } else {
            None
        },
        filters: params.filters.map(|f| {
            f.into_iter().map(|(k, v)| (k, FilterValue::Equals(v))).collect()
        }),
        pagination: Some(Pagination {
            page: params.page.unwrap_or(0),
            size: params.size.unwrap_or(100),
            cursor: params.cursor,
            include_total: params.include_total.unwrap_or(false),
        }),
        sort: params.sort.map(|sort_str| {
            sort_str.split(',').map(|s| {
                let parts: Vec<&str> = s.trim().split(':').collect();
                SortField {
                    field: parts[0].to_string(),
                    direction: if parts.len() > 1 && parts[1] == "asc" {
                        SortDirection::Ascending
                    } else {
                        SortDirection::Descending
                    },
                    priority: None,
                }
            }).collect()
        }),
        fields: params.fields.map(|f| f.split(',').map(|s| s.trim().to_string()).collect()),
        options: Some(SearchOptions {
            enable_fulltext: params.fulltext,
            enable_regex: params.regex,
            case_sensitive: params.case_sensitive,
            enable_highlighting: params.highlight,
            timeout_secs: params.timeout,
            enable_caching: params.cache,
            cache_ttl_secs: None,
            enable_streaming: params.stream,
            explain: params.explain,
        }),
        tenant_id: None, // Will be set from JWT claims
        aggregations: None,
    };
    
    // Delegate to POST handler
    search_logs(State(state), headers, Json(request)).await
}

/// Health check endpoint
async fn health_check(
    State(state): State<AppState>,
) -> Result<Json<HealthResponse>, ApiError> {
    let mut components = HashMap::new();
    
    // Check ClickHouse connection
    let clickhouse_health = check_clickhouse_health(&state.db_service).await;
    components.insert("clickhouse".to_string(), clickhouse_health);
    
    // Check Redis connection (if configured)
    if !state.config.redis.url.is_empty() {
        let redis_health = check_redis_health(&state.config).await;
        components.insert("redis".to_string(), redis_health);
    }
    
    // Determine overall health status
    let overall_status = if components.values().all(|c| matches!(c.status, HealthStatus::Healthy)) {
        HealthStatus::Healthy
    } else if components.values().any(|c| matches!(c.status, HealthStatus::Unhealthy)) {
        HealthStatus::Unhealthy
    } else {
        HealthStatus::Degraded
    };
    
    let response = HealthResponse {
        status: overall_status,
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime: state.start_time.elapsed().as_secs(),
        components,
        timestamp: Utc::now(),
    };
    
    Ok(Json(response))
}

/// Metrics endpoint for Prometheus
async fn metrics(
    State(state): State<AppState>,
) -> Result<String, ApiError> {
    let db_metrics = state.db_service.get_metrics();
    
    let metrics_text = format!(
        r#"# HELP search_queries_total Total number of search queries
# TYPE search_queries_total counter
search_queries_total {}

# HELP search_queries_successful_total Total number of successful search queries
# TYPE search_queries_successful_total counter
search_queries_successful_total {}

# HELP search_queries_failed_total Total number of failed search queries
# TYPE search_queries_failed_total counter
search_queries_failed_total {}

# HELP search_cache_hits_total Total number of cache hits
# TYPE search_cache_hits_total counter
search_cache_hits_total {}

# HELP search_cache_misses_total Total number of cache misses
# TYPE search_cache_misses_total counter
search_cache_misses_total {}

# HELP search_query_duration_ms Average query duration in milliseconds
# TYPE search_query_duration_ms gauge
search_query_duration_ms {}

# HELP search_service_uptime_seconds Service uptime in seconds
# TYPE search_service_uptime_seconds gauge
search_service_uptime_seconds {}
"#,
        db_metrics.total_queries.load(std::sync::atomic::Ordering::Relaxed),
        db_metrics.successful_queries.load(std::sync::atomic::Ordering::Relaxed),
        db_metrics.failed_queries.load(std::sync::atomic::Ordering::Relaxed),
        db_metrics.cache_hits.load(std::sync::atomic::Ordering::Relaxed),
        db_metrics.cache_misses.load(std::sync::atomic::Ordering::Relaxed),
        db_metrics.avg_query_time_ms.load(std::sync::atomic::Ordering::Relaxed),
        state.start_time.elapsed().as_secs()
    );
    
    Ok(metrics_text)
}

/// Status endpoint with detailed service information
async fn status(
    State(state): State<AppState>,
) -> Result<Json<ServiceStatus>, ApiError> {
    let db_metrics = state.db_service.get_metrics();
    
    let status = ServiceStatus {
        service: "siem-clickhouse-search".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: state.start_time.elapsed().as_secs(),
        timestamp: Utc::now(),
        database: DatabaseStatus {
            total_queries: db_metrics.total_queries.load(std::sync::atomic::Ordering::Relaxed),
            successful_queries: db_metrics.successful_queries.load(std::sync::atomic::Ordering::Relaxed),
            failed_queries: db_metrics.failed_queries.load(std::sync::atomic::Ordering::Relaxed),
            avg_query_time_ms: db_metrics.avg_query_time_ms.load(std::sync::atomic::Ordering::Relaxed),
            cache_hit_ratio: {
                let hits = db_metrics.cache_hits.load(std::sync::atomic::Ordering::Relaxed);
                let misses = db_metrics.cache_misses.load(std::sync::atomic::Ordering::Relaxed);
                if hits + misses > 0 {
                    (hits as f64) / ((hits + misses) as f64)
                } else {
                    0.0
                }
            },
        },
        configuration: ConfigurationStatus {
            tenant_isolation_enabled: state.config.security.enable_tenant_isolation,
            fulltext_search_enabled: state.config.search.enable_fulltext,
            regex_search_enabled: state.config.search.enable_regex,
            caching_enabled: state.config.clickhouse.query.enable_caching,
            max_page_size: state.config.clickhouse.query.max_page_size,
            default_timeout_secs: state.config.clickhouse.query.default_timeout_secs,
        },
    };
    
    Ok(Json(status))
}

/// Schema endpoint to get available fields and their types
async fn get_schema(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SchemaResponse>, ApiError> {
    // Validate authentication
    let _claims = state.security_service.validate_request(&headers).await
        .map_err(|e| ApiError::Unauthorized(e.to_string()))?;
    
    // Query ClickHouse for actual schema
    let table_name = &state.config.clickhouse.tables.default_table;
    let describe_sql = format!("DESCRIBE TABLE {}", table_name);
    
    #[derive(Debug, clickhouse::Row, serde::Deserialize)]
        struct ColumnInfo {
            name: String,
            r#type: String,
            default_type: String,
            default_expression: String,
            comment: String,
            codec_expression: String,
            ttl_expression: String,
        }
    
    let client = state.db_service.get_client();
    let columns: Vec<ColumnInfo> = client.query(&describe_sql)
        .fetch_all()
        .await
        .map_err(|e| ApiError::InternalServerError(format!("Failed to describe table: {}", e)))?;
    
    // Convert ClickHouse column types to schema field types
    let fields: Vec<FieldSchema> = columns.into_iter().map(|col| {
        let (field_type, searchable, aggregatable) = map_clickhouse_type(&col.r#type);
        FieldSchema {
            name: col.name,
            field_type,
            searchable,
            aggregatable,
            description: if col.comment.is_empty() { None } else { Some(col.comment) },
        }
    }).collect();
    
    let schema = SchemaResponse {
        fields,
        version: "1.0".to_string(),
        last_updated: Utc::now(),
    };
    
    Ok(Json(schema))
}

/// Map ClickHouse data types to schema field types
fn map_clickhouse_type(clickhouse_type: &str) -> (String, bool, bool) {
    let lower_type = clickhouse_type.to_lowercase();
    
    if lower_type == "string" || lower_type.contains("text") {
        ("text".to_string(), true, false)
    } else if lower_type.contains("datetime") || lower_type.contains("date") {
        ("datetime".to_string(), true, true)
    } else if lower_type.contains("ipv4") || lower_type.contains("ipv6") {
        ("ip".to_string(), true, true)
    } else if lower_type.contains("int") || lower_type.contains("float") || lower_type.contains("decimal") {
        ("number".to_string(), true, true)
    } else if lower_type.contains("uuid") {
        ("keyword".to_string(), true, true)
    } else if lower_type.contains("lowcardinality") {
        ("keyword".to_string(), true, true)
    } else if lower_type.contains("array") {
        ("array".to_string(), true, false)
    } else if lower_type.contains("map") {
        ("object".to_string(), false, false)
    } else {
        ("keyword".to_string(), true, true)
    }
 }
 
 #[cfg(test)]
 mod tests {
     use super::*;
     use crate::config::Config;
     use crate::database::ClickHouseService;
     use crate::security::SecurityService;
     use std::sync::Arc;
 
     #[tokio::test]
    #[ignore] // Skip this test as it requires a live ClickHouse connection
    async fn test_schema_consistency() {
        // This test verifies that schema response fields match ClickHouse columns
        let config = Arc::new(Config::default());
       let db_service = Arc::new(ClickHouseService::new(config.clone()).await.unwrap());
       let security_service = Arc::new(SecurityService::new(config.clone()).unwrap());
       
       let validation_service = Arc::new(ValidationService::new().unwrap());
       let state = AppState {
          config: config.clone(),
          db_service: db_service.clone(),
          security_service,
          validation_service,
          start_time: std::time::Instant::now(),
      };
        
        // Get schema response
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer test-token".parse().unwrap());
        
        let schema_result = get_schema(State(state), headers).await;
        assert!(schema_result.is_ok(), "Schema endpoint should succeed");
        
        let schema_response = schema_result.unwrap().0;
        
        // Assert that schema response has fields
        assert!(
            !schema_response.fields.is_empty(),
            "Schema response should have at least one field"
        );
        
        // Assert that all fields have required properties
        for field in &schema_response.fields {
            assert!(!field.name.is_empty(), "Field name should not be empty");
             assert!(!field.field_type.is_empty(), "Field type should not be empty");
         }
     }
 
     #[test]
     fn test_map_clickhouse_type() {
         // Test type mapping function
         assert_eq!(map_clickhouse_type("String"), ("text".to_string(), true, false));
         assert_eq!(map_clickhouse_type("DateTime64(3)"), ("datetime".to_string(), true, true));
         assert_eq!(map_clickhouse_type("IPv4"), ("ip".to_string(), true, true));
         assert_eq!(map_clickhouse_type("UInt64"), ("number".to_string(), true, true));
         assert_eq!(map_clickhouse_type("UUID"), ("keyword".to_string(), true, true));
         assert_eq!(map_clickhouse_type("LowCardinality(String)"), ("keyword".to_string(), true, true));
         assert_eq!(map_clickhouse_type("Array(String)"), ("array".to_string(), true, false));
         assert_eq!(map_clickhouse_type("Map(String, String)"), ("object".to_string(), false, false));
     }
 }
 
 /// Query suggestion endpoint
async fn suggest_query(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<SuggestionRequest>,
) -> Result<Json<SuggestionResponse>, ApiError> {
    // Validate authentication
    let _claims = state.security_service.validate_request(&headers).await
        .map_err(|e| ApiError::Unauthorized(e.to_string()))?;
    
    // TODO: Implement actual query suggestions based on schema and query history
    let suggestions = vec![
        SearchSuggestion {
            suggestion_type: SuggestionType::Field,
            text: "source_ip".to_string(),
            score: 0.9,
            context: Some("IP address field".to_string()),
        },
        SearchSuggestion {
            suggestion_type: SuggestionType::Value,
            text: "ERROR".to_string(),
            score: 0.8,
            context: Some("Common log level".to_string()),
        },
    ];
    
    let response = SuggestionResponse {
        suggestions,
        query: request.partial_query,
        took: 5, // Mock response time
    };
    
    Ok(Json(response))
}

/// Dashboard endpoint providing aggregated data for UI cards
async fn get_dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DashboardV2Response>, ApiError> {
    let start_time = Instant::now();
    
    // Extract and validate tenant from JWT token
    let claims = state.security_service.validate_request(&headers).await
        .map_err(|e| ApiError::Unauthorized(e.to_string()))?;
    
    debug!("Processing dashboard request for tenant: {}", claims.tenant_id);
    
    // Execute dashboard queries
    let response = state.db_service.get_dashboard_data(None).await
        .map_err(|e| {
            error!("Dashboard query failed: {}", e);
            ApiError::InternalServerError("Dashboard query failed".to_string())
        })?;
    
    let query_time = start_time.elapsed();
    info!("Dashboard data retrieved in {}ms", query_time.as_millis());
    
    Ok(Json(response))
}

/// Get events from dev.events table
async fn get_events(
    State(state): State<AppState>,
    Query(filters): Query<EventFilters>,
) -> Result<Json<Vec<Event>>, ApiError> {
    match state.db_service.get_events(filters).await {
        Ok(events) => Ok(Json(events)),
        Err(e) => {
            error!("Failed to get events: {}", e);
            Err(ApiError::InternalServerError("Failed to get events".to_string()))
        }
    }
}

/// Validate and enrich search request
fn validate_search_request(
    mut request: SearchRequest,
    claims: &Claims,
    config: &Config,
) -> Result<SearchRequest, ApiError> {
    // Set tenant ID from JWT claims
    if config.security.enable_tenant_isolation {
        request.tenant_id = Some(claims.tenant_id.clone());
    }
    
    // Validate pagination
    if let Some(pagination) = &mut request.pagination {
        if pagination.size > config.clickhouse.query.max_page_size {
            pagination.size = config.clickhouse.query.max_page_size;
        }
    }
    
    // Validate time range
    if let Some(time_range) = &request.time_range {
        if time_range.start >= time_range.end {
            return Err(ApiError::BadRequest("Invalid time range: start must be before end".to_string()));
        }
        
        let max_range = chrono::Duration::days(90); // Maximum 90 days
        if time_range.end - time_range.start > max_range {
            return Err(ApiError::BadRequest("Time range too large: maximum 90 days allowed".to_string()));
        }
    }
    
    // Validate regex complexity if regex is enabled
    if let Some(query) = &request.query {
        if config.search.enable_regex && query.contains(".*") {
            // Simple regex complexity check
            let complexity = query.matches(".*").count() + query.matches(".+").count();
            if complexity > config.search.max_regex_complexity as usize {
                return Err(ApiError::BadRequest("Regex query too complex".to_string()));
            }
        }
    }
    
    Ok(request)
}

/// Check ClickHouse database health
async fn check_clickhouse_health(db_service: &ClickHouseService) -> ComponentHealth {
    let start_time = Instant::now();
    
    // Try to execute a simple query
    match tokio::time::timeout(
        Duration::from_secs(5),
        db_service.search(SearchRequest {
            query: None,
            time_range: None,
            filters: None,
            pagination: Some(Pagination {
                page: 0,
                size: 1,
                cursor: None,
                include_total: false,
            }),
            sort: None,
            fields: Some(vec!["event_timestamp".to_string()]),
            options: None,
            tenant_id: None,
            aggregations: None,
        })
    ).await {
        Ok(Ok(_)) => ComponentHealth {
            status: HealthStatus::Healthy,
            response_time_ms: Some(start_time.elapsed().as_millis() as u64),
            error: None,
            last_check: Utc::now(),
        },
        Ok(Err(e)) => ComponentHealth {
            status: HealthStatus::Unhealthy,
            response_time_ms: Some(start_time.elapsed().as_millis() as u64),
            error: Some(e.to_string()),
            last_check: Utc::now(),
        },
        Err(_) => ComponentHealth {
            status: HealthStatus::Unhealthy,
            response_time_ms: None,
            error: Some("Health check timeout".to_string()),
            last_check: Utc::now(),
        },
    }
}

/// Check Redis health
async fn check_redis_health(config: &Config) -> ComponentHealth {
    let start_time = Instant::now();
    
    // TODO: Implement actual Redis health check
    ComponentHealth {
        status: HealthStatus::Healthy,
        response_time_ms: Some(start_time.elapsed().as_millis() as u64),
        error: None,
        last_check: Utc::now(),
    }
}

// Additional DTOs for API endpoints

/// Query parameters for GET search endpoint
#[derive(Debug, Deserialize)]
struct SearchQueryParams {
    q: Option<String>,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
    timezone: Option<String>,
    filters: Option<HashMap<String, String>>,
    page: Option<u32>,
    size: Option<u32>,
    cursor: Option<String>,
    include_total: Option<bool>,
    sort: Option<String>,
    fields: Option<String>,
    fulltext: Option<bool>,
    regex: Option<bool>,
    case_sensitive: Option<bool>,
    highlight: Option<bool>,
    timeout: Option<u64>,
    cache: Option<bool>,
    stream: Option<bool>,
    explain: Option<bool>,
}

/// Service status response
#[derive(Debug, Serialize)]
struct ServiceStatus {
    service: String,
    version: String,
    uptime_seconds: u64,
    timestamp: DateTime<Utc>,
    database: DatabaseStatus,
    configuration: ConfigurationStatus,
}

/// Database status information
#[derive(Debug, Serialize)]
struct DatabaseStatus {
    total_queries: u64,
    successful_queries: u64,
    failed_queries: u64,
    avg_query_time_ms: u64,
    cache_hit_ratio: f64,
}

/// Configuration status
#[derive(Debug, Serialize)]
struct ConfigurationStatus {
    tenant_isolation_enabled: bool,
    fulltext_search_enabled: bool,
    regex_search_enabled: bool,
    caching_enabled: bool,
    max_page_size: u32,
    default_timeout_secs: u64,
}

/// Schema response
#[derive(Debug, Serialize)]
struct SchemaResponse {
    fields: Vec<FieldSchema>,
    version: String,
    last_updated: DateTime<Utc>,
}

/// Field schema information
#[derive(Debug, Serialize)]
struct FieldSchema {
    name: String,
    field_type: String,
    searchable: bool,
    aggregatable: bool,
    description: Option<String>,
}

/// Suggestion request
#[derive(Debug, Deserialize)]
struct SuggestionRequest {
    partial_query: String,
    context: Option<String>,
    max_suggestions: Option<u32>,
}

/// Suggestion response
#[derive(Debug, Serialize)]
struct SuggestionResponse {
    suggestions: Vec<SearchSuggestion>,
    query: String,
    took: u64,
}

use std::time::Duration;

/// Authentication middleware that validates the dev admin token
async fn auth_middleware(
    State(_state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Extract auth from request parts
    let (mut parts, body) = request.into_parts();
    
    // Validate authentication
    match Auth::from_request_parts(&mut parts, &()).await {
        Ok(_auth) => {
            // Authentication successful, proceed with request
            request = Request::from_parts(parts, body);
            Ok(next.run(request).await)
        }
        Err(status) => {
            // Authentication failed
            Err(status)
        }
    }
}

// Protected handler wrappers that include authentication

async fn search_logs_protected(
    _auth: Auth,
    state: State<AppState>,
    headers: HeaderMap,
    request: Json<SearchRequest>,
) -> Result<Json<SearchResponse>, ApiError> {
    search_logs(state, headers, request).await
}

async fn search_logs_get_protected(
    _auth: Auth,
    state: State<AppState>,
    headers: HeaderMap,
    params: Query<SearchQueryParams>,
) -> Result<Json<SearchResponse>, ApiError> {
    search_logs_get(state, headers, params).await
}

async fn get_dashboard_protected(
    _auth: Auth,
    state: State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DashboardV2Response>, ApiError> {
    get_dashboard(state, headers).await
}

async fn get_events_protected(
    _auth: Auth,
    state: State<AppState>,
    filters: Query<EventFilters>,
) -> Result<Json<Vec<Event>>, ApiError> {
    get_events(state, filters).await
}

async fn get_schema_protected(
    _auth: Auth,
    state: State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SchemaResponse>, ApiError> {
    get_schema(state, headers).await
}

async fn suggest_query_protected(
    _auth: Auth,
    state: State<AppState>,
    headers: HeaderMap,
    request: Json<SuggestionRequest>,
) -> Result<Json<SuggestionResponse>, ApiError> {
    suggest_query(state, headers, request).await
}

async fn stream_events_protected(
    _auth: Auth,
    filters: Query<EventFilters>,
    state: State<AppState>,
) -> impl IntoResponse {
    stream_events(filters, state).await
}

async fn search_events_v1_protected(
    _auth: Auth,
    state: State<AppState>,
    headers: HeaderMap,
    request: Json<SearchRequest>,
) -> Result<Json<SearchEventsResponse>, ApiError> {
    search_events_v1(state, headers, request).await
}

async fn get_events_size_protected(
    _auth: Auth,
    filters: Query<EventFilters>,
    state: State<AppState>,
) -> impl IntoResponse {
    get_events_size(filters, state).await
}

async fn ingest_single_event_protected(
    _auth: Auth,
    state: State<AppState>,
    headers: HeaderMap,
    body: String,
) -> impl IntoResponse {
    ingest_single_event(state, headers, body).await
}

async fn ingest_batch_events_protected(
    _auth: Auth,
    state: State<AppState>,
    headers: HeaderMap,
    events: Json<serde_json::Value>,
) -> impl IntoResponse {
    ingest_batch_events(state, headers, events).await
}