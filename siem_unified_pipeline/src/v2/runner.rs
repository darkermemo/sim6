use serde_json::Value;
use std::sync::Arc;
use axum::async_trait;
use tokio::time::{sleep, Duration, Instant};
use crate::v2::state::AppState;

async fn ch_post_json(sql: String) -> Result<serde_json::Value, ()> {
    let client = reqwest::Client::new();
    let resp = client
        .post("http://localhost:8123/?default_format=JSON")
        .body(sql)
        .send().await.map_err(|_| ())?;
    if !resp.status().is_success() { return Err(()) }
    resp.json().await.map_err(|_| ())
}

fn compile_from_spec(spec: &Value) -> Option<String> {
    // Expect the JSON to contain at least { type, tenant_id, time, by?, emit? }
    let mut map = std::collections::HashMap::new();
    map.insert("type".to_string(), spec.get("type")?.clone());
    map.insert("tenant_id".to_string(), spec.get("tenant_id")?.clone());
    map.insert("time".to_string(), spec.get("time")?.clone());
    if let Some(by) = spec.get("by") { map.insert("by".to_string(), by.clone()); }
    if let Some(emit) = spec.get("emit") { map.insert("emit".to_string(), emit.clone()); }
    // Flatten extras
    for (k,v) in spec.as_object()?.iter() {
        if !["type","tenant_id","time","by","emit"].contains(&k.as_str()) {
            map.insert(k.clone(), v.clone());
        }
    }
    let det_spec: super::handlers::detections::DetectionSpec = serde_json::from_value(Value::Object(map.into())).ok()?;
    let sql = match det_spec.rule_type.as_str() {
        "sequence" => super::handlers::detections::compile_sequence(&det_spec),
        "sequence_absence" => super::handlers::detections::compile_absence(&det_spec),
        "chain" => super::handlers::detections::compile_chain(&det_spec),
        "rolling_threshold" => super::handlers::detections::compile_rolling(&det_spec),
        "ratio" => super::handlers::detections::compile_ratio(&det_spec),
        "first_seen" => super::handlers::detections::compile_first_seen(&det_spec),
        "beaconing" => super::handlers::detections::compile_beaconing(&det_spec),
        "spike" => super::handlers::detections::compile_spike(&det_spec),
        "spread" => super::handlers::detections::compile_spread(&det_spec),
        "peer_out" => super::handlers::detections::compile_peer_out(&det_spec),
        "burst" => super::handlers::detections::compile_burst(&det_spec),
        "time_of_day" => super::handlers::detections::compile_time_of_day(&det_spec),
        "travel" => super::handlers::detections::compile_travel(&det_spec),
        "lex" => super::handlers::detections::compile_lex(&det_spec),
        _ => return None,
    };
    Some(sql)
}

fn is_due(schedule: &Value, now: chrono::DateTime<chrono::Utc>, last: Option<chrono::DateTime<chrono::Utc>>) -> bool {
    // Very simple: support { cron:"@every 5m", enabled:true }
    let obj = schedule.as_object().unwrap_or(&serde_json::Map::new());
    if obj.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false) == false { return false }
    let cron = obj.get("cron").and_then(|v| v.as_str()).unwrap_or("");
    if let Some(rest) = cron.strip_prefix("@every ") {
        let mins: i64 = rest.trim_end_matches('m').parse().unwrap_or(5);
        if let Some(last_run) = last { return (now - last_run).num_minutes() >= mins }
        return true;
    }
    false
}

pub async fn start_scheduler(_state: Arc<AppState>) {
    // tick every 60s
    loop {
        let now = chrono::Utc::now();
        let list_sql = "SELECT id, spec, schedule, (SELECT max(started_at) FROM detection_runs WHERE detection_id = detections.id) AS last_started FROM detections WHERE enabled = 1 FORMAT JSON".to_string();
        if let Ok(js) = ch_post_json(list_sql).await {
            if let Some(arr) = js.get("data").and_then(|d| d.as_array()) {
                for row in arr {
                    let sched = row.get("schedule").cloned().unwrap_or(Value::Null);
                    let last_started = row.get("last_started").and_then(|v| v.as_str()).and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()).map(|dt| dt.with_timezone(&chrono::Utc));
                    if is_due(&sched, now, last_started) {
                        if let Some(spec) = row.get("spec") {
                            if let Some(sql) = compile_from_spec(spec) {
                                // Execute and insert alerts (sample only)
                                let run_id = uuid::Uuid::new_v4().to_string();
                                let did = row.get("id").and_then(|v| v.as_str()).unwrap_or("");
                                let _ = ch_post_json(format!("INSERT INTO detection_runs (id, detection_id, started_at, status, rows) VALUES ('{}','{}', now64(3), 'running', 0)", run_id, did)).await;
                                let q = format!("{} LIMIT 1000 FORMAT JSON", sql);
                                if let Ok(res) = ch_post_json(format!("SELECT * FROM system.one FORMAT JSON")) .await { let _ = res; }
                                let client = reqwest::Client::new();
                                if let Ok(resp) = client.get("http://localhost:8123/").query(&[("query", q)]).send().await {
                                    if let Ok(text) = resp.text().await { if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                                        if let Some(rows) = parsed.get("data").and_then(|a| a.as_array()) {
                                            let rows_n = rows.len() as u64;
                                            // Insert minimal alerts payload
                                            for r in rows.iter().take(50) {
                                                let payload = r.to_string().replace("'","''");
                                                let _ = ch_post_json(format!("INSERT INTO alerts (id, detection_id, occurred_at, entity_keys, payload) VALUES ('{}','{}', now64(3), parseJson('{}'), parseJson('{}'))",
                                                    uuid::Uuid::new_v4(), did, "{}", payload)).await;
                                            }
                                            let _ = ch_post_json(format!("ALTER TABLE detection_runs UPDATE status='finished', finished_at=now64(3), rows={} WHERE id='{}'", rows_n, run_id)).await;
                                        }
                                    }}
                                }
                            }
                        }
                    }
                }
            }
        }
        sleep(Duration::from_secs(60)).await;
    }
}


