#!/usr/bin/env python3
"""
Comprehensive SIEM API Backend Health Probe
Tests all 50+ critical endpoints including authentication, searches, events, rules, 
collectors, ingestors, log sources, alerts, tenants, users, and database operations.
"""

import requests
import json
import sys
import time
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from urllib.parse import urljoin

@dataclass
class EndpointTest:
    method: str
    path: str
    requires_auth: bool = True
    requires_admin: bool = False
    test_data: Optional[Dict] = None
    description: str = ""
    critical: bool = True

class SIEMHealthProbe:
    def __init__(self, base_url: str = "http://127.0.0.1:8080"):
        self.base_url = base_url
        self.session = requests.Session()
        self.access_token = None
        self.tenant_id = None
        self.test_results = []
        
    def get_comprehensive_endpoints(self) -> List[EndpointTest]:
        """Define all critical SIEM API endpoints for testing"""
        return [
            # Health and System Endpoints
            EndpointTest("GET", "/health", requires_auth=False, description="System health check"),
            EndpointTest("GET", "/metrics", requires_auth=False, description="System metrics"),
            EndpointTest("GET", "/api/v1/version", requires_auth=False, description="API version info"),
            
            # Authentication Endpoints
            EndpointTest("POST", "/api/v1/auth/login", requires_auth=False, 
                        test_data={"email": "admin@example.com", "password": "admin123"}, 
                        description="User authentication"),
            EndpointTest("POST", "/api/v1/auth/refresh", description="Token refresh"),
            EndpointTest("POST", "/api/v1/auth/logout", description="User logout"),
            
            # Dashboard and Analytics
            EndpointTest("GET", "/api/v1/dashboard", description="Main dashboard data"),
            EndpointTest("GET", "/api/v1/dashboard/kpis", description="Key performance indicators"),
            
            # Tenant Management
            EndpointTest("GET", "/api/v1/tenants", description="List all tenants"),
            EndpointTest("POST", "/api/v1/tenants", requires_admin=True, 
                        test_data={"name": "test-tenant", "description": "Test tenant"}, 
                        description="Create tenant"),
            EndpointTest("GET", "/api/v1/tenants/metrics", description="Tenant metrics"),
            
            # Event Search and Management (Critical)
            EndpointTest("GET", "/api/v1/events/search", description="Event search - CRITICAL", critical=True),
            EndpointTest("POST", "/api/v1/events/search", 
                        test_data={"query": "*", "limit": 10}, 
                        description="Advanced event search - CRITICAL", critical=True),
            EndpointTest("POST", "/api/v1/events/ingest", 
                        test_data={"source": "test", "data": {"message": "test event"}}, 
                        description="Event ingestion - CRITICAL", critical=True),
            EndpointTest("POST", "/api/v1/events/batch", 
                        test_data={"events": [{"source": "test", "data": {"message": "batch test"}}]}, 
                        description="Batch event ingestion - CRITICAL", critical=True),
            EndpointTest("GET", "/api/v1/events/stream", description="Event streaming", critical=False),
            
            # Log Sources (Critical for Data Ingestion)
            EndpointTest("GET", "/api/v1/log-sources", description="List log sources - CRITICAL", critical=True),
            EndpointTest("GET", "/api/v1/log_sources", description="Enhanced log sources - CRITICAL", critical=True),
            EndpointTest("GET", "/api/v1/log_sources/enhanced", description="Enhanced log source details", critical=True),
            EndpointTest("GET", "/api/v1/log_sources/stats", description="Log source statistics - CRITICAL", critical=True),
            EndpointTest("GET", "/api/v1/log_sources/groups", description="Log source groups", critical=True),
            EndpointTest("GET", "/api/v1/log_sources/cache", requires_auth=False, description="Log source cache", critical=True),
            
            # Alerts Management (Critical)
            EndpointTest("GET", "/api/v1/alerts", description="List alerts - CRITICAL", critical=True),
            EndpointTest("POST", "/api/v1/alerts", 
                        test_data={"title": "Test Alert", "severity": "medium"}, 
                        description="Create alert - CRITICAL", critical=True),
            
            # Rules Engine (Critical)
            EndpointTest("GET", "/api/v1/rules", description="List detection rules - CRITICAL", critical=True),
            EndpointTest("POST", "/api/v1/rules", 
                        test_data={"name": "test-rule", "query": "*", "enabled": True}, 
                        description="Create rule - CRITICAL", critical=True),
            EndpointTest("POST", "/api/v1/rules/test", 
                        test_data={"query": "*"}, 
                        description="Test rule query - CRITICAL", critical=True),
            EndpointTest("POST", "/api/v1/rules/sigma", 
                        test_data={"sigma_yaml": "title: Test\ndetection:\n  condition: selection\nselection:\n  field: value"}, 
                        description="Sigma rule creation - CRITICAL", critical=True),
            
            # Cases Management
            EndpointTest("GET", "/api/v1/cases", description="List investigation cases"),
            EndpointTest("POST", "/api/v1/cases", 
                        test_data={"title": "Test Case", "description": "Test case"}, 
                        description="Create case"),
            
            # Agent Management (Critical for Data Collection)
            EndpointTest("GET", "/api/v1/agents", description="List agents - CRITICAL", critical=True),
            EndpointTest("GET", "/api/v1/agents/fleet", description="Agent fleet status - CRITICAL", critical=True),
            EndpointTest("GET", "/api/v1/agents/policies", description="Agent policies - CRITICAL", critical=True),
            EndpointTest("POST", "/api/v1/agents/policies", 
                        test_data={"name": "test-policy", "config": {}}, 
                        description="Create agent policy", critical=True),
            EndpointTest("POST", "/api/v1/agents/assignments", 
                        test_data={"agent_id": "test", "policy_id": "test"}, 
                        description="Assign agent policy", critical=True),
            
            # User Management
            EndpointTest("GET", "/api/v1/admin/users", requires_admin=True, description="List users (admin)"),
            EndpointTest("GET", "/api/v1/users", description="List users"),
            EndpointTest("POST", "/api/v1/users", requires_admin=True, 
                        test_data={"username": "testuser", "email": "test@example.com"}, 
                        description="Create user"),
            EndpointTest("GET", "/api/v1/roles", description="List roles"),
            
            # Field Values and Search Support (Critical for UI)
            EndpointTest("GET", "/api/v1/fields/values", description="Field values - CRITICAL", critical=True),
            EndpointTest("GET", "/api/v1/fields/values/multiple", description="Multiple field values", critical=True),
            EndpointTest("GET", "/api/v1/fields/multiple-values", description="Multiple field values alt", critical=False),
            
            # Statistics and Monitoring (Critical)
            EndpointTest("GET", "/api/v1/stats/eps", description="Events per second stats - CRITICAL", critical=True),
            EndpointTest("GET", "/api/v1/status", description="System status - CRITICAL", critical=True),
            EndpointTest("GET", "/api/v1/admin/debug", requires_admin=True, description="Debug information", critical=False),
            EndpointTest("GET", "/api/v1/admin/logs", requires_admin=True, description="System logs", critical=False),
            
            # Asset Management
            EndpointTest("GET", "/api/v1/assets", description="List assets"),
            
            # Parser Management (Critical for Log Processing)
            EndpointTest("GET", "/api/v1/parsers", description="List parsers - CRITICAL", critical=True),
            EndpointTest("POST", "/api/v1/parsers", 
                        test_data={"name": "test-parser", "pattern": ".*"}, 
                        description="Create parser - CRITICAL", critical=True),
            
            # Taxonomy Management
            EndpointTest("GET", "/api/v1/taxonomy/mappings", description="Taxonomy mappings"),
            EndpointTest("POST", "/api/v1/taxonomy/mappings", 
                        test_data={"source_field": "test", "target_field": "test"}, 
                        description="Create taxonomy mapping"),
            
            # UEBA (User and Entity Behavior Analytics)
            EndpointTest("GET", "/api/v1/ueba/baselines", description="UEBA baselines"),
            EndpointTest("POST", "/api/v1/ueba/baselines", 
                        test_data={"baselines": []}, 
                        description="Create UEBA baselines"),
            
            # Additional Endpoints
            EndpointTest("GET", "/api/v1/routing/rules", description="Routing rules - CRITICAL", critical=True),
            EndpointTest("GET", "/api/v1/pipeline/stats", description="Pipeline statistics - CRITICAL", critical=True),
            EndpointTest("POST", "/api/v1/pipeline/start", description="Start pipeline", critical=False),
            EndpointTest("POST", "/api/v1/pipeline/stop", description="Stop pipeline", critical=False),
            EndpointTest("GET", "/api/v1/metrics/prometheus", description="Prometheus metrics", critical=False),
            EndpointTest("GET", "/api/v1/assets/by-ip/192.168.1.1", description="Asset by IP", critical=False),
            EndpointTest("POST", "/api/v1/config/validate", 
                        test_data={"test": "config"}, 
                        description="Config validation", critical=False),
            EndpointTest("POST", "/api/v1/config/reload", description="Config reload", critical=False),
        ]
    
    def authenticate(self) -> bool:
        """Attempt to authenticate with the API"""
        try:
            response = self.session.post(
                urljoin(self.base_url, "/api/v1/auth/login"),
                json={"email": "admin@example.com", "password": "admin123"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.access_token = data.get("access_token")
                self.tenant_id = data.get("tenant_id")
                
                if self.access_token:
                    self.session.headers.update({
                        "Authorization": f"Bearer {self.access_token}"
                    })
                    print("✅ Authentication successful")
                    return True
            
            print(f"❌ Authentication failed: {response.status_code} - {response.text}")
            return False
            
        except Exception as e:
            print(f"❌ Authentication error: {e}")
            return False
    
    def test_endpoint(self, endpoint: EndpointTest) -> Tuple[bool, str, int]:
        """Test a single endpoint"""
        try:
            url = urljoin(self.base_url, endpoint.path)
            
            # Prepare request
            kwargs = {"timeout": 10}
            if endpoint.test_data:
                kwargs["json"] = endpoint.test_data
            
            # Make request
            if endpoint.method == "GET":
                response = self.session.get(url, **kwargs)
            elif endpoint.method == "POST":
                response = self.session.post(url, **kwargs)
            elif endpoint.method == "PUT":
                response = self.session.put(url, **kwargs)
            elif endpoint.method == "DELETE":
                response = self.session.delete(url, **kwargs)
            elif endpoint.method == "PATCH":
                response = self.session.patch(url, **kwargs)
            else:
                return False, f"Unsupported method: {endpoint.method}", 0
            
            # Evaluate response
            success = 200 <= response.status_code < 300
            
            if success:
                try:
                    # Try to parse JSON to ensure valid response
                    response.json()
                    message = "OK"
                except:
                    message = "OK (non-JSON)"
            else:
                message = response.text[:100] if response.text else "No response body"
            
            return success, message, response.status_code
            
        except requests.exceptions.Timeout:
            return False, "Request timeout", 0
        except requests.exceptions.ConnectionError:
            return False, "Connection error", 0
        except Exception as e:
            return False, f"Error: {str(e)}", 0
    
    def run_comprehensive_test(self) -> Dict:
        """Run comprehensive test of all endpoints"""
        print("🔍 Starting Comprehensive SIEM API Health Probe")
        print(f"🎯 Target: {self.base_url}")
        print("="*80)
        
        endpoints = self.get_comprehensive_endpoints()
        
        # Test non-auth endpoints first
        print("\n📋 Testing System Endpoints (No Auth Required)")
        print("-" * 50)
        
        system_endpoints = [ep for ep in endpoints if not ep.requires_auth]
        for endpoint in system_endpoints:
            success, message, status_code = self.test_endpoint(endpoint)
            status_icon = "✅" if success else "❌"
            critical_marker = " [CRITICAL]" if endpoint.critical else ""
            
            print(f"{status_icon} {endpoint.method:6} {endpoint.path:40} {status_code:3d} - {endpoint.description}{critical_marker}")
            
            self.test_results.append({
                "endpoint": f"{endpoint.method} {endpoint.path}",
                "success": success,
                "status_code": status_code,
                "message": message,
                "critical": endpoint.critical,
                "description": endpoint.description
            })
        
        # Attempt authentication
        print("\n🔐 Testing Authentication")
        print("-" * 30)
        auth_success = self.authenticate()
        
        if not auth_success:
            print("⚠️  Authentication failed - testing remaining endpoints without auth")
        
        # Test authenticated endpoints
        print("\n🔒 Testing Authenticated Endpoints")
        print("-" * 40)
        
        auth_endpoints = [ep for ep in endpoints if ep.requires_auth]
        critical_failures = 0
        total_critical = 0
        
        for endpoint in auth_endpoints:
            success, message, status_code = self.test_endpoint(endpoint)
            status_icon = "✅" if success else "❌"
            critical_marker = " [CRITICAL]" if endpoint.critical else ""
            
            if endpoint.critical:
                total_critical += 1
                if not success:
                    critical_failures += 1
            
            print(f"{status_icon} {endpoint.method:6} {endpoint.path:40} {status_code:3d} - {endpoint.description}{critical_marker}")
            
            self.test_results.append({
                "endpoint": f"{endpoint.method} {endpoint.path}",
                "success": success,
                "status_code": status_code,
                "message": message,
                "critical": endpoint.critical,
                "description": endpoint.description
            })
        
        # Generate summary
        total_tests = len(self.test_results)
        successful_tests = sum(1 for r in self.test_results if r["success"])
        failed_tests = total_tests - successful_tests
        
        print("\n" + "="*80)
        print("📊 COMPREHENSIVE TEST SUMMARY")
        print("="*80)
        print(f"Total Endpoints Tested: {total_tests}")
        print(f"✅ Successful: {successful_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"🔥 Critical Endpoints: {total_critical}")
        print(f"💥 Critical Failures: {critical_failures}")
        
        if critical_failures > 0:
            print(f"\n⚠️  WARNING: {critical_failures} CRITICAL endpoints are failing!")
            print("Critical failures detected in:")
            for result in self.test_results:
                if result["critical"] and not result["success"]:
                    print(f"  - {result['endpoint']} - {result['description']}")
        
        success_rate = (successful_tests / total_tests) * 100
        critical_success_rate = ((total_critical - critical_failures) / total_critical * 100) if total_critical > 0 else 100
        
        print(f"\n📈 Overall Success Rate: {success_rate:.1f}%")
        print(f"🎯 Critical Success Rate: {critical_success_rate:.1f}%")
        
        if success_rate >= 90 and critical_failures == 0:
            print("\n🎉 SIEM API Backend is HEALTHY! All critical systems operational.")
            overall_status = "HEALTHY"
        elif success_rate >= 70 and critical_failures <= 2:
            print("\n⚠️  SIEM API Backend has MINOR ISSUES. Most systems operational.")
            overall_status = "DEGRADED"
        else:
            print("\n🚨 SIEM API Backend has MAJOR ISSUES! Critical systems failing.")
            overall_status = "UNHEALTHY"
        
        return {
            "status": overall_status,
            "total_tests": total_tests,
            "successful_tests": successful_tests,
            "failed_tests": failed_tests,
            "critical_failures": critical_failures,
            "success_rate": success_rate,
            "critical_success_rate": critical_success_rate,
            "authenticated": auth_success,
            "results": self.test_results
        }

def main():
    """Main execution function"""
    probe = SIEMHealthProbe()
    results = probe.run_comprehensive_test()
    
    # Save detailed results
    with open("siem_health_report.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n📄 Detailed report saved to: siem_health_report.json")
    
    # Exit with appropriate code
    if results["status"] == "HEALTHY":
        sys.exit(0)
    elif results["status"] == "DEGRADED":
        sys.exit(1)
    else:
        sys.exit(2)

if __name__ == "__main__":
    main()