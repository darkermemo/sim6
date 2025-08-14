use crate::v2::types::health::RedisMetrics;
use redis::{Client, Connection, Commands, RedisResult};
use std::collections::HashMap;

pub struct RedisCollector {
    client: Option<Client>,
}

impl RedisCollector {
    pub fn new() -> Self {
        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
        let client = Client::open(redis_url).ok();
        
        Self { client }
    }

    pub async fn collect_metrics(&self) -> Result<RedisMetrics, Box<dyn std::error::Error + Send + Sync>> {
        if let Some(client) = &self.client {
            match self.get_redis_info(client).await {
                Ok(metrics) => Ok(metrics),
                Err(_) => Ok(self.default_metrics(false)),
            }
        } else {
            Ok(self.default_metrics(false))
        }
    }

    async fn get_redis_info(&self, client: &Client) -> Result<RedisMetrics, Box<dyn std::error::Error + Send + Sync>> {
        // Redis operations are blocking, so we run them in a blocking task
        let client_clone = client.clone();
        
        let metrics = tokio::task::spawn_blocking(move || -> Result<RedisMetrics, Box<dyn std::error::Error + Send + Sync>> {
            let mut conn = client_clone.get_connection()?;
            
            // Get comprehensive Redis info
            let server_info: String = redis::cmd("INFO").arg("server").query(&mut conn)?;
            let clients_info: String = redis::cmd("INFO").arg("clients").query(&mut conn)?;
            let memory_info: String = redis::cmd("INFO").arg("memory").query(&mut conn)?;
            let stats_info: String = redis::cmd("INFO").arg("stats").query(&mut conn)?;
            let keyspace_info: String = redis::cmd("INFO").arg("keyspace").query(&mut conn)?;

            let parsed_info = Self::parse_redis_info(&[
                server_info,
                clients_info,
                memory_info,
                stats_info,
                keyspace_info,
            ].join("\n"));

            let role = parsed_info.get("role").unwrap_or(&"unknown".to_string()).clone();
            let connected_clients = parsed_info.get("connected_clients")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            
            let ops_per_sec = parsed_info.get("instantaneous_ops_per_sec")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);

            let used_memory = parsed_info.get("used_memory")
                .and_then(|s| s.parse::<u64>().ok())
                .map(|bytes| (bytes / 1024 / 1024) as u32)
                .unwrap_or(0);

            let maxmemory = parsed_info.get("maxmemory")
                .and_then(|s| s.parse::<u64>().ok())
                .map(|bytes| (bytes / 1024 / 1024) as u32)
                .unwrap_or(0);

            // Calculate hit ratio
            let keyspace_hits: u64 = parsed_info.get("keyspace_hits")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            let keyspace_misses: u64 = parsed_info.get("keyspace_misses")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            
            let hit_ratio_pct = if keyspace_hits + keyspace_misses > 0 {
                (keyspace_hits as f64 / (keyspace_hits + keyspace_misses) as f64) * 100.0
            } else {
                100.0
            };

            let evictions_per_min = parsed_info.get("evicted_keys")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);

            Ok(RedisMetrics {
                ok: true,
                role,
                connected_clients,
                ops_per_sec,
                used_memory_mb: used_memory,
                maxmemory_mb: maxmemory,
                hit_ratio_pct,
                evictions_per_min,
            })
        }).await??;

        Ok(metrics)
    }

    fn parse_redis_info(info: &str) -> HashMap<String, String> {
        let mut result = HashMap::new();
        
        for line in info.lines() {
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }
            
            if let Some((key, value)) = line.split_once(':') {
                result.insert(key.trim().to_string(), value.trim().to_string());
            }
        }
        
        result
    }

    fn default_metrics(&self, ok: bool) -> RedisMetrics {
        RedisMetrics {
            ok,
            role: if ok { "master".to_string() } else { "unknown".to_string() },
            connected_clients: 0,
            ops_per_sec: 0,
            used_memory_mb: 0,
            maxmemory_mb: 0,
            hit_ratio_pct: 0.0,
            evictions_per_min: 0,
        }
    }
}
