use axum::{extract::{Query, State, Path}, Json};
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

#[derive(Deserialize)]
pub struct AlertPatch { pub status: Option<String> }

/// GET /api/v2/alerts/{id}
pub async fn get_alert(
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let sql = format!("SELECT * FROM dev.alerts WHERE alert_id = '{}' FORMAT JSON", id.replace("'","''"));
    let client = reqwest::Client::new();
    let resp = client.get("http://localhost:8123/").query(&[("query", sql.clone())]).send().await
        .map_err(|e| crate::error::PipelineError::database(format!("ch http: {e}")))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(crate::error::map_clickhouse_http_error(status, &txt, Some(&sql)));
    }
    let txt = resp.text().await.unwrap_or_default();
    let v: serde_json::Value = serde_json::from_str(&txt).unwrap_or_else(|_| serde_json::json!({"data":[]}));
    Ok(Json(v))
}

/// PATCH /api/v2/alerts/{id} - update status
pub async fn patch_alert(
    Path(id): Path<String>,
    Json(p): Json<AlertPatch>,
) -> Result<Json<serde_json::Value>> {
    if let Some(status) = p.status {
        let status = status.to_uppercase().replace("'","''");
        let now = chrono::Utc::now().timestamp() as u32;
        let sql = format!("ALTER TABLE dev.alerts UPDATE status='{}', updated_at={} WHERE alert_id='{}'", status, now, id.replace("'","''"));
        let client = reqwest::Client::new();
    let resp = client.post("http://localhost:8123/").query(&[("query", sql.clone())]).header("Content-Length","0").send().await
            .map_err(|e| crate::error::PipelineError::database(format!("ch http: {e}")))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let txt = resp.text().await.unwrap_or_default();
            return Err(crate::error::map_clickhouse_http_error(status, &txt, Some(&sql)));
        }
    }
    Ok(Json(serde_json::json!({"ok": true})))
}


