use axum::{extract::State, Json, response::sse::{Event, Sse}};
use std::convert::Infallible;
use std::pin::Pin;
use futures_util::stream::{Stream, StreamExt};
use serde_json::Value;
use std::sync::Arc;
use futures_util::stream;
use crate::v2::{state::AppState, compiler::compile_search};
use super::compiler::translate_to_dsl;

pub async fn compile(State(_st): State<Arc<AppState>>, Json(body): Json<Value>) -> Result<Json<Value>, axum::http::StatusCode> {
    let dsl = translate_to_dsl(&body).map_err(|_| axum::http::StatusCode::UNPROCESSABLE_ENTITY)?;
    match compile_search(&dsl, "dev.events") {
        Ok(res) => Ok(Json(serde_json::json!({"sql": res.sql, "where_sql": res.where_sql, "warnings": res.warnings }))),
        Err(_) => Err(axum::http::StatusCode::UNPROCESSABLE_ENTITY),
    }
}

pub async fn execute(State(st): State<Arc<AppState>>, Json(body): Json<Value>) -> Result<Json<Value>, axum::http::StatusCode> {
    let dsl = translate_to_dsl(&body).map_err(|_| axum::http::StatusCode::UNPROCESSABLE_ENTITY)?;
    let compiled = compile_search(&dsl, &st.events_table).map_err(|_| axum::http::StatusCode::UNPROCESSABLE_ENTITY)?;
    let sql = format!("{} FORMAT JSON", compiled.sql);
    let client = reqwest::Client::new();
    let resp = client.get("http://localhost:8123/").query(&[("query", sql.clone())]).send().await.map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;
    if !resp.status().is_success() { return Err(axum::http::StatusCode::BAD_GATEWAY); }
    let text = resp.text().await.unwrap_or("{}".to_string());
    let data: Value = serde_json::from_str(&text).unwrap_or(serde_json::json!({"raw": text}));
    Ok(Json(serde_json::json!({"sql": compiled.sql, "data": data, "took_ms": 0 })))
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

pub async fn tail(
    State(st): State<Arc<AppState>>,
    Json(body): Json<Value>
) -> Sse<Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>>> {
    // Helper to create a boxed SSE stream from a single Event
    fn single_event(msg: &'static str) -> Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>> {
        let ev = Event::default().data(msg);
        let s = futures_util::stream::once(async move { Ok::<Event, Infallible>(ev) });
        Box::pin(s)
    }

    // Parse body into DSL
    let dsl = match translate_to_dsl(&body) {
        Ok(d) => d,
        Err(_) => return Sse::new(single_event("error: invalid query")),
    };

    // Compile DSL to SQL
    let compiled = match compile_search(&dsl, &st.events_table) {
        Ok(c) => c,
        Err(_) => return Sse::new(single_event("error: compilation failed")),
    };

    // Add ORDER BY event_timestamp DESC LIMIT 1000 for tail mode
    let tail_sql = format!(
        "{} ORDER BY event_timestamp DESC LIMIT 1000 FORMAT JSONEachRow",
        compiled.sql
    );

    // Query ClickHouse and emit a single summary event. Box the stream so all
    // branches share the same concrete type.
    let stream_boxed: Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>> = {
        let s = async_stream::stream! {
            let client = reqwest::Client::new();
            let resp = client
                .get("http://localhost:8123/")
                .query(&[("query", tail_sql)])
                .send()
                .await;
            match resp {
                Ok(r) if r.status().is_success() => {
                    let text = r.text().await.unwrap_or_default();
                    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
                    yield Event::default().data(format!("found {} events", lines.len()));
                }
                _ => {
                    yield Event::default().data("error: query failed");
                }
            }
        }
        .map(|e| Ok::<Event, Infallible>(e));
        Box::pin(s)
    };

    Sse::new(stream_boxed)
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


