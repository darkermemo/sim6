use clickhouse::Client as ChClient;
use std::sync::Arc;

/// Application state containing shared resources
#[derive(Clone)]
pub struct AppState {
    /// ClickHouse client for database operations
    pub ch: Arc<ChClient>,
    /// Events table name (e.g., "dev.events")
    pub events_table: String,
    // add redis/kafka if core needs them now, else later behind features
    // pub redis: Option<redis::Client>,
}

impl AppState {
    /// Create a new AppState with the given ClickHouse client and table name
    pub fn new(ch_client: ChClient, events_table: String) -> Self {
        Self {
            ch: Arc::new(ch_client),
            events_table,
        }
    }
}