use axum::{extract::State, Json};
use serde_json::Value;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use axum::http::HeaderMap;
use axum::body::Bytes;
use axum::{extract::Query};

use crate::v2::{state::AppState, models::SiemEvent, dal::ClickHouseRepo, metrics};
use clickhouse::Row;
use crate::error::Result;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;
use std::collections::HashMap;
// use redis::AsyncCommands; // not needed with Script::invoke_async

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
    _headers: HeaderMap,
    body: Bytes,
) -> Result<Json<serde_json::Value>> {
    let payload = parse_payload(_headers, &body)?;
    metrics::inc_ingest_bytes("api", body.len() as u64);
    let mut out: Vec<SiemEvent> = Vec::with_capacity(payload.logs.len());
    for v in payload.logs.into_iter() {
        if let Some(ev) = transform_to_siem_event(v) {
            // Retention will be set after resolving tenant limits
            out.push(ev);
        }
    }
    // Apply token bucket and set retention from per-tenant limits
    if let Some(first_tenant) = out.first().map(|e| e.tenant_id.clone()) {
        let limits = get_limits_cached(&st, &first_tenant).await;
        for ev in out.iter_mut() { ev.retention_days = Some(limits.retention_days); }
        metrics::set_retention_days(&first_tenant, limits.retention_days);
        let allowed = token_bucket_allow(&first_tenant, out.len() as u32, limits).await;
        if !allowed {
            let src = out.first().and_then(|e| e.source_type.as_deref()).unwrap_or("unknown");
            metrics::inc_ingest_rate_limited(&first_tenant, src);
            metrics::inc_eps_throttles(&first_tenant);
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

/// POST /api/v2/ingest/bulk?tenant=TENANT_ID
/// Accepts NDJSON body (JSONEachRow) and applies EPS token-bucket per tenant.
pub async fn ingest_bulk(
    State(st): State<Arc<AppState>>,
    Query(q): Query<std::collections::HashMap<String, String>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<serde_json::Value>> {
    let tenant = q.get("tenant").cloned().unwrap_or_else(|| "default".to_string());
    // Optional Redis-based token bucket with Lua
    if let Some(cm) = st.redis.as_ref() {
        let mut conn = cm.clone();
        let rate: u32 =  q.get("rate").and_then(|v| v.parse().ok()).unwrap_or( std::env::var("INGEST_EPS_DEFAULT").ok().and_then(|s| s.parse().ok()).unwrap_or(100) );
        let burst: u32 = q.get("burst").and_then(|v| v.parse().ok()).unwrap_or( std::env::var("INGEST_BURST_DEFAULT").ok().and_then(|s| s.parse().ok()).unwrap_or(200) );
        let api_key = headers.get("X-Api-Key").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
        let limiter_key = api_key.unwrap_or_else(|| tenant.clone());
        const LUA_TB: &str = r#"
local key = KEYS[1]
local now = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])
local state = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1]) or burst
local ts = tonumber(state[2]) or now
local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(burst, tokens + (elapsed * rate / 1000))
local ok = 0
local retry = 0
if tokens >= 1 then
  tokens = tokens - 1
  ok = 1
  retry = 0
else
  ok = 0
  retry = math.ceil((1 - tokens) / rate)
end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, 2000)
return {ok, retry}
"#;
        let now_ms = chrono::Utc::now().timestamp_millis();
        let script = redis::Script::new(LUA_TB);
        let res: (i64, i64) = script
            .key(format!("rl:{}", limiter_key))
            .arg(now_ms)
            .arg(rate)
            .arg(burst)
            .invoke_async(&mut conn)
            .await
            .unwrap_or((1, 0));
        if res.0 == 0 {
            metrics::inc_v2_rate_limit(&tenant);
            return Err(crate::error::PipelineError::rate_limit(format!("RATE_LIMIT: retry_after={}", res.1)));
        }
    }
    // naive NDJSON split
    let text = String::from_utf8_lossy(&body);
    let mut out: Vec<SiemEvent> = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() { continue; }
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            if let Some(mut ev) = transform_to_siem_event(v) {
                ev.tenant_id = tenant.clone();
                out.push(ev);
            }
        }
    }
    let limits = get_limits_cached(&st, &tenant).await;
    for ev in out.iter_mut() { ev.retention_days = Some(limits.retention_days); }
    metrics::set_retention_days(&tenant, limits.retention_days);
    let allowed = token_bucket_allow(&tenant, out.len() as u32, limits).await;
    if !allowed {
        let src = out.first().and_then(|e| e.source_type.as_deref()).unwrap_or("unknown");
        metrics::inc_ingest_rate_limited(&tenant, src);
        metrics::inc_eps_throttles(&tenant);
        metrics::inc_v2_rate_limit(&tenant);
        return Err(crate::error::PipelineError::rate_limit("RATE_LIMIT: retry_after=1"));
    }
    metrics::inc_ingest_bytes("api", body.len() as u64);
    metrics::inc_v2_ingest(&tenant, "ok");
    let inserted = ClickHouseRepo::insert_events(&st, &out).await?;
    // Enqueue to Redis Stream (compact envelope) with backpressure guard
    if let Some(cm) = st.redis.as_ref() {
        let mut conn = cm.clone();
        let stream = format!("siem:events:{}", tenant);
        // Soft limit for stream length before pausing enqueue
        let maxlen_soft: i64 = std::env::var("STREAM_MAXLEN_SOFT").ok().and_then(|v| v.parse().ok()).unwrap_or(100_000);
        // Probe current length
        let current_len: i64 = redis::cmd("XLEN").arg(&stream).query_async(&mut conn).await.unwrap_or(0);
        if current_len > maxlen_soft {
            // Signal backpressure and skip enqueue (we still inserted to CH above)
            crate::v2::metrics::inc_stream_backpressure(&tenant);
        } else {
            for ev in &out {
                let meta_snippet = if ev.metadata.len() <= 200 { ev.metadata.as_str() } else { &ev.metadata[..200] };
                let raw_snippet = if ev.raw_event.len() <= 200 { ev.raw_event.as_str() } else { &ev.raw_event[..200] };
                let msg_val = ev
                    .message
                    .as_deref()
                    .filter(|s| !s.is_empty())
                    .unwrap_or(raw_snippet);
                let mut cmd = redis::cmd("XADD");
                cmd.arg(&stream)
                    .arg("MAXLEN").arg("~").arg(maxlen_soft)
                    .arg("*")
                    .arg("event_id").arg(&ev.event_id)
                    .arg("ts").arg(ev.event_timestamp as i64)
                    .arg("cat").arg(&ev.event_category)
                    .arg("act").arg(ev.event_action.as_deref().unwrap_or(""))
                    .arg("out").arg(ev.event_outcome.as_deref().unwrap_or(""))
                    .arg("src").arg(ev.source_ip.as_deref().unwrap_or(""))
                    .arg("dst").arg(ev.destination_ip.as_deref().unwrap_or(""))
                    .arg("st").arg(ev.source_type.as_deref().unwrap_or(""))
                    .arg("msg").arg(msg_val)
                    .arg("meta").arg(meta_snippet)
                    .arg("raw").arg(raw_snippet);
                let _: redis::Value = cmd.query_async(&mut conn).await.unwrap_or(redis::Value::Okay);
                metrics::inc_v2_stream_enqueue(&tenant);
            }
        }
    }
    if let Some(first) = out.first() {
        let src = first.source_type.as_deref().unwrap_or("unknown");
        metrics::inc_ingest_records(&tenant, src, inserted);
        metrics::set_ingest_eps(&tenant, src, inserted as f64);
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
    // Preserve common fields if present; fall back to heuristics
    let tenant_id = v.get("tenant_id")
        .and_then(|x| x.as_str().map(|s| s.to_string()).or_else(|| x.as_i64().map(|n| n.to_string())))
        .unwrap_or_else(|| "default".to_string());

    // Timestamps: prefer numeric event_timestamp, then RFC3339 string "timestamp", else now
    let event_timestamp = v.get("event_timestamp")
        .and_then(|t| t.as_i64()).map(|n| n as u32)
        .or_else(|| v.get("timestamp").and_then(|t| t.as_str()).and_then(|s| DateTime::parse_from_rfc3339(s).ok().map(|dt| dt.timestamp() as u32)))
        .unwrap_or_else(|| Utc::now().timestamp() as u32);

    let severity = v.get("severity").and_then(|x| x.as_str()).map(|s| s.to_string());
    let source_ip = v.get("source_ip").or_else(|| v.get("src_ip").or_else(|| v.get("srcip"))).and_then(|x| x.as_str()).map(|s| s.to_string());
    let destination_ip = v.get("destination_ip").or_else(|| v.get("dst_ip").or_else(|| v.get("dstip")).or_else(|| v.get("dest_ip"))).and_then(|x| x.as_str()).map(|s| s.to_string());

    let event_category = v
        .get("event_category")
        .or_else(|| v.get("event_type"))
        .or_else(|| v.get("type"))
        .or_else(|| v.get("subtype"))
        .and_then(|x| x.as_str())
        .unwrap_or("event")
        .to_string();
    let event_action = v.get("event_action").or_else(|| v.get("action")).and_then(|x| x.as_str()).map(|s| s.to_string());
    let event_outcome = v.get("event_outcome").or_else(|| v.get("request_status")).and_then(|x| x.as_str()).map(|s| s.to_string());

    let user_id = v.get("user_id").and_then(|x| x.as_str()).map(|s| s.to_string());
    let user_name = v.get("user_name").and_then(|x| x.as_str()).map(|s| s.to_string());

    // Preserve message and event_id if provided
    let message = v.get("message").and_then(|x| x.as_str()).map(|s| s.to_string());
    let event_id = v.get("event_id").and_then(|x| x.as_str()).map(|s| s.to_string()).unwrap_or_else(|| Uuid::new_v4().to_string());

    // Source type: prefer explicit source_type then log_type
    let source_type = v.get("source_type").or_else(|| v.get("log_type")).and_then(|x| x.as_str()).map(|s| s.to_string());

    let raw_event = v.to_string();
    let metadata = String::from("{}");

    Some(SiemEvent {
        event_id,
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
        message,
        raw_event,
        metadata,
        created_at: Utc::now().timestamp() as u32,
        source_type,
        retention_days: None,
    })
}


