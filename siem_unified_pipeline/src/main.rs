use siem_unified_pipeline::v2::{router, state::AppState, workers::kafka_consumer};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let st = AppState::new("http://localhost:8123", "dev.events");
    let app = router::build(st.clone());

    // Start Kafka consumer in background (optional; configure via env)
    if let (Ok(brokers), Ok(topic), Ok(group)) = (
        std::env::var("KAFKA_BROKERS"),
        std::env::var("KAFKA_TOPIC"),
        std::env::var("KAFKA_GROUP_ID")
    ) {
        tokio::spawn(async move {
            let _ = kafka_consumer::start_kafka_consumer(st, &brokers, &topic, &group).await;
        });
    }

    let addr = "0.0.0.0:9999".parse::<std::net::SocketAddr>()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}