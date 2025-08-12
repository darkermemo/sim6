use siem_unified_pipeline::v2::{router, state::AppState, workers::incident_aggregator, engine::run_scheduler};
use redis::aio::ConnectionManager;
use std::time::Duration;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let ch_url = std::env::var("CLICKHOUSE_URL").unwrap_or_else(|_| "http://localhost:8123".to_string());
    let events_table = std::env::var("EVENTS_TABLE").unwrap_or_else(|_| "dev.events".to_string());
    let mut st = AppState::new(&ch_url, &events_table);
    // Optional Redis init
    if let Ok(redis_url) = std::env::var("REDIS_URL") {
        if !redis_url.trim().is_empty() {
            if let Ok(client) = redis::Client::open(redis_url) {
                if let Ok(cm) = ConnectionManager::new(client).await {
                    st.redis = Some(cm);
                }
            }
        }
    }
    
    // Optional Kafka consumer
    if let Ok(brokers) = std::env::var("KAFKA_BROKERS") {
        if !brokers.trim().is_empty() {
            use siem_unified_pipeline::v2::workers::kafka_consumer::KafkaConsumerWorker;
            use std::sync::Arc;
            use tokio::sync::RwLock;
            
            let kafka_state = st.clone();
            match KafkaConsumerWorker::new(Arc::new(kafka_state)) {
                Ok(consumer) => {
                    let consumer_arc = Arc::new(RwLock::new(consumer));
                    st.kafka_consumer = Some(consumer_arc.clone());
                    
                    // Spawn consumer task
                    tokio::spawn(async move {
                        tracing::info!("Starting Kafka consumer worker");
                        let mut consumer = consumer_arc.write().await;
                        if let Err(e) = consumer.run().await {
                            tracing::error!("Kafka consumer error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    tracing::error!("Failed to create Kafka consumer: {}", e);
                }
            }
        }
    }
    // Boot-time probe: ipCIDRMatch availability (best-effort)
    {
        let client = reqwest::Client::new();
        let url = ch_url.clone();
        let fut = async move {
            let q = "SELECT ipCIDRMatch('1.1.1.1','1.1.1.0/24') FORMAT JSON";
            match client.get(&url).query(&[("query", q)]).timeout(Duration::from_millis(1200)).send().await {
                Ok(resp) => {
                    let ok = resp.status().is_success();
                    siem_unified_pipeline::v2::capabilities::set_ipcidr_available(ok);
                }
                Err(_) => { /* keep default true */ }
            }
        };
        tokio::spawn(fut);
    }
    let app = router::build(st.clone().into());

    // Kafka consumer already started above if KAFKA_BROKERS is set

    // Start incident aggregator worker (every 30s)
    {
        let st2 = st.clone();
        tokio::spawn(async move {
            use incident_aggregator::{start_worker, IncidentConfig};
            start_worker(st2, IncidentConfig::default()).await;
        });
    }

    // Start rules scheduler (gated by RULE_SCHEDULER=1)
    run_scheduler(st.clone().into()).await;

    // Bind address configurable for tests; default to 127.0.0.1:9999
    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:9999".to_string());
    let addr = bind_addr.parse::<std::net::SocketAddr>()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    if listener.local_addr()?.port() != 9999 {
        println!("listening_on={}", listener.local_addr()?);
    }
    axum::serve(listener, app).await?;
    Ok(())
}