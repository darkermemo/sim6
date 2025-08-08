use axum::{extract::{Query, State}, Json};
use serde::Deserialize;
use std::sync::Arc;

use crate::error::Result;
use crate::v2::{state::AppState, dal::ClickHouseRepo};

#[derive(Debug, Deserialize)]
pub struct AlertsQuery {
    pub tenant_id: Option<String>,
    pub severity: Option<String>,
    pub status: Option<String>,
    pub since: Option<u64>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

pub async fn list_alerts(
    State(st): State<Arc<AppState>>,
    Query(q): Query<AlertsQuery>,
) -> Result<Json<serde_json::Value>> {
    let rows = ClickHouseRepo::fetch_alerts(&st, &q).await?;
    Ok(Json(serde_json::json!({
        "total": rows.len(),
        "alerts": rows,
    })))
}


