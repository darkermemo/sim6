#!/usr/bin/env python3
"""
Enhanced SIEM Integration Test
Tests the complete pipeline with enhanced parser integration
"""

import json
import requests
import time
import subprocess
import sys
from datetime import datetime
from typing import Dict, List
import uuid

class EnhancedIntegrationTest:
    def __init__(self):
        self.kafka_producer_cmd = ["kafkacat", "-P", "-b", "localhost:9092", "-t", "ingest-events"]
        self.test_results = {
            "test_start": datetime.now().isoformat(),
            "pipeline_tests": {},
            "parser_tests": {},
            "search_tests": {},
            "performance_tests": {},
            "overall_status": "running"
        }
        
    def send_test_event_to_kafka(self, event_data: str, event_type: str = "test") -> bool:
        """Send a test event to Kafka"""
        try:
            process = subprocess.Popen(
                self.kafka_producer_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            stdout, stderr = process.communicate(input=event_data)
            
            if process.returncode == 0:
                print(f"✅ Sent {event_type} event to Kafka")
                return True
            else:
                print(f"❌ Failed to send {event_type} event: {stderr}")
                return False
                
        except Exception as e:
            print(f"❌ Error sending event to Kafka: {e}")
            return False
    
    def wait_for_processing(self, seconds: int = 3):
        """Wait for events to be processed"""
        print(f"⏳ Waiting {seconds}s for processing...")
        time.sleep(seconds)
    
    def check_consumer_metrics(self) -> Dict:
        """Get consumer metrics"""
        try:
            response = requests.get("http://localhost:9091/metrics", timeout=5)
            if response.status_code == 200:
                return response.json()
            else:
                print(f"⚠️ Consumer metrics returned status {response.status_code}")
                return {}
        except Exception as e:
            print(f"❌ Failed to get consumer metrics: {e}")
            return {}
    
    def check_clickhouse_events(self, min_expected: int = 1) -> Dict:
        """Check ClickHouse for recent events"""
        try:
            # Use clickhouse client to check recent events
            cmd = [
                "clickhouse", "client", "--query",
                f"SELECT count() as total, countIf(ingestion_timestamp > now() - 60) as recent FROM dev.events FORMAT JSON"
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                if data.get("data"):
                    stats = data["data"][0]
                    print(f"📊 ClickHouse: {stats['total']} total events, {stats['recent']} recent")
                    return {
                        "total_events": stats["total"],
                        "recent_events": stats["recent"],
                        "meets_minimum": stats["recent"] >= min_expected
                    }
            
            print(f"⚠️ ClickHouse query failed: {result.stderr}")
            return {"total_events": 0, "recent_events": 0, "meets_minimum": False}
            
        except Exception as e:
            print(f"❌ ClickHouse check failed: {e}")
            return {"total_events": 0, "recent_events": 0, "meets_minimum": False}
    
    def test_enhanced_parsers(self) -> Dict:
        """Test all enhanced parser formats"""
        print("\n🧪 Testing Enhanced Parser Formats")
        print("=" * 50)
        
        test_logs = {
            "ecs_json": {
                "@timestamp": "2025-01-21T20:30:00.000Z",
                "event": {
                    "category": "authentication",
                    "action": "login",
                    "outcome": "success"
                },
                "source": {"ip": "192.168.1.100", "port": 54321},
                "destination": {"ip": "10.0.1.50", "port": 443},
                "user": {"name": "testuser"},
                "host": {"name": "testhost"},
                "message": "ECS format authentication success"
            },
            
            "splunk_cim": {
                "_time": int(time.time()),
                "sourcetype": "authentication",
                "src": "192.168.1.101",
                "dest": "10.0.1.51", 
                "user": "admin",
                "action": "success",
                "app": "web",
                "severity": "informational",
                "message": "Splunk CIM authentication event"
            },
            
            "windows_event": {
                "EventID": 4624,
                "Computer": "WIN-TEST01",
                "TimeCreated": {"SystemTime": "2025-01-21T20:30:00.000Z"},
                "EventData": {
                    "TargetUserName": "testuser",
                    "IpAddress": "192.168.1.102",
                    "LogonType": 2
                },
                "Message": "Windows authentication success"
            },
            
            "key_value": "timestamp=2025-01-21T20:30:00Z src_ip=192.168.1.103 dst_ip=10.0.1.52 src_port=12345 dst_port=80 protocol=TCP action=ALLOW user=kvuser message=Key-value_test_event",
            
            "generic_json": {
                "timestamp": "2025-01-21T20:30:00.000Z",
                "level": "INFO",
                "source_ip": "192.168.1.104",
                "user_id": "12345",
                "method": "POST",
                "url": "/api/test",
                "status_code": 200,
                "message": "Generic JSON test event"
            }
        }
        
        results = {}
        total_sent = 0
        
        for format_name, log_data in test_logs.items():
            print(f"  📝 Testing {format_name}...")
            
            # Convert to JSON string if it's a dict
            if isinstance(log_data, dict):
                event_json = json.dumps(log_data)
            else:
                event_json = str(log_data)
            
            # Send to Kafka
            success = self.send_test_event_to_kafka(event_json, format_name)
            results[format_name] = {"sent": success}
            
            if success:
                total_sent += 1
        
        self.wait_for_processing(5)
        
        # Check if events were processed
        metrics = self.check_consumer_metrics()
        clickhouse_stats = self.check_clickhouse_events(total_sent)
        
        results["summary"] = {
            "total_formats_tested": len(test_logs),
            "events_sent": total_sent,
            "consumer_metrics": metrics,
            "clickhouse_stats": clickhouse_stats,
            "pipeline_working": clickhouse_stats.get("meets_minimum", False)
        }
        
        return results
    
    def test_search_capabilities(self) -> Dict:
        """Test search functionality"""
        print("\n🔍 Testing Search Capabilities")
        print("=" * 50)
        
        search_tests = [
            {
                "name": "Raw text search",
                "query": "SELECT count() FROM dev.events WHERE raw_event LIKE '%test%'",
                "expected_min": 1
            },
            {
                "name": "IP address filter",
                "query": "SELECT count() FROM dev.events WHERE source_ip LIKE '192.168.1.%'",
                "expected_min": 1
            },
            {
                "name": "Recent events",
                "query": "SELECT count() FROM dev.events WHERE ingestion_timestamp > now() - 300",
                "expected_min": 1
            },
            {
                "name": "JSON field search",
                "query": "SELECT count() FROM dev.events WHERE raw_event LIKE '%authentication%'",
                "expected_min": 1
            }
        ]
        
        results = {}
        
        for test in search_tests:
            print(f"  🔍 {test['name']}...")
            
            try:
                cmd = ["clickhouse", "client", "--query", f"{test['query']} FORMAT JSON"]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                
                if result.returncode == 0:
                    data = json.loads(result.stdout)
                    if data.get("data"):
                        count = data["data"][0]["count()"]
                        success = count >= test["expected_min"]
                        status = "✅" if success else "❌"
                        print(f"    {status} Found {count} results (expected: {test['expected_min']}+)")
                        
                        results[test["name"]] = {
                            "count": count,
                            "expected_min": test["expected_min"],
                            "success": success,
                            "query": test["query"]
                        }
                    else:
                        results[test["name"]] = {"error": "No data returned", "success": False}
                else:
                    results[test["name"]] = {"error": result.stderr, "success": False}
                    
            except Exception as e:
                results[test["name"]] = {"error": str(e), "success": False}
        
        return results
    
    def test_dashboard_accessibility(self) -> Dict:
        """Test dashboard and API accessibility"""
        print("\n📊 Testing Dashboard & API Accessibility")
        print("=" * 50)
        
        endpoints = [
            {"name": "Consumer Metrics", "url": "http://localhost:9091/metrics"},
            {"name": "Consumer Dashboard", "url": "http://localhost:9091/dashboard"},
            {"name": "HTML Backend Events", "url": "http://localhost:8081/events"},
            {"name": "HTML Backend Dashboard", "url": "http://localhost:8081/dev/metrics/live"}
        ]
        
        results = {}
        
        for endpoint in endpoints:
            print(f"  🌐 Testing {endpoint['name']}...")
            
            try:
                response = requests.get(endpoint["url"], timeout=10)
                success = response.status_code == 200
                status = "✅" if success else "❌"
                
                print(f"    {status} Status: {response.status_code}")
                
                results[endpoint["name"]] = {
                    "url": endpoint["url"],
                    "status_code": response.status_code,
                    "success": success,
                    "response_size": len(response.content) if success else 0
                }
                
            except Exception as e:
                print(f"    ❌ Error: {e}")
                results[endpoint["name"]] = {
                    "url": endpoint["url"],
                    "error": str(e),
                    "success": False
                }
        
        return results
    
    def run_performance_test(self) -> Dict:
        """Run performance test with multiple events"""
        print("\n⚡ Running Performance Test")
        print("=" * 50)
        
        # Get baseline metrics
        print("  📊 Getting baseline metrics...")
        baseline_metrics = self.check_consumer_metrics()
        baseline_clickhouse = self.check_clickhouse_events()
        
        # Send batch of events
        batch_size = 10
        print(f"  📦 Sending batch of {batch_size} events...")
        
        sent_count = 0
        for i in range(batch_size):
            test_event = {
                "timestamp": datetime.now().isoformat(),
                "event_id": str(uuid.uuid4()),
                "test_batch": True,
                "batch_index": i,
                "source_ip": f"192.168.100.{i+1}",
                "message": f"Performance test event {i+1}/{batch_size}"
            }
            
            if self.send_test_event_to_kafka(json.dumps(test_event), f"perf_test_{i}"):
                sent_count += 1
        
        # Wait and measure
        print("  ⏳ Waiting for processing...")
        time.sleep(8)  # Longer wait for batch processing
        
        # Get final metrics
        final_metrics = self.check_consumer_metrics()
        final_clickhouse = self.check_clickhouse_events()
        
        # Calculate performance
        events_processed = final_clickhouse.get("recent_events", 0) - baseline_clickhouse.get("recent_events", 0)
        processing_success_rate = (events_processed / sent_count * 100) if sent_count > 0 else 0
        
        results = {
            "events_sent": sent_count,
            "events_processed": events_processed,
            "processing_success_rate": processing_success_rate,
            "baseline_metrics": baseline_metrics,
            "final_metrics": final_metrics,
            "performance_acceptable": processing_success_rate >= 80
        }
        
        print(f"  📈 Results: {events_processed}/{sent_count} processed ({processing_success_rate:.1f}% success)")
        
        return results
    
    def run_comprehensive_test(self):
        """Run the complete integration test suite"""
        print("🚀 Enhanced SIEM Integration Test")
        print("=" * 60)
        print(f"Start Time: {datetime.now().isoformat()}")
        print()
        
        # Test 1: Enhanced Parser Integration
        print("Phase 1: Enhanced Parser Integration")
        self.test_results["parser_tests"] = self.test_enhanced_parsers()
        
        # Test 2: Search Capabilities
        print("\nPhase 2: Search Functionality")
        self.test_results["search_tests"] = self.test_search_capabilities()
        
        # Test 3: Dashboard & API
        print("\nPhase 3: Dashboard & API Access")
        self.test_results["pipeline_tests"] = self.test_dashboard_accessibility()
        
        # Test 4: Performance
        print("\nPhase 4: Performance Testing")
        self.test_results["performance_tests"] = self.run_performance_test()
        
        # Final Assessment
        self.generate_final_report()
    
    def generate_final_report(self):
        """Generate comprehensive test report"""
        print("\n" + "=" * 60)
        print("📋 ENHANCED INTEGRATION TEST RESULTS")
        print("=" * 60)
        
        # Calculate overall success metrics
        parser_success = self.test_results["parser_tests"]["summary"]["pipeline_working"]
        search_success = all(test.get("success", False) for test in self.test_results["search_tests"].values())
        dashboard_success = all(test.get("success", False) for test in self.test_results["pipeline_tests"].values())
        performance_success = self.test_results["performance_tests"]["performance_acceptable"]
        
        overall_success = parser_success and search_success and dashboard_success and performance_success
        
        # Print results
        print(f"🧪 Parser Integration: {'✅ PASS' if parser_success else '❌ FAIL'}")
        print(f"🔍 Search Functionality: {'✅ PASS' if search_success else '❌ FAIL'}")
        print(f"📊 Dashboard Access: {'✅ PASS' if dashboard_success else '❌ FAIL'}")
        print(f"⚡ Performance Test: {'✅ PASS' if performance_success else '❌ FAIL'}")
        print()
        print(f"🎯 OVERALL STATUS: {'✅ SUCCESS' if overall_success else '❌ NEEDS ATTENTION'}")
        
        # Performance metrics
        perf = self.test_results["performance_tests"]
        print(f"📈 Processing Rate: {perf['processing_success_rate']:.1f}%")
        print(f"📦 Events Processed: {perf['events_processed']}/{perf['events_sent']}")
        
        # Consumer metrics
        metrics = self.test_results["parser_tests"]["summary"]["consumer_metrics"]
        if metrics:
            print(f"🔄 Consumer Success Rate: {metrics.get('rates', {}).get('success_rate', 'N/A')}%")
            print(f"🎯 Active Sources: {metrics.get('connections', {}).get('active_sources', 'N/A')}")
        
        # Save detailed report
        self.test_results["overall_status"] = "success" if overall_success else "needs_attention"
        self.test_results["test_end"] = datetime.now().isoformat()
        
        with open("enhanced_integration_test_report.json", "w") as f:
            json.dump(self.test_results, f, indent=2, default=str)
        
        print(f"\n📁 Detailed report saved to enhanced_integration_test_report.json")
        
        # Exit with appropriate code
        if overall_success:
            print("\n🎉 All tests passed! Enhanced SIEM pipeline is fully operational.")
            sys.exit(0)
        else:
            print("\n⚠️ Some tests failed. Please review the detailed report.")
            sys.exit(1)

def main():
    """Run comprehensive enhanced integration test"""
    tester = EnhancedIntegrationTest()
    tester.run_comprehensive_test()

if __name__ == "__main__":
    main()