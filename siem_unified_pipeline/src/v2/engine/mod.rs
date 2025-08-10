/// v2 Rules Engine scheduler and execution entry points
///
/// This module scans enabled rules in `dev.alert_rules`, executes their compiled SQL
/// when due (based on `schedule_sec`) and writes aggregated alerts to `dev.alerts`.
/// It records checkpoints in `dev.rule_state` with last_run_ts/last_success_ts,
/// last_error, last_sql, and throttles based on `throttle_seconds`.
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use chrono::Utc;
use sha2::{Digest, Sha256};
use tokio::sync::Semaphore;

use crate::v2::state::AppState;

/// Expand a tenant scope string into concrete tenant IDs.
/// - If scope == "all", returns `recent_tenants`.
/// - Otherwise returns a single-element vec with `scope`.
/// Pure helper for unit testing; DB querying for recent_tenants is done elsewhere.
pub fn expand_tenant_scope(scope: &str, recent_tenants: &[String]) -> Vec<String> {
    if scope.eq_ignore_ascii_case("all") {
        recent_tenants.to_vec()
    } else {
        vec![scope.to_string()]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunNowRequest { pub rule_id: String, pub tenant_ids: Vec<String>, pub max_rows: Option<u32> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DryRunResponse { pub rows: usize, pub sql: String, pub timings_ms: u64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RuleRow {
    id: String,
    name: String,
    compiled_sql: String,
    enabled: u8,
    schedule_sec: u32,
    throttle_seconds: u32,
    severity: String,
}

/// Start the background scheduler if enabled. Non-blocking. Safe to call multiple times.
pub async fn run_scheduler(_state: Arc<AppState>) {
    let enabled = std::env::var("RULE_SCHEDULER").unwrap_or_else(|_| "1".into()) == "1";
    if !enabled { return; }
    let concurrency: usize = std::env::var("SCHED_CONCURRENCY").ok().and_then(|s| s.parse().ok()).unwrap_or(4).max(1);
    let sem = Arc::new(Semaphore::new(concurrency));
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        loop {
            let now = Utc::now().timestamp() as u32;
            // Load enabled rules with compatibility for legacy/new columns
            let sql = "SELECT ifNull(rule_id,id) as id, ifNull(rule_name,name) as name, ifNull(kql_query,compiled_sql) as compiled_sql, enabled, ifNull(schedule_sec,60) as schedule_sec, ifNull(throttle_seconds,0) as throttle_seconds, ifNull(severity,'MEDIUM') as severity, ifNull(tenant_scope,'all') as tenant_scope FROM dev.alert_rules WHERE enabled = 1 FORMAT JSON";
            match client.get("http://localhost:8123/").query(&[("query", sql.to_string())]).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let text = resp.text().await.unwrap_or_default();
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
                            for r in arr {
                                let id = r.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                                let name = r.get("name").and_then(|x| x.as_str()).unwrap_or(&id).to_string();
                                let q = r.get("compiled_sql").and_then(|x| x.as_str()).unwrap_or("").to_string();
                                let schedule_sec = r.get("schedule_sec").and_then(|x| x.as_u64()).unwrap_or(60) as u32;
                                let throttle_seconds = r.get("throttle_seconds").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                let severity = r.get("severity").and_then(|x| x.as_str()).unwrap_or("MEDIUM").to_string();
                                if id.is_empty() || q.is_empty() { continue; }
                                let tenant_scope = r.get("tenant_scope").and_then(|x| x.as_str()).unwrap_or("all").to_string();
                                // Expand 'all' to recent distinct tenants (last 7 days) to avoid tenant="all" errors
                                let tenants: Vec<String> = if tenant_scope.eq_ignore_ascii_case("all") {
                                    let t_sql = "SELECT DISTINCT tenant_id FROM dev.events WHERE event_timestamp >= toUInt32(now()) - 7*24*3600 LIMIT 1000 FORMAT JSON";
                                    match client.get("http://localhost:8123/").query(&[("query", t_sql.to_string())]).send().await {
                                        Ok(t_resp) if t_resp.status().is_success() => {
                                            if let Ok(t_text) = t_resp.text().await {
                                                if let Ok(tv) = serde_json::from_str::<serde_json::Value>(&t_text) {
                                                    let recents: Vec<String> = tv.get("data").and_then(|a| a.as_array()).map(|rows| rows.iter().filter_map(|r| r.get("tenant_id").and_then(|s| s.as_str()).map(|s| s.to_string())).collect()).unwrap_or_default();
                                                    expand_tenant_scope("all", &recents)
                                                } else { vec!["default".to_string()] }
                                            } else { vec!["default".to_string()] }
                                        }
                                        _ => vec!["default".to_string()],
                                    }
                                } else {
                                    expand_tenant_scope(&tenant_scope, &[])
                                };
                                for tenant in tenants {
                                    let _t_tick = std::time::Instant::now();
                                    // Tenant-filtered query
                                    let filtered_q = if tenant == "all" { q.clone() } else { format!("SELECT * FROM ({}) t WHERE tenant_id = '{}'", q, tenant.replace("'","''")) };
                                    // Check rule_state for this tenant
                                    let st_sql = format!("SELECT last_run_ts, last_alert_ts, dedup_hash FROM dev.rule_state WHERE rule_id = '{}' AND tenant_id = '{}' LIMIT 1 FORMAT JSON", id.replace("'","''"), tenant.replace("'","''"));
                                    let (mut last_run_ts, mut last_alert_ts, mut last_dedup): (u32,u32,String) = (0,0,String::new());
                                    if let Ok(st_resp) = client.get("http://localhost:8123/").query(&[("query", st_sql)]).send().await {
                                        if st_resp.status().is_success() {
                                            if let Ok(st_text) = st_resp.text().await {
                                                if let Ok(stv) = serde_json::from_str::<serde_json::Value>(&st_text) {
                                                    if let Some(row) = stv.get("data").and_then(|a| a.as_array()).and_then(|a| a.first()) {
                                                        last_run_ts = row.get("last_run_ts").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                                        last_alert_ts = row.get("last_alert_ts").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                                        last_dedup = row.get("dedup_hash").and_then(|x| x.as_str()).unwrap_or("").to_string();
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    if now.saturating_sub(last_run_ts) < schedule_sec { continue; }
                                    // Compute catch-up windows up to MAX_CATCHUP_WINDOWS
                                    let max_windows: u32 = std::env::var("MAX_CATCHUP_WINDOWS").ok().and_then(|s| s.parse().ok()).unwrap_or(12);
                                    let mut windows: Vec<(u32,u32)> = Vec::new();
                                    let mut t = if last_run_ts == 0 { now.saturating_sub(schedule_sec) } else { last_run_ts + schedule_sec };
                                    while t < now && (windows.len() as u32) < max_windows { windows.push((t, t + schedule_sec)); t += schedule_sec; }
                                    crate::v2::metrics::set_scheduler_windows(&id, &tenant, windows.len() as i64);
                                    // Spawn per-tenant worker with semaphore guard
                                    let permit = match sem.clone().acquire_owned().await { Ok(p) => p, Err(_) => continue };
                                    let client_c = client.clone(); let id_c = id.clone(); let tenant_c = tenant.clone(); let name_c = name.clone(); let q_c = filtered_q.clone();
                                    let last_alert_ts_c = last_alert_ts; let last_dedup_c = last_dedup.clone(); let severity_c = severity.clone();
                                    tokio::spawn(async move {
                                        let _permit = permit;
                                        let mut last_alert_ts_local = last_alert_ts_c;
                                        // Dedup basis
                                        let mut hasher = Sha256::new(); hasher.update(id_c.as_bytes()); hasher.update(b":"); hasher.update(tenant_c.as_bytes());
                                        let dedup_hash = format!("{:x}", hasher.finalize());
                                        for (ws, we) in windows.into_iter() {
                                            // Optional Redis lease: avoid duplicate processing across nodes
                                            let use_redis = std::env::var("SCHEDULER_REDIS").ok().map(|v| v=="1").unwrap_or(false) && std::env::var("REDIS_URL").is_ok();
                                            if use_redis {
                                                if let Ok(client) = redis::Client::open(std::env::var("REDIS_URL").unwrap()) {
                                                    if let Ok(mut con) = client.get_async_connection().await {
                                                        let key = format!("sched:{}:{}:{}", id_c, tenant_c, ws);
                                                        let set: Result<String, _> = redis::cmd("SET").arg(&key).arg("1").arg("NX").arg("EX").arg(30).query_async(&mut con).await;
                                                        if set.is_err() {
                                                            crate::v2::metrics::inc_scheduler_lease_conflict(&id_c, &tenant_c);
                                                            continue;
                                                        }
                                                    }
                                                }
                                            }
                                            let count_sql = format!("SELECT count() as c FROM ({}) t WHERE event_timestamp >= {} AND event_timestamp < {} SETTINGS max_execution_time=8 FORMAT JSON", q_c, ws, we);
                                            let mut rows_count: u64 = 0;
                                            match client_c.get("http://localhost:8123/").query(&[("query", count_sql.clone())]).send().await {
                                                Ok(c_resp) if c_resp.status().is_success() => {
                                                    if let Ok(ctext) = c_resp.text().await {
                                                        if let Ok(cv) = serde_json::from_str::<serde_json::Value>(&ctext) {
                                                            rows_count = cv.get("data").and_then(|a| a.as_array()).and_then(|a| a.first()).and_then(|r| r.get("c")).and_then(|n| n.as_u64()).unwrap_or(0);
                                                        }
                                                    }
                                                }
                                                Ok(other) => { let _ = client_c.post("http://localhost:8123/").query(&[("query", format!("INSERT INTO dev.rule_state (rule_id, tenant_id, last_run_ts, last_success_ts, last_error, last_sql, dedup_hash, last_alert_ts, updated_at) VALUES ('{}','{}',{},0,'{}','{}','',{},{} )", id_c.replace("'","''"), tenant_c.replace("'","''"), we, other.status(), count_sql.replace("'","''"), last_alert_ts_local, we))]).header("Content-Length","0").send().await; crate::v2::metrics::inc_rules_run(&id_c, &tenant_c, "error", "clickhouse"); let j: u64 = 100 + (rand::random::<u64>() % 200); tokio::time::sleep(std::time::Duration::from_millis(j)).await; continue }
                                                Err(_) => { let j: u64 = 100 + (rand::random::<u64>() % 200); tokio::time::sleep(std::time::Duration::from_millis(j)).await; continue }
                                            }
                                            if rows_count == 0 { continue; }
                                            if throttle_seconds > 0 && we.saturating_sub(last_alert_ts_local) < throttle_seconds && dedup_hash == last_dedup_c { continue; }
                                            // Deterministic alert id: blake3(rule|tenant|window_start)
                                            let stable_alert_id = blake3::hash(format!("{}:{}:{}", id_c, tenant_c, ws).as_bytes()).to_hex().to_string();
                                            let title = name_c.replace("'","''");
                                            let desc = format!("Scheduled alert for rule {}", title).replace("'","''");
                                            let insert_sql = format!("INSERT INTO dev.alerts (alert_id, tenant_id, rule_id, alert_title, alert_description, event_refs, severity, status, alert_timestamp, created_at, updated_at) VALUES ('{}','{}','{}','{}','{}','[]','{}','OPEN',{},{},{})", stable_alert_id.replace("'","''"), tenant_c.replace("'","''"), id_c.replace("'","''"), title, desc, severity_c.to_uppercase(), we, we, we);
                                            let _ = client_c.post("http://localhost:8123/").query(&[("query", insert_sql)]).header("Content-Length","0").send().await;
                                            crate::v2::metrics::inc_alerts(&id_c, &tenant_c, 1);
                                            last_alert_ts_local = we;
                                            let _ = client_c.post("http://localhost:8123/").query(&[("query", format!("INSERT INTO dev.rule_state (rule_id, tenant_id, last_run_ts, last_success_ts, last_error, last_sql, dedup_hash, last_alert_ts, updated_at) VALUES ('{}','{}',{},{},'','{}','{}',{},{} )", id_c.replace("'","''"), tenant_c.replace("'","''"), we, we, q_c.replace("'","''"), dedup_hash, last_alert_ts_local, we))]).header("Content-Length","0").send().await;
                                            crate::v2::metrics::inc_rules_run(&id_c, &tenant_c, "ok", "");
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::expand_tenant_scope;
    #[test]
    fn expands_all_to_recent_tenants() {
        let recent = vec!["t1".to_string(), "t2".to_string()];
        let out = expand_tenant_scope("all", &recent);
        assert_eq!(out, recent);
    }
    #[test]
    fn leaves_concrete_scope_as_is() {
        let out = expand_tenant_scope("default", &["t1".to_string(), "t2".to_string()]);
        assert_eq!(out, vec!["default".to_string()]);
    }
}


