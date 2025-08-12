use crate::v2::state::AppState;
use crate::error::PipelineError;
use redis::{AsyncCommands, Script};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;
use uuid::Uuid;

// Lua script for safe unlock - only delete if value matches
const UNLOCK_SCRIPT: &str = r#"
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"#;

// Local fallback when Redis is not available
lazy_static::lazy_static! {
    static ref LOCAL_LOCKS: Arc<Mutex<HashMap<String, (String, Instant)>>> = Arc::new(Mutex::new(HashMap::new()));
}

/// Try to acquire a distributed lock
pub async fn try_lock(state: &AppState, key: &str, ttl_ms: u64) -> Result<bool, PipelineError> {
    let value = format!(
        "{}:{}:{}",
        hostname::get().unwrap_or_default().to_string_lossy(),
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis(),
        Uuid::new_v4()
    );

    if let Some(redis) = &state.redis {
        // Redis distributed lock with SET NX PX
        let mut conn = redis.clone();
        let result: Option<String> = conn
            .set_options(
                key,
                &value,
                redis::SetOptions::default()
                    .conditional_set(redis::ExistenceCheck::NX)
                    .with_expiration(redis::SetExpiry::PX(ttl_ms as usize)),
            )
            .await
            .map_err(|e| PipelineError::database(format!("Redis lock error: {}", e)))?;
        
        // Redis returns "OK" on success, None on failure
        Ok(result.is_some())
    } else {
        // Fallback to local in-memory lock
        let mut locks = LOCAL_LOCKS.lock().await;
        let now = Instant::now();
        
        // Clean up expired locks
        locks.retain(|_, (_, expiry)| *expiry > now);
        
        if locks.contains_key(key) {
            Ok(false)
        } else {
            let expiry = now + Duration::from_millis(ttl_ms);
            locks.insert(key.to_string(), (value, expiry));
            Ok(true)
        }
    }
}

/// Release a distributed lock
pub async fn unlock(state: &AppState, key: &str) -> Result<(), PipelineError> {
    if let Some(redis) = &state.redis {
        // Get the value to verify ownership
        let mut conn = redis.clone();
        let current_value: Option<String> = conn
            .get(key)
            .await
            .map_err(|e| PipelineError::database(format!("Redis get error: {}", e)))?;
        
        if let Some(val) = current_value {
            // Use Lua script to atomically check and delete
            let script = Script::new(UNLOCK_SCRIPT);
            let _: i32 = script
                .key(key)
                .arg(&val)
                .invoke_async(&mut conn)
                .await
                .map_err(|e| PipelineError::database(format!("Redis unlock error: {}", e)))?;
        }
        Ok(())
    } else {
        // Fallback to local unlock
        let mut locks = LOCAL_LOCKS.lock().await;
        locks.remove(key);
        Ok(())
    }
}

/// Helper to build a rule lock key
pub fn rule_lock_key(tenant_id: &str, rule_id: &str) -> String {
    format!("siem:lock:rule:{}:{}", tenant_id, rule_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_local_lock() {
        let state = AppState::new("http://localhost:8123", "dev.events");
        
        // First lock should succeed
        assert!(try_lock(&state, "test-key", 1000).await.unwrap());
        
        // Second lock should fail
        assert!(!try_lock(&state, "test-key", 1000).await.unwrap());
        
        // Unlock
        unlock(&state, "test-key").await.unwrap();
        
        // Now should succeed again
        assert!(try_lock(&state, "test-key", 1000).await.unwrap());
    }

    #[test]
    fn test_rule_lock_key() {
        assert_eq!(rule_lock_key("tenant1", "rule1"), "siem:lock:rule:tenant1:rule1");
    }
}
