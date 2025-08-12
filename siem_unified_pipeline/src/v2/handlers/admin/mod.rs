// v2 admin handlers (authoritative, used by router)
pub mod tenants;
pub mod parsers;
pub mod sources; // aka log_sources in router imports
pub mod limits;

// Legacy/unused admin pieces — compile only when the feature is enabled.
#[cfg(feature = "legacy-admin")]
pub mod apikeys;

#[cfg(feature = "legacy-admin")]
pub mod roles;

#[cfg(feature = "legacy-admin")]
pub mod agents;

#[cfg(feature = "legacy-admin")]
pub mod health;

// IMPORTANT: Do NOT `pub use ...::*;` here.
// Keep handlers namespaced (admin::<module>::func) to avoid collisions.
