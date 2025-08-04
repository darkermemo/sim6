//! End-to-end pipeline smoke test.
//! 1. Wait for ClickHouse & Kafka health.
//! 2. Spawn siem_consumer + siem_api as child processes.
//! 3. Produce a JSON event to Kafka.
//! 4. Poll ClickHouse until row appears.
//! 5. Hit /api/v1/events/search and assert JSON contains same event_id.

use anyhow::{Context, Result};
use chrono::Utc;
use clickhouse::Client;
use rdkafka::{producer::FutureProducer, util::Timeout, config::ClientConfig};
use std::{process::{Child, Command}, time::Duration};
use tokio::time::sleep;
use uuid::Uuid;

const API_PORT: u16 = 3000;

#[tokio::main]
async fn main() -> Result<()> {
    // ------------------------------------------------------------------ 0  env
    std::env::set_var("CLICKHOUSE_URL", "http://localhost:8123");
    std::env::set_var("CLICKHOUSE_DATABASE", "dev");
    std::env::set_var("CLICKHOUSE_USERNAME", "default");
    std::env::set_var("CLICKHOUSE_PASSWORD", "");
    std::env::set_var("KAFKA_BROKERS", "localhost:9092");
    std::env::set_var("KAFKA_TOPIC_EVENTS", "siem_events");

    // ------------------------------------------------------------------ 1  wait deps
    wait_http("http://localhost:8123/ping").await?;
    wait_kafka_topic("localhost:9092").await?;

    // ------------------------------------------------------------------ 2  check if services are running
    // Try to connect to API first - if it's running, assume consumer is too
    let mut consumer: Option<Child> = None;
    let mut api: Option<Child> = None;
    
    match wait_http(&format!("http://localhost:{API_PORT}/health")).await {
        Ok(_) => {
            println!("✅ API already running on port {}", API_PORT);
        }
        Err(_) => {
            println!("⚠️  API not running, attempting to spawn services...");
            consumer = Some(spawn_bin("siem_consumer")?);
            api = Some(spawn_bin("siem_api")?);
            wait_http(&format!("http://localhost:{API_PORT}/health")).await?;
        }
    }

    // ------------------------------------------------------------------ 3  produce test event
    let event_id = Uuid::new_v4().to_string();
    let payload = serde_json::json!({
        "event_id": event_id,
        "tenant_id": "smoke-tenant",
        "event_timestamp": Utc::now().timestamp_millis(),
        "source_ip": "1.1.1.1",
        "url": "https://example.com/login",
        "http_method": "GET",
        "http_status_code": 200,
        "http_user_agent": "SmokeTest/1.0",
        "event_type": "smoke_test",
        "severity": "info",
        "message": "hello from smoke test",
        "device_product": "SmokeGen",
        "device_vendor": "SmokeCorp",
        "destination_country": "GB"
    })
    .to_string();

    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", "localhost:9092")
        .create()?;
    let delivery_result = producer.send(
        rdkafka::producer::FutureRecord::to("siem_events").payload(&payload).key(""),
        Timeout::After(Duration::from_secs(3)),
    ).await;
    match delivery_result {
        Ok(_) => println!("Event sent to Kafka"),
        Err((e, _)) => anyhow::bail!("Failed to send to Kafka: {}", e),
    }

    // ------------------------------------------------------------------ 4  poll ClickHouse
    let ch = Client::default()
        .with_url("http://localhost:8123")
        .with_database("dev");
    for _ in 0..30 {
        let query = format!("SELECT count() FROM dev.events WHERE event_id = '{}'", event_id);
        let cnt: u64 = ch
            .query(&query)
            .fetch_one()
            .await
            .unwrap_or(0u64);
        if cnt > 0 {
            println!("ClickHouse ingestion confirmed");
            break;
        }
        sleep(Duration::from_secs(1)).await;
    }

    // ------------------------------------------------------------------ 5  hit API
    let url = format!("http://localhost:{API_PORT}/api/v1/events/search?tenant=smoke-tenant&q=smoke_test&limit=10&offset=0");
    
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;
    
    let response_str = serde_json::to_string(&res)?;
    assert!(response_str.contains(&event_id), "API did not return event: {}", response_str);

    println!("✅ pipeline smoke test passed");

    if let Some(mut consumer) = consumer {
        let _ = consumer.kill();
    }
    if let Some(mut api) = api {
        let _ = api.kill();
    }
    Ok(())
}

// ---------- helpers -----------------------------------------------------------
async fn wait_http(url: &str) -> Result<()> {
    for _ in 0..30 {
        if reqwest::get(url).await.ok().map(|r| r.status().is_success()).unwrap_or(false) {
            return Ok(());
        }
        sleep(Duration::from_secs(1)).await;
    }
    anyhow::bail!("HTTP endpoint {} not ready", url)
}

async fn wait_kafka_topic(brokers: &str) -> Result<()> {
    use rdkafka::admin::AdminClient;
    
    for _ in 0..30 {
        let admin: AdminClient<_> = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .create()
            .context("Failed to create Kafka admin client")?;
        
        if let Ok(meta) = admin.inner().fetch_metadata(Some("siem_events"), std::time::Duration::from_secs(1)) {
            if meta.topics().iter().any(|t| t.name() == "siem_events") {
                return Ok(());
            }
        }
        sleep(Duration::from_secs(1)).await;
    }
    Err(anyhow::anyhow!("Timeout waiting for Kafka"))
}

fn spawn_bin(bin: &str) -> anyhow::Result<Child> {
    use std::collections::HashMap;
    let dirs = HashMap::from([
        ("siem_consumer", "siem_consumer"),
        ("siem_api",      "siem_api"),
    ]);
    let dir = dirs
        .get(bin)
        .ok_or_else(|| anyhow::anyhow!("unknown bin {bin}"))?;

    Ok(Command::new("cargo")
        .current_dir(dir)
        .args(["run", "--quiet", "--bin", bin])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::inherit())
        .spawn()?)
}