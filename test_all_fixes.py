#!/usr/bin/env python3
"""
Comprehensive test script to verify all SIEM fixes are working
"""
import json
import time
import subprocess
import requests
from kafka import KafkaProducer
import sys

def test_consumer_metrics():
    """Test that consumer metrics are working with error categorization"""
    print("\n🔍 Testing Consumer Metrics...")
    
    try:
        response = requests.get("http://localhost:9091/metrics")
        metrics = response.json()
        
        print(f"✅ Metrics endpoint accessible")
        print(f"   Processed: {metrics.get('processed', 0)}")
        print(f"   Parsed: {metrics.get('parsed', 0)}")
        print(f"   Queued: {metrics.get('queued', 0)}")
        
        # Check for new error categorization
        if 'errors' in metrics:
            errors = metrics['errors']
            print(f"   Error Breakdown:")
            print(f"     - Schema Errors: {errors.get('schema', 0)}")
            print(f"     - Parse Errors: {errors.get('parse', 0)}")  
            print(f"     - Validation Errors: {errors.get('validation', 0)}")
            print(f"     - ClickHouse Errors: {errors.get('clickhouse', 0)}")
            print(f"     - DLQ Sent: {errors.get('dlq_sent', 0)}")
        
        if 'rates' in metrics:
            rates = metrics['rates']
            print(f"   Success Rate: {rates.get('success_rate', 0):.2f}%")
            print(f"   Error Rate: {rates.get('error_rate', 0):.2f}%")
        
        return True
    except Exception as e:
        print(f"❌ Failed to get metrics: {e}")
        return False

def test_schema_fix():
    """Test that schema fix is working (both timestamp formats)"""
    print("\n🔍 Testing Schema Fix...")
    
    producer = KafkaProducer(
        bootstrap_servers=['localhost:9092'],
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )
    
    # Test with "timestamp" field (legacy format)
    test_event_1 = {
        "event_id": f"schema-test-timestamp-{int(time.time())}",
        "tenant_id": "tenant-A",
        "timestamp": int(time.time()),  # This should work now
        "source_ip": "192.168.1.100",
        "raw_event": "Schema fix test with timestamp field"
    }
    
    # Test with "event_timestamp" field (standard format)
    test_event_2 = {
        "event_id": f"schema-test-event-timestamp-{int(time.time())}",
        "tenant_id": "tenant-A", 
        "event_timestamp": int(time.time()),
        "source_ip": "192.168.1.101",
        "raw_event": "Schema fix test with event_timestamp field"
    }
    
    # Test with missing timestamp (should use default)
    test_event_3 = {
        "event_id": f"schema-test-no-timestamp-{int(time.time())}",
        "tenant_id": "tenant-A",
        "source_ip": "192.168.1.102",
        "raw_event": "Schema fix test with no timestamp field"
    }
    
    # Send test events
    producer.send('ingest-events', test_event_1)
    producer.send('ingest-events', test_event_2)
    producer.send('ingest-events', test_event_3)
    producer.flush()
    
    print("✅ Sent 3 test events with different timestamp formats")
    
    # Wait for processing
    time.sleep(3)
    
    # Check metrics to see if they were parsed
    response = requests.get("http://localhost:9091/metrics")
    metrics = response.json()
    
    initial_parsed = metrics.get('parsed', 0)
    initial_processed = metrics.get('processed', 0)
    
    print(f"   After sending: Processed={initial_processed}, Parsed={initial_parsed}")
    
    if 'rates' in metrics:
        success_rate = metrics['rates'].get('success_rate', 0)
        if success_rate > 50:
            print(f"✅ Schema fix working! Success rate: {success_rate:.2f}%")
            return True
        else:
            print(f"⚠️  Low success rate: {success_rate:.2f}%")
    
    return False

def test_clickhouse_data():
    """Verify data is being written to ClickHouse"""
    print("\n🔍 Testing ClickHouse Data...")
    
    try:
        # Query ClickHouse for recent events
        query = "SELECT count() as total FROM dev.events WHERE event_timestamp > now() - INTERVAL 5 MINUTE FORMAT JSON"
        response = requests.get(
            "http://localhost:8123/",
            params={"query": query}
        )
        
        if response.status_code == 200:
            result = response.json()
            if 'data' in result and len(result['data']) > 0:
                count = int(result['data'][0]['total'])
                print(f"✅ ClickHouse has {count} recent events")
                return count > 0
        
        print("❌ Failed to query ClickHouse")
        return False
    except Exception as e:
        print(f"❌ ClickHouse error: {e}")
        return False

def test_api_endpoints():
    """Test that API cache endpoints are accessible"""
    print("\n🔍 Testing API Endpoints...")
    
    endpoints = [
        "/api/v1/log_sources/cache",
        "/api/v1/taxonomy/mappings/all", 
        "/api/v1/parsers/all"
    ]
    
    all_good = True
    for endpoint in endpoints:
        try:
            response = requests.get(f"http://localhost:8080{endpoint}")
            if response.status_code < 500:
                print(f"✅ {endpoint} - Status: {response.status_code}")
            else:
                print(f"❌ {endpoint} - Error: {response.status_code}")
                all_good = False
        except Exception as e:
            print(f"❌ {endpoint} - Failed: {e}")
            all_good = False
    
    return all_good

def check_security_vulnerabilities():
    """Check if h2 vulnerability is fixed"""
    print("\n🔍 Checking Security Vulnerabilities...")
    
    try:
        result = subprocess.run(
            ["cargo", "audit", "--json"],
            capture_output=True,
            text=True
        )
        
        audit_data = json.loads(result.stdout)
        vulnerabilities = audit_data.get('vulnerabilities', {}).get('found', False)
        
        if not vulnerabilities:
            print("✅ No vulnerabilities found")
            return True
        else:
            print("⚠️  Vulnerabilities still present (h2 0.2.7 requires dependency updates)")
            return False
    except Exception as e:
        print(f"⚠️  Could not run cargo audit: {e}")
        return False

def main():
    """Run all tests"""
    print("=" * 60)
    print("SIEM Fix Verification Test Suite")
    print("=" * 60)
    
    tests = [
        ("Consumer Metrics", test_consumer_metrics),
        ("Schema Fix", test_schema_fix),
        ("ClickHouse Data", test_clickhouse_data),
        ("API Endpoints", test_api_endpoints),
        ("Security Audit", check_security_vulnerabilities)
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} failed with error: {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name:.<40} {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All fixes are working correctly!")
        sys.exit(0)
    else:
        print("\n⚠️  Some fixes need attention")
        sys.exit(1)

if __name__ == "__main__":
    main()