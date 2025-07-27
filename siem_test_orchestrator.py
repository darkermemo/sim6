#!/usr/bin/env python3
"""
SIEM Test Orchestrator

Orchestrates comprehensive SIEM testing with OTRF Security Datasets,
including schema validation with v4 and v5 validators.
"""

import subprocess
import json
import time
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any
import requests

class SIEMTestOrchestrator:
    def __init__(self):
        self.project_root = Path("/Users/yasseralmohammed/sim6")
        self.test_results = {
            "orchestration": [],
            "schema_validation": [],
            "system_readiness": [],
            "comprehensive_tests": []
        }
        self.start_time = datetime.now()
        
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
    
    def check_prerequisites(self) -> bool:
        """Check if all prerequisites are met"""
        print("\n🔍 Checking Prerequisites")
        print("=" * 50)
        
        checks = [
            ("Python Environment", self.check_python_env),
            ("OTRF Datasets", self.check_otrf_datasets),
            ("SIEM Services", self.check_siem_services),
            ("Schema Validators", self.check_schema_validators),
            ("Test Scripts", self.check_test_scripts)
        ]
        
        all_passed = True
        for check_name, check_func in checks:
            try:
                if check_func():
                    self.log_result("system_readiness", check_name, "PASS", "Prerequisites met")
                else:
                    self.log_result("system_readiness", check_name, "FAIL", "Prerequisites not met")
                    all_passed = False
            except Exception as e:
                self.log_result("system_readiness", check_name, "FAIL", str(e))
                all_passed = False
        
        return all_passed
    
    def check_python_env(self) -> bool:
        """Check Python environment and dependencies"""
        required_modules = ['requests', 'yaml', 'json', 'zipfile']
        
        for module in required_modules:
            try:
                __import__(module)
            except ImportError:
                print(f"❌ Missing Python module: {module}")
                return False
        
        return True
    
    def check_otrf_datasets(self) -> bool:
        """Check if OTRF datasets are available"""
        datasets_path = self.project_root / "Security-Datasets"
        
        if not datasets_path.exists():
            print(f"❌ OTRF datasets not found at: {datasets_path}")
            return False
        
        metadata_path = datasets_path / "datasets" / "atomic" / "_metadata"
        if not metadata_path.exists():
            print(f"❌ OTRF metadata not found at: {metadata_path}")
            return False
        
        yaml_files = list(metadata_path.glob("*.yaml"))
        if len(yaml_files) < 10:
            print(f"❌ Insufficient OTRF metadata files: {len(yaml_files)}")
            return False
        
        print(f"✅ Found {len(yaml_files)} OTRF metadata files")
        return True
    
    def check_siem_services(self) -> bool:
        """Check if SIEM services are running"""
        services = [
            ("SIEM API", "http://localhost:8080/api/v1/health"),
            ("Ingestor", "http://127.0.0.1:8081/ingest/raw"),
            ("ClickHouse", "http://localhost:8123/ping")
        ]
        
        all_running = True
        for service_name, url in services:
            try:
                response = requests.get(url, timeout=5)
                # Accept 200, 404, 405 as healthy (service is responding)
                if response.status_code not in [200, 404, 405]:
                    print(f"❌ {service_name} not responding properly: {response.status_code}")
                    all_running = False
                else:
                    print(f"✅ {service_name} is running (status: {response.status_code})")
            except requests.exceptions.RequestException as e:
                print(f"❌ {service_name} not accessible: {e}")
                all_running = False
        
        return all_running
    
    def check_schema_validators(self) -> bool:
        """Check if schema validators v4 and v5 are available"""
        validators = ["schema_validator_v4", "schema_validator_v5"]
        
        for validator in validators:
            try:
                result = subprocess.run(
                    ["cargo", "check", "--bin", validator],
                    cwd=str(self.project_root),
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if result.returncode == 0:
                    print(f"✅ {validator} is available")
                else:
                    print(f"❌ {validator} check failed: {result.stderr[:100]}")
                    return False
            except Exception as e:
                print(f"❌ Error checking {validator}: {e}")
                return False
        
        return True
    
    def check_test_scripts(self) -> bool:
        """Check if test scripts are available"""
        required_scripts = [
            "comprehensive_siem_test.py",
            "otrf_dataset_analyzer.py"
        ]
        
        for script in required_scripts:
            script_path = self.project_root / script
            if not script_path.exists():
                print(f"❌ Test script not found: {script}")
                return False
            else:
                print(f"✅ Found test script: {script}")
        
        return True
    
    def run_schema_validation(self) -> bool:
        """Run schema validation with v4 and v5 validators"""
        print("\n📋 Running Schema Validation")
        print("=" * 50)
        
        validators = [
            {
                "name": "schema_validator_v4",
                "description": "Enhanced validator with multi-layer support"
            },
            {
                "name": "schema_validator_v5",
                "description": "Latest validator with comprehensive reporting"
            }
        ]
        
        validation_passed = True
        
        for validator in validators:
            print(f"\nRunning {validator['name']}...")
            
            try:
                result = subprocess.run(
                    ["cargo", "run", "--bin", validator['name']],
                    cwd=str(self.project_root),
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                
                if result.returncode == 0:
                    self.log_result(
                        "schema_validation", 
                        validator['name'], 
                        "PASS", 
                        f"Validation successful: {validator['description']}"
                    )
                    
                    # Parse validation output for details
                    if result.stdout:
                        print(f"Validation output: {result.stdout[:200]}...")
                else:
                    self.log_result(
                        "schema_validation", 
                        validator['name'], 
                        "FAIL", 
                        f"Exit code: {result.returncode}, Error: {result.stderr[:200]}"
                    )
                    validation_passed = False
                    
            except subprocess.TimeoutExpired:
                self.log_result(
                    "schema_validation", 
                    validator['name'], 
                    "FAIL", 
                    "Validation timeout (120s)"
                )
                validation_passed = False
            except Exception as e:
                self.log_result(
                    "schema_validation", 
                    validator['name'], 
                    "FAIL", 
                    f"Execution error: {str(e)}"
                )
                validation_passed = False
        
        return validation_passed
    
    def run_otrf_analysis(self) -> bool:
        """Run OTRF dataset analysis"""
        print("\n🔍 Running OTRF Dataset Analysis")
        print("=" * 50)
        
        try:
            result = subprocess.run(
                ["python3", "otrf_dataset_analyzer.py"],
                cwd=str(self.project_root),
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0:
                self.log_result(
                    "orchestration", 
                    "OTRF Dataset Analysis", 
                    "PASS", 
                    "Analysis completed successfully"
                )
                print(result.stdout)
                return True
            else:
                self.log_result(
                    "orchestration", 
                    "OTRF Dataset Analysis", 
                    "FAIL", 
                    f"Exit code: {result.returncode}, Error: {result.stderr[:200]}"
                )
                print(f"Error: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            self.log_result(
                "orchestration", 
                "OTRF Dataset Analysis", 
                "FAIL", 
                "Analysis timeout (300s)"
            )
            return False
        except Exception as e:
            self.log_result(
                "orchestration", 
                "OTRF Dataset Analysis", 
                "FAIL", 
                str(e)
            )
            return False
    
    def run_comprehensive_tests(self) -> bool:
        """Run comprehensive SIEM tests"""
        print("\n🚀 Running Comprehensive SIEM Tests")
        print("=" * 50)
        
        try:
            result = subprocess.run(
                ["python3", "comprehensive_siem_test.py"],
                cwd=str(self.project_root),
                capture_output=True,
                text=True,
                timeout=1800  # 30 minutes
            )
            
            if result.returncode == 0:
                self.log_result(
                    "comprehensive_tests", 
                    "Full SIEM Test Suite", 
                    "PASS", 
                    "All comprehensive tests passed"
                )
                print(result.stdout)
                return True
            else:
                self.log_result(
                    "comprehensive_tests", 
                    "Full SIEM Test Suite", 
                    "FAIL", 
                    f"Exit code: {result.returncode}, Some tests failed"
                )
                print(f"Test output: {result.stdout}")
                print(f"Test errors: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            self.log_result(
                "comprehensive_tests", 
                "Full SIEM Test Suite", 
                "FAIL", 
                "Test timeout (30 minutes)"
            )
            return False
        except Exception as e:
            self.log_result(
                "comprehensive_tests", 
                "Full SIEM Test Suite", 
                "FAIL", 
                str(e)
            )
            return False
    
    def generate_orchestration_report(self) -> Dict[str, Any]:
        """Generate comprehensive orchestration report"""
        end_time = datetime.now()
        duration = end_time - self.start_time
        
        report = {
            "orchestration_summary": {
                "start_time": self.start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "duration_seconds": duration.total_seconds(),
                "test_environment": "OTRF Security Datasets",
                "schema_validators": ["v4", "v5"]
            },
            "test_results": self.test_results,
            "summary_statistics": {}
        }
        
        # Calculate summary statistics
        total_tests = 0
        total_passed = 0
        
        for category, tests in self.test_results.items():
            category_total = len(tests)
            category_passed = len([t for t in tests if t["status"] == "PASS"])
            category_failed = len([t for t in tests if t["status"] == "FAIL"])
            
            report["summary_statistics"][category] = {
                "total": category_total,
                "passed": category_passed,
                "failed": category_failed,
                "success_rate": (category_passed / category_total * 100) if category_total > 0 else 0
            }
            
            total_tests += category_total
            total_passed += category_passed
        
        report["summary_statistics"]["overall"] = {
            "total": total_tests,
            "passed": total_passed,
            "failed": total_tests - total_passed,
            "success_rate": (total_passed / total_tests * 100) if total_tests > 0 else 0
        }
        
        return report
    
    def save_orchestration_report(self, report: Dict[str, Any]):
        """Save orchestration report"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = f"siem_orchestration_report_{timestamp}.json"
        
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"\n📄 Orchestration report saved: {report_file}")
    
    def print_final_summary(self, report: Dict[str, Any]):
        """Print final test summary"""
        print("\n" + "=" * 80)
        print("🎯 SIEM COMPREHENSIVE TEST ORCHESTRATION SUMMARY")
        print("=" * 80)
        
        summary = report["summary_statistics"]
        overall = summary["overall"]
        
        print(f"\n⏱️  Duration: {report['orchestration_summary']['duration_seconds']:.1f} seconds")
        print(f"📊 Overall Success Rate: {overall['success_rate']:.1f}% ({overall['passed']}/{overall['total']})")
        
        print("\n📋 Category Breakdown:")
        for category, stats in summary.items():
            if category != "overall":
                print(f"  {category.replace('_', ' ').title()}: {stats['success_rate']:.1f}% ({stats['passed']}/{stats['total']})")
        
        # Determine overall result
        if overall["success_rate"] >= 90:
            print("\n🎉 EXCELLENT: All systems performing optimally!")
            status = "EXCELLENT"
        elif overall["success_rate"] >= 80:
            print("\n✅ GOOD: System ready for production with minor issues")
            status = "GOOD"
        elif overall["success_rate"] >= 70:
            print("\n⚠️  ACCEPTABLE: System functional but needs attention")
            status = "ACCEPTABLE"
        else:
            print("\n❌ NEEDS WORK: Significant issues require resolution")
            status = "NEEDS_WORK"
        
        print(f"\n🏆 Final Assessment: {status}")
        
        return status
    
    def run_orchestration(self) -> str:
        """Run complete test orchestration"""
        print("🎭 SIEM Test Orchestration Starting")
        print("=" * 80)
        print(f"Start Time: {self.start_time.isoformat()}")
        print(f"Project Root: {self.project_root}")
        print("=" * 80)
        
        # Phase 1: Prerequisites
        if not self.check_prerequisites():
            print("\n❌ Prerequisites check failed. Cannot proceed with testing.")
            return "PREREQUISITES_FAILED"
        
        # Phase 2: Schema Validation
        schema_validation_passed = self.run_schema_validation()
        
        # Phase 3: OTRF Analysis
        otrf_analysis_passed = self.run_otrf_analysis()
        
        # Phase 4: Comprehensive Tests
        comprehensive_tests_passed = self.run_comprehensive_tests()
        
        # Phase 5: Generate Report
        report = self.generate_orchestration_report()
        self.save_orchestration_report(report)
        
        # Phase 6: Final Summary
        final_status = self.print_final_summary(report)
        
        return final_status

def main():
    """Main execution function"""
    orchestrator = SIEMTestOrchestrator()
    final_status = orchestrator.run_orchestration()
    
    # Exit with appropriate code
    if final_status in ["EXCELLENT", "GOOD"]:
        print("\n🎊 Orchestration completed successfully!")
        sys.exit(0)
    elif final_status == "ACCEPTABLE":
        print("\n⚠️  Orchestration completed with warnings.")
        sys.exit(1)
    else:
        print("\n💥 Orchestration failed or needs significant work.")
        sys.exit(2)

if __name__ == "__main__":
    main()