use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;
use blake3::Hasher;

use crate::v2::{AppError, AppState};
use crate::v2::metrics;

#[derive(Debug, Deserialize)]
pub struct ListApiKeysQuery {
    pub cursor: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateApiKeyRequest {
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct ApiKey {
    pub tenant_id: u64,
    pub key_id: String,
    pub prefix: String,
    pub role: String,
    pub created_at: String,
    pub last_used_at: String,
    pub revoked: bool,
}

#[derive(Debug, Serialize)]
pub struct CreateApiKeyResponse {
    pub key_id: String,
    pub prefix: String,
    pub secret: String, // Only returned once
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct ListApiKeysResponse {
    pub keys: Vec<ApiKey>,
    pub next_cursor: Option<String>,
    pub total: u64,
}

pub async fn list_api_keys(
    State(state): State<Arc<AppState>>,
    Path(tenant_id): Path<u64>,
    Query(query): Query<ListApiKeysQuery>,
) -> Result<Response, AppError> {
    let limit = query.limit.unwrap_or(50).min(100);
    let offset = query.cursor.and_then(|c| c.parse::<u64>().ok()).unwrap_or(0);
    
    let sql = "SELECT tenant_id, key_id, prefix, role, created_at, last_used_at, revoked FROM dev.api_keys WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?";
    let mut result = state.clickhouse.query(sql, &[
        tenant_id.to_string(),
        limit.to_string(),
        offset.to_string(),
    ]).await?;
    
    let mut keys = Vec::new();
    while let Some(row) = result.next().await? {
        keys.push(ApiKey {
            tenant_id: row.get("tenant_id")?,
            key_id: row.get("key_id")?,
            prefix: row.get("prefix")?,
            role: row.get("role")?,
            created_at: row.get("created_at")?,
            last_used_at: row.get("last_used_at")?,
            revoked: row.get("revoked")? == 1,
        });
    }
    
    // Get total count
    let count_sql = "SELECT count() as total FROM dev.api_keys WHERE tenant_id = ?";
    let mut count_result = state.clickhouse.query(count_sql, &[tenant_id.to_string()]).await?;
    let total: u64 = if let Some(row) = count_result.next().await? {
        row.get("total")?
    } else {
        0
    };
    
    let next_cursor = if keys.len() == limit as usize {
        Some((offset + limit).to_string())
    } else {
        None
    };
    
    let response = ListApiKeysResponse {
        keys,
        next_cursor,
        total,
    };
    
    Ok(Json(response).into_response())
}

pub async fn create_api_key(
    State(state): State<Arc<AppState>>,
    Path(tenant_id): Path<u64>,
    Json(req): Json<CreateApiKeyRequest>,
) -> Result<Response, AppError> {
    let key_id = Uuid::new_v4().to_string();
    let secret = Uuid::new_v4().to_string();
    let prefix = secret[..8].to_string();
    
    // Hash the secret with blake3
    let mut hasher = Hasher::new();
    hasher.update(secret.as_bytes());
    let hash = hasher.finalize().to_string();
    
    // Insert the API key
    let insert_sql = "INSERT INTO dev.api_keys (tenant_id, key_id, prefix, hash, role) VALUES (?, ?, ?, ?, ?)";
    state.clickhouse.execute(insert_sql, &[
        tenant_id.to_string(),
        key_id.clone(),
        prefix.clone(),
        hash,
        req.role.clone(),
    ]).await?;
    
    // Increment metrics
    metrics::increment_counter("siem_v2_admin_apikeys_total", &[("action", "create")]);
    
    let response = CreateApiKeyResponse {
        key_id,
        prefix,
        secret, // Only returned once
        role: req.role,
    };
    
    Ok(Json(response).into_response())
}

pub async fn revoke_api_key(
    State(state): State<Arc<AppState>>,
    Path((tenant_id, key_id)): Path<(u64, String)>,
) -> Result<Response, AppError> {
    let update_sql = "ALTER TABLE dev.api_keys UPDATE revoked = 1 WHERE tenant_id = ? AND key_id = ?";
    state.clickhouse.execute(update_sql, &[
        tenant_id.to_string(),
        key_id.clone(),
    ]).await?;
    
    // Increment metrics
    metrics::increment_counter("siem_v2_admin_apikeys_total", &[("action", "revoke")]);
    
    Ok(StatusCode::OK.into_response())
}
