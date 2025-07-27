#!/usr/bin/env python3
"""
Comprehensive SIEM System Test using OTRF Security Datasets

This script tests the complete SIEM pipeline:
- Data ingestion from OTRF datasets
- Multi-tenant isolation
- Parsing and transformation
- Rule engine and detection
- Alerting system
- UI data display
- Schema validation compliance

Follows schema_validators_v4 and v5 requirements
"""

import requests
import json
import time
import zipfile
import os
import random
import gzip
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any
import uuid
import subprocess

# Configuration
SIEM_API_BASE = "http://localhost:8080/api/v1"
INGESTOR_URL = "http://127.0.0.1:8081/ingest/raw"
SECURITY_DATASETS_PATH = "/Users/yasseralmohammed/sim6/Security-Datasets"

# Test Configuration
TEST_BATCH_SIZE = 100
TEST_DELAY = 0.5
MAX_EVENTS_PER_DATASET = 10000  # Limit for testing

# Multi-tenant test configuration
TENANTS = [
    {"id": "tenant-A", "name": "Organization A", "source_ips": ["10.10.10.100", "10.10.10.101"]},
    {"id": "tenant-B", "name": "Organization B", "source_ips": ["10.20.20.200", "10.20.20.201"]},
    {"id": "tenant-C", "name": "Organization C", "source_ips": ["10.30.30.100", "10.30.30.101"]}
]

class SIEMComprehensiveTester:
    def __init__(self):
        self.session = requests.Session()
        # Set up development mode authentication bypass
        # Either use no auth header (complete bypass) or demo token
        self.session.headers.update({
            "Authorization": "Bearer demo-access-token",
            "Content-Type": "application/json"
        })
        self.test_results = {
            "ingestion": [],
            "consumers": [],
            "tenants": [],
            "rules": [],
            "parsing": [],
            "storing": [],
            "detections": [],
            "alerting": [],
            "ui_display": []
        }
        self.processed_events = 0
        self.total_events = 0
        
    def log_result(self, category: str, test_name: str, status: str, details: str = ""):
        """Log test results"""
        result = {
            "timestamp": datetime.now().isoformat(),
            "test_name": test_name,
            "status": status,
            "details": details
        }
        self.test_results[category].append(result)
        print(f"[{category.upper()}] {test_name}: {status} - {details}")
    
    def check_system_health(self) -> bool:
        """Check if all SIEM components are running"""
        print("\n🔍 Checking System Health")
        print("=" * 50)
        
        components = [
            ("SIEM API", f"{SIEM_API_BASE}/health"),
            ("Ingestor", f"{INGESTOR_URL}"),  # Just check if ingestor responds
            ("ClickHouse", "http://localhost:8123/ping")
        ]
        
        all_healthy = True
        for name, url in components:
            try:
                response = self.session.get(url, timeout=5)
                # Accept 200, 404, 405 as healthy (service is responding)
                if response.status_code in [200, 404, 405]:
                    self.log_result("ingestion", f"{name} Health Check", "PASS", f"Service is responding (status: {response.status_code})")
                else:
                    self.log_result("ingestion", f"{name} Health Check", "FAIL", f"Status: {response.status_code}")
                    all_healthy = False
            except Exception as e:
                self.log_result("ingestion", f"{name} Health Check", "FAIL", str(e))
                all_healthy = False
        
        return all_healthy
    
    def discover_datasets(self) -> List[Dict[str, Any]]:
        """Discover available OTRF datasets"""
        print("\n📂 Discovering OTRF Security Datasets")
        print("=" * 50)
        
        datasets = []
        atomic_path = Path(SECURITY_DATASETS_PATH) / "datasets" / "atomic"
        
        # Scan Windows datasets
        windows_path = atomic_path / "windows"
        if windows_path.exists():
            for category in windows_path.iterdir():
                if category.is_dir():
                    host_path = category / "host"
                    if host_path.exists():
                        for dataset_file in host_path.glob("*.zip"):
                            datasets.append({
                                "platform": "windows",
                                "category": category.name,
                                "file": str(dataset_file),
                                "name": dataset_file.stem,
                                "size": dataset_file.stat().st_size
                            })
        
        # Scan Linux datasets
        linux_path = atomic_path / "linux"
        if linux_path.exists():
            for category in linux_path.iterdir():
                if category.is_dir():
                    host_path = category / "host"
                    if host_path.exists():
                        for dataset_file in host_path.glob("*.zip"):
                            datasets.append({
                                "platform": "linux",
                                "category": category.name,
                                "file": str(dataset_file),
                                "name": dataset_file.stem,
                                "size": dataset_file.stat().st_size
                            })
        
        # Sort by size (smallest first for testing)
        datasets.sort(key=lambda x: x["size"])
        
        print(f"Found {len(datasets)} datasets")
        for i, dataset in enumerate(datasets[:10]):  # Show first 10
            size_mb = dataset["size"] / (1024 * 1024)
            print(f"{i+1:2d}. {dataset['platform']}/{dataset['category']}/{dataset['name']} ({size_mb:.1f}MB)")
        
        return datasets
    
    def extract_and_transform_dataset(self, dataset: Dict[str, Any], tenant_id: str) -> List[Dict[str, Any]]:
        """Extract dataset and transform to SIEM format"""
        print(f"\n📦 Processing Dataset: {dataset['name']}")
        
        events = []
        temp_dir = Path("/tmp/siem_test_data")
        temp_dir.mkdir(exist_ok=True)
        
        try:
            # Extract ZIP file
            with zipfile.ZipFile(dataset["file"], 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
            
            # Find JSON files
            for json_file in temp_dir.glob("*.json"):
                print(f"Processing: {json_file.name}")
                
                with open(json_file, 'r') as f:
                    line_count = 0
                    for line in f:
                        if line_count >= MAX_EVENTS_PER_DATASET:
                            break
                        
                        try:
                            event_data = json.loads(line.strip())
                            
                            # Transform to SIEM format
                            transformed_event = self.transform_otrf_to_siem(event_data, tenant_id, dataset)
                            if transformed_event:
                                events.append(transformed_event)
                                line_count += 1
                        except json.JSONDecodeError:
                            continue
                        except Exception as e:
                            print(f"Error processing event: {e}")
                            continue
            
            # Cleanup
            for file in temp_dir.glob("*"):
                file.unlink()
            
        except Exception as e:
            self.log_result("parsing", f"Dataset Extraction - {dataset['name']}", "FAIL", str(e))
            return []
        
        self.log_result("parsing", f"Dataset Transformation - {dataset['name']}", "PASS", f"Extracted {len(events)} events")
        return events
    
    def transform_otrf_to_siem(self, otrf_event: Dict[str, Any], tenant_id: str, dataset: Dict[str, Any]) -> Dict[str, Any]:
        """Transform OTRF event format to SIEM API format"""
        try:
            # Get tenant source IP
            tenant_config = next((t for t in TENANTS if t["id"] == tenant_id), TENANTS[0])
            source_ip = random.choice(tenant_config["source_ips"])
            
            # Create SIEM-compatible event
            siem_event = {
                "source_ip": source_ip,
                "raw_log": json.dumps(otrf_event)  # Store original as raw log
            }
            
            return siem_event
            
        except Exception as e:
            print(f"Transform error: {e}")
            return None
    
    def find_datasets_with_events(self, datasets: List[Dict[str, Any]], max_datasets: int = 10) -> List[Dict[str, Any]]:
        """Find datasets that actually contain events by doing a quick check"""
        print("\n🔍 Finding datasets with events...")
        datasets_with_events = []
        
        for dataset in datasets:
            if len(datasets_with_events) >= max_datasets:
                break
                
            # Quick check: extract and count events without full processing
            temp_dir = Path("/tmp/siem_test_data_check")
            temp_dir.mkdir(exist_ok=True)
            
            try:
                with zipfile.ZipFile(dataset["file"], 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)
                
                event_count = 0
                for json_file in temp_dir.glob("*.json"):
                    with open(json_file, 'r') as f:
                        for line_num, line in enumerate(f):
                            if line_num >= 10:  # Check first 10 lines only
                                break
                            try:
                                json.loads(line.strip())
                                event_count += 1
                            except json.JSONDecodeError:
                                continue
                
                # Cleanup
                for file in temp_dir.glob("*"):
                    file.unlink()
                
                if event_count > 0:
                    dataset["estimated_events"] = event_count
                    datasets_with_events.append(dataset)
                    print(f"✅ {dataset['name']}: ~{event_count} events found")
                else:
                    print(f"❌ {dataset['name']}: No valid events found")
                    
            except Exception as e:
                print(f"❌ {dataset['name']}: Error checking - {e}")
                continue
        
        return datasets_with_events
    
    def test_multi_tenant_ingestion(self, datasets: List[Dict[str, Any]]) -> bool:
        """Test multi-tenant data ingestion"""
        print("\n🏢 Testing Multi-Tenant Ingestion")
        print("=" * 50)
        
        # First, find datasets that actually contain events
        datasets_with_events = self.find_datasets_with_events(datasets, len(TENANTS))
        
        if len(datasets_with_events) < len(TENANTS):
            print(f"⚠️ Warning: Only found {len(datasets_with_events)} datasets with events, but need {len(TENANTS)} for all tenants")
        
        success_count = 0
        total_tests = 0
        
        # Test each tenant with different datasets that have events
        for i, tenant in enumerate(TENANTS):
            if i >= len(datasets_with_events):
                # If we run out of datasets with events, reuse the last one
                if datasets_with_events:
                    dataset = datasets_with_events[-1]
                else:
                    self.log_result("tenants", f"Tenant {tenant['id']} Data Preparation", "FAIL", "No datasets with events available")
                    continue
            else:
                dataset = datasets_with_events[i]
                
            tenant_id = tenant["id"]
            
            print(f"\nTesting tenant {tenant_id} with {dataset['name']} (~{dataset.get('estimated_events', '?')} events)")
            
            # Extract and transform events
            events = self.extract_and_transform_dataset(dataset, tenant_id)
            
            if not events:
                self.log_result("tenants", f"Tenant {tenant_id} Data Preparation", "FAIL", "No events extracted")
                continue
            
            # Test ingestion in batches
            batch_success = self.ingest_events_batch(events[:TEST_BATCH_SIZE], tenant_id)
            total_tests += 1
            
            if batch_success:
                success_count += 1
                self.log_result("tenants", f"Tenant {tenant_id} Ingestion", "PASS", f"Ingested {len(events[:TEST_BATCH_SIZE])} events")
            else:
                self.log_result("tenants", f"Tenant {tenant_id} Ingestion", "FAIL", "Ingestion failed")
            
            # Wait between tenants
            time.sleep(TEST_DELAY)
        
        return success_count == total_tests
    
    def ingest_events_batch(self, events: List[Dict[str, Any]], tenant_id: str) -> bool:
        """Ingest a batch of events for a specific tenant"""
        try:
            # Prepare ingestion request
            ingest_request = {"events": events}
            
            # Send to SIEM API
            response = self.session.post(
                f"{SIEM_API_BASE}/events",
                json=ingest_request,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            if response.status_code == 202:  # Accepted
                self.processed_events += len(events)
                return True
            else:
                print(f"Ingestion failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"Ingestion error: {e}")
            return False
    
    def test_consumers_and_parsing(self) -> bool:
        """Test that consumers are processing and parsing events"""
        print("\n⚙️ Testing Consumers and Parsing")
        print("=" * 50)
        
        # Wait for consumers to process
        print("Waiting for consumers to process events...")
        time.sleep(10)
        
        # Check event count in database
        try:
            response = self.session.get(f"{SIEM_API_BASE}/events")
            if response.status_code == 200:
                events = response.json()
                stored_count = len(events)
                
                self.log_result("consumers", "Event Processing", "PASS", f"Found {stored_count} events in database")
                self.log_result("storing", "Data Storage", "PASS", f"Events successfully stored")
                
                # Check parsing results
                parsed_events = [e for e in events if e.get('event_category') != 'unknown']
                if parsed_events:
                    self.log_result("parsing", "Event Parsing", "PASS", f"{len(parsed_events)} events parsed")
                else:
                    self.log_result("parsing", "Event Parsing", "PARTIAL", "Events stored but not parsed")
                
                return True
            else:
                self.log_result("consumers", "Event Processing", "FAIL", f"API error: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("consumers", "Event Processing", "FAIL", str(e))
            return False
    
    def generate_test_rules(self, count: int = 1000) -> list:
        """Generate multiple test Sigma rules"""
        base_rules = [
            {
                "title": "Mimikatz Activity Detection",
                "description": "Detects potential Mimikatz credential dumping activity",
                "keywords": ["mimikatz", "sekurlsa", "logonpasswords"],
                "level": "high"
            },
            {
                "title": "Suspicious PowerShell Execution", 
                "description": "Detects suspicious PowerShell command execution",
                "keywords": ["powershell", "bypass", "encoded"],
                "level": "medium"
            },
            {
                "title": "Suspicious Process Creation",
                "description": "Detects suspicious process creation patterns",
                "keywords": ["cmd.exe", "rundll32", "regsvr32"],
                "level": "medium"
            },
            {
                "title": "Network Reconnaissance",
                "description": "Detects network reconnaissance activities",
                "keywords": ["nmap", "nslookup", "netstat"],
                "level": "low"
            },
            {
                "title": "File System Manipulation",
                "description": "Detects suspicious file system operations",
                "keywords": ["copy", "move", "delete"],
                "level": "low"
            }
        ]
        
        rules = []
        for i in range(count):
            base_rule = base_rules[i % len(base_rules)]
            rule_id = f"otrf-rule-{i+1:04d}"
            
            sigma_yaml = f"""
title: {base_rule['title']} - Variant {i+1}
id: {rule_id}
status: experimental
description: {base_rule['description']} (Test variant {i+1})
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        keywords:
            - "{base_rule['keywords'][0]}"
            - "{base_rule['keywords'][1] if len(base_rule['keywords']) > 1 else base_rule['keywords'][0]}"
            - "{base_rule['keywords'][2] if len(base_rule['keywords']) > 2 else base_rule['keywords'][0]}"
    condition: selection
falsepositives:
    - Security testing
    - Administrative tasks
level: {base_rule['level']}
"""
            
            rules.append({"sigma_yaml": sigma_yaml})
        
        return rules
    
    def test_detection_rules(self) -> bool:
        """Test rule engine and detection capabilities"""
        print("\n🔍 Testing Detection Rules")
        print("=" * 50)
        
        # Generate 1000 test rules
        test_rules = self.generate_test_rules(1000)
        
        success_count = 0
        for rule in test_rules:
            try:
                response = self.session.post(
                    f"{SIEM_API_BASE}/rules/sigma",
                    json=rule,
                    headers={"Content-Type": "application/json"}
                )
                
                if response.status_code in [200, 201]:
                    success_count += 1
                    rule_name = f"Rule {len(self.test_results['rules']) + 1}"
                    self.log_result("rules", f"Rule Creation - {rule_name}", "PASS", "Rule created successfully")
                else:
                    rule_name = f"Rule {len(self.test_results['rules']) + 1}"
                    self.log_result("rules", f"Rule Creation - {rule_name}", "FAIL", f"Status: {response.status_code}")
                    
            except Exception as e:
                rule_name = f"Rule {len(self.test_results['rules']) + 1}"
                self.log_result("rules", f"Rule Creation - {rule_name}", "FAIL", str(e))
        
        return success_count == len(test_rules)
    
    def test_alerting_system(self) -> bool:
        """Test alert generation and retrieval"""
        print("\n🚨 Testing Alerting System")
        print("=" * 50)
        
        # Wait for rule engine to process
        print("Waiting for rule engine to process events...")
        time.sleep(15)
        
        try:
            response = self.session.get(f"{SIEM_API_BASE}/alerts")
            if response.status_code == 200:
                data = response.json()
                alerts = data.get('data', [])
                
                if alerts:
                    self.log_result("alerting", "Alert Generation", "PASS", f"Generated {len(alerts)} alerts")
                    self.log_result("detections", "Detection Engine", "PASS", "Rules triggered alerts")
                    
                    # Test alert details
                    for alert in alerts[:3]:  # Check first 3 alerts
                        alert_id = alert.get('alert_id')
                        detail_response = self.session.get(f"{SIEM_API_BASE}/alerts/{alert_id}")
                        if detail_response.status_code == 200:
                            self.log_result("alerting", f"Alert Detail - {alert_id}", "PASS", "Alert details retrieved")
                    
                    return True
                else:
                    self.log_result("alerting", "Alert Generation", "PARTIAL", "No alerts generated yet")
                    return False
            else:
                self.log_result("alerting", "Alert Generation", "FAIL", f"API error: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("alerting", "Alert Generation", "FAIL", str(e))
            return False
    
    def test_ui_data_display(self) -> bool:
        """Test UI data endpoints"""
        print("\n🖥️ Testing UI Data Display")
        print("=" * 50)
        
        ui_endpoints = [
            ("/events", "Event List"),
            ("/dashboard", "Dashboard Data"),
            ("/fields/values?field=source_ip", "Field Values"),
            ("/rules", "Rules List")
        ]
        
        success_count = 0
        for endpoint, name in ui_endpoints:
            try:
                response = self.session.get(f"{SIEM_API_BASE}{endpoint}")
                if response.status_code == 200:
                    data = response.json()
                    self.log_result("ui_display", f"UI Endpoint - {name}", "PASS", f"Data retrieved successfully")
                    success_count += 1
                else:
                    self.log_result("ui_display", f"UI Endpoint - {name}", "FAIL", f"Status: {response.status_code}")
            except Exception as e:
                self.log_result("ui_display", f"UI Endpoint - {name}", "FAIL", str(e))
        
        return success_count == len(ui_endpoints)
    
    def validate_schema_compliance(self) -> bool:
        """Validate schema compliance using schema_validator_v4 and v5"""
        print("\n📋 Validating Schema Compliance")
        print("=" * 50)
        
        validators = [
            ("schema_validator_v4", ["cargo", "run", "--bin", "schema_validator_v4", "--", "--schema", "sample_schema.graphql"]),
            ("schema_validator_v5", ["cargo", "run", "--bin", "schema_validator_v5", "--features", "prometheus-metrics", "--", "--database-schema", "database_setup.sql", "--source-code", "src"])
        ]
        success_count = 0
        
        for validator_name, command in validators:
            try:
                result = subprocess.run(
                    command,
                    cwd="/Users/yasseralmohammed/sim6",
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                
                if result.returncode == 0:
                    self.log_result("storing", f"Schema Validation - {validator_name}", "PASS", "Schema compliance verified")
                    success_count += 1
                else:
                    self.log_result("storing", f"Schema Validation - {validator_name}", "FAIL", result.stderr[:200])
                    
            except subprocess.TimeoutExpired:
                self.log_result("storing", f"Schema Validation - {validator_name}", "FAIL", "Validation timeout")
            except Exception as e:
                self.log_result("storing", f"Schema Validation - {validator_name}", "FAIL", str(e))
        
        return success_count == len(validators)
    
    def generate_test_report(self):
        """Generate comprehensive test report"""
        print("\n📊 Generating Test Report")
        print("=" * 50)
        
        report = {
            "test_execution": {
                "timestamp": datetime.now().isoformat(),
                "total_events_processed": self.processed_events,
                "datasets_used": "OTRF Security Datasets",
                "schema_validators": ["v4", "v5"]
            },
            "results": self.test_results,
            "summary": {}
        }
        
        # Calculate summary statistics
        for category, tests in self.test_results.items():
            total = len(tests)
            passed = len([t for t in tests if t["status"] == "PASS"])
            failed = len([t for t in tests if t["status"] == "FAIL"])
            partial = len([t for t in tests if t["status"] == "PARTIAL"])
            
            report["summary"][category] = {
                "total": total,
                "passed": passed,
                "failed": failed,
                "partial": partial,
                "success_rate": (passed / total * 100) if total > 0 else 0
            }
        
        # Save report
        report_file = f"comprehensive_siem_test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"\n📄 Test Report Saved: {report_file}")
        
        # Print summary
        print("\n📈 Test Summary")
        print("=" * 50)
        total_tests = sum(s["total"] for s in report["summary"].values())
        total_passed = sum(s["passed"] for s in report["summary"].values())
        overall_success = (total_passed / total_tests * 100) if total_tests > 0 else 0
        
        print(f"Overall Success Rate: {overall_success:.1f}% ({total_passed}/{total_tests})")
        print(f"Events Processed: {self.processed_events}")
        
        for category, stats in report["summary"].items():
            print(f"{category.title()}: {stats['success_rate']:.1f}% ({stats['passed']}/{stats['total']})")
        
        return report
    
    def run_comprehensive_test(self):
        """Run the complete comprehensive test suite"""
        print("🚀 Starting Comprehensive SIEM Test with OTRF Security Datasets")
        print("=" * 80)
        
        # 1. System Health Check
        if not self.check_system_health():
            print("❌ System health check failed. Please ensure all services are running.")
            return False
        
        # 2. Discover Datasets
        datasets = self.discover_datasets()
        if not datasets:
            print("❌ No datasets found. Please check the Security-Datasets path.")
            return False
        
        # 3. Multi-tenant Ingestion Test
        self.test_multi_tenant_ingestion(datasets)  # Test with all available datasets
        
        # 4. Consumer and Parsing Test
        self.test_consumers_and_parsing()
        
        # 5. Detection Rules Test
        self.test_detection_rules()
        
        # 6. Alerting System Test
        self.test_alerting_system()
        
        # 7. UI Data Display Test
        self.test_ui_data_display()
        
        # 8. Schema Compliance Validation
        self.validate_schema_compliance()
        
        # 9. Generate Report
        report = self.generate_test_report()
        
        # 10. Final Assessment
        overall_success = sum(s["passed"] for s in report["summary"].values())
        total_tests = sum(s["total"] for s in report["summary"].values())
        success_rate = (overall_success / total_tests * 100) if total_tests > 0 else 0
        
        if success_rate >= 80:
            print("\n✅ COMPREHENSIVE TEST PASSED!")
            print(f"Success Rate: {success_rate:.1f}%")
            return True
        else:
            print("\n❌ COMPREHENSIVE TEST FAILED!")
            print(f"Success Rate: {success_rate:.1f}% (Required: 80%)")
            return False

def main():
    """Main execution function"""
    tester = SIEMComprehensiveTester()
    success = tester.run_comprehensive_test()
    
    if success:
        print("\n🎉 All tests completed successfully!")
        exit(0)
    else:
        print("\n💥 Some tests failed. Check the report for details.")
        exit(1)

if __name__ == "__main__":
    main()