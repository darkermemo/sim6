use axum::{extract::{State, Path, Query}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;
use chrono::{Utc, TimeZone};

use crate::v2::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ListQ { pub tenant_id:String, pub q:Option<String>, pub limit:Option<u32>, pub cursor:Option<String> }

#[derive(Debug, Serialize)]
pub struct SavedRow { pub tenant_id:String, pub saved_id:String, pub name:String, pub updated_at:String }

#[derive(Debug, Serialize)]
pub struct ListResp { pub items: Vec<SavedRow>, pub next_cursor: Option<String> }

#[derive(Debug, Deserialize)]
pub struct CreateReq { pub tenant_id:String, pub name:String, pub dsl:serde_json::Value }
#[derive(Debug, Deserialize)]
pub struct UpdateReq { pub tenant_id:String, pub name:Option<String>, pub dsl:Option<serde_json::Value> }

#[derive(Debug, Serialize)]
pub struct OkId { pub ok: bool, pub saved_id: Option<String>, pub created_at: Option<String>, pub updated_at: Option<String> }

pub async fn list_saved(State(st): State<Arc<AppState>>, Query(q): Query<ListQ>) -> Result<Json<ListResp>, crate::error::PipelineError> {
    if q.tenant_id.trim().is_empty() { return Err(crate::error::PipelineError::validation("tenant_id required")); }
    let lim = q.limit.unwrap_or(50).min(200);
    let mut sql = String::from("SELECT tenant_id,saved_id,name,updated_at FROM dev.saved_searches WHERE tenant_id=? ");
    if q.q.as_deref().map(|s| !s.is_empty()).unwrap_or(false) { sql.push_str(" AND lower(name) LIKE lower(?) "); }
    sql.push_str(" ORDER BY updated_at DESC, saved_id DESC LIMIT ?");
    let mut qq = st.ch.query(&sql).bind(&q.tenant_id);
    if let Some(ref text)=q.q { if !text.is_empty(){ qq = qq.bind(format!("%{}%", text)); } }
    qq = qq.bind(lim as u64);
    let rows: Vec<(String,String,String,u32)> = qq.fetch_all().await.map_err(|e| crate::error::PipelineError::database(format!("list saved: {e}")))?;
    let mut items = Vec::new();
    for (tenant_id,saved_id,name,updated_at) in rows { items.push(SavedRow{ tenant_id, saved_id, name, updated_at: Utc.timestamp_opt(updated_at as i64,0).single().unwrap().to_rfc3339() }); }
    Ok(Json(ListResp{ items, next_cursor: None }))
}

pub async fn get_saved(State(st): State<Arc<AppState>>, Path(id): Path<String>, Query(q): Query<std::collections::HashMap<String,String>>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let tenant = q.get("tenant_id").cloned().ok_or_else(|| crate::error::PipelineError::validation("tenant_id required"))?;
    let row: Option<(String,String,String,String,u32)> = st.ch.query("SELECT tenant_id,saved_id,name,dsl,updated_at FROM dev.saved_searches WHERE tenant_id=? AND saved_id=? LIMIT 1").bind(&tenant).bind(&id).fetch_optional().await.map_err(|e| crate::error::PipelineError::database(format!("get saved: {e}")))?;
    if let Some((tenant_id,saved_id,name,dsl,updated_at)) = row {
        let v: serde_json::Value = serde_json::from_str(&dsl).unwrap_or(serde_json::json!({}));
        return Ok(Json(serde_json::json!({"tenant_id":tenant_id,"saved_id":saved_id,"name":name,"dsl":v,"updated_at":Utc.timestamp_opt(updated_at as i64,0).single().unwrap().to_rfc3339()})));
    }
    Err(crate::error::PipelineError::not_found("saved search not found"))
}

pub async fn create_saved(State(st): State<Arc<AppState>>, Json(b): Json<CreateReq>) -> Result<Json<OkId>, crate::error::PipelineError> {
    if b.name.trim().is_empty() { return Err(crate::error::PipelineError::validation("name required")); }
    let sid = Uuid::new_v4().to_string(); let now = Utc::now().timestamp() as u32;
    let dsl_s = b.dsl.to_string();
    st.ch.query("INSERT INTO dev.saved_searches (tenant_id,saved_id,name,dsl,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(&b.tenant_id).bind(&sid).bind(&b.name).bind(&dsl_s).bind(now).bind(now).execute().await.map_err(|e| crate::error::PipelineError::database(format!("saved insert: {e}")))?;
    Ok(Json(OkId{ ok:true, saved_id:Some(sid), created_at:Some(Utc.timestamp_opt(now as i64,0).single().unwrap().to_rfc3339()), updated_at: None }))
}

pub async fn update_saved(State(st): State<Arc<AppState>>, Path(id): Path<String>, Json(b): Json<UpdateReq>) -> Result<Json<OkId>, crate::error::PipelineError> {
    let mut sets: Vec<String> = Vec::new();
    if let Some(name)=b.name { sets.push(format!("name='{}'", name.replace("'","''"))); }
    if let Some(dsl)=b.dsl { sets.push(format!("dsl='{}'", dsl.to_string().replace("'","''"))); }
    if sets.is_empty(){ return Ok(Json(OkId{ ok:true, saved_id:Some(id), created_at:None, updated_at:None })); }
    sets.push("updated_at=toUInt32(now())".to_string());
    let sql = format!("ALTER TABLE dev.saved_searches UPDATE {} WHERE tenant_id='{}' AND saved_id='{}'", sets.join(","), b.tenant_id.replace("'","''"), id.replace("'","''"));
    st.ch.query(&sql).execute().await.map_err(|e| crate::error::PipelineError::database(format!("saved update: {e}")))?;
    Ok(Json(OkId{ ok:true, saved_id:Some(id), created_at:None, updated_at:Some(Utc::now().to_rfc3339()) }))
}

pub async fn delete_saved(State(st): State<Arc<AppState>>, Path(id): Path<String>, Query(q): Query<std::collections::HashMap<String,String>>) -> Result<Json<OkId>, crate::error::PipelineError> {
    let tenant = q.get("tenant_id").cloned().ok_or_else(|| crate::error::PipelineError::validation("tenant_id required"))?;
    st.ch.query("ALTER TABLE dev.saved_searches DELETE WHERE tenant_id=? AND saved_id=?").bind(&tenant).bind(&id).execute().await.map_err(|e| crate::error::PipelineError::database(format!("saved delete: {e}")))?;
    Ok(Json(OkId{ ok:true, saved_id:Some(id), created_at:None, updated_at:None }))
}


