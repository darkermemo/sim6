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
    pub mod search;
    pub mod schema;
    pub mod incidents;
    pub mod investigate;
    pub mod admin;
    pub mod sources;
    pub mod parsers;
    pub mod cim;
    pub mod admin_tenants;
    pub mod parse;
    pub mod investigations;
}
pub mod router;
pub mod workers {
    pub mod kafka_consumer;
    pub mod incident_aggregator;
}
pub mod compiler;
pub mod engine;
pub mod metrics;
pub mod capabilities;
pub mod streaming {
    pub mod plan;
}
pub mod schema {
    pub mod catalog;
}

