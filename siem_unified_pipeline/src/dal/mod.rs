//! Data Access Layer (DAL) for the SIEM unified pipeline
//!
//! This module provides repository traits and implementations for data access.
//! It abstracts database operations and provides a clean interface for handlers.

pub mod clickhouse;
pub mod traits;

pub use traits::*;
pub use clickhouse::*;

use crate::error::Result;
use async_trait::async_trait;