use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct EventSearchQuery {
    pub query: Option<String>,
    pub source: Option<String>,
    pub severity: Option<String>,
    pub tenant_id: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct EventStreamQuery {
    pub source: Option<String>,
    pub severity: Option<String>,
    pub security_event: Option<bool>,
    pub buffer_size: Option<u32>,
    pub heartbeat_interval: Option<u32>,
}

