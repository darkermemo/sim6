#!/usr/bin/env python3
"""
SIEM Test Verification Script
Verifies database storage, search functionality, and data integrity after ingestion
"""

import json
import requests
import time
import os
from typing import Dict, List, Any, Optional
import clickhouse_connect
from datetime import datetime, timedelta

# Configuration
API_BASE_URL = "http://localhost:8080"
SEARCH_API_URL = "http://localhost:8084"
DEV_ADMIN_TOKEN = os.getenv('DEV_ADMIN_TOKEN', 'dev-admin-token-12345')
CLICKHOUSE_HOST = os.getenv('CLICKHOUSE_HOST', 'localhost')
CLICKHOUSE_PORT = int(os.getenv('CLICKHOUSE_PORT', '8123'))
CLICKHOUSE_USER = os.getenv('CLICKHOUSE_USER', 'default')
CLICKHOUSE_PASSWORD = os.getenv('CLICKHOUSE_PASSWORD', '')
CLICKHOUSE_DATABASE = os.getenv('CLICKHOUSE_DATABASE', 'dev')

TENANTS = [f"tenant-{chr(65+i)}" for i in range(10)]  # tenant-A to tenant-J
LOG_SOURCES = ["OWA", "IIS", "Proxy", "Firewall", "Windows"]

class SIEMVerifier:
    def __init__(self):
        self.api_headers = {
            "Authorization": f"Bearer {DEV_ADMIN_TOKEN}",
            "Content-Type": "application/json"
        }
        self.clickhouse_client = None
        self.verification_results = {
            "database_tests": {},
            "api_tests": {},
            "search_tests": {},
            "performance_tests": {},
            "data_integrity_tests": {}
        }
    
    def connect_clickhouse(self) -> bool:
        """Connect to ClickHouse database"""
        try:
            self.clickhouse_client = clickhouse_connect.get_client(
                host=CLICKHOUSE_HOST,
                port=CLICKHOUSE_PORT,
                username=CLICKHOUSE_USER,
                password=CLICKHOUSE_PASSWORD,
                database=CLICKHOUSE_DATABASE
            )
            # Test connection
            result = self.clickhouse_client.query("SELECT 1")
            print("✓ ClickHouse connection established")
            return True
        except Exception as e:
            print(f"✗ ClickHouse connection failed: {e}")
            return False
    
    def test_database_storage(self) -> Dict[str, Any]:
        """Test database storage and data integrity"""
        print("\n" + "=" * 50)
        print("DATABASE STORAGE VERIFICATION")
        print("=" * 50)
        
        results = {}
        
        try:
            # Test 1: Total event count
            total_count = self.clickhouse_client.query("SELECT COUNT(*) FROM events").first_row[0]
            results["total_events"] = {
                "count": total_count,
                "status": "pass" if total_count > 0 else "fail"
            }
            print(f"Total events in database: {total_count:,}")
            
            # Test 2: Events per tenant
            tenant_counts = self.clickhouse_client.query(
                "SELECT tenant_id, COUNT(*) as count FROM events GROUP BY tenant_id ORDER BY tenant_id"
            )
            
            tenant_results = {}
            for row in tenant_counts.result_rows:
                tenant_id, count = row
                tenant_results[tenant_id] = count
                print(f"  {tenant_id}: {count:,} events")
            
            results["tenant_distribution"] = {
                "data": tenant_results,
                "status": "pass" if len(tenant_results) == 10 else "fail"
            }
            
            # Test 3: Events per log source
            source_counts = self.clickhouse_client.query(
                "SELECT source_type, COUNT(*) as count FROM events GROUP BY source_type ORDER BY source_type"
            )
            
            source_results = {}
            for row in source_counts.result_rows:
                log_source, count = row
                source_results[log_source] = count
                print(f"  {log_source}: {count:,} events")
            
            results["log_source_distribution"] = {
                "data": source_results,
                "status": "pass" if len(source_results) >= 5 else "fail"
            }
            
            # Test 4: Timestamp range
            timestamp_range = self.clickhouse_client.query(
                "SELECT MIN(event_timestamp), MAX(event_timestamp) FROM events"
            )
            min_ts, max_ts = timestamp_range.first_row
            
            results["timestamp_range"] = {
                "min_timestamp": min_ts,
                "max_timestamp": max_ts,
                "range_days": (max_ts - min_ts) / 86400,
                "status": "pass" if (max_ts - min_ts) > 0 else "fail"
            }
            print(f"Timestamp range: {datetime.fromtimestamp(min_ts)} to {datetime.fromtimestamp(max_ts)}")
            
            # Test 5: Field mapping verification
            field_samples = self.clickhouse_client.query(
                "SELECT source_ip, user_name, host_name FROM events WHERE source_ip != '' LIMIT 10"
            )
            
            mapped_fields_count = 0
            for row in field_samples.result_rows:
                if any(field for field in row if field):
                    mapped_fields_count += 1
            
            results["field_mapping"] = {
                "mapped_samples": mapped_fields_count,
                "total_samples": len(field_samples.result_rows),
                "status": "pass" if mapped_fields_count > 0 else "fail"
            }
            print(f"Field mapping verification: {mapped_fields_count}/{len(field_samples.result_rows)} samples have mapped fields")
            
        except Exception as e:
            results["error"] = str(e)
            print(f"✗ Database verification failed: {e}")
        
        return results
    
    def test_api_endpoints(self) -> Dict[str, Any]:
        """Test API endpoints functionality"""
        print("\n" + "=" * 50)
        print("API ENDPOINTS VERIFICATION")
        print("=" * 50)
        
        results = {}
        
        # Test 1: Health check (ingestion service)
        try:
            response = requests.get(f"{API_BASE_URL}/health", timeout=10)
            results["health_check_ingestion"] = {
                "status_code": response.status_code,
                "status": "pass" if response.status_code == 200 else "fail",
                "service": "ingestion"
            }
            print(f"Health check (ingestion): {response.status_code}")
        except Exception as e:
            results["health_check_ingestion"] = {"error": str(e), "status": "fail", "service": "ingestion"}
            print(f"✗ Health check (ingestion) failed: {e}")
        
        # Test 2: Health check (search service)
        try:
            response = requests.get(f"{SEARCH_API_URL}/health", timeout=10)
            results["health_check_search"] = {
                "status_code": response.status_code,
                "status": "pass" if response.status_code == 200 else "fail",
                "service": "search"
            }
            print(f"Health check (search): {response.status_code}")
        except Exception as e:
            results["health_check_search"] = {"error": str(e), "status": "fail", "service": "search"}
            print(f"✗ Health check (search) failed: {e}")
        
        # Test 3: Events search endpoint
        try:
            search_payload = {
                "query": "*",
                "limit": 10,
                "tenant_id": "tenant-A"
            }
            
            response = requests.post(
                f"{SEARCH_API_URL}/v1/events/search",
                headers=self.api_headers,
                json=search_payload,
                timeout=30
            )
            
            results["events_search"] = {
                "status_code": response.status_code,
                "status": "pass" if response.status_code == 200 else "fail",
                "service": "search"
            }
            
            if response.status_code == 200:
                data = response.json()
                event_count = len(data.get("events", []))
                results["events_search"]["returned_events"] = event_count
                print(f"Events search: {response.status_code}, returned {event_count} events")
            else:
                print(f"Events search: {response.status_code} - {response.text}")
                
        except Exception as e:
            results["events_search"] = {"error": str(e), "status": "fail", "service": "search"}
            print(f"✗ Events search failed: {e}")
        
        # Test 4: Ingestion endpoint availability
        try:
            response = requests.options(
                f"{API_BASE_URL}/api/v1/events/ingest",
                headers=self.api_headers,
                timeout=10
            )
            
            results["events_ingest"] = {
                "status_code": response.status_code,
                "status": "pass" if response.status_code in [200, 405] else "fail",
                "service": "ingestion"
            }
            print(f"Events ingest endpoint: {response.status_code}")
            
        except Exception as e:
            results["events_ingest"] = {"error": str(e), "status": "fail", "service": "ingestion"}
            print(f"✗ Events ingest failed: {e}")
        
        # Test 5: Log sources endpoint
        try:
            response = requests.get(
                f"{SEARCH_API_URL}/v1/log-sources",
                headers=self.api_headers,
                timeout=10
            )
            
            results["log_sources"] = {
                "status_code": response.status_code,
                "status": "pass" if response.status_code == 200 else "fail",
                "service": "search"
            }
            print(f"Log sources: {response.status_code}")
            
        except Exception as e:
            results["log_sources"] = {"error": str(e), "status": "fail", "service": "search"}
            print(f"✗ Log sources failed: {e}")
        
        return results
    
    def test_search_functionality(self) -> Dict[str, Any]:
        """Test search and filtering functionality"""
        print("\n" + "=" * 50)
        print("SEARCH FUNCTIONALITY VERIFICATION")
        print("=" * 50)
        
        results = {}
        
        search_tests = [
            {
                "name": "tenant_filter",
                "description": "Search by tenant ID",
                "payload": {"query": "*", "tenant_id": "tenant-A", "limit": 100}
            },
            {
                "name": "ip_search",
                "description": "Search by IP address",
                "payload": {"query": "192.168.1.*", "limit": 50}
            },
            {
                "name": "log_source_filter",
                "description": "Filter by log source",
                "payload": {"query": "source_type:Windows", "limit": 50}
            },
            {
                "name": "time_range_filter",
                "description": "Filter by time range",
                "payload": {
                    "query": "*",
                    "start_time": int((datetime.now() - timedelta(days=1)).timestamp()),
                    "end_time": int(datetime.now().timestamp()),
                    "limit": 100
                }
            },
            {
                "name": "user_search",
                "description": "Search by username",
                "payload": {"query": "admin", "limit": 50}
            }
        ]
        
        for test in search_tests:
            try:
                start_time = time.time()
                response = requests.post(
                    f"{SEARCH_API_URL}/v1/events/search",
                    headers=self.api_headers,
                    json=test["payload"],
                    timeout=30
                )
                response_time = time.time() - start_time
                
                test_result = {
                    "status_code": response.status_code,
                    "response_time": response_time,
                    "status": "pass" if response.status_code == 200 else "fail"
                }
                
                if response.status_code == 200:
                    data = response.json()
                    event_count = len(data.get("events", []))
                    test_result["returned_events"] = event_count
                    test_result["total_matches"] = data.get("total", 0)
                    
                    print(f"{test['description']}: {response.status_code}, {event_count} events, {response_time:.2f}s")
                else:
                    print(f"{test['description']}: {response.status_code} - {response.text[:100]}")
                
                results[test["name"]] = test_result
                
            except Exception as e:
                results[test["name"]] = {"error": str(e), "status": "fail"}
                print(f"✗ {test['description']} failed: {e}")
        
        return results
    
    def test_performance(self) -> Dict[str, Any]:
        """Test system performance under load"""
        print("\n" + "=" * 50)
        print("PERFORMANCE VERIFICATION")
        print("=" * 50)
        
        results = {}
        
        # Test 1: Large result set query
        try:
            start_time = time.time()
            response = requests.post(
                f"{SEARCH_API_URL}/v1/events/search",
                headers=self.api_headers,
                json={"query": "*", "limit": 1000},
                timeout=60
            )
            response_time = time.time() - start_time
            
            results["large_query"] = {
                "status_code": response.status_code,
                "response_time": response_time,
                "status": "pass" if response.status_code == 200 and response_time < 10 else "fail"
            }
            
            if response.status_code == 200:
                data = response.json()
                event_count = len(data.get("events", []))
                results["large_query"]["returned_events"] = event_count
                print(f"Large query (1000 events): {response_time:.2f}s, {event_count} events")
            
        except Exception as e:
            results["large_query"] = {"error": str(e), "status": "fail"}
            print(f"✗ Large query test failed: {e}")
        
        # Test 2: Database query performance
        if self.clickhouse_client:
            try:
                start_time = time.time()
                count = self.clickhouse_client.query("SELECT COUNT(*) FROM events WHERE event_timestamp > (toUnixTimestamp(now()) - 86400)").first_row[0]
                query_time = time.time() - start_time
                
                results["db_performance"] = {
                    "query_time": query_time,
                    "result_count": count,
                    "status": "pass" if query_time < 5 else "fail"
                }
                print(f"Database query (24h filter): {query_time:.2f}s, {count:,} events")
                
            except Exception as e:
                results["db_performance"] = {"error": str(e), "status": "fail"}
                print(f"✗ Database performance test failed: {e}")
        
        return results
    
    def run_verification(self) -> Dict[str, Any]:
        """Run complete verification suite"""
        print("Starting SIEM verification suite...")
        print(f"API URL: {API_BASE_URL}")
        print(f"ClickHouse: {CLICKHOUSE_HOST}:{CLICKHOUSE_PORT}")
        
        # Connect to ClickHouse
        if not self.connect_clickhouse():
            print("Cannot proceed without ClickHouse connection")
            return {"error": "ClickHouse connection failed"}
        
        # Run all verification tests
        self.verification_results["database_tests"] = self.test_database_storage()
        self.verification_results["api_tests"] = self.test_api_endpoints()
        self.verification_results["search_tests"] = self.test_search_functionality()
        self.verification_results["performance_tests"] = self.test_performance()
        
        # Generate summary
        self.generate_verification_report()
        
        return self.verification_results
    
    def generate_verification_report(self):
        """Generate verification report"""
        # Count passed/failed tests
        total_tests = 0
        passed_tests = 0
        
        for category, tests in self.verification_results.items():
            if isinstance(tests, dict):
                for test_name, test_result in tests.items():
                    if isinstance(test_result, dict) and "status" in test_result:
                        total_tests += 1
                        if test_result["status"] == "pass":
                            passed_tests += 1
        
        # Add summary
        self.verification_results["summary"] = {
            "total_tests": total_tests,
            "passed_tests": passed_tests,
            "failed_tests": total_tests - passed_tests,
            "success_rate": (passed_tests / total_tests * 100) if total_tests > 0 else 0,
            "timestamp": datetime.now().isoformat()
        }
        
        # Save report
        with open("verification_report.json", "w") as f:
            json.dump(self.verification_results, f, indent=2)
        
        # Print summary
        print("\n" + "=" * 60)
        print("VERIFICATION SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        print(f"Success Rate: {self.verification_results['summary']['success_rate']:.1f}%")
        print(f"\nDetailed report saved to: verification_report.json")

def main():
    """Main function"""
    verifier = SIEMVerifier()
    verifier.run_verification()

if __name__ == "__main__":
    main()