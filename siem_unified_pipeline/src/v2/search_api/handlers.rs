use axum::{extract::State, Json, response::sse::{Event, Sse}};
use axum::response::IntoResponse;
use std::convert::Infallible;
use std::pin::Pin;
use futures_util::stream::{Stream, StreamExt};
use serde_json::Value;
use std::sync::Arc;
use futures_util::stream;
use uuid::Uuid;
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

    // Apply requested limit with a safe cap
    let requested_limit = body
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(200);
    let safe_limit = requested_limit.min(10_000);

    // compiled.sql ends with "LIMIT 10000 SETTINGS ..." in default search path.
    // Replace the default limit with the safe limit. Fallback to appending LIMIT if pattern is not found.
    let sql_limited = if compiled.sql.contains("LIMIT 10000") {
        compiled.sql.replace("LIMIT 10000", &format!("LIMIT {}", safe_limit))
    } else {
        format!("{} LIMIT {}", compiled.sql, safe_limit)
    };

    // Execute via ClickHouse HTTP JSON
    let sql = format!("{} FORMAT JSON", sql_limited);
    let client = reqwest::Client::new();
    let t0 = std::time::Instant::now();
    let resp = client
        .get("http://localhost:8123/")
        .query(&[("query", sql.clone())])
        .send()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;
    if !resp.status().is_success() {
        // Include ClickHouse error mapping if available in crate::error
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        tracing::error!(target = "search_execute", %status, ch_error = %txt, "ClickHouse error in search_execute");
        return Err(crate::error::map_clickhouse_http_error(status, &txt, Some(&sql)).into_response().status());
    }
    let text = resp.text().await.unwrap_or("{}".to_string());
    let data: Value = serde_json::from_str(&text).unwrap_or(serde_json::json!({"raw": text}));
    let took_ms = t0.elapsed().as_millis() as u64;
    Ok(Json(serde_json::json!({"sql": sql_limited, "data": data, "took_ms": took_ms })))
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

use axum::extract::Query;

#[derive(serde::Deserialize)]
pub struct SavedSearchQuery {
    pub tenant_id: Option<String>,
}

#[derive(serde::Serialize)]
pub struct SavedSearch {
    pub id: String,
    pub name: String,
    pub q: String,
    pub time_last_seconds: u32,
    pub filters: String,
    pub pinned: u8,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Serialize)]
pub struct SavedSearchesResponse {
    pub saved: Vec<SavedSearch>,
}

/// GET /api/v2/search/saved?tenant_id=default
pub async fn saved_searches(
    State(app): State<Arc<AppState>>,
    Query(params): Query<SavedSearchQuery>
) -> Result<Json<SavedSearchesResponse>, axum::http::StatusCode> {
    let tenant = params.tenant_id.unwrap_or_else(|| "default".to_string());
    
    let sql = format!(
        "SELECT id, name, q, time_last_seconds, filters, pinned, formatDateTime(created_at, '%Y-%m-%d %H:%M:%S') as created_at, formatDateTime(updated_at, '%Y-%m-%d %H:%M:%S') as updated_at FROM dev.saved_searches WHERE tenant_id = '{}' ORDER BY pinned DESC, updated_at DESC FORMAT JSON",
        tenant.replace("'", "''")
    );
    
    let client = reqwest::Client::new();
    let resp = client
        .get("http://localhost:8123/")
        .query(&[("query", &sql)])
        .send()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;

    if !resp.status().is_success() {
        return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
    }

    let text = resp.text().await.map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    let v: Value = serde_json::from_str(&text).map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let rows = v.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default();
    let mut saved_searches = Vec::new();
    
    for row in rows {
        if let (Some(id), Some(name), Some(q)) = (
            row.get("id").and_then(|v| v.as_str()),
            row.get("name").and_then(|v| v.as_str()),
            row.get("q").and_then(|v| v.as_str())
        ) {
            saved_searches.push(SavedSearch {
                id: id.to_string(),
                name: name.to_string(),
                q: q.to_string(),
                time_last_seconds: row.get("time_last_seconds").and_then(|v| v.as_u64()).unwrap_or(3600) as u32,
                filters: row.get("filters").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                pinned: row.get("pinned").and_then(|v| v.as_u64()).unwrap_or(0) as u8,
                created_at: row.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                updated_at: row.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            });
        }
    }
    
    Ok(Json(SavedSearchesResponse { saved: saved_searches }))
}

#[derive(serde::Deserialize)]
pub struct SaveSearchRequest {
    pub tenant_id: String,
    pub name: String,
    pub q: String,
    pub time_last_seconds: Option<u32>,
    pub filters: Option<String>,
    pub pinned: Option<u8>,
}

#[derive(serde::Serialize)]
pub struct SaveSearchResponse {
    pub id: String,
}

/// POST /api/v2/search/saved
pub async fn save_search(
    State(_app): State<Arc<AppState>>,
    Json(req): Json<SaveSearchRequest>
) -> Result<Json<SaveSearchResponse>, axum::http::StatusCode> {
    let time_seconds = req.time_last_seconds.unwrap_or(3600);
    let filters = req.filters.unwrap_or_default();
    let pinned = req.pinned.unwrap_or(0);
    
    // Generate UUID and insert, then return it  
    let new_id = Uuid::new_v4().to_string();
    let sql = format!(
        "INSERT INTO dev.saved_searches (tenant_id, id, name, q, time_last_seconds, filters, pinned) VALUES ('{}', toUUID('{}'), '{}', '{}', {}, '{}', {})",
        req.tenant_id.replace("'", "''"),
        new_id,
        req.name.replace("'", "''"),
        req.q.replace("'", "''"),
        time_seconds,
        filters.replace("'", "''"),
        pinned
    );
    
    let client = reqwest::Client::new();
    let resp = client
        .get("http://localhost:8123/")
        .query(&[("query", &sql)])
        .send()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;

    if !resp.status().is_success() {
        return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
    }
    
    Ok(Json(SaveSearchResponse { id: new_id }))
}

/// DELETE /api/v2/search/saved/:id
pub async fn delete_search(
    State(app): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>
) -> Result<Json<Value>, axum::http::StatusCode> {
    let sql = format!(
        "ALTER TABLE dev.saved_searches DELETE WHERE id = toUUID('{}')",
        id.replace("'", "''")
    );
    
    let client = reqwest::Client::new();
    let resp = client
        .get("http://localhost:8123/")
        .query(&[("query", &sql)])
        .send()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;

    if !resp.status().is_success() {
        return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
    }
    
    Ok(Json(serde_json::json!({
        "deleted": true,
        "id": id
    })))
}

/// GET /api/v2/search/grammar - static grammar for UI help
pub async fn grammar() -> Json<Value> {
    Json(serde_json::json!({
        "operators": ["AND","OR","NOT"],
        "field_ops": {
            "equals": "field:value",
            "phrase": "\"quoted phrase\"",
            "regex": "/re/",
            "range": "field:[a TO b]"
        },
        "fields": [
            "tenant_id","message","event_type","severity","source_type","vendor",
            "product","host","user","source_ip","destination_ip","event_id",
            "event_timestamp","created_at","event_category","event_action","event_outcome"
        ]
    }))
}

#[derive(serde::Deserialize)]
pub struct FacetRequest {
    pub tenant_id: String,
    pub time: FacetTimeFilter,
    pub q: String,
    pub facets: Option<Vec<FacetSpec>>,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(untagged)]
pub enum FacetTimeFilter {
    LastSeconds { last_seconds: u32 },
    Range { from: u64, to: u64 },
}

#[derive(serde::Deserialize)]
pub struct FacetSpec {
    pub field: String,
    pub size: Option<u32>,
}

#[derive(serde::Serialize)]
pub struct FacetValue {
    pub value: String,
    pub count: u64,
}

#[derive(serde::Serialize)]
pub struct FacetsResponse {
    pub facets: std::collections::HashMap<String, Vec<FacetValue>>,
}

/// POST /api/v2/search/facets - facet counts for UI right panel
pub async fn facets(
    State(app): State<Arc<AppState>>,
    Json(req): Json<FacetRequest>
) -> Result<Json<FacetsResponse>, axum::http::StatusCode> {
    use std::collections::HashMap;
    
    // Build time filter
    let time_filter = match req.time {
        FacetTimeFilter::LastSeconds { last_seconds } => {
            format!("event_timestamp >= now() - INTERVAL {} SECOND", last_seconds)
        },
        FacetTimeFilter::Range { from, to } => {
            format!("event_timestamp >= fromUnixTimestamp64Milli({}) AND event_timestamp <= fromUnixTimestamp64Milli({})", from, to)
        }
    };
    
    // Build tenant filter
    let tenant_filter = if req.tenant_id == "all" {
        "1 = 1".to_string()
    } else {
        format!("tenant_id = '{}'", req.tenant_id.replace("'", "''"))
    };
    
    // Build query filter using existing compiler
    let query_filter = if req.q.trim().is_empty() || req.q.trim() == "*" {
        "1 = 1".to_string()
    } else {
        // Try to use existing compiler, fallback to simple message search
        match super::compiler::translate_to_dsl(&serde_json::json!({
            "tenant_id": req.tenant_id,
            "time": req.time,
            "q": req.q
        })) {
            Ok(dsl) => {
                match crate::v2::compiler::compile_search(&dsl, &app.events_table) {
                    Ok(compiled) => compiled.where_sql,
                    Err(_) => {
                        // Fallback to simple message search
                        if req.q.contains(":") {
                            format!("positionCaseInsensitive(message, '{}') > 0", req.q.replace("'", "''"))
                        } else {
                            format!("positionCaseInsensitive(message, '{}') > 0", req.q.replace("'", "''"))
                        }
                    }
                }
            },
            Err(_) => {
                format!("positionCaseInsensitive(message, '{}') > 0", req.q.replace("'", "''"))
            }
        }
    };
    
    let base_where = format!("({}) AND ({}) AND ({})", tenant_filter, time_filter, query_filter);
    let facets_to_compute = req.facets.unwrap_or_else(|| vec![
        FacetSpec { field: "source_type".to_string(), size: Some(10) },
        FacetSpec { field: "event_type".to_string(), size: Some(10) },
        FacetSpec { field: "severity".to_string(), size: Some(5) },
    ]);
    
    let mut result_facets = HashMap::new();
    let client = reqwest::Client::new();
    
    for facet_spec in facets_to_compute {
        let size = facet_spec.size.unwrap_or(10).min(100);
        let sql = format!(
            "SELECT {} AS value, count() AS c FROM {} WHERE {} GROUP BY value ORDER BY c DESC LIMIT {} FORMAT JSON",
            facet_spec.field, app.events_table, base_where, size
        );
        
        let resp = client
            .get("http://localhost:8123/")
            .query(&[("query", &sql)])
            .send()
            .await
            .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;

        if resp.status().is_success() {
            if let Ok(text) = resp.text().await {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    if let Some(rows) = v.get("data").and_then(|d| d.as_array()) {
                        let facet_values: Vec<FacetValue> = rows
                            .iter()
                            .filter_map(|row| {
                                let value = row.get("value").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let count = row.get("c")
                                    .and_then(|c| c.as_u64().or_else(|| c.as_str().and_then(|s| s.parse().ok())))
                                    .unwrap_or(0);
                                if !value.is_empty() {
                                    Some(FacetValue { value, count })
                                } else {
                                    None
                                }
                            })
                            .collect();
                        result_facets.insert(facet_spec.field.clone(), facet_values);
                    }
                }
            }
        }
        
        // Ensure we have at least an empty array for each requested field
        if !result_facets.contains_key(&facet_spec.field) {
            result_facets.insert(facet_spec.field, Vec::new());
        }
    }
    
    Ok(Json(FacetsResponse { facets: result_facets }))
}


