//! Models module for the SIEM unified pipeline
//!
//! This module contains all data structures and models used throughout the pipeline,
//! including event representations, API types, and database schemas.

pub mod event;
pub mod user;

// Re-export commonly used types
pub use event::{SiemEvent, EventSummary};
pub use user::{User, UserRole, UserSession, Role, UserRoleAssignment};

// Re-export schema types for legacy handlers
pub use crate::schemas::{
    EventSearchRequest, CreateRoutingRuleRequest, UpdateRoutingRuleRequest,
    EventDetail, RoutingRuleResponse
};

// Re-export API types that might be used as models
pub use crate::types::api::{
    EventSearchQuery, EventStreamQuery, PageInfo
};