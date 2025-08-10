use std::time::{Duration, Instant};
use futures::StreamExt;
use rdkafka::{consumer::{Consumer, StreamConsumer}, ClientConfig, message::BorrowedMessage};
use serde_json::Value;
use siem_unified_pipeline::v2::metrics;

fn env(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

#[tokio::main]
async fn main() {
    let brokers = env("KAFKA_BROKERS", "localhost:9092");
    let group = env("KAFKA_GROUP", "siem-stream-eval");
    let topic_in = env("KAFKA_IN", "siem.events.v1");
    println!("[BOOT] stream_eval KAFKA_BROKERS={} GROUP={} IN={}", brokers, group, topic_in);

    metrics::init();

    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", &brokers)
        .set("group.id", &group)
        .set("enable.partition.eof", "false")
        .set("session.timeout.ms", "6000")
        .set("enable.auto.commit", "true")
        .create()
        .expect("consumer");
    consumer.subscribe(&[&topic_in]).expect("subscribe");

    let mut stream = consumer.stream();
    while let Some(msg) = stream.next().await {
        match msg {
            Err(e) => {
                eprintln!("kafka error: {}", e);
                metrics::inc_stream_events("error");
            }
            Ok(m) => {
                if let Some(payload) = m.payload() {
                    let t0 = Instant::now();
                    let outcome = match serde_json::from_slice::<Value>(payload) {
                        Ok(_v) => {
                            // TODO: evaluate against active streaming rules (future step)
                            // For now, parse-only counts as processed
                            "ok"
                        }
                        Err(_) => "invalid",
                    };
                    metrics::inc_stream_events(outcome);
                    metrics::obs_stream_eval("bootstrap", t0.elapsed().as_secs_f64());
                }
            }
        }
    }
}


