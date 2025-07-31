//! EventV2 Model Definition
//!
//! This module defines the EventV2 struct that maps to the enhanced events_v2 ClickHouse table.
//! The struct includes new fields for log metrics, enrichment flags, and performance monitoring
//! while maintaining compatibility with existing patterns.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::net::{Ipv4Addr, Ipv6Addr};
use uuid::Uuid;

/// Compression algorithm enumeration matching ClickHouse Enum8
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CompressionAlgorithm {
    None = 0,
    Gzip = 1,
    Zstd = 2,
}

impl Default for CompressionAlgorithm {
    fn default() -> Self {
        CompressionAlgorithm::None
    }
}

impl From<u8> for CompressionAlgorithm {
    fn from(value: u8) -> Self {
        match value {
            0 => CompressionAlgorithm::None,
            1 => CompressionAlgorithm::Gzip,
            2 => CompressionAlgorithm::Zstd,
            _ => CompressionAlgorithm::None,
        }
    }
}

impl From<CompressionAlgorithm> for u8 {
    fn from(alg: CompressionAlgorithm) -> Self {
        match alg {
            CompressionAlgorithm::None => 0,
            CompressionAlgorithm::Gzip => 1,
            CompressionAlgorithm::Zstd => 2,
        }
    }
}

/// Enhanced EventV2 struct mapping to events_v2 ClickHouse table
///
/// This struct represents the new events_v2 schema with enhanced fields for:
/// - Log size tracking and analysis
/// - Data quality monitoring
/// - Performance metrics
/// - Compression tracking
/// - Pipeline observability
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventV2 {
    /// Tenant identifier (UUID)
    pub tenant_id: Uuid,
    
    /// Event timestamp in UTC with millisecond precision
    #[serde(with = "ts_milliseconds")]
    pub event_timestamp: DateTime<Utc>,
    
    // === CORE METADATA ===
    /// Event category (low cardinality for efficient storage)
    pub event_category: String,
    
    /// Source IP address (IPv6 compatible)
    #[serde(with = "ip_address_serde")]
    pub source_ip: Ipv6Addr,
    
    /// Destination IP address (IPv6 compatible)
    #[serde(with = "ip_address_serde")]
    pub dest_ip: Ipv6Addr,
    
    /// User identifier or name
    pub user: String,
    
    // === NEW: RAW LOG METRICS ===
    /// Size of the raw log in bytes
    pub raw_log_size: u32,
    
    /// MD5 hash of the raw log (32 hex characters)
    pub raw_log_hash: String,
    
    /// Compression algorithm used
    pub compression_alg: CompressionAlgorithm,
    
    // === NEW: ENRICHMENT FLAGS ===
    /// Whether parsing was successful (1 = success, 0 = failure)
    pub parsed_success: u8,
    
    /// Schema version for backward compatibility
    pub schema_version: u16,
    
    // === ORIGINAL JSON FOR FALLBACK ===
    /// Original JSON event for debugging and reprocessing
    pub raw_event_json: String,
    
    // === INGESTION PIPELINE METADATA ===
    /// Node that processed this event
    pub ingest_node: String,
    
    /// Processing latency in milliseconds
    pub ingest_latency_ms: u32,
    
    // === PARTITION AND ORDERING (computed fields) ===
    /// Partition key (YYYYMM format)
    #[serde(rename = "_partition")]
    pub partition: u16,
    
    /// Ordering key (tenant_id + timestamp)
    #[serde(rename = "_order")]
    pub order: String,
}

impl EventV2 {
    /// Create a new EventV2 instance with required fields
    pub fn new(
        tenant_id: Uuid,
        event_timestamp: DateTime<Utc>,
        event_category: String,
        source_ip: Ipv6Addr,
        dest_ip: Ipv6Addr,
        user: String,
        raw_event_json: String,
        ingest_node: String,
    ) -> Self {
        let partition = (event_timestamp.year() as u16 * 100) + event_timestamp.month() as u16;
        let order = format!("{}{}", tenant_id, event_timestamp.timestamp_millis());
        
        Self {
            tenant_id,
            event_timestamp,
            event_category,
            source_ip,
            dest_ip,
            user,
            raw_log_size: raw_event_json.len() as u32,
            raw_log_hash: compute_md5_hash(&raw_event_json),
            compression_alg: CompressionAlgorithm::None,
            parsed_success: 1, // Default to success
            schema_version: 1, // Current schema version
            raw_event_json,
            ingest_node,
            ingest_latency_ms: 0, // To be set by ingestion pipeline
            partition,
            order,
        }
    }
    
    /// Set the raw log size and recompute hash
    pub fn set_raw_log_data(&mut self, raw_data: &str) -> &mut Self {
        self.raw_log_size = raw_data.len() as u32;
        self.raw_log_hash = compute_md5_hash(raw_data);
        self
    }
    
    /// Set compression algorithm
    pub fn set_compression(&mut self, alg: CompressionAlgorithm) -> &mut Self {
        self.compression_alg = alg;
        self
    }
    
    /// Mark parsing as failed
    pub fn mark_parse_failed(&mut self) -> &mut Self {
        self.parsed_success = 0;
        self
    }
    
    /// Set ingestion latency
    pub fn set_ingest_latency(&mut self, latency_ms: u32) -> &mut Self {
        self.ingest_latency_ms = latency_ms;
        self
    }
    
    /// Check if parsing was successful
    pub fn is_parsed_successfully(&self) -> bool {
        self.parsed_success == 1
    }
    
    /// Get human-readable log size
    pub fn get_human_readable_size(&self) -> String {
        let size = self.raw_log_size as f64;
        if size < 1024.0 {
            format!("{} B", size)
        } else if size < 1024.0 * 1024.0 {
            format!("{:.1} KB", size / 1024.0)
        } else if size < 1024.0 * 1024.0 * 1024.0 {
            format!("{:.1} MB", size / (1024.0 * 1024.0))
        } else {
            format!("{:.1} GB", size / (1024.0 * 1024.0 * 1024.0))
        }
    }
    
    /// Convert to JSON string
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
    
    /// Convert from JSON string
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

/// Compute MD5 hash of input string and return as hex string
fn compute_md5_hash(input: &str) -> String {
    use md5::{Digest, Md5};
    let mut hasher = Md5::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Custom serde module for timestamp handling with millisecond precision
mod ts_milliseconds {
    use chrono::{DateTime, Utc, TimeZone};
    use serde::{Deserialize, Deserializer, Serializer};
    
    pub fn serialize<S>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_i64(dt.timestamp_millis())
    }
    
    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let timestamp_ms = i64::deserialize(deserializer)?;
        Ok(Utc.timestamp_millis_opt(timestamp_ms).unwrap())
    }
}

/// Custom serde module for IP address handling
mod ip_address_serde {
    use std::net::{Ipv4Addr, Ipv6Addr};
    use serde::{Deserialize, Deserializer, Serializer};
    
    pub fn serialize<S>(ip: &Ipv6Addr, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&ip.to_string())
    }
    
    pub fn deserialize<'de, D>(deserializer: D) -> Result<Ipv6Addr, D::Error>
    where
        D: Deserializer<'de>,
    {
        let ip_str = String::deserialize(deserializer)?;
        
        // Try parsing as IPv6 first
        if let Ok(ipv6) = ip_str.parse::<Ipv6Addr>() {
            return Ok(ipv6);
        }
        
        // Try parsing as IPv4 and convert to IPv6
        if let Ok(ipv4) = ip_str.parse::<Ipv4Addr>() {
            return Ok(ipv4.to_ipv6_mapped());
        }
        
        Err(serde::de::Error::custom(format!("Invalid IP address: {}", ip_str)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use std::net::{Ipv4Addr, Ipv6Addr};
    use uuid::Uuid;
    
    #[test]
    fn test_event_v2_creation() {
        let tenant_id = Uuid::new_v4();
        let timestamp = Utc::now();
        let source_ip = Ipv4Addr::new(192, 168, 1, 1).to_ipv6_mapped();
        let dest_ip = Ipv4Addr::new(10, 0, 0, 1).to_ipv6_mapped();
        
        let event = EventV2::new(
            tenant_id,
            timestamp,
            "Authentication".to_string(),
            source_ip,
            dest_ip,
            "user123".to_string(),
            r#"{"message": "Login successful"}"#.to_string(),
            "node-1".to_string(),
        );
        
        assert_eq!(event.tenant_id, tenant_id);
        assert_eq!(event.event_category, "Authentication");
        assert_eq!(event.user, "user123");
        assert_eq!(event.parsed_success, 1);
        assert_eq!(event.schema_version, 1);
        assert!(event.raw_log_size > 0);
        assert!(!event.raw_log_hash.is_empty());
    }
    
    #[test]
    fn test_compression_algorithm() {
        let mut event = EventV2::new(
            Uuid::new_v4(),
            Utc::now(),
            "Network".to_string(),
            Ipv6Addr::LOCALHOST,
            Ipv6Addr::LOCALHOST,
            "test".to_string(),
            "{}".to_string(),
            "node-1".to_string(),
        );
        
        event.set_compression(CompressionAlgorithm::Gzip);
        assert_eq!(event.compression_alg, CompressionAlgorithm::Gzip);
    }
    
    #[test]
    fn test_human_readable_size() {
        let mut event = EventV2::new(
            Uuid::new_v4(),
            Utc::now(),
            "Test".to_string(),
            Ipv6Addr::LOCALHOST,
            Ipv6Addr::LOCALHOST,
            "test".to_string(),
            "x".repeat(1024),
            "node-1".to_string(),
        );
        
        assert!(event.get_human_readable_size().contains("KB"));
    }
    
    #[test]
    fn test_serialization() {
        let event = EventV2::new(
            Uuid::new_v4(),
            Utc::now(),
            "Test".to_string(),
            Ipv6Addr::LOCALHOST,
            Ipv6Addr::LOCALHOST,
            "test".to_string(),
            "{}".to_string(),
            "node-1".to_string(),
        );
        
        let json = event.to_json().unwrap();
        let deserialized = EventV2::from_json(&json).unwrap();
        assert_eq!(event, deserialized);
    }
}