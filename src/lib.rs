//! SIEM Schema Validator Library
//!
//! This library provides comprehensive schema validation and normalization
//! for SIEM (Security Information and Event Management) platforms.
//!
//! # Modules
//!
//! - `parsed_event`: Canonical ParsedEvent struct following ECS/CIM/UDM standards

pub mod parsed_event;

// Re-export the main types for convenience
pub use parsed_event::ParsedEvent;

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