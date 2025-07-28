//! Configuration module for the massive log generator
//! Handles CLI argument parsing and validation

use clap::Parser;
use std::fmt;

#[derive(Parser, Clone, Debug)]
#[command(name = "massive_log_gen", about = "High-performance SIEM log generator")]
#[command(version = "1.0", author = "SIEM Team")]
pub struct GeneratorConfig {
    /// Target number of logs to generate
    #[arg(long, default_value = "1000000", help = "Total number of logs to generate")]
    pub target: u64,

    /// Number of concurrent threads
    #[arg(long, default_value = "10", help = "Number of generator threads")]
    pub threads: usize,

    /// SIEM ingestion endpoint URL
    #[arg(long, default_value = "http://127.0.0.1:8081/ingest/raw", help = "HTTP endpoint for log ingestion")]
    pub endpoint: String,

    /// Interval between batches in milliseconds
    #[arg(long, default_value = "100", help = "Delay between batches (ms)")]
    pub interval: u64,

    /// Log template type
    #[arg(long, default_value = "mixed", help = "Log template: fortinet, sophos, f5, trendmicro, or mixed")]
    pub template: String,

    /// Number of simulated tenants
    #[arg(long, default_value = "20", help = "Number of tenant organizations to simulate")]
    pub tenant_count: usize,

    /// Compression algorithm
    #[arg(long, default_value = "gzip", help = "Compression: gzip, lz4, zstd, or none")]
    pub compression: String,

    /// Batch size for HTTP requests
    #[arg(long, default_value = "1000", help = "Number of logs per HTTP batch")]
    pub batch_size: u64,

    /// Dry run mode (no HTTP sending)
    #[arg(long, help = "Generate logs without sending to endpoint")]
    pub dry_run: bool,

    /// HTTP timeout in seconds
    #[arg(long, default_value = "30", help = "HTTP request timeout (seconds)")]
    pub timeout: u64,

    /// Maximum retry attempts
    #[arg(long, default_value = "3", help = "Maximum HTTP retry attempts")]
    pub max_retries: usize,

    /// Enable verbose logging
    #[arg(short, long, help = "Enable verbose output")]
    pub verbose: bool,
}

impl GeneratorConfig {
    /// Validate configuration parameters
    pub fn validate(&self) -> anyhow::Result<()> {
        if self.target == 0 {
            anyhow::bail!("Target must be greater than 0");
        }
        
        if self.threads == 0 {
            anyhow::bail!("Thread count must be greater than 0");
        }
        
        if self.tenant_count == 0 {
            anyhow::bail!("Tenant count must be greater than 0");
        }
        
        if self.batch_size == 0 {
            anyhow::bail!("Batch size must be greater than 0");
        }
        
        // Validate template type
        match self.template.as_str() {
            "fortinet" | "sophos" | "f5" | "trendmicro" | "mixed" => {},
            _ => anyhow::bail!("Invalid template type: {}", self.template),
        }
        
        // Validate compression type
        match self.compression.as_str() {
            "gzip" | "lz4" | "zstd" | "none" => {},
            _ => anyhow::bail!("Invalid compression type: {}", self.compression),
        }
        
        // Validate endpoint URL
        if !self.endpoint.starts_with("http://") && !self.endpoint.starts_with("https://") {
            anyhow::bail!("Endpoint must be a valid HTTP/HTTPS URL");
        }
        
        Ok(())
    }
    
    /// Get logs per thread
    pub fn logs_per_thread(&self) -> u64 {
        self.target / self.threads as u64
    }
    
    /// Check if compression is enabled
    pub fn is_compression_enabled(&self) -> bool {
        self.compression != "none"
    }
}

impl fmt::Display for GeneratorConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "GeneratorConfig {{ target: {}, threads: {}, template: {}, tenants: {}, compression: {} }}",
               self.target, self.threads, self.template, self.tenant_count, self.compression)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_config_validation() {
        let mut config = GeneratorConfig {
            target: 1000,
            threads: 4,
            endpoint: "http://localhost:8081/ingest/raw".to_string(),
            interval: 100,
            template: "fortinet".to_string(),
            tenant_count: 10,
            compression: "gzip".to_string(),
            batch_size: 500,
            dry_run: false,
            timeout: 30,
            max_retries: 3,
            verbose: false,
        };
        
        assert!(config.validate().is_ok());
        
        // Test invalid cases
        config.target = 0;
        assert!(config.validate().is_err());
        
        config.target = 1000;
        config.template = "invalid".to_string();
        assert!(config.validate().is_err());
    }
    
    #[test]
    fn test_logs_per_thread() {
        let config = GeneratorConfig {
            target: 1000,
            threads: 4,
            endpoint: "http://localhost:8081/ingest/raw".to_string(),
            interval: 100,
            template: "fortinet".to_string(),
            tenant_count: 10,
            compression: "gzip".to_string(),
            batch_size: 500,
            dry_run: false,
            timeout: 30,
            max_retries: 3,
            verbose: false,
        };
        
        assert_eq!(config.logs_per_thread(), 250);
    }
}