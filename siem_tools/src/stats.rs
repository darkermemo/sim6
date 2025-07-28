//! Statistics and performance tracking module
//! Provides real-time metrics for log generation and HTTP throughput

use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use log::info;

/// Thread-safe statistics collector for the log generator
#[derive(Debug)]
pub struct Stats {
    /// Total logs generated
    logs_generated: AtomicU64,
    /// Total bytes sent via HTTP
    bytes_sent: AtomicU64,
    /// Total HTTP errors
    errors: AtomicUsize,
    /// Start time for rate calculations
    start_time: Instant,
    /// Last stats print time
    last_print: std::sync::Mutex<Instant>,
    /// Logs at last print
    last_logs: AtomicU64,
    /// Bytes at last print
    last_bytes: AtomicU64,
}

impl Stats {
    /// Create a new statistics collector
    pub fn new() -> Self {
        let now = Instant::now();
        Self {
            logs_generated: AtomicU64::new(0),
            bytes_sent: AtomicU64::new(0),
            errors: AtomicUsize::new(0),
            start_time: now,
            last_print: std::sync::Mutex::new(now),
            last_logs: AtomicU64::new(0),
            last_bytes: AtomicU64::new(0),
        }
    }
    
    /// Increment log count
    pub fn count_logs(&self, count: usize) {
        self.logs_generated.fetch_add(count as u64, Ordering::Relaxed);
    }
    
    /// Increment byte count
    pub fn count_bytes(&self, bytes: usize) {
        self.bytes_sent.fetch_add(bytes as u64, Ordering::Relaxed);
    }
    
    /// Increment error count
    pub fn count_error(&self) {
        self.errors.fetch_add(1, Ordering::Relaxed);
    }
    
    /// Get current log count
    pub fn logs(&self) -> u64 {
        self.logs_generated.load(Ordering::Relaxed)
    }
    
    /// Get current byte count
    pub fn bytes(&self) -> u64 {
        self.bytes_sent.load(Ordering::Relaxed)
    }
    
    /// Get current error count
    pub fn errors(&self) -> usize {
        self.errors.load(Ordering::Relaxed)
    }
    
    /// Calculate logs per second since start
    pub fn logs_per_second(&self) -> f64 {
        let elapsed = self.start_time.elapsed().as_secs_f64();
        if elapsed > 0.0 {
            self.logs() as f64 / elapsed
        } else {
            0.0
        }
    }
    
    /// Calculate bytes per second since start
    pub fn bytes_per_second(&self) -> f64 {
        let elapsed = self.start_time.elapsed().as_secs_f64();
        if elapsed > 0.0 {
            self.bytes() as f64 / elapsed
        } else {
            0.0
        }
    }
    
    /// Calculate current rate (since last print)
    pub fn current_logs_per_second(&self) -> f64 {
        let last_print = self.last_print.lock().unwrap();
        let now = Instant::now();
        let elapsed = now.duration_since(*last_print).as_secs_f64();
        
        if elapsed > 0.0 {
            let current_logs = self.logs();
            let last_logs = self.last_logs.load(Ordering::Relaxed);
            let logs_diff = current_logs.saturating_sub(last_logs);
            logs_diff as f64 / elapsed
        } else {
            0.0
        }
    }
    
    /// Calculate current byte rate (since last print)
    pub fn current_bytes_per_second(&self) -> f64 {
        let last_print = self.last_print.lock().unwrap();
        let now = Instant::now();
        let elapsed = now.duration_since(*last_print).as_secs_f64();
        
        if elapsed > 0.0 {
            let current_bytes = self.bytes();
            let last_bytes = self.last_bytes.load(Ordering::Relaxed);
            let bytes_diff = current_bytes.saturating_sub(last_bytes);
            bytes_diff as f64 / elapsed
        } else {
            0.0
        }
    }
    
    /// Print current statistics
    pub fn print_current(&self) {
        let current_logs_rate = self.current_logs_per_second();
        let current_bytes_rate = self.current_bytes_per_second();
        let total_logs_rate = self.logs_per_second();
        let total_bytes_rate = self.bytes_per_second();
        
        // Update last print tracking
        {
            let mut last_print = self.last_print.lock().unwrap();
            *last_print = Instant::now();
        }
        self.last_logs.store(self.logs(), Ordering::Relaxed);
        self.last_bytes.store(self.bytes(), Ordering::Relaxed);
        
        info!(
            "📊 Stats: {} logs ({:.1}/s current, {:.1}/s avg) | {:.2} MB ({:.1} KB/s current, {:.1} KB/s avg) | {} errors",
            self.logs(),
            current_logs_rate,
            total_logs_rate,
            self.bytes() as f64 / 1_048_576.0, // MB
            current_bytes_rate / 1024.0, // KB/s
            total_bytes_rate / 1024.0, // KB/s
            self.errors()
        );
    }
    
    /// Print final statistics summary
    pub fn print_final(&self) {
        let elapsed = self.start_time.elapsed();
        let total_logs = self.logs();
        let total_bytes = self.bytes();
        let total_errors = self.errors();
        
        let logs_per_sec = self.logs_per_second();
        let bytes_per_sec = self.bytes_per_second();
        let mb_total = total_bytes as f64 / 1_048_576.0;
        let kb_per_sec = bytes_per_sec / 1024.0;
        
        info!("\n🎯 FINAL STATISTICS:");
        info!("   Duration: {:.2}s", elapsed.as_secs_f64());
        info!("   Total Logs: {} ({:.1}/s)", total_logs, logs_per_sec);
        info!("   Total Data: {:.2} MB ({:.1} KB/s)", mb_total, kb_per_sec);
        info!("   Errors: {}", total_errors);
        
        if total_logs > 0 {
            let error_rate = (total_errors as f64 / total_logs as f64) * 100.0;
            info!("   Error Rate: {:.2}%", error_rate);
        }
        
        if total_bytes > 0 && total_logs > 0 {
            let avg_log_size = total_bytes as f64 / total_logs as f64;
            info!("   Avg Log Size: {:.1} bytes", avg_log_size);
        }
    }
    
    /// Get performance summary as a struct
    pub fn summary(&self) -> StatsSummary {
        StatsSummary {
            total_logs: self.logs(),
            total_bytes: self.bytes(),
            total_errors: self.errors(),
            duration: self.start_time.elapsed(),
            logs_per_second: self.logs_per_second(),
            bytes_per_second: self.bytes_per_second(),
        }
    }
}

impl Default for Stats {
    fn default() -> Self {
        Self::new()
    }
}

/// Summary of performance statistics
#[derive(Debug, Clone)]
pub struct StatsSummary {
    pub total_logs: u64,
    pub total_bytes: u64,
    pub total_errors: usize,
    pub duration: Duration,
    pub logs_per_second: f64,
    pub bytes_per_second: f64,
}

impl StatsSummary {
    /// Calculate error rate as percentage
    pub fn error_rate(&self) -> f64 {
        if self.total_logs > 0 {
            (self.total_errors as f64 / self.total_logs as f64) * 100.0
        } else {
            0.0
        }
    }
    
    /// Calculate average log size in bytes
    pub fn avg_log_size(&self) -> f64 {
        if self.total_logs > 0 {
            self.total_bytes as f64 / self.total_logs as f64
        } else {
            0.0
        }
    }
    
    /// Get total data in megabytes
    pub fn total_mb(&self) -> f64 {
        self.total_bytes as f64 / 1_048_576.0
    }
    
    /// Get throughput in KB/s
    pub fn kb_per_second(&self) -> f64 {
        self.bytes_per_second / 1024.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;
    
    #[test]
    fn test_stats_basic() {
        let stats = Stats::new();
        
        assert_eq!(stats.logs(), 0);
        assert_eq!(stats.bytes(), 0);
        assert_eq!(stats.errors(), 0);
        
        stats.count_logs(100);
        stats.count_bytes(1024);
        stats.count_error();
        
        assert_eq!(stats.logs(), 100);
        assert_eq!(stats.bytes(), 1024);
        assert_eq!(stats.errors(), 1);
    }
    
    #[test]
    fn test_stats_rates() {
        let stats = Stats::new();
        
        // Wait a bit to ensure non-zero elapsed time
        thread::sleep(Duration::from_millis(10));
        
        stats.count_logs(1000);
        stats.count_bytes(10240);
        
        let logs_rate = stats.logs_per_second();
        let bytes_rate = stats.bytes_per_second();
        
        assert!(logs_rate > 0.0);
        assert!(bytes_rate > 0.0);
    }
    
    #[test]
    fn test_stats_summary() {
        let stats = Stats::new();
        stats.count_logs(500);
        stats.count_bytes(5120);
        stats.count_error();
        
        let summary = stats.summary();
        
        assert_eq!(summary.total_logs, 500);
        assert_eq!(summary.total_bytes, 5120);
        assert_eq!(summary.total_errors, 1);
        assert_eq!(summary.error_rate(), 0.2); // 1/500 * 100
        assert_eq!(summary.avg_log_size(), 10.24); // 5120/500
    }
}