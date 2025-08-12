use axum::{extract::{State, Path, Query}, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
// use base64::{engine::general_purpose, Engine as _};
use chrono::{TimeZone, Utc};
use uuid::Uuid;

use crate::v2::{state::AppState, metrics};

#[derive(Debug, Deserialize)]
pub struct ListQ { pub tenant_id:String, pub q:Option<String>, pub limit:Option<u32>, pub cursor:Option<String>, pub include_config:Option<u8> }

#[derive(Debug, Serialize)]
pub struct SourceRow { pub tenant_id:String, pub source_id:String, pub name:String, pub kind:String, pub enabled:u8, pub updated_at:String, pub config:String }

#[derive(Debug, Serialize)]
pub struct ListResp { pub items: Vec<SourceRow>, pub next_cursor: Option<String> }

fn redact_config(_: &str) -> String { "***".to_string() }

#[derive(Debug, Deserialize)]
pub struct CreateReq { pub tenant_id:String, pub source_id:Option<String>, pub name:String, pub kind:String, pub config:Value, pub enabled:Option<u8> }

#[derive(Debug, Deserialize)]
pub struct UpdateReq { pub tenant_id:String, pub name:String, pub kind:String, pub config:Value, pub enabled:Option<u8> }

#[derive(Debug, Serialize)]
pub struct OkId { pub ok: bool, pub source_id: Option<String>, pub created_at: Option<String>, pub updated_at: Option<String> }

fn validate_kind(k: &str) -> bool {
    matches!(k, "vector"|"syslog"|"http"|"s3"|"kafka"|"gcp_pubsub")
}

pub async fn list_sources(State(st): State<Arc<AppState>>, Query(q): Query<ListQ>) -> Result<Json<ListResp>, crate::error::PipelineError> {
    if q.tenant_id.trim().is_empty() { return Err(crate::error::PipelineError::validation("tenant_id required")); }
    let lim = q.limit.unwrap_or(50).min(200);
    let mut sql = String::from("SELECT tenant_id,source_id,name,kind,enabled,toUInt32(updated_at) as updated_at,config FROM dev.log_sources_admin WHERE tenant_id=? ");
    if q.q.as_deref().map(|s| !s.is_empty()).unwrap_or(false) { sql.push_str(" AND lower(name) LIKE lower(?) "); }
    sql.push_str(" ORDER BY updated_at DESC, source_id DESC LIMIT ?");
    let mut qq = st.ch.query(&sql).bind(&q.tenant_id);
    if let Some(ref text)=q.q { if !text.is_empty(){ qq = qq.bind(format!("%{}%", text)); } }
    qq = qq.bind(lim as u64);
    let rows: Vec<(String,String,String,String,u8,u32,String)> = qq.fetch_all().await.map_err(|e| crate::error::PipelineError::database(format!("list: {e}")))?;
    let include_conf = q.include_config.unwrap_or(0) == 1;
    let mut items: Vec<SourceRow> = Vec::new();
    for (tenant_id, source_id, name, kind, enabled, updated_at, config) in rows {
        let updated_iso = Utc.timestamp_opt(updated_at as i64, 0).single().unwrap_or_else(|| Utc.timestamp_opt(0,0).unwrap()).to_rfc3339();
        let cfg = if include_conf { config } else { redact_config("") };
        items.push(SourceRow{ tenant_id, source_id, name, kind, enabled, updated_at: updated_iso, config: cfg });
    }
    Ok(Json(ListResp{ items, next_cursor: None }))
}

pub async fn get_source(State(st): State<Arc<AppState>>, Path(id): Path<String>, Query(q): Query<std::collections::HashMap<String,String>>) -> Result<Json<SourceRow>, crate::error::PipelineError> {
    let tenant = q.get("tenant_id").cloned().ok_or_else(|| crate::error::PipelineError::validation("tenant_id required"))?;
    let include_conf = q.get("include_config").and_then(|v| v.parse::<u8>().ok()).unwrap_or(0) == 1;
    let row: Option<(String,String,String,String,u8,u32,String)> = st.ch
        .query("SELECT tenant_id,source_id,name,kind,enabled,toUInt32(updated_at) as updated_at,config FROM dev.log_sources_admin WHERE tenant_id=? AND source_id=? LIMIT 1")
        .bind(&tenant).bind(&id).fetch_optional().await.map_err(|e| crate::error::PipelineError::database(format!("get: {e}")))?;
    if let Some((tenant_id, source_id, name, kind, enabled, updated_at, config)) = row {
        let updated_iso = Utc.timestamp_opt(updated_at as i64, 0).single().unwrap().to_rfc3339();
        let cfg = if include_conf { config } else { redact_config("") };
        return Ok(Json(SourceRow{ tenant_id, source_id, name, kind, enabled, updated_at: updated_iso, config: cfg }));
    }
    Err(crate::error::PipelineError::not_found("log source not found"))
}

pub async fn create_source(State(st): State<Arc<AppState>>, Json(mut b): Json<CreateReq>) -> Result<Json<OkId>, crate::error::PipelineError> {
    if b.name.trim().is_empty() { return Err(crate::error::PipelineError::validation("name is required")); }
    if !validate_kind(&b.kind) { return Err(crate::error::PipelineError::validation("invalid kind")); }
    let conf_str = b.config.to_string(); if conf_str.len() > 32768 { return Err(crate::error::PipelineError::validation("config too large")); }
    let sid = if let Some(s)=b.source_id.take() { s } else { Uuid::new_v4().to_string() };
    // conflict check
    let exists: Option<()> = st.ch.query("SELECT 1 FROM dev.log_sources_admin WHERE tenant_id=? AND source_id=? LIMIT 1").bind(&b.tenant_id).bind(&sid).fetch_optional().await.map_err(|e| crate::error::PipelineError::database(format!("conflict: {e}")))?;
    if exists.is_some() { return Err(crate::error::PipelineError::ConflictError("source exists".into())); }
    let now = Utc::now().timestamp() as u32;
    let sql = "INSERT INTO dev.log_sources_admin (tenant_id,source_id,name,kind,config,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)";
    st.ch.query(sql).bind(&b.tenant_id).bind(&sid).bind(&b.name).bind(&b.kind).bind(&conf_str).bind(b.enabled.unwrap_or(1)).bind(now).bind(now).execute().await.map_err(|e| crate::error::PipelineError::database(format!("insert: {e}")))?;
    metrics::inc_admin_log_sources("created", &b.tenant_id);
    Ok(Json(OkId{ ok: true, source_id: Some(sid), created_at: Some(Utc.timestamp_opt(now as i64,0).single().unwrap().to_rfc3339()), updated_at: None }))
}

pub async fn update_source(State(st): State<Arc<AppState>>, Path(id): Path<String>, Json(b): Json<UpdateReq>) -> Result<Json<OkId>, crate::error::PipelineError> {
    if b.name.trim().is_empty() { return Err(crate::error::PipelineError::validation("name is required")); }
    if !validate_kind(&b.kind) { return Err(crate::error::PipelineError::validation("invalid kind")); }
    let conf_str = b.config.to_string(); if conf_str.len() > 32768 { return Err(crate::error::PipelineError::validation("config too large")); }
    let now = Utc::now().timestamp() as u32;
    let sql = "ALTER TABLE dev.log_sources_admin UPDATE name=?, kind=?, config=?, enabled=?, updated_at=? WHERE tenant_id=? AND source_id=?";
    st.ch.query(sql).bind(&b.name).bind(&b.kind).bind(&conf_str).bind(b.enabled.unwrap_or(1)).bind(now).bind(&b.tenant_id).bind(&id).execute().await.map_err(|e| crate::error::PipelineError::database(format!("update: {e}")))?;
    metrics::inc_admin_log_sources("updated", &b.tenant_id);
    Ok(Json(OkId{ ok: true, source_id: Some(id), created_at: None, updated_at: Some(Utc.timestamp_opt(now as i64,0).single().unwrap().to_rfc3339()) }))
}

pub async fn delete_source(State(st): State<Arc<AppState>>, Path(id): Path<String>, Query(q): Query<std::collections::HashMap<String,String>>) -> Result<Json<OkId>, crate::error::PipelineError> {
    let tenant = q.get("tenant_id").cloned().ok_or_else(|| crate::error::PipelineError::validation("tenant_id required"))?;
    let sql = "ALTER TABLE dev.log_sources_admin DELETE WHERE tenant_id=? AND source_id=?";
    st.ch.query(sql).bind(&tenant).bind(&id).execute().await.map_err(|e| crate::error::PipelineError::database(format!("delete: {e}")))?;
    metrics::inc_admin_log_sources("deleted", &tenant);
    Ok(Json(OkId{ ok: true, source_id: Some(id), created_at: None, updated_at: None }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn kind_validation() {
        assert!(validate_kind("vector"));
        assert!(!validate_kind("bad"));
    }
    #[test]
    fn redact() { assert_eq!(redact_config("anything"), "***"); }
}


