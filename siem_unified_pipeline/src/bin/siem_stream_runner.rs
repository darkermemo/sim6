use std::collections::HashMap;
use std::time::Duration;
use redis::aio::ConnectionManager;
use tracing::{debug, error, info};
use siem_unified_pipeline::v2::{state::AppState, metrics};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Honor RUST_LOG for granular debug
    let _ = tracing_subscriber::fmt::try_init();
    let redis_url = std::env::var("REDIS_URL").expect("REDIS_URL required");
    let ch_url = std::env::var("CLICKHOUSE_URL").unwrap_or_else(|_| "http://localhost:8123".to_string());
    let db = std::env::var("CLICKHOUSE_DATABASE").unwrap_or_else(|_| "dev".to_string());
    std::env::set_var("CLICKHOUSE_DATABASE", &db);
    let group = std::env::var("STREAM_GROUP").unwrap_or_else(|_| "gr1".to_string());
    let tenants = std::env::var("TENANTS").unwrap_or_else(|_| "default".to_string());

    let _st = AppState::new(&ch_url, "dev.events");
    let client = redis::Client::open(redis_url)?;
    let mut cm = ConnectionManager::new(client).await?;
    let http = reqwest::Client::new();
    let run_id = std::env::var("RUN_ID").unwrap_or_else(|_| "-".to_string());

    // Optional: focus on a single rule id for demo (e.g., hammer rule)
    let stream_rule_id = std::env::var("STREAM_RULE_ID").ok();
    if let Some(rid) = &stream_rule_id { info!(rule_id = %rid, "stream runner targeting single rule id"); }

    let tenant_list: Vec<String> = if tenants == "*" { vec!["default".to_string()] } else { tenants.split(',').map(|s| s.trim().to_string()).collect() };

    // Ensure groups exist
    for t in &tenant_list {
        let _ : redis::Value = redis::cmd("XGROUP")
            .arg("CREATE")
            .arg(format!("siem:events:{}", t))
            .arg(&group)
            .arg("$")
            .arg("MKSTREAM")
            .query_async(&mut cm)
            .await
            .unwrap_or(redis::Value::Okay);
    }

    let mut last_lag_check = std::collections::HashMap::<String, std::time::Instant>::new();
    // Consumer group idle reclaim to avoid stuck PEL entries
    let reclaim_idle_ms: i64 = std::env::var("PEL_RECLAIM_IDLE_MS").ok().and_then(|v| v.parse().ok()).unwrap_or(60_000);
    loop {
        for t in &tenant_list {
            let key = format!("siem:events:{}", t);
            debug!(tenant = %t, key = %key, "xreadgroup BLOCK 1000");
            let res: redis::Value = redis::cmd("XREADGROUP")
                .arg("GROUP").arg(&group).arg("runner-1")
                .arg("COUNT").arg(100)
                .arg("BLOCK").arg(1000)
                .arg("STREAMS").arg(&key).arg(">")
                .query_async(&mut cm).await.unwrap_or(redis::Value::Nil);
            // Log size and evaluate entries
            if let redis::Value::Bulk(streams) = res {
                debug!(tenant = %t, streams_len = streams.len(), "xreadgroup got streams");
                for stream in streams {
                    if let redis::Value::Bulk(v) = stream {
                        if v.len() >= 2 {
                            // v[0] = stream name, v[1] = entries
                            if let redis::Value::Bulk(entries) = &v[1] {
                                debug!(tenant = %t, entries = entries.len(), "processing entries");
                                for entry in entries {
                                    if let redis::Value::Bulk(parts) = entry {
                                        // parts[0] = id, parts[1] = fields
                                        let id = match &parts[0] { redis::Value::Data(b) => String::from_utf8_lossy(b).to_string(), _ => "0-0".to_string() };
                                        let mut fields: HashMap<String, String> = HashMap::new();
                                        if parts.len() >= 2 {
                                            if let redis::Value::Bulk(kv) = &parts[1] {
                                                for pair in kv.chunks(2) {
                                                    if pair.len() == 2 {
                                                        if let (redis::Value::Data(k), redis::Value::Data(v)) = (&pair[0], &pair[1]) {
                                                            let ks = String::from_utf8_lossy(k).to_string();
                                                            let vs = String::from_utf8_lossy(v).to_string();
                                                            fields.insert(ks, vs);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        let msg = fields.get("msg").cloned().unwrap_or_default();
                                        let event_id = fields.get("event_id").cloned().unwrap_or_default();
                                        // Broad match across message/meta/raw
                                        let hay_meta = fields.get("meta").cloned().unwrap_or_default();
                                        let hay_raw = fields.get("raw").cloned().unwrap_or_default();
                                        let tokens = ["hammer", "HAMMER"]; // prototype tokens for contains_any
                                        let matched = [msg.as_str(), hay_meta.as_str(), hay_raw.as_str()].iter().any(|h| {
                                            let hlow = h.to_lowercase();
                                            tokens.iter().any(|t| hlow.contains(&t.to_lowercase()))
                                        });
                                        debug!(tenant = %t, id = %id, event_id = %event_id, msg = %msg, matched = matched, "entry parsed");
                                        if matched {
                                            if let Some(rid) = &stream_rule_id {
                                                metrics::inc_stream_matches(rid, t);
                                                // Dedup key basis: tenant_id + event_id, 60s window
                                                let dkey = format!("siem:dedup:{}:{}:{}", rid, t, event_id);
                                                let dedup_res: redis::Value = redis::cmd("SET").arg(&dkey).arg("1").arg("NX").arg("EX").arg(60).query_async(&mut cm).await.unwrap_or(redis::Value::Nil);
                                                debug!(tenant = %t, id = %id, event_id = %event_id, dedup = ?dedup_res, "dedup setnx");
                                                let should_insert = !matches!(dedup_res, redis::Value::Nil);
                                                if should_insert {
                                                    // Build alert row insert
                                                    let now_ts = chrono::Utc::now().timestamp() as u32;
                                                    // Deterministic id for idempotence
                                                    let material = format!("{}|{}|{}|{}", rid, t, event_id, id);
                                                    let alert_id = blake3::hash(material.as_bytes()).to_hex().to_string();
                                                    let title = "Stream: message has hammer";
                                                    let desc = format!("Matched stream event {} containing 'hammer'", event_id).replace("'", "''");
                                                    let insert_sql = format!(
                                                        "INSERT INTO dev.alerts (alert_id, tenant_id, rule_id, alert_title, alert_description, event_refs, severity, status, alert_timestamp, created_at, updated_at) VALUES ('{}','{}','{}','{}','{}','[]','LOW','OPEN',{},{},{})",
                                                        alert_id.replace("'","''"), t.replace("'","''"), rid.replace("'","''"), title.replace("'","''"), desc, now_ts, now_ts, now_ts
                                                    );
                                                    debug!(tenant = %t, sql = %insert_sql, "clickhouse insert alert");
                                                    match http.post(&ch_url).query(&[("query", insert_sql)]).header("Content-Length","0").send().await {
                                                        Ok(resp) => {
                                                            let status = resp.status();
                                                            if !status.is_success() {
                                                                let body = resp.text().await.unwrap_or_default();
                                                                error!(tenant = %t, status = ?status, body = %body, "clickhouse insert failed");
                                                                // Do not ACK so we can retry later
                                                                continue;
                                                            } else {
                                                                metrics::inc_alerts(rid, t, 1);
                                                                metrics::inc_rules_run(rid, t, "ok", "");
                                                                debug!(tenant = %t, run_id = %run_id, id = %id, event_id = %event_id, "alert written");
                                                                let _: redis::Value = redis::cmd("XACK").arg(&key).arg(&group).arg(&id).query_async(&mut cm).await.unwrap_or(redis::Value::Okay);
                                                                metrics::inc_stream_acks(t);
                                                                debug!(tenant = %t, id = %id, "acked after insert");
                                                            }
                                                        }
                                                        Err(e) => {
                                                            error!(tenant = %t, error = %e, "clickhouse insert error");
                                                            metrics::inc_stream_eval_error(rid, t);
                                                            continue;
                                                        }
                                                    }
                                                } else {
                                                    // Already seen — ACK and continue
                                                    let _: redis::Value = redis::cmd("XACK").arg(&key).arg(&group).arg(&id).query_async(&mut cm).await.unwrap_or(redis::Value::Okay);
                                                    metrics::inc_stream_acks(t);
                                                    debug!(tenant = %t, id = %id, "acked duplicate");
                                                }
                                            } else {
                                                // No specific rule configured; just ACK after logging a match
                                                debug!(tenant = %t, id = %id, "match without rule id; ack");
                                                let _: redis::Value = redis::cmd("XACK").arg(&key).arg(&group).arg(&id).query_async(&mut cm).await.unwrap_or(redis::Value::Okay);
                                                metrics::inc_stream_acks(t);
                                            }
                                        } else {
                                            // No match — ACK to move on
                                            let _ : redis::Value = redis::cmd("XACK").arg(&key).arg(&group).arg(&id).query_async(&mut cm).await.unwrap_or(redis::Value::Okay);
                                            metrics::inc_stream_acks(t);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Periodic lag probe
            let nowi = std::time::Instant::now();
            let doit = last_lag_check.get(t).map(|i| nowi.duration_since(*i) > Duration::from_secs(10)).unwrap_or(true);
            if doit {
                let info: redis::Value = redis::cmd("XINFO").arg("STREAM").arg(&key).query_async(&mut cm).await.unwrap_or(redis::Value::Nil);
                if let redis::Value::Bulk(fields) = info {
                    // Try to extract last-generated-id time component
                    let mut lag_ms: i64 = 0;
                    for pair in fields.chunks(2) {
                        if pair.len() == 2 {
                            if let (redis::Value::Data(k), v) = (&pair[0], &pair[1]) {
                                if k == b"last-generated-id" {
                                    if let redis::Value::Data(bid) = v {
                                        // ID format: ms-seq
                                        if let Some(ms) = String::from_utf8_lossy(bid).split('-').next().and_then(|s| s.parse::<i64>().ok()) {
                                            let now_ms = chrono::Utc::now().timestamp_millis();
                                            lag_ms = (now_ms - ms).max(0);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    metrics::set_stream_lag_ms(t, lag_ms);
                }
                last_lag_check.insert(t.clone(), nowi);
            }
            // Reclaim idle pending entries periodically (XAUTOCLAIM)
            let claim_res: redis::Value = redis::cmd("XAUTOCLAIM")
                .arg(&key).arg(&group).arg("runner-1")
                .arg(reclaim_idle_ms).arg("0-0").arg("COUNT").arg(50)
                .query_async(&mut cm).await.unwrap_or(redis::Value::Nil);
            if !matches!(claim_res, redis::Value::Nil) {
                debug!(tenant = %t, "xautoclaim performed");
            }
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}


