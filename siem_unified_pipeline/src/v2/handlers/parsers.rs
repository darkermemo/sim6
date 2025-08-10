use axum::{extract::{Path, State}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use clickhouse::Row;
use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};

#[derive(Serialize, Deserialize, Row, Clone)]
pub struct ParserRow { pub parser_id:String, pub vendor:String, pub product:String, pub version:u32, pub strategy:String, pub pattern:String, pub test_examples:Vec<String>, pub cim_map_json:String, pub enabled:u8, pub created_at:u32, pub updated_at:u32 }

#[derive(Deserialize)]
pub struct CreateParser { pub vendor:String, pub product:String, pub strategy:String, pub pattern:String, pub test_examples:Vec<String>, pub cim_map_json:String }

pub async fn create_parser(State(st): State<Arc<AppState>>, Json(b): Json<CreateParser>) -> PipelineResult<Json<serde_json::Value>> {
  let now = chrono::Utc::now().timestamp() as u32;
  let parser_id = format!("p-{}-{}-{}", b.vendor, b.product, now);
  let sql = format!("INSERT INTO dev.parsers_v2 (parser_id,vendor,product,version,strategy,pattern,test_examples,cim_map_json,enabled,created_at,updated_at) VALUES ('{}','{}','{}',1,'{}','{}',{},'{}',1,{},{} )",
    parser_id.replace("'","''"), b.vendor.replace("'","''"), b.product.replace("'","''"), b.strategy.replace("'","''"), b.pattern.replace("'","''"),
    serde_json::to_string(&b.test_examples).unwrap_or("[]".to_string()).replace("'","''"), b.cim_map_json.replace("'","''"), now, now
  );
  st.ch.query(&sql).execute().await.map_err(|e| PipelineError::database(format!("parser create: {e}")))?;
  Ok(Json(serde_json::json!({"parser_id": parser_id})))
}

pub async fn get_parser(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> PipelineResult<Json<ParserRow>> {
  let row: Option<ParserRow> = st.ch.query("SELECT * FROM dev.parsers_v2 WHERE parser_id=? ORDER BY updated_at DESC LIMIT 1").bind(&id).fetch_optional().await
    .map_err(|e| PipelineError::database(format!("parser get: {e}")))?;
  row.map(Json).ok_or_else(|| PipelineError::not_found("parser not found"))
}

#[derive(Deserialize)]
pub struct TestParserBody {}

pub async fn test_parser(State(st): State<Arc<AppState>>, Path(id): Path<String>) -> PipelineResult<Json<serde_json::Value>> {
  // Run stored examples through simple json parser
  let row: Option<ParserRow> = st.ch.query("SELECT * FROM dev.parsers_v2 WHERE parser_id=? ORDER BY updated_at DESC LIMIT 1").bind(&id).fetch_optional().await
    .map_err(|e| PipelineError::database(format!("parser get: {e}")))?;
  let row = row.ok_or_else(|| PipelineError::not_found("parser not found"))?;
  let mut pass = 0u32; let mut total = 0u32;
  for s in row.test_examples.iter() { total += 1; if serde_json::from_str::<serde_json::Value>(s).is_ok() { pass += 1; } }
  Ok(Json(serde_json::json!({"total": total, "pass": pass})))
}

#[derive(Deserialize)]
pub struct AutodetectBody { pub samples: Vec<String>, pub hints: Option<serde_json::Value> }

pub async fn autodetect_parser(Json(b): Json<AutodetectBody>) -> PipelineResult<Json<serde_json::Value>> {
  // Minimal heuristics: if first sample parses as JSON, suggest json strategy
  let mut candidates: Vec<serde_json::Value> = Vec::new();
  if let Some(s) = b.samples.first() {
    if serde_json::from_str::<serde_json::Value>(s).is_ok() {
      candidates.push(serde_json::json!({"strategy":"json","pattern":"$","confidence":0.9,"cim_fields":["message"]}));
    } else {
      candidates.push(serde_json::json!({"strategy":"kv","pattern":"=","confidence":0.6,"cim_fields":[]}));
    }
  }
  Ok(Json(serde_json::json!({"candidates": candidates})))
}

#[derive(Deserialize)]
pub struct ActivateBody { pub source_id: String }

pub async fn activate_parser(State(st): State<Arc<AppState>>, Path(id): Path<String>, Json(b): Json<ActivateBody>) -> PipelineResult<Json<serde_json::Value>> {
  let sql = format!("ALTER TABLE dev.log_sources_v2 UPDATE parser_id='{}', updated_at=toUInt32(now()) WHERE source_id='{}'", id.replace("'","''"), b.source_id.replace("'","''"));
  st.ch.query(&sql).execute().await.map_err(|e| PipelineError::database(format!("activate: {e}")))?;
  Ok(Json(serde_json::json!({"ok": true})))
}


