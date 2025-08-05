#!/usr/bin/env python3
"""
Simple Kafka Producer to send test events to ingest-events topic
for testing the SIEM consumer metrics accuracy.
"""

import json
import time
from kafka import KafkaProducer
from datetime import datetime
import uuid

# Configuration
KAFKA_BOOTSTRAP_SERVERS = ['localhost:9092']
KAFKA_TOPIC = 'ingest-events'

def create_producer():
    """Create Kafka producer"""
    return KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda x: json.dumps(x).encode('utf-8')
    )

def send_test_events(count=5):
    """Send test events to Kafka"""
    producer = create_producer()
    
    print(f"Sending {count} test events to topic '{KAFKA_TOPIC}'...")
    
    for i in range(count):
        event = {
            "event_id": str(uuid.uuid4()),
            "tenant_id": "test-tenant",
            "event_timestamp": int(time.time()),
            "source_ip": f"192.168.1.{100 + i}",
            "source_type": "test",
            "raw_event": f"Test event #{i+1} - metrics validation",
            "event_category": "test",
            "event_outcome": "success",
            "event_action": "test",
            "is_threat": 0
        }
        
        # Send event
        future = producer.send(KAFKA_TOPIC, event)
        result = future.get(timeout=10)
        
        print(f"✅ Sent event {i+1}: {event['event_id']}")
        
        # Small delay between events
        time.sleep(0.1)
    
    producer.flush()
    producer.close()
    print(f"\n🎉 Successfully sent {count} events to Kafka topic '{KAFKA_TOPIC}'")
    print("\n⏰ Waiting 6 seconds for batch timeout to trigger flush...")
    time.sleep(6)
    print("\n📊 Check metrics now at: http://localhost:9091/metrics")

if __name__ == '__main__':
    send_test_events()