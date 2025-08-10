use axum::{extract::{Path, State}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use chrono::{Utc, TimeZone};

use crate::v2::state::AppState;

#[derive(Debug, Serialize)]
pub struct StoragePolicy { pub tenant_id:String, pub retention_days:u16, pub compression: Option<String>, pub updated_at:String }

#[derive(Debug, Deserialize)]
pub struct PutStorage { pub retention_days: Option<u16>, pub compression: Option<String> }

/// GET /api/v2/admin/storage/:tenant
pub async fn get_storage(State(st): State<Arc<AppState>>, Path(tenant): Path<String>) -> Result<Json<StoragePolicy>, crate::error::PipelineError> {
    // retention from tenant_limits (latest)
    let row: Option<(u16,u32)> = st.ch
        .query("SELECT retention_days, updated_at FROM dev.tenant_limits WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 1")
        .bind(&tenant)
        .fetch_optional()
        .await
        .map_err(|e| crate::error::PipelineError::database(format!("get retention: {e}")))?;
    let (retention_days, updated_at) = row.unwrap_or((30, Utc::now().timestamp() as u32));
    // compression from admin_config key compression:<tenant>
    let key = format!("compression:{}", tenant);
    let comp: Option<String> = st.ch.query("SELECT v FROM dev.admin_config WHERE k=? LIMIT 1").bind(&key).fetch_optional().await.map_err(|e| crate::error::PipelineError::database(format!("get compression: {e}")))?;
    let compression = comp.and_then(|v| serde_json::from_str::<serde_json::Value>(&v).ok()).and_then(|j| j.as_str().map(|s| s.to_string()));
    Ok(Json(StoragePolicy{ tenant_id:tenant, retention_days, compression, updated_at: Utc.timestamp_opt(updated_at as i64,0).single().unwrap().to_rfc3339() }))
}

/// PUT /api/v2/admin/storage/:tenant
pub async fn put_storage(State(st): State<Arc<AppState>>, Path(tenant): Path<String>, Json(b): Json<PutStorage>) -> Result<Json<StoragePolicy>, crate::error::PipelineError> {
    let now = Utc::now().timestamp() as u32;
    if let Some(rd) = b.retention_days {
        st.ch.query("INSERT INTO dev.tenant_limits (tenant_id, eps_limit, burst_limit, retention_days, updated_at) VALUES (?,?,?,?,?)")
            .bind(&tenant).bind(0_u32).bind(0_u32).bind(rd).bind(now)
            .execute().await.map_err(|e| crate::error::PipelineError::database(format!("put retention: {e}")))?;
    }
    if let Some(comp) = b.compression.clone() {
        // upsert admin_config k/v
        let key = format!("compression:{}", tenant);
        let js = serde_json::to_string(&serde_json::Value::String(comp)).unwrap();
        let _ = st.ch.query("ALTER TABLE dev.admin_config DELETE WHERE k=?").bind(&key).execute().await;
        st.ch.query("INSERT INTO dev.admin_config (k,v) VALUES (?,?)").bind(&key).bind(js).execute().await.map_err(|e| crate::error::PipelineError::database(format!("put compression: {e}")))?;
    }
    // Return current
    get_storage(State(st), Path(tenant)).await
}


