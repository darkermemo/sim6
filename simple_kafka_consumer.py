#!/usr/bin/env python3
"""
Simple Kafka Consumer to process events from ingest-events topic
and write them to ClickHouse dev.events table.

This script processes the backlog of 1M+ events that are stuck in Kafka.
"""

import json
import time
import requests
from kafka import KafkaConsumer
from datetime import datetime
import sys

# Configuration
KAFKA_BOOTSTRAP_SERVERS = ['localhost:9092']
KAFKA_TOPIC = 'ingest-events'
KAFKA_GROUP_ID = 'simple_clickhouse_writer'
CLICKHOUSE_URL = 'http://localhost:8123'
CLICKHOUSE_DB = 'dev'
CLICKHOUSE_TABLE = 'events'
BATCH_SIZE = 1000

def create_consumer():
    """Create Kafka consumer"""
    return KafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=KAFKA_GROUP_ID,
        auto_offset_reset='earliest',
        enable_auto_commit=False,
        value_deserializer=lambda x: json.loads(x.decode('utf-8'))
    )

def write_batch_to_clickhouse(events):
    """Write a batch of events to ClickHouse"""
    if not events:
        return True
    
    # Prepare INSERT query
    query = f"INSERT INTO {CLICKHOUSE_DB}.{CLICKHOUSE_TABLE} FORMAT JSONEachRow"
    
    # Convert events to ClickHouse format
    clickhouse_events = []
    for event in events:
        # Map Kafka message to ClickHouse schema
        ch_event = {
            'event_id': event.get('event_id', f"auto_{int(time.time() * 1000000)}"),
            'tenant_id': event.get('tenant_id', 'default'),
            'event_timestamp': event.get('timestamp', int(time.time())),
            'source_ip': event.get('source_ip', '0.0.0.0'),
            'source_type': event.get('source_type', 'Unknown'),
            'raw_event': event.get('raw_log', json.dumps(event)),
            'event_category': event.get('event_category', 'Unknown'),
            'event_outcome': event.get('event_outcome', 'Unknown'),
            'event_action': event.get('event_action', 'Unknown'),
            'is_threat': event.get('is_threat', 0),
            'ingestion_time': int(time.time())
        }
        clickhouse_events.append(ch_event)
    
    # Prepare data for ClickHouse
    data = '\n'.join(json.dumps(event) for event in clickhouse_events)
    
    try:
        response = requests.post(
            CLICKHOUSE_URL,
            params={'query': query},
            data=data,
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        if response.status_code == 200:
            print(f"✅ Successfully wrote {len(events)} events to ClickHouse")
            return True
        else:
            print(f"❌ ClickHouse error: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error writing to ClickHouse: {e}")
        return False

def main():
    """Main consumer loop"""
    print("🚀 Starting Simple Kafka Consumer")
    print(f"📊 Configuration:")
    print(f"   Kafka: {KAFKA_BOOTSTRAP_SERVERS}")
    print(f"   Topic: {KAFKA_TOPIC}")
    print(f"   Group: {KAFKA_GROUP_ID}")
    print(f"   ClickHouse: {CLICKHOUSE_URL}")
    print(f"   Batch Size: {BATCH_SIZE}")
    print()
    
    # Test ClickHouse connection
    try:
        response = requests.get(f"{CLICKHOUSE_URL}/?query=SELECT 1")
        if response.status_code != 200:
            print(f"❌ ClickHouse not available: {response.status_code}")
            sys.exit(1)
        print("✅ ClickHouse connection verified")
    except Exception as e:
        print(f"❌ Cannot connect to ClickHouse: {e}")
        sys.exit(1)
    
    # Create consumer
    try:
        consumer = create_consumer()
        print("✅ Kafka consumer created")
    except Exception as e:
        print(f"❌ Failed to create Kafka consumer: {e}")
        sys.exit(1)
    
    # Processing loop
    batch = []
    processed_count = 0
    error_count = 0
    start_time = time.time()
    
    try:
        print("🔄 Starting to consume messages...")
        
        for message in consumer:
            try:
                event = message.value
                batch.append(event)
                
                # Process batch when full
                if len(batch) >= BATCH_SIZE:
                    if write_batch_to_clickhouse(batch):
                        processed_count += len(batch)
                        consumer.commit()
                        
                        # Progress update
                        elapsed = time.time() - start_time
                        rate = processed_count / elapsed if elapsed > 0 else 0
                        print(f"📈 Processed: {processed_count:,} events | Rate: {rate:.1f} events/sec | Errors: {error_count}")
                    else:
                        error_count += len(batch)
                        print(f"⚠️ Failed to write batch of {len(batch)} events")
                    
                    batch = []
                    
            except Exception as e:
                print(f"❌ Error processing message: {e}")
                error_count += 1
                continue
                
    except KeyboardInterrupt:
        print("\n🛑 Received interrupt signal")
    except Exception as e:
        print(f"❌ Consumer error: {e}")
    finally:
        # Process remaining batch
        if batch:
            print(f"🔄 Processing final batch of {len(batch)} events...")
            if write_batch_to_clickhouse(batch):
                processed_count += len(batch)
                consumer.commit()
        
        consumer.close()
        
        # Final statistics
        elapsed = time.time() - start_time
        print(f"\n📊 Final Statistics:")
        print(f"   Total Processed: {processed_count:,} events")
        print(f"   Total Errors: {error_count:,}")
        print(f"   Total Time: {elapsed:.1f} seconds")
        print(f"   Average Rate: {processed_count / elapsed:.1f} events/sec")
        print("\n✅ Consumer stopped")

if __name__ == '__main__':
    main()