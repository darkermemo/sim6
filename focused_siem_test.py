#!/usr/bin/env python3
"""
Focused SIEM Test - Addressing Key Issues

This script focuses on the main issues identified:
1. OTRF dataset extraction and ingestion
2. Rule creation and validation
3. Multi-tenant testing
4. Comprehensive reporting
"""

import requests
import json
import time
import zipfile
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any
import uuid

# Configuration
SIEM_API_BASE = "http://localhost:8080/api/v1"
INGESTOR_URL = "http://127.0.0.1:8081/ingest/raw"
SECURITY_DATASETS_PATH = "/Users/yasseralmohammed/sim6/Security-Datasets"

class FocusedSIEMTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.processed_events = 0
        
    def log_result(self, category: str, test_name: str, status: str, details: str = ""):
        """Log test results"""
        result = {
            "timestamp": datetime.now().isoformat(),
            "category": category,
            "test_name": test_name,
            "status": status,
            "details": details
        }
        self.test_results.append(result)
        print(f"[{category.upper()}] {test_name}: {status} - {details}")
    
    def test_dataset_extraction(self) -> bool:
        """Test OTRF dataset extraction with a known working dataset"""
        print("\n📦 Testing Dataset Extraction")
        print("=" * 50)
        
        # Use the dataset we know exists
        dataset_file = Path(SECURITY_DATASETS_PATH) / "datasets" / "atomic" / "windows" / "credential_access" / "host" / "empire_mimikatz_logonpasswords.zip"
        
        if not dataset_file.exists():
            self.log_result("extraction", "Dataset File Check", "FAIL", f"File not found: {dataset_file}")
            return False
        
        try:
            # Extract and examine the dataset
            temp_dir = Path("/tmp/siem_focused_test")
            temp_dir.mkdir(exist_ok=True)
            
            with zipfile.ZipFile(dataset_file, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
            
            # Find JSON files
            json_files = list(temp_dir.glob("*.json"))
            if not json_files:
                self.log_result("extraction", "JSON File Discovery", "FAIL", "No JSON files found in dataset")
                return False
            
            json_file = json_files[0]
            self.log_result("extraction", "JSON File Discovery", "PASS", f"Found: {json_file.name}")
            
            # Count events in the file
            event_count = 0
            sample_events = []
            
            with open(json_file, 'r') as f:
                for line_num, line in enumerate(f):
                    if line_num >= 1000:  # Limit for testing
                        break
                    
                    line = line.strip()
                    if line:
                        try:
                            event_data = json.loads(line)
                            event_count += 1
                            
                            # Collect first 5 events as samples
                            if len(sample_events) < 5:
                                sample_events.append(event_data)
                                
                        except json.JSONDecodeError:
                            continue
            
            self.log_result("extraction", "Event Parsing", "PASS", f"Parsed {event_count} events from dataset")
            
            # Analyze sample events
            if sample_events:
                self.analyze_sample_events(sample_events)
            
            # Cleanup
            for file in temp_dir.glob("*"):
                file.unlink()
            
            return event_count > 0
            
        except Exception as e:
            self.log_result("extraction", "Dataset Extraction", "FAIL", str(e))
            return False
    
    def analyze_sample_events(self, events: List[Dict[str, Any]]):
        """Analyze sample events to understand structure"""
        print("\n🔍 Analyzing Sample Events")
        
        common_fields = set()
        field_types = {}
        
        for event in events:
            for field, value in event.items():
                common_fields.add(field)
                field_types[field] = type(value).__name__
        
        print(f"Common fields found: {len(common_fields)}")
        for field in sorted(list(common_fields)[:10]):  # Show first 10
            print(f"  - {field}: {field_types.get(field, 'unknown')}")
        
        self.log_result("analysis", "Event Structure Analysis", "PASS", f"Identified {len(common_fields)} common fields")
    
    def test_manual_event_ingestion(self) -> bool:
        """Test manual event ingestion with simple test data"""
        print("\n📥 Testing Manual Event Ingestion")
        print("=" * 50)
        
        # Create test events for different tenants
        test_events = [
            {
                "source_ip": "10.10.10.100",
                "raw_log": json.dumps({
                    "EventID": 4624,
                    "EventType": "Logon",
                    "SourceName": "Microsoft-Windows-Security-Auditing",
                    "TimeGenerated": datetime.now().isoformat(),
                    "Computer": "TEST-WORKSTATION-01",
                    "Message": "An account was successfully logged on",
                    "LogonType": 3,
                    "TargetUserName": "testuser",
                    "SourceNetworkAddress": "10.10.10.100",
                    "tenant_test": "tenant-A"
                })
            },
            {
                "source_ip": "10.20.20.200",
                "raw_log": json.dumps({
                    "EventID": 4625,
                    "EventType": "Logon",
                    "SourceName": "Microsoft-Windows-Security-Auditing",
                    "TimeGenerated": datetime.now().isoformat(),
                    "Computer": "TEST-WORKSTATION-02",
                    "Message": "An account failed to log on",
                    "LogonType": 3,
                    "TargetUserName": "baduser",
                    "SourceNetworkAddress": "10.20.20.200",
                    "tenant_test": "tenant-B"
                })
            },
            {
                "source_ip": "10.30.30.30",
                "raw_log": json.dumps({
                    "EventID": 1,
                    "EventType": "Process",
                    "SourceName": "Microsoft-Windows-Sysmon",
                    "TimeGenerated": datetime.now().isoformat(),
                    "Computer": "TEST-WORKSTATION-03",
                    "Message": "Process creation",
                    "ProcessName": "mimikatz.exe",
                    "CommandLine": "mimikatz.exe sekurlsa::logonpasswords",
                    "ParentProcessName": "cmd.exe",
                    "tenant_test": "tenant-C"
                })
            }
        ]
        
        success_count = 0
        
        for i, event in enumerate(test_events):
            try:
                # Send to SIEM API
                ingest_request = {"events": [event]}
                response = self.session.post(
                    f"{SIEM_API_BASE}/events",
                    json=ingest_request,
                    headers={"Content-Type": "application/json"},
                    timeout=10
                )
                
                if response.status_code == 202:
                    success_count += 1
                    self.processed_events += 1
                    self.log_result("ingestion", f"Manual Event {i+1}", "PASS", "Event ingested successfully")
                else:
                    self.log_result("ingestion", f"Manual Event {i+1}", "FAIL", f"Status: {response.status_code}, Response: {response.text[:100]}")
                
                time.sleep(0.5)  # Small delay between events
                
            except Exception as e:
                self.log_result("ingestion", f"Manual Event {i+1}", "FAIL", str(e))
        
        return success_count == len(test_events)
    
    def test_simple_rule_creation(self) -> bool:
        """Test simple rule creation with basic format"""
        print("\n📋 Testing Simple Rule Creation")
        print("=" * 50)
        
        # Use correct API format with rule_name field
        simple_rule = {
            "rule_name": "Test Mimikatz Detection",
            "description": "Simple test rule for Mimikatz detection",
            "query": "SELECT * FROM dev.events WHERE raw_event LIKE '%mimikatz%'"
        }
        
        try:
            # Try creating a simple rule first
            response = self.session.post(
                f"{SIEM_API_BASE}/rules",
                json=simple_rule,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code in [200, 201]:
                self.log_result("rules", "Simple Rule Creation", "PASS", "Simple rule created successfully")
                return True
            else:
                self.log_result("rules", "Simple Rule Creation", "FAIL", f"Status: {response.status_code}, Response: {response.text[:200]}")
                
                # Try Sigma rule format
                return self.test_sigma_rule_creation()
                
        except Exception as e:
            self.log_result("rules", "Simple Rule Creation", "FAIL", str(e))
            return False
    
    def test_sigma_rule_creation(self) -> bool:
        """Test Sigma rule creation with corrected format"""
        print("\n📋 Testing Sigma Rule Creation")
        
        # Use correct API format with just sigma_yaml field
        sigma_rule = {
            "sigma_yaml": """
title: Mimikatz Detection
id: test-mimikatz-001
status: experimental
description: Detects Mimikatz credential dumping
logsource:
    product: windows
    service: security
detection:
    selection:
        CommandLine|contains: 'mimikatz'
    condition: selection
falsepositives:
    - Security testing
level: high
"""
        }
        
        try:
            response = self.session.post(
                f"{SIEM_API_BASE}/rules/sigma",
                json=sigma_rule,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code in [200, 201]:
                self.log_result("rules", "Sigma Rule Creation", "PASS", "Sigma rule created successfully")
                return True
            else:
                self.log_result("rules", "Sigma Rule Creation", "FAIL", f"Status: {response.status_code}, Response: {response.text[:200]}")
                return False
                
        except Exception as e:
            self.log_result("rules", "Sigma Rule Creation", "FAIL", str(e))
            return False
    
    def test_data_retrieval(self) -> bool:
        """Test data retrieval and verification"""
        print("\n📊 Testing Data Retrieval")
        print("=" * 50)
        
        # Wait for data to be processed
        time.sleep(5)
        
        try:
            # Get events
            response = self.session.get(f"{SIEM_API_BASE}/events")
            if response.status_code == 200:
                events = response.json()
                event_count = len(events)
                self.log_result("retrieval", "Event Retrieval", "PASS", f"Retrieved {event_count} events")
                
                # Analyze retrieved events
                if events:
                    self.analyze_retrieved_events(events[:5])  # Analyze first 5
                
                return True
            else:
                self.log_result("retrieval", "Event Retrieval", "FAIL", f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("retrieval", "Event Retrieval", "FAIL", str(e))
            return False
    
    def analyze_retrieved_events(self, events: List[Dict[str, Any]]):
        """Analyze retrieved events"""
        print("\n🔍 Analyzing Retrieved Events")
        
        for i, event in enumerate(events):
            print(f"Event {i+1}:")
            print(f"  ID: {event.get('event_id', 'N/A')}")
            print(f"  Timestamp: {event.get('event_timestamp', 'N/A')}")
            print(f"  Source IP: {event.get('source_ip', 'N/A')}")
            print(f"  Category: {event.get('event_category', 'N/A')}")
            print(f"  Parsing Status: {event.get('parsing_status', 'N/A')}")
            
            # Check if raw_event is parsed
            raw_event = event.get('raw_event', '')
            if raw_event:
                try:
                    parsed_raw = json.loads(raw_event)
                    print(f"  Raw Event Keys: {list(parsed_raw.keys())[:5]}...")  # First 5 keys
                except:
                    print(f"  Raw Event: {raw_event[:50]}...")  # First 50 chars
            print()
        
        self.log_result("analysis", "Retrieved Event Analysis", "PASS", f"Analyzed {len(events)} retrieved events")
    
    def test_alert_system(self) -> bool:
        """Test alert generation and retrieval"""
        print("\n🚨 Testing Alert System")
        print("=" * 50)
        
        # Wait for rule engine to process
        time.sleep(10)
        
        try:
            response = self.session.get(f"{SIEM_API_BASE}/alerts")
            if response.status_code == 200:
                data = response.json()
                alerts = data.get('data', [])
                
                if alerts:
                    self.log_result("alerts", "Alert Generation", "PASS", f"Found {len(alerts)} alerts")
                    
                    # Analyze first alert
                    if alerts:
                        alert = alerts[0]
                        print(f"Sample Alert:")
                        print(f"  ID: {alert.get('alert_id', 'N/A')}")
                        print(f"  Rule: {alert.get('rule_name', 'N/A')}")
                        print(f"  Severity: {alert.get('severity', 'N/A')}")
                        print(f"  Timestamp: {alert.get('timestamp', 'N/A')}")
                    
                    return True
                else:
                    self.log_result("alerts", "Alert Generation", "PARTIAL", "No alerts generated yet")
                    return False
            else:
                self.log_result("alerts", "Alert Generation", "FAIL", f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("alerts", "Alert Generation", "FAIL", str(e))
            return False
    
    def generate_focused_report(self):
        """Generate focused test report"""
        print("\n📊 Generating Focused Test Report")
        print("=" * 50)
        
        # Categorize results
        categories = {}
        for result in self.test_results:
            category = result["category"]
            if category not in categories:
                categories[category] = {"total": 0, "passed": 0, "failed": 0}
            
            categories[category]["total"] += 1
            if result["status"] == "PASS":
                categories[category]["passed"] += 1
            else:
                categories[category]["failed"] += 1
        
        # Calculate success rates
        for category, stats in categories.items():
            stats["success_rate"] = (stats["passed"] / stats["total"] * 100) if stats["total"] > 0 else 0
        
        # Generate report
        report = {
            "test_execution": {
                "timestamp": datetime.now().isoformat(),
                "test_type": "Focused SIEM Testing",
                "events_processed": self.processed_events
            },
            "category_summary": categories,
            "detailed_results": self.test_results
        }
        
        # Save report
        report_file = f"focused_siem_test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"📄 Report saved: {report_file}")
        
        # Print summary
        print("\n📈 Focused Test Summary")
        print("=" * 50)
        
        total_tests = sum(stats["total"] for stats in categories.values())
        total_passed = sum(stats["passed"] for stats in categories.values())
        overall_success = (total_passed / total_tests * 100) if total_tests > 0 else 0
        
        print(f"Overall Success Rate: {overall_success:.1f}% ({total_passed}/{total_tests})")
        print(f"Events Processed: {self.processed_events}")
        
        for category, stats in categories.items():
            print(f"{category.title()}: {stats['success_rate']:.1f}% ({stats['passed']}/{stats['total']})")
        
        return overall_success >= 70  # Lower threshold for focused test
    
    def run_focused_test(self) -> bool:
        """Run focused test suite"""
        print("🎯 Starting Focused SIEM Test")
        print("=" * 80)
        
        # Test 1: Dataset Extraction
        extraction_success = self.test_dataset_extraction()
        
        # Test 2: Manual Event Ingestion
        ingestion_success = self.test_manual_event_ingestion()
        
        # Test 3: Rule Creation
        rule_success = self.test_simple_rule_creation()
        
        # Test 4: Data Retrieval
        retrieval_success = self.test_data_retrieval()
        
        # Test 5: Alert System
        alert_success = self.test_alert_system()
        
        # Generate Report
        overall_success = self.generate_focused_report()
        
        if overall_success:
            print("\n✅ FOCUSED TEST PASSED!")
            return True
        else:
            print("\n⚠️  FOCUSED TEST COMPLETED WITH ISSUES")
            return False

def main():
    """Main execution function"""
    tester = FocusedSIEMTester()
    success = tester.run_focused_test()
    
    if success:
        print("\n🎉 Focused testing completed successfully!")
        exit(0)
    else:
        print("\n💡 Focused testing identified areas for improvement.")
        exit(1)

if __name__ == "__main__":
    main()