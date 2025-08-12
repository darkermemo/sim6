use std::{collections::HashMap, sync::{Arc, OnceLock}, time::{Duration, Instant}};
use tokio::sync::{Mutex, OwnedMutexGuard};

type LockMap = HashMap<String, (Arc<Mutex<()>>, Instant)>;
static LOCKS: OnceLock<Mutex<LockMap>> = OnceLock::new();
fn locks() -> &'static Mutex<LockMap> { LOCKS.get_or_init(|| Mutex::new(HashMap::new())) }

pub struct KeyGuard { #[allow(dead_code)] key: String, #[allow(dead_code)] _guard: OwnedMutexGuard<()> }

/// Acquire a per-key async mutex for ~60s. Prevents same-key requests from writing concurrently.
pub async fn lock_key(key: &str) -> KeyGuard {
    let key = key.to_string();
    let arc = {
        let mut map = locks().lock().await;
        let (arc, ts) = map.entry(key.clone()).or_insert_with(|| (Arc::new(Mutex::new(())), Instant::now()));
        *ts = Instant::now();
        arc.clone()
    };
    let guard = arc.lock_owned().await;
    {
        // opportunistic cleanup
        let mut map = locks().lock().await;
        map.retain(|_, (_, ts)| ts.elapsed() < Duration::from_secs(60));
    }
    KeyGuard { key, _guard: guard }
}
