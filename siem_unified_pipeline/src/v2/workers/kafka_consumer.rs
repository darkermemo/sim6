use std::time::Duration;
use rdkafka::{
    consumer::{Consumer, StreamConsumer},
    ClientConfig,
    Message,
};
use crate::v2::{state::AppState, models::SiemEvent, dal::ClickHouseRepo};
use crate::error::PipelineError;

pub async fn start_kafka_consumer(
    st: AppState,
    brokers: &str,
    topic: &str,
    group_id: &str,
) -> Result<(), PipelineError> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", group_id)
        .set("enable.partition.eof", "false")
        .set("session.timeout.ms", "6000")
        .set("enable.auto.commit", "true")
        .create()
        .map_err(|e| PipelineError::kafka(format!("create consumer: {e}")))?;

    consumer
        .subscribe(&[topic])
        .map_err(|e| PipelineError::kafka(format!("subscribe: {e}")))?;

    let st = std::sync::Arc::new(st);

    loop {
        match consumer.recv().await {
            Err(e) => {
                // backoff on errors
                tokio::time::sleep(Duration::from_millis(250)).await;
                eprintln!("kafka recv error: {e}");
            }
            Ok(m) => {
                if let Some(payload) = m.payload_view::<str>().and_then(Result::ok) {
                    if let Ok(ev) = serde_json::from_str::<SiemEvent>(payload) {
                        let _ = ClickHouseRepo::insert_events(&st, &[ev]).await;
                    }
                }
            }
        }
    }
}


