use crate::v2::types::health::ClickHouseMetrics;
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::collections::HashMap;

pub struct ClickHouseCollector {
    client: reqwest::Client,
}

impl ClickHouseCollector {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    pub async fn collect_metrics(&self) -> Result<ClickHouseMetrics, Box<dyn std::error::Error + Send + Sync>> {
        let base_url = std::env::var("CLICKHOUSE_URL").unwrap_or_else(|_| "http://127.0.0.1:8123".to_string());
        
        // Try to ping ClickHouse first
        let ping_result = self.ping_clickhouse(&base_url).await;
        let ok = ping_result.is_ok();

        if !ok {
            return Ok(self.default_metrics(false));
        }

        // Collect various metrics in parallel
        let (version, metrics, last_event, ingest_delay, parts_info) = tokio::try_join!(
            self.get_version(&base_url),
            self.get_system_metrics(&base_url),
            self.get_last_event_time(&base_url),
            self.calculate_ingest_delay(&base_url),
            self.get_parts_info(&base_url)
        )?;

        Ok(ClickHouseMetrics {
            ok: true,
            version,
            inserts_per_sec: metrics.get("inserts_per_sec").unwrap_or(&0).clone(),
            queries_per_sec: metrics.get("queries_per_sec").unwrap_or(&0).clone(),
            last_event_ts: last_event,
            ingest_delay_ms: ingest_delay,
            parts: parts_info.0,
            merges_in_progress: parts_info.1,
            replication_lag_s: 0, // TODO: Implement if using replication
        })
    }

    async fn ping_clickhouse(&self, base_url: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let response = self.client
            .get(&format!("{}/ping", base_url))
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(format!("ClickHouse ping failed with status: {}", response.status()).into())
        }
    }

    async fn get_version(&self, base_url: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let query = "SELECT version()";
        let response = self.execute_query(base_url, query).await?;
        
        let version = response
            .get("data")
            .and_then(|data| data.as_array())
            .and_then(|arr| arr.first())
            .and_then(|row| row.as_array())
            .and_then(|cols| cols.first())
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        Ok(version)
    }

    async fn get_system_metrics(&self, base_url: &str) -> Result<HashMap<String, u32>, Box<dyn std::error::Error + Send + Sync>> {
        let query = r#"
            SELECT 
                metric,
                toUInt32(value) AS v
            FROM system.metrics 
            WHERE metric IN ('InsertedRows', 'Query', 'BackgroundMergesAndMutationsPoolTask')
            UNION ALL
            SELECT 
                'InsertQuery' as metric,
                toUInt32(ProfileEvent_InsertQuery) as v
            FROM system.metrics 
            WHERE metric = 'ProfileEvent_InsertQuery'
        "#;

        let response = self.execute_query(base_url, query).await?;
        let mut metrics = HashMap::new();

        if let Some(data) = response.get("data").and_then(|d| d.as_array()) {
            for row in data {
                if let Some(row_array) = row.as_array() {
                    if let (Some(metric), Some(value)) = (
                        row_array.get(0).and_then(|v| v.as_str()),
                        row_array.get(1).and_then(|v| v.as_u64())
                    ) {
                        match metric {
                            "InsertedRows" | "InsertQuery" => {
                                metrics.insert("inserts_per_sec".to_string(), value as u32);
                            },
                            "Query" => {
                                metrics.insert("queries_per_sec".to_string(), value as u32);
                            },
                            _ => {}
                        }
                    }
                }
            }
        }

        Ok(metrics)
    }

    async fn get_last_event_time(&self, base_url: &str) -> Result<Option<DateTime<Utc>>, Box<dyn std::error::Error + Send + Sync>> {
        let query = r#"
            SELECT max(timestamp) as last_ts 
            FROM events 
            WHERE tenant_id = 'default' 
            AND timestamp > now() - INTERVAL 1 DAY
            FORMAT JSON
        "#;

        let response = self.execute_query(base_url, query).await?;
        
        if let Some(data) = response.get("data").and_then(|d| d.as_array()) {
            if let Some(row) = data.first().and_then(|r| r.as_array()) {
                if let Some(ts_str) = row.first().and_then(|v| v.as_str()) {
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                        return Ok(Some(dt.with_timezone(&Utc)));
                    }
                }
            }
        }

        Ok(None)
    }

    async fn calculate_ingest_delay(&self, base_url: &str) -> Result<u32, Box<dyn std::error::Error + Send + Sync>> {
        let query = r#"
            SELECT 
                toUInt32((now() - max(timestamp)) * 1000) as delay_ms
            FROM events 
            WHERE tenant_id = 'default' 
            AND timestamp > now() - INTERVAL 1 HOUR
            FORMAT JSON
        "#;

        let response = self.execute_query(base_url, query).await?;
        
        if let Some(data) = response.get("data").and_then(|d| d.as_array()) {
            if let Some(row) = data.first().and_then(|r| r.as_array()) {
                if let Some(delay) = row.first().and_then(|v| v.as_u64()) {
                    return Ok(delay as u32);
                }
            }
        }

        Ok(0)
    }

    async fn get_parts_info(&self, base_url: &str) -> Result<(u32, u32), Box<dyn std::error::Error + Send + Sync>> {
        let query = r#"
            SELECT 
                count() as total_parts,
                countIf(is_mutation) as merges_running
            FROM system.parts 
            WHERE database = 'default' AND table = 'events' AND active = 1
            FORMAT JSON
        "#;

        let response = self.execute_query(base_url, query).await?;
        
        if let Some(data) = response.get("data").and_then(|d| d.as_array()) {
            if let Some(row) = data.first().and_then(|r| r.as_array()) {
                if let (Some(parts), Some(merges)) = (
                    row.get(0).and_then(|v| v.as_u64()),
                    row.get(1).and_then(|v| v.as_u64())
                ) {
                    return Ok((parts as u32, merges as u32));
                }
            }
        }

        Ok((0, 0))
    }

    async fn execute_query(&self, base_url: &str, query: &str) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        let response = self.client
            .post(&format!("{}/", base_url))
            .header("Content-Type", "text/plain")
            .body(format!("{} FORMAT JSON", query))
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("ClickHouse query failed: {}", response.status()).into());
        }

        let json: Value = response.json().await?;
        Ok(json)
    }

    fn default_metrics(&self, ok: bool) -> ClickHouseMetrics {
        ClickHouseMetrics {
            ok,
            version: "unknown".to_string(),
            inserts_per_sec: 0,
            queries_per_sec: 0,
            last_event_ts: None,
            ingest_delay_ms: if ok { 0 } else { 999999 },
            parts: 0,
            merges_in_progress: 0,
            replication_lag_s: 0,
        }
    }
}
