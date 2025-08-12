use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::v2::{AppError, AppState};

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
) -> Result<Response, AppError> {
    let sql = "SELECT tenant_id, eps_hard, eps_soft, burst, retention_days, export_daily_mb, updated_at FROM dev.tenant_limits WHERE tenant_id = ?";
    let mut result = state.clickhouse.query(sql, &[tenant_id.to_string()]).await?;
    
    if let Some(row) = result.next().await? {
        let limits = TenantLimits {
            tenant_id: row.get("tenant_id")?,
            eps_hard: row.get("eps_hard")?,
            eps_soft: row.get("eps_soft")?,
            burst: row.get("burst")?,
            retention_days: row.get("retention_days")?,
            export_daily_mb: row.get("export_daily_mb")?,
            updated_at: row.get("updated_at")?,
        };
        Ok(Json(limits).into_response())
    } else {
        // Return default limits if none set
        let default_limits = TenantLimits {
            tenant_id,
            eps_hard: 1000,
            eps_soft: 500,
            burst: 2000,
            retention_days: 90,
            export_daily_mb: 100,
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        Ok(Json(default_limits).into_response())
    }
}

pub async fn update_tenant_limits(
    State(state): State<Arc<AppState>>,
    Path(tenant_id): Path<u64>,
    Json(req): Json<UpdateLimitsRequest>,
) -> Result<Response, AppError> {
    // Validate limits
    if req.eps_soft > req.eps_hard {
        return Err(AppError::BadRequest("eps_soft cannot exceed eps_hard".to_string()));
    }
    
    if req.burst > req.eps_hard * 3 {
        return Err(AppError::BadRequest("burst cannot exceed eps_hard * 3".to_string()));
    }
    
    if !(1..=3650).contains(&req.retention_days) {
        return Err(AppError::BadRequest("retention_days must be between 1 and 3650".to_string()));
    }
    
    // Check if limits already exist
    let existing_sql = "SELECT tenant_id FROM dev.tenant_limits WHERE tenant_id = ?";
    let mut existing_result = state.clickhouse.query(existing_sql, &[tenant_id.to_string()]).await?;
    
    if existing_result.next().await?.is_some() {
        // Update existing limits
        let update_sql = "ALTER TABLE dev.tenant_limits UPDATE eps_hard = ?, eps_soft = ?, burst = ?, retention_days = ?, export_daily_mb = ?, updated_at = ? WHERE tenant_id = ?";
        state.clickhouse.execute(update_sql, &[
            req.eps_hard.to_string(),
            req.eps_soft.to_string(),
            req.burst.to_string(),
            req.retention_days.to_string(),
            req.export_daily_mb.to_string(),
            chrono::Utc::now().to_rfc3339(),
            tenant_id.to_string(),
        ]).await?;
    } else {
        // Insert new limits
        let insert_sql = "INSERT INTO dev.tenant_limits (tenant_id, eps_hard, eps_soft, burst, retention_days, export_daily_mb) VALUES (?, ?, ?, ?, ?, ?)";
        state.clickhouse.execute(insert_sql, &[
            tenant_id.to_string(),
            req.eps_hard.to_string(),
            req.eps_soft.to_string(),
            req.burst.to_string(),
            req.retention_days.to_string(),
            req.export_daily_mb.to_string(),
        ]).await?;
    }
    
    Ok(StatusCode::OK.into_response())
}
