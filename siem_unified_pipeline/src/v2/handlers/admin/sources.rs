use axum::{
    extract::{Path, Query, State},
    response::{sse::Event, Sse},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::pin::Pin;
use futures::stream::Stream;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};

#[derive(Debug, Deserialize)]
pub struct ListSourcesQuery {
    pub tenant: Option<u64>,
    pub cursor: Option<String>,
    pub q: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSourceRequest {
    pub tenant_id: u64,
    pub source_id: Option<String>,
    pub name: String,
    pub kind: String,
    pub transport: String,
    pub endpoint: String,
    pub parser_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSourceRequest {
    pub name: Option<String>,
    pub kind: Option<String>,
    pub transport: Option<String>,
    pub endpoint: Option<String>,
    pub parser_id: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TestSampleRequest {
    pub sample: String,
}

#[derive(Debug, Serialize)]
pub struct LogSource {
    pub tenant_id: u64,
    pub source_id: String,
    pub name: String,
    pub kind: String,
    pub transport: String,
    pub endpoint: String,
    pub parser_id: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct ListSourcesResponse {
    pub sources: Vec<LogSource>,
    pub next_cursor: Option<String>,
    pub total: u64,
}

#[derive(Debug, Serialize)]
pub struct TestConnectionResponse {
    pub mode: String,
    pub token: String,
    pub instructions: String,
    pub expires_at: String,
}

#[derive(Debug, Serialize)]
pub struct TestSampleResponse {
    pub normalized: String,
    pub warnings: Vec<String>,
    pub iocs: Option<Vec<String>>,
}

pub async fn list_sources(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListSourcesQuery>,
) -> PipelineResult<Json<serde_json::Value>> {
    let limit = 50;
    let offset = query.cursor.and_then(|c| c.parse::<u64>().ok()).unwrap_or(0);
    
    let mut sql = "SELECT tenant_id, source_id, name, kind, transport, endpoint, parser_id, status, created_at, updated_at FROM dev.log_sources_admin WHERE 1=1".to_string();
    let mut params: Vec<String> = Vec::new();
    
    if let Some(tenant) = query.tenant {
        sql.push_str(" AND tenant_id = ?");
        params.push(tenant.to_string());
    }
    
    if let Some(search) = &query.q {
        sql.push_str(" AND (name ILIKE ? OR kind ILIKE ?)");
        params.push(format!("%{}%", search));
        params.push(format!("%{}%", search));
    }
    
    sql.push_str(&format!(" ORDER BY created_at DESC LIMIT {} OFFSET {}", limit, offset));
    
    #[derive(Deserialize, clickhouse::Row)]
    struct Row { tenant_id:u64, source_id:String, name:String, kind:String, transport:String, endpoint:String, parser_id:String, status:String, created_at:String, updated_at:String }
    let rows: Vec<Row> = state.ch.query(&sql).fetch_all::<Row>().await?;
    let sources: Vec<LogSource> = rows.into_iter().map(|r| LogSource{ tenant_id:r.tenant_id, source_id:r.source_id, name:r.name, kind:r.kind, transport:r.transport, endpoint:r.endpoint, parser_id:r.parser_id, status:r.status, created_at:r.created_at, updated_at:r.updated_at }).collect();
    
    // Get total count
    let count_sql = "SELECT count() as total FROM dev.log_sources_admin WHERE 1=1";
    let total: u64 = state.ch.query(count_sql).fetch_one::<u64>().await.unwrap_or(0);
    
    let next_cursor = if sources.len() == limit as usize {
        Some((offset + limit).to_string())
    } else {
        None
    };
    
    let response = ListSourcesResponse {
        sources,
        next_cursor,
        total,
    };
    
    Ok(Json(serde_json::to_value(response)?))
}

pub async fn create_source(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSourceRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    let source_id = req.source_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let parser_id = req.parser_id.unwrap_or_default();
    
    let insert_sql = "INSERT INTO dev.log_sources_admin (tenant_id, source_id, name, kind, transport, endpoint, parser_id) VALUES (?, ?, ?, ?, ?, ?, ?)";
    state.ch.query(insert_sql)
        .bind(req.tenant_id.to_string())
        .bind(source_id.clone())
        .bind(req.name.clone())
        .bind(req.kind.clone())
        .bind(req.transport.clone())
        .bind(req.endpoint.clone())
        .bind(parser_id.clone())
        .execute()
        .await?;
    
    let source = LogSource {
        tenant_id: req.tenant_id,
        source_id,
        name: req.name,
        kind: req.kind,
        transport: req.transport,
        endpoint: req.endpoint,
        parser_id,
        status: "ENABLED".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    
    Ok(Json(serde_json::to_value(source)?))
}

pub async fn update_source(
    State(state): State<Arc<AppState>>,
    Path(source_id): Path<String>,
    Json(req): Json<UpdateSourceRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    let mut updates = Vec::new();
    let mut params = Vec::new();
    
    if let Some(name) = req.name {
        updates.push("name = ?");
        params.push(name);
    }
    
    if let Some(kind) = req.kind {
        updates.push("kind = ?");
        params.push(kind);
    }
    
    if let Some(transport) = req.transport {
        updates.push("transport = ?");
        params.push(transport);
    }
    
    if let Some(endpoint) = req.endpoint {
        updates.push("endpoint = ?");
        params.push(endpoint);
    }
    
    if let Some(parser_id) = req.parser_id {
        updates.push("parser_id = ?");
        params.push(parser_id);
    }
    
    if let Some(status) = req.status {
        updates.push("status = ?");
        params.push(status);
    }
    
    if updates.is_empty() {
        return Err(PipelineError::validation("No fields to update"));
    }
    
    updates.push("updated_at = ?");
    params.push(chrono::Utc::now().to_rfc3339());
    params.push(source_id.clone());
    
    let sql = format!(
        "ALTER TABLE dev.log_sources_admin UPDATE {} WHERE source_id = ?",
        updates.join(", ")
    );
    
    state.ch.query(&sql).execute().await?;
    
    Ok(Json(serde_json::json!({"status": "ok"})))
}

pub async fn delete_source(
    State(state): State<Arc<AppState>>,
    Path(source_id): Path<String>,
) -> PipelineResult<Json<serde_json::Value>> {
    let update_sql = "ALTER TABLE dev.log_sources_admin UPDATE status = 'DISABLED' WHERE source_id = ?";
    state.ch.query(update_sql).bind(source_id.clone()).execute().await?;
    
    Ok(Json(serde_json::json!({"status": "ok"})))
}

pub async fn test_connection(
    State(state): State<Arc<AppState>>,
    Path(source_id): Path<String>,
) -> PipelineResult<Json<serde_json::Value>> {
    // Get source details
    let sql = "SELECT transport FROM dev.log_sources_admin WHERE source_id = ?";
    let transport: Option<String> = state.ch.query(sql).fetch_optional::<String>().await?;
    let transport = transport.ok_or_else(|| PipelineError::not_found("Source not found"))?;
    
    let token = Uuid::new_v4().to_string();
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(1);
    
    let (mode, instructions) = match transport.as_str() {
        "syslog-udp" | "syslog-tcp" => {
            ("syslog".to_string(), format!("Send syslog messages to test endpoint. Token: {}", token))
        }
        "http" => {
            ("http".to_string(), format!("POST NDJSON to test endpoint. Token: {}", token))
        }
        _ => {
            return Err(PipelineError::validation(format!("Unsupported transport: {}", transport)));
        }
    };
    
    // Store test token
    let insert_sql = "INSERT INTO dev.test_connection_tokens (token, tenant_id, source_id, mode) VALUES (?, ?, ?, ?)";
    state.ch.query(insert_sql)
        .bind(token.clone())
        .bind("1".to_string())
        .bind(source_id.clone())
        .bind(mode.clone())
        .execute()
        .await?;
    
    let response = TestConnectionResponse {
        mode,
        token,
        instructions,
        expires_at: expires_at.to_rfc3339(),
    };
    
    Ok(Json(serde_json::to_value(response)?))
}

pub async fn test_sample(
    State(state): State<Arc<AppState>>,
    Path(_source_id): Path<String>,
    Json(req): Json<TestSampleRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    // Get source details including parser
    let sql = "SELECT parser_id FROM dev.log_sources_admin WHERE source_id = ?";
    let parser_id: Option<String> = state.ch.query(sql).fetch_optional::<String>().await?;
    let _parser_id = parser_id.ok_or_else(|| PipelineError::not_found("Source not found"))?;
    
    // TODO: Implement actual normalization logic
    // For now, return placeholder response
    let response = TestSampleResponse {
        normalized: format!("Normalized: {}", req.sample),
        warnings: vec!["Parser not implemented yet".to_string()],
        iocs: None,
    };
    
    Ok(Json(serde_json::to_value(response)?))
}

pub async fn tail_test_connection(
    State(state): State<Arc<AppState>>,
    Path((_source_id, token)): Path<(String, String)>,
) -> Result<Sse<Pin<Box<dyn Stream<Item = Result<Event, std::convert::Infallible>> + Send>>>, PipelineError> {
    // Verify token is valid and not expired
    let sql = "SELECT * FROM dev.test_connection_tokens WHERE token = ? AND expires_at > now()";
    let exists: Option<u8> = state.ch.query(sql).fetch_optional::<u8>().await?;
    if exists.is_none() { return Err(PipelineError::validation("Invalid or expired token")); }
    
    // Create SSE stream
    let (tx, mut rx) = mpsc::channel(100);
    
    // Spawn task to send test data
    let token_clone = token.clone();
    tokio::spawn(async move {
        for i in 0..10 {
            let event = Event::default()
                .data(format!("Test message {} for token {}", i, token_clone));
            
            if tx.send(Ok(event)).await.is_err() {
                break;
            }
            
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
    });
    
    let stream = async_stream::stream! {
        while let Some(event) = rx.recv().await {
            yield event;
        }
    };
    
    Ok(Sse::new(Box::pin(stream)))
}
