use axum::{extract::{Path, Query, State}, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;
use chrono::{Utc, TimeZone};

use crate::v2::{state::AppState, metrics};

fn redact_body(_: &str) -> String { "***".to_string() }

#[derive(Debug, Deserialize)]
pub struct ListQ { pub q: Option<String>, pub limit: Option<u32>, pub include_body: Option<u8> }

#[derive(Debug, Serialize)]
pub struct ParserRow { pub parser_id:String, pub name:String, pub version:u32, pub kind:String, pub enabled:u8, pub updated_at:String, pub body:String }

#[derive(Debug, Serialize)]
pub struct ListResp { pub items: Vec<ParserRow>, pub next_cursor: Option<String> }

#[derive(Debug, Deserialize)]
pub struct CreateReq { pub name:String, pub version:u32, pub kind:String, pub body:Value, pub samples: Vec<String>, pub enabled: Option<u8> }

#[derive(Debug, Deserialize)]
pub struct UpdateReq { pub name:String, pub version:u32, pub kind:String, pub body:Value, pub samples: Vec<String>, pub enabled: Option<u8> }

#[derive(Debug, Serialize)]
pub struct OkId { pub ok: bool, pub parser_id: Option<String>, pub created_at: Option<String>, pub updated_at: Option<String> }

pub async fn list_parsers(State(st): State<Arc<AppState>>, Query(q): Query<ListQ>) -> Result<Json<ListResp>, crate::error::PipelineError> {
    let lim = q.limit.unwrap_or(50).min(200);
    let mut sql = String::from("SELECT parser_id,name,version,kind,enabled,toUInt32(updated_at) as updated_at,body FROM dev.parsers_admin");
    if q.q.as_deref().map(|s| !s.is_empty()).unwrap_or(false) { sql.push_str(" WHERE lower(name) LIKE lower(?) "); }
    sql.push_str(" ORDER BY updated_at DESC, parser_id DESC LIMIT ?");
    let mut qq = st.ch.query(&sql);
    if let Some(ref text)=q.q { if !text.is_empty(){ qq = qq.bind(format!("%{}%", text)); } }
    qq = qq.bind(lim as u64);
    let rows: Vec<(String,String,u32,String,u8,u32,String)> = qq.fetch_all().await.map_err(|e| crate::error::PipelineError::database(format!("list parsers: {e}")))?;
    let include = q.include_body.unwrap_or(0) == 1;
    let mut items = Vec::new();
    for (parser_id,name,version,kind,enabled,updated_at,body) in rows {
        let upd = Utc.timestamp_opt(updated_at as i64,0).single().unwrap().to_rfc3339();
        items.push(ParserRow{ parser_id,name,version,kind,enabled,updated_at:upd, body: if include { body } else { redact_body("") } });
    }
    Ok(Json(ListResp{ items, next_cursor: None }))
}

pub async fn get_parser(State(st): State<Arc<AppState>>, Path(pid): Path<String>, Query(q): Query<std::collections::HashMap<String,String>>) -> Result<Json<ParserRow>, crate::error::PipelineError> {
    let include = q.get("include_body").and_then(|v| v.parse::<u8>().ok()).unwrap_or(0) == 1;
    let row: Option<(String,String,u32,String,u8,u32,String)> = st.ch.query("SELECT parser_id,name,version,kind,enabled,toUInt32(updated_at) as updated_at,body FROM dev.parsers_admin WHERE parser_id=? LIMIT 1").bind(&pid).fetch_optional().await.map_err(|e| crate::error::PipelineError::database(format!("get parser: {e}")))?;
    if let Some((parser_id,name,version,kind,enabled,updated_at,body)) = row {
        let upd = Utc.timestamp_opt(updated_at as i64,0).single().unwrap().to_rfc3339();
        return Ok(Json(ParserRow{ parser_id,name,version,kind,enabled,updated_at:upd, body: if include { body } else { redact_body("") } }));
    }
    Err(crate::error::PipelineError::not_found("parser not found"))
}

pub async fn create_parser(State(st): State<Arc<AppState>>, Json(b): Json<CreateReq>) -> Result<Json<OkId>, crate::error::PipelineError> {
    if b.name.trim().is_empty() { return Err(crate::error::PipelineError::validation("name required")); }
    if b.kind.trim().is_empty() { return Err(crate::error::PipelineError::validation("kind required")); }
    let body_s = b.body.to_string(); if body_s.len() > 131072 { return Err(crate::error::PipelineError::validation("body too large")); }
    let pid = Uuid::new_v4().to_string(); let now = Utc::now().timestamp() as u32;
    st.ch.query("INSERT INTO dev.parsers_admin (parser_id,name,version,kind,body,samples,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ")
        .bind(&pid).bind(&b.name).bind(b.version).bind(&b.kind).bind(&body_s).bind(Vec::<String>::new()).bind(b.enabled.unwrap_or(1)).bind(now).bind(now)
        .execute().await.map_err(|e| crate::error::PipelineError::database(format!("parser insert: {e}")))?;
    metrics::inc_admin_log_sources("created","-");
    Ok(Json(OkId{ ok:true, parser_id:Some(pid), created_at:Some(Utc.timestamp_opt(now as i64,0).single().unwrap().to_rfc3339()), updated_at: None }))
}

pub async fn update_parser(State(st): State<Arc<AppState>>, Path(pid): Path<String>, Json(b): Json<UpdateReq>) -> Result<Json<OkId>, crate::error::PipelineError> {
    if b.name.trim().is_empty() { return Err(crate::error::PipelineError::validation("name required")); }
    if b.kind.trim().is_empty() { return Err(crate::error::PipelineError::validation("kind required")); }
    let body_s = b.body.to_string(); if body_s.len() > 131072 { return Err(crate::error::PipelineError::validation("body too large")); }
    let now = Utc::now().timestamp() as u32;
    st.ch.query("ALTER TABLE dev.parsers_admin UPDATE name=?,version=?,kind=?,body=?,samples=?,enabled=?,updated_at=? WHERE parser_id=?")
        .bind(&b.name).bind(b.version).bind(&b.kind).bind(&body_s).bind(Vec::<String>::new()).bind(b.enabled.unwrap_or(1)).bind(now).bind(&pid)
        .execute().await.map_err(|e| crate::error::PipelineError::database(format!("parser update: {e}")))?;
    metrics::inc_admin_log_sources("updated","-");
    Ok(Json(OkId{ ok:true, parser_id:Some(pid), created_at:None, updated_at:Some(Utc.timestamp_opt(now as i64,0).single().unwrap().to_rfc3339()) }))
}

pub async fn delete_parser(State(st): State<Arc<AppState>>, Path(pid): Path<String>) -> Result<Json<OkId>, crate::error::PipelineError> {
    st.ch.query("ALTER TABLE dev.parsers_admin DELETE WHERE parser_id=?").bind(&pid).execute().await.map_err(|e| crate::error::PipelineError::database(format!("parser del: {e}")))?;
    metrics::inc_admin_log_sources("deleted","-");
    Ok(Json(OkId{ ok:true, parser_id:Some(pid), created_at:None, updated_at:None }))
}


