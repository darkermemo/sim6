#!/usr/bin/env python3
"""
Comprehensive SIEM API Health Probe
Tests all endpoints identified in the Rust backend handlers.rs file
Includes both /api/v1 routes and legacy routes
"""

import requests
import json
import time
from datetime import datetime
from typing import Dict, List, Any
import sys

class SIEMHealthProbe:
    def __init__(self, base_url: str = "http://localhost:8080"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.timeout = 10
        self.results = []
        self.auth_token = None
        
    def log_result(self, method: str, endpoint: str, status_code: int, 
                   response_time: float, success: bool, message: str = ""):
        """Log test result"""
        result = {
            "timestamp": datetime.now().isoformat(),
            "method": method,
            "endpoint": endpoint,
            "status_code": status_code,
            "response_time_ms": round(response_time * 1000, 2),
            "success": success,
            "message": message,
            "critical": status_code >= 500 or not success
        }
        self.results.append(result)
        
        status_emoji = "✅" if success else "❌"
        print(f"{status_emoji} {method} {endpoint} - {status_code} ({response_time*1000:.1f}ms) {message}")
        
    def test_endpoint(self, method: str, endpoint: str, data: Dict = None, 
                     headers: Dict = None, params: Dict = None, 
                     expected_codes: List[int] = None) -> bool:
        """Test a single endpoint"""
        if expected_codes is None:
            expected_codes = [200, 201, 202]
            
        url = f"{self.base_url}{endpoint}"
        
        # Add auth header if we have a token
        request_headers = {"Content-Type": "application/json"}
        if headers:
            request_headers.update(headers)
        if self.auth_token:
            request_headers["Authorization"] = f"Bearer {self.auth_token}"
            
        try:
            start_time = time.time()
            
            if method.upper() == "GET":
                response = self.session.get(url, headers=request_headers, params=params)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=request_headers, params=params)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, headers=request_headers, params=params)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=request_headers, params=params)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            response_time = time.time() - start_time
            success = response.status_code in expected_codes
            
            message = ""
            if not success:
                try:
                    error_data = response.json()
                    message = error_data.get('message', error_data.get('error', ''))
                except:
                    message = response.text[:100] if response.text else "No response body"
                    
            self.log_result(method, endpoint, response.status_code, response_time, success, message)
            return success
            
        except requests.exceptions.RequestException as e:
            self.log_result(method, endpoint, 0, 0, False, str(e))
            return False
            
    def attempt_login(self) -> bool:
        """Attempt to login and get auth token"""
        login_data = {
            "email": "admin@example.com",
            "password": "admin123"
        }
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/v1/auth/login",
                json=login_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get('token') or data.get('access_token')
                print(f"🔐 Login successful, token obtained")
                return True
            else:
                print(f"🔐 Login failed: {response.status_code} - {response.text[:100]}")
                return False
                
        except Exception as e:
            print(f"🔐 Login error: {e}")
            return False
            
    def run_comprehensive_health_check(self):
        """Run comprehensive health check on all SIEM endpoints"""
        print(f"🚀 Starting comprehensive SIEM health probe at {self.base_url}")
        print(f"⏰ Started at: {datetime.now().isoformat()}")
        print("=" * 80)
        
        # Test basic health endpoints first (no auth required)
        print("\n📊 Testing Basic Health & Metrics Endpoints...")
        basic_endpoints = [
            ("GET", "/health"),
            ("GET", "/metrics"),
            ("GET", "/api/v1/health"),
            ("GET", "/api/v1/health/detailed"),
            ("GET", "/api/v1/status"),
            ("GET", "/api/v1/version"),
            ("GET", "/api/v1/metrics"),
            ("GET", "/api/v1/metrics/prometheus"),
            ("GET", "/api/v1/metrics/components"),
            ("GET", "/api/v1/metrics/performance"),
            ("GET", "/api/v1/metrics/historical"),
        ]
        
        for method, endpoint in basic_endpoints:
            self.test_endpoint(method, endpoint)
            
        # Test authentication
        print("\n🔐 Testing Authentication...")
        auth_endpoints = [
            ("POST", "/api/v1/auth/login", {"email": "admin@example.com", "password": "admin123"}),
            ("POST", "/api/v1/auth/refresh", {"refresh_token": "dummy_token"}),
            ("POST", "/api/v1/auth/logout", {}),
        ]
        
        for method, endpoint, data in auth_endpoints:
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 400, 401, 403])
            
        # Attempt login for authenticated endpoints
        login_success = self.attempt_login()
        
        # Test event endpoints
        print("\n📝 Testing Event Endpoints...")
        event_endpoints = [
            ("GET", "/api/v1/events/search"),
            ("GET", "/events/search"),  # Legacy route
            ("POST", "/api/v1/events/ingest", {
                "source": "test_source",
                "data": {"message": "test event", "severity": "info"},
                "metadata": {"test": "true"}
            }),
            ("POST", "/events/ingest", {  # Legacy route
                "source": "test_source",
                "data": {"message": "test event", "severity": "info"}
            }),
            ("POST", "/api/v1/events/batch", {
                "events": [{
                    "source": "test_source",
                    "data": {"message": "batch test event", "severity": "info"}
                }]
            }),
            ("GET", "/api/v1/events/stream"),
            ("GET", "/api/v1/events/test-id"),
        ]
        
        for item in event_endpoints:
            if len(item) == 2:
                method, endpoint = item
                self.test_endpoint(method, endpoint, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            else:
                method, endpoint, data = item
                self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 400, 401, 403, 404, 405])
                
        # Test configuration endpoints
        print("\n⚙️ Testing Configuration Endpoints...")
        config_endpoints = [
            ("GET", "/api/v1/config"),
            ("PUT", "/api/v1/config", {"config": {"test": "value"}}),
            ("POST", "/api/v1/config/validate", {"test": "config"}),
            ("POST", "/api/v1/config/reload", {}),
        ]
        
        for method, endpoint, *args in config_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test routing endpoints
        print("\n🛣️ Testing Routing Endpoints...")
        routing_endpoints = [
            ("GET", "/api/v1/routing/rules"),
            ("POST", "/api/v1/routing/rules", {
                "name": "test_rule",
                "conditions": {"source": "test"},
                "destinations": ["output1"],
                "enabled": True,
                "priority": 1
            }),
            ("GET", "/api/v1/routing/rules/test_rule"),
            ("PUT", "/api/v1/routing/rules/test_rule", {
                "name": "test_rule",
                "conditions": {"source": "test_updated"},
                "destinations": ["output1"],
                "enabled": True,
                "priority": 1
            }),
            ("DELETE", "/api/v1/routing/rules/test_rule"),
        ]
        
        for method, endpoint, *args in routing_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 204, 400, 401, 403, 404, 405])
            
        # Test pipeline endpoints
        print("\n🔄 Testing Pipeline Endpoints...")
        pipeline_endpoints = [
            ("POST", "/api/v1/pipeline/start"),
            ("POST", "/api/v1/pipeline/stop"),
            ("POST", "/api/v1/pipeline/restart"),
            ("GET", "/api/v1/pipeline/stats"),
        ]
        
        for method, endpoint in pipeline_endpoints:
            self.test_endpoint(method, endpoint, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test administrative endpoints
        print("\n🔧 Testing Administrative Endpoints...")
        admin_endpoints = [
            ("POST", "/api/v1/admin/shutdown"),
            ("GET", "/api/v1/admin/logs"),
            ("GET", "/api/v1/admin/debug"),
        ]
        
        for method, endpoint in admin_endpoints:
            self.test_endpoint(method, endpoint, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test agent endpoints
        print("\n🤖 Testing Agent Endpoints...")
        agent_endpoints = [
            ("GET", "/api/v1/agents"),
            ("GET", "/api/v1/agents/policies"),
            ("POST", "/api/v1/agents/policies", {"name": "test_policy"}),
            ("PUT", "/api/v1/agents/policies/test_id", {"name": "updated_policy"}),
            ("GET", "/api/v1/agents/download"),
            ("POST", "/api/v1/agents/assignments", {"agent_id": "test", "policy_id": "test"}),
            ("DELETE", "/api/v1/agents/test_id"),
        ]
        
        for method, endpoint, *args in agent_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 204, 400, 401, 403, 404, 405])
            
        # Test parser endpoints
        print("\n📋 Testing Parser Endpoints...")
        parser_endpoints = [
            ("GET", "/api/v1/parsers"),
            ("GET", "/api/v1/parsers/all"),
            ("POST", "/api/v1/parsers", {"name": "test_parser", "type": "regex"}),
            ("GET", "/api/v1/parsers/test_id"),
            ("PUT", "/api/v1/parsers/test_id", {"name": "updated_parser"}),
            ("DELETE", "/api/v1/parsers/test_id"),
        ]
        
        for method, endpoint, *args in parser_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 204, 400, 401, 403, 404, 405])
            
        # Test taxonomy endpoints
        print("\n🏷️ Testing Taxonomy Endpoints...")
        taxonomy_endpoints = [
            ("GET", "/api/v1/taxonomy/mappings"),
            ("POST", "/api/v1/taxonomy/mappings", {"source_field": "test", "target_field": "test"}),
            ("PUT", "/api/v1/taxonomy/mappings/test_id", {"source_field": "updated"}),
            ("DELETE", "/api/v1/taxonomy/mappings/test_id"),
        ]
        
        for method, endpoint, *args in taxonomy_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 204, 400, 401, 403, 404, 405])
            
        # Test user management endpoints
        print("\n👥 Testing User Management Endpoints...")
        user_endpoints = [
            ("GET", "/api/v1/admin/users"),
            ("POST", "/api/v1/admin/users", {"email": "test@example.com", "password": "test123"}),
            ("GET", "/api/v1/admin/users/test_id"),
            ("PUT", "/api/v1/admin/users/test_id", {"email": "updated@example.com"}),
            ("GET", "/api/v1/admin/users/test_id/roles"),
            ("POST", "/api/v1/admin/users/test_id/roles", {"roles": ["admin"]}),
        ]
        
        for method, endpoint, *args in user_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test tenant endpoints
        print("\n🏢 Testing Tenant Endpoints...")
        tenant_endpoints = [
            ("GET", "/api/v1/tenants"),
            ("POST", "/api/v1/tenants", {"name": "test_tenant"}),
            ("GET", "/api/v1/tenants/test_id"),
            ("PUT", "/api/v1/tenants/test_id", {"name": "updated_tenant"}),
            ("GET", "/api/v1/tenants/metrics"),
            ("GET", "/api/v1/tenants/test_id/parsing-errors"),
        ]
        
        for method, endpoint, *args in tenant_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test alert endpoints
        print("\n🚨 Testing Alert Endpoints...")
        alert_endpoints = [
            ("GET", "/api/v1/alerts"),
            ("POST", "/api/v1/alerts", {
                "title": "Test Alert",
                "severity": "high",
                "description": "Test alert description"
            }),
            ("GET", "/api/v1/alerts/test_id"),
            ("PUT", "/api/v1/alerts/test_id", {"title": "Updated Alert"}),
            ("PUT", "/api/v1/alerts/test_id/status", {"status": "acknowledged"}),
            ("PUT", "/api/v1/alerts/test_id/assignee", {"assignee": "user123"}),
            ("POST", "/api/v1/alerts/test_id/notes", {"note": "Test note"}),
        ]
        
        for method, endpoint, *args in alert_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test case endpoints
        print("\n📋 Testing Case Endpoints...")
        case_endpoints = [
            ("GET", "/api/v1/cases"),
            ("POST", "/api/v1/cases", {"title": "Test Case", "description": "Test case description"}),
            ("GET", "/api/v1/cases/test_id"),
            ("PUT", "/api/v1/cases/test_id", {"title": "Updated Case"}),
        ]
        
        for method, endpoint, *args in case_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test rule endpoints
        print("\n📏 Testing Rule Endpoints...")
        rule_endpoints = [
            ("GET", "/api/v1/rules"),
            ("POST", "/api/v1/rules", {
                "name": "Test Rule",
                "description": "Test rule description",
                "conditions": {"field": "value"}
            }),
            ("GET", "/api/v1/rules/test_id"),
            ("PUT", "/api/v1/rules/test_id", {"name": "Updated Rule"}),
            ("DELETE", "/api/v1/rules/test_id"),
            ("POST", "/api/v1/rules/sigma", {"rule": "sigma rule content"}),
            ("POST", "/api/v1/rules/test", {"rule_id": "test_id", "test_data": {}}),
        ]
        
        for method, endpoint, *args in rule_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 204, 400, 401, 403, 404, 405])
            
        # Test dashboard endpoints
        print("\n📊 Testing Dashboard Endpoints...")
        dashboard_endpoints = [
            ("GET", "/api/v1/dashboard"),
            ("GET", "/api/v1/dashboard/kpis"),
        ]
        
        for method, endpoint in dashboard_endpoints:
            self.test_endpoint(method, endpoint, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test log source endpoints
        print("\n📄 Testing Log Source Endpoints...")
        log_source_endpoints = [
            ("GET", "/api/v1/log-sources"),
            ("POST", "/api/v1/log-sources", {"name": "Test Source", "type": "syslog"}),
            ("GET", "/api/v1/log-sources/test_id"),
            ("PUT", "/api/v1/log-sources/test_id", {"name": "Updated Source"}),
            ("GET", "/api/v1/log-sources/groups"),
            ("GET", "/api/v1/log-sources/by-ip/192.168.1.1"),
            ("GET", "/api/v1/log-sources/stats"),
            ("GET", "/api/v1/log-sources/enhanced"),
        ]
        
        for method, endpoint, *args in log_source_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test asset endpoints
        print("\n🏗️ Testing Asset Endpoints...")
        asset_endpoints = [
            ("GET", "/api/v1/assets/by-ip/192.168.1.1"),
        ]
        
        for method, endpoint in asset_endpoints:
            self.test_endpoint(method, endpoint, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test field endpoints
        print("\n🔍 Testing Field Endpoints...")
        field_endpoints = [
            ("GET", "/api/v1/fields/values"),
            ("GET", "/api/v1/fields/values/multiple"),
        ]
        
        for method, endpoint in field_endpoints:
            self.test_endpoint(method, endpoint, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test EPS endpoints
        print("\n📈 Testing EPS Endpoints...")
        eps_endpoints = [
            ("GET", "/api/v1/eps/stats"),
        ]
        
        for method, endpoint in eps_endpoints:
            self.test_endpoint(method, endpoint, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test role endpoints
        print("\n👑 Testing Role Endpoints...")
        role_endpoints = [
            ("GET", "/api/v1/roles"),
            ("POST", "/api/v1/roles", {"name": "test_role", "permissions": ["read"]}),
        ]
        
        for method, endpoint, *args in role_endpoints:
            data = args[0] if args else None
            self.test_endpoint(method, endpoint, data=data, expected_codes=[200, 201, 400, 401, 403, 404, 405])
            
        # Test error simulation endpoint
        print("\n🧪 Testing Error Simulation Endpoint...")
        self.test_endpoint("POST", "/api/v1/simulate-error", data={"error_type": "test"}, 
                          expected_codes=[200, 201, 400, 401, 403, 404, 405, 500])
        
        self.print_summary()
        
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 80)
        print("📋 COMPREHENSIVE HEALTH CHECK SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results if r['success'])
        failed_tests = total_tests - passed_tests
        critical_failures = sum(1 for r in self.results if r['critical'])
        
        print(f"\n📊 Overall Results:")
        print(f"   Total Tests: {total_tests}")
        print(f"   ✅ Passed: {passed_tests} ({passed_tests/total_tests*100:.1f}%)")
        print(f"   ❌ Failed: {failed_tests} ({failed_tests/total_tests*100:.1f}%)")
        print(f"   🚨 Critical: {critical_failures}")
        
        if failed_tests > 0:
            print(f"\n❌ Failed Tests:")
            for result in self.results:
                if not result['success']:
                    print(f"   {result['method']} {result['endpoint']} - {result['status_code']} - {result['message'][:50]}")
                    
        if critical_failures > 0:
            print(f"\n🚨 Critical Failures:")
            for result in self.results:
                if result['critical']:
                    print(f"   {result['method']} {result['endpoint']} - {result['status_code']} - {result['message'][:50]}")
                    
        # Save detailed results to JSON
        with open('siem_health_report.json', 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'summary': {
                    'total_tests': total_tests,
                    'passed_tests': passed_tests,
                    'failed_tests': failed_tests,
                    'critical_failures': critical_failures,
                    'success_rate': passed_tests/total_tests*100
                },
                'results': self.results
            }, f, indent=2)
            
        print(f"\n💾 Detailed results saved to: siem_health_report.json")
        print(f"⏰ Completed at: {datetime.now().isoformat()}")
        
        # Exit with error code if there are critical failures
        if critical_failures > 0:
            sys.exit(1)
            
def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Comprehensive SIEM API Health Probe')
    parser.add_argument('--url', default='http://localhost:8080', 
                       help='Base URL of the SIEM API (default: http://localhost:8080)')
    
    args = parser.parse_args()
    
    probe = SIEMHealthProbe(args.url)
    probe.run_comprehensive_health_check()
    
if __name__ == "__main__":
    main()