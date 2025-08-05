# Immediate Fix for 99.94% Parsing Failure

## Quick Diagnosis Tool

First, run this to see what's actually in your Kafka messages:

```bash
# Sample 10 messages from Kafka to see their structure
kafkacat -C -b localhost:9092 -t ingest-events -o -10 -e | head -10 > sample_messages.json

# Or use the consumer to dump raw payloads
```

## Immediate Fix Options

### Option 1: Quick Patch (Minimal Code Change)

Replace your current `KafkaMessage` struct in `siem_consumer/src/models.rs`:

```rust
#[derive(Debug, Deserialize)]
pub struct KafkaMessage {
    pub event_id: String,
    pub tenant_id: String,
    
    // This will accept either "timestamp" OR "event_timestamp"
    #[serde(alias = "timestamp", default = "default_timestamp")]
    pub event_timestamp: u32,
    
    pub source_ip: String,
    
    #[serde(default = "default_source_type")]
    pub source_type: String,
    
    // Accept multiple variations of raw event field
    #[serde(alias = "raw_message", alias = "raw_log", alias = "message", default)]
    pub raw_event: String,
    
    #[serde(default = "default_event_category")]
    pub event_category: String,
    
    #[serde(default = "default_event_outcome")]
    pub event_outcome: String,
    
    #[serde(default = "default_event_action")]
    pub event_action: String,
    
    #[serde(default)]
    pub is_threat: u8,
}

// Add this default function
fn default_timestamp() -> u32 {
    // Use current time as fallback
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as u32
}
```

### Option 2: Dual-Format Support (More Robust)

Add this to your `process_message` function in `siem_consumer/src/main.rs`:

```rust
// Try parsing with flexible format detection
fn parse_kafka_message(payload_str: &str) -> Result<KafkaMessage> {
    // First try standard parsing
    if let Ok(msg) = serde_json::from_str::<KafkaMessage>(payload_str) {
        return Ok(msg);
    }
    
    // If that fails, try to parse as generic JSON and transform
    let value: serde_json::Value = serde_json::from_str(payload_str)
        .map_err(|e| ConsumerError::Json(e))?;
    
    // Extract fields manually
    let obj = value.as_object()
        .ok_or_else(|| ConsumerError::Config("Invalid JSON object".to_string()))?;
    
    // Build KafkaMessage from available fields
    Ok(KafkaMessage {
        event_id: obj.get("event_id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        
        tenant_id: obj.get("tenant_id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        
        // Try multiple timestamp field names
        event_timestamp: obj.get("event_timestamp")
            .or_else(|| obj.get("timestamp"))
            .or_else(|| obj.get("time"))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
            .unwrap_or_else(|| {
                warn!("No timestamp found in message, using current time");
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as u32
            }),
        
        source_ip: obj.get("source_ip")
            .and_then(|v| v.as_str())
            .unwrap_or("0.0.0.0")
            .to_string(),
        
        // ... continue for other fields
    })
}
```

### Option 3: Add Debug Logging (Diagnose First)

Add this to your `process_message` function to see what's failing:

```rust
let kafka_msg: KafkaMessage = match serde_json::from_str(payload_str) {
    Ok(msg) => msg,
    Err(e) => {
        // Enhanced error logging
        error!("Failed to deserialize Kafka message: {}", e);
        
        // Log first 500 chars of payload for debugging
        let sample = if payload_str.len() > 500 {
            &payload_str[..500]
        } else {
            payload_str
        };
        error!("Payload sample: {}", sample);
        
        // Try to identify the issue
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload_str) {
            if let Some(obj) = value.as_object() {
                error!("Available fields: {:?}", obj.keys().collect::<Vec<_>>());
                
                // Check for timestamp fields
                let has_event_timestamp = obj.contains_key("event_timestamp");
                let has_timestamp = obj.contains_key("timestamp");
                error!("has_event_timestamp: {}, has_timestamp: {}", 
                       has_event_timestamp, has_timestamp);
            }
        }
        
        return Err(ConsumerError::Json(e));
    }
};
```

## Testing the Fix

1. **Create a test producer with both formats:**

```python
import json
import time
from kafka import KafkaProducer

producer = KafkaProducer(
    bootstrap_servers=['localhost:9092'],
    value_serializer=lambda v: json.dumps(v).encode('utf-8')
)

# Test with "timestamp" field
test_event_1 = {
    "event_id": "test-timestamp-field",
    "tenant_id": "tenant-A",
    "timestamp": int(time.time()),
    "source_ip": "192.168.1.1",
    "raw_event": "Test with timestamp field"
}

# Test with "event_timestamp" field
test_event_2 = {
    "event_id": "test-event-timestamp-field",
    "tenant_id": "tenant-A",
    "event_timestamp": int(time.time()),
    "source_ip": "192.168.1.2",
    "raw_event": "Test with event_timestamp field"
}

producer.send('ingest-events', test_event_1)
producer.send('ingest-events', test_event_2)
producer.flush()
print("Sent test events")
```

2. **Monitor the fix:**

```bash
# Watch consumer logs
tail -f consumer.log | grep -E "(Failed to deserialize|Successfully parsed)"

# Check metrics
watch -n 1 'curl -s localhost:3001/metrics | jq .'
```

## Verification Steps

1. Apply one of the fixes above
2. Restart the consumer
3. Send test messages
4. Check if PARSED metric increases
5. Verify data in ClickHouse:

```sql
SELECT count(*) FROM dev.events WHERE event_id LIKE 'test-%';
```

## Emergency Workaround

If you need data flowing NOW while debugging:

```rust
// In process_message, replace the strict parsing with lenient parsing
let kafka_msg = match serde_json::from_str::<serde_json::Value>(payload_str) {
    Ok(json) => {
        // Manually construct KafkaMessage from JSON
        // This is ugly but will get data flowing
        KafkaMessage {
            event_id: json["event_id"].as_str().unwrap_or("unknown").to_string(),
            tenant_id: json["tenant_id"].as_str().unwrap_or("unknown").to_string(),
            event_timestamp: json.get("timestamp")
                .or_else(|| json.get("event_timestamp"))
                .and_then(|v| v.as_u64())
                .map(|v| v as u32)
                .unwrap_or(0),
            // ... continue for all fields
        }
    }
    Err(e) => return Err(ConsumerError::Json(e)),
};
```

This will get your data flowing while you implement a proper fix.