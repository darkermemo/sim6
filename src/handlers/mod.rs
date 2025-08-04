//! Handlers module for SIEM API endpoints
//!
//! This module contains all HTTP request handlers for the SIEM system,
//! organized by functionality.

pub mod events;

// Re-export commonly used types
pub use events::{create_events_router, Event, PagedEvents, SearchQuery};