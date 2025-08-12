use axum::{extract::{State, Path, Query}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;
use chrono::{Utc, TimeZone};
use sha2::{Digest, Sha256};

use crate::v2::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ListQ { pub tenant_id:String, pub q:Option<String>, pub limit:Option<u32> }

#[derive(Debug, Serialize)]
pub struct KeyRow { pub tenant_id:String, pub key_id:String, pub name:String, pub enabled:u8, pub updated_at:String }

#[derive(Debug, Serialize)]
pub struct ListResp { pub items: Vec<KeyRow> }

#[derive(Debug, Deserialize)]
pub struct CreateReq { pub tenant_id:String, pub name:String, pub scopes:Vec<String>, pub enabled:Option<u8> }

#[derive(Debug, Deserialize)]
pub struct UpdateReq { pub tenant_id:String, pub name:Option<String>, pub scopes:Option<Vec<String>>, pub enabled:Option<u8> }

#[derive(Debug, Serialize)]
pub struct CreateResp { pub ok: bool, pub key_id:String, pub token:String, pub created_at:String }

#[derive(Debug, Serialize)]
pub struct OkResp { pub ok: bool, pub key_id:String, pub updated_at: Option<String> }

fn hash_token(token: &str) -> String {
    let mut h = Sha256::new();
    h.update(token.as_bytes());
    let out = h.finalize();
    out.iter().map(|b| format!("{:02x}", b)).collect::<String>()
}

pub async fn list_keys(State(st): State<Arc<AppState>>, Query(q): Query<ListQ>) -> Result<Json<ListResp>, crate::error::PipelineError> {
    if q.tenant_id.trim().is_empty() { return Err(crate::error::PipelineError::validation("tenant_id required")); }
    let lim = q.limit.unwrap_or(50).min(200) as u64;
    let mut sql = String::from("SELECT tenant_id,key_id,name,enabled,updated_at FROM dev.api_keys WHERE tenant_id=? ");
    if let Some(ref t)=q.q { if !t.is_empty() { sql.push_str(" AND lower(name) LIKE lower(?) "); } }
    sql.push_str(" ORDER BY updated_at DESC, key_id DESC LIMIT ?");
    let mut qq = st.ch.query(&sql).bind(&q.tenant_id);
    if let Some(ref t)=q.q { if !t.is_empty(){ qq = qq.bind(format!("%{}%", t)); } }
    qq = qq.bind(lim);
    let rows: Vec<(String,String,String,u8,u32)> = qq.fetch_all().await.map_err(|e| crate::error::PipelineError::database(format!("list api keys: {e}")))?;
    let mut items = Vec::new();
    for (tenant_id,key_id,name,enabled,updated_at) in rows { items.push(KeyRow{ tenant_id, key_id, name, enabled, updated_at: Utc.timestamp_opt(updated_at as i64,0).single().unwrap().to_rfc3339() }); }
    Ok(Json(ListResp{ items }))
}

pub async fn get_key(State(st): State<Arc<AppState>>, Path(key_id): Path<String>, Query(q): Query<std::collections::HashMap<String,String>>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let tenant = q.get("tenant_id").cloned().ok_or_else(|| crate::error::PipelineError::validation("tenant_id required"))?;
    let row: Option<(String,String,String,String,u8,u32,u32)> = st.ch
        .query("SELECT tenant_id,key_id,name,scopes,enabled,created_at,updated_at FROM dev.api_keys WHERE tenant_id=? AND key_id=? LIMIT 1")
        .bind(&tenant).bind(&key_id)
        .fetch_optional().await.map_err(|e| crate::error::PipelineError::database(format!("get api key: {e}")))?;
    if let Some((tenant_id,key_id,name,scopes,enabled,created_at,updated_at)) = row {
        let scopes_v: serde_json::Value = serde_json::from_str(&scopes).unwrap_or(serde_json::json!([]));
        return Ok(Json(serde_json::json!({
            "tenant_id":tenant_id,
            "key_id":key_id,
            "name":name,
            "scopes":scopes_v,
            "enabled":enabled,
            "created_at": Utc.timestamp_opt(created_at as i64,0).single().unwrap().to_rfc3339(),
            "updated_at": Utc.timestamp_opt(updated_at as i64,0).single().unwrap().to_rfc3339()
        })));
    }
    Err(crate::error::PipelineError::not_found("api key not found"))
}

pub async fn create_key(State(st): State<Arc<AppState>>, Json(b): Json<CreateReq>) -> Result<Json<CreateResp>, crate::error::PipelineError> {
    if b.name.trim().is_empty() { return Err(crate::error::PipelineError::validation("name required")); }
    if b.scopes.len() > 32 { return Err(crate::error::PipelineError::validation("too many scopes")); }
    let kid = Uuid::new_v4().to_string();
    let token = format!("ak_{}", Uuid::new_v4());
    let token_hash = hash_token(&token);
    let scopes_s = serde_json::to_string(&b.scopes).unwrap_or("[]".to_string());
    let now = Utc::now().timestamp() as u32;
    st.ch.query("INSERT INTO dev.api_keys (tenant_id,key_id,name,token_hash,scopes,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(&b.tenant_id)
        .bind(&kid)
        .bind(&b.name)
        .bind(&token_hash)
        .bind(&scopes_s)
        .bind(b.enabled.unwrap_or(1))
        .bind(now)
        .bind(now)
        .execute().await.map_err(|e| crate::error::PipelineError::database(format!("api key insert: {e}")))?;
    Ok(Json(CreateResp{ ok:true, key_id:kid.clone(), token, created_at: Utc.timestamp_opt(now as i64,0).single().unwrap().to_rfc3339() }))
}

pub async fn update_key(State(st): State<Arc<AppState>>, Path(key_id): Path<String>, Json(b): Json<UpdateReq>) -> Result<Json<OkResp>, crate::error::PipelineError> {
    let mut sets: Vec<String> = Vec::new();
    if let Some(name)=b.name { sets.push(format!("name='{}'", name.replace("'","''"))); }
    if let Some(scopes)=b.scopes { sets.push(format!("scopes='{}'", serde_json::to_string(&scopes).unwrap_or("[]".to_string()).replace("'","''"))); }
    if let Some(enabled)=b.enabled { sets.push(format!("enabled={}", enabled)); }
    if sets.is_empty(){ return Ok(Json(OkResp{ ok:true, key_id, updated_at: None })); }
    sets.push("updated_at=toUInt32(now())".to_string());
    let sql = format!("ALTER TABLE dev.api_keys UPDATE {} WHERE tenant_id='{}' AND key_id='{}'", sets.join(","), b.tenant_id.replace("'","''"), key_id.replace("'","''"));
    st.ch.query(&sql).execute().await.map_err(|e| crate::error::PipelineError::database(format!("api key update: {e}")))?;
    Ok(Json(OkResp{ ok:true, key_id, updated_at: Some(Utc::now().to_rfc3339()) }))
}

pub async fn delete_key(State(st): State<Arc<AppState>>, Path(key_id): Path<String>, Query(q): Query<std::collections::HashMap<String,String>>) -> Result<Json<OkResp>, crate::error::PipelineError> {
    let tenant = q.get("tenant_id").cloned().ok_or_else(|| crate::error::PipelineError::validation("tenant_id required"))?;
    st.ch.query("ALTER TABLE dev.api_keys DELETE WHERE tenant_id=? AND key_id=?").bind(&tenant).bind(&key_id).execute().await.map_err(|e| crate::error::PipelineError::database(format!("api key delete: {e}")))?;
    Ok(Json(OkResp{ ok:true, key_id, updated_at: None }))
}


