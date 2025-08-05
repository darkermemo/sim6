#!/usr/bin/env python3
"""
Batch Kafka Producer to test SIEM consumer batch processing
Sends exactly 1000 events to trigger batch size threshold
"""

import json
import time
from kafka import KafkaProducer
from datetime import datetime
import uuid

# Configuration
KAFKA_BOOTSTRAP_SERVERS = ['localhost:9092']
KAFKA_TOPIC = 'ingest-events'
BATCH_SIZE = 1000  # Match consumer's DEFAULT_BATCH_SIZE

def create_producer():
    """Create Kafka producer"""
    return KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda x: json.dumps(x).encode('utf-8'),
        batch_size=16384,  # Optimize for batch sending
        linger_ms=10       # Small delay to batch messages
    )

def send_batch_events(count=BATCH_SIZE):
    """Send batch of test events to Kafka"""
    producer = create_producer()
    
    print(f"📦 Sending {count} test events to topic '{KAFKA_TOPIC}' to trigger batch processing...")
    
    # Get baseline metrics
    import requests
    try:
        baseline = requests.get('http://localhost:9090/metrics').json()
        print(f"📊 Baseline - Processed: {baseline['processed']}, Parsed: {baseline['parsed']}")
    except:
        print("⚠️ Could not get baseline metrics")
        baseline = None
    
    start_time = time.time()
    
    for i in range(count):
        event = {
            "event_id": str(uuid.uuid4()),
            "tenant_id": "batch-test-tenant",
            "event_timestamp": int(time.time()),
            "source_ip": f"10.0.{(i // 256) % 256}.{i % 256}",
            "source_type": "batch_test",
            "raw_event": f"Batch test event #{i+1} - testing batch size threshold",
            "event_category": "test",
            "event_outcome": "success",
            "event_action": "batch_test",
            "is_threat": 0
        }
        
        # Send event (async)
        producer.send(KAFKA_TOPIC, event)
        
        # Progress indicator
        if (i + 1) % 100 == 0:
            print(f"📤 Sent {i+1}/{count} events...")
    
    # Ensure all messages are sent
    producer.flush()
    producer.close()
    
    send_time = time.time() - start_time
    print(f"\n✅ Successfully sent {count} events in {send_time:.2f} seconds")
    print(f"📈 Rate: {count/send_time:.0f} events/second")
    
    # Wait a moment for processing
    print("\n⏳ Waiting 3 seconds for batch processing...")
    time.sleep(3)
    
    # Check updated metrics
    try:
        updated = requests.get('http://localhost:9090/metrics').json()
        print(f"\n📊 Updated Metrics:")
        print(f"   Processed: {updated['processed']} (+{updated['processed'] - baseline['processed'] if baseline else 'N/A'})")
        print(f"   Parsed: {updated['parsed']} (+{updated['parsed'] - baseline['parsed'] if baseline else 'N/A'})")
        print(f"   Queued: {updated['queued']}")
        
        if baseline:
            parsed_increase = updated['parsed'] - baseline['parsed']
            if parsed_increase >= count:
                print(f"\n🎉 SUCCESS: Parsed count increased by {parsed_increase} (expected: {count})")
            else:
                print(f"\n⚠️ PARTIAL: Parsed count increased by {parsed_increase} (expected: {count})")
                print("   This might be due to batching - events may still be in buffer")
        
    except Exception as e:
        print(f"❌ Error getting updated metrics: {e}")

if __name__ == '__main__':
    send_batch_events()