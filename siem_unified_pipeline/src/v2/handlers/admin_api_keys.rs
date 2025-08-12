use axum::{extract::{State, Path, Query}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;
use chrono::{Utc, TimeZone};
use blake3;
use base64::Engine;

use crate::v2::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ListQ { pub tenant_id:String, pub q:Option<String>, pub limit:Option<u32> }

#[derive(Debug, Serialize)]
pub struct KeyRow { pub id:String, pub tenant_id:String, pub name:String, pub scopes: serde_json::Value, pub enabled:u8, pub created_at:String, pub updated_at:String }

#[derive(Debug, Serialize)]
pub struct ListResp { pub keys: Vec<KeyRow> }

#[derive(Debug, Deserialize)]
pub struct CreateReq { pub tenant_id:String, pub name:String, pub scopes:Vec<String>, pub enabled:Option<u8> }

#[derive(Debug, Deserialize)]
pub struct UpdateReq { pub tenant_id:String, pub name:Option<String>, pub scopes:Option<Vec<String>>, pub enabled:Option<u8> }

#[derive(Debug, Serialize)]
pub struct CreateResp { pub id:String, pub tenant_id:String, pub secret:String, pub status: &'static str }

#[derive(Debug, Serialize)]
pub struct OkResp { pub id:String, pub status: &'static str }

fn hash_token(token: &str) -> String {
    let h = blake3::hash(token.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(h.as_bytes())
}

pub async fn list_keys(State(st): State<Arc<AppState>>, Query(q): Query<ListQ>) -> Result<Json<ListResp>, crate::error::PipelineError> {
    if q.tenant_id.trim().is_empty() { return Err(crate::error::PipelineError::validation("tenant_id required")); }
    let lim = q.limit.unwrap_or(50).min(200) as u64;
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.api_keys_admin (id String, tenant_id String, name String, key_hash String, scopes Array(String), enabled UInt8, created_at UInt32, updated_at UInt32) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (id)").execute().await;
    let mut sql = String::from("SELECT id,tenant_id,name,scopes,enabled,created_at,updated_at FROM dev.api_keys_admin WHERE tenant_id=? ");
    if let Some(ref t)=q.q { if !t.is_empty() { sql.push_str(" AND lower(name) LIKE lower(?) "); } }
    sql.push_str(" ORDER BY updated_at DESC, id DESC LIMIT ?");
    let mut qq = st.ch.query(&sql).bind(&q.tenant_id);
    if let Some(ref t)=q.q { if !t.is_empty(){ qq = qq.bind(format!("%{}%", t)); } }
    qq = qq.bind(lim);
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct KeyFull { id:String, tenant_id:String, name:String, scopes:Vec<String>, enabled:u8, created_at:u32, updated_at:u32 }
    let rows: Vec<KeyFull> = qq.fetch_all().await.map_err(|e| crate::error::PipelineError::database(format!("list api keys: {e}")))?;
    let mut keys = Vec::new();
    for r in rows {
        keys.push(KeyRow{ id: r.id, tenant_id: r.tenant_id, name: r.name, scopes: serde_json::json!(r.scopes), enabled: r.enabled, created_at: Utc.timestamp_opt(r.created_at as i64,0).single().unwrap().to_rfc3339(), updated_at: Utc.timestamp_opt(r.updated_at as i64,0).single().unwrap().to_rfc3339() });
    }
    Ok(Json(ListResp{ keys }))
}

pub async fn get_key(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.api_keys_admin (id String, tenant_id String, name String, key_hash String, scopes Array(String), enabled UInt8, created_at UInt32, updated_at UInt32) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (id)").execute().await;
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct KeyFull { id:String, tenant_id:String, name:String, scopes:Vec<String>, enabled:u8, created_at:u32, updated_at:u32 }
    let row: Option<KeyFull> = st.ch
        .query("SELECT id,tenant_id,name,scopes,enabled,created_at,updated_at FROM dev.api_keys_admin WHERE id=? LIMIT 1")
        .bind(&id)
        .fetch_optional().await.map_err(|e| crate::error::PipelineError::database(format!("get api key: {e}")))?;
    if let Some(r) = row {
        return Ok(Json(serde_json::json!({
            "id": r.id,
            "tenant_id": r.tenant_id,
            "name": r.name,
            "scopes": r.scopes,
            "enabled": r.enabled,
            "created_at": Utc.timestamp_opt(r.created_at as i64,0).single().unwrap().to_rfc3339(),
            "updated_at": Utc.timestamp_opt(r.updated_at as i64,0).single().unwrap().to_rfc3339()
        })));
    }
    Err(crate::error::PipelineError::not_found("api key not found"))
}

pub async fn create_key(State(st): State<Arc<AppState>>, Json(b): Json<CreateReq>) -> Result<Json<CreateResp>, crate::error::PipelineError> {
    if b.name.trim().is_empty() { return Err(crate::error::PipelineError::validation("name required")); }
    if b.scopes.len() > 32 { return Err(crate::error::PipelineError::validation("too many scopes")); }
    let id = Uuid::new_v4().to_string();
    let secret = format!("ak_{}", Uuid::new_v4());
    let key_hash = hash_token(&secret);
    let now = Utc::now().timestamp() as u32;
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.api_keys_admin (id String, tenant_id String, name String, key_hash String, scopes Array(String), enabled UInt8, created_at UInt32, updated_at UInt32) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (id)").execute().await;
    st.ch.query("INSERT INTO dev.api_keys_admin (id,tenant_id,name,key_hash,scopes,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(&id)
        .bind(&b.tenant_id)
        .bind(&b.name)
        .bind(&key_hash)
        .bind(&b.scopes)
        .bind(b.enabled.unwrap_or(1))
        .bind(now)
        .bind(now)
        .execute().await.map_err(|e| crate::error::PipelineError::database(format!("api key insert: {e}")))?;
    Ok(Json(CreateResp{ id, tenant_id: b.tenant_id, secret, status: "created" }))
}

pub async fn update_key(State(st): State<Arc<AppState>>, Path(id): Path<String>, Json(b): Json<UpdateReq>) -> Result<Json<OkResp>, crate::error::PipelineError> {
    let mut sets: Vec<String> = Vec::new();
    if let Some(name)=b.name { sets.push(format!("name='{}'", name.replace("'","''"))); }
    if let Some(scopes)=b.scopes { sets.push(format!("scopes=[{}]", scopes.into_iter().map(|s| format!("'{}'", s.replace("'","''"))).collect::<Vec<_>>().join(","))); }
    if let Some(enabled)=b.enabled { sets.push(format!("enabled={}", enabled)); }
    if sets.is_empty(){ return Ok(Json(OkResp{ id, status: "updated" })); }
    sets.push("updated_at=toUInt32(now())".to_string());
    let sql = format!("ALTER TABLE dev.api_keys_admin UPDATE {} WHERE tenant_id='{}' AND id='{}'", sets.join(","), b.tenant_id.replace("'","''"), id.replace("'","''"));
    st.ch.query(&sql).execute().await.map_err(|e| crate::error::PipelineError::database(format!("api key update: {e}")))?;
    Ok(Json(OkResp{ id, status: "updated" }))
}

pub async fn delete_key(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> Result<Json<OkResp>, crate::error::PipelineError> {
    st.ch.query("ALTER TABLE dev.api_keys_admin DELETE WHERE id=?").bind(&id).execute().await.map_err(|e| crate::error::PipelineError::database(format!("api key delete: {e}")))?;
    Ok(Json(OkResp{ id, status: "deleted" }))
}

#[derive(Debug, Serialize)]
pub struct RotateResp { pub id:String, pub secret:String, pub status: &'static str }

pub async fn rotate_key(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> Result<Json<RotateResp>, crate::error::PipelineError> {
    let secret = format!("ak_{}", Uuid::new_v4());
    let key_hash = hash_token(&secret);
    let now = Utc::now().timestamp() as u32;
    let sql = "ALTER TABLE dev.api_keys_admin UPDATE key_hash=?, updated_at=? WHERE id=?";
    st.ch.query(sql).bind(&key_hash).bind(now).bind(&id).execute().await.map_err(|e| crate::error::PipelineError::database(format!("api key rotate: {e}")))?;
    Ok(Json(RotateResp{ id, secret, status: "rotated" }))
}


