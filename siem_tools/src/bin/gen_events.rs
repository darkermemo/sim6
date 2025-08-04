//! High-volume event generator for SIEM load testing
//! Produces 1 million synthetic events to Kafka topic 'siem_events'

use rdkafka::{config::ClientConfig, producer::FutureProducer};
use chrono::Utc;
use rand::{distributions::Alphanumeric, Rng};
use serde_json::json;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Starting event generator - producing 1M events to siem_events topic");
    
    // Create Kafka producer
    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", "localhost:9092")
        .set("message.timeout.ms", "5000")
        .create()
        .expect("Failed to create Kafka producer");

    let start_time = std::time::Instant::now();
    
    for i in 0..1_000_000u32 {
        let event_id = uuid::Uuid::new_v4();
        
        // Generate synthetic event with realistic fields
        let event_message = json!({
            "event_id": event_id,
            "tenant_id": format!("tenant-{}", i % 10),
            "event_timestamp": Utc::now().timestamp_millis(),
            "source_ip": format!("10.0.{}.{}", (i % 255) + 1, (i % 254) + 1),
            "destination_ip": format!("192.168.{}.{}", (i % 255) + 1, (i % 254) + 1),
            "source_port": 1024 + (i % 64512),
            "destination_port": 80 + (i % 10),
            "protocol": if i % 3 == 0 { "TCP" } else if i % 3 == 1 { "UDP" } else { "ICMP" },
            "action": if i % 4 == 0 { "allow" } else { "deny" },
            "event_type": "load_test",
            "event_category": "network",
            "event_outcome": "success",
            "event_action": "connection",
            "severity": match i % 4 {
                0 => "low",
                1 => "medium", 
                2 => "high",
                _ => "critical"
            },
            "message": format!("Load test event #{} - synthetic traffic", i),
            "raw_event": format!("firewall: connection from {} to {} port {}", 
                format!("10.0.{}.{}", (i % 255) + 1, (i % 254) + 1),
                format!("192.168.{}.{}", (i % 255) + 1, (i % 254) + 1),
                80 + (i % 10)
            ),
            "user_agent": rand::thread_rng()
                .sample_iter(&Alphanumeric)
                .take(12)
                .map(char::from)
                .collect::<String>()
        });

        // Send to Kafka
        let record = rdkafka::producer::FutureRecord::to("siem_events")
            .payload(&event_message.to_string())
            .key(&event_id.to_string());
            
        if let Err(e) = producer.send(record, tokio::time::Duration::from_secs(0)).await {
            eprintln!("Failed to send event {}: {:?}", i, e);
            continue;
        }

        // Progress reporting every 50k events
        if i % 50_000 == 0 && i > 0 {
            let elapsed = start_time.elapsed();
            let rate = i as f64 / elapsed.as_secs_f64();
            println!("Sent {} events ({:.0} events/sec)", i, rate);
        }
        
        // Small delay to avoid overwhelming Kafka
        sleep(Duration::from_millis(1)).await;
    }

    let total_time = start_time.elapsed();
    let final_rate = 1_000_000.0 / total_time.as_secs_f64();
    println!("\nCompleted! Sent 1,000,000 events in {:.2}s ({:.0} events/sec)", 
             total_time.as_secs_f64(), final_rate);
    
    Ok(())
}