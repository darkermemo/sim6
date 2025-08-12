use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response, sse::Event, sse::Sse},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::pin::Pin;
use futures::stream::Stream;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::v2::{AppError, AppState};

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
) -> Result<Response, AppError> {
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
    
    let mut result = state.clickhouse.query(&sql, &params).await?;
    
    let mut sources = Vec::new();
    while let Some(row) = result.next().await? {
        sources.push(LogSource {
            tenant_id: row.get("tenant_id")?,
            source_id: row.get("source_id")?,
            name: row.get("name")?,
            kind: row.get("kind")?,
            transport: row.get("transport")?,
            endpoint: row.get("endpoint")?,
            parser_id: row.get("parser_id")?,
            status: row.get("status")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        });
    }
    
    // Get total count
    let count_sql = "SELECT count() as total FROM dev.log_sources_admin WHERE 1=1";
    let mut count_result = state.clickhouse.query(count_sql, &[]).await?;
    let total: u64 = if let Some(row) = count_result.next().await? {
        row.get("total")?
    } else {
        0
    };
    
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
    
    Ok(Json(response).into_response())
}

pub async fn create_source(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSourceRequest>,
) -> Result<Response, AppError> {
    let source_id = req.source_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let parser_id = req.parser_id.unwrap_or_default();
    
    let insert_sql = "INSERT INTO dev.log_sources_admin (tenant_id, source_id, name, kind, transport, endpoint, parser_id) VALUES (?, ?, ?, ?, ?, ?, ?)";
    state.clickhouse.execute(insert_sql, &[
        req.tenant_id.to_string(),
        source_id.clone(),
        req.name.clone(),
        req.kind.clone(),
        req.transport.clone(),
        req.endpoint.clone(),
        parser_id.clone(),
    ]).await?;
    
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
    
    Ok(Json(source).into_response())
}

pub async fn update_source(
    State(state): State<Arc<AppState>>,
    Path(source_id): Path<String>,
    Json(req): Json<UpdateSourceRequest>,
) -> Result<Response, AppError> {
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
        return Err(AppError::BadRequest("No fields to update".to_string()));
    }
    
    updates.push("updated_at = ?");
    params.push(chrono::Utc::now().to_rfc3339());
    params.push(source_id.clone());
    
    let sql = format!(
        "ALTER TABLE dev.log_sources_admin UPDATE {} WHERE source_id = ?",
        updates.join(", ")
    );
    
    state.clickhouse.execute(&sql, &params).await?;
    
    Ok(StatusCode::OK.into_response())
}

pub async fn delete_source(
    State(state): State<Arc<AppState>>,
    Path(source_id): Path<String>,
) -> Result<Response, AppError> {
    let update_sql = "ALTER TABLE dev.log_sources_admin UPDATE status = 'DISABLED' WHERE source_id = ?";
    state.clickhouse.execute(update_sql, &[source_id.clone()]).await?;
    
    Ok(StatusCode::OK.into_response())
}

pub async fn test_connection(
    State(state): State<Arc<AppState>>,
    Path(source_id): Path<String>,
) -> Result<Response, AppError> {
    // Get source details
    let sql = "SELECT transport FROM dev.log_sources_admin WHERE source_id = ?";
    let mut result = state.clickhouse.query(sql, &[source_id.clone()]).await?;
    
    let transport: String = if let Some(row) = result.next().await? {
        row.get("transport")?
    } else {
        return Err(AppError::NotFound("Source not found".to_string()));
    };
    
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
            return Err(AppError::BadRequest(format!("Unsupported transport: {}", transport)));
        }
    };
    
    // Store test token
    let insert_sql = "INSERT INTO dev.test_connection_tokens (token, tenant_id, source_id, mode) VALUES (?, ?, ?, ?)";
    state.clickhouse.execute(insert_sql, &[
        token.clone(),
        "1".to_string(), // TODO: Get actual tenant_id
        source_id.clone(),
        mode.clone(),
    ]).await?;
    
    let response = TestConnectionResponse {
        mode,
        token,
        instructions,
        expires_at: expires_at.to_rfc3339(),
    };
    
    Ok(Json(response).into_response())
}

pub async fn test_sample(
    State(state): State<Arc<AppState>>,
    Path(source_id): Path<String>,
    Json(req): Json<TestSampleRequest>,
) -> Result<Response, AppError> {
    // Get source details including parser
    let sql = "SELECT parser_id FROM dev.log_sources_admin WHERE source_id = ?";
    let mut result = state.clickhouse.query(sql, &[source_id.clone()]).await?;
    
    let parser_id: String = if let Some(row) = result.next().await? {
        row.get("parser_id")?
    } else {
        return Err(AppError::NotFound("Source not found".to_string()));
    };
    
    // TODO: Implement actual normalization logic
    // For now, return placeholder response
    let response = TestSampleResponse {
        normalized: format!("Normalized: {}", req.sample),
        warnings: vec!["Parser not implemented yet".to_string()],
        iocs: None,
    };
    
    Ok(Json(response).into_response())
}

pub async fn tail_test_connection(
    State(state): State<Arc<AppState>>,
    Path((source_id, token)): Path<(String, String)>,
) -> Result<Sse<Pin<Box<dyn Stream<Item = Result<Event, AppError>> + Send>>>, AppError> {
    // Verify token is valid and not expired
    let sql = "SELECT * FROM dev.test_connection_tokens WHERE token = ? AND expires_at > now()";
    let mut result = state.clickhouse.query(sql, &[token.clone()]).await?;
    
    if result.next().await?.is_none() {
        return Err(AppError::BadRequest("Invalid or expired token".to_string()));
    }
    
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
