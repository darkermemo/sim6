use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use log::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogSource {
    pub source_ip: String,
    pub source_port: u16,
    pub last_seen: u64,
    pub event_count: u64,
    pub bytes_received: u64,
    pub connection_time: u64,
    pub status: String,  // "active", "idle", "disconnected"
    pub avg_eps: f64,    // events per second
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectionStats {
    pub total_sources: usize,
    pub active_sources: usize,
    pub idle_sources: usize,
    pub total_events: u64,
    pub total_bytes: u64,
    pub avg_eps_overall: f64,
}

pub struct ConnectionManager {
    sources: Arc<RwLock<HashMap<String, LogSource>>>,
    start_time: u64,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            sources: Arc::new(RwLock::new(HashMap::new())),
            start_time: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }

    pub fn register_event(&self, source_ip: &str, bytes_count: usize) {
        let mut sources = self.sources.write().unwrap();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let source_key = source_ip.to_string();
        
        match sources.get_mut(&source_key) {
            Some(source) => {
                // Update existing source
                source.last_seen = now;
                source.event_count += 1;
                source.bytes_received += bytes_count as u64;
                source.status = "active".to_string();
                
                // Calculate EPS (events per second)
                let time_active = (now - source.connection_time).max(1);
                source.avg_eps = source.event_count as f64 / time_active as f64;
            }
            None => {
                // Register new source
                info!("New log source connected: {}", source_ip);
                sources.insert(source_key, LogSource {
                    source_ip: source_ip.to_string(),
                    source_port: 0, // Will be updated when we get TCP connection info
                    last_seen: now,
                    event_count: 1,
                    bytes_received: bytes_count as u64,
                    connection_time: now,
                    status: "active".to_string(),
                    avg_eps: 1.0,
                });
            }
        }
    }

    #[allow(dead_code)]
    pub fn update_source_status(&self, source_ip: &str, status: &str) {
        let mut sources = self.sources.write().unwrap();
        if let Some(source) = sources.get_mut(source_ip) {
            source.status = status.to_string();
            if status == "disconnected" {
                info!("Log source disconnected: {}", source_ip);
            }
        }
    }

    #[allow(dead_code)]
    pub fn cleanup_idle_sources(&self, idle_timeout_seconds: u64) {
        let mut sources = self.sources.write().unwrap();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let mut to_remove = Vec::new();
        for (key, source) in sources.iter_mut() {
            let idle_time = now - source.last_seen;
            
            if idle_time > idle_timeout_seconds {
                if source.status == "active" {
                    source.status = "idle".to_string();
                    warn!("Log source {} marked as idle ({}s)", source.source_ip, idle_time);
                }
                
                // Remove sources idle for too long
                if idle_time > idle_timeout_seconds * 2 {
                    to_remove.push(key.clone());
                }
            }
        }

        for key in to_remove {
            if let Some(source) = sources.remove(&key) {
                info!("Removed idle log source: {} (last seen {}s ago)", 
                      source.source_ip, now - source.last_seen);
            }
        }
    }

    pub fn get_stats(&self) -> ConnectionStats {
        let sources = self.sources.read().unwrap();
        let active_count = sources.values().filter(|s| s.status == "active").count();
        let idle_count = sources.values().filter(|s| s.status == "idle").count();
        let total_events: u64 = sources.values().map(|s| s.event_count).sum();
        let total_bytes: u64 = sources.values().map(|s| s.bytes_received).sum();
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let uptime = (now - self.start_time).max(1);
        let overall_eps = total_events as f64 / uptime as f64;

        ConnectionStats {
            total_sources: sources.len(),
            active_sources: active_count,
            idle_sources: idle_count,
            total_events,
            total_bytes,
            avg_eps_overall: overall_eps,
        }
    }

    pub fn get_sources(&self) -> Vec<LogSource> {
        let sources = self.sources.read().unwrap();
        sources.values().cloned().collect()
    }

    #[allow(dead_code)]
    pub fn block_source(&self, source_ip: &str) -> bool {
        let mut sources = self.sources.write().unwrap();
        if let Some(source) = sources.get_mut(source_ip) {
            source.status = "blocked".to_string();
            warn!("Blocked log source: {}", source_ip);
            true
        } else {
            false
        }
    }

    #[allow(dead_code)]
    pub fn unblock_source(&self, source_ip: &str) -> bool {
        let mut sources = self.sources.write().unwrap();
        if let Some(source) = sources.get_mut(source_ip) {
            source.status = "active".to_string();
            info!("Unblocked log source: {}", source_ip);
            true
        } else {
            false
        }
    }
}