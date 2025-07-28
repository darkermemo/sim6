//! SIEM Tools Library
//! High-performance log generation and testing utilities for SIEM systems

pub mod config;
pub mod generator;
pub mod http_client;
pub mod stats;

// Re-export commonly used types
pub use config::GeneratorConfig;
pub use generator::{LogGenerator, TemplateType};
pub use http_client::HttpClient;
pub use stats::{Stats, StatsSummary};

/// Library version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Library name
pub const NAME: &str = env!("CARGO_PKG_NAME");

/// Get library information
pub fn info() -> LibraryInfo {
    LibraryInfo {
        name: NAME.to_string(),
        version: VERSION.to_string(),
        description: "High-performance SIEM log generation and testing tools".to_string(),
    }
}

/// Library information structure
#[derive(Debug, Clone)]
pub struct LibraryInfo {
    pub name: String,
    pub version: String,
    pub description: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_library_info() {
        let info = info();
        assert_eq!(info.name, "siem_tools");
        assert!(!info.version.is_empty());
        assert!(!info.description.is_empty());
    }
    
    #[test]
    fn test_version_constant() {
        assert!(!VERSION.is_empty());
        assert!(!NAME.is_empty());
    }
}