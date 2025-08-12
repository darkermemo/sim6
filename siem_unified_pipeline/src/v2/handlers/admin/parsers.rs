use axum::{extract::{Path, Query, State}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};

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
) -> PipelineResult<Json<serde_json::Value>> {
    let limit: u64 = 50;
    let offset: u64 = query.cursor.and_then(|c| c.parse::<u64>().ok()).unwrap_or(0);

    let like = query.q.unwrap_or_default();
    let sql = if like.is_empty() {
        r#"
        SELECT parser_id, name, version, kind, body, created_at
        FROM dev.parsers_admin
        ORDER BY parser_id, version DESC
        LIMIT {lim:UInt64} OFFSET {off:UInt64}
        "#
    } else {
        r#"
        SELECT parser_id, name, version, kind, body, created_at
        FROM dev.parsers_admin
        WHERE name ILIKE {s:String} OR kind ILIKE {s2:String}
        ORDER BY parser_id, version DESC
        LIMIT {lim:UInt64} OFFSET {off:UInt64}
        "#
    };

    let mut q = state.ch.query(sql).bind(limit).bind(offset);
    if !like.is_empty() {
        let wildcard = format!("%{}%", like);
        q = q.bind(&wildcard).bind(&wildcard);
    }

    #[derive(Deserialize, clickhouse::Row)]
    struct Row { parser_id: String, name: String, version: u32, kind: String, body: String, created_at: String }
    let rows: Vec<Row> = q.fetch_all().await?;

    let parsers: Vec<Parser> = rows
        .into_iter()
        .map(|r| Parser { parser_id: r.parser_id, name: r.name, version: r.version, kind: r.kind, body: r.body, created_at: r.created_at })
        .collect();

    // Count
    let total: u64 = state
        .ch
        .query("SELECT count() as total FROM dev.parsers_admin")
        .fetch_one::<u64>()
        .await
        .unwrap_or(0);

    let next_cursor = if parsers.len() as u64 == limit { Some((offset + limit).to_string()) } else { None };

    let response = ListParsersResponse { parsers, next_cursor, total };
    Ok(Json(serde_json::to_value(response)?))
}

pub async fn create_parser(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateParserRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    let parser_id = req.parser_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    
    // Get next version for this parser
    let version_sql = r#"SELECT toUInt32OrZero(max(version)) as max_version FROM dev.parsers_admin WHERE parser_id={id:String}"#;
    let max_version: u32 = state
        .ch
        .query(version_sql)
        .bind(&parser_id)
        .fetch_one::<u32>()
        .await?;
    let next_version: u32 = max_version + 1;
    
    state
        .ch
        .query(
            r#"
            INSERT INTO dev.parsers_admin (parser_id, name, version, kind, body)
            VALUES ({id:String},{name:String},{version:UInt32},{kind:String},{body:String})
            "#,
        )
        .bind(&parser_id)
        .bind(&req.name)
        .bind(next_version)
        .bind(&req.kind)
        .bind(&req.body)
        .execute()
        .await?;
    
    let parser = Parser {
        parser_id,
        name: req.name,
        version: next_version,
        kind: req.kind,
        body: req.body,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    
    Ok(Json(serde_json::to_value(parser)?))
}

pub async fn validate_parser(
    State(state): State<Arc<AppState>>,
    Path(parser_id): Path<String>,
    Query(query): Query<ValidateParserQuery>,
) -> PipelineResult<Json<serde_json::Value>> {
    let version = query.version.unwrap_or(0);

    let body: Option<String> = if version > 0 {
        state
            .ch
            .query("SELECT body FROM dev.parsers_admin WHERE parser_id={id:String} AND version={v:UInt32}")
            .bind(&parser_id)
            .bind(version)
            .fetch_optional::<String>()
            .await?
    } else {
        state
            .ch
            .query("SELECT body FROM dev.parsers_admin WHERE parser_id={id:String} ORDER BY version DESC LIMIT 1")
            .bind(&parser_id)
            .fetch_optional::<String>()
            .await?
    };
    let _body = body.ok_or_else(|| PipelineError::not_found("Parser not found"))?;
    
    // TODO: Implement actual parser validation logic
    // For now, return placeholder validation
    let response = ValidateParserResponse {
        valid: true,
        errors: Vec::new(),
        warnings: vec!["Parser validation not fully implemented yet".to_string()],
    };
    
    Ok(Json(serde_json::to_value(response)?))
}

pub async fn test_sample(
    State(state): State<Arc<AppState>>,
    Path(parser_id): Path<String>,
    Json(req): Json<TestSampleRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    // Get parser body
    #[derive(Deserialize, clickhouse::Row)]
    struct BK { body: String, kind: String }
    let bk: Option<BK> = state
        .ch
        .query("SELECT body, kind FROM dev.parsers_admin WHERE parser_id={id:String} ORDER BY version DESC LIMIT 1")
        .bind(&parser_id)
        .fetch_optional::<BK>()
        .await?;
    let bk = bk.ok_or_else(|| PipelineError::not_found("Parser not found"))?;
    let (_body, kind) = (bk.body, bk.kind);
    
    // TODO: Implement actual normalization logic based on parser kind and body
    // For now, return placeholder response
    let response = TestSampleResponse {
        normalized: format!("Normalized using {} parser: {}", kind, req.sample),
        warnings: vec!["Parser execution not fully implemented yet".to_string()],
        iocs: None,
    };
    
    Ok(Json(serde_json::to_value(response)?))
}

pub async fn delete_parser(
    State(state): State<Arc<AppState>>,
    Path(parser_id): Path<String>,
    Query(query): Query<ValidateParserQuery>,
) -> PipelineResult<Json<serde_json::Value>> {
    let version = query.version.unwrap_or(0);
    
    if version > 0 {
        state
            .ch
            .query("ALTER TABLE dev.parsers_admin DELETE WHERE parser_id={id:String} AND version={v:UInt32}")
            .bind(&parser_id)
            .bind(version)
            .execute()
            .await?;
    } else {
        state
            .ch
            .query(
                "ALTER TABLE dev.parsers_admin DELETE WHERE parser_id={id:String} AND version=(SELECT max(version) FROM dev.parsers_admin WHERE parser_id={id2:String})",
            )
            .bind(&parser_id)
            .bind(&parser_id)
            .execute()
            .await?;
    }
    
    Ok(Json(serde_json::json!({"status": "ok"})))
}
