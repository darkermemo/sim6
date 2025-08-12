/// v2 Rules Engine scheduler and execution entry points
///
/// This module scans enabled rules in `dev.alert_rules`, executes their compiled SQL
/// when due (based on `schedule_sec`) and writes aggregated alerts to `dev.alerts`.
/// It records checkpoints in `dev.rule_state` with last_run_ts/last_success_ts,
/// last_error, last_sql, and throttles based on `throttle_seconds`.
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use chrono::Utc;
use tokio::sync::Semaphore;

use crate::v2::state::AppState;
use crate::v2::util::lock::{try_lock, unlock, rule_lock_key};
use crate::v2::metrics;

/// Expand a tenant scope string into concrete tenant IDs.
/// - If scope == "all", returns `recent_tenants`.
/// - Otherwise returns a single-element vec with `scope`.
///
/// Pure helper for unit testing; DB querying for `recent_tenants` is done elsewhere.
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
pub async fn run_scheduler(state: Arc<AppState>) {
    let enabled = std::env::var("RULE_SCHEDULER").unwrap_or_else(|_| "1".into()) == "1";
    if !enabled { return; }
    let concurrency: usize = std::env::var("SCHED_CONCURRENCY").ok().and_then(|s| s.parse().ok()).unwrap_or(4).max(1);
    let sem = Arc::new(Semaphore::new(concurrency));
    let state = state.clone();
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        loop {
            let now = Utc::now().timestamp() as u32;
            const SAFETY_LAG_SECS: u32 = 120;
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
                                let _throttle_seconds = r.get("throttle_seconds").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
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
                                    let st_sql = format!("SELECT last_run_ts, last_alert_ts, dedup_hash, watermark_ts FROM dev.rule_state WHERE rule_id = '{}' AND tenant_id = '{}' LIMIT 1 FORMAT JSON", id.replace("'","''"), tenant.replace("'","''"));
                                    let (mut last_run_ts, mut _last_alert_ts, mut _last_dedup): (u32,u32,String) = (0,0,String::new());
                                    let mut watermark_ts: u32 = 0;
                                    if let Ok(st_resp) = client.get("http://localhost:8123/").query(&[("query", st_sql)]).send().await {
                                        if st_resp.status().is_success() {
                                            if let Ok(st_text) = st_resp.text().await {
                                                if let Ok(stv) = serde_json::from_str::<serde_json::Value>(&st_text) {
                                                    if let Some(row) = stv.get("data").and_then(|a| a.as_array()).and_then(|a| a.first()) {
                                                        last_run_ts = row.get("last_run_ts").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                                        _last_alert_ts = row.get("last_alert_ts").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                                        _last_dedup = row.get("dedup_hash").and_then(|x| x.as_str()).unwrap_or("").to_string();
                                                        watermark_ts = row.get("watermark_ts").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    // PR-04: Process single window at a time with anti-join dedupe
                                    if now.saturating_sub(last_run_ts) < schedule_sec { continue; }
                                    
                                    const BOOTSTRAP_LOOKBACK_SECS: u32 = 600;
                                    let safety_upper = now.saturating_sub(SAFETY_LAG_SECS);
                                    let effective_wm = if watermark_ts == 0 { safety_upper.saturating_sub(BOOTSTRAP_LOOKBACK_SECS) } else { watermark_ts };
                                    
                                    if effective_wm >= safety_upper { continue; } // Nothing new to process
                                    
                                    // Spawn per-tenant worker with semaphore guard
                                    let permit = match sem.clone().acquire_owned().await { Ok(p) => p, Err(_) => continue };
                                    let client_c = client.clone(); 
                                    let id_c = id.clone(); 
                                    let tenant_c = tenant.clone(); 
                                    let name_c = name.clone(); 
                                    let q_c = filtered_q.clone();
                                    let severity_c = severity.clone();
                                    let state_c = state.clone();
                                    
                                    tokio::spawn(async move {
                                        let _permit = permit;
                                        
                                        // Distributed lock to prevent concurrent execution across instances
                                        let lock_key = rule_lock_key(&tenant_c, &id_c);
                                        let lock_acquired = match try_lock(&state_c, &lock_key, 30000).await {
                                            Ok(acquired) => acquired,
                                            Err(e) => {
                                                eprintln!("Failed to acquire lock for rule {}: {}", id_c, e);
                                                metrics::inc_lock_total("scheduler", "error");
                                                return;
                                            }
                                        };
                                        
                                        if !lock_acquired {
                                            metrics::inc_lock_total("scheduler", "blocked");
                                            return; // Another instance is processing this rule
                                        }
                                        
                                        metrics::inc_lock_total("scheduler", "acquired");
                                        
                                        // Create a guard that will unlock on drop
                                        struct UnlockGuard {
                                            state: Arc<AppState>,
                                            key: String,
                                        }
                                        
                                        impl Drop for UnlockGuard {
                                            fn drop(&mut self) {
                                                let state = self.state.clone();
                                                let key = self.key.clone();
                                                tokio::spawn(async move {
                                                    let _ = unlock(&state, &key).await;
                                                });
                                            }
                                        }
                                        
                                        let _unlock_guard = UnlockGuard {
                                            state: state_c.clone(),
                                            key: lock_key.clone(),
                                        };
                                        
                                        // Also use local mutex as fallback
                                        let local_lock_key = format!("rule_exec:{}:{}", tenant_c, id_c);
                                        let _rule_guard = crate::v2::util::keylock::lock_key(&local_lock_key).await;
                                        
                                        let ws_ms = (effective_wm as i64) * 1000;
                                        let we_ms = (safety_upper as i64) * 1000;
                                        
                                        // PR-04: Query with anti-join dedupe
                                        let query_sql = format!(
                                            r#"WITH
  cast('{tenant_id}' AS String) AS ten,
  cast('{rule_id}' AS String) AS rid,
  toDateTime64({watermark_ms}/1000.0, 3) AS wm,
  toDateTime64({upper_ms}/1000.0, 3) AS upper
SELECT
  e.event_id,
  e.tenant_id,
  rid AS rule_id,
  coalesce(e.source_ip, e.message, hex(e.event_id)) AS alert_key,
  cityHash64(rid, alert_key, toStartOfInterval(e.event_timestamp, INTERVAL 5 MINUTE)) AS dedupe_hash64,
  max(toUnixTimestamp64Milli(e.event_timestamp)) OVER () as max_event_ts,
  e.message
FROM ({compiled_sql}) AS e
WHERE e.tenant_id = ten
  AND e.event_timestamp > wm
  AND e.event_timestamp <= upper
  AND cityHash64(rid, coalesce(e.source_ip, e.message, hex(e.event_id)), 
                 toStartOfInterval(e.event_timestamp, INTERVAL 5 MINUTE)) NOT IN
      ( SELECT dedupe_hash64 FROM dev.alerts
        WHERE tenant_id = ten
          AND rule_id = rid
          AND created_at > toUInt32(toUnixTimestamp(wm - INTERVAL 10 MINUTE))
          AND created_at <= toUInt32(toUnixTimestamp(upper + INTERVAL 10 MINUTE)) )
ORDER BY e.event_timestamp ASC
LIMIT 100 FORMAT JSON"#,
                                            watermark_ms = ws_ms,
                                            upper_ms = we_ms,
                                            compiled_sql = q_c,
                                            tenant_id = tenant_c.replace("'", "''"),
                                            rule_id = id_c.replace("'", "''")
                                        );
                                        
                                        // Debug SQL capture
                                        let debug = std::env::var("SIEM_DEBUG_SQL").ok().as_deref() == Some("1");
                                        let art_dir = std::path::Path::new("../target/test-artifacts");
                                        if debug {
                                            std::fs::create_dir_all(art_dir).ok();
                                            let tag = format!("wm_sql_sched_{}", chrono::Utc::now().timestamp_millis());
                                            std::fs::write(art_dir.join(format!("{tag}.sql")), &query_sql).ok();
                                        }
                                        
                                        match client_c.get("http://localhost:8123/").query(&[("query", query_sql.clone())]).send().await {
                                            Ok(resp) if resp.status().is_success() => {
                                                if let Ok(text) = resp.text().await {
                                                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                                                        let rows = v.get("data").and_then(|a| a.as_array()).cloned().unwrap_or_default();
                                                        
                                                        // Extract max event timestamp from candidates
                                                        let max_candidate_ts = rows.first()
                                                            .and_then(|r| r.get("max_event_ts"))
                                                            .and_then(|t| t.as_i64())
                                                            .unwrap_or(ws_ms);
                                                        
                                                        if !rows.is_empty() {
                                                            // Generate alert with dedupe info
                                                            let alert_id = blake3::hash(format!("{}:{}:{}", id_c, tenant_c, we_ms/300000).as_bytes()).to_hex().to_string();
                                                            let title = name_c.replace("'","''");
                                                            let desc = format!("Scheduled alert for rule {}", title).replace("'","''");
                                                            
                                                            // Build event refs
                                                            let event_refs: Vec<serde_json::Value> = rows.iter().take(10).map(|r| {
                                                                json!({
                                                                    "event_id": r.get("event_id").and_then(|e| e.as_str()).unwrap_or(""),
                                                                    "tenant_id": r.get("tenant_id").and_then(|t| t.as_str()).unwrap_or("")
                                                                })
                                                            }).collect();
                                                            let event_refs_json = serde_json::to_string(&event_refs).unwrap_or("[]".to_string()).replace("'", "''");
                                                            
                                                            // Pick first dedupe_hash for the aggregated alert
                                                            let dedupe_hash64 = rows.first().and_then(|r| r.get("dedupe_hash64")).and_then(|h| h.as_u64()).unwrap_or(0);
                                                            let alert_key = rows.first().and_then(|r| r.get("alert_key")).and_then(|k| k.as_str()).unwrap_or("unknown").replace("'", "''");
                                                            
                                                            let insert_sql = format!(
                                                                "INSERT INTO dev.alerts (alert_id, tenant_id, rule_id, alert_title, alert_description, event_refs, severity, status, alert_timestamp, created_at, updated_at, alert_key, dedupe_hash64) VALUES ('{}','{}','{}','{}','{}','{}','{}','OPEN',{},{},{},'{}',{})",
                                                                alert_id.replace("'","''"), tenant_c.replace("'","''"), id_c.replace("'","''"), 
                                                                title, desc, event_refs_json, severity_c.to_uppercase(), 
                                                                safety_upper, safety_upper, safety_upper, alert_key, dedupe_hash64
                                                            );
                                                            let _ = client_c.post("http://localhost:8123/").query(&[("query", insert_sql)]).header("Content-Length","0").send().await;
                                                            crate::v2::metrics::inc_alerts(&id_c, &tenant_c, 1);
                                                        }
                                                        
                                                        // Update watermark on success
                                                        // Formula: new_wm = greatest(old_wm, min(upper, max_candidate_ts))
                                                        let capped_max = we_ms.min(max_candidate_ts);
                                                        let new_watermark_ms = ws_ms.max(capped_max);
                                                        let update_state = format!(
                                                            "INSERT INTO dev.rule_state (rule_id, tenant_id, watermark_ts, last_run_ts, last_success_ts, last_error, last_sql, dedup_hash, last_alert_ts, updated_at) VALUES ('{}','{}', toDateTime64({},3), {}, {}, '', '{}', '', {}, {} )",
                                                            id_c.replace("'","''"), tenant_c.replace("'","''"), new_watermark_ms, safety_upper, safety_upper, 
                                                            query_sql.replace("'","''"), safety_upper, safety_upper
                                                        );
                                                        let _ = client_c.post("http://localhost:8123/").query(&[("query", update_state)]).header("Content-Length","0").send().await;
                                                        crate::v2::metrics::inc_rules_run(&id_c, &tenant_c, "success", "");
                                                        
                                                        // Update metrics
                                                        let lag = ((now as i64) - (new_watermark_ms / 1000)).max(0);
                                                        crate::v2::metrics::set_rules_lag(&id_c, &tenant_c, lag);
                                                        let window_secs = ((we_ms - ws_ms) / 1000).max(0);
                                                        crate::v2::metrics::set_rules_window(&id_c, &tenant_c, window_secs);
                                                    }
                                                }
                                            }
                                            Ok(other) => { 
                                                // Record error without moving watermark
                                                let error_msg = format!("query error: {}", other.status());
                                                let txt = other.text().await.unwrap_or_default();
                                                
                                                if debug {
                                                    use std::io::Write;
                                                    if let Ok(mut f) = std::fs::File::create(art_dir.join("wm_sql_err.txt")) {
                                                        let _ = write!(f, "CH ERROR: {}\nSQL:\n{}\n", txt, query_sql);
                                                    }
                                                }
                                                
                                                let update_error = format!(
                                                    "ALTER TABLE dev.rule_state UPDATE last_error='{}', last_run_ts={} WHERE rule_id='{}' AND tenant_id='{}'",
                                                    error_msg.replace("'","''"), safety_upper, id_c.replace("'","''"), tenant_c.replace("'","''")
                                                );
                                                let _ = client_c.post("http://localhost:8123/").query(&[("query", update_error)]).header("Content-Length","0").send().await; 
                                                crate::v2::metrics::inc_rules_run(&id_c, &tenant_c, "error", "query_error"); 
                                            }
                                            Err(e) => { 
                                                if debug {
                                                    use std::io::Write;
                                                    if let Ok(mut f) = std::fs::File::create(art_dir.join("wm_sql_err.txt")) {
                                                        let _ = write!(f, "HTTP ERROR: {e:?}\nSQL:\n{}\n", query_sql);
                                                    }
                                                }
                                                crate::v2::metrics::inc_rules_run(&id_c, &tenant_c, "error", "network"); 
                                            }
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


