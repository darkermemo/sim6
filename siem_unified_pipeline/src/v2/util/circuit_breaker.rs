use std::sync::Arc;
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use crate::error::PipelineError;
use crate::v2::metrics;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CircuitState {
    Closed = 0,
    Open = 1,
    HalfOpen = 2,
}

impl From<u8> for CircuitState {
    fn from(value: u8) -> Self {
        match value {
            0 => CircuitState::Closed,
            1 => CircuitState::Open,
            2 => CircuitState::HalfOpen,
            _ => CircuitState::Closed,
        }
    }
}

pub struct CircuitBreaker {
    state: AtomicU8,
    error_count: AtomicU64,
    last_error_time: Arc<Mutex<Option<Instant>>>,
    last_state_change: Arc<Mutex<Instant>>,
    
    // Configuration
    errors_to_open: u64,
    window_ms: u64,
    cooldown_ms: u64,
}

impl CircuitBreaker {
    pub fn new() -> Self {
        let errors_to_open = std::env::var("CB_ERRORS_TO_OPEN")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(5);
            
        let window_ms = std::env::var("CB_WINDOW_MS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(60_000);
            
        let cooldown_ms = std::env::var("CB_COOLDOWN_MS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(5_000);
            
        Self {
            state: AtomicU8::new(CircuitState::Closed as u8),
            error_count: AtomicU64::new(0),
            last_error_time: Arc::new(Mutex::new(None)),
            last_state_change: Arc::new(Mutex::new(Instant::now())),
            errors_to_open,
            window_ms,
            cooldown_ms,
        }
    }
    
    pub async fn call<F, T>(&self, op: &str, f: F) -> Result<T, PipelineError>
    where
        F: std::future::Future<Output = Result<T, PipelineError>>,
    {
        // Check if circuit is open
        let current_state = self.get_state().await;
        
        match current_state {
            CircuitState::Open => {
                metrics::inc_clickhouse_errors(op);
                Err(PipelineError::ServiceUnavailableError(
                    "Circuit breaker is open - ClickHouse unavailable".to_string()
                ))
            },
            CircuitState::HalfOpen => {
                // Allow one probe request
                match f.await {
                    Ok(result) => {
                        // Success - close the circuit
                        self.close().await;
                        Ok(result)
                    }
                    Err(e) => {
                        // Failed - reopen
                        self.open().await;
                        metrics::inc_clickhouse_errors(op);
                        Err(e)
                    }
                }
            },
            CircuitState::Closed => {
                // Normal operation
                match f.await {
                    Ok(result) => {
                        // Reset error count on success
                        self.error_count.store(0, Ordering::Relaxed);
                        Ok(result)
                    }
                    Err(e) => {
                        self.record_error().await;
                        metrics::inc_clickhouse_errors(op);
                        Err(e)
                    }
                }
            }
        }
    }
    
    async fn get_state(&self) -> CircuitState {
        let state = CircuitState::from(self.state.load(Ordering::Relaxed));
        
        // Check if we should transition from Open to HalfOpen
        if state == CircuitState::Open {
            let last_change = *self.last_state_change.lock().await;
            if last_change.elapsed() > Duration::from_millis(self.cooldown_ms) {
                self.state.store(CircuitState::HalfOpen as u8, Ordering::Relaxed);
                self.update_metrics();
                return CircuitState::HalfOpen;
            }
        }
        
        state
    }
    
    async fn record_error(&self) {
        let mut last_error = self.last_error_time.lock().await;
        let now = Instant::now();
        
        // Check if we're within the error window
        if let Some(last) = *last_error {
            if last.elapsed() > Duration::from_millis(self.window_ms) {
                // Reset counter if outside window
                self.error_count.store(1, Ordering::Relaxed);
            } else {
                // Increment counter
                let count = self.error_count.fetch_add(1, Ordering::Relaxed) + 1;
                if count >= self.errors_to_open {
                    self.open().await;
                }
            }
        } else {
            self.error_count.store(1, Ordering::Relaxed);
        }
        
        *last_error = Some(now);
    }
    
    async fn open(&self) {
        self.state.store(CircuitState::Open as u8, Ordering::Relaxed);
        *self.last_state_change.lock().await = Instant::now();
        self.update_metrics();
    }
    
    async fn close(&self) {
        self.state.store(CircuitState::Closed as u8, Ordering::Relaxed);
        self.error_count.store(0, Ordering::Relaxed);
        *self.last_state_change.lock().await = Instant::now();
        self.update_metrics();
    }
    
    fn update_metrics(&self) {
        let state = CircuitState::from(self.state.load(Ordering::Relaxed));
        
        // Update all states to 0 first
        metrics::set_clickhouse_circuit_state("closed", 0);
        metrics::set_clickhouse_circuit_state("open", 0);
        metrics::set_clickhouse_circuit_state("half_open", 0);
        
        // Set current state to 1
        match state {
            CircuitState::Closed => metrics::set_clickhouse_circuit_state("closed", 1),
            CircuitState::Open => metrics::set_clickhouse_circuit_state("open", 1),
            CircuitState::HalfOpen => metrics::set_clickhouse_circuit_state("half_open", 1),
        }
    }
    
    pub fn is_healthy(&self) -> bool {
        self.state.load(Ordering::Relaxed) == CircuitState::Closed as u8
    }
}

// Global circuit breaker instance
lazy_static::lazy_static! {
    pub static ref CIRCUIT_BREAKER: CircuitBreaker = CircuitBreaker::new();
}

// Wrap ClickHouse error responses
pub fn wrap_ch_error(e: clickhouse::error::Error, _upstream: &str) -> PipelineError {
    let msg = e.to_string();
    
    // Check if it's a timeout error by examining the message
    if msg.contains("timeout") || msg.contains("Timeout") {
        PipelineError::TimeoutError(format!("ClickHouse query timeout"))
    } else {
        // Trim long errors
        let trimmed = if msg.len() > 200 {
            format!("{}...", &msg[..200])
        } else {
            msg
        };
        PipelineError::database(format!("ClickHouse error: {}", trimmed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_circuit_breaker_opens_after_errors() {
        let cb = CircuitBreaker::new();
        
        // Simulate errors
        for _ in 0..cb.errors_to_open {
            cb.record_error().await;
        }
        
        assert_eq!(cb.get_state().await, CircuitState::Open);
    }
    
    #[tokio::test]
    async fn test_circuit_breaker_transitions_to_half_open() {
        let mut cb = CircuitBreaker::new();
        cb.cooldown_ms = 10; // Short cooldown for testing
        
        cb.open().await;
        assert_eq!(cb.get_state().await, CircuitState::Open);
        
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert_eq!(cb.get_state().await, CircuitState::HalfOpen);
    }
}
