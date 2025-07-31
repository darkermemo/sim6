#!/usr/bin/env python3
"""
Ultimate SIEM Backend Health Probe
Tests all implemented endpoints found in handlers.rs
"""

import requests
import json
import time
from datetime import datetime
from typing import Dict, List, Any
import sys

class SIEMProbe:
    def __init__(self, base_url: str = "http://localhost:8080"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'SIEM-Health-Probe/1.0'
        })
        self.results = []
        self.auth_token = None
        
    def test_endpoint(self, method: str, path: str, data: Dict = None, 
                     critical: bool = False, description: str = "") -> Dict:
        """Test a single endpoint"""
        url = f"{self.base_url}{path}"
        start_time = time.time()
        
        try:
            if method.upper() == 'GET':
                response = self.session.get(url, timeout=10)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data, timeout=10)
            elif method.upper() == 'PUT':
                response = self.session.put(url, json=data, timeout=10)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            response_time = (time.time() - start_time) * 1000
            
            # Try to parse JSON response
            try:
                response_data = response.json()
            except:
                response_data = response.text[:200] if response.text else "No response body"
            
            result = {
                'endpoint': f"{method.upper()} {path}",
                'status_code': response.status_code,
                'success': 200 <= response.status_code < 300,
                'response_time_ms': round(response_time, 2),
                'critical': critical,
                'description': description,
                'response_data': response_data,
                'timestamp': datetime.now().isoformat()
            }
            
            if not result['success']:
                result['error'] = f"HTTP {response.status_code}: {response.reason}"
                
        except Exception as e:
            result = {
                'endpoint': f"{method.upper()} {path}",
                'status_code': 0,
                'success': False,
                'response_time_ms': (time.time() - start_time) * 1000,
                'critical': critical,
                'description': description,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
            
        self.results.append(result)
        
        # Print real-time results
        status = "✅ PASS" if result['success'] else "❌ FAIL"
        critical_marker = "🔴 CRITICAL" if critical and not result['success'] else ""
        print(f"{status} {result['endpoint']} ({result['response_time_ms']:.1f}ms) {critical_marker}")
        
        if not result['success']:
            print(f"   Error: {result.get('error', 'Unknown error')}")
            
        return result
    
    def run_comprehensive_test(self):
        """Run comprehensive test of all SIEM endpoints"""
        print("🚀 Starting Ultimate SIEM Backend Health Probe")
        print(f"📡 Target: {self.base_url}")
        print(f"⏰ Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*80)
        
        # 1. HEALTH AND STATUS ENDPOINTS (Critical)
        print("\n🏥 HEALTH & STATUS ENDPOINTS")
        self.test_endpoint('GET', '/health', critical=True, description="Basic health check")
        self.test_endpoint('GET', '/health/detailed', critical=True, description="Detailed health check")
        self.test_endpoint('GET', '/api/v1/health', critical=True, description="API v1 health check")
        self.test_endpoint('GET', '/api/v1/health/detailed', critical=True, description="API v1 detailed health")
        self.test_endpoint('GET', '/api/v1/status', critical=True, description="System status")
        self.test_endpoint('GET', '/api/v1/version', critical=True, description="Version information")
        
        # 2. METRICS ENDPOINTS (Critical)
        print("\n📊 METRICS ENDPOINTS")
        self.test_endpoint('GET', '/metrics', critical=True, description="Basic metrics")
        self.test_endpoint('GET', '/api/v1/metrics', critical=True, description="API v1 metrics")
        self.test_endpoint('GET', '/api/v1/metrics/prometheus', critical=False, description="Prometheus metrics")
        self.test_endpoint('GET', '/api/v1/metrics/components', critical=True, description="Component metrics")
        self.test_endpoint('GET', '/api/v1/metrics/performance', critical=True, description="Performance metrics")
        self.test_endpoint('GET', '/api/v1/metrics/historical', critical=False, description="Historical metrics")
        
        # 3. EVENT ENDPOINTS (Critical)
        print("\n📝 EVENT ENDPOINTS")
        # Test event search (should work without auth based on previous tests)
        self.test_endpoint('GET', '/api/v1/events/search', critical=True, description="Event search")
        self.test_endpoint('POST', '/api/v1/events/search', critical=True, description="Event search POST")
        
        # Test event ingestion
        sample_event = {
            "source": "test-source",
            "data": {"message": "Test event", "severity": "info"},
            "metadata": {"test": "true"}
        }
        self.test_endpoint('POST', '/api/v1/events/ingest', data=sample_event, 
                          critical=True, description="Single event ingestion")
        
        # Test batch ingestion
        batch_events = {
            "events": [sample_event],
            "batch_id": "test-batch-001"
        }
        self.test_endpoint('POST', '/api/v1/events/batch', data=batch_events,
                          critical=True, description="Batch event ingestion")
        
        self.test_endpoint('GET', '/api/v1/events/stream', critical=False, description="Event stream")
        self.test_endpoint('GET', '/api/v1/events/test-id', critical=False, description="Get event by ID")
        
        # 4. AUTHENTICATION ENDPOINTS (Critical)
        print("\n🔐 AUTHENTICATION ENDPOINTS")
        # Test login with email field
        login_data = {
            "email": "admin@example.com",
            "password": "admin123"
        }
        self.test_endpoint('POST', '/api/v1/auth/login', data=login_data,
                          critical=True, description="User authentication")
        
        self.test_endpoint('POST', '/api/v1/auth/logout', data={},
                          critical=False, description="User logout")
        self.test_endpoint('POST', '/api/v1/auth/refresh', data={},
                          critical=False, description="Token refresh")
        
        # 5. CONFIGURATION ENDPOINTS (Critical)
        print("\n⚙️ CONFIGURATION ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/config', critical=True, description="Get configuration")
        self.test_endpoint('POST', '/api/v1/config/validate', data={"config": {}},
                          critical=True, description="Validate configuration")
        self.test_endpoint('POST', '/api/v1/config/reload', critical=True, description="Reload configuration")
        
        # 6. ROUTING ENDPOINTS (Critical)
        print("\n🛣️ ROUTING ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/routing/rules', critical=True, description="Get routing rules")
        
        # 7. PIPELINE ENDPOINTS (Critical)
        print("\n🔄 PIPELINE ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/pipeline/stats', critical=True, description="Pipeline statistics")
        self.test_endpoint('POST', '/api/v1/pipeline/start', critical=False, description="Start pipeline")
        self.test_endpoint('POST', '/api/v1/pipeline/stop', critical=False, description="Stop pipeline")
        self.test_endpoint('POST', '/api/v1/pipeline/restart', critical=False, description="Restart pipeline")
        
        # 8. AGENT ENDPOINTS (Critical)
        print("\n🤖 AGENT ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/agents', critical=True, description="Get agents")
        self.test_endpoint('GET', '/api/v1/agents/fleet', critical=True, description="Agent fleet")
        self.test_endpoint('GET', '/api/v1/agents/policies', critical=True, description="Agent policies")
        self.test_endpoint('GET', '/api/v1/agents/download', critical=False, description="Download agent")
        
        # 9. PARSER ENDPOINTS (Critical)
        print("\n🔍 PARSER ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/parsers', critical=True, description="Get parsers")
        self.test_endpoint('GET', '/api/v1/parsers/all', critical=True, description="Get all parsers")
        
        # 10. USER MANAGEMENT ENDPOINTS (Critical)
        print("\n👥 USER MANAGEMENT ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/users', critical=True, description="Get users")
        self.test_endpoint('GET', '/api/v1/admin/users', critical=True, description="Get admin users")
        
        # 11. TENANT ENDPOINTS (Critical)
        print("\n🏢 TENANT ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/tenants', critical=True, description="Get tenants")
        self.test_endpoint('GET', '/api/v1/tenants/metrics', critical=True, description="Tenant metrics")
        
        # 12. ALERT ENDPOINTS (Critical)
        print("\n🚨 ALERT ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/alerts', critical=True, description="Get alerts")
        
        # 13. CASE ENDPOINTS (Critical)
        print("\n📋 CASE ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/cases', critical=True, description="Get cases")
        
        # 14. RULE ENDPOINTS (Critical)
        print("\n📏 RULE ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/rules', critical=True, description="Get rules")
        
        # 15. DASHBOARD ENDPOINTS (Critical)
        print("\n📈 DASHBOARD ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/dashboard', critical=True, description="Get dashboard")
        self.test_endpoint('GET', '/api/v1/dashboard/kpis', critical=True, description="Dashboard KPIs")
        
        # 16. LOG SOURCE ENDPOINTS (Critical)
        print("\n📄 LOG SOURCE ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/log-sources', critical=True, description="Get log sources")
        self.test_endpoint('GET', '/api/v1/log_sources', critical=True, description="Get log sources (underscore)")
        self.test_endpoint('GET', '/api/v1/log_sources/groups', critical=True, description="Log source groups")
        self.test_endpoint('GET', '/api/v1/log_sources/stats', critical=True, description="Log source stats")
        self.test_endpoint('GET', '/api/v1/log_sources/enhanced', critical=True, description="Enhanced log sources")
        
        # 17. FIELD ENDPOINTS (Critical)
        print("\n🏷️ FIELD ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/fields/values', critical=True, description="Field values")
        self.test_endpoint('GET', '/api/v1/fields/multiple-values', critical=False, description="Multiple field values")
        
        # 18. EPS ENDPOINTS (Critical)
        print("\n⚡ EPS ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/eps/stats', critical=True, description="EPS statistics")
        
        # 19. TAXONOMY ENDPOINTS
        print("\n🏷️ TAXONOMY ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/taxonomy/mappings', critical=False, description="Taxonomy mappings")
        
        # 20. ADMINISTRATIVE ENDPOINTS
        print("\n🔧 ADMINISTRATIVE ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/admin/logs', critical=False, description="System logs")
        self.test_endpoint('GET', '/api/v1/admin/debug', critical=False, description="Debug information")
        
        # 21. ROLE ENDPOINTS
        print("\n🎭 ROLE ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/roles', critical=False, description="Get roles")
        
        # 22. ASSET ENDPOINTS
        print("\n🏗️ ASSET ENDPOINTS")
        self.test_endpoint('GET', '/api/v1/assets/192.168.1.1', critical=False, description="Get asset by IP")
        
        print("\n" + "="*80)
        self.print_summary()
        self.save_report()
        
    def print_summary(self):
        """Print test summary"""
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results if r['success'])
        failed_tests = total_tests - passed_tests
        critical_tests = sum(1 for r in self.results if r['critical'])
        critical_passed = sum(1 for r in self.results if r['critical'] and r['success'])
        critical_failed = critical_tests - critical_passed
        
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        critical_success_rate = (critical_passed / critical_tests * 100) if critical_tests > 0 else 0
        
        print(f"📊 TEST SUMMARY")
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests} ({success_rate:.1f}%)")
        print(f"❌ Failed: {failed_tests}")
        print(f"🔴 Critical Tests: {critical_tests}")
        print(f"🔴 Critical Passed: {critical_passed} ({critical_success_rate:.1f}%)")
        print(f"🔴 Critical Failed: {critical_failed}")
        
        if critical_failed > 0:
            print(f"\n⚠️ CRITICAL FAILURES:")
            for result in self.results:
                if result['critical'] and not result['success']:
                    print(f"   ❌ {result['endpoint']}: {result.get('error', 'Unknown error')}")
        
        # Overall health assessment
        if critical_success_rate >= 90:
            print(f"\n🟢 OVERALL STATUS: HEALTHY")
        elif critical_success_rate >= 70:
            print(f"\n🟡 OVERALL STATUS: WARNING")
        else:
            print(f"\n🔴 OVERALL STATUS: CRITICAL")
            
    def save_report(self):
        """Save detailed report to JSON file"""
        report = {
            'timestamp': datetime.now().isoformat(),
            'base_url': self.base_url,
            'summary': {
                'total_tests': len(self.results),
                'passed_tests': sum(1 for r in self.results if r['success']),
                'failed_tests': sum(1 for r in self.results if not r['success']),
                'critical_tests': sum(1 for r in self.results if r['critical']),
                'critical_passed': sum(1 for r in self.results if r['critical'] and r['success']),
                'critical_failed': sum(1 for r in self.results if r['critical'] and not r['success']),
            },
            'results': self.results
        }
        
        filename = f"ultimate_siem_health_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)
        print(f"\n📄 Detailed report saved to: {filename}")

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Ultimate SIEM Backend Health Probe')
    parser.add_argument('--url', default='http://localhost:8080', 
                       help='Base URL of the SIEM backend (default: http://localhost:8080)')
    args = parser.parse_args()
    
    probe = SIEMProbe(args.url)
    try:
        probe.run_comprehensive_test()
        
        # Exit with error code if critical tests failed
        critical_failed = sum(1 for r in probe.results if r['critical'] and not r['success'])
        if critical_failed > 0:
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n⏹️ Test interrupted by user")
        probe.print_summary()
        probe.save_report()
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Unexpected error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()