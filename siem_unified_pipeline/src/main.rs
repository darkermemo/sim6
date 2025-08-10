use siem_unified_pipeline::v2::{router, state::AppState, workers::{kafka_consumer, incident_aggregator}, engine::run_scheduler};
use std::time::Duration;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let ch_url = std::env::var("CLICKHOUSE_URL").unwrap_or_else(|_| "http://localhost:8123".to_string());
    let events_table = std::env::var("EVENTS_TABLE").unwrap_or_else(|_| "dev.events".to_string());
    let st = AppState::new(&ch_url, &events_table);
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
    let app = router::build(st.clone());

    // Start Kafka consumer in background (optional; configure via env)
    if let (Ok(brokers), Ok(topic), Ok(group)) = (
        std::env::var("KAFKA_BROKERS"),
        std::env::var("KAFKA_TOPIC"),
        std::env::var("KAFKA_GROUP_ID")
    ) {
        let st_kafka = st.clone();
        tokio::spawn(async move {
            let _ = kafka_consumer::start_kafka_consumer(st_kafka, &brokers, &topic, &group).await;
        });
    }

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

    let addr = "0.0.0.0:9999".parse::<std::net::SocketAddr>()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}