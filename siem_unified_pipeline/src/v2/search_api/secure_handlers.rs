use axum::{
    extract::State,
    Json,
    response::sse::{Event, Sse},
    http::StatusCode,
};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use crate::v2::state::AppState;
use crate::ch::{Ch, ChResponse, default_query_settings};
use anyhow::Result;

// Request/Response types - NO SQL EXPOSED

#[derive(Debug, Deserialize)]
pub struct SearchIntent {
    pub tenant_id: String,
    pub time: TimeRange,
    pub q: String,
    #[serde(default = "default_limit")]
    pub limit: u32,
}

#[derive(Debug, Deserialize)]
pub struct TimeRange {
    pub last_seconds: Option<u32>,
    pub from: Option<u64>,
    pub to: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub data: Vec<Value>,
    pub meta: Vec<ColumnMeta>,
    pub statistics: SearchStats,
}

#[derive(Debug, Serialize)]
pub struct ColumnMeta {
    pub name: String,
    #[serde(rename = "type")]
    pub col_type: String,
}

#[derive(Debug, Serialize)]
pub struct SearchStats {
    pub rows: usize,
    pub took_ms: u64,
    pub rows_read: u64,
    pub bytes_read: u64,
}

fn default_limit() -> u32 { 100 }

/// POST /api/v2/search/execute - Execute search with structured intent ONLY
/// Frontend sends: { tenant_id, time: { last_seconds }, q, limit }
/// Backend returns: { data: [...], meta: [...], statistics: {...} }
/// SQL is NEVER exposed to the client
pub async fn execute_secure(
    State(st): State<Arc<AppState>>,
    Json(intent): Json<SearchIntent>,
) -> Result<Json<SearchResponse>, StatusCode> {
    let start = std::time::Instant::now();
    
    // Validate and clamp inputs
    let tenant_id = validate_tenant_id(&intent.tenant_id)?;
    let (from_ts, to_ts) = resolve_time_range(&intent.time)?;
    let limit = intent.limit.clamp(1, 10000);
    
    // Parse and validate the query DSL
    let where_clause = compile_safe_where_clause(&intent.q)?;
    
    // Build parameterized SQL template
    let sql = r#"
        SELECT 
            event_timestamp,
            severity,
            message,
            source_ip,
            destination_ip,
            event_type,
            user_name
        FROM dev.events 
        WHERE 
            tenant_id = {tenant:String}
            AND event_timestamp >= toDateTime({from:UInt32})
            AND event_timestamp < toDateTime({to:UInt32})
            AND ({where})
        ORDER BY event_timestamp DESC
        LIMIT {limit:UInt32}
    "#;
    
    // Prepare parameters
    let params = vec![
        ("tenant", tenant_id),
        ("from", from_ts.to_string()),
        ("to", to_ts.to_string()),
        ("where", where_clause),
        ("limit", limit.to_string()),
    ];
    
    // Execute with safety settings
    let ch = get_ch_client(&st)?;
    let settings = default_query_settings();
    
    let result: ChResponse = ch
        .query_json(sql, &params, &settings)
        .await
        .map_err(|e| {
            tracing::error!("ClickHouse query failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    
    // Build response
    let response = SearchResponse {
        data: result.data,
        meta: result.meta.into_iter().map(|m| ColumnMeta {
            name: m.name,
            col_type: m.ch_type,
        }).collect(),
        statistics: SearchStats {
            rows: result.rows,
            took_ms: start.elapsed().as_millis() as u64,
            rows_read: result.statistics.as_ref().map(|s| s.rows_read).unwrap_or(0),
            bytes_read: result.statistics.as_ref().map(|s| s.bytes_read).unwrap_or(0),
        },
    };
    
    // Audit log (without exposing SQL to client)
    tracing::info!(
        tenant_id = %intent.tenant_id,
        query = %intent.q,
        rows = %response.statistics.rows,
        took_ms = %response.statistics.took_ms,
        "Search executed"
    );
    
    Ok(Json(response))
}

/// Validate tenant ID - alphanumeric only, max 64 chars
fn validate_tenant_id(tenant_id: &str) -> Result<String, StatusCode> {
    if tenant_id.is_empty() || tenant_id.len() > 64 {
        return Err(StatusCode::BAD_REQUEST);
    }
    
    if !tenant_id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err(StatusCode::BAD_REQUEST);
    }
    
    Ok(tenant_id.to_string())
}

/// Resolve time range to unix timestamps with safety clamps
fn resolve_time_range(time: &TimeRange) -> Result<(u64, u64), StatusCode> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    if let Some(last_seconds) = time.last_seconds {
        // Clamp to reasonable range: 1 second to 7 days
        let seconds = last_seconds.clamp(1, 604800);
        let from = now.saturating_sub(seconds as u64);
        Ok((from, now))
    } else if let (Some(from), Some(to)) = (time.from, time.to) {
        // Ensure from < to and reasonable range
        if from >= to {
            return Err(StatusCode::BAD_REQUEST);
        }
        // Max 30 days range
        if to - from > 2592000 {
            return Err(StatusCode::BAD_REQUEST);
        }
        Ok((from, to))
    } else {
        // Default to last hour
        Ok((now - 3600, now))
    }
}

/// Compile user query to safe WHERE clause
/// This is a simplified version - in production, use a proper parser
fn compile_safe_where_clause(q: &str) -> Result<String, StatusCode> {
    if q.is_empty() {
        return Ok("1=1".to_string());
    }
    
    // Basic validation - no SQL injection
    let forbidden = ["drop", "delete", "insert", "update", "create", "alter", ";", "--"];
    let q_lower = q.to_lowercase();
    for f in forbidden {
        if q_lower.contains(f) {
            return Err(StatusCode::BAD_REQUEST);
        }
    }
    
    // Simple field:value parser (production should use proper AST)
    // Examples: "message:error", "severity:high", "message:error AND severity:high"
    
    // For now, just escape single quotes and wrap in message LIKE
    let escaped = q.replace("'", "''");
    Ok(format!("message LIKE '%{}%'", escaped))
}

/// Get ClickHouse client from app state
fn get_ch_client(st: &AppState) -> Result<Ch, StatusCode> {
    // In production, this would come from app state
    // For now, create a new client
    let ch = Ch::new(
        "http://127.0.0.1:8123".to_string(),
        "default".to_string(),
        "".to_string(),
    );
    Ok(ch)
}

// Additional secure endpoints

/// POST /api/v2/search/compile - Validate query syntax without execution
/// Returns success/error status only, never SQL
#[derive(Debug, Serialize)]
pub struct CompileResponse {
    pub valid: bool,
    pub error: Option<String>,
}

pub async fn compile_secure(
    State(_st): State<Arc<AppState>>,
    Json(intent): Json<SearchIntent>,
) -> Json<CompileResponse> {
    // Validate inputs
    if let Err(_) = validate_tenant_id(&intent.tenant_id) {
        return Json(CompileResponse {
            valid: false,
            error: Some("Invalid tenant ID".to_string()),
        });
    }
    
    if let Err(_) = resolve_time_range(&intent.time) {
        return Json(CompileResponse {
            valid: false,
            error: Some("Invalid time range".to_string()),
        });
    }
    
    if let Err(_) = compile_safe_where_clause(&intent.q) {
        return Json(CompileResponse {
            valid: false,
            error: Some("Invalid query syntax".to_string()),
        });
    }
    
    Json(CompileResponse {
        valid: true,
        error: None,
    })
}
