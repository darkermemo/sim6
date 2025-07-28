#!/usr/bin/env python3
"""
Canonical Field Mapping Test Data Generator

This script generates comprehensive test data for the Canonical Field Mapping Engine
based on the AI prompt requirements. It creates various log formats with:
- Known aliases that should map to canonical fields
- Unknown fields that should go to additional_fields
- Conflicting aliases to test priority resolution
- Case variations to test case-insensitive matching
- Complex scenarios combining multiple test cases
"""

import json
import os
import random
from datetime import datetime, timedelta
from typing import Dict, List, Any

class CanonicalFieldTestDataGenerator:
    def __init__(self):
        # Known aliases based on the aliases.yaml file
        self.known_aliases = {
            'source.ip': ['src_ip', 'srcip', 'source_ip', 'sourceip', 'client_ip', 'remote_addr', 'origin_ip', 'SourceIp', 'SOURCE_IP'],
            'destination.ip': ['dst_ip', 'dstip', 'dest_ip', 'destip', 'destination_ip', 'target_ip', 'server_ip', 'DestinationIp', 'DEST_IP'],
            'host.name': ['hostname', 'host', 'computer', 'Computer', 'ComputerName', 'HOST_NAME', 'server_name', 'machine_name'],
            'user.name': ['user', 'username', 'User', 'userid', 'user_id', 'account', 'login', 'SubjectUserName', 'TargetUserName'],
            'source.port': ['src_port', 'srcport', 'source_port', 'sport', 'client_port'],
            'destination.port': ['dst_port', 'dstport', 'dest_port', 'destination_port', 'dport', 'server_port'],
            'url.original': ['url', 'uri', 'request_uri', 'request', 'path'],
            'event.action': ['eventName', 'action', 'event_action', 'activity'],
            'network.protocol': ['protocol', 'proto', 'transport', 'ip_protocol'],
            'user.agent': ['user_agent', 'useragent', 'http_user_agent', 'ua'],
            'file.name': ['filename', 'file_name', 'file', 'filepath', 'Image'],
            'process.pid': ['pid', 'process_id', 'ProcessId', 'proc_id', 'processid'],
            'message': ['message', 'msg', 'description', 'details', 'log_message'],
            'log.level': ['level', 'severity', 'log_level', 'priority', 'sev']
        }
        
        # Sample values for different field types
        self.sample_values = {
            'source.ip': ['192.168.1.100', '10.0.0.50', '172.16.0.10', '203.0.113.1', '198.51.100.42'],
            'destination.ip': ['8.8.8.8', '1.1.1.1', '10.0.0.1', '172.16.1.1', '203.0.113.100'],
            'host.name': ['server01', 'workstation-pc', 'DC-01', 'web-server', 'database-srv'],
            'user.name': ['admin', 'john.doe', 'alice.smith', 'service_account', 'guest'],
            'source.port': ['80', '443', '22', '3389', '8080'],
            'destination.port': ['80', '443', '22', '3389', '8080'],
            'url.original': ['https://api.example.com/v1/users', 'http://internal.corp.com/login', 'https://secure.bank.com/transfer'],
            'event.action': ['login_success', 'login_failure', 'file_access', 'network_connection', 'process_creation'],
            'network.protocol': ['tcp', 'udp', 'icmp', 'http', 'https'],
            'user.agent': ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'curl/7.68.0', 'Python-requests/2.25.1'],
            'file.name': ['document.pdf', 'malware.exe', 'config.xml', 'data.csv', 'script.ps1'],
            'process.pid': ['1234', '5678', '9012', '3456', '7890'],
            'message': ['User login successful', 'Access denied', 'File downloaded', 'Connection established'],
            'log.level': ['info', 'warning', 'error', 'debug', 'critical']
        }
        
        # Unknown field names that should go to additional_fields
        self.unknown_fields = [
            'foobar_field', 'custom_metric', 'vendor_specific_id', 'legacy_field',
            'proprietary_data', 'internal_reference', 'temp_value', 'debug_info',
            'correlation_id', 'session_token', 'request_id', 'trace_id'
        ]
        
        # Unknown field values
        self.unknown_values = [
            'unexpected', 'custom_value', 'proprietary_data', 'internal_ref_12345',
            'session_abc123', 'trace_xyz789', 'debug_flag_enabled', 'temp_storage'
        ]

    def generate_test_case_1_known_aliases(self) -> List[Dict[str, Any]]:
        """Test Case 1: Submit logs with known aliases"""
        test_cases = []
        
        # Basic test from prompt
        test_cases.append({
            'name': 'basic_known_aliases',
            'description': 'Basic test with src_ip and eventName from AI prompt',
            'data': {
                'src_ip': '192.168.0.1',
                'eventName': 'login_success'
            },
            'expected_mappings': {
                'source.ip': '192.168.0.1',
                'event.action': 'login_success'
            }
        })
        
        # Multiple known aliases
        test_cases.append({
            'name': 'multiple_known_aliases',
            'description': 'Multiple known aliases mapping to different canonical fields',
            'data': {
                'srcip': '10.0.0.100',
                'dstip': '8.8.8.8',
                'hostname': 'web-server-01',
                'username': 'admin',
                'protocol': 'https',
                'src_port': '443',
                'dst_port': '80'
            },
            'expected_mappings': {
                'source.ip': '10.0.0.100',
                'destination.ip': '8.8.8.8',
                'host.name': 'web-server-01',
                'user.name': 'admin',
                'network.protocol': 'https',
                'source.port': '443',
                'destination.port': '80'
            }
        })
        
        # Windows event log style
        test_cases.append({
            'name': 'windows_event_style',
            'description': 'Windows event log field names',
            'data': {
                'ComputerName': 'DC-01',
                'SubjectUserName': 'administrator',
                'SourceIp': '192.168.1.50',
                'ProcessId': '1234'
            },
            'expected_mappings': {
                'host.name': 'DC-01',
                'user.name': 'administrator',
                'source.ip': '192.168.1.50',
                'process.pid': '1234'
            }
        })
        
        return test_cases

    def generate_test_case_2_unknown_fields(self) -> List[Dict[str, Any]]:
        """Test Case 2: Submit logs with unknown fields"""
        test_cases = []
        
        # Basic test from prompt
        test_cases.append({
            'name': 'basic_unknown_field',
            'description': 'Basic unknown field from AI prompt',
            'data': {
                'foobar_field': 'unexpected'
            },
            'expected_additional_fields': {
                'foobar_field': 'unexpected'
            }
        })
        
        # Multiple unknown fields
        test_cases.append({
            'name': 'multiple_unknown_fields',
            'description': 'Multiple unknown fields',
            'data': {
                'custom_metric': 'value1',
                'vendor_specific_id': 'ABC123',
                'proprietary_data': 'internal_use_only',
                'legacy_field': 'deprecated_value'
            },
            'expected_additional_fields': {
                'custom_metric': 'value1',
                'vendor_specific_id': 'ABC123',
                'proprietary_data': 'internal_use_only',
                'legacy_field': 'deprecated_value'
            }
        })
        
        # Mix of known and unknown
        test_cases.append({
            'name': 'mixed_known_unknown',
            'description': 'Mix of known aliases and unknown fields',
            'data': {
                'src_ip': '172.16.0.10',
                'hostname': 'mixed-server',
                'unknown_field_1': 'should_be_additional',
                'custom_property': 'vendor_specific',
                'dst_ip': '203.0.113.1',
                'mystery_field': 'unknown_value'
            },
            'expected_mappings': {
                'source.ip': '172.16.0.10',
                'host.name': 'mixed-server',
                'destination.ip': '203.0.113.1'
            },
            'expected_additional_fields': {
                'unknown_field_1': 'should_be_additional',
                'custom_property': 'vendor_specific',
                'mystery_field': 'unknown_value'
            }
        })
        
        return test_cases

    def generate_test_case_3_conflicting_aliases(self) -> List[Dict[str, Any]]:
        """Test Case 3: Submit logs with conflicting aliases"""
        test_cases = []
        
        # Basic test from prompt
        test_cases.append({
            'name': 'uri_url_conflict',
            'description': 'URI vs URL conflict from AI prompt',
            'data': {
                'uri': 'http://example.com/old',
                'url': 'http://example.com/preferred'
            },
            'expected_mappings': {
                'url.original': 'http://example.com/preferred'  # url should win over uri
            },
            'priority_test': True,
            'winner': 'url',
            'loser': 'uri'
        })
        
        # Source IP conflicts
        test_cases.append({
            'name': 'source_ip_conflicts',
            'description': 'Multiple source IP aliases with different priorities',
            'data': {
                'src_ip': '192.168.1.100',
                'source_ip': '10.0.0.50',
                'srcip': '172.16.0.10',
                'client_ip': '203.0.113.1'
            },
            'expected_mappings': {
                'source.ip': '192.168.1.100'  # src_ip should have highest priority
            },
            'priority_test': True
        })
        
        # Hostname conflicts
        test_cases.append({
            'name': 'hostname_conflicts',
            'description': 'Multiple hostname aliases',
            'data': {
                'hostname': 'server01',
                'HOST_NAME': 'SERVER01',
                'computer': 'workstation',
                'ComputerName': 'COMPUTER01'
            },
            'expected_mappings': {
                'host.name': 'server01'  # hostname should win
            },
            'priority_test': True
        })
        
        # User name conflicts
        test_cases.append({
            'name': 'username_conflicts',
            'description': 'Multiple user name aliases',
            'data': {
                'user': 'admin',
                'username': 'administrator',
                'User': 'ADMIN',
                'SubjectUserName': 'domain\\admin'
            },
            'expected_mappings': {
                'user.name': 'admin'  # user should have highest priority
            },
            'priority_test': True
        })
        
        return test_cases

    def generate_test_case_4_case_insensitive(self) -> List[Dict[str, Any]]:
        """Test Case 4: Case-insensitive alias match"""
        test_cases = []
        
        # Basic test from prompt
        test_cases.append({
            'name': 'uppercase_src_ip',
            'description': 'Uppercase SRC_IP from AI prompt',
            'data': {
                'SRC_IP': '10.0.0.1'
            },
            'expected_mappings': {
                'source.ip': '10.0.0.1'
            },
            'case_insensitive_test': True
        })
        
        # Mixed case variations
        test_cases.append({
            'name': 'mixed_case_aliases',
            'description': 'Various case combinations',
            'data': {
                'SRC_IP': '192.168.1.1',
                'DST_IP': '10.0.0.1',
                'HOSTNAME': 'SERVER01',
                'USERNAME': 'admin',
                'Protocol': 'TCP'
            },
            'expected_mappings': {
                'source.ip': '192.168.1.1',
                'destination.ip': '10.0.0.1',
                'host.name': 'SERVER01',
                'user.name': 'admin',
                'network.protocol': 'TCP'
            },
            'case_insensitive_test': True
        })
        
        # CamelCase variations
        test_cases.append({
            'name': 'camelcase_aliases',
            'description': 'CamelCase field names',
            'data': {
                'SourceIp': '172.16.0.1',
                'DestinationIp': '8.8.8.8',
                'ComputerName': 'WS-01',
                'ProcessId': '5678'
            },
            'expected_mappings': {
                'source.ip': '172.16.0.1',
                'destination.ip': '8.8.8.8',
                'host.name': 'WS-01',
                'process.pid': '5678'
            },
            'case_insensitive_test': True
        })
        
        return test_cases

    def generate_test_case_5_debug_output(self) -> List[Dict[str, Any]]:
        """Test Case 5: Resolution debug output"""
        test_cases = []
        
        # Basic test from prompt
        test_cases.append({
            'name': 'debug_eventname',
            'description': 'Debug output for eventName from AI prompt',
            'data': {
                'eventName': 'access_granted'
            },
            'expected_mappings': {
                'event.action': 'access_granted'
            },
            'debug_test': True,
            'expected_debug_patterns': [
                'eventName',
                'event.action',
                'priority'
            ]
        })
        
        # Complex debug scenario
        test_cases.append({
            'name': 'complex_debug_scenario',
            'description': 'Complex scenario for debug output',
            'data': {
                'src_ip': '192.168.1.100',
                'source_ip': '10.0.0.50',  # Conflict with src_ip
                'hostname': 'server01',
                'unknown_field': 'debug_value',
                'url': 'https://api.example.com',
                'uri': 'https://old.example.com'  # Conflict with url
            },
            'debug_test': True,
            'expected_debug_patterns': [
                'CONFLICT',
                'priority',
                'MAPPED',
                'UNMAPPED'
            ]
        })
        
        return test_cases

    def generate_comprehensive_test_cases(self) -> List[Dict[str, Any]]:
        """Generate comprehensive test cases combining multiple scenarios"""
        test_cases = []
        
        # Large scale test
        large_data = {}
        
        # Add known aliases
        for canonical_field, aliases in self.known_aliases.items():
            if canonical_field in self.sample_values:
                alias = random.choice(aliases)
                value = random.choice(self.sample_values[canonical_field])
                large_data[alias] = value
        
        # Add unknown fields
        for i in range(10):
            unknown_field = random.choice(self.unknown_fields) + f"_{i}"
            unknown_value = random.choice(self.unknown_values) + f"_{i}"
            large_data[unknown_field] = unknown_value
        
        test_cases.append({
            'name': 'comprehensive_large_scale',
            'description': 'Large scale test with many fields',
            'data': large_data,
            'comprehensive_test': True
        })
        
        # Real-world log examples
        test_cases.append({
            'name': 'apache_access_log_style',
            'description': 'Apache access log style fields',
            'data': {
                'remote_addr': '203.0.113.1',
                'request_uri': '/api/v1/users',
                'status': '200',
                'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'referer': 'https://example.com',
                'request_time': '0.123'
            }
        })
        
        test_cases.append({
            'name': 'windows_security_log_style',
            'description': 'Windows Security Event Log style',
            'data': {
                'EventID': '4624',
                'ComputerName': 'DC-01.corp.local',
                'SubjectUserName': 'admin',
                'TargetUserName': 'john.doe',
                'IpAddress': '192.168.1.100',
                'LogonType': '3',
                'AuthenticationPackageName': 'NTLM'
            }
        })
        
        test_cases.append({
            'name': 'firewall_log_style',
            'description': 'Firewall log style fields',
            'data': {
                'srcip': '192.168.1.100',
                'dstip': '8.8.8.8',
                'srcport': '54321',
                'dstport': '53',
                'protocol': 'udp',
                'action': 'allow',
                'devname': 'FW-01'
            }
        })
        
        return test_cases

    def generate_all_test_data(self) -> Dict[str, List[Dict[str, Any]]]:
        """Generate all test data categories"""
        return {
            'test_case_1_known_aliases': self.generate_test_case_1_known_aliases(),
            'test_case_2_unknown_fields': self.generate_test_case_2_unknown_fields(),
            'test_case_3_conflicting_aliases': self.generate_test_case_3_conflicting_aliases(),
            'test_case_4_case_insensitive': self.generate_test_case_4_case_insensitive(),
            'test_case_5_debug_output': self.generate_test_case_5_debug_output(),
            'comprehensive_tests': self.generate_comprehensive_test_cases()
        }

    def save_test_data_files(self, output_dir: str = 'test_logs'):
        """Save test data to individual JSON files"""
        os.makedirs(output_dir, exist_ok=True)
        
        all_test_data = self.generate_all_test_data()
        
        # Save each test case category
        for category, test_cases in all_test_data.items():
            category_dir = os.path.join(output_dir, category)
            os.makedirs(category_dir, exist_ok=True)
            
            for test_case in test_cases:
                filename = f"{test_case['name']}.json"
                filepath = os.path.join(category_dir, filename)
                
                # Save just the data part for CLI testing
                with open(filepath, 'w') as f:
                    json.dump(test_case['data'], f, indent=2)
                
                # Save full test case with metadata
                metadata_filename = f"{test_case['name']}_metadata.json"
                metadata_filepath = os.path.join(category_dir, metadata_filename)
                with open(metadata_filepath, 'w') as f:
                    json.dump(test_case, f, indent=2)
        
        # Save combined test suite
        with open(os.path.join(output_dir, 'all_test_data.json'), 'w') as f:
            json.dump(all_test_data, f, indent=2)
        
        print(f"✅ Test data files generated in {output_dir}/")
        
        # Print summary
        total_tests = sum(len(test_cases) for test_cases in all_test_data.values())
        print(f"📊 Generated {total_tests} test cases across {len(all_test_data)} categories")
        
        for category, test_cases in all_test_data.items():
            print(f"   - {category}: {len(test_cases)} test cases")

    def generate_batch_test_script(self, output_file: str = 'run_batch_canonical_tests.sh'):
        """Generate a batch test script to run all test cases"""
        script_content = '''#!/bin/bash

# Batch Test Script for Canonical Field Mapping Engine
# Auto-generated test script

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TEST_DIR="test_logs"
PASSED=0
FAILED=0
TOTAL=0

echo -e "${BLUE}🚀 Running Batch Canonical Field Mapping Tests${NC}"
echo -e "${BLUE}================================================${NC}\n"

# Function to run a single test
run_test() {
    local test_file="$1"
    local test_name="$2"
    
    echo -e "${YELLOW}Testing: $test_name${NC}"
    echo -e "${BLUE}File: $test_file${NC}"
    
    TOTAL=$((TOTAL + 1))
    
    if [ -f "$test_file" ]; then
        if siem_parser/target/release/siem_parser --show-alias-trace --input "$test_file" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ PASSED${NC}\n"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}❌ FAILED${NC}\n"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "${RED}❌ FAILED - File not found${NC}\n"
        FAILED=$((FAILED + 1))
    fi
}

# Build siem_parser if needed
if [ ! -f "siem_parser/target/release/siem_parser" ]; then
    echo -e "${YELLOW}Building siem_parser...${NC}"
    cd siem_parser && cargo build --release && cd ..
fi

'''
        
        # Add test cases
        all_test_data = self.generate_all_test_data()
        
        for category, test_cases in all_test_data.items():
            script_content += f'\n# {category.replace("_", " ").title()} Tests\n'
            script_content += f'echo -e "${{BLUE}}Testing {category.replace("_", " ").title()}${{NC}}"\n'
            
            for test_case in test_cases:
                test_file = f"$TEST_DIR/{category}/{test_case['name']}.json"
                test_name = test_case['name'].replace('_', ' ').title()
                script_content += f'run_test "{test_file}" "{test_name}"\n'
        
        script_content += '''
# Final summary
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}📊 FINAL RESULTS${NC}"
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo -e "${BLUE}📈 Total: $TOTAL${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL TESTS PASSED!${NC}"
    exit 0
else
    echo -e "\n${YELLOW}⚠️  Some tests failed.${NC}"
    exit 1
fi
'''
        
        with open(output_file, 'w') as f:
            f.write(script_content)
        
        os.chmod(output_file, 0o755)
        print(f"✅ Batch test script generated: {output_file}")

def main():
    """Main function to generate all test data"""
    print("🧪 Canonical Field Mapping Test Data Generator")
    print("=" * 50)
    
    generator = CanonicalFieldTestDataGenerator()
    
    # Generate and save test data
    generator.save_test_data_files()
    
    # Generate batch test script
    generator.generate_batch_test_script()
    
    print("\n✨ Test data generation completed!")
    print("\n📋 Usage:")
    print("   ./test_canonical_field_mapping.sh          # Run main test suite")
    print("   ./run_batch_canonical_tests.sh             # Run all generated tests")
    print("   siem_parser/target/release/siem_parser --show-alias-trace --input test_logs/test_case_1_known_aliases/basic_known_aliases.json")

if __name__ == '__main__':
    main()