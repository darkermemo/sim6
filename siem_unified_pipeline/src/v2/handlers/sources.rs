use axum::{extract::{Path, Query, State}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use clickhouse::Row;
use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};

#[derive(Deserialize)]
pub struct SourcesQ { pub tenant_id: String, pub vendor: Option<String>, pub product: Option<String>, pub enabled: Option<u8> }

#[derive(Serialize, Deserialize, Row, Clone)]
pub struct SourceRow {
  pub source_id:String, pub tenant_id:String, pub vendor:String, pub product:String,
  pub source_type:String, pub transport:String, pub input_endpoint:String,
  pub parser_id: Option<String>, pub enabled:u8, pub eps:u32, pub error_rate:f64,
  pub last_seen:u32, pub created_at:u32, pub updated_at:u32, pub config_json:String
}

pub async fn list_sources(State(st): State<Arc<AppState>>, Query(p): Query<SourcesQ>) -> PipelineResult<Json<serde_json::Value>> {
  let mut sql = String::from("SELECT * FROM dev.log_sources_v2 WHERE tenant_id = ? ");
  if p.vendor.is_some() { sql.push_str(" AND vendor = ? "); }
  if p.product.is_some() { sql.push_str(" AND product = ? "); }
  if p.enabled.is_some() { sql.push_str(" AND enabled = ? "); }
  sql.push_str(" ORDER BY updated_at DESC LIMIT 500");
  let mut q = st.ch.query(&sql).bind(&p.tenant_id);
  if let Some(v)=p.vendor.as_ref() { q = q.bind(v); }
  if let Some(v)=p.product.as_ref() { q = q.bind(v); }
  if let Some(v)=p.enabled.as_ref() { q = q.bind(*v); }
  let rows: Vec<SourceRow> = q.fetch_all().await.map_err(|e| PipelineError::database(format!("sources list: {e}")))?;
  Ok(Json(serde_json::json!({"items": rows})))
}

#[derive(Deserialize)]
pub struct CreateSource { pub tenant_id:String, pub vendor:String, pub product:String, pub source_type:String, pub transport:String, pub input_endpoint:String, pub enabled:Option<u8>, pub config_json:Option<String> }

pub async fn create_source(State(st): State<Arc<AppState>>, Json(b): Json<CreateSource>) -> PipelineResult<Json<serde_json::Value>> {
  if b.tenant_id.trim().is_empty() { return Err(PipelineError::validation("tenant_id required")); }
  let now = chrono::Utc::now().timestamp() as u32;
  let source_id = format!("src-{}-{}-{}", b.vendor, b.product, now);
  let sql = format!("INSERT INTO dev.log_sources (source_id,tenant_id,vendor,product,source_type,transport,input_endpoint,parser_id,enabled,eps,error_rate,last_seen,created_at,updated_at,config_json) VALUES ('{}','{}','{}','{}','{}','{}','{}',NULL,{},0,0,toUInt32(0),toUInt32({}),toUInt32({}),'{}')",
    source_id.replace("'","''"), b.tenant_id.replace("'","''"), b.vendor.replace("'","''"), b.product.replace("'","''"),
    b.source_type.replace("'","''"), b.transport.replace("'","''"), b.input_endpoint.replace("'","''"), b.enabled.unwrap_or(1), now, now, b.config_json.unwrap_or("{}".to_string()).replace("'","''")
  );
  st.ch.query(&sql).execute().await.map_err(|e| PipelineError::database(format!("source create: {e}")))?;
  Ok(Json(serde_json::json!({"source_id": source_id})))
}

pub async fn get_source(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> PipelineResult<Json<SourceRow>> {
  let row: Option<SourceRow> = st.ch.query("SELECT * FROM dev.log_sources_v2 WHERE source_id = ? LIMIT 1").bind(&id).fetch_optional().await
    .map_err(|e| PipelineError::database(format!("source get: {e}")))?;
  row.map(Json).ok_or_else(|| PipelineError::not_found("source not found"))
}

#[derive(Deserialize)]
pub struct PatchSource { pub input_endpoint:Option<String>, pub parser_id:Option<String>, pub enabled:Option<u8>, pub config_json:Option<String> }

pub async fn patch_source(State(st): State<Arc<AppState>>, Path(id): Path<String>, Json(b): Json<PatchSource>) -> PipelineResult<Json<serde_json::Value>> {
  let mut sets: Vec<String> = Vec::new();
  if let Some(v)=b.input_endpoint { sets.push(format!("input_endpoint='{}'", v.replace("'","''"))); }
  if let Some(v)=b.parser_id { sets.push(format!("parser_id='{}'", v.replace("'","''"))); }
  if let Some(v)=b.enabled { sets.push(format!("enabled={}", v)); }
  if let Some(v)=b.config_json { sets.push(format!("config_json='{}'", v.replace("'","''"))); }
  if sets.is_empty() { return Ok(Json(serde_json::json!({"ok":true}))); }
  sets.push("updated_at=toUInt32(now())".to_string());
  let sql = format!("ALTER TABLE dev.log_sources_v2 UPDATE {} WHERE source_id='{}'", sets.join(","), id.replace("'","''"));
  st.ch.query(&sql).execute().await.map_err(|e| PipelineError::database(format!("source patch: {e}")))?;
  Ok(Json(serde_json::json!({"ok":true})))
}

#[derive(Deserialize)]
pub struct TestIngestBody { pub samples: Vec<String>, pub parser_id: Option<String>, pub commit: Option<bool>, pub tenant_id: Option<String> }

#[derive(Serialize)]
pub struct TestIngestResult { pub inserted: u32, pub report: Vec<serde_json::Value> }

fn parse_sample(strategy: &str, _pattern: &str, sample: &str) -> serde_json::Value {
  if strategy.eq_ignore_ascii_case("json") {
    serde_json::from_str::<serde_json::Value>(sample).unwrap_or(serde_json::json!({"raw": sample}))
  } else {
    serde_json::json!({"raw": sample})
  }
}

pub async fn test_ingest(
  State(st): State<Arc<AppState>>,
  Path(id): Path<String>,
  Json(b): Json<TestIngestBody>
) -> PipelineResult<Json<TestIngestResult>> {
  let src: Option<SourceRow> = st.ch.query("SELECT * FROM dev.log_sources_v2 WHERE source_id=? LIMIT 1").bind(&id).fetch_optional().await
    .map_err(|e| PipelineError::database(format!("load source: {e}")))?;
  let src = src.ok_or_else(|| PipelineError::not_found("source not found"))?;
  let pid = b.parser_id.clone().or(src.parser_id.clone()).ok_or_else(|| PipelineError::validation("parser_id required"))?;
  #[derive(Deserialize, Row)]
  #[allow(dead_code)]
  struct PRow { strategy:String, pattern:String, cim_map_json:String }
  let prow: Option<PRow> = st.ch.query("SELECT strategy,pattern,cim_map_json FROM dev.parsers WHERE parser_id=? ORDER BY updated_at DESC LIMIT 1").bind(&pid).fetch_optional().await
    .map_err(|e| PipelineError::database(format!("load parser: {e}")))?;
  let prow = prow.ok_or_else(|| PipelineError::not_found("parser not found"))?;
  let mut report = Vec::new();
  let mut inserted = 0u32;
  let commit = b.commit.unwrap_or(false);
  let now = chrono::Utc::now().timestamp() as u32;
  for s in b.samples.iter() {
    let parsed = parse_sample(&prow.strategy, &prow.pattern, s);
    report.push(parsed.clone());
    if commit {
      let event_id = format!("{}-{}", &id, now);
      let esc_raw = s.replace("'","''");
      let tenant = b.tenant_id.clone().unwrap_or(src.tenant_id.clone());
      let sql = format!(
        "INSERT INTO dev.events (event_id,event_timestamp,tenant_id,event_category,raw_event,metadata,severity,source_type,created_at) VALUES ('{}',toUInt32(now()),'{}','{}','{}','{}','{}','{}',toUInt32(now()))",
        event_id.replace("'","''"), tenant.replace("'","''"), src.product.replace("'","''"), esc_raw, parsed.to_string().replace("'","''"), "INFO", src.source_type.replace("'","''")
      );
      st.ch.query(&sql).execute().await.map_err(|e| PipelineError::database(format!("insert event: {e}")))?;
      inserted += 1;
    }
  }
  Ok(Json(TestIngestResult { inserted, report }))
}

#[derive(Deserialize)]
pub struct DeployBody { pub dry_run: Option<bool> }

pub async fn deploy_source(_state: State<Arc<AppState>>, _path: Path<String>, Json(b): Json<DeployBody>) -> PipelineResult<Json<serde_json::Value>> {
  Ok(Json(serde_json::json!({"applied": true, "dry_run": b.dry_run.unwrap_or(false)})))
}


