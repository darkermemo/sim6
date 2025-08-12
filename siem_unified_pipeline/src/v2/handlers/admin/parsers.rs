use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::v2::{AppError, AppState};

#[derive(Debug, Deserialize)]
pub struct ListParsersQuery {
    pub cursor: Option<String>,
    pub q: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateParserRequest {
    pub parser_id: Option<String>,
    pub name: String,
    pub kind: String,
    pub body: String,
}

#[derive(Debug, Deserialize)]
pub struct ValidateParserQuery {
    pub version: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct TestSampleRequest {
    pub sample: String,
}

#[derive(Debug, Serialize)]
pub struct Parser {
    pub parser_id: String,
    pub name: String,
    pub version: u32,
    pub kind: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ListParsersResponse {
    pub parsers: Vec<Parser>,
    pub next_cursor: Option<String>,
    pub total: u64,
}

#[derive(Debug, Serialize)]
pub struct ValidateParserResponse {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct TestSampleResponse {
    pub normalized: String,
    pub warnings: Vec<String>,
    pub iocs: Option<Vec<String>>,
}

pub async fn list_parsers(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListParsersQuery>,
) -> Result<Response, AppError> {
    let limit = 50;
    let offset = query.cursor.and_then(|c| c.parse::<u64>().ok()).unwrap_or(0);
    
    let mut sql = "SELECT parser_id, name, version, kind, body, created_at FROM dev.parsers_admin WHERE 1=1".to_string();
    let mut params: Vec<String> = Vec::new();
    
    if let Some(search) = &query.q {
        sql.push_str(" AND (name ILIKE ? OR kind ILIKE ?)");
        params.push(format!("%{}%", search));
        params.push(format!("%{}%", search));
    }
    
    sql.push_str(&format!(" ORDER BY parser_id, version DESC LIMIT {} OFFSET {}", limit, offset));
    
    let mut result = state.clickhouse.query(&sql, &params).await?;
    
    let mut parsers = Vec::new();
    while let Some(row) = result.next().await? {
        parsers.push(Parser {
            parser_id: row.get("parser_id")?,
            name: row.get("name")?,
            version: row.get("version")?,
            kind: row.get("kind")?,
            body: row.get("body")?,
            created_at: row.get("created_at")?,
        });
    }
    
    // Get total count
    let count_sql = "SELECT count() as total FROM dev.parsers_admin WHERE 1=1";
    let mut count_result = state.clickhouse.query(count_sql, &[]).await?;
    let total: u64 = if let Some(row) = count_result.next().await? {
        row.get("total")?
    } else {
        0
    };
    
    let next_cursor = if parsers.len() == limit as usize {
        Some((offset + limit).to_string())
    } else {
        None
    };
    
    let response = ListParsersResponse {
        parsers,
        next_cursor,
        total,
    };
    
    Ok(Json(response).into_response())
}

pub async fn create_parser(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateParserRequest>,
) -> Result<Response, AppError> {
    let parser_id = req.parser_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    
    // Get next version for this parser
    let version_sql = "SELECT max(version) as max_version FROM dev.parsers_admin WHERE parser_id = ?";
    let mut version_result = state.clickhouse.query(version_sql, &[parser_id.clone()]).await?;
    
    let next_version: u32 = if let Some(row) = version_result.next().await? {
        row.get("max_version").unwrap_or(0) + 1
    } else {
        1
    };
    
    let insert_sql = "INSERT INTO dev.parsers_admin (parser_id, name, version, kind, body) VALUES (?, ?, ?, ?, ?)";
    state.clickhouse.execute(insert_sql, &[
        parser_id.clone(),
        req.name.clone(),
        next_version.to_string(),
        req.kind.clone(),
        req.body.clone(),
    ]).await?;
    
    let parser = Parser {
        parser_id,
        name: req.name,
        version: next_version,
        kind: req.kind,
        body: req.body,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    
    Ok(Json(parser).into_response())
}

pub async fn validate_parser(
    State(state): State<Arc<AppState>>,
    Path(parser_id): Path<String>,
    Query(query): Query<ValidateParserQuery>,
) -> Result<Response, AppError> {
    let version = query.version.unwrap_or(0);
    
    let sql = if version > 0 {
        "SELECT body FROM dev.parsers_admin WHERE parser_id = ? AND version = ?"
    } else {
        "SELECT body FROM dev.parsers_admin WHERE parser_id = ? ORDER BY version DESC LIMIT 1"
    };
    
    let params = if version > 0 {
        vec![parser_id.clone(), version.to_string()]
    } else {
        vec![parser_id.clone()]
    };
    
    let mut result = state.clickhouse.query(&sql, &params).await?;
    
    let body: String = if let Some(row) = result.next().await? {
        row.get("body")?
    } else {
        return Err(AppError::NotFound("Parser not found".to_string()));
    };
    
    // TODO: Implement actual parser validation logic
    // For now, return placeholder validation
    let response = ValidateParserResponse {
        valid: true,
        errors: Vec::new(),
        warnings: vec!["Parser validation not fully implemented yet".to_string()],
    };
    
    Ok(Json(response).into_response())
}

pub async fn test_sample(
    State(state): State<Arc<AppState>>,
    Path(parser_id): Path<String>,
    Json(req): Json<TestSampleRequest>,
) -> Result<Response, AppError> {
    // Get parser body
    let sql = "SELECT body, kind FROM dev.parsers_admin WHERE parser_id = ? ORDER BY version DESC LIMIT 1";
    let mut result = state.clickhouse.query(sql, &[parser_id.clone()]).await?;
    
    let (body, kind): (String, String) = if let Some(row) = result.next().await? {
        (row.get("body")?, row.get("kind")?)
    } else {
        return Err(AppError::NotFound("Parser not found".to_string()));
    };
    
    // TODO: Implement actual normalization logic based on parser kind and body
    // For now, return placeholder response
    let response = TestSampleResponse {
        normalized: format!("Normalized using {} parser: {}", kind, req.sample),
        warnings: vec!["Parser execution not fully implemented yet".to_string()],
        iocs: None,
    };
    
    Ok(Json(response).into_response())
}

pub async fn delete_parser(
    State(state): State<Arc<AppState>>,
    Path(parser_id): Path<String>,
    Query(query): Query<ValidateParserQuery>,
) -> Result<Response, AppError> {
    let version = query.version.unwrap_or(0);
    
    if version > 0 {
        // Delete specific version
        let delete_sql = "ALTER TABLE dev.parsers_admin DELETE WHERE parser_id = ? AND version = ?";
        state.clickhouse.execute(delete_sql, &[parser_id.clone(), version.to_string()]).await?;
    } else {
        // Soft delete by marking as inactive (would need status column)
        // For now, just delete the latest version
        let delete_sql = "ALTER TABLE dev.parsers_admin DELETE WHERE parser_id = ? AND version = (SELECT max(version) FROM dev.parsers_admin WHERE parser_id = ?)";
        state.clickhouse.execute(delete_sql, &[parser_id.clone(), parser_id.clone()]).await?;
    }
    
    Ok(StatusCode::OK.into_response())
}
