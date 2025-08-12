use axum::{extract::{Path, Query, State}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use clickhouse::Row;
use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};

#[derive(Serialize, Deserialize, Row, Clone)]
pub struct TenantRow { pub tenant_id:String, pub name:String, pub status:String, pub retention_days:u16, pub eps_quota:u32, pub burst_eps:u32, pub created_at:u32, pub updated_at:u32 }

#[derive(Deserialize)]
pub struct CreateTenant { pub tenant_id:String, pub name:String, pub retention_days:Option<u16>, pub eps_quota:Option<u32>, pub burst_eps:Option<u32> }

pub async fn create_tenant(State(st): State<Arc<AppState>>, Json(b): Json<CreateTenant>) -> PipelineResult<Json<serde_json::Value>> {
    let now = chrono::Utc::now().timestamp() as u32;
    let sql = format!("INSERT INTO dev.tenants (tenant_id,name,status,retention_days,eps_quota,burst_eps,created_at,updated_at) VALUES ('{}','{}','ACTIVE',{}, {}, {}, {}, {})",
        b.tenant_id.replace("'","''"), b.name.replace("'","''"), b.retention_days.unwrap_or(30), b.eps_quota.unwrap_or(5000), b.burst_eps.unwrap_or(10000), now, now);
    st.ch.query(&sql).execute().await.map_err(|e| PipelineError::database(format!("tenant create: {e}")))?;
    Ok(Json(serde_json::json!({"tenant_id": b.tenant_id})))
}

#[derive(Deserialize)]
pub struct TenantsQ { pub status: Option<String>, pub q: Option<String>, pub limit: Option<u32> }

pub async fn list_tenants(State(st): State<Arc<AppState>>, Query(q): Query<TenantsQ>) -> PipelineResult<Json<serde_json::Value>> {
    let mut where_clauses: Vec<&str> = Vec::new();
    if q.status.is_some() { where_clauses.push("status = ?"); }
    if q.q.as_deref().map(|s| !s.is_empty()).unwrap_or(false) { where_clauses.push("lower(name) LIKE lower(?)"); }
    let mut sql = String::from("SELECT * FROM dev.tenants");
    if !where_clauses.is_empty() { sql.push_str(" WHERE "); sql.push_str(&where_clauses.join(" AND ")); }
    let lim = q.limit.unwrap_or(50).min(200);
    sql.push_str(" ORDER BY updated_at DESC LIMIT ?");
    let mut qq = st.ch.query(&sql);
    if let Some(s)=q.status.as_ref() { qq = qq.bind(s); }
    if let Some(ref text)=q.q { if !text.is_empty(){ qq = qq.bind(format!("%{}%", text)); } }
    qq = qq.bind(lim as u64);
    let rows: Vec<TenantRow> = qq.fetch_all().await.map_err(|e| PipelineError::database(format!("tenants list: {e}")))?;
    Ok(Json(serde_json::json!({"items": rows, "next_cursor": null})))
}

pub async fn get_tenant(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> PipelineResult<Json<TenantRow>> {
    let row: Option<TenantRow> = st.ch.query("SELECT * FROM dev.tenants WHERE tenant_id=? LIMIT 1").bind(&id).fetch_optional().await
        .map_err(|e| PipelineError::database(format!("tenant get: {e}")))?;
    row.map(Json).ok_or_else(|| PipelineError::not_found("tenant not found"))
}

#[derive(Deserialize)]
pub struct PatchTenant { pub name:Option<String>, pub status:Option<String>, pub retention_days:Option<u16>, pub eps_quota:Option<u32>, pub burst_eps:Option<u32> }

pub async fn patch_tenant(State(st): State<Arc<AppState>>, Path(id): Path<String>, Json(b): Json<PatchTenant>) -> PipelineResult<Json<serde_json::Value>> {
    let mut sets: Vec<String> = Vec::new();
    if let Some(v)=b.name { sets.push(format!("name='{}'", v.replace("'","''"))); }
    if let Some(v)=b.status { sets.push(format!("status='{}'", v.replace("'","''"))); }
    if let Some(v)=b.retention_days { sets.push(format!("retention_days={}", v)); }
    if let Some(v)=b.eps_quota { sets.push(format!("eps_quota={}", v)); }
    if let Some(v)=b.burst_eps { sets.push(format!("burst_eps={}", v)); }
    if sets.is_empty() { return Ok(Json(serde_json::json!({"ok": true}))); }
    sets.push("updated_at=toUInt32(now())".to_string());
    let sql = format!("ALTER TABLE dev.tenants UPDATE {} WHERE tenant_id='{}'", sets.join(","), id.replace("'","''"));
    st.ch.query(&sql).execute().await.map_err(|e| PipelineError::database(format!("tenant patch: {e}")))?;
    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Deserialize, Serialize)]
pub struct TenantLimits { pub eps_limit: u32, pub burst_limit: u32, pub retention_days: u16 }

/// GET /api/v2/admin/tenants/:id/limits
#[axum::debug_handler]
pub async fn get_limits(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> PipelineResult<Json<TenantLimits>> {
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct L { eps_limit:u32, burst_limit:u32, retention_days:u16 }
    let row: Option<L> = st.ch.query("SELECT eps_limit,burst_limit,retention_days FROM dev.tenant_limits WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 1")
        .bind(&id).fetch_optional().await.map_err(|e| PipelineError::database(format!("limits get: {e}")))?;
    let l = row.map(|r| TenantLimits{ eps_limit:r.eps_limit, burst_limit:r.burst_limit, retention_days:r.retention_days })
        .unwrap_or(TenantLimits{ eps_limit:50, burst_limit:100, retention_days:30 });
    Ok(Json(l))
}

/// PUT /api/v2/admin/tenants/:id/limits
#[axum::debug_handler]
pub async fn put_limits(State(st): State<Arc<AppState>>, Path(id): Path<String>, Json(b): Json<TenantLimits>) -> PipelineResult<Json<serde_json::Value>> {
    let now = chrono::Utc::now().timestamp() as u32;
    let sql = format!(
        "INSERT INTO dev.tenant_limits (tenant_id,eps_limit,burst_limit,retention_days,updated_at) VALUES ('{}',{}, {}, {}, {})",
        id.replace("'","''"), b.eps_limit, b.burst_limit, b.retention_days, now);
    st.ch.query(&sql).execute().await.map_err(|e| PipelineError::database(format!("limits put: {e}")))?;
    Ok(Json(serde_json::json!({"ok": true})))
}

/// DELETE /api/v2/admin/tenants/:id — forbids deletion when tenant has data
pub async fn delete_tenant(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> PipelineResult<Json<serde_json::Value>> {
    // quick guard: if events or alerts exist, forbid
    let ev: Option<()> = st.ch.query("SELECT 1 FROM dev.events WHERE tenant_id=? LIMIT 1").bind(&id).fetch_optional().await.map_err(|e| PipelineError::database(format!("tenant del ev: {e}")))?;
    let al: Option<()> = st.ch.query("SELECT 1 FROM dev.alerts WHERE tenant_id=? LIMIT 1").bind(&id).fetch_optional().await.map_err(|e| PipelineError::database(format!("tenant del al: {e}")))?;
    let evp = ev.is_some();
    let alp = al.is_some();
    if evp || alp { return Err(PipelineError::AuthorizationError("tenant has data; cannot delete".into())); }
    st.ch.query("ALTER TABLE dev.tenants DELETE WHERE tenant_id=?").bind(&id).execute().await.map_err(|e| PipelineError::database(format!("tenant delete: {e}")))?;
    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Deserialize)]
pub struct EpsQ { pub tenant_id:String, pub window_minutes: Option<u32> }

pub async fn get_eps(State(st): State<Arc<AppState>>, Query(q): Query<EpsQ>) -> PipelineResult<Json<serde_json::Value>> {
    let window = q.window_minutes.unwrap_or(15);
    let sql = format!("SELECT sum(countMerge(c_state)) AS eps FROM dev.tenant_eps_minute WHERE tenant_id = '{}' AND ts_min >= now() - INTERVAL {} MINUTE",
        q.tenant_id.replace("'","''"), window);
    // ClickHouse client returns numeric; fetch as u64 via Row derive with single field
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct EpsRow { eps: u64 }
    let v: Option<EpsRow> = st.ch.query(&sql).fetch_optional().await
        .map_err(|e| PipelineError::database(format!("tenant eps: {e}")))?;
    let eps = v.map(|t| t.eps).unwrap_or(0);
    Ok(Json(serde_json::json!({"tenant_id": q.tenant_id, "window_minutes": window, "eps": eps})))
}


