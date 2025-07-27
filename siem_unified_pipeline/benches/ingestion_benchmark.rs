//! Ingestion performance benchmarks

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use siem_unified_pipeline::{
    config::PipelineConfig,
    ingestion::{Event, EventMetadata},
    pipeline::Pipeline,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::runtime::Runtime;
use uuid::Uuid;

/// Benchmark event creation
fn bench_event_creation(c: &mut Criterion) {
    c.bench_function("event_creation", |b| {
        b.iter(|| {
            let event = Event {
                id: black_box(Uuid::new_v4().to_string()),
                timestamp: black_box(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()),
                source: black_box("test-source".to_string()),
                event_type: black_box("test-event".to_string()),
                severity: black_box("info".to_string()),
                message: black_box("Test event message".to_string()),
                raw_data: black_box("raw test data".to_string()),
                parsed_data: black_box(serde_json::json!({
                    "field1": "value1",
                    "field2": 42,
                    "field3": true
                })),
                metadata: black_box(EventMetadata {
                    ingestion_time: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                    processing_time: None,
                    enrichment_data: None,
                    geo_location: None,
                    threat_intelligence: None,
                    asset_info: None,
                    user_info: None,
                    tags: vec!["test".to_string()],
                    custom_fields: std::collections::HashMap::new(),
                }),
            };
            black_box(event)
        })
    });
}

/// Benchmark event serialization
fn bench_event_serialization(c: &mut Criterion) {
    let event = Event {
        id: Uuid::new_v4().to_string(),
        timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
        source: "test-source".to_string(),
        event_type: "test-event".to_string(),
        severity: "info".to_string(),
        message: "Test event message".to_string(),
        raw_data: "raw test data".to_string(),
        parsed_data: serde_json::json!({
            "field1": "value1",
            "field2": 42,
            "field3": true
        }),
        metadata: EventMetadata {
            ingestion_time: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
            processing_time: None,
            enrichment_data: None,
            geo_location: None,
            threat_intelligence: None,
            asset_info: None,
            user_info: None,
            tags: vec!["test".to_string()],
            custom_fields: std::collections::HashMap::new(),
        },
    };

    c.bench_function("event_json_serialization", |b| {
        b.iter(|| {
            let serialized = black_box(serde_json::to_string(&event).unwrap());
            black_box(serialized)
        })
    });

    c.bench_function("event_bincode_serialization", |b| {
        b.iter(|| {
            let serialized = black_box(bincode::serialize(&event).unwrap());
            black_box(serialized)
        })
    });
}

/// Benchmark batch processing
fn bench_batch_processing(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    
    c.bench_function("batch_processing_1000", |b| {
        b.to_async(&rt).iter(|| async {
            let events: Vec<Event> = (0..1000)
                .map(|i| Event {
                    id: Uuid::new_v4().to_string(),
                    timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                    source: format!("source-{}", i % 10),
                    event_type: "benchmark-event".to_string(),
                    severity: "info".to_string(),
                    message: format!("Benchmark event {}", i),
                    raw_data: format!("raw data {}", i),
                    parsed_data: serde_json::json!({
                        "index": i,
                        "batch": "benchmark"
                    }),
                    metadata: EventMetadata {
                        ingestion_time: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                        processing_time: None,
                        enrichment_data: None,
                        geo_location: None,
                        threat_intelligence: None,
                        asset_info: None,
                        user_info: None,
                        tags: vec!["benchmark".to_string()],
                        custom_fields: std::collections::HashMap::new(),
                    },
                })
                .collect();
            
            // Simulate batch processing
            let processed: Vec<_> = events
                .into_iter()
                .map(|mut event| {
                    event.metadata.processing_time = Some(
                        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
                    );
                    event
                })
                .collect();
            
            black_box(processed)
        })
    });
}

criterion_group!(
    benches,
    bench_event_creation,
    bench_event_serialization,
    bench_batch_processing
);
criterion_main!(benches);