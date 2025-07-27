//! Routing performance benchmarks

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use siem_unified_pipeline::{
    config::PipelineConfig,
    ingestion::{Event, EventMetadata},
    routing::{RoutingEngine, RoutingRule},
};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::runtime::Runtime;
use uuid::Uuid;

/// Create a sample event for benchmarking
fn create_sample_event(index: usize, severity: &str, source: &str) -> Event {
    Event {
        id: Uuid::new_v4().to_string(),
        timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
        source: source.to_string(),
        event_type: "benchmark-event".to_string(),
        severity: severity.to_string(),
        message: format!("Benchmark routing event {}", index),
        raw_data: format!("{{\"user\": \"user{}\", \"action\": \"login\", \"ip\": \"192.168.1.{}\"}}", index, index % 255),
        parsed_data: serde_json::json!({
            "user": format!("user{}", index),
            "action": "login",
            "ip": format!("192.168.1.{}", index % 255),
            "severity": severity,
            "source": source
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

/// Benchmark simple field matching
fn bench_field_matching(c: &mut Criterion) {
    let events = vec![
        create_sample_event(1, "critical", "firewall"),
        create_sample_event(2, "warning", "application"),
        create_sample_event(3, "info", "system"),
        create_sample_event(4, "error", "database"),
        create_sample_event(5, "critical", "security"),
    ];
    
    c.bench_function("severity_matching", |b| {
        b.iter(|| {
            let critical_events: Vec<_> = events
                .iter()
                .filter(|event| event.severity == "critical")
                .collect();
            black_box(critical_events)
        })
    });
    
    c.bench_function("source_matching", |b| {
        b.iter(|| {
            let firewall_events: Vec<_> = events
                .iter()
                .filter(|event| event.source == "firewall")
                .collect();
            black_box(firewall_events)
        })
    });
}

/// Benchmark complex rule evaluation
fn bench_complex_rules(c: &mut Criterion) {
    let events = (0..1000)
        .map(|i| {
            let severities = ["info", "warning", "error", "critical"];
            let sources = ["firewall", "application", "system", "database", "security"];
            create_sample_event(
                i,
                severities[i % severities.len()],
                sources[i % sources.len()],
            )
        })
        .collect::<Vec<_>>();
    
    c.bench_function("complex_rule_evaluation", |b| {
        b.iter(|| {
            let matched_events: Vec<_> = events
                .iter()
                .filter(|event| {
                    // Complex rule: critical events from security or firewall sources
                    (event.severity == "critical" && 
                     (event.source == "security" || event.source == "firewall")) ||
                    // OR error events from database
                    (event.severity == "error" && event.source == "database") ||
                    // OR any event with specific IP pattern
                    event.parsed_data.get("ip")
                        .and_then(|v| v.as_str())
                        .map(|ip| ip.starts_with("192.168.1."))
                        .unwrap_or(false)
                })
                .collect();
            black_box(matched_events)
        })
    });
}

/// Benchmark regex-based routing
fn bench_regex_routing(c: &mut Criterion) {
    use regex::Regex;
    
    let ip_regex = Regex::new(r"^192\.168\.[0-9]{1,3}\.[0-9]{1,3}$").unwrap();
    let user_regex = Regex::new(r"^user[0-9]+$").unwrap();
    
    let events = (0..500)
        .map(|i| create_sample_event(i, "info", "application"))
        .collect::<Vec<_>>();
    
    c.bench_function("regex_ip_routing", |b| {
        b.iter(|| {
            let matched_events: Vec<_> = events
                .iter()
                .filter(|event| {
                    event.parsed_data.get("ip")
                        .and_then(|v| v.as_str())
                        .map(|ip| ip_regex.is_match(ip))
                        .unwrap_or(false)
                })
                .collect();
            black_box(matched_events)
        })
    });
    
    c.bench_function("regex_user_routing", |b| {
        b.iter(|| {
            let matched_events: Vec<_> = events
                .iter()
                .filter(|event| {
                    event.parsed_data.get("user")
                        .and_then(|v| v.as_str())
                        .map(|user| user_regex.is_match(user))
                        .unwrap_or(false)
                })
                .collect();
            black_box(matched_events)
        })
    });
}

/// Benchmark routing to multiple destinations
fn bench_multi_destination_routing(c: &mut Criterion) {
    let events = (0..200)
        .map(|i| {
            let severities = ["info", "warning", "error", "critical"];
            let sources = ["firewall", "application", "system"];
            create_sample_event(
                i,
                severities[i % severities.len()],
                sources[i % sources.len()],
            )
        })
        .collect::<Vec<_>>();
    
    c.bench_function("multi_destination_routing", |b| {
        b.iter(|| {
            let mut clickhouse_events = Vec::new();
            let mut splunk_events = Vec::new();
            let mut syslog_events = Vec::new();
            let mut alert_events = Vec::new();
            
            for event in &events {
                // Route to ClickHouse (all events)
                clickhouse_events.push(event);
                
                // Route to Splunk (warning and above)
                if matches!(event.severity.as_str(), "warning" | "error" | "critical") {
                    splunk_events.push(event);
                }
                
                // Route to Syslog (system events)
                if event.source == "system" {
                    syslog_events.push(event);
                }
                
                // Route to alerting (critical events)
                if event.severity == "critical" {
                    alert_events.push(event);
                }
            }
            
            black_box((clickhouse_events, splunk_events, syslog_events, alert_events))
        })
    });
}

/// Benchmark routing performance with large rule sets
fn bench_large_ruleset(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    
    // Create a large number of routing rules
    let rules: Vec<Box<dyn Fn(&Event) -> bool + Send + Sync>> = (0..100)
        .map(|i| {
            let rule_index = i;
            Box::new(move |event: &Event| {
                // Different rule types based on index
                match rule_index % 5 {
                    0 => event.severity == "critical",
                    1 => event.source.contains("firewall"),
                    2 => event.parsed_data.get("user")
                        .and_then(|v| v.as_str())
                        .map(|u| u.starts_with("admin"))
                        .unwrap_or(false),
                    3 => event.message.contains("login"),
                    _ => event.metadata.tags.contains(&"benchmark".to_string()),
                }
            }) as Box<dyn Fn(&Event) -> bool + Send + Sync>
        })
        .collect();
    
    let events = (0..50)
        .map(|i| create_sample_event(i, "info", "application"))
        .collect::<Vec<_>>();
    
    c.bench_function("large_ruleset_evaluation", |b| {
        b.to_async(&rt).iter(|| async {
            let mut matched_rules = Vec::new();
            
            for event in &events {
                for (rule_index, rule) in rules.iter().enumerate() {
                    if rule(event) {
                        matched_rules.push((rule_index, event));
                    }
                }
            }
            
            black_box(matched_rules)
        })
    });
}

/// Benchmark priority-based routing
fn bench_priority_routing(c: &mut Criterion) {
    let events = (0..300)
        .map(|i| {
            let severities = ["info", "warning", "error", "critical"];
            create_sample_event(i, severities[i % severities.len()], "mixed")
        })
        .collect::<Vec<_>>();
    
    c.bench_function("priority_routing", |b| {
        b.iter(|| {
            let mut high_priority = Vec::new();
            let mut medium_priority = Vec::new();
            let mut low_priority = Vec::new();
            
            for event in &events {
                match event.severity.as_str() {
                    "critical" => high_priority.push(event),
                    "error" => medium_priority.push(event),
                    "warning" => medium_priority.push(event),
                    _ => low_priority.push(event),
                }
            }
            
            // Sort by priority (high first)
            let mut all_events = Vec::new();
            all_events.extend(high_priority);
            all_events.extend(medium_priority);
            all_events.extend(low_priority);
            
            black_box(all_events)
        })
    });
}

criterion_group!(
    benches,
    bench_field_matching,
    bench_complex_rules,
    bench_regex_routing,
    bench_multi_destination_routing,
    bench_large_ruleset,
    bench_priority_routing
);
criterion_main!(benches);