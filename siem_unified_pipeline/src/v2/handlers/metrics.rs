use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;
use chrono::Utc;
use crate::v2::state::AppState;
use crate::error::Result;

#[derive(Serialize)]
pub struct EpsStats {
    pub avg_eps: f64,
    pub current_eps: f64,
    pub peak_eps: f64,
    pub window_seconds: u64,
}

#[derive(Serialize)]
pub struct EpsResponse {
    pub global: EpsStats,
    pub per_tenant: serde_json::Value,
    pub timestamp: String,
}

pub async fn get_eps_stats(State(st): State<Arc<AppState>>) -> Json<EpsResponse> {
    // Compute EPS for last 60 seconds using ClickHouse
    let window = 60u64;
    let sql_global = format!(
        "SELECT avg(cnt) AS avg_eps, anyLast(cnt) AS current_eps, max(cnt) AS peak_eps \
         FROM (SELECT toStartOfSecond(toDateTime(event_timestamp)) AS ts, count() AS cnt \
               FROM {} WHERE event_timestamp >= (toUInt32(now()) - {}) \
               GROUP BY ts ORDER BY ts)",
        st.events_table, window
    );

    let row = st.ch.query(&sql_global).fetch_one::<(f64, f64, f64)>().await.ok();
    let (avg_eps, current_eps, peak_eps) = row.unwrap_or((0.0, 0.0, 0.0));

    // Per-tenant EPS map
    let sql_tenant = format!(
        "SELECT tenant_id, avg(cnt) AS avg_eps, anyLast(cnt) AS current_eps, max(cnt) AS peak_eps \
         FROM (SELECT tenant_id, toStartOfSecond(toDateTime(event_timestamp)) AS ts, count() AS cnt \
               FROM {} WHERE event_timestamp >= (toUInt32(now()) - {}) \
               GROUP BY tenant_id, ts ORDER BY ts) GROUP BY tenant_id",
        st.events_table, window
    );

    let per_tenant_rows = st.ch.query(&sql_tenant).fetch_all::<(String, f64, f64, f64)>().await.unwrap_or_default();
    let per_tenant = serde_json::json!({
        "window_seconds": window,
        "tenants": per_tenant_rows.into_iter().map(|(tid,a,c,p)| (tid, serde_json::json!({"avg_eps":a,"current_eps":c,"peak_eps":p}))).collect::<serde_json::Map<_,_>>()
    });

    Json(EpsResponse {
        global: EpsStats { avg_eps, current_eps, peak_eps, window_seconds: window },
        per_tenant,
        timestamp: Utc::now().to_rfc3339(),
    })
}


