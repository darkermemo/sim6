#!/usr/bin/env python3
"""
SIEM Unstructured Log Ingestion Diagnostic Tool

This script tests the current SIEM pipeline's ability to handle unstructured logs
and identifies data loss scenarios across both ingestion paths:
1. siem_ingestor → Kafka → siem_consumer → ClickHouse
2. siem_clickhouse_ingestion → ClickHouse (direct)

Usage: python3 diagnose_unstructured_logs.py
"""

import json
import requests
import time
import uuid
from typing import Dict, List, Any, Optional
import clickhouse_connect
from datetime import datetime
import base64
import os

class UnstructuredLogDiagnostic:
    def __init__(self):
        # Configuration
        self.siem_ingestor_url = "http://localhost:8081"
        self.clickhouse_ingestion_url = "http://localhost:8081"
        self.clickhouse_host = "localhost"
        self.clickhouse_port = 8123
        self.clickhouse_db = "dev"
        self.tenant_id = "tenant1"
        self.api_key = "test-api-key"
        
        # Test cases for unstructured logs
        self.test_cases = [
            {
                "name": "malformed_json",
                "data": '{"incomplete": json, "missing_quote: true}',
                "description": "Malformed JSON with syntax errors"
            },
            {
                "name": "plain_text",
                "data": "This is a simple log message without any structure",
                "description": "Plain text log message"
            },
            {
                "name": "mixed_format",
                "data": '2024-01-01 12:00:00 ERROR: Database connection failed {"error_code": 500, "retry_count": 3}',
                "description": "Mixed format with timestamp, level, and JSON"
            },
            {
                "name": "syslog_format",
                "data": "<134>Jan 1 12:00:00 server01 nginx: 192.168.1.100 - - [01/Jan/2024:12:00:00 +0000] GET /api/health HTTP/1.1 200",
                "description": "Standard syslog format"
            },
            {
                "name": "binary_encoded",
                "data": base64.b64encode(b"\x00\x01\x02\x03Binary data content").decode(),
                "description": "Base64 encoded binary data"
            },
            {
                "name": "large_payload",
                "data": "Large log entry: " + "A" * 10000,
                "description": "Large payload (10KB+)"
            },
            {
                "name": "empty_log",
                "data": "",
                "description": "Empty log message"
            },
            {
                "name": "special_characters",
                "data": "Log with special chars: \n\t\r\\\"\u0000\u001f",
                "description": "Log with special characters and escape sequences"
            },
            {
                "name": "nested_json",
                "data": json.dumps({
                    "level": "INFO",
                    "message": "User action",
                    "user": {
                        "id": 12345,
                        "name": "john.doe",
                        "metadata": {
                            "session": "abc123",
                            "ip": "192.168.1.100"
                        }
                    },
                    "timestamp": "2024-01-01T12:00:00Z"
                }),
                "description": "Valid nested JSON structure"
            },
            {
                "name": "xml_format",
                "data": '<?xml version="1.0"?><log><level>ERROR</level><message>System failure</message><timestamp>2024-01-01T12:00:00Z</timestamp></log>',
                "description": "XML formatted log"
            }
        ]
        
        self.results = []
        
    def test_siem_ingestor_path(self, test_case: Dict[str, str]) -> Dict[str, Any]:
        """Test ingestion via siem_ingestor (HTTP endpoint)"""
        try:
            # Send to siem_ingestor /ingest/raw endpoint
            # Format the data as expected by the service
            payload = {
                "logs": [test_case["data"]],
                "metadata": {
                    "test_case": test_case["name"],
                    "source": "diagnostic_tool"
                }
            }
            response = requests.post(
                f"{self.siem_ingestor_url}/ingest/raw",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            return {
                "success": response.status_code == 200,
                "status_code": response.status_code,
                "response": response.text,
                "error": None
            }
        except Exception as e:
            return {
                "success": False,
                "status_code": None,
                "response": None,
                "error": str(e)
            }
    
    def test_clickhouse_ingestion_path(self, test_case: Dict[str, str]) -> Dict[str, Any]:
        """Test ingestion via siem_clickhouse_ingestion (direct)"""
        try:
            # Prepare payload for ClickHouse ingestion service
            payload = {
                "logs": [test_case["data"]],
                "metadata": {
                    "source": "diagnostic_test",
                    "test_case": test_case["name"]
                }
            }
            
            response = requests.post(
                f"{self.clickhouse_ingestion_url}/ingest/{self.tenant_id}",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": self.api_key
                },
                timeout=10
            )
            
            return {
                "success": response.status_code == 200,
                "status_code": response.status_code,
                "response": response.text,
                "error": None
            }
        except Exception as e:
            return {
                "success": False,
                "status_code": None,
                "response": None,
                "error": str(e)
            }
    
    def check_data_in_clickhouse(self, test_case_data: str, wait_seconds: int = 5) -> Dict[str, Any]:
        """Check if test data made it to ClickHouse"""
        time.sleep(wait_seconds)  # Wait for data to be processed
        
        try:
            client = clickhouse_connect.get_client(
                host=self.clickhouse_host,
                port=self.clickhouse_port,
                database=self.clickhouse_db
            )
            
            # Check events_tenant1 table for our test data (default tenant)
            query = """
            SELECT 
                event_id,
                tenant_id,
                raw_event,
                parsing_status,
                parse_error_msg,
                timestamp,
                ingestion_time
            FROM events_tenant1 
            WHERE raw_event LIKE %s 
            ORDER BY ingestion_time DESC 
            LIMIT 10
            """
            
            # Search for our test data - use a substring of the actual data
            # For very long data, use first 50 characters to avoid issues
            search_substring = test_case_data[:50] if len(test_case_data) > 50 else test_case_data
            search_pattern = f"%{search_substring}%"
            result = client.query(query, [search_pattern])
            
            return {
                "found": len(result.result_rows) > 0,
                "count": len(result.result_rows),
                "rows": result.result_rows,
                "error": None
            }
        except Exception as e:
            return {
                "found": False,
                "count": 0,
                "rows": [],
                "error": str(e)
            }
    
    def run_diagnostic(self) -> None:
        """Run complete diagnostic test suite"""
        print("🔍 SIEM Unstructured Log Ingestion Diagnostic")
        print("=" * 50)
        print(f"Testing {len(self.test_cases)} unstructured log formats...\n")
        
        for i, test_case in enumerate(self.test_cases, 1):
            print(f"Test {i}/{len(self.test_cases)}: {test_case['name']}")
            print(f"Description: {test_case['description']}")
            print(f"Data preview: {test_case['data'][:100]}{'...' if len(test_case['data']) > 100 else ''}")
            
            # Test both ingestion paths
            ingestor_result = self.test_siem_ingestor_path(test_case)
            clickhouse_result = self.test_clickhouse_ingestion_path(test_case)
            
            # Check if data made it to ClickHouse
            ch_verification = self.check_data_in_clickhouse(test_case["data"])
            
            result = {
                "test_case": test_case["name"],
                "description": test_case["description"],
                "data_size": len(test_case["data"]),
                "siem_ingestor": ingestor_result,
                "clickhouse_ingestion": clickhouse_result,
                "clickhouse_verification": ch_verification,
                "timestamp": datetime.now().isoformat()
            }
            
            self.results.append(result)
            
            # Print immediate results
            print(f"  📊 siem_ingestor: {'✅' if ingestor_result['success'] else '❌'} ({ingestor_result.get('status_code', 'N/A')})")
            print(f"  📊 clickhouse_ingestion: {'✅' if clickhouse_result['success'] else '❌'} ({clickhouse_result.get('status_code', 'N/A')})")
            print(f"  📊 ClickHouse verification: {'✅' if ch_verification['found'] else '❌'} ({ch_verification['count']} rows)")
            
            if not ingestor_result['success'] or not clickhouse_result['success'] or not ch_verification['found']:
                print(f"  ⚠️  POTENTIAL DATA LOSS DETECTED")
            
            print()
    
    def generate_report(self) -> None:
        """Generate comprehensive diagnostic report"""
        print("\n📋 DIAGNOSTIC REPORT")
        print("=" * 50)
        
        total_tests = len(self.results)
        ingestor_success = sum(1 for r in self.results if r['siem_ingestor']['success'])
        clickhouse_success = sum(1 for r in self.results if r['clickhouse_ingestion']['success'])
        data_verified = sum(1 for r in self.results if r['clickhouse_verification']['found'])
        
        print(f"Total test cases: {total_tests}")
        print(f"siem_ingestor success rate: {ingestor_success}/{total_tests} ({ingestor_success/total_tests*100:.1f}%)")
        print(f"clickhouse_ingestion success rate: {clickhouse_success}/{total_tests} ({clickhouse_success/total_tests*100:.1f}%)")
        print(f"Data verification success rate: {data_verified}/{total_tests} ({data_verified/total_tests*100:.1f}%)")
        
        # Identify failures
        failures = [r for r in self.results if not r['siem_ingestor']['success'] or 
                   not r['clickhouse_ingestion']['success'] or 
                   not r['clickhouse_verification']['found']]
        
        if failures:
            print(f"\n❌ FAILURES DETECTED ({len(failures)} cases):")
            for failure in failures:
                print(f"  - {failure['test_case']}: {failure['description']}")
                if not failure['siem_ingestor']['success']:
                    print(f"    siem_ingestor error: {failure['siem_ingestor'].get('error', 'HTTP ' + str(failure['siem_ingestor'].get('status_code')))}")
                if not failure['clickhouse_ingestion']['success']:
                    print(f"    clickhouse_ingestion error: {failure['clickhouse_ingestion'].get('error', 'HTTP ' + str(failure['clickhouse_ingestion'].get('status_code')))}")
                if not failure['clickhouse_verification']['found']:
                    print(f"    ClickHouse verification: Data not found (error: {failure['clickhouse_verification'].get('error', 'No error')})")
        else:
            print("\n✅ ALL TESTS PASSED - No data loss detected")
        
        # Save detailed results
        report_file = f"unstructured_log_diagnostic_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_file, 'w') as f:
            json.dump(self.results, f, indent=2)
        
        print(f"\n📄 Detailed results saved to: {report_file}")
        
        # Recommendations
        print("\n💡 RECOMMENDATIONS:")
        if data_verified < total_tests:
            print("  1. Implement universal log acceptance in ingestion services")
            print("  2. Add fallback mechanisms for unparseable logs")
            print("  3. Ensure raw_event field preserves original data")
            print("  4. Add proper error tracking and parsing_status fields")
        
        if clickhouse_success < ingestor_success:
            print("  5. Fix schema mismatch in siem_clickhouse_ingestion service")
            print("  6. Align with full CIM schema from database_setup.sql")
        
        print("  7. Add comprehensive monitoring for data loss scenarios")
        print("  8. Implement automated testing for edge cases")

def main():
    diagnostic = UnstructuredLogDiagnostic()
    diagnostic.run_diagnostic()
    diagnostic.generate_report()

if __name__ == "__main__":
    main()