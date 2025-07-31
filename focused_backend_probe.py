#!/usr/bin/env python3
"""
Focused SIEM Backend Health Probe
Tests only the endpoints that are actually implemented in the Rust backend.
"""

import requests
import json
import time
from datetime import datetime
from urllib.parse import urljoin
from typing import Dict, List, Optional

class FocusedSIEMProbe:
    def __init__(self, base_url: str = "http://127.0.0.1:8080"):
        self.base_url = base_url
        self.session = requests.Session()
        self.results = []
        
    def test_endpoint(self, method: str, path: str, description: str, 
                     critical: bool = False, data: Optional[Dict] = None) -> Dict:
        """Test a single endpoint"""
        url = urljoin(self.base_url, path)
        start_time = time.time()
        
        try:
            if method == "GET":
                response = self.session.get(url, timeout=10)
            elif method == "POST":
                response = self.session.post(url, json=data or {}, timeout=10)
            elif method == "PUT":
                response = self.session.put(url, json=data or {}, timeout=10)
            elif method == "DELETE":
                response = self.session.delete(url, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            response_time = (time.time() - start_time) * 1000
            
            result = {
                "method": method,
                "path": path,
                "description": description,
                "status_code": response.status_code,
                "response_time_ms": round(response_time, 2),
                "critical": critical,
                "success": 200 <= response.status_code < 300,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Try to parse JSON response
            try:
                result["response_data"] = response.json()
            except:
                result["response_text"] = response.text[:200] if response.text else ""
                
            return result
            
        except Exception as e:
            return {
                "method": method,
                "path": path,
                "description": description,
                "error": str(e),
                "critical": critical,
                "success": False,
                "timestamp": datetime.utcnow().isoformat()
            }
    
    def run_probe(self):
        """Run the focused health probe"""
        print("🔍 Starting Focused SIEM API Health Probe")
        print(f"🎯 Target: {self.base_url}")
        print("=" * 80)
        
        # Define actually implemented endpoints based on handlers.rs
        endpoints = [
            # Health and status endpoints (always work)
            {"method": "GET", "path": "/health", "description": "Basic health check", "critical": True},
            {"method": "GET", "path": "/metrics", "description": "System metrics", "critical": True},
            {"method": "GET", "path": "/api/v1/version", "description": "API version", "critical": True},
            {"method": "GET", "path": "/api/v1/health", "description": "API health check", "critical": True},
            {"method": "GET", "path": "/api/v1/health/detailed", "description": "Detailed health check", "critical": True},
            {"method": "GET", "path": "/api/v1/status", "description": "System status", "critical": True},
            
            # Metrics endpoints
            {"method": "GET", "path": "/api/v1/metrics", "description": "API metrics", "critical": True},
            {"method": "GET", "path": "/api/v1/metrics/prometheus", "description": "Prometheus metrics", "critical": False},
            {"method": "GET", "path": "/api/v1/metrics/components", "description": "Component metrics", "critical": False},
            {"method": "GET", "path": "/api/v1/metrics/performance", "description": "Performance metrics", "critical": False},
            {"method": "GET", "path": "/api/v1/metrics/historical", "description": "Historical metrics", "critical": False},
            
            # Event endpoints
            {"method": "POST", "path": "/api/v1/events/ingest", "description": "Event ingestion", "critical": True,
             "data": {"source": "test", "data": {"message": "test event"}}},
            {"method": "POST", "path": "/api/v1/events/batch", "description": "Batch event ingestion", "critical": True,
             "data": {"events": [{"source": "test", "data": {"message": "batch test"}}]}},
            {"method": "GET", "path": "/api/v1/events/search", "description": "Event search", "critical": True},
            {"method": "GET", "path": "/api/v1/events/stream", "description": "Event streaming", "critical": False},
            
            # Configuration endpoints
            {"method": "GET", "path": "/api/v1/config", "description": "Get configuration", "critical": True},
            {"method": "POST", "path": "/api/v1/config/validate", "description": "Validate config", "critical": False,
             "data": {"test": "config"}},
            {"method": "POST", "path": "/api/v1/config/reload", "description": "Reload config", "critical": False},
            
            # Routing endpoints
            {"method": "GET", "path": "/api/v1/routing/rules", "description": "Routing rules", "critical": True},
            
            # Pipeline endpoints
            {"method": "GET", "path": "/api/v1/pipeline/stats", "description": "Pipeline statistics", "critical": True},
            {"method": "POST", "path": "/api/v1/pipeline/start", "description": "Start pipeline", "critical": False},
            {"method": "POST", "path": "/api/v1/pipeline/stop", "description": "Stop pipeline", "critical": False},
            {"method": "POST", "path": "/api/v1/pipeline/restart", "description": "Restart pipeline", "critical": False},
            
            # Agent endpoints
            {"method": "GET", "path": "/api/v1/agents", "description": "Agent fleet", "critical": True},
            {"method": "GET", "path": "/api/v1/agents/fleet", "description": "Agent fleet details", "critical": False},
            {"method": "GET", "path": "/api/v1/agents/policies", "description": "Agent policies", "critical": False},
            
            # Parser endpoints
            {"method": "GET", "path": "/api/v1/parsers", "description": "Parsers list", "critical": True},
            {"method": "GET", "path": "/api/v1/parsers/all", "description": "All parsers", "critical": False},
            
            # Authentication endpoints (will likely fail without proper setup)
            {"method": "POST", "path": "/api/v1/auth/login", "description": "User login", "critical": True,
             "data": {"email": "admin@example.com", "password": "admin123"}},
            {"method": "POST", "path": "/api/v1/auth/refresh", "description": "Token refresh", "critical": False},
            {"method": "POST", "path": "/api/v1/auth/logout", "description": "User logout", "critical": False},
            
            # User management
            {"method": "GET", "path": "/api/v1/admin/users", "description": "List users", "critical": False},
            
            # Tenant management
            {"method": "GET", "path": "/api/v1/tenants", "description": "List tenants", "critical": True},
            
            # Alert management
            {"method": "GET", "path": "/api/v1/alerts", "description": "List alerts", "critical": True},
            
            # Case management
            {"method": "GET", "path": "/api/v1/cases", "description": "List cases", "critical": True},
            
            # Rule management
            {"method": "GET", "path": "/api/v1/rules", "description": "List rules", "critical": True},
            
            # Dashboard
            {"method": "GET", "path": "/api/v1/dashboard", "description": "Dashboard data", "critical": True},
            {"method": "GET", "path": "/api/v1/dashboard/kpis", "description": "Dashboard KPIs", "critical": False},
            
            # Log sources
            {"method": "GET", "path": "/api/v1/log-sources", "description": "Log sources", "critical": True},
            {"method": "GET", "path": "/api/v1/log-sources/stats", "description": "Log source stats", "critical": True},
            {"method": "GET", "path": "/api/v1/log-sources/groups", "description": "Log source groups", "critical": False},
            {"method": "GET", "path": "/api/v1/log-sources/enhanced", "description": "Enhanced log sources", "critical": False},
            
            # Field values
            {"method": "GET", "path": "/api/v1/fields/values", "description": "Field values", "critical": False},
            {"method": "GET", "path": "/api/v1/fields/multiple-values", "description": "Multiple field values", "critical": False},
            
            # EPS stats
            {"method": "GET", "path": "/api/v1/eps/stats", "description": "Events per second stats", "critical": True},
            
            # Administrative endpoints
            {"method": "GET", "path": "/api/v1/admin/debug", "description": "Debug information", "critical": False},
            {"method": "GET", "path": "/api/v1/admin/logs", "description": "System logs", "critical": False},
        ]
        
        # Test all endpoints
        total_tests = len(endpoints)
        passed_tests = 0
        critical_tests = 0
        critical_passed = 0
        
        print(f"\n📋 Testing {total_tests} Implemented Endpoints")
        print("-" * 50)
        
        for endpoint in endpoints:
            result = self.test_endpoint(
                endpoint["method"],
                endpoint["path"],
                endpoint["description"],
                endpoint.get("critical", False),
                endpoint.get("data")
            )
            
            self.results.append(result)
            
            if result["success"]:
                status_icon = "✅"
                passed_tests += 1
                if result["critical"]:
                    critical_passed += 1
            else:
                status_icon = "❌"
                
            if result["critical"]:
                critical_tests += 1
                critical_indicator = "[CRITICAL]"
            else:
                critical_indicator = ""
                
            status_code = result.get("status_code", "ERR")
            response_time = result.get("response_time_ms", 0)
            
            print(f"{status_icon} {endpoint['method']:<6} {endpoint['path']:<40} {status_code} - {endpoint['description']} {critical_indicator}")
            
            # Brief pause between requests
            time.sleep(0.1)
        
        # Summary
        print("\n" + "=" * 80)
        print("📊 PROBE SUMMARY")
        print("=" * 80)
        
        success_rate = (passed_tests / total_tests) * 100 if total_tests > 0 else 0
        critical_success_rate = (critical_passed / critical_tests) * 100 if critical_tests > 0 else 0
        
        print(f"Total Endpoints Tested: {total_tests}")
        print(f"Successful Tests: {passed_tests}")
        print(f"Failed Tests: {total_tests - passed_tests}")
        print(f"Overall Success Rate: {success_rate:.1f}%")
        print(f"")
        print(f"Critical Endpoints: {critical_tests}")
        print(f"Critical Passed: {critical_passed}")
        print(f"Critical Success Rate: {critical_success_rate:.1f}%")
        
        # Health assessment
        if critical_success_rate >= 80:
            health_status = "🟢 HEALTHY"
        elif critical_success_rate >= 60:
            health_status = "🟡 DEGRADED"
        else:
            health_status = "🔴 UNHEALTHY"
            
        print(f"\nSystem Health: {health_status}")
        
        # Save detailed results
        report_file = "focused_siem_health_report.json"
        with open(report_file, 'w') as f:
            json.dump({
                "timestamp": datetime.utcnow().isoformat(),
                "summary": {
                    "total_tests": total_tests,
                    "passed_tests": passed_tests,
                    "failed_tests": total_tests - passed_tests,
                    "success_rate": success_rate,
                    "critical_tests": critical_tests,
                    "critical_passed": critical_passed,
                    "critical_success_rate": critical_success_rate,
                    "health_status": health_status
                },
                "results": self.results
            }, f, indent=2)
            
        print(f"\n📄 Detailed report saved to: {report_file}")
        
        return {
            "success_rate": success_rate,
            "critical_success_rate": critical_success_rate,
            "health_status": health_status
        }

if __name__ == "__main__":
    probe = FocusedSIEMProbe()
    probe.run_probe()