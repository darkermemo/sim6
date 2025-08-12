use axum::{extract::{Path, Query, State}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use chrono::Utc;
use clickhouse::Row;
use crate::v2::{state::AppState, metrics};

#[derive(Debug, Serialize, Deserialize, Clone, Row)]
pub struct UserRow {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub role: String,
    pub tenant_ids: Vec<String>,
    pub enabled: u8,
    pub created_at: u32,
    pub updated_at: u32,
}

#[derive(Debug, Deserialize)]
pub struct CreateUser {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub role: String,
    pub tenant_ids: Vec<String>,
    pub enabled: Option<u8>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUser {
    pub id: Option<String>,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub role: Option<String>,
    pub tenant_ids: Option<Vec<String>>,
    pub enabled: Option<u8>,
}

#[derive(Debug, Deserialize)]
pub struct ListQ { pub limit: Option<u32>, pub tenant_id: Option<String>, pub q: Option<String> }

#[derive(Debug, Serialize)]
pub struct ListResp { pub users: Vec<UserRow> }

fn is_valid_role(role: &str) -> bool {
    matches!(role, "admin" | "analyst" | "viewer")
}

pub async fn create_user(State(st): State<Arc<AppState>>, Json(b): Json<CreateUser>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    if !is_valid_role(&b.role) { return Err(crate::error::PipelineError::validation("invalid role")); }
    if b.email.trim().is_empty() { return Err(crate::error::PipelineError::validation("email required")); }
    let now = Utc::now().timestamp() as u32;
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.users_admin (id String, email String, display_name String, role LowCardinality(String), tenant_ids Array(String), enabled UInt8, created_at UInt32, updated_at UInt32) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (id)").execute().await;
    let sql = "INSERT INTO dev.users_admin (id,email,display_name,role,tenant_ids,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)";
    st.ch.query(sql)
        .bind(&b.id)
        .bind(&b.email)
        .bind(&b.display_name)
        .bind(&b.role)
        .bind(&b.tenant_ids)
        .bind(b.enabled.unwrap_or(1))
        .bind(now)
        .bind(now)
        .execute().await.map_err(|e| crate::error::PipelineError::database(format!("user insert: {e}")))?;
    metrics::inc_admin_write("users","created");
    Ok(Json(serde_json::json!({"id": b.id, "status": "created"})))
}

pub async fn list_users(State(st): State<Arc<AppState>>, Query(q): Query<ListQ>) -> Result<Json<ListResp>, crate::error::PipelineError> {
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.users_admin (id String, email String, display_name String, role LowCardinality(String), tenant_ids Array(String), enabled UInt8, created_at UInt32, updated_at UInt32) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (id)").execute().await;
    let mut sql = String::from("SELECT id,email,display_name,role,tenant_ids,enabled,created_at,updated_at FROM dev.users_admin");
    let mut first = true;
    if let Some(ref t) = q.tenant_id { if !t.is_empty() { sql.push_str(" WHERE has(tenant_ids, ?)"); first = false; } }
    if let Some(ref text) = q.q { if !text.is_empty() { sql.push_str(if first {" WHERE "} else {" AND "}); sql.push_str(" (lower(email) LIKE lower(?) OR lower(display_name) LIKE lower(?)) "); } }
    let lim = q.limit.unwrap_or(50).min(200) as u64;
    sql.push_str(" ORDER BY updated_at DESC, id DESC LIMIT ?");
    let mut qq = st.ch.query(&sql);
    if let Some(ref t) = q.tenant_id { if !t.is_empty() { qq = qq.bind(t); } }
    if let Some(ref text) = q.q { if !text.is_empty() { let p = format!("%{}%", text); qq = qq.bind(&p).bind(&p); } }
    qq = qq.bind(lim);
    let rows: Vec<UserRow> = qq.fetch_all().await.map_err(|e| crate::error::PipelineError::database(format!("users list: {e}")))?;
    Ok(Json(ListResp{ users: rows }))
}

pub async fn get_user(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> Result<Json<UserRow>, crate::error::PipelineError> {
    let row: Option<UserRow> = st.ch.query("SELECT id,email,display_name,role,tenant_ids,enabled,created_at,updated_at FROM dev.users_admin WHERE id=? LIMIT 1").bind(&id)
        .fetch_optional().await.map_err(|e| crate::error::PipelineError::database(format!("user get: {e}")))?;
    row.map(Json).ok_or_else(|| crate::error::PipelineError::not_found("user not found"))
}

pub async fn update_user(State(st): State<Arc<AppState>>, Path(id): Path<String>, Json(b): Json<UpdateUser>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    if let Some(ref v) = b.id { if v != &id { return Err(crate::error::PipelineError::validation("id mismatch")); } }
    if let Some(ref r) = b.role { if !is_valid_role(r) { return Err(crate::error::PipelineError::validation("invalid role")); } }
    let mut sets: Vec<String> = Vec::new();
    if let Some(v)=b.email { sets.push(format!("email='{}'", v.replace("'","''"))); }
    if let Some(v)=b.display_name { sets.push(format!("display_name='{}'", v.replace("'","''"))); }
    if let Some(v)=b.role { sets.push(format!("role='{}'", v.replace("'","''"))); }
    if let Some(v)=b.tenant_ids { sets.push(format!("tenant_ids={}", format!("[{}]", v.into_iter().map(|t| format!("'{}'", t.replace("'","''"))).collect::<Vec<_>>().join(",")))); }
    if let Some(v)=b.enabled { sets.push(format!("enabled={}", v)); }
    if sets.is_empty() { return Ok(Json(serde_json::json!({"id": id, "status":"updated"}))); }
    sets.push("updated_at=toUInt32(now())".to_string());
    let sql = format!("ALTER TABLE dev.users_admin UPDATE {} WHERE id='{}'", sets.join(","), id.replace("'","''"));
    st.ch.query(&sql).execute().await.map_err(|e| crate::error::PipelineError::database(format!("user update: {e}")))?;
    metrics::inc_admin_write("users","updated");
    Ok(Json(serde_json::json!({"id": id, "status":"updated"})))
}

pub async fn delete_user(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    st.ch.query("ALTER TABLE dev.users_admin DELETE WHERE id=?").bind(&id).execute().await.map_err(|e| crate::error::PipelineError::database(format!("user delete: {e}")))?;
    metrics::inc_admin_write("users","deleted");
    Ok(Json(serde_json::json!({"id": id, "status":"deleted"})))
}

#[cfg(test)]
mod tests {
    use super::is_valid_role;
    #[test]
    fn roles_validated() {
        assert!(is_valid_role("admin"));
        assert!(is_valid_role("analyst"));
        assert!(is_valid_role("viewer"));
        assert!(!is_valid_role("owner"));
    }
}


