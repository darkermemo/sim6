#!/usr/bin/env python3
"""
Custom Parser API Test
Tests the new Custom Parser API with user-defined parsing configurations
"""

import subprocess
import json
import tempfile
import os
from datetime import datetime
import uuid

class CustomParserApiTest:
    def __init__(self):
        self.test_scenarios = [
            {
                "name": "Custom Web Server Logs",
                "parser_config": "custom_parsers/custom_web_server.yaml",
                "test_logs": [
                    '[WebServer] 2025-01-21 15:30:45 [INFO] Client: 192.168.1.100:54321 -> Server: 10.0.1.50:80 Method: GET URL: /api/v1/users Status: 200 Size: 1024 Agent: "Mozilla/5.0" Referer: "https://example.com"',
                    '[WebServer] 2025-01-21 15:31:45 [ERROR] Client: 192.168.1.101:54322 -> Server: 10.0.1.50:443 Method: POST URL: /api/v1/login Status: 401 Size: 256 Agent: "CustomBot/1.0" Referer: "-"',
                    '[WebServer] 2025-01-21 15:32:45 [WARN] Client: 203.0.113.50:12345 -> Server: 10.0.1.50:8080 Method: PUT URL: /api/v1/data?id=123 Status: 429 Size: 512 Agent: "curl/7.68.0" Referer: ""',
                ],
                "expected_parser": "custom_web_server",
                "expected_fields": ["source_ip", "http_method", "url", "http_status_code"]
            },
            {
                "name": "Proprietary Database Logs",
                "parser_config": "custom_parsers/proprietary_database.json",
                "test_logs": [
                    '[PROPDB] 2025/01/21 15:30:45 PID:1234 User:admin DB:users SELECT: SELECT * FROM users WHERE active=1 Duration:25ms Result:SUCCESS',
                    '[PROPDB] 2025/01/21 15:31:45 PID:1235 User:analyst DB:logs INSERT: INSERT INTO audit_log VALUES (1, \'login\', NOW()) Duration:15ms Result:SUCCESS',
                    '[PROPDB] 2025/01/21 15:32:45 PID:1236 User:readonly DB:reports UPDATE: UPDATE report_cache SET last_updated=NOW() Duration:150ms Result:SUCCESS',
                ],
                "expected_parser": "proprietary_database",
                "expected_fields": ["user_name", "database_name", "operation_type", "sql_query"]
            },
            {
                "name": "IoT Device Sensor Logs",
                "parser_config": "custom_parsers/iot_device.yaml", 
                "test_logs": [
                    'IOT_GATEWAY timestamp=2025-01-21T15:30:45Z device_id=SENSOR001 device_type=temperature location=factory-floor-1 status=ONLINE temperature=22.5 humidity=45 battery=85',
                    'IOT_GATEWAY timestamp=2025-01-21T15:31:45Z device_id=SENSOR002 device_type=pressure location=pump-room-a status=ONLINE pressure=1013.25 temperature=25.0 signal=-45',
                    'IOT_GATEWAY timestamp=2025-01-21T15:32:45Z device_id=SENSOR003 device_type=motion location=entrance-gate status=ERROR battery=12 firmware=v2.1.0',
                ],
                "expected_parser": "iot_device_sensor",
                "expected_fields": ["device_id", "device_type", "device_status", "device_location"]
            }
        ]

    def test_custom_parser_loading(self):
        """Test loading custom parser configurations"""
        print("🔧 Testing Custom Parser Configuration Loading")
        print("=" * 60)
        
        results = {}
        
        for scenario in self.test_scenarios:
            print(f"\n📝 Testing: {scenario['name']}")
            print("-" * 40)
            
            config_file = scenario['parser_config']
            print(f"  📄 Config File: {config_file}")
            
            # Check if config file exists and is valid
            if os.path.exists(config_file):
                print(f"    ✅ Configuration file found")
                
                # Try to parse the configuration
                try:
                    if config_file.endswith('.yaml') or config_file.endswith('.yml'):
                        import yaml
                        with open(config_file, 'r') as f:
                            config = yaml.safe_load(f)
                    else:
                        with open(config_file, 'r') as f:
                            config = json.load(f)
                    
                    print(f"    ✅ Configuration parsed successfully")
                    print(f"    📊 Parser Name: {config.get('name', 'Unknown')}")
                    print(f"    📦 Version: {config.get('version', 'Unknown')}")
                    print(f"    🏷️ Category: {config.get('metadata', {}).get('category', 'Unknown')}")
                    
                    # Validate required sections
                    required_sections = ['detection', 'extraction', 'field_mapping', 'quality_rules']
                    missing_sections = [section for section in required_sections if section not in config]
                    
                    if not missing_sections:
                        print(f"    ✅ All required sections present")
                        results[scenario['name']] = {
                            "config_valid": True,
                            "config": config,
                            "parser_name": config.get('name')
                        }
                    else:
                        print(f"    ❌ Missing sections: {missing_sections}")
                        results[scenario['name']] = {
                            "config_valid": False,
                            "error": f"Missing sections: {missing_sections}"
                        }
                        
                except Exception as e:
                    print(f"    ❌ Configuration parsing error: {e}")
                    results[scenario['name']] = {
                        "config_valid": False,
                        "error": str(e)
                    }
            else:
                print(f"    ❌ Configuration file not found")
                results[scenario['name']] = {
                    "config_valid": False,
                    "error": "Configuration file not found"
                }
        
        return results

    def test_custom_parser_parsing(self):
        """Test parsing with custom parsers"""
        print("\n🧪 Testing Custom Parser Log Processing")
        print("=" * 60)
        
        parsing_results = {}
        
        for scenario in self.test_scenarios:
            print(f"\n📊 Testing: {scenario['name']}")
            print("-" * 40)
            
            scenario_results = []
            
            for i, log_entry in enumerate(scenario['test_logs'], 1):
                print(f"  📝 Log {i}: {log_entry[:60]}{'...' if len(log_entry) > 60 else ''}")
                
                # Create temporary input file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False) as f:
                    f.write(log_entry + '\n')
                    temp_file = f.name
                
                try:
                    # Parse with enhanced system (custom parsers should be loaded automatically if supported)
                    result = subprocess.run(
                        ["./target/release/siem_parser", "--input", temp_file, "--format", "auto"],
                        cwd="siem_parser",
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    if result.returncode == 0 and result.stdout:
                        try:
                            parsed_data = json.loads(result.stdout)
                            
                            # Analyze parsing results
                            parser_used = parsed_data.get('parser_used', 'Unknown')
                            confidence = parsed_data.get('confidence', 'Unknown')
                            event = parsed_data.get('event', {})
                            
                            print(f"    🎯 Parser: {parser_used}")
                            print(f"    📊 Confidence: {confidence}")
                            print(f"    🔧 Event Type: {event.get('event_type', 'N/A')}")
                            
                            # Check for expected fields
                            extracted_fields = []
                            for field in scenario['expected_fields']:
                                if event.get(field) or event.get('custom_fields', {}).get(field):
                                    extracted_fields.append(field)
                                    print(f"    ✅ {field}: {event.get(field) or event.get('custom_fields', {}).get(field)}")
                            
                            # Custom parser fields
                            custom_fields = event.get('custom_fields', {})
                            if custom_fields:
                                print(f"    🔧 Custom Fields: {len(custom_fields)} fields")
                                for key, value in list(custom_fields.items())[:3]:  # Show first 3
                                    print(f"       • {key}: {value}")
                            
                            # Success assessment
                            expected_field_coverage = len(extracted_fields) / len(scenario['expected_fields'])
                            parsing_success = expected_field_coverage >= 0.5  # At least 50% of expected fields
                            
                            status = "✅" if parsing_success else "⚠️"
                            print(f"    {status} Field Coverage: {expected_field_coverage:.1%} ({len(extracted_fields)}/{len(scenario['expected_fields'])})")
                            
                            scenario_results.append({
                                "log_entry": log_entry,
                                "parser_used": parser_used,
                                "confidence": confidence,
                                "extracted_fields": extracted_fields,
                                "custom_fields": custom_fields,
                                "field_coverage": expected_field_coverage,
                                "success": parsing_success
                            })
                            
                        except json.JSONDecodeError as e:
                            print(f"    ❌ JSON parsing error: {e}")
                            scenario_results.append({"log_entry": log_entry, "success": False, "error": str(e)})
                            
                    else:
                        print(f"    ❌ Parser execution failed: {result.stderr}")
                        scenario_results.append({"log_entry": log_entry, "success": False, "error": result.stderr})
                        
                finally:
                    # Clean up temporary file
                    os.unlink(temp_file)
            
            # Analyze scenario performance
            successful_parses = sum(1 for r in scenario_results if r.get('success', False))
            total_parses = len(scenario_results)
            success_rate = (successful_parses / total_parses * 100) if total_parses > 0 else 0
            
            print(f"  📈 Scenario Success Rate: {success_rate:.1f}% ({successful_parses}/{total_parses})")
            
            parsing_results[scenario['name']] = {
                "results": scenario_results,
                "success_rate": success_rate,
                "successful_parses": successful_parses,
                "total_parses": total_parses
            }
        
        return parsing_results

    def generate_comprehensive_report(self, config_results, parsing_results):
        """Generate comprehensive custom parser API test report"""
        print("\n" + "=" * 70)
        print("📋 CUSTOM PARSER API TEST RESULTS")
        print("=" * 70)
        
        # Configuration validation summary
        total_configs = len(config_results)
        valid_configs = sum(1 for r in config_results.values() if r.get('config_valid', False))
        config_success_rate = (valid_configs / total_configs * 100) if total_configs > 0 else 0
        
        print(f"🔧 Configuration Validation:")
        print(f"   📊 Total Configurations: {total_configs}")
        print(f"   ✅ Valid Configurations: {valid_configs}")
        print(f"   📈 Config Success Rate: {config_success_rate:.1f}%")
        
        # Parsing performance summary
        total_parsing_scenarios = len(parsing_results)
        successful_parsing_scenarios = sum(1 for r in parsing_results.values() if r.get('success_rate', 0) >= 75)
        parsing_success_rate = (successful_parsing_scenarios / total_parsing_scenarios * 100) if total_parsing_scenarios > 0 else 0
        
        print(f"\n🧪 Parsing Performance:")
        print(f"   📊 Total Scenarios: {total_parsing_scenarios}")
        print(f"   ✅ Successful Scenarios: {successful_parsing_scenarios}")
        print(f"   📈 Parsing Success Rate: {parsing_success_rate:.1f}%")
        
        # Detailed scenario breakdown
        print(f"\n📈 Scenario Performance Details:")
        for scenario_name, result in parsing_results.items():
            success_rate = result.get('success_rate', 0)
            status = "✅" if success_rate >= 75 else "⚠️" if success_rate >= 50 else "❌"
            print(f"   {status} {scenario_name}: {success_rate:.1f}% ({result.get('successful_parses', 0)}/{result.get('total_parses', 0)})")
        
        # Overall assessment
        overall_success = config_success_rate >= 80 and parsing_success_rate >= 75
        
        print(f"\n🎯 OVERALL ASSESSMENT:")
        if overall_success:
            print("✅ Custom Parser API: SUCCESSFUL")
            print("🚀 System ready for user-defined parser deployment")
            print("📊 Configuration and parsing validation passed")
        else:
            print("⚠️ Custom Parser API: NEEDS IMPROVEMENT")
            print("🔧 Some configurations or parsing scenarios failed")
            print("📋 Review detailed results for optimization")
        
        # Save detailed report
        report = {
            "test_timestamp": datetime.now().isoformat(),
            "api_system": "Custom Parser API",
            "configuration_validation": {
                "total_configs": total_configs,
                "valid_configs": valid_configs,
                "success_rate": config_success_rate,
                "results": config_results
            },
            "parsing_performance": {
                "total_scenarios": total_parsing_scenarios,
                "successful_scenarios": successful_parsing_scenarios,
                "success_rate": parsing_success_rate,
                "scenario_results": parsing_results
            },
            "overall_assessment": "successful" if overall_success else "needs_improvement"
        }
        
        with open("custom_parser_api_test_report.json", "w") as f:
            json.dump(report, f, indent=2, default=str)
        
        print(f"\n📁 Detailed report saved to custom_parser_api_test_report.json")
        return overall_success

    def run_comprehensive_test(self):
        """Run complete custom parser API test suite"""
        print("🔧 Custom Parser API Comprehensive Test Suite")
        print("=" * 70)
        print(f"Start Time: {datetime.now().isoformat()}")
        print()
        
        # Test 1: Configuration loading and validation
        config_results = self.test_custom_parser_loading()
        
        # Test 2: Parsing with custom configurations
        parsing_results = self.test_custom_parser_parsing()
        
        # Generate comprehensive report
        success = self.generate_comprehensive_report(config_results, parsing_results)
        
        return success

def main():
    """Run custom parser API test"""
    # Check if yaml library is available
    try:
        import yaml
    except ImportError:
        print("⚠️ PyYAML not found. Installing...")
        subprocess.run(["pip3", "install", "PyYAML"], check=True)
        import yaml
    
    tester = CustomParserApiTest()
    success = tester.run_comprehensive_test()
    
    if success:
        print("\n🎉 Custom Parser API implementation successful!")
        exit(0)
    else:
        print("\n⚠️ Custom Parser API needs additional development")
        exit(1)

if __name__ == "__main__":
    main()