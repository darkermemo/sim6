use axum::{extract::State, Json};
use serde_json::Value;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use axum::http::HeaderMap;
use axum::body::Bytes;

use crate::v2::{state::AppState, models::SiemEvent, dal::ClickHouseRepo, metrics};
use clickhouse::Row;
use crate::error::Result;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;
use std::collections::HashMap;

#[derive(Clone, Copy, Debug)]
struct Limits { eps_limit: u32, burst_limit: u32, retention_days: u16 }

static LIMITS_CACHE: Lazy<Mutex<HashMap<String, (Limits, u64)>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static TOKEN_BUCKET: Lazy<Mutex<HashMap<String, (f64, u64)>>> = Lazy::new(|| Mutex::new(HashMap::new()));

async fn fetch_limits(st: &AppState, tenant: &str) -> Limits {
    #[derive(serde::Deserialize, Row)]
    struct L { eps_limit:u32, burst_limit:u32, retention_days:u16 }
    let row: Option<L> = st.ch
        .query("SELECT eps_limit,burst_limit,retention_days FROM dev.tenant_limits WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 1")
        .bind(tenant)
        .fetch_optional()
        .await
        .ok()
        .flatten();
    if let Some(r) = row { Limits{ eps_limit:r.eps_limit, burst_limit:r.burst_limit, retention_days:r.retention_days } }
    else { Limits{ eps_limit:50, burst_limit:100, retention_days:30 } }
}

async fn get_limits_cached(st: &AppState, tenant: &str) -> Limits {
    let now = Utc::now().timestamp() as u64;
    let mut guard = LIMITS_CACHE.lock().await;
    if let Some((lim, ts)) = guard.get(tenant).copied() {
        if now.saturating_sub(ts) < 60 { return lim; }
    }
    let lim = fetch_limits(st, tenant).await;
    guard.insert(tenant.to_string(), (lim, now));
    lim
}

async fn token_bucket_allow(tenant: &str, batch: u32, limits: Limits) -> bool {
    let now = Utc::now().timestamp() as u64;
    let mut guard = TOKEN_BUCKET.lock().await;
    let entry = guard.entry(tenant.to_string()).or_insert((limits.burst_limit as f64, now));
    let (tokens, last) = entry;
    let elapsed = now.saturating_sub(*last) as f64;
    if elapsed > 0.0 {
        let added = elapsed * (limits.eps_limit as f64);
        *tokens = (*tokens + added).min(limits.burst_limit as f64);
        *last = now;
    }
    if (*tokens as u32) < batch { return false; }
    *tokens -= batch as f64;
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn token_bucket_respects_burst_and_refill() {
        let tenant = "t1";
        let limits = Limits { eps_limit: 10, burst_limit: 20, retention_days: 30 };
        // First call consumes 15 within burst (20)
        assert!(token_bucket_allow(tenant, 15, limits).await);
        // Next immediate call of 10 should fail (only 5 tokens left)
        assert!(!token_bucket_allow(tenant, 10, limits).await);
        // Simulate refill by sleeping ~1s → +10 tokens, enough for 10
        tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
        assert!(token_bucket_allow(tenant, 10, limits).await);
    }
}

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
            // Retention will be set after resolving tenant limits
            out.push(ev);
        }
    }
    // Apply token bucket and set retention from per-tenant limits
    if let Some(first_tenant) = out.get(0).map(|e| e.tenant_id.clone()) {
        let limits = get_limits_cached(&st, &first_tenant).await;
        for ev in out.iter_mut() { ev.retention_days = Some(limits.retention_days); }
        metrics::set_retention_days(&first_tenant, limits.retention_days);
        let allowed = token_bucket_allow(&first_tenant, out.len() as u32, limits).await;
        if !allowed {
            let src = out.get(0).and_then(|e| e.source_type.as_deref()).unwrap_or("unknown");
            metrics::inc_ingest_rate_limited(&first_tenant, src);
            // Return 429 JSON payload via standard error mapping
            return Err(crate::error::PipelineError::rate_limit("RATE_LIMIT: retry_after=1"));
        }
    }
    // Temporary: if batch too large, simulate backpressure by rate-limiting
    if out.len() > 10_000 {
        if let Some(first) = out.first() {
            metrics::inc_ingest_rate_limited(&first.tenant_id, first.source_type.as_deref().unwrap_or("unknown"));
        }
        return Err(crate::error::PipelineError::rate_limit("batch too large"));
    }
    let inserted = ClickHouseRepo::insert_events(&st, &out).await?;
    if let Some(first) = out.first() {
        let src = first.source_type.as_deref().unwrap_or("unknown");
        metrics::inc_ingest_records(&first.tenant_id, src, inserted);
        // crude EPS snapshot: batch count per second
        metrics::set_ingest_eps(&first.tenant_id, src, inserted as f64);
    }
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
        retention_days: None,
    })
}


