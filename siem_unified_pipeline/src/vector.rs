//! Vector integration module for health checks and metrics collection
//! Provides functionality to monitor Vector status and scrape Prometheus metrics

use crate::{config::VectorConfig, error::PipelineError};
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;
use tracing::{debug, warn, error};

/// Vector health response structure
#[derive(Debug, Deserialize)]
pub struct VectorHealth {
    pub status: String,
}

/// Vector client for health checks and metrics scraping
pub struct VectorClient {
    cfg: VectorConfig,
    http: Client,
}

impl VectorClient {
    /// Create a new Vector client with the given configuration
    pub fn new(cfg: VectorConfig) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_millis(cfg.timeout_ms))
            .build()
            .expect("Failed to create HTTP client for Vector");
        
        Self { cfg, http }
    }

    /// Check Vector health status
    /// Returns true if Vector is healthy (status == "ok")
    /// Returns false if Vector is disabled
    pub async fn health(&self) -> Result<bool, PipelineError> {
        if !self.cfg.enabled {
            debug!("Vector is disabled, skipping health check");
            return Ok(false);
        }
        
        let base_url = match &self.cfg.base_url {
            Some(url) => url,
            None => {
                warn!("Vector is enabled but no base_url configured");
                return Ok(false);
            }
        };
        
        let url = format!("{}{}", base_url, self.cfg.health_path);
        
        debug!("Checking Vector health at: {}", url);
        
        match self.http.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<VectorHealth>().await {
                        Ok(health) => {
                            let is_healthy = health.status == "ok";
                            debug!("Vector health check result: {}", health.status);
                            Ok(is_healthy)
                        }
                        Err(e) => {
                            warn!("Failed to parse Vector health response: {}", e);
                            Ok(false)
                        }
                    }
                } else {
                    warn!("Vector health check returned status: {}", response.status());
                    Ok(false)
                }
            }
            Err(e) => {
                error!("Failed to connect to Vector health endpoint: {}", e);
                Err(PipelineError::NetworkError(format!("Vector health check failed: {}", e)))
            }
        }
    }

    /// Scrape Prometheus metrics from Vector
    /// Returns the raw Prometheus metrics text
    pub async fn scrape_prom(&self) -> Result<String, PipelineError> {
        if !self.cfg.enabled {
            debug!("Vector is disabled, skipping metrics scraping");
            return Err(PipelineError::NetworkError("Vector is disabled".to_string()));
        }
        
        let base_url = match &self.cfg.base_url {
            Some(url) => url,
            None => {
                return Err(PipelineError::NetworkError("Vector is enabled but no base_url configured".to_string()));
            }
        };
        
        let url = format!("{}{}", base_url, self.cfg.metrics_path);
        
        debug!("Scraping Vector metrics from: {}", url);
        
        match self.http.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.text().await {
                        Ok(metrics_text) => {
                            debug!("Successfully scraped Vector metrics ({} bytes)", metrics_text.len());
                            Ok(metrics_text)
                        }
                        Err(e) => {
                            error!("Failed to read Vector metrics response: {}", e);
                            Err(PipelineError::NetworkError(format!("Failed to read Vector metrics: {}", e)))
                        }
                    }
                } else {
                    warn!("Vector metrics endpoint returned status: {}", response.status());
                    Err(PipelineError::NetworkError(format!("Vector metrics endpoint returned status: {}", response.status())))
                }
            }
            Err(e) => {
                error!("Failed to connect to Vector metrics endpoint: {}", e);
                Err(PipelineError::NetworkError(format!("Vector metrics scrape failed: {}", e)))
            }
        }
    }
}

/// Parse a Prometheus metric value from text
/// Searches for the first occurrence of the metric name and returns its value
pub fn parse_prom_number(metrics_text: &str, metric_name: &str) -> Option<f64> {
    for line in metrics_text.lines() {
        // Skip comments and empty lines
        if line.starts_with('#') || line.trim().is_empty() {
            continue;
        }
        
        // Look for the metric name at the start of the line
        if line.starts_with(metric_name) {
            // Find the space that separates metric name from value
            if let Some(space_pos) = line.find(' ') {
                let value_str = &line[space_pos + 1..].trim();
                if let Ok(value) = value_str.parse::<f64>() {
                    debug!("Parsed metric {}: {}", metric_name, value);
                    return Some(value);
                }
            }
        }
    }
    
    debug!("Metric {} not found in Prometheus text", metric_name);
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_prom_number() {
        let metrics_text = r#"
# HELP vector_events_processed_total Total number of events processed
# TYPE vector_events_processed_total counter
vector_events_processed_total 12345.0
vector_events_in_total 67890
"#;
        
        assert_eq!(parse_prom_number(metrics_text, "vector_events_processed_total"), Some(12345.0));
        assert_eq!(parse_prom_number(metrics_text, "vector_events_in_total"), Some(67890.0));
        assert_eq!(parse_prom_number(metrics_text, "nonexistent_metric"), None);
    }

    #[test]
    fn test_parse_prom_number_with_labels() {
        let metrics_text = r#"
vector_events_processed_total{component="source"} 123.0
"#;
        
        assert_eq!(parse_prom_number(metrics_text, "vector_events_processed_total"), Some(123.0));
    }
}