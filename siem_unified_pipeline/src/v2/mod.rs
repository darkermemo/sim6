pub mod state;
pub mod models;
pub mod api;
pub mod dal;
pub mod handlers {
    pub mod health;
    pub mod events;
    pub mod sse;
    pub mod alerts;
    pub mod alert_rules;
    pub mod metrics;
    pub mod ingest;
    pub mod assets;
}
pub mod router;
pub mod workers {
    pub mod kafka_consumer;
}

