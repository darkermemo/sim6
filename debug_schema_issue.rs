use serde::{Deserialize, Serialize};
use serde_json;

// Test struct matching your KafkaMessage
#[derive(Debug, Deserialize)]
pub struct TestKafkaMessage {
    pub event_id: String,
    pub tenant_id: String,
    #[serde(alias = "timestamp")]
    pub event_timestamp: u32,
    pub source_ip: String,
    #[serde(default)]
    pub raw_event: String,
}

fn main() {
    // Test Case 1: Message with "timestamp" field
    let json_with_timestamp = r#"{
        "event_id": "test-1",
        "tenant_id": "tenant-A",
        "timestamp": 1234567890,
        "source_ip": "192.168.1.1",
        "raw_event": "Test event"
    }"#;

    // Test Case 2: Message with "event_timestamp" field
    let json_with_event_timestamp = r#"{
        "event_id": "test-2",
        "tenant_id": "tenant-A",
        "event_timestamp": 1234567890,
        "source_ip": "192.168.1.1",
        "raw_event": "Test event"
    }"#;

    // Test Case 3: Message with neither (error case)
    let json_missing_timestamp = r#"{
        "event_id": "test-3",
        "tenant_id": "tenant-A",
        "source_ip": "192.168.1.1",
        "raw_event": "Test event"
    }"#;

    // Test parsing
    println!("Test 1 - 'timestamp' field:");
    match serde_json::from_str::<TestKafkaMessage>(json_with_timestamp) {
        Ok(msg) => println!("✅ Success: {:?}", msg),
        Err(e) => println!("❌ Failed: {}", e),
    }

    println!("\nTest 2 - 'event_timestamp' field:");
    match serde_json::from_str::<TestKafkaMessage>(json_with_event_timestamp) {
        Ok(msg) => println!("✅ Success: {:?}", msg),
        Err(e) => println!("❌ Failed: {}", e),
    }

    println!("\nTest 3 - Missing timestamp:");
    match serde_json::from_str::<TestKafkaMessage>(json_missing_timestamp) {
        Ok(msg) => println!("✅ Success: {:?}", msg),
        Err(e) => println!("❌ Failed: {}", e),
    }

    // Test with actual failing payload structure
    let actual_failing_json = r#"{
        "timestamp": 1234567890,
        "event_id": "550e8400-e29b-41d4-a716-446655440000",
        "source_ip": "10.0.0.1",
        "raw_event": "User login attempt",
        "tenant_id": "tenant-123"
    }"#;

    println!("\nTest 4 - Actual failing structure:");
    match serde_json::from_str::<TestKafkaMessage>(actual_failing_json) {
        Ok(msg) => println!("✅ Success: {:?}", msg),
        Err(e) => {
            println!("❌ Failed: {}", e);
            
            // Try to parse as generic JSON to see structure
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(actual_failing_json) {
                println!("Raw JSON structure: {}", serde_json::to_string_pretty(&value).unwrap());
            }
        }
    }
}