//! SIEM Schema Validator Library
//!
//! This library provides comprehensive schema validation and normalization
//! for SIEM (Security Information and Event Management) platforms.
//!
//! # Modules
//!
//! - `parsed_event`: Canonical ParsedEvent struct following ECS/CIM/UDM standards
//! - `error_handling`: Standardized error handling and recovery patterns
//! - `database_manager`: Unified database connection management
//! - `dev_events_handler`: Development events API handler

pub mod parsed_event;
pub mod error_handling;
pub mod database_manager;
pub mod dev_events_handler;

// Re-export the main types for convenience
pub use parsed_event::ParsedEvent;
pub use error_handling::{SiemError, SiemResult, ErrorResponse};
pub use database_manager::{DatabaseManager, DatabaseConfig};
pub use dev_events_handler::{get_dev_events, create_dev_events_router, AppState, DevEventsResponse, DevEventCore};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_library_exports() {
        // Test that we can create a ParsedEvent
        let event = ParsedEvent::new();
        assert!(event.timestamp.is_none());
        assert!(event.additional_fields.is_empty());
    }
}