use axum::{extract::State, Json, response::sse::{Event, Sse}};
use serde_json::Value;
use std::sync::Arc;
use futures_util::stream;
use crate::v2::{state::AppState, compiler::compile_search};
use super::compiler::translate_to_dsl;

pub async fn compile(State(st): State<Arc<AppState>>, Json(body): Json<Value>) -> Result<Json<Value>, axum::http::StatusCode> {
    let dsl = translate_to_dsl(&body).map_err(|_| axum::http::StatusCode::UNPROCESSABLE_ENTITY)?;
    match compile_search(&dsl, &st.events_table) {
        Ok(res) => Ok(Json(serde_json::json!({"sql": res.sql, "where_sql": res.where_sql, "warnings": res.warnings }))),
        Err(_) => Err(axum::http::StatusCode::UNPROCESSABLE_ENTITY),
    }
}

pub async fn execute(State(st): State<Arc<AppState>>, Json(body): Json<Value>) -> Result<Json<Value>, axum::http::StatusCode> {
    let dsl = translate_to_dsl(&body).map_err(|_| axum::http::StatusCode::UNPROCESSABLE_ENTITY)?;
    let compiled = compile_search(&dsl, &st.events_table).map_err(|_| axum::http::StatusCode::UNPROCESSABLE_ENTITY)?;
    
    // Check for debug mode
    let debug = body.get("debug").and_then(|v| v.as_bool()).unwrap_or(false);
    let mut result = serde_json::json!({
        "sql": compiled.sql,
        "took_ms": 0
    });
    
    // Run EXPLAIN if debug=true
    if debug {
        let explain_sql = format!("EXPLAIN indexes=1 {}", compiled.sql);
        let client = reqwest::Client::new();
        if let Ok(explain_resp) = client.get("http://localhost:8123/")
            .query(&[("query", explain_sql)])
            .send().await 
        {
            if let Ok(explain_text) = explain_resp.text().await {
                // Extract index usage info
                let indexes_used = if explain_text.contains("idx_msg_token") {
                    "idx_msg_token"
                } else if explain_text.contains("multiSearchAllPositionsCaseInsensitive") {
                    "multiSearchAllPositionsCaseInsensitive (no index)"
                } else {
                    "none"
                };
                
                result["debug"] = serde_json::json!({
                    "indexes_used": indexes_used,
                    "explain_snippet": explain_text.lines().take(20).collect::<Vec<_>>().join("\n")
                });
                
                // Save explain output for proof script
                if let Ok(mut file) = std::fs::File::create("target/test-artifacts/fts_explain.txt") {
                    use std::io::Write;
                    let _ = writeln!(file, "{}", explain_text);
                }
            }
        }
    }
    
    // Execute the actual query
    let sql = format!("{} FORMAT JSON", compiled.sql);
    let client = reqwest::Client::new();
    let start = std::time::Instant::now();
    let resp = client.get("http://localhost:8123/").query(&[("query", sql.clone())]).send().await.map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;
    let took_ms = start.elapsed().as_millis() as u64;
    
    if !resp.status().is_success() { return Err(axum::http::StatusCode::BAD_GATEWAY); }
    let text = resp.text().await.unwrap_or("{}".to_string());
    let data: Value = serde_json::from_str(&text).unwrap_or(serde_json::json!({"raw": text}));
    
    result["data"] = data;
    result["took_ms"] = serde_json::json!(took_ms);
    
    // Save compiled SQL for proof script if using free-text search
    if body.get("q").is_some() {
        if let Ok(mut file) = std::fs::File::create("target/test-artifacts/fts_compiled_sql.txt") {
            use std::io::Write;
            let _ = writeln!(file, "{}", compiled.sql);
        }
    }
    
    Ok(Json(result))
}

pub async fn aggs(State(st): State<Arc<AppState>>, Json(body): Json<Value>) -> Result<Json<Value>, axum::http::StatusCode> {
    // Top severity and 1m histogram
    let dsl = translate_to_dsl(&body).map_err(|_| axum::http::StatusCode::UNPROCESSABLE_ENTITY)?;
    let compiled = compile_search(&dsl, &st.events_table).map_err(|_| axum::http::StatusCode::UNPROCESSABLE_ENTITY)?;
    let base_where = compiled.where_sql;
    let sql1 = format!(
        "SELECT severity, count() c FROM {} WHERE {} GROUP BY severity ORDER BY c DESC LIMIT 10 FORMAT JSON",
        st.events_table, base_where
    );
    let sql2 = format!(
        "SELECT toStartOfInterval(toDateTime(event_timestamp), INTERVAL 60 SECOND) AS ts, count() c FROM {} WHERE {} GROUP BY ts ORDER BY ts FORMAT JSON",
        st.events_table, base_where
    );
    let sql3 = format!(
        "SELECT event_outcome, count() c FROM {} WHERE {} GROUP BY event_outcome ORDER BY c DESC LIMIT 10 FORMAT JSON",
        st.events_table, base_where
    );
    let sql4 = format!(
        "SELECT source_ip, count() c FROM {} WHERE {} GROUP BY source_ip ORDER BY c DESC LIMIT 20 FORMAT JSON",
        st.events_table, base_where
    );
    let client = reqwest::Client::new();
    let r1 = client.get("http://localhost:8123/").query(&[("query", sql1.clone())]).send().await.map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;
    let r2 = client.get("http://localhost:8123/").query(&[("query", sql2.clone())]).send().await.map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;
    let r3 = client.get("http://localhost:8123/").query(&[("query", sql3.clone())]).send().await.map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;
    let r4 = client.get("http://localhost:8123/").query(&[("query", sql4.clone())]).send().await.map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;
    if !r1.status().is_success() || !r2.status().is_success() || !r3.status().is_success() || !r4.status().is_success() { return Err(axum::http::StatusCode::BAD_GATEWAY); }
    let v1: Value = serde_json::from_str(&r1.text().await.unwrap_or_default()).unwrap_or_default();
    let v2: Value = serde_json::from_str(&r2.text().await.unwrap_or_default()).unwrap_or_default();
    let v3: Value = serde_json::from_str(&r3.text().await.unwrap_or_default()).unwrap_or_default();
    let v4: Value = serde_json::from_str(&r4.text().await.unwrap_or_default()).unwrap_or_default();
    Ok(Json(serde_json::json!({
        "aggs": {
          "by_severity": v1.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default(),
          "timeline": v2.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default(),
          "by_outcome": v3.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default(),
          "top_sources": v4.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default(),
        }
    })))
}

pub async fn tail(State(st): State<Arc<AppState>>, Json(body): Json<Value>) -> Sse<impl futures_util::Stream<Item = Result<Event, axum::Error>>> {
    // Always produce a single concrete stream type using stream::iter
    let events: Vec<Result<Event, axum::Error>> = async {
        let dsl = match translate_to_dsl(&body) { Ok(d) => d, Err(_) => {
            return vec![Ok(Event::default().data("error: invalid query"))];
        }};
        let compiled = match compile_search(&dsl, &st.events_table) { Ok(c) => c, Err(_) => {
            return vec![Ok(Event::default().data("error: compilation failed"))];
        }};
        let tail_sql = format!("{} ORDER BY event_timestamp DESC LIMIT 1000 FORMAT JSONEachRow", compiled.sql);
        let client = reqwest::Client::new();
        match client.get("http://localhost:8123/").query(&[("query", tail_sql)]).send().await {
            Ok(r) if r.status().is_success() => {
                let text = r.text().await.unwrap_or_default();
                let mut out: Vec<Result<Event, axum::Error>> = Vec::new();
                let mut count: usize = 0;
                for line in text.lines().filter(|l| !l.trim().is_empty()) {
                    count += 1;
                    out.push(Ok(Event::default().data(line)));
                    if count % 500 == 0 { out.push(Ok(Event::default().data("throttle:500"))); }
                }
                if out.is_empty() { out.push(Ok(Event::default().data("found 0 events"))); }
                out
            }
            _ => vec![Ok(Event::default().data("error: query failed"))],
        }
    }.await;
    Sse::new(stream::iter(events))
}

// Optional GET variant for SSE to support EventSource; parses query params to a minimal body and reuses the tail logic
pub async fn tail_get(
    State(st): State<Arc<AppState>>,
    q: axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, axum::Error>>> {
    let tenant = q.get("tenant_id").cloned().unwrap_or_else(|| "default".to_string());
    let last = q
        .get("last_seconds")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(900);
    let mut body = serde_json::json!({
        "tenant_id": tenant,
        "time": { "last_seconds": last },
    });
    if let Some(qs) = q.get("q") { body["q"] = serde_json::Value::String(qs.clone()); }
    tail(State(st), Json(body)).await
}

pub async fn export(State(st): State<Arc<AppState>>, Json(body): Json<Value>) -> Result<axum::response::Response, axum::http::StatusCode> {
    let dsl = translate_to_dsl(&body).map_err(|_| axum::http::StatusCode::UNPROCESSABLE_ENTITY)?;
    let compiled = compile_search(&dsl, &st.events_table).map_err(|_| axum::http::StatusCode::UNPROCESSABLE_ENTITY)?;
    
    // Add LIMIT 10000 for export safety
    let export_sql = format!("{} LIMIT 10000 FORMAT JSONEachRow", compiled.sql);
    
    let client = reqwest::Client::new();
    let resp = client.get("http://localhost:8123/")
        .query(&[("query", export_sql)])
        .send()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;
        
    if !resp.status().is_success() {
        return Err(axum::http::StatusCode::BAD_GATEWAY);
    }
    
    let text = resp.text().await.unwrap_or_default();
    
    let response = axum::response::Response::builder()
        .status(200)
        .header("Content-Type", "application/x-ndjson")
        .header("Content-Disposition", "attachment; filename=\"search_results.ndjson\"")
        .body(axum::body::Body::from(text))
        .unwrap();
        
    Ok(response)
}

pub async fn saved_searches(State(_st): State<Arc<AppState>>) -> Result<Json<Value>, axum::http::StatusCode> {
    // TODO: Implement saved searches from database
    // For now, return empty list
    Ok(Json(serde_json::json!({
        "searches": []
    })))
}

pub async fn save_search(State(_st): State<Arc<AppState>>, Json(body): Json<Value>) -> Result<Json<Value>, axum::http::StatusCode> {
    // TODO: Implement save search to database
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("unnamed");
    Ok(Json(serde_json::json!({
        "id": "temp_id",
        "name": name,
        "saved": true
    })))
}

pub async fn delete_search(State(_st): State<Arc<AppState>>, axum::extract::Path(id): axum::extract::Path<String>) -> Result<Json<Value>, axum::http::StatusCode> {
    // TODO: Implement delete search from database
    Ok(Json(serde_json::json!({
        "deleted": true,
        "id": id
    })))
}


