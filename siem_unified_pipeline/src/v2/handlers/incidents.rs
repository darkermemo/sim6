use axum::{extract::{Path, Query, State}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use clickhouse::Row;
use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};

#[derive(Deserialize)]
pub struct ListQ { pub tenant_id:String, pub status:Option<String>, pub q:Option<String>, pub since:Option<u32>, pub limit:Option<u32>, pub offset:Option<u32> }
pub type ListQuery = ListQ;

#[derive(Serialize, Deserialize, Row, Clone)]
pub struct IncidentRow {
  pub incident_id:String, pub tenant_id:String, pub title:String, pub description:String,
  pub severity:String, pub status:String, pub owner:String,
  pub entity_keys:String, pub entities:String, pub rule_ids:Vec<String>,
  pub alert_count:u32, pub first_alert_ts:u32, pub last_alert_ts:u32, pub created_at:u32, pub updated_at:u32
}

pub async fn list_incidents(
  State(st): State<Arc<AppState>>,
  Query(p): Query<ListQ>
) -> PipelineResult<Json<serde_json::Value>> {
  let lim = p.limit.unwrap_or(50).min(200);
  let off = p.offset.unwrap_or(0);
  let mut sql = String::from("SELECT * FROM dev.incidents WHERE tenant_id = ? ");
  if p.status.is_some() { sql.push_str(" AND status = ? "); }
  if p.since.is_some() { sql.push_str(" AND last_alert_ts >= ? "); }
  if p.q.is_some() { sql.push_str(" AND positionCaseInsensitive(title, ?) > 0 "); }
  sql.push_str(" ORDER BY last_alert_ts DESC LIMIT ? OFFSET ? ");
  let mut qh = st.ch.query(&sql).bind(&p.tenant_id);
  if let Some(s)=p.status.as_ref() { qh = qh.bind(s); }
  if let Some(since)=p.since.as_ref() { qh = qh.bind(*since); }
  if let Some(qtxt)=p.q.as_ref() { qh = qh.bind(qtxt); }
  let rows: Vec<IncidentRow> = qh.bind(lim).bind(off).fetch_all().await
    .map_err(|e| PipelineError::database(format!("incidents list: {e}")))?;
  Ok(Json(serde_json::json!({"incidents": rows, "total": rows.len()})))
}

pub async fn get_incident(
  State(st): State<Arc<AppState>>,
  Path(id): Path<String>,
  Query(p): Query<std::collections::HashMap<String,String>>
) -> PipelineResult<Json<IncidentRow>> {
  let tenant = p.get("tenant_id").ok_or_else(|| PipelineError::validation("tenant_id required"))?;
  let sql = "SELECT * FROM dev.incidents WHERE tenant_id = ? AND incident_id = ? LIMIT 1";
  let row: Option<IncidentRow> = st.ch.query(sql).bind(tenant).bind(&id).fetch_optional().await
    .map_err(|e| PipelineError::database(format!("incident get: {e}")))?;
  row.map(Json).ok_or_else(|| PipelineError::not_found("incident not found"))
}

#[derive(Deserialize)]
pub struct PatchIncident { pub status:Option<String>, pub owner:Option<String>, pub severity:Option<String>, pub title:Option<String>, pub description:Option<String> }

pub async fn patch_incident(
  State(st): State<Arc<AppState>>,
  Path(id): Path<String>,
  Query(p): Query<std::collections::HashMap<String,String>>,
  Json(body): Json<PatchIncident>
) -> PipelineResult<Json<serde_json::Value>> {
  let tenant = p.get("tenant_id").ok_or_else(|| PipelineError::validation("tenant_id required"))?;
  let mut sets: Vec<String> = vec![];
  if let Some(v)=&body.status { sets.push(format!("status='{}'", v.replace("'","''"))); }
  if let Some(v)=&body.owner { sets.push(format!("owner='{}'", v.replace("'","''"))); }
  if let Some(v)=&body.severity { sets.push(format!("severity='{}'", v.replace("'","''"))); }
  if let Some(v)=&body.title { sets.push(format!("title='{}'", v.replace("'","''"))); }
  if let Some(v)=&body.description { sets.push(format!("description='{}'", v.replace("'","''"))); }
  if sets.is_empty() { return Err(PipelineError::validation("no updates provided")); }
  sets.push(format!("updated_at={}", chrono::Utc::now().timestamp() as u32));
  let sql = format!(
    "ALTER TABLE dev.incidents UPDATE {} WHERE tenant_id='{}' AND incident_id='{}'",
    sets.join(", "), tenant.replace("'","''"), id.replace("'","''")
  );
  st.ch.query(&sql).execute().await
    .map_err(|e| PipelineError::database(format!("incident patch: {e}")))?;
  Ok(Json(serde_json::json!({"status":"updated"})))
}

#[derive(Serialize, Deserialize, Row, Clone)]
pub struct AlertRow {
  pub alert_id:String, pub tenant_id:String, pub rule_id:String, pub severity:String,
  pub status:String, pub alert_timestamp:u32, pub created_at:u32, pub updated_at:u32,
  pub alert_title:String, pub alert_description:String, pub event_refs:String
}

pub async fn incident_alerts(
  State(st): State<Arc<AppState>>,
  Path(id): Path<String>,
  Query(p): Query<std::collections::HashMap<String,String>>
) -> PipelineResult<Json<serde_json::Value>> {
  let tenant = p.get("tenant_id").ok_or_else(|| PipelineError::validation("tenant_id required"))?;
  let sql = "SELECT a.* FROM dev.incident_alerts ia
             INNER JOIN dev.alerts a
             ON ia.tenant_id=a.tenant_id AND ia.alert_id=a.alert_id
             WHERE ia.tenant_id=? AND ia.incident_id=? ORDER BY a.alert_timestamp DESC LIMIT 200";
  let rows: Vec<AlertRow> = st.ch.query(sql).bind(tenant).bind(&id).fetch_all().await
    .map_err(|e| PipelineError::database(format!("incident alerts: {e}")))?;
  Ok(Json(serde_json::json!({ "alerts": rows })))
}

#[derive(Deserialize)]
pub struct BulkBody { pub status: String }

pub async fn incident_alerts_bulk(
  State(st): State<Arc<AppState>>,
  Path(id): Path<String>,
  Query(p): Query<std::collections::HashMap<String,String>>,
  Json(body): Json<BulkBody>
) -> PipelineResult<Json<serde_json::Value>> {
  let tenant = p.get("tenant_id").ok_or_else(|| PipelineError::validation("tenant_id required"))?;
  // collect alert_ids for this incident
  #[derive(Deserialize, Row)]
  struct IdRow { alert_id: String }
  let rows: Vec<IdRow> = st.ch.query("SELECT alert_id FROM dev.incident_alerts WHERE tenant_id=? AND incident_id=?")
    .bind(tenant).bind(&id).fetch_all().await
    .map_err(|e| PipelineError::database(format!("bulk ids: {e}")))?;
  if rows.is_empty() { return Ok(Json(serde_json::json!({"updated":0}))); }
  let list = rows.iter().map(|r| format!("'{}'", r.alert_id.replace("'","''"))).collect::<Vec<_>>().join(",");
  let sql = format!("ALTER TABLE dev.alerts UPDATE status='{}', updated_at=toUInt32(now()) WHERE tenant_id='{}' AND alert_id IN ({})", body.status.replace("'","''"), tenant.replace("'","''"), list);
  st.ch.query(&sql).execute().await.map_err(|e| PipelineError::database(format!("bulk update: {e}")))?;
  // If all CLOSED, set incident RESOLVED
  if body.status.to_uppercase()=="CLOSED" {
    let _ = st.ch.query(&format!("ALTER TABLE dev.incidents UPDATE status='RESOLVED', updated_at=toUInt32(now()) WHERE tenant_id='{}' AND incident_id='{}'", tenant.replace("'","''"), id.replace("'","''"))).execute().await;
  }
  Ok(Json(serde_json::json!({"updated": rows.len()})))
}

pub async fn incident_timeline(
  State(st): State<Arc<AppState>>,
  Path(id): Path<String>,
  Query(p): Query<std::collections::HashMap<String,String>>
) -> PipelineResult<Json<serde_json::Value>> {
  let tenant = p.get("tenant_id").ok_or_else(|| PipelineError::validation("tenant_id required"))?;
  let sql = "SELECT a.alert_id, a.alert_timestamp, a.severity, a.alert_title, a.status
             FROM dev.alerts a INNER JOIN dev.incident_alerts ia
             ON ia.tenant_id=a.tenant_id AND ia.alert_id=a.alert_id
             WHERE ia.tenant_id=? AND ia.incident_id=? ORDER BY a.alert_timestamp ASC";
  let rows: Vec<(String,u32,String,String,String)> = st.ch.query(sql).bind(tenant).bind(&id).fetch_all().await
    .map_err(|e| PipelineError::database(format!("timeline: {e}")))?;
  let events: Vec<serde_json::Value> = rows.into_iter().map(|(alert_id, ts, sev, title, status)| serde_json::json!({
    "alert_id": alert_id,
    "alert_timestamp": ts,
    "severity": sev,
    "alert_title": title,
    "status": status,
  })).collect();
  Ok(Json(serde_json::json!({ "events": events })))
}

pub async fn run_aggregator_once(State(st): State<Arc<AppState>>) -> PipelineResult<String> {
  use crate::v2::workers::incident_aggregator::{run_once, IncidentConfig};
  run_once(&st, &IncidentConfig::default()).await.map_err(|e| PipelineError::internal(format!("agg once: {e}")))?;
  Ok("OK".to_string())
}


