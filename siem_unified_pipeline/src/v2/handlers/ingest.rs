use axum::{extract::State, Json};
use serde_json::Value;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use axum::http::HeaderMap;
use axum::body::Bytes;
use axum::{extract::Query};

use base64::Engine;

use crate::v2::{state::AppState, models::SiemEvent, dal::ClickHouseRepo, metrics};
use crate::v2::util::rate_limit::{check_eps, EpsDecision};
use crate::v2::normalize;
use clickhouse::Row;
use crate::error::{Result, PipelineError};
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
        .query("SELECT eps_limit,burst_limit,retention_days FROM dev.tenant_limits_admin WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 1")
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
        if let Some(ev) = transform_to_siem_event(v, None, &st).await {
            // Retention will be set after resolving tenant limits
            out.push(ev);
        }
    }
    // Apply token bucket and set retention from per-tenant limits
    if let Some(first_tenant) = out.first().map(|e| e.tenant_id.clone()) {
        let limits = get_limits_cached(&st, &first_tenant).await;
        for ev in out.iter_mut() { ev.retention_days = Some(limits.retention_days); }
        metrics::set_retention_days(&first_tenant, limits.retention_days);
        // Use Redis-based rate limiter
        let tenant_id = first_tenant.parse::<u64>().unwrap_or(0);
        let source = out.first().and_then(|e| e.source_type.clone());
        let decision = check_eps(&st, tenant_id, source.clone()).await?;
        
        if !decision.allowed {
            let src = source.as_deref().unwrap_or("unknown");
            metrics::inc_ingest_rate_limited(&first_tenant, src);
            metrics::inc_eps_throttles(&first_tenant);
            metrics::inc_v2_rate_limit_total(&first_tenant, src, "throttle");
            
            // Return 429 with retry_after
            let retry_after = decision.retry_after.unwrap_or(1);
            return Err(PipelineError::rate_limit(format!("EPS exceeded, retry_after: {}", retry_after)));
        }
        
        metrics::inc_v2_rate_limit_total(&first_tenant, source.as_deref().unwrap_or("*"), "allow");
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
    // Resolve tenant via API key (X-Api-Key) if present; otherwise fall back to query param
    let mut tenant = q.get("tenant").cloned().unwrap_or_else(|| "default".to_string());
    if let Some(api_key) = headers.get("X-Api-Key").and_then(|v| v.to_str().ok()) {
        if let Some((t, scopes)) = resolve_api_key(&st, api_key).await? {
            // Enforce ingest scope
            if !scopes.iter().any(|s| s == "ingest") {
                return Err(crate::error::PipelineError::AuthorizationError("FORBIDDEN".into()));
            }
            tenant = t;
        } else {
            return Err(crate::error::PipelineError::AuthorizationError("FORBIDDEN".into()));
        }
    }
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
    // Enforce daily quota caps (events/bytes) per tenant via ClickHouse counters
    let _day = chrono::Utc::now().date_naive().to_string();
    // events last 1d
    let ev_1d: Option<u64> = st.ch.query("SELECT toUInt64(count()) FROM dev.events WHERE tenant_id=? AND created_at >= toUInt32(now())-86400")
        .bind(&tenant).fetch_optional().await.unwrap_or(None);
    let max_events: u64 = std::env::var("TENANT_EVENTS_PER_DAY_MAX").ok().and_then(|v| v.parse().ok()).unwrap_or(1_000_000);
    if ev_1d.unwrap_or(0) >= max_events {
        crate::v2::metrics::inc_quota_violation(&tenant, "events");
        return Err(crate::error::PipelineError::quota_exceeded("events per day exceeded"));
    }
    // Idempotency: cap body at 5 MiB and compute hash over raw bytes
    let idem_key = headers.get("Idempotency-Key").and_then(|v| v.to_str().ok());
    const CAP: usize = 5 * 1024 * 1024;
    if body.len() > CAP {
        crate::v2::metrics::inc_idempotency("ingest:ndjson", "conflict");
        return Err(crate::error::PipelineError::validation("payload too large (5MiB cap)"));
    }
    // Acquire lock first to serialize same-key calls within the process
    let _guard = if let Some(k) = idem_key { Some(crate::v2::util::idempotency::acquire_lock("ingest:ndjson", k).await) } else { None };
    // Check idempotency on exact raw bytes before any parsing/work
    let idem = crate::v2::util::idempotency::check(&st, "ingest:ndjson", idem_key, &body).await.map_err(|e| crate::error::PipelineError::internal(format!("idempotency check: {e}")))?;
    if idem.replayed { return Ok(Json(serde_json::json!({"replayed":true,"accepted":0,"quarantined":0}))); }
    if idem.conflict { return Err(crate::error::PipelineError::ConflictError("idempotency_conflict".into())); }

    // naive NDJSON split with quarantine of invalid rows
    let text = String::from_utf8_lossy(&body);
    let mut out: Vec<SiemEvent> = Vec::new();
    let mut quarantined: u64 = 0;
    let mut reasons: HashMap<String, u64> = HashMap::new();
    for line in text.lines() {
        if line.trim().is_empty() { continue; }
        match serde_json::from_str::<Value>(line) {
            Ok(mut v) => {
                // Normalize ts -> event_timestamp if present
                if v.get("event_timestamp").is_none() {
                    if let Some(ts) = v.get("ts").cloned() { v.as_object_mut().unwrap().insert("event_timestamp".into(), ts); }
                }
                // Basic validation
                let mut reason: Option<&'static str> = None;
                // tenant_id
                let t_ok = v.get("tenant_id").map(|t| t.is_string() || t.is_number()).unwrap_or(false);
                if !t_ok { reason = Some("missing_tenant_id"); }
                // event_timestamp
                if reason.is_none() {
                    let ts_ok = v.get("event_timestamp").map(|t| t.is_number() || t.as_str().map(|s| chrono::DateTime::parse_from_rfc3339(s).is_ok()).unwrap_or(false)).unwrap_or(false);
                    if !ts_ok { reason = Some("missing_timestamp"); }
                }
                // message
                if reason.is_none() {
                    let m_ok = v.get("message").map(|m| m.is_string()).unwrap_or(false);
                    if !m_ok { reason = Some("missing_message"); }
                }
                if let Some(r) = reason {
                    quarantined += 1;
                    *reasons.entry(r.to_string()).or_insert(0) += 1;
                    let payload = line.to_string();
                    // fire-and-forget quarantine insert
                    let _ = st.ch
                        .query("INSERT INTO dev.events_quarantine (tenant_id, source, reason, payload) VALUES (?,?,?,?)")
                        .bind(tenant.parse::<u64>().unwrap_or(0))
                        .bind("http")
                        .bind(r)
                        .bind(&payload)
                        .execute().await;
                } else if let Some(mut ev) = transform_to_siem_event(v, None, &st).await {
                    ev.tenant_id = tenant.clone();
                    out.push(ev);
                }
            }
            Err(_) => {
                quarantined += 1;
                *reasons.entry("invalid_json".into()).or_insert(0) += 1;
                let _ = st.ch
                    .query("INSERT INTO dev.events_quarantine (tenant_id, source, reason, payload) VALUES (?,?,?,?)")
                    .bind(tenant.parse::<u64>().unwrap_or(0))
                    .bind("http")
                    .bind("invalid_json")
                    .bind(line)
                    .execute().await;
            }
        }
    }
    // If nothing valid parsed and at least one line attempted, treat as total parse failure
    if out.is_empty() && quarantined > 0 {
        return Err(crate::error::PipelineError::validation("no valid rows in NDJSON; all lines quarantined"));
    }

    let limits = get_limits_cached(&st, &tenant).await;
    for ev in out.iter_mut() { ev.retention_days = Some(limits.retention_days); }
    metrics::set_retention_days(&tenant, limits.retention_days);
    // Use Redis-based rate limiter
    let tenant_id = tenant.parse::<u64>().unwrap_or(0);
    let source = out.first().and_then(|e| e.source_type.clone());
    let decision = check_eps(&st, tenant_id, source.clone()).await?;
    
    if !decision.allowed {
        let src = source.as_deref().unwrap_or("unknown");
        metrics::inc_ingest_rate_limited(&tenant, src);
        metrics::inc_eps_throttles(&tenant);
        metrics::inc_v2_rate_limit(&tenant);
        metrics::inc_v2_rate_limit_total(&tenant, src, "throttle");
        
        // Return 429 with retry_after
        let retry_after = decision.retry_after.unwrap_or(1);
        return Err(PipelineError::rate_limit(format!("EPS exceeded, retry_after: {}", retry_after)));
    }
    
    metrics::inc_v2_rate_limit_total(&tenant, source.as_deref().unwrap_or("*"), "allow");
    // bytes cap
    let bytes_1d: Option<u64> = st.ch.query("SELECT toUInt64(sum(length(raw_event))) FROM dev.events WHERE tenant_id=? AND created_at >= toUInt32(now())-86400")
        .bind(&tenant).fetch_optional().await.unwrap_or(None);
    let max_bytes: u64 = std::env::var("TENANT_BYTES_PER_DAY_MAX").ok().and_then(|v| v.parse().ok()).unwrap_or(10_000_000_000);
    let this_bytes = body.len() as u64;
    if bytes_1d.unwrap_or(0) + this_bytes > max_bytes {
        crate::v2::metrics::inc_quota_violation(&tenant, "bytes");
        return Err(crate::error::PipelineError::quota_exceeded("bytes per day exceeded"));
    }
    metrics::inc_ingest_bytes("api", this_bytes);
    metrics::inc_v2_ingest(&tenant, "accepted");
    let inserted = ClickHouseRepo::insert_events(&st, &out).await?;
    if quarantined > 0 {
        // increment quarantined counter per reason
        for (r, c) in reasons.iter() { crate::v2::metrics::inc_v2_ingest_quarantined(&tenant, r, *c as u64); }
    }
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
    // Record idempotency success if key present
    if let Some(k) = idem_key {
        let bh = crate::v2::util::idempotency::body_hash_u64(&body);
        let _ = crate::v2::util::idempotency::record_success(&st, "ingest:ndjson", k, bh, 200, "").await;
    }
    Ok(Json(serde_json::json!({ "accepted": inserted, "quarantined": quarantined, "reasons": reasons })))
}

// Look up API key hash in dev.api_keys_admin and return (tenant_id, scopes) if enabled
async fn resolve_api_key(st: &AppState, secret: &str) -> Result<Option<(String, Vec<String>)>> {
    let hash = {
        let h = blake3::hash(secret.as_bytes());
        base64::engine::general_purpose::STANDARD.encode(h.as_bytes())
    };
    let _ = st.ch.query("CREATE TABLE IF NOT EXISTS dev.api_keys_admin (id String, tenant_id String, name String, key_hash String, scopes Array(String), enabled UInt8, created_at UInt32, updated_at UInt32) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (id)").execute().await;
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct KeyRow { tenant_id:String, scopes:Vec<String>, enabled:u8 }
    let row: Option<KeyRow> = st.ch
        .query("SELECT tenant_id, scopes, enabled FROM dev.api_keys_admin WHERE key_hash=? LIMIT 1")
        .bind(&hash)
        .fetch_optional()
        .await
        .map_err(|e| crate::error::PipelineError::database(format!("api key lookup: {e}")))?;
    if let Some(r) = row { if r.enabled == 1 { return Ok(Some((r.tenant_id, r.scopes))); } }
    Ok(None)
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

pub async fn transform_to_siem_event(v: Value, parser_id: Option<&str>, state: &AppState) -> Option<SiemEvent> {
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
    
    // Source tracking for ledger
    let source_seq = v.get("source_seq").and_then(|x| x.as_u64());
    let source_id = v.get("source_id").and_then(|x| x.as_str()).map(|s| s.to_string());

    let raw_event = v.to_string();
    let metadata = String::from("{}");

    // Apply normalization
    let norm = normalize::normalize(&raw_event, parser_id);
    
    // Extract IOCs for enrichment
    let iocs = normalize::extract_iocs(&norm);
    
    // Check against intel_iocs
    let mut ti_hits = Vec::new();
    let mut ti_match = 0u8;
    
    if !iocs.is_empty() {
        // Build query to check IOCs
        let ioc_values: Vec<String> = iocs.iter()
            .map(|(ioc, kind)| format!("('{}', '{}')", ioc.replace("'", "''"), kind))
            .collect();
        
        let query = format!(
            "SELECT ioc FROM dev.intel_iocs WHERE (ioc, kind) IN ({}) FORMAT JSON",
            ioc_values.join(",")
        );
        
        // Query intel_iocs (non-blocking, best effort)
        #[derive(Row, serde::Deserialize)]
        struct IocRow { ioc: String }
        
        if let Ok(rows) = state.ch.query(&query).fetch_all::<IocRow>().await {
            ti_hits = rows.into_iter().map(|r| r.ioc).collect();
            if !ti_hits.is_empty() {
                ti_match = 1;
            }
        }
    }

    Some(SiemEvent {
        event_id,
        event_timestamp,
        tenant_id,
        event_category: if !norm.event_category.is_empty() { norm.event_category } else { event_category },
        event_action,
        event_outcome,
        source_ip: if !norm.source_ip.is_empty() && norm.source_ip != "0.0.0.0" { Some(norm.source_ip) } else { source_ip },
        destination_ip: if !norm.destination_ip.is_empty() && norm.destination_ip != "0.0.0.0" { Some(norm.destination_ip) } else { destination_ip },
        user_id,
        user_name: if !norm.user.is_empty() { Some(norm.user.clone()) } else { user_name },
        severity,
        message,
        raw_event,
        metadata,
        created_at: Utc::now().timestamp() as u32,
        source_type,
        retention_days: None,
        source_seq,
        source_id,
        // New normalized fields
        event_type: if !norm.event_type.is_empty() { Some(norm.event_type) } else { None },
        action: if !norm.action.is_empty() { Some(norm.action) } else { None },
        user: if !norm.user.is_empty() { Some(norm.user) } else { None },
        host: if !norm.host.is_empty() { Some(norm.host) } else { None },
        severity_int: if norm.severity != 0 { Some(norm.severity) } else { None },
        vendor: if !norm.vendor.is_empty() { Some(norm.vendor) } else { None },
        product: if !norm.product.is_empty() { Some(norm.product) } else { None },
        parsed_fields: if !norm.parsed_fields.is_empty() { Some(norm.parsed_fields) } else { None },
        ti_hits: if !ti_hits.is_empty() { Some(ti_hits) } else { None },
        ti_match: Some(ti_match),
    })
}


