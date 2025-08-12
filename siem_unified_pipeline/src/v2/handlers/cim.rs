use axum::{extract::{Query, State}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
#[allow(unused_imports)]
use clickhouse::Row;
use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};

#[derive(Deserialize)]
pub struct ValidateBody { pub source_id: Option<String>, pub parser_id: Option<String>, pub samples: Option<Vec<String>>, pub required_fields: Option<Vec<String>> }

#[derive(Serialize)]
pub struct ValidateReport { pub coverage: f64, pub total: u32, pub parsed_ok: u32, pub missing_fields: Vec<String>, pub warnings: Vec<String> }

pub async fn cim_validate(State(st): State<Arc<AppState>>, Json(b): Json<ValidateBody>) -> PipelineResult<Json<ValidateReport>> {
    let samples = b.samples.unwrap_or_default();
    let required = b.required_fields.unwrap_or_else(|| vec!["tenant_id".into(), "event_timestamp".into(), "event_category".into()]);
    let mut ok = 0u32; let mut total = 0u32; let mut missing: Vec<String> = Vec::new();
    for s in samples.iter() {
        total += 1;
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(s) {
            let mut all = true;
            for f in required.iter() { if v.get(f).is_none() { all = false; missing.push(f.clone()); } }
            if all { ok += 1; }
        }
    }
    let cov = if total>0 { ok as f64 / total as f64 } else { 0.0 };
    // Persist snapshot
    if let (Some(src), Some(pid)) = (b.source_id.as_ref(), b.parser_id.as_ref()) {
        let now = chrono::Utc::now().timestamp() as u32;
        let miss_json = serde_json::to_string(&missing).unwrap_or("[]".to_string()).replace("'","''");
        let sql = format!("INSERT INTO dev.cim_field_coverage_v2 (source_id,parser_id,run_ts,total_samples,parsed_ok,coverage,missing_fields,warnings,updated_at) VALUES ('{}','{}',{}, {}, {}, {}, {}, [], {})",
            src.replace("'","''"), pid.replace("'","''"), now, total, ok, cov, miss_json, now);
        let _ = st.ch.query(&sql).execute().await;
    }
    Ok(Json(ValidateReport { coverage: cov, total, parsed_ok: ok, missing_fields: missing, warnings: vec![] }))
}

#[derive(Deserialize)]
pub struct CoverageQ { pub source_id: String }

pub async fn get_coverage(State(st): State<Arc<AppState>>, Query(q): Query<CoverageQ>) -> PipelineResult<Json<serde_json::Value>> {
    let row: Option<(String, String, u32, u32, f64)> = st.ch
        .query("SELECT source_id, parser_id, total_samples, parsed_ok, coverage FROM dev.cim_field_coverage_v2 WHERE source_id=? ORDER BY run_ts DESC LIMIT 1")
        .bind(&q.source_id)
        .fetch_optional().await
        .map_err(|e| PipelineError::database(format!("coverage get: {e}")))?;
    Ok(Json(serde_json::json!({"coverage": row})))
}


