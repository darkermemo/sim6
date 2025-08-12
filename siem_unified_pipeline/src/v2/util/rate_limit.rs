use crate::v2::state::AppState;
use crate::error::PipelineError;
use redis::Script;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

// Environment variable defaults
const DEFAULT_EPS: u32 = 100;
const DEFAULT_BURST: u32 = 200;

// Lua script for atomic token bucket
const TOKEN_BUCKET_SCRIPT: &str = r#"
local key = KEYS[1]
local refill_rate = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local tokens_requested = tonumber(ARGV[4] or 1)

-- Get current state
local current = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(current[1]) or capacity
local last_refill = tonumber(current[2]) or now_ms

-- Calculate refill
local time_passed = math.max(0, now_ms - last_refill)
local tokens_to_add = (time_passed / 1000) * refill_rate
tokens = math.min(capacity, tokens + tokens_to_add)

-- Try to consume
if tokens >= tokens_requested then
    tokens = tokens - tokens_requested
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now_ms)
    redis.call('EXPIRE', key, 3600)
    return {1, tokens}  -- allowed, remaining tokens
else
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now_ms)
    redis.call('EXPIRE', key, 3600)
    return {0, tokens}  -- denied, remaining tokens
end
"#;

#[derive(Debug, Clone)]
pub struct EpsDecision {
    pub allowed: bool,
    pub remaining: f64,
    pub retry_after: Option<u64>,  // seconds until tokens available
}

// Local fallback token buckets
lazy_static::lazy_static! {
    static ref LOCAL_BUCKETS: Arc<Mutex<HashMap<String, LocalBucket>>> = Arc::new(Mutex::new(HashMap::new()));
}

#[derive(Debug, Clone)]
struct LocalBucket {
    tokens: f64,
    last_refill: u64,
    refill_rate: u32,
    capacity: u32,
}

/// Check if request is within EPS limits
pub async fn check_eps(
    state: &AppState,
    tenant: u64,
    source: Option<String>,
) -> Result<EpsDecision, PipelineError> {
    let source_str = source.unwrap_or_else(|| "*".to_string());
    let key = format!("siem:eps:{}:{}:tokens", tenant, source_str);
    
    // Get limits from environment or defaults
    let default_eps = std::env::var("DEFAULT_EPS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_EPS);
    let default_burst = std::env::var("DEFAULT_BURST")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_BURST);
    
    // TODO: Query dev.tenants_eps_effective for tenant-specific limits
    let (refill_rate, capacity) = (default_eps, default_burst);
    
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    
    if let Some(redis) = &state.redis {
        // Redis token bucket
        let mut conn = redis.clone();
        let script = Script::new(TOKEN_BUCKET_SCRIPT);
        let result: Vec<i64> = script
            .key(&key)
            .arg(refill_rate)
            .arg(capacity)
            .arg(now_ms)
            .arg(1)  // tokens requested
            .invoke_async(&mut conn)
            .await
            .map_err(|e| PipelineError::database(format!("Redis rate limit error: {}", e)))?;
        
        let allowed = result[0] == 1;
        let remaining = result[1] as f64;
        
        let retry_after = if !allowed && refill_rate > 0 {
            // Calculate seconds until 1 token is available
            Some(((1.0 - remaining) / refill_rate as f64).ceil() as u64)
        } else {
            None
        };
        
        Ok(EpsDecision {
            allowed,
            remaining,
            retry_after,
        })
    } else {
        // Local fallback
        let mut buckets = LOCAL_BUCKETS.lock().await;
        let bucket = buckets.entry(key.clone()).or_insert(LocalBucket {
            tokens: capacity as f64,
            last_refill: now_ms,
            refill_rate,
            capacity,
        });
        
        // Refill tokens
        let time_passed = (now_ms - bucket.last_refill) as f64 / 1000.0;
        let tokens_to_add = time_passed * bucket.refill_rate as f64;
        bucket.tokens = (bucket.tokens + tokens_to_add).min(bucket.capacity as f64);
        bucket.last_refill = now_ms;
        
        // Try to consume
        let allowed = bucket.tokens >= 1.0;
        if allowed {
            bucket.tokens -= 1.0;
        }
        
        let retry_after = if !allowed && bucket.refill_rate > 0 {
            Some(((1.0 - bucket.tokens) / bucket.refill_rate as f64).ceil() as u64)
        } else {
            None
        };
        
        Ok(EpsDecision {
            allowed,
            remaining: bucket.tokens,
            retry_after,
        })
    }
}

/// Get tenant EPS limits from database
pub async fn get_tenant_limits(
    state: &AppState,
    tenant_id: u64,
    source: Option<&str>,
) -> Result<(u32, u32), PipelineError> {
    let source_filter = source.unwrap_or("*");
    let sql = format!(
        "SELECT limit_eps, burst FROM dev.tenants_eps_effective \
         WHERE tenant_id = {} AND source = '{}' \
         ORDER BY source DESC LIMIT 1",
        tenant_id,
        source_filter.replace('\'', "''")
    );
    
    let query = state.ch.query(&sql);
    let row = query
        .fetch_one::<(u32, u32)>()
        .await
        .map_err(|e| PipelineError::database(format!("Failed to fetch EPS limits: {}", e)))?;
    
    Ok(row)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_local_rate_limit() {
        let state = AppState::new("http://localhost:8123", "dev.events");
        
        // First request should be allowed
        let decision = check_eps(&state, 1, None).await.unwrap();
        assert!(decision.allowed);
        assert!(decision.remaining > 0.0);
        
        // Consume all tokens
        for _ in 0..200 {
            let _ = check_eps(&state, 1, None).await.unwrap();
        }
        
        // Should be rate limited now
        let decision = check_eps(&state, 1, None).await.unwrap();
        assert!(!decision.allowed);
        assert!(decision.retry_after.is_some());
    }
}
