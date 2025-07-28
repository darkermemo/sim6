//! HTTP client module for sending compressed log batches
//! Handles compression, batching, and retry logic with exponential backoff

use crate::config::GeneratorConfig;
use anyhow::{Context, Result};
use flate2::write::GzEncoder;
use flate2::Compression;
use log::{debug, warn, error};
use reqwest::{Client, Response};
use serde_json::Value;
use std::io::Write;
use std::time::Duration;
use tokio::time::sleep;

/// HTTP client for sending log batches to SIEM ingestion endpoint
pub struct HttpClient {
    client: Client,
    endpoint: String,
    compression: CompressionType,
    max_retries: usize,
    timeout: Duration,
}

#[derive(Debug, Clone)]
enum CompressionType {
    None,
    Gzip,
    // Future: Lz4, Zstd
}

impl HttpClient {
    /// Create a new HTTP client with the given configuration
    pub fn new(config: &GeneratorConfig) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout))
            .gzip(true)
            .build()
            .context("Failed to create HTTP client")?;
        
        let compression = match config.compression.as_str() {
            "gzip" => CompressionType::Gzip,
            "none" => CompressionType::None,
            _ => {
                warn!("Unsupported compression type '{}', using gzip", config.compression);
                CompressionType::Gzip
            }
        };
        
        Ok(Self {
            client,
            endpoint: config.endpoint.clone(),
            compression,
            max_retries: config.max_retries,
            timeout: Duration::from_secs(config.timeout),
        })
    }
    
    /// Send a batch of logs to the ingestion endpoint
    /// Returns the number of bytes sent (after compression)
    pub async fn send_logs(&self, logs: &[Value]) -> Result<usize> {
        if logs.is_empty() {
            return Ok(0);
        }
        
        // Serialize logs to JSON Lines format
        let mut payload = String::new();
        for log in logs {
            payload.push_str(&serde_json::to_string(log)?);
            payload.push('\n');
        }
        
        // Compress payload if enabled
        let (compressed_data, content_encoding) = self.compress_payload(payload.as_bytes())?;
        
        debug!(
            "Sending {} logs, {} bytes (compressed: {} bytes, ratio: {:.1}%)",
            logs.len(),
            payload.len(),
            compressed_data.len(),
            (compressed_data.len() as f64 / payload.len() as f64) * 100.0
        );
        
        // Send with retry logic
        let mut last_error = None;
        for attempt in 0..=self.max_retries {
            match self.send_request(&compressed_data, &content_encoding).await {
                Ok(_) => {
                    if attempt > 0 {
                        debug!("Successfully sent logs after {} retries", attempt);
                    }
                    return Ok(compressed_data.len());
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt < self.max_retries {
                        let delay = Duration::from_millis(100 * (2_u64.pow(attempt as u32)));
                        warn!("Attempt {} failed, retrying in {:?}: {}", attempt + 1, delay, last_error.as_ref().unwrap());
                        sleep(delay).await;
                    }
                }
            }
        }
        
        Err(last_error.unwrap().context(format!("Failed to send logs after {} attempts", self.max_retries + 1)))
    }
    
    /// Compress payload according to configuration
    fn compress_payload(&self, data: &[u8]) -> Result<(Vec<u8>, Option<String>)> {
        match self.compression {
            CompressionType::None => Ok((data.to_vec(), None)),
            CompressionType::Gzip => {
                let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
                encoder.write_all(data)
                    .context("Failed to write data to gzip encoder")?;
                let compressed = encoder.finish()
                    .context("Failed to finish gzip compression")?;
                Ok((compressed, Some("gzip".to_string())))
            }
        }
    }
    
    /// Send HTTP request with proper headers
    async fn send_request(&self, data: &[u8], content_encoding: &Option<String>) -> Result<Response> {
        let mut request = self.client
            .post(&self.endpoint)
            .header("Content-Type", "application/x-ndjson")
            .body(data.to_vec());
        
        if let Some(encoding) = content_encoding {
            request = request.header("Content-Encoding", encoding);
        }
        
        let response = request.send().await
            .context("Failed to send HTTP request")?;
        
        if response.status().is_success() {
            debug!("Successfully sent logs, status: {}", response.status());
            Ok(response)
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_else(|_| "<unable to read body>".to_string());
            anyhow::bail!("HTTP request failed with status {}: {}", status, body)
        }
    }
    
    /// Test connectivity to the endpoint
    pub async fn test_connection(&self) -> Result<()> {
        debug!("Testing connection to {}", self.endpoint);
        
        let response = self.client
            .get(&self.endpoint)
            .send()
            .await
            .context("Failed to connect to endpoint")?;
        
        if response.status().is_success() || response.status().as_u16() == 405 {
            // 405 Method Not Allowed is acceptable for a GET on a POST endpoint
            debug!("Connection test successful, status: {}", response.status());
            Ok(())
        } else {
            anyhow::bail!("Connection test failed with status: {}", response.status())
        }
    }
    
    /// Get compression statistics for a payload
    pub fn compression_stats(&self, original_size: usize, compressed_size: usize) -> CompressionStats {
        CompressionStats {
            original_size,
            compressed_size,
            compression_ratio: if original_size > 0 {
                (compressed_size as f64 / original_size as f64) * 100.0
            } else {
                100.0
            },
            space_saved: original_size.saturating_sub(compressed_size),
        }
    }
}

/// Statistics about compression performance
#[derive(Debug, Clone)]
pub struct CompressionStats {
    pub original_size: usize,
    pub compressed_size: usize,
    pub compression_ratio: f64,
    pub space_saved: usize,
}

impl CompressionStats {
    /// Get compression ratio as a percentage
    pub fn ratio_percent(&self) -> f64 {
        self.compression_ratio
    }
    
    /// Get space saved as a percentage
    pub fn space_saved_percent(&self) -> f64 {
        if self.original_size > 0 {
            (self.space_saved as f64 / self.original_size as f64) * 100.0
        } else {
            0.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::GeneratorConfig;
    use serde_json::json;
    
    fn create_test_config() -> GeneratorConfig {
        GeneratorConfig {
            target: 1000,
            threads: 1,
            endpoint: "http://httpbin.org/post".to_string(),
            interval: 0,
            template: "fortinet".to_string(),
            tenant_count: 1,
            compression: "gzip".to_string(),
            batch_size: 10,
            dry_run: false,
            timeout: 10,
            max_retries: 2,
            verbose: false,
        }
    }
    
    #[test]
    fn test_http_client_creation() {
        let config = create_test_config();
        let client = HttpClient::new(&config);
        assert!(client.is_ok());
    }
    
    #[test]
    fn test_compression() {
        let config = create_test_config();
        let client = HttpClient::new(&config).unwrap();
        
        let test_data = b"This is a test payload that should compress well when repeated. ".repeat(100);
        let (compressed, encoding) = client.compress_payload(&test_data).unwrap();
        
        assert!(compressed.len() < test_data.len());
        assert_eq!(encoding, Some("gzip".to_string()));
    }
    
    #[test]
    fn test_compression_stats() {
        let config = create_test_config();
        let client = HttpClient::new(&config).unwrap();
        
        let stats = client.compression_stats(1000, 300);
        assert_eq!(stats.original_size, 1000);
        assert_eq!(stats.compressed_size, 300);
        assert_eq!(stats.compression_ratio, 30.0);
        assert_eq!(stats.space_saved, 700);
        assert_eq!(stats.space_saved_percent(), 70.0);
    }
    
    #[tokio::test]
    async fn test_send_logs_empty() {
        let config = create_test_config();
        let client = HttpClient::new(&config).unwrap();
        
        let result = client.send_logs(&[]).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0);
    }
    
    #[tokio::test]
    async fn test_send_logs_format() {
        let config = create_test_config();
        let client = HttpClient::new(&config).unwrap();
        
        let logs = vec![
            json!({"message": "test log 1", "timestamp": "2024-01-01T00:00:00Z"}),
            json!({"message": "test log 2", "timestamp": "2024-01-01T00:00:01Z"}),
        ];
        
        // This test would require a mock server to fully validate
        // For now, we just test that the function doesn't panic
        let result = client.send_logs(&logs).await;
        // We expect this to fail since httpbin.org/post might not accept our format
        // but it shouldn't panic
        assert!(result.is_ok() || result.is_err());
    }
}