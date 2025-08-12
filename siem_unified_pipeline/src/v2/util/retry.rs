use std::time::Duration;
use tokio::time::sleep;
use rand::Rng;

/// Retry an idempotent operation with exponential backoff and jitter
pub async fn retry_idempotent<F, Fut, T, E>(
    attempts: u8,
    mut f: F,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Display,
{
    let mut last_error = None;
    
    for attempt in 0..attempts {
        match f().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                last_error = Some(e);
                
                if attempt < attempts - 1 {
                    // Calculate backoff with jitter
                    let base_delay_ms = 50 * (2_u64.pow(attempt as u32));
                    let jitter = rand::thread_rng().gen_range(0..=base_delay_ms / 2);
                    let delay_ms = base_delay_ms + jitter;
                    
                    // Cap at 5 seconds
                    let delay_ms = delay_ms.min(5000);
                    
                    tracing::debug!(
                        "Retry attempt {} failed, waiting {}ms before retry",
                        attempt + 1,
                        delay_ms
                    );
                    
                    sleep(Duration::from_millis(delay_ms)).await;
                }
            }
        }
    }
    
    Err(last_error.unwrap())
}

/// Retry with custom backoff strategy
pub async fn retry_with_backoff<F, Fut, T, E>(
    attempts: u8,
    initial_delay_ms: u64,
    max_delay_ms: u64,
    mut f: F,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
{
    let mut last_error = None;
    
    for attempt in 0..attempts {
        match f().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                last_error = Some(e);
                
                if attempt < attempts - 1 {
                    let delay_ms = (initial_delay_ms * 2_u64.pow(attempt as u32)).min(max_delay_ms);
                    sleep(Duration::from_millis(delay_ms)).await;
                }
            }
        }
    }
    
    Err(last_error.unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;
    
    #[tokio::test]
    async fn test_retry_succeeds_on_third_attempt() {
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();
        
        let result = retry_idempotent(5, || {
            let c = counter_clone.clone();
            async move {
                let count = c.fetch_add(1, Ordering::SeqCst);
                if count < 2 {
                    Err("Failed")
                } else {
                    Ok("Success")
                }
            }
        }).await;
        
        assert_eq!(result.unwrap(), "Success");
        assert_eq!(counter.load(Ordering::SeqCst), 3);
    }
    
    #[tokio::test]
    async fn test_retry_exhausts_attempts() {
        let result: Result<(), &str> = retry_idempotent(3, || async {
            Err("Always fails")
        }).await;
        
        assert!(result.is_err());
    }
}
