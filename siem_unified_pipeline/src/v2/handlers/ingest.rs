use axum::{extract::State, Json};
use serde_json::Value;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use axum::http::HeaderMap;
use axum::body::Bytes;

use crate::v2::{state::AppState, models::SiemEvent, dal::ClickHouseRepo};
use crate::error::Result;

#[derive(serde::Deserialize)]
pub struct RawIngestPayload {
    logs: Vec<Value>,
    #[allow(dead_code)]
    metadata: Option<Value>,
}

pub async fn ingest_raw(
    State(st): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<serde_json::Value>> {
    let payload = parse_payload(headers, &body)?;
    let mut out: Vec<SiemEvent> = Vec::with_capacity(payload.logs.len());
    for v in payload.logs.into_iter() {
        if let Some(ev) = transform_to_siem_event(v) {
            out.push(ev);
        }
    }
    let inserted = ClickHouseRepo::insert_events(&st, &out).await?;
    Ok(Json(serde_json::json!({ "received": out.len(), "inserted": inserted })))
}

fn parse_payload(headers: HeaderMap, body: &Bytes) -> Result<RawIngestPayload> {
    let enc = headers
        .get(axum::http::header::CONTENT_ENCODING)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_ascii_lowercase());

    let bytes = if matches!(enc.as_deref(), Some("gzip")) {
        let mut d = flate2::read::GzDecoder::new(body.as_ref());
        let mut s = String::new();
        use std::io::Read;
        d.read_to_string(&mut s)
            .map_err(|e| crate::error::PipelineError::parsing(format!("gzip decode failed: {e}")))?;
        s.into_bytes()
    } else {
        body.to_vec()
    };

    let payload: RawIngestPayload = serde_json::from_slice(&bytes)
        .map_err(|e| crate::error::PipelineError::parsing(format!("json parse failed: {e}")))?;
    Ok(payload)
}

fn transform_to_siem_event(v: Value) -> Option<SiemEvent> {
    // Try to detect vendor log_type
    let log_type = v.get("log_type").and_then(|x| x.as_str()).unwrap_or("unknown").to_string();
    let tenant_id = v.get("tenant_id").and_then(|x| x.as_i64()).map(|n| n.to_string()).unwrap_or_else(|| "default".to_string());

    // Timestamp handling
    let event_timestamp = v.get("timestamp")
        .and_then(|t| t.as_str())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok().map(|dt| dt.timestamp() as u32))
        .unwrap_or_else(|| Utc::now().timestamp() as u32);

    // Severity best-effort
    let severity = v.get("severity").and_then(|x| x.as_str()).map(|s| s.to_string());

    // Source/destination IPs (best-effort across formats)
    let source_ip = v.get("src_ip").or_else(|| v.get("srcip")).and_then(|x| x.as_str()).map(|s| s.to_string());
    let destination_ip = v.get("dst_ip").or_else(|| v.get("dstip")).or_else(|| v.get("dest_ip")).and_then(|x| x.as_str()).map(|s| s.to_string());

    // Category/action/outcome heuristics
    let event_category = v.get("event_type").or_else(|| v.get("type")).or_else(|| v.get("subtype")).and_then(|x| x.as_str()).unwrap_or("event").to_string();
    let event_action = v.get("action").and_then(|x| x.as_str()).map(|s| s.to_string());
    let event_outcome = v.get("request_status").and_then(|x| x.as_str()).map(|s| s.to_string());

    let user_id = v.get("user_id").and_then(|x| x.as_str()).map(|s| s.to_string());
    let user_name = v.get("user_name").and_then(|x| x.as_str()).map(|s| s.to_string());

    let raw_event = v.to_string();
    let metadata = String::from("{}");

    Some(SiemEvent {
        event_id: Uuid::new_v4().to_string(),
        event_timestamp,
        tenant_id,
        event_category,
        event_action,
        event_outcome,
        source_ip,
        destination_ip,
        user_id,
        user_name,
        severity,
        message: None,
        raw_event,
        metadata,
        created_at: Utc::now().timestamp() as u32,
        source_type: Some(log_type),
    })
}


