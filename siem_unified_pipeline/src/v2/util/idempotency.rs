use axum::http::StatusCode;
use blake3;
use anyhow::Result;
use clickhouse::Row;
use crate::v2::state::AppState;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;
use std::collections::HashMap;
use std::time::{Duration, Instant};

/// Result of an idempotency check
pub struct IdemResult {
    pub replayed: bool,
    pub conflict: bool,
    pub status: Option<StatusCode>,
}

/// Compute u64 hash (little-endian) from BLAKE3 over body bytes
pub fn body_hash_u64(bytes: &[u8]) -> u64 {
    let h = blake3::hash(bytes);
    u64::from_le_bytes(h.as_bytes()[0..8].try_into().unwrap())
}

static IDEM_LOCKS: Lazy<Mutex<HashMap<String, Instant>>> = Lazy::new(|| Mutex::new(HashMap::new()));
const IDEM_LOCK_TTL: Duration = Duration::from_secs(60);

/// Guard object that removes the route:key entry on drop
pub struct IdemGuard { key: String }
impl Drop for IdemGuard {
    fn drop(&mut self) {
        let key = self.key.clone();
        let fut = async move {
            let mut m = IDEM_LOCKS.lock().await;
            m.remove(&key);
        };
        // Fire and forget; we are in Drop
        let _ = tokio::spawn(fut);
    }
}

/// Acquire a process-local lock for (route:key), returns a guard that releases on drop
pub async fn acquire_lock(route: &str, key: &str) -> IdemGuard {
    let k = format!("{}:{}", route, key);
    let mut map = IDEM_LOCKS.lock().await;
    // Prune expired
    let now = Instant::now();
    map.retain(|_, ts| now.duration_since(*ts) < IDEM_LOCK_TTL);
    map.insert(k.clone(), now);
    IdemGuard { key: k }
}

/// Check idempotency store for (key,route) and body hash
pub async fn check(st: &AppState, route: &str, key: Option<&str>, body: &[u8]) -> Result<IdemResult> {
    if key.is_none() {
        return Ok(IdemResult { replayed: false, conflict: false, status: None });
    }
    let key = key.unwrap();
    // Enforce 5 MiB cap
    const CAP: usize = 5 * 1024 * 1024;
    if body.len() > CAP {
        crate::v2::metrics::inc_idempotency(route, "conflict");
        return Ok(IdemResult { replayed: false, conflict: true, status: Some(StatusCode::PAYLOAD_TOO_LARGE) });
    }
    let bh = body_hash_u64(body);
    #[derive(Row, serde::Deserialize)]
    struct R { body_hash: u64, last_status: u16, attempts: u32 }
    let row: Option<R> = st.ch
        .query("SELECT body_hash, last_status, attempts FROM dev.idempotency_keys WHERE key=? AND route=? ORDER BY first_seen_at DESC LIMIT 1")
        .bind(key)
        .bind(route)
        .fetch_optional()
        .await
        .ok()
        .flatten();
    match row {
        None => {
            crate::v2::metrics::inc_idempotency(route, "miss");
            Ok(IdemResult { replayed: false, conflict: false, status: None })
        }
        Some(r) => {
            if r.body_hash == bh {
                // replay
                let _ = st.ch
                    .query("INSERT INTO dev.idempotency_keys (key, route, body_hash, last_status, last_reason, attempts) VALUES (?,?,?,?,?,?)")
                    .bind(key).bind(route).bind(bh).bind(r.last_status).bind("").bind(r.attempts.saturating_add(1))
                    .execute().await;
                crate::v2::metrics::inc_idempotency(route, "replay");
                Ok(IdemResult { replayed: true, conflict: false, status: Some(StatusCode::OK) })
            } else {
                crate::v2::metrics::inc_idempotency(route, "conflict");
                Ok(IdemResult { replayed: false, conflict: true, status: Some(StatusCode::CONFLICT) })
            }
        }
    }
}

/// Record success after a write completes
pub async fn record_success(st: &AppState, route: &str, key: &str, body_hash: u64, status: u16, reason: &str) -> Result<()> {
    let _ = st.ch
        .query("INSERT INTO dev.idempotency_keys (key, route, body_hash, last_status, last_reason, attempts) VALUES (?,?,?,?,?,?)")
        .bind(key).bind(route).bind(body_hash).bind(status).bind(reason).bind(1u32)
        .execute().await;
    Ok(())
}
