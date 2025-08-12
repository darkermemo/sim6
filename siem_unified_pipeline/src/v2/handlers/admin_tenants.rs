use axum::{extract::{Path, Query, State}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use clickhouse::Row;
use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};
use chrono::Utc;
use crate::v2::metrics;

#[derive(Serialize, Deserialize, Row, Clone)]
pub struct TenantRow { pub id:String, pub name:String, pub enabled:u8, pub created_at:u32, pub updated_at:u32 }

#[derive(Deserialize)]
pub struct CreateTenant { pub id:String, pub name:String, pub enabled:Option<u8> }

pub async fn create_tenant(State(st): State<Arc<AppState>>, Json(b): Json<CreateTenant>) -> PipelineResult<Json<serde_json::Value>> {
    let now = Utc::now().timestamp() as u32;
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.tenants_admin (id String, name String, enabled UInt8, created_at UInt32, updated_at UInt32) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (id)").execute().await;
    let ins = format!(
        "INSERT INTO dev.tenants_admin (id,name,enabled,created_at,updated_at) VALUES ('{}','{}',{}, {}, {})",
        b.id.replace("'","''"), b.name.replace("'","''"), b.enabled.unwrap_or(1), now, now
    );
    st.ch.query(&ins).execute().await.map_err(|e| PipelineError::database(format!("tenant create: {e}")))?;
    metrics::inc_admin_write("tenants","created");
    Ok(Json(serde_json::json!({"id": b.id, "status": "created"})))
}

#[derive(Deserialize)]
pub struct TenantsQ { pub q: Option<String>, pub limit: Option<u32> }

pub async fn list_tenants(State(st): State<Arc<AppState>>, Query(q): Query<TenantsQ>) -> PipelineResult<Json<serde_json::Value>> {
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.tenants_admin (id String, name String, enabled UInt8, created_at UInt32, updated_at UInt32) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (id)").execute().await;
    let mut sql = String::from("SELECT id,name,enabled,created_at,updated_at FROM dev.tenants_admin");
    if q.q.as_deref().map(|s| !s.is_empty()).unwrap_or(false) { sql.push_str(" WHERE lower(name) LIKE lower(?) "); }
    let lim = q.limit.unwrap_or(50).min(200);
    sql.push_str(" ORDER BY updated_at DESC LIMIT ?");
    let mut qq = st.ch.query(&sql);
    if let Some(ref text)=q.q { if !text.is_empty(){ qq = qq.bind(format!("%{}%", text)); } }
    qq = qq.bind(lim as u64);
    let rows: Vec<TenantRow> = qq.fetch_all().await.map_err(|e| PipelineError::database(format!("tenants list: {e}")))?;
    Ok(Json(serde_json::json!({"tenants": rows})))
}

pub async fn get_tenant(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> PipelineResult<Json<TenantRow>> {
    let row: Option<TenantRow> = st.ch.query("SELECT id,name,enabled,created_at,updated_at FROM dev.tenants_admin WHERE id=? LIMIT 1").bind(&id).fetch_optional().await
        .map_err(|e| PipelineError::database(format!("tenant get: {e}")))?;
    row.map(Json).ok_or_else(|| PipelineError::not_found("tenant not found"))
}

#[derive(Deserialize)]
pub struct PatchTenant { pub id:Option<String>, pub name:Option<String>, pub enabled:Option<u8> }

pub async fn patch_tenant(State(st): State<Arc<AppState>>, Path(id): Path<String>, Json(b): Json<PatchTenant>) -> PipelineResult<Json<serde_json::Value>> {
    if let Some(ref v) = b.id { if v != &id { return Err(PipelineError::validation("id mismatch")); } }
    let mut sets: Vec<String> = Vec::new();
    if let Some(v)=b.name { sets.push(format!("name='{}'", v.replace("'","''"))); }
    if let Some(v)=b.enabled { sets.push(format!("enabled={}", v)); }
    if sets.is_empty() { return Ok(Json(serde_json::json!({"id": id, "status": "updated"}))); }
    sets.push("updated_at=toUInt32(now())".to_string());
    let sql = format!("ALTER TABLE dev.tenants_admin UPDATE {} WHERE id='{}'", sets.join(","), id.replace("'","''"));
    st.ch.query(&sql).execute().await.map_err(|e| PipelineError::database(format!("tenant update: {e}")))?;
    metrics::inc_admin_write("tenants","updated");
    Ok(Json(serde_json::json!({"id": id, "status": "updated"})))
}

#[derive(Deserialize, Serialize)]
pub struct TenantLimits { pub eps_limit: u32, pub burst_limit: u32, pub retention_days: u16 }

/// GET /api/v2/admin/tenants/:id/limits
#[axum::debug_handler]
pub async fn get_limits(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> PipelineResult<Json<TenantLimits>> {
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct L { eps_limit:u32, burst_limit:u32, retention_days:u16 }
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.tenant_limits_admin (tenant_id String, eps_limit UInt32, burst_limit UInt32, retention_days UInt16, updated_at UInt32) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (tenant_id)").execute().await;
    let row: Option<L> = st.ch.query("SELECT eps_limit,burst_limit,retention_days FROM dev.tenant_limits_admin WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 1")
        .bind(&id).fetch_optional().await.map_err(|e| PipelineError::database(format!("limits get: {e}")))?;
    let l = row.map(|r| TenantLimits{ eps_limit:r.eps_limit, burst_limit:r.burst_limit, retention_days:r.retention_days })
        .unwrap_or(TenantLimits{ eps_limit:50, burst_limit:100, retention_days:30 });
    Ok(Json(l))
}

/// PUT /api/v2/admin/tenants/:id/limits
#[axum::debug_handler]
pub async fn put_limits(State(st): State<Arc<AppState>>, Path(id): Path<String>, Json(b): Json<TenantLimits>) -> PipelineResult<Json<serde_json::Value>> {
    let now = Utc::now().timestamp() as u32;
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.tenant_limits_admin (tenant_id String, eps_limit UInt32, burst_limit UInt32, retention_days UInt16, updated_at UInt32) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (tenant_id)").execute().await;
    let sql = format!(
        "INSERT INTO dev.tenant_limits_admin (tenant_id,eps_limit,burst_limit,retention_days,updated_at) VALUES ('{}',{}, {}, {}, {})",
        id.replace("'","''"), b.eps_limit, b.burst_limit, b.retention_days, now);
    st.ch.query(&sql).execute().await.map_err(|e| PipelineError::database(format!("limits put: {e}")))?;
    metrics::inc_admin_write("tenants","limits_updated");
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
    st.ch.query("ALTER TABLE dev.tenants_admin DELETE WHERE id=?").bind(&id).execute().await.map_err(|e| PipelineError::database(format!("tenant delete: {e}")))?;
    metrics::inc_admin_write("tenants","deleted");
    Ok(Json(serde_json::json!({"id": id, "status": "deleted"})))
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

#[derive(Deserialize)]
pub struct ApiKeyListQ { pub tenant_id: String, pub limit: Option<u32> }

#[derive(Serialize, Deserialize, clickhouse::Row)]
pub struct ApiKeyRow {
    pub key_id: String,
    pub tenant_id: String,
    pub name: String,
    pub permissions: String,
    pub created_at: u32,
    pub last_used: Option<u32>,
    pub enabled: bool
}

pub async fn list_api_keys(
    State(st): State<Arc<AppState>>,
    Query(q): Query<ApiKeyListQ>
) -> PipelineResult<Json<serde_json::Value>> {
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.tenant_api_keys (key_id String, tenant_id String, name String, permissions String, created_at UInt32, last_used UInt32, enabled UInt8) ENGINE = ReplacingMergeTree(created_at) ORDER BY (tenant_id, key_id)").execute().await;
    
    let limit = q.limit.unwrap_or(50).min(200);
    let sql = "SELECT key_id, tenant_id, name, permissions, created_at, last_used, enabled FROM dev.tenant_api_keys WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?";
    
    let rows: Vec<ApiKeyRow> = st.ch.query(sql)
        .bind(&q.tenant_id)
        .bind(limit as u64)
        .fetch_all()
        .await
        .map_err(|e| PipelineError::database(format!("list api keys: {e}")))?;
    
    Ok(Json(serde_json::json!({
        "api_keys": rows,
        "total": rows.len()
    })))
}

#[derive(Deserialize)]
pub struct CreateApiKeyRequest {
    pub tenant_id: String,
    pub name: String,
    pub permissions: String
}

#[derive(Serialize)]
pub struct CreateApiKeyResponse {
    pub key_id: String,
    pub api_key: String,
    pub status: String
}

pub async fn create_api_key(
    State(st): State<Arc<AppState>>,
    Json(body): Json<CreateApiKeyRequest>
) -> PipelineResult<Json<CreateApiKeyResponse>> {
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.tenant_api_keys (key_id String, tenant_id String, name String, permissions String, created_at UInt32, last_used UInt32, enabled UInt8) ENGINE = ReplacingMergeTree(created_at) ORDER BY (tenant_id, key_id)").execute().await;
    
    let key_id = uuid::Uuid::new_v4().to_string();
    let api_key = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp() as u32;
    
    let sql = "INSERT INTO dev.tenant_api_keys (key_id, tenant_id, name, permissions, created_at, last_used, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)";
    
    st.ch.query(sql)
        .bind(&key_id)
        .bind(&body.tenant_id)
        .bind(&body.name)
        .bind(&body.permissions)
        .bind(now)
        .bind(0u32) // last_used starts at 0
        .bind(1u8)  // enabled starts as true
        .execute()
        .await
        .map_err(|e| PipelineError::database(format!("create api key: {e}")))?;
    
    Ok(Json(CreateApiKeyResponse {
        key_id,
        api_key,
        status: "created".to_string()
    }))
}

pub async fn revoke_api_key(
    State(st): State<Arc<AppState>>,
    Path(tenant_id): Path<String>,
    Path(key_id): Path<String>
) -> PipelineResult<Json<serde_json::Value>> {
    let sql = "ALTER TABLE dev.tenant_api_keys UPDATE enabled = 0 WHERE tenant_id = ? AND key_id = ?";
    
    st.ch.query(sql)
        .bind(&tenant_id)
        .bind(&key_id)
        .execute()
        .await
        .map_err(|e| PipelineError::database(format!("revoke api key: {e}")))?;
    
    Ok(Json(serde_json::json!({
        "key_id": key_id,
        "status": "revoked"
    })))
}


