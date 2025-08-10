use axum::{extract::{State, Path, Query}, Json};
use axum::body::Bytes;
use serde_json::json;
use serde::Deserialize;
use std::sync::Arc;
use crate::v2::{state::AppState, compiler::SearchDsl};
use uuid::Uuid;
use blake3;
use crate::v2::metrics;

/// Minimal event row used for alert event_refs construction
#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct EventRow {
    pub event_id: String,
    pub event_timestamp: u64,
    pub tenant_id: String,
    pub source_type: Option<String>,
}
/// Build `event_refs` JSON string from a slice of rows.
/// Each ref carries minimally: event_id, event_timestamp, source_type, tenant_id.
/// Returns "[]" if `rows` is empty. Never returns invalid JSON.
/// This is pure and unit-testable.
pub fn build_event_refs_json(rows: &[EventRow]) -> String {
    use serde_json::json;
    if rows.is_empty() {
        return "[]".to_string();
    }
    let refs: Vec<_> = rows.iter().map(|r| {
        json!({
            "event_id": r.event_id,
            "event_timestamp": r.event_timestamp,
            "source_type": r.source_type,
            "tenant_id": r.tenant_id
        })
    }).collect();
    serde_json::to_string(&refs).unwrap_or_else(|_| "[]".to_string())
}


#[derive(serde::Deserialize)]
pub struct RulesListQ { pub q: Option<String>, pub mode: Option<String>, pub limit: Option<u32> }

/// Admin list of rules with filters
pub async fn list_alert_rules(State(_st): State<Arc<AppState>>, Query(q): Query<RulesListQ>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let mut where_parts: Vec<String> = Vec::new();
    if let Some(m) = q.mode.as_deref() { if m.eq_ignore_ascii_case("batch") { where_parts.push("ifNull(mode,'batch') = 'batch'".to_string()); } else if m.eq_ignore_ascii_case("stream") { where_parts.push("ifNull(mode,'batch') = 'stream'".to_string()); } }
    if let Some(text) = q.q.as_deref() { if !text.is_empty() { where_parts.push(format!("lower(ifNull(rule_name,name)) LIKE lower('%{}%')", text.replace("'","''"))); } }
    let lim = q.limit.unwrap_or(50).min(200);
    let mut sql = String::from("SELECT \
        ifNull(rule_id, id) as id, \
        ifNull(rule_name, name) as name, \
        ifNull(kql_query, compiled_sql) as compiled_sql, \
        ifNull(mode,'batch') as mode, tenant_scope, severity, enabled, ifNull(description,'') as description, \
        ifNull(source_format,'') as source_format, ifNull(original_rule,'') as original_rule, \
        ifNull(mapping_profile,'') as mapping_profile, ifNull(schedule_sec,60) as schedule_sec, ifNull(stream_window_sec,60) as stream_window_sec \
    FROM dev.alert_rules");
    if !where_parts.is_empty() { sql.push_str(" WHERE "); sql.push_str(&where_parts.join(" AND ")); }
    sql.push_str(&format!(" ORDER BY updated_at DESC LIMIT {} FORMAT JSON", lim));
    let client = reqwest::Client::new();
    let resp = client.get("http://localhost:8123/").query(&[("query", sql)]).send().await
        .map_err(|e| crate::error::PipelineError::database(format!("list rules http: {e}")))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(crate::error::PipelineError::database(format!("list rules ch {}: {}", status, txt)));
    }
    let text = resp.text().await.unwrap_or("{}".to_string());
    let v: serde_json::Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({"data":[]}));
    Ok(Json(v))
}

#[derive(serde::Deserialize)]
pub struct SigmaPack { pub items: Vec<String>, pub tenant_scope: Option<String>, pub mapping_profile: Option<String> }

/// POST /api/v2/admin/rules/import-sigma-pack - import multiple Sigma YAMLs
pub async fn import_sigma_pack(State(st): State<Arc<AppState>>, Json(p): Json<SigmaPack>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let mut created: Vec<String> = Vec::new();
    for sigma in p.items.iter() {
        let req = SigmaCreateRequest { sigma: sigma.clone(), allow_unmapped: true, mapping_profile: p.mapping_profile.clone(), tenant_scope: p.tenant_scope.clone(), tenant_ids: vec![], time_range: Some(SigmaTimeRange{ last_minutes: 15 }), tags: None };
        match sigma_create(State(st.clone()), Json(req)).await {
            Ok(Json(resp)) => created.push(resp.id),
            Err(_e) => { /* skip failed */ }
        }
    }
    Ok(Json(json!({"created": created.len(), "ids": created})))
}

#[derive(Deserialize)]
pub struct SigmaCompileRequest {
    pub sigma: String,
    #[serde(default)]
    pub allow_unmapped: bool,
    #[serde(default)]
    pub mapping_profile: Option<String>,
    #[serde(default)]
    pub tenant_ids: Vec<String>,
    #[serde(default)]
    pub time_range: Option<SigmaTimeRange>,
}

#[derive(serde::Serialize)]
pub struct SigmaCompileResponse {
    pub dsl: SearchDsl,
    pub sql: String,
    pub warnings: Vec<String>,
}

/// POST /api/v2/rules/sigma/compile - compile Sigma YAML to DSL + SQL
pub async fn sigma_compile(
    State(st): State<Arc<AppState>>,
    Json(req): Json<SigmaCompileRequest>,
) -> Result<Json<SigmaCompileResponse>, crate::error::PipelineError> {
    let mut warnings: Vec<String> = Vec::new();
    let y: serde_yaml::Value = serde_yaml::from_str(&req.sigma)
        .map_err(|e| crate::error::PipelineError::validation(format!("invalid sigma yaml: {e}")))?;
    // naive: detection.selection key-value
    let mut exprs: Vec<crate::v2::compiler::Expr> = Vec::new();
    if let Some(sel) = y.get("detection").and_then(|d| d.get("selection")) {
        if let Some(map) = sel.as_mapping() {
            for (k, v) in map {
                if let (Some(kstr), Some(vstr)) = (k.as_str(), v.as_str()) {
                    let field = map_sigma_field(kstr, req.mapping_profile.as_deref());
                    if field.mapped {
                        exprs.push(crate::v2::compiler::Expr::Eq((field.out, serde_json::Value::String(vstr.to_string()))));
                    } else if req.allow_unmapped {
                        warnings.push(format!("unmapped field: {}", kstr));
                    } else {
                        return Err(crate::error::PipelineError::validation(format!("unmapped field: {}", kstr)));
                    }
                }
            }
        }
    }
    let last_seconds = match &req.time_range { Some(tr) => (tr.last_minutes as u64)*60, _ => 900 };
    let dsl = SearchDsl { version: Some("1".into()), search: Some(crate::v2::compiler::SearchSection { time_range: Some(crate::v2::compiler::TimeRange::Last { last_seconds }), where_: if exprs.is_empty(){ None } else { Some(crate::v2::compiler::Expr::And(exprs)) }, tenant_ids: req.tenant_ids }), threshold: None, cardinality: None, sequence: None };
    match crate::v2::compiler::compile_search(&dsl, &st.events_table) {
        Ok(comp) => {
            metrics::inc_compile("sigma", "ok");
            Ok(Json(SigmaCompileResponse { dsl, sql: comp.sql, warnings }))
        }
        Err(e) => {
            metrics::inc_compile("sigma", "error");
            Err(crate::error::PipelineError::validation(e))
        }
    }
}

#[derive(Deserialize, Clone)]
pub struct SigmaTimeRange { pub last_minutes: u32 }

#[derive(Deserialize)]
pub struct SigmaCreateRequest {
    pub sigma: String,
    #[serde(default)]
    pub allow_unmapped: bool,
    #[serde(default)]
    pub mapping_profile: Option<String>,
    #[serde(default)]
    pub tenant_scope: Option<String>,
    #[serde(default)]
    pub tenant_ids: Vec<String>,
    #[serde(default)]
    pub time_range: Option<SigmaTimeRange>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(serde::Serialize)]
pub struct SigmaCreateResponse { pub id: String, pub status: String }

/// POST /api/v2/rules/sigma - create and store a Sigma rule (compiled to DSL/SQL)
pub async fn sigma_create(
    State(st): State<Arc<AppState>>,
    Json(req): Json<SigmaCreateRequest>,
) -> Result<Json<SigmaCreateResponse>, crate::error::PipelineError> {
    // Reuse compile logic
    let compile_req = SigmaCompileRequest {
        sigma: req.sigma.clone(),
        allow_unmapped: req.allow_unmapped,
        mapping_profile: req.mapping_profile.clone(),
        tenant_ids: req.tenant_ids.clone(),
        time_range: req.time_range.clone(),
    };
    let compiled = sigma_compile(State(st.clone()), Json(compile_req)).await?.0;
    let id = Uuid::new_v4().to_string();
    let tenant_scope = req.tenant_scope.unwrap_or_else(|| "all".to_string());
    // Severity from Sigma level if present in YAML (naive fallback)
    let mut severity = "MEDIUM".to_string();
    if let Ok(y) = serde_yaml::from_str::<serde_yaml::Value>(&req.sigma) {
        if let Some(lv) = y.get("level").and_then(|v| v.as_str()) { severity = lv.to_uppercase(); }
    }
    let _dsl_str = serde_json::to_string(&compiled.dsl).unwrap_or("{}".to_string());
    let compiled_sql = compiled.sql;
    let _now = chrono::Utc::now().timestamp() as u32;
    let _tags_json = serde_json::to_string(&req.tags.clone().unwrap_or_default()).unwrap_or("[]".to_string());
    // Insert into dev.alert_rules (legacy columns plus new sigma columns)
    let tenant_scope_sql = tenant_scope.replace("'","''");
    let rule_name = id.clone();
    let kql_query = compiled_sql.replace("'","''");
    let description = "generated from Sigma".to_string();
    let severity_sql = severity;
    let source_format = "SIGMA".to_string();
    let original_rule = req.sigma.replace("'","''");
    let mapping_profile = req.mapping_profile.clone().unwrap_or("default_cim_v1".to_string()).replace("'","''");
    // Format tags as ClickHouse Array(String) literal: ['a','b']
    let tags_vec = req.tags.clone().unwrap_or_default();
    let tags_sql = if tags_vec.is_empty() {
        "[]".to_string()
    } else {
        let inner = tags_vec
            .into_iter()
            .map(|t| format!("'{}'", t.replace('\'', "''")))
            .collect::<Vec<_>>()
            .join(",");
        format!("[{}]", inner)
    };
    let sql = format!(
        "INSERT INTO dev.alert_rules \
         (rule_id, tenant_scope, rule_name, kql_query, severity, enabled, description, \
          source_format, original_rule, mapping_profile, tags) \
         VALUES ('{id}', '{tenant_scope_sql}', '{rule_name}', '{kql_query}', '{severity_sql}', 1, '{description}', \
                 '{source_format}', '{original_rule}', '{mapping_profile}', {tags_sql})"
    );
    // Execute insert with POST and empty body to satisfy CH Content-Length
    let client = reqwest::Client::new();
    let ch_url = "http://localhost:8123/";
    let resp = client.post(ch_url)
        .query(&[("query", sql.clone())])
        .header("Content-Length", "0")
        .send().await
        .map_err(|e| crate::error::PipelineError::database(format!("insert rule failed: {e}")))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        tracing::error!(target="sigma_create", %status, ch_error=%txt, "ClickHouse error insert alert_rules");
        return Err(crate::error::map_clickhouse_http_error(status, &txt, Some(&sql)));
    }
    Ok(Json(SigmaCreateResponse { id, status: "created".to_string() }))
}

#[derive(Deserialize, Default)]
pub struct RuleRunRequest { pub limit: Option<u64> }

#[derive(serde::Serialize)]
pub struct DryRunResponse { pub id: String, pub sql: String, pub rows: u64 }

/// POST /api/v2/rules/{id}/dry-run - execute compiled SQL as count only
pub async fn rule_dry_run(
    State(_st): State<Arc<AppState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<Json<DryRunResponse>, crate::error::PipelineError> {
    let _req: RuleRunRequest = serde_json::from_slice(&body).unwrap_or_default();
    let client = reqwest::Client::new();
    // Fetch compiled SQL (compat across schemas)
    let fetch_sql = format!(
        "SELECT if(length(kql_query)>0,kql_query,compiled_sql) AS q, ifNull(dsl,'') AS dsl FROM dev.alert_rules WHERE rule_id = '{}' LIMIT 1 FORMAT JSON",
        id.replace("'","''")
    );
    let r = client.get("http://localhost:8123/").query(&[("query", fetch_sql.clone())]).send().await
        .map_err(|e| crate::error::PipelineError::database(format!("ch http: {e}")))?;
    if !r.status().is_success() { return Err(crate::error::PipelineError::database(format!("load rule {}", r.status()))); }
    let txt = r.text().await.unwrap_or_default();
    let v: serde_json::Value = serde_json::from_str(&txt).unwrap_or_default();
    let row0 = v.get("data").and_then(|a| a.as_array()).and_then(|a| a.first()).cloned().unwrap_or_else(|| json!({}));
    let mut q = row0.get("q").and_then(|s| s.as_str()).unwrap_or("").to_string();
    if q.is_empty() {
        // compile-on-read fallback if DSL exists
        if let Some(dsl_str) = row0.get("dsl").and_then(|s| s.as_str()) {
            if !dsl_str.is_empty() {
                if let Ok(dsl_obj) = serde_json::from_str::<SearchDsl>(dsl_str) {
                    let comp = crate::v2::compiler::compile_search(&dsl_obj, "dev.events")
                        .map_err(crate::error::PipelineError::validation)?;
                    q = comp.sql.replace('\'', "''");
                    // persist compiled_sql for next time
                    let up_sql = format!(
                        "ALTER TABLE dev.alert_rules UPDATE compiled_sql='{}' WHERE rule_id='{}'",
                        q, id.replace('\'', "''")
                    );
                    let _ = client
                        .post("http://localhost:8123/")
                        .query(&[("query", up_sql)])
                        .header("Content-Length", "0")
                        .send()
                        .await;
                }
            }
        }
    }
    if q.is_empty() {
        return Err(crate::error::PipelineError::validation(format!("rule not found (fetch_sql={})", fetch_sql)));
    }
    let count_sql = format!("SELECT count() as c FROM ({}) t SETTINGS max_execution_time=8 FORMAT JSON", q);
    let r2 = client.get("http://localhost:8123/").query(&[("query", count_sql)]).send().await
        .map_err(|e| crate::error::PipelineError::database(format!("ch http: {e}")))?;
    if !r2.status().is_success() { return Err(crate::error::PipelineError::database(format!("count {}", r2.status()))); }
    let txt2 = r2.text().await.unwrap_or_default();
    let v2: serde_json::Value = serde_json::from_str(&txt2).unwrap_or_default();
    let rows = v2.get("data").and_then(|a| a.as_array()).and_then(|a| a.first()).and_then(|r| r.get("c")).and_then(|n| n.as_u64()).unwrap_or(0);
    Ok(Json(DryRunResponse { id, sql: q.to_string(), rows }))
}

#[derive(serde::Serialize)]
pub struct RunNowResponse { pub id: String, pub inserted_alerts: u64 }

/// POST /api/v2/rules/{id}/run-now - execute compiled SQL and insert an aggregated alert row
pub async fn rule_run_now(
    State(_st): State<Arc<AppState>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<Json<RunNowResponse>, crate::error::PipelineError> {
    let req: RuleRunRequest = serde_json::from_slice(&body).unwrap_or_default();
    let client = reqwest::Client::new();
    // Fetch compiled SQL and severity/name
    let fetch_sql = format!(
        "SELECT if(length(kql_query)>0,kql_query,compiled_sql) AS q, ifNull(rule_name,name) AS name, ifNull(dsl,'') AS dsl, severity, ifNull(tenant_scope,'all') AS tenant_scope, ifNull(throttle_seconds,0) AS throttle_seconds, ifNull(dedup_key,'[]') AS dedup_key FROM dev.alert_rules WHERE rule_id = '{}' LIMIT 1 FORMAT JSON",
        id.replace("'","''")
    );
    let r = client.get("http://localhost:8123/").query(&[("query", fetch_sql.clone())]).send().await
        .map_err(|e| crate::error::PipelineError::database(format!("ch http: {e}")))?;
    if !r.status().is_success() { return Err(crate::error::PipelineError::database(format!("load rule {}", r.status()))); }
    let txt = r.text().await.unwrap_or_default();
    let v: serde_json::Value = serde_json::from_str(&txt).unwrap_or_default();
    let row = v.get("data").and_then(|a| a.as_array()).and_then(|a| a.first()).cloned().unwrap_or_else(|| json!({}));
    let mut q = row.get("q").and_then(|s| s.as_str()).unwrap_or("").to_string();
    if q.is_empty() {
        if let Some(dsl_str) = row.get("dsl").and_then(|s| s.as_str()) {
            if !dsl_str.is_empty() {
                if let Ok(dsl_obj) = serde_json::from_str::<SearchDsl>(dsl_str) {
                    let comp = crate::v2::compiler::compile_search(&dsl_obj, "dev.events")
                        .map_err(crate::error::PipelineError::validation)?;
                    q = comp.sql.replace('\'', "''");
                    let up_sql = format!(
                        "ALTER TABLE dev.alert_rules UPDATE compiled_sql='{}' WHERE rule_id='{}'",
                        q, id.replace('\'', "''")
                    );
                    let _ = client
                        .post("http://localhost:8123/")
                        .query(&[("query", up_sql)])
                        .header("Content-Length", "0")
                        .send()
                        .await;
                }
            }
        }
    }
    if q.is_empty() {
        return Err(crate::error::PipelineError::validation(format!("rule not found (fetch_sql={})", fetch_sql)));
    }
    let name = row.get("name").and_then(|s| s.as_str()).unwrap_or(&id);
    let severity = row.get("severity").and_then(|s| s.as_str()).unwrap_or("MEDIUM");
    let throttle_seconds: u64 = row.get("throttle_seconds").and_then(|n| n.as_u64()).unwrap_or(0);
    let _dedup_key = row.get("dedup_key").and_then(|s| s.as_str()).unwrap_or("[]");
    let limit = req.limit.unwrap_or(50).min(1000);
    // Fetch sample event refs
    let events_sql = format!("SELECT event_id, event_timestamp, tenant_id, source_type FROM ({}) t LIMIT {} FORMAT JSON", q, limit);
    let r2 = client.get("http://localhost:8123/").query(&[("query", events_sql)]).send().await
        .map_err(|e| crate::error::PipelineError::database(format!("events http: {e}")))?;
    if !r2.status().is_success() { return Err(crate::error::PipelineError::database(format!("events {}", r2.status()))); }
    let txt2 = r2.text().await.unwrap_or_default();
    let v2: serde_json::Value = serde_json::from_str(&txt2).unwrap_or_default();
    let arr = v2.get("data").and_then(|a| a.as_array()).cloned().unwrap_or_default();
    let rows: Vec<EventRow> = arr.into_iter().filter_map(|v| serde_json::from_value::<EventRow>(v).ok()).collect();
    // Build aggregated alert row
    let _alert_id = Uuid::new_v4().to_string();
    let alert_title = name.replace("'","''");
    let alert_description = format!("Run-now alert for rule {}", alert_title).replace("'","''");
    // If no matches, skip insert and mark no_results
    if rows.is_empty() {
        crate::v2::metrics::inc_rules_run(&id, "default", "error", "no_results");
        return Ok(Json(RunNowResponse { id, inserted_alerts: 0 }));
    }
    let event_refs = build_event_refs_json(&rows).replace("'","''");
    let now_ts = chrono::Utc::now().timestamp() as u64;
    let alert_ts = now_ts as u32;
    // Insert one alert per tenant in result set (naive: use first tenant_id if mixed)
    let tenant_id = rows.first().map(|r| r.tenant_id.as_str()).unwrap_or("default");
    // Dedup + throttle windowing
    let dedup_basis = format!("{}|{}", id, tenant_id);
    let hash = blake3::hash(dedup_basis.as_bytes());
    let dedup_hash = format!("{:016x}", u64::from_le_bytes(hash.as_bytes()[0..8].try_into().unwrap()));
    let window = if throttle_seconds > 0 { now_ts / throttle_seconds.max(1) } else { now_ts / 60 }; // 1-min window if no throttle
    let stable_alert_id = blake3::hash(format!("{}:{}", dedup_hash, window).as_bytes()).to_hex().to_string();
    // Check last alert ts for throttle suppression
    let last_state_sql = format!(
        "SELECT last_alert_ts FROM dev.rule_state WHERE rule_id='{}' AND tenant_id='{}' ORDER BY updated_at DESC LIMIT 1 FORMAT JSON",
        id.replace("'","''"), tenant_id.replace("'","''")
    );
    let rstate = client.get("http://localhost:8123/").query(&[("query", last_state_sql)]).send().await
        .map_err(|e| crate::error::PipelineError::database(format!("rule_state http: {e}")))?;
    let mut suppressed = false;
    if rstate.status().is_success() {
        let txts = rstate.text().await.unwrap_or_default();
        if let Ok(vs) = serde_json::from_str::<serde_json::Value>(&txts) {
            if let Some(ts) = vs.get("data").and_then(|a| a.as_array()).and_then(|a| a.first()).and_then(|r| r.get("last_alert_ts")).and_then(|n| n.as_u64()) {
                if throttle_seconds > 0 && now_ts.saturating_sub(ts) < throttle_seconds { suppressed = true; }
            }
        }
    }
    if suppressed {
        crate::v2::metrics::inc_rules_run(&id, tenant_id, "ok", "");
        return Ok(Json(RunNowResponse { id, inserted_alerts: 0 }));
    }
    let insert_sql = format!(
        "INSERT INTO dev.alerts (alert_id, tenant_id, rule_id, alert_title, alert_description, event_refs, severity, status, alert_timestamp, created_at, updated_at) \
         VALUES ('{aid}','{tenant}','{rid}','{title}','{desc}','{erefs}','{sev}','OPEN',{ts},{ts},{ts})",
        aid = stable_alert_id.replace("'","''"), tenant = tenant_id.replace("'","''"), rid = id.replace("'","''"), title = alert_title, desc = alert_description, erefs = event_refs, sev = severity.to_uppercase(), ts = alert_ts
    );
    let r3 = client.post("http://localhost:8123/").query(&[("query", insert_sql)]).header("Content-Length","0").send().await
        .map_err(|e| crate::error::PipelineError::database(format!("insert alert http: {e}")))?;
    if !r3.status().is_success() { return Err(crate::error::PipelineError::database(format!("insert alert {}", r3.status()))); }
    // Update rule_state with checkpoint
    let up_state = format!(
        "INSERT INTO dev.rule_state (rule_id, tenant_id, last_run_ts, last_success_ts, last_error, last_sql, dedup_hash, last_alert_ts, updated_at) \
         VALUES ('{rid}','{tenant}',{now_ts},{now_ts},'', '{sql}', '{dh}', {now_ts}, toUInt32(now()))",
        rid = id.replace("'","''"), tenant = tenant_id.replace("'","''"), now_ts = alert_ts, sql = q.replace("'","''"), dh = dedup_hash
    );
    let _ = client.post("http://localhost:8123/").query(&[("query", up_state)]).header("Content-Length","0").send().await;
    // Metrics: count this run and alert
    crate::v2::metrics::inc_rules_run(&id, tenant_id, "ok", "");
    crate::v2::metrics::inc_alerts(&id, tenant_id, 1);
    Ok(Json(RunNowResponse { id, inserted_alerts: 1 }))
}

// ---- Rules CRUD (generic, non-Sigma) ----
#[cfg(test)]
mod tests {
    use super::{build_event_refs_json, EventRow};
    #[test]
    fn event_refs_empty_on_no_rows() {
        let s = build_event_refs_json(&[]);
        assert_eq!(s, "[]");
    }
    #[test]
    fn event_refs_non_empty_on_matches() {
        let rows = vec![EventRow{ event_id: "e1".into(), event_timestamp: 123, tenant_id: "t".into(), source_type: Some("app".into()) }];
        let s = build_event_refs_json(&rows);
        assert!(s.starts_with('[') && s.ends_with(']') && s.contains("e1"));
    }
}


#[derive(Deserialize)]
pub struct CreateRuleRequest {
    pub name: String,
    pub tenant_scope: Option<String>,
    pub severity: Option<String>,
    pub enabled: Option<u8>,
    pub description: Option<String>,
    pub schedule_sec: Option<u32>,
    pub throttle_seconds: Option<u32>,
    pub dedup_key: Option<String>,
    pub tags: Option<Vec<String>>,
    // Provide either compiled_sql or dsl
    pub compiled_sql: Option<String>,
    pub dsl: Option<crate::v2::compiler::SearchDsl>,
}

#[derive(serde::Serialize)]
pub struct CreateRuleResponse { pub id: String, pub status: String }

/// POST /api/v2/rules - create a rule from compiled_sql or DSL
pub async fn create_rule(
    State(_st): State<Arc<AppState>>,
    Json(req): Json<CreateRuleRequest>,
) -> Result<Json<CreateRuleResponse>, crate::error::PipelineError> {
    let id = Uuid::new_v4().to_string();
    let name = req.name.replace('\'', "''");
    let tenant_scope = req.tenant_scope.unwrap_or_else(|| "all".to_string()).replace('\'', "''");
    let severity = req.severity.unwrap_or_else(|| "MEDIUM".to_string()).to_uppercase();
    let enabled = req.enabled.unwrap_or(1);
    let description = req.description.unwrap_or_default().replace('\'', "''");
    let schedule_sec = req.schedule_sec.unwrap_or(60);
    let throttle_seconds = req.throttle_seconds.unwrap_or(0);
    let dedup_key = req.dedup_key.unwrap_or_else(|| "[]".to_string()).replace('\'', "''");
    let compiled_sql = if let Some(sql) = req.compiled_sql { sql } else if let Some(dsl) = req.dsl { crate::v2::compiler::compile_search(&dsl, "dev.events").map_err(crate::error::PipelineError::validation)?.sql } else { String::new() };
    if compiled_sql.is_empty() { return Err(crate::error::PipelineError::validation("compiled_sql or dsl required")); }
    let compiled_sql = compiled_sql.replace('\'', "''");
    // Format tags
    let tags_sql = if let Some(tags) = req.tags { if tags.is_empty() { "[]".to_string() } else { format!("[{}]", tags.into_iter().map(|t| format!("'{}'", t.replace('\'', "''"))).collect::<Vec<_>>().join(",")) } } else { "[]".to_string() };
    // Insert with explicit columns compatible with provided schema (persist compiled_sql, source_format, mapping_profile)
    let sql = format!(
        "INSERT INTO dev.alert_rules (rule_id, id, tenant_scope, rule_name, name, kql_query, severity, enabled, description, created_at, updated_at, source_format, original_rule, mapping_profile, tags, dsl, compiled_sql, schedule_sec, throttle_seconds, dedup_key) \
         VALUES ('{id}','{id}','{tenant_scope}','{name}','{name}','{compiled}','{sev}',{enabled},'{desc}', now(), now(), 'DSL','', 'default_cim_v1', {tags}, '', '{compiled}', {sched}, {throttle}, '{dedup}')",
        id=id, tenant_scope=tenant_scope, name=name, sev=severity, enabled=enabled, desc=description, compiled=compiled_sql, tags=tags_sql, sched=schedule_sec, throttle=throttle_seconds, dedup=dedup_key
    );
    let client = reqwest::Client::new();
    let resp = client.post("http://localhost:8123/").query(&[("query", sql)]).header("Content-Length","0").send().await
        .map_err(|e| crate::error::PipelineError::database(format!("insert rule http: {e}")))?;
    if !resp.status().is_success() { return Err(crate::error::PipelineError::database(format!("insert rule {}", resp.status()))); }
    Ok(Json(CreateRuleResponse { id, status: "created".to_string() }))
}

/// GET /api/v2/rules/{id}
pub async fn get_rule(Path(id): Path<String>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let sql = format!("SELECT * FROM dev.alert_rules WHERE ifNull(rule_id,id) = '{}' FORMAT JSON", id.replace('\'', "''"));
    let client = reqwest::Client::new();
    let resp = client.get("http://localhost:8123/").query(&[("query", sql)]).send().await
        .map_err(|e| crate::error::PipelineError::database(format!("ch http: {e}")))?;
    if !resp.status().is_success() { return Err(crate::error::PipelineError::database(format!("load rule {}", resp.status()))); }
    let txt = resp.text().await.unwrap_or_default();
    let v: serde_json::Value = serde_json::from_str(&txt).unwrap_or_else(|_| json!({"data":[]}));
    Ok(Json(v))
}

#[derive(Deserialize)]
pub struct PatchRuleRequest {
    pub name: Option<String>,
    pub severity: Option<String>,
    pub enabled: Option<u8>,
    pub description: Option<String>,
    pub schedule_sec: Option<u32>,
    pub throttle_seconds: Option<u32>,
    pub lifecycle: Option<String>,
}

/// PATCH /api/v2/rules/{id}
pub async fn patch_rule(
    Path(id): Path<String>,
    Json(p): Json<PatchRuleRequest>,
) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let mut sets: Vec<String> = Vec::new();
    if let Some(v) = p.name { sets.push(format!("name='{}'", v.replace('\'', "''"))); }
    if let Some(v) = p.severity { sets.push(format!("severity='{}'", v.to_uppercase().replace('\'', "''"))); }
    if let Some(v) = p.enabled { sets.push(format!("enabled={}", v)); }
    if let Some(v) = p.description { sets.push(format!("description='{}'", v.replace('\'', "''"))); }
    if let Some(v) = p.schedule_sec { sets.push(format!("schedule_sec={}", v)); }
    if let Some(v) = p.throttle_seconds { sets.push(format!("throttle_seconds={}", v)); }
    if let Some(v) = p.lifecycle { sets.push(format!("lifecycle='{}'", v.replace('\'', "''"))); }
    if sets.is_empty() { return Ok(Json(json!({"ok": true}))); }
    sets.push("updated_at=toUInt32(now())".to_string());
    let sql = format!("ALTER TABLE dev.alert_rules UPDATE {} WHERE ifNull(rule_id,id)='{}'", sets.join(","), id.replace('\'', "''"));
    let client = reqwest::Client::new();
    let resp = client.post("http://localhost:8123/").query(&[("query", sql)]).header("Content-Length","0").send().await
        .map_err(|e| crate::error::PipelineError::database(format!("ch http: {e}")))?;
    if !resp.status().is_success() { return Err(crate::error::PipelineError::database(format!("patch rule {}", resp.status()))); }
    Ok(Json(json!({"ok": true})))
}

/// DELETE /api/v2/rules/{id}
pub async fn delete_rule(Path(id): Path<String>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let sql = format!("ALTER TABLE dev.alert_rules DELETE WHERE ifNull(rule_id,id) = '{}'", id.replace('\'', "''"));
    let client = reqwest::Client::new();
    let resp = client.post("http://localhost:8123/").query(&[("query", sql)]).header("Content-Length","0").send().await
        .map_err(|e| crate::error::PipelineError::database(format!("ch http: {e}")))?;
    if !resp.status().is_success() { return Err(crate::error::PipelineError::database(format!("delete rule {}", resp.status()))); }
    Ok(Json(json!({"ok": true})))
}
struct FieldMapRes { mapped: bool, out: String }
fn map_sigma_field(name: &str, _profile: Option<&str>) -> FieldMapRes {
    let out = match name {
        "user.name" => "user_name",
        "user.id" => "user_id",
        "source.ip" => "source_ip",
        "destination.ip" => "destination_ip",
        "source.port" => "source_port",
        "destination.port" => "dest_port",
        "network.protocol" => "protocol",
        "event.category" => "event_category",
        "event.action" => "event_action",
        "event.outcome" => "event_outcome",
        "log.severity" => "severity",
        "message" => "message",
        other => other,
    };
    FieldMapRes { mapped: out != name || matches!(name, "message"), out: out.to_string() }
}


