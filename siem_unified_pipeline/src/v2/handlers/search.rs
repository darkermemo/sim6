use axum::{extract::State, Json};
use std::sync::Arc;
use serde::Deserialize;
use serde_json::Value;
use crate::v2::{state::AppState, compiler::{SearchDsl, compile_search}};

#[derive(Deserialize)]
pub struct ExecuteRequest { pub dsl: SearchDsl }

#[derive(serde::Serialize)]
pub struct ExecuteResponse { pub sql: String, pub data: Value, pub timings_ms: u128 }

/// POST /api/v2/search/execute - compile DSL and execute against ClickHouse (JSON)
/// Accepts either { dsl: SearchDsl } or the simplified body used by search_api::handlers (tenant_id/time/q...)
pub async fn search_execute(
    State(st): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> Result<Json<ExecuteResponse>, crate::error::PipelineError> {
    let t0_all = std::time::Instant::now();
    // Try legacy typed shape first
    let dsl: SearchDsl = if body.get("dsl").is_some() {
        let req: ExecuteRequest = serde_json::from_value(body)
            .map_err(|e| crate::error::PipelineError::validation(format!("invalid dsl body: {e}")))?;
        req.dsl
    } else {
        // Fallback to simplified translator
        let dsl2 = crate::v2::search_api::compiler::translate_to_dsl(&body)
            .map_err(|e| crate::error::PipelineError::validation(format!("invalid body: {e}")))?;
        dsl2
    };
    let compiled = compile_search(&dsl, &st.events_table)
        .map_err(crate::error::PipelineError::validation)?;
    // Use HTTP JSON to ClickHouse for generic rows
    let sql = format!("{} FORMAT JSON", compiled.sql);
    let client = reqwest::Client::new();
    let t0 = std::time::Instant::now();
    let resp = client.get("http://localhost:8123/")
        .query(&[("query", sql.clone())])
        .send().await
        .map_err(|e| crate::error::PipelineError::database(format!("ch http: {e}")))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        tracing::error!(target = "search_execute", %status, ch_error = %txt, "ClickHouse error in search_execute");
        return Err(crate::error::map_clickhouse_http_error(status, &txt, Some(&sql)));
    }
    let text = resp.text().await.unwrap_or("{}".to_string());
    let data: Value = serde_json::from_str(&text).unwrap_or(serde_json::json!({"raw": text}));
    crate::v2::metrics::obs_search("execute", t0_all.elapsed().as_secs_f64());
    Ok(Json(ExecuteResponse { sql: compiled.sql, data, timings_ms: t0.elapsed().as_millis() }))
}

#[derive(serde::Serialize)]
pub struct EstimateResponse { pub sql: String, pub estimated_rows: u64, pub timings_ms: u128 }

/// POST /api/v2/search/estimate - compile DSL and return count estimate (exact count())
pub async fn search_estimate(
    State(st): State<Arc<AppState>>,
    Json(req): Json<ExecuteRequest>,
)
-> Result<Json<EstimateResponse>, crate::error::PipelineError> {
    let compiled = compile_search(&req.dsl, &st.events_table)
        .map_err(crate::error::PipelineError::validation)?;
    let count_sql = format!("SELECT count() as c FROM {} WHERE {} SETTINGS max_execution_time=8 FORMAT JSON",
        st.events_table, compiled.where_sql);
    let client = reqwest::Client::new();
    let t0 = std::time::Instant::now();
    let resp = client.get("http://localhost:8123/")
        .query(&[("query", count_sql.clone())])
        .send().await
        .map_err(|e| crate::error::PipelineError::database(format!("ch http: {e}")))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(crate::error::map_clickhouse_http_error(status, &txt, Some(&count_sql)));
    }
    let text = resp.text().await.unwrap_or("{}".to_string());
    let v: Value = serde_json::from_str(&text).unwrap_or_default();
    let est = v.get("data").and_then(|d| d.as_array()).and_then(|a| a.first())
        .and_then(|row| row.get("c")).and_then(|c| c.as_u64()).unwrap_or(0);
    crate::v2::metrics::obs_search("estimate", t0.elapsed().as_secs_f64());
    Ok(Json(EstimateResponse { sql: compiled.sql, estimated_rows: est, timings_ms: t0.elapsed().as_millis() }))
}

#[derive(serde::Deserialize)]
pub struct FacetRequest { pub dsl: SearchDsl, pub field: String, pub k: Option<u64> }

#[derive(serde::Serialize)]
pub struct FacetResponse { pub sql: String, pub topk: Vec<(String,u64)>, pub timings_ms: u128 }

/// POST /api/v2/search/facets - return topK values for a field
pub async fn search_facets(
    State(st): State<Arc<AppState>>,
    Json(req): Json<FacetRequest>,
) -> Result<Json<FacetResponse>, crate::error::PipelineError> {
    let compiled = compile_search(&req.dsl, &st.events_table)
        .map_err(crate::error::PipelineError::validation)?;
    let k = req.k.unwrap_or(10).min(100);
    let field = req.field; // trusted via UI; further validation could be added
    let sql = format!(
        "SELECT {f} as v, count() as c FROM {tbl} WHERE {w} GROUP BY v ORDER BY c DESC LIMIT {k} FORMAT JSON",
        f = field, tbl = st.events_table, w = compiled.where_sql, k = k
    );
    let client = reqwest::Client::new();
    let t0 = std::time::Instant::now();
    let resp = client.get("http://localhost:8123/").query(&[("query", sql.clone())]).send().await
        .map_err(|e| crate::error::PipelineError::database(format!("ch http: {e}")))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(crate::error::map_clickhouse_http_error(status, &txt, Some(&sql)));
    }
    let text = resp.text().await.unwrap_or_default();
    let v: Value = serde_json::from_str(&text).unwrap_or_default();
    let rows = v.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default();
    let mut out: Vec<(String,u64)> = Vec::new();
    for r in rows {
        if let (Some(v), Some(c)) = (r.get("v").and_then(|x| x.as_str()), r.get("c").and_then(|x| x.as_u64())) {
            out.push((v.to_string(), c));
        }
    }
    crate::v2::metrics::obs_search("facets", t0.elapsed().as_secs_f64());
    Ok(Json(FacetResponse { sql: compiled.sql, topk: out, timings_ms: t0.elapsed().as_millis() }))
}


