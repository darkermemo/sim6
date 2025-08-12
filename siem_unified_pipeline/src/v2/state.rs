use clickhouse::Client;
use redis::aio::ConnectionManager;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::v2::workers::kafka_consumer::KafkaConsumerWorker;

#[derive(Clone)]
pub struct AppState {
    pub ch: Client,
    pub events_table: String,
    pub redis: Option<ConnectionManager>,
    pub kafka_consumer: Option<Arc<RwLock<KafkaConsumerWorker>>>,
}

impl AppState {
    pub fn new(ch_url: &str, events_table: &str) -> Self {
        // Allow overriding database via env, default to none (table is fully qualified)
        let mut client = Client::default().with_url(ch_url).with_compression(clickhouse::Compression::Lz4);
        if let Ok(db) = std::env::var("CLICKHOUSE_DATABASE") {
            if !db.trim().is_empty() { client = client.with_database(&db); }
        }
        let ch = client;
        Self { ch, events_table: events_table.to_string(), redis: None, kafka_consumer: None }
    }
}

