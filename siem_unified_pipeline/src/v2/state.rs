use clickhouse::Client;

#[derive(Clone)]
pub struct AppState {
    pub ch: Client,
    pub events_table: String,
}

impl AppState {
    pub fn new(ch_url: &str, events_table: &str) -> Self {
        let ch = Client::default()
            .with_url(ch_url)
            .with_compression(clickhouse::Compression::Lz4);
        Self { ch, events_table: events_table.to_string() }
    }
}

