//! Transformation performance benchmarks

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use siem_unified_pipeline::{
    config::PipelineConfig,
    ingestion::{Event, EventMetadata},
    transformation::TransformationEngine,
};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::runtime::Runtime;
use uuid::Uuid;

/// Create a sample event for benchmarking
fn create_sample_event(index: usize) -> Event {
    Event {
        id: Uuid::new_v4().to_string(),
        timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
        source: format!("source-{}", index % 5),
        event_type: "benchmark-event".to_string(),
        severity: "info".to_string(),
        message: format!("Benchmark transformation event {}", index),
        raw_data: format!("{{\"user\": \"user{}\", \"action\": \"login\", \"ip\": \"192.168.1.{}\"}}", index, index % 255),
        parsed_data: serde_json::json!({
            "user": format!("user{}", index),
            "action": "login",
            "ip": format!("192.168.1.{}", index % 255),
            "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
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
    }
}

/// Benchmark field extraction
fn bench_field_extraction(c: &mut Criterion) {
    let event = create_sample_event(1);
    
    c.bench_function("field_extraction", |b| {
        b.iter(|| {
            let user = black_box(event.parsed_data.get("user").and_then(|v| v.as_str()));
            let action = black_box(event.parsed_data.get("action").and_then(|v| v.as_str()));
            let ip = black_box(event.parsed_data.get("ip").and_then(|v| v.as_str()));
            black_box((user, action, ip))
        })
    });
}

/// Benchmark regex pattern matching
fn bench_regex_matching(c: &mut Criterion) {
    use regex::Regex;
    
    let ip_regex = Regex::new(r"^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$").unwrap();
    let email_regex = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
    let event = create_sample_event(1);
    
    c.bench_function("regex_ip_validation", |b| {
        b.iter(|| {
            if let Some(ip) = event.parsed_data.get("ip").and_then(|v| v.as_str()) {
                black_box(ip_regex.is_match(ip))
            } else {
                black_box(false)
            }
        })
    });
    
    c.bench_function("regex_email_validation", |b| {
        b.iter(|| {
            let test_email = "user@example.com";
            black_box(email_regex.is_match(test_email))
        })
    });
}

/// Benchmark data enrichment
fn bench_data_enrichment(c: &mut Criterion) {
    let mut event = create_sample_event(1);
    
    c.bench_function("data_enrichment", |b| {
        b.iter(|| {
            // Simulate enrichment by adding metadata
            let mut enriched = black_box(event.clone());
            enriched.metadata.enrichment_data = Some(serde_json::json!({
                "geo_country": "US",
                "geo_city": "New York",
                "threat_score": 0.1,
                "user_risk_level": "low"
            }));
            enriched.metadata.tags.push("enriched".to_string());
            black_box(enriched)
        })
    });
}

/// Benchmark transformation pipeline
fn bench_transformation_pipeline(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    
    c.bench_function("transformation_pipeline_100", |b| {
        b.to_async(&rt).iter(|| async {
            let events: Vec<Event> = (0..100)
                .map(create_sample_event)
                .collect();
            
            // Simulate transformation pipeline
            let transformed: Vec<_> = events
                .into_iter()
                .map(|mut event| {
                    // Field normalization
                    if let Some(user) = event.parsed_data.get("user").and_then(|v| v.as_str()) {
                        event.parsed_data.as_object_mut().unwrap()
                            .insert("normalized_user".to_string(), serde_json::Value::String(user.to_lowercase()));
                    }
                    
                    // Add processing timestamp
                    event.metadata.processing_time = Some(
                        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
                    );
                    
                    // Add transformation tag
                    event.metadata.tags.push("transformed".to_string());
                    
                    event
                })
                .collect();
            
            black_box(transformed)
        })
    });
}

/// Benchmark JSON parsing and manipulation
fn bench_json_operations(c: &mut Criterion) {
    let json_str = r#"{
        "user": "testuser",
        "action": "login",
        "ip": "192.168.1.100",
        "timestamp": 1640995200,
        "metadata": {
            "browser": "Chrome",
            "os": "Windows"
        }
    }"#;
    
    c.bench_function("json_parsing", |b| {
        b.iter(|| {
            let parsed: serde_json::Value = black_box(serde_json::from_str(json_str).unwrap());
            black_box(parsed)
        })
    });
    
    let parsed_json: serde_json::Value = serde_json::from_str(json_str).unwrap();
    
    c.bench_function("json_field_access", |b| {
        b.iter(|| {
            let user = black_box(parsed_json.get("user").and_then(|v| v.as_str()));
            let browser = black_box(parsed_json.pointer("/metadata/browser").and_then(|v| v.as_str()));
            black_box((user, browser))
        })
    });
    
    c.bench_function("json_modification", |b| {
        b.iter(|| {
            let mut modified = black_box(parsed_json.clone());
            modified.as_object_mut().unwrap()
                .insert("processed".to_string(), serde_json::Value::Bool(true));
            black_box(modified)
        })
    });
}

criterion_group!(
    benches,
    bench_field_extraction,
    bench_regex_matching,
    bench_data_enrichment,
    bench_transformation_pipeline,
    bench_json_operations
);
criterion_main!(benches);