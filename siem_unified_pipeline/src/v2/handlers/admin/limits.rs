use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};

#[derive(Debug, Deserialize)]
pub struct UpdateLimitsRequest {
    pub eps_hard: u64,
    pub eps_soft: u64,
    pub burst: u64,
    pub retention_days: u16,
    pub export_daily_mb: u64,
}

#[derive(Debug, Serialize)]
pub struct TenantLimits {
    pub tenant_id: u64,
    pub eps_hard: u64,
    pub eps_soft: u64,
    pub burst: u64,
    pub retention_days: u16,
    pub export_daily_mb: u64,
    pub updated_at: String,
}

pub async fn get_tenant_limits(
    State(state): State<Arc<AppState>>,
    Path(tenant_id): Path<u64>,
) -> PipelineResult<Json<serde_json::Value>> {
    let sql = "SELECT tenant_id, eps_hard, eps_soft, burst, retention_days, export_daily_mb, updated_at FROM dev.tenant_limits WHERE tenant_id = ?";
    #[derive(Deserialize, clickhouse::Row)]
    struct Row { tenant_id:u64, eps_hard:u64, eps_soft:u64, burst:u64, retention_days:u16, export_daily_mb:u64, updated_at:String }
    let row: Option<Row> = state.ch.query(sql).fetch_optional::<Row>().await?;
    match row {
        Some(r) => Ok(Json(serde_json::to_value(TenantLimits{ tenant_id:r.tenant_id, eps_hard:r.eps_hard, eps_soft:r.eps_soft, burst:r.burst, retention_days:r.retention_days, export_daily_mb:r.export_daily_mb, updated_at:r.updated_at })?)),
        None => {
            let default_limits = TenantLimits { tenant_id, eps_hard:1000, eps_soft:500, burst:2000, retention_days:90, export_daily_mb:100, updated_at: chrono::Utc::now().to_rfc3339() };
            Ok(Json(serde_json::to_value(default_limits)?))
        }
    }
}

pub async fn update_tenant_limits(
    State(state): State<Arc<AppState>>,
    Path(tenant_id): Path<u64>,
    Json(req): Json<UpdateLimitsRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    // Validate limits
    if req.eps_soft > req.eps_hard {
        return Err(PipelineError::validation("eps_soft cannot exceed eps_hard"));
    }
    
    if req.burst > req.eps_hard * 3 {
        return Err(PipelineError::validation("burst cannot exceed eps_hard * 3"));
    }
    
    if !(1..=3650).contains(&req.retention_days) {
        return Err(PipelineError::validation("retention_days must be between 1 and 3650"));
    }
    
    // Check if limits already exist
    let existing_sql = "SELECT tenant_id FROM dev.tenant_limits WHERE tenant_id = ?";
    let exists: Option<u64> = state.ch.query(existing_sql).fetch_optional::<u64>().await?;
    if exists.is_some() {
        // Update existing limits
        let update_sql = "ALTER TABLE dev.tenant_limits UPDATE eps_hard = ?, eps_soft = ?, burst = ?, retention_days = ?, export_daily_mb = ?, updated_at = ? WHERE tenant_id = ?";
        state.ch.query(update_sql)
            .bind(req.eps_hard.to_string())
            .bind(req.eps_soft.to_string())
            .bind(req.burst.to_string())
            .bind(req.retention_days.to_string())
            .bind(req.export_daily_mb.to_string())
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(tenant_id.to_string())
            .execute()
            .await?;
    } else {
        // Insert new limits
        let insert_sql = "INSERT INTO dev.tenant_limits (tenant_id, eps_hard, eps_soft, burst, retention_days, export_daily_mb) VALUES (?, ?, ?, ?, ?, ?)";
        state.ch.query(insert_sql)
            .bind(tenant_id.to_string())
            .bind(req.eps_hard.to_string())
            .bind(req.eps_soft.to_string())
            .bind(req.burst.to_string())
            .bind(req.retention_days.to_string())
            .bind(req.export_daily_mb.to_string())
            .execute()
            .await?;
    }
    
    Ok(Json(serde_json::json!({"status": "ok"})))
}
