#!/usr/bin/env python3
"""
F5 BIG-IP Parser Test
Tests the new F5 BIG-IP load balancer parser
"""

import subprocess
import json
import tempfile
import os
from datetime import datetime

class F5BigIpParserTest:
    def __init__(self):
        self.test_logs = [
            # F5 BIG-IP Load Balancer logs
            "Jan 21 15:30:45 f5-lb01 info: 192.168.1.100:54321 -> 10.0.1.50:80",
            "Feb 15 08:22:33 f5-prod info: 203.0.113.45:12345 -> 172.16.1.25:443", 
            "Mar 10 19:45:12 f5-cluster-01 info: 10.10.10.50:8080 -> 192.168.10.100:9000",
            "Apr 05 12:15:30 bigip-east info: 198.51.100.25:33445 -> 203.0.113.100:8443",
            "May 20 23:59:59 f5-west info: 192.0.2.150:65001 -> 10.20.30.40:22"
        ]

    def compile_parser(self):
        """Compile the Rust parser to test F5 functionality"""
        print("🔧 Compiling enhanced parser with F5 BIG-IP support...")
        
        result = subprocess.run(
            ["cargo", "build", "--release"],
            cwd="siem_parser",
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            print("✅ Parser compilation successful")
            return True
        else:
            print(f"❌ Compilation failed: {result.stderr}")
            return False

    def test_f5_parsing(self):
        """Test F5 BIG-IP log parsing"""
        print("\n🧪 Testing F5 BIG-IP Parser")
        print("=" * 50)
        
        results = []
        
        for i, log_entry in enumerate(self.test_logs, 1):
            print(f"  📝 Test {i}: F5 BIG-IP Log")
            
            # Create temporary input file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False) as f:
                f.write(log_entry + '\n')
                temp_file = f.name
            
            try:
                # Test parsing with the enhanced parser
                result = subprocess.run(
                    ["./target/release/siem_parser", "--input", temp_file, "--format", "json"],
                    cwd="siem_parser",
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if result.returncode == 0 and result.stdout:
                    try:
                        parsed_data = json.loads(result.stdout)
                        
                        # Validate F5-specific fields
                        success = self.validate_f5_parsing(parsed_data, log_entry)
                        status = "✅" if success else "⚠️"
                        
                        print(f"    {status} Parser: {parsed_data.get('parser_used', 'Unknown')}")
                        print(f"    {status} Confidence: {parsed_data.get('confidence', 'Unknown')}")
                        print(f"    {status} Event Type: {parsed_data.get('event', {}).get('event_type', 'N/A')}")
                        print(f"    {status} Device: {parsed_data.get('event', {}).get('device_vendor', 'N/A')}")
                        
                        if parsed_data.get('event', {}).get('source_ip'):
                            print(f"    ✅ Source: {parsed_data['event']['source_ip']}:{parsed_data['event'].get('source_port', 'N/A')}")
                        if parsed_data.get('event', {}).get('destination_ip'):
                            print(f"    ✅ Destination: {parsed_data['event']['destination_ip']}:{parsed_data['event'].get('destination_port', 'N/A')}")
                        
                        results.append({
                            "test_id": i,
                            "log_entry": log_entry,
                            "success": success,
                            "parsed_data": parsed_data
                        })
                        
                    except json.JSONDecodeError as e:
                        print(f"    ❌ JSON parsing error: {e}")
                        results.append({"test_id": i, "log_entry": log_entry, "success": False, "error": str(e)})
                        
                else:
                    print(f"    ❌ Parser execution failed: {result.stderr}")
                    results.append({"test_id": i, "log_entry": log_entry, "success": False, "error": result.stderr})
                    
            finally:
                # Clean up temporary file
                os.unlink(temp_file)
        
        return results

    def validate_f5_parsing(self, parsed_data, original_log):
        """Validate that F5 BIG-IP parsing was successful"""
        event = parsed_data.get('event', {})
        
        # Check for F5-specific indicators
        f5_indicators = [
            parsed_data.get('parser_used') == 'F5 BIG-IP',
            event.get('event_type') == 'f5_bigip_loadbalancer',
            event.get('device_vendor') == 'F5',
            event.get('device_product') == 'BIG-IP',
            event.get('source_ip') is not None,
            event.get('destination_ip') is not None
        ]
        
        # Must have at least 4 out of 6 indicators
        return sum(f5_indicators) >= 4

    def generate_report(self, results):
        """Generate test report"""
        print("\n" + "=" * 60)
        print("📋 F5 BIG-IP PARSER TEST RESULTS")
        print("=" * 60)
        
        total_tests = len(results)
        successful_tests = sum(1 for r in results if r.get('success', False))
        success_rate = (successful_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"🎯 Total Tests: {total_tests}")
        print(f"✅ Successful: {successful_tests}")
        print(f"❌ Failed: {total_tests - successful_tests}")
        print(f"📊 Success Rate: {success_rate:.1f}%")
        
        if success_rate >= 80:
            print(f"\n🎉 F5 BIG-IP Parser: ✅ PASSED ({success_rate:.1f}% success)")
            print("🚀 Ready for production deployment!")
        else:
            print(f"\n⚠️ F5 BIG-IP Parser: ❌ NEEDS IMPROVEMENT ({success_rate:.1f}% success)")
            print("🔧 Review failed test cases for optimization")
        
        # Save detailed results
        report = {
            "test_timestamp": datetime.now().isoformat(),
            "parser_type": "F5 BIG-IP Load Balancer",
            "total_tests": total_tests,
            "successful_tests": successful_tests,
            "success_rate": success_rate,
            "test_results": results
        }
        
        with open("f5_bigip_parser_test_report.json", "w") as f:
            json.dump(report, f, indent=2, default=str)
        
        print(f"\n📁 Detailed report saved to f5_bigip_parser_test_report.json")

    def run_test_suite(self):
        """Run complete F5 BIG-IP test suite"""
        print("🚀 F5 BIG-IP Load Balancer Parser Test Suite")
        print("=" * 60)
        print(f"Start Time: {datetime.now().isoformat()}")
        print()
        
        # Step 1: Compile parser
        if not self.compile_parser():
            print("❌ Cannot proceed without successful compilation")
            return False
        
        # Step 2: Test parsing
        results = self.test_f5_parsing()
        
        # Step 3: Generate report
        self.generate_report(results)
        
        # Return overall success
        success_rate = (sum(1 for r in results if r.get('success', False)) / len(results) * 100)
        return success_rate >= 80

def main():
    """Run F5 BIG-IP parser test"""
    tester = F5BigIpParserTest()
    success = tester.run_test_suite()
    
    if success:
        print("\n🎯 F5 BIG-IP parser implementation completed successfully!")
        exit(0)
    else:
        print("\n⚠️ F5 BIG-IP parser needs additional work")
        exit(1)

if __name__ == "__main__":
    main()