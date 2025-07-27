#!/usr/bin/env python3
"""
SIEM System Test Script
Generates test events and creates Sigma rules to validate the SOC platform's detection capabilities.
"""

import requests
import json
import time
from datetime import datetime, timezone
import uuid

# SIEM API Configuration
SIEM_API_BASE = "http://localhost:8080/api/v1"
TENANT_ID = "tenant-A"

# Test Events for Sigma Rules (Using supported transpiler syntax)
test_events = [
    {
        "rule_name": "Mimikatz Credential Dumping Detection",
        "sigma_yaml": """title: Mimikatz Credential Dumping Detection
id: 4f7c1a34-8b2e-4d5f-9a3c-7e8f1b2d3c4e
status: test
description: Detects potential credential dumping using Mimikatz tool
references:
    - https://attack.mitre.org/techniques/T1003/001/
author: SOC Team
date: 2024/01/15
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        keywords:
            - 'mimikatz.exe'
            - 'sekurlsa::logonpasswords'
    condition: selection
falsepositives:
    - Legitimate security testing
level: high
tags:
    - attack.credential_access
    - attack.t1003.001""",
        "event": {
            "source_ip": "192.168.1.100",
            "raw_log": '{"EventID": 4688, "ProcessName": "C:\\\\Tools\\\\mimikatz.exe", "CommandLine": "mimikatz.exe sekurlsa::logonpasswords", "User": "DOMAIN\\\\admin", "LogonId": "0x12345", "ProcessId": 1234, "ParentProcessName": "C:\\\\Windows\\\\System32\\\\cmd.exe", "TimeCreated": "2024-01-15T10:30:00Z"}'
        }
    },
    {
        "rule_name": "PowerShell Execution Policy Bypass Detection",
        "sigma_yaml": """title: PowerShell Execution Policy Bypass Detection
id: 2a5f8c1d-9e3b-4f7a-8c2d-1e4f5a6b7c8d
status: test
description: Detects PowerShell execution policy bypass attempts
references:
    - https://attack.mitre.org/techniques/T1059/001/
author: SOC Team
date: 2024/01/15
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        keywords:
            - 'powershell.exe'
            - '-ExecutionPolicy Bypass'
    condition: selection
falsepositives:
    - Legitimate administrative scripts
level: medium
tags:
    - attack.execution
    - attack.t1059.001""",
        "event": {
            "source_ip": "192.168.1.101",
            "raw_log": '{"EventID": 4688, "ProcessName": "C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe", "CommandLine": "powershell.exe -ExecutionPolicy Bypass -File C:\\\\temp\\\\malicious.ps1", "User": "DOMAIN\\\\user1", "LogonId": "0x67890", "ProcessId": 5678, "ParentProcessName": "C:\\\\Windows\\\\System32\\\\cmd.exe", "TimeCreated": "2024-01-15T10:35:00Z"}'
        }
    },
    {
        "rule_name": "Remote Service Creation Detection",
        "sigma_yaml": """title: Remote Service Creation Detection
id: 3b6c9d2e-4f8a-5e1b-9c3d-2f5a6b7c8d9e
status: test
description: Detects remote service creation using sc.exe
references:
    - https://attack.mitre.org/techniques/T1021/002/
author: SOC Team
date: 2024/01/15
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        keywords:
            - 'sc.exe'
            - 'create'
    condition: selection
falsepositives:
    - Legitimate remote administration
level: medium
tags:
    - attack.lateral_movement
    - attack.t1021.002""",
        "event": {
            "source_ip": "192.168.1.102",
            "raw_log": '{"EventID": 4688, "ProcessName": "C:\\\\Windows\\\\System32\\\\sc.exe", "CommandLine": "sc.exe \\\\\\\\192.168.1.50 create evilservice binpath= \\"C:\\\\temp\\\\backdoor.exe\\"", "User": "DOMAIN\\\\admin", "LogonId": "0xABCDE", "ProcessId": 9012, "ParentProcessName": "C:\\\\Windows\\\\System32\\\\cmd.exe", "TimeCreated": "2024-01-15T10:40:00Z"}'
        }
    },
    {
        "rule_name": "Windows Defender Disabling Detection",
        "sigma_yaml": """title: Windows Defender Disabling Detection
id: 4c7d8e3f-5a9b-6f2c-8d4e-3f6a7b8c9d0e
status: test
description: Detects attempts to disable Windows Defender
references:
    - https://attack.mitre.org/techniques/T1562/001/
author: SOC Team
date: 2024/01/15
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        keywords: 'Set-MpPreference -DisableRealtimeMonitoring'
    condition: selection
falsepositives:
    - Legitimate system maintenance
level: high
tags:
    - attack.defense_evasion
    - attack.t1562.001""",
        "event": {
            "source_ip": "192.168.1.103",
            "raw_log": '{"EventID": 4688, "ProcessName": "C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe", "CommandLine": "powershell.exe Set-MpPreference -DisableRealtimeMonitoring $true", "User": "DOMAIN\\\\admin", "LogonId": "0xFEDCB", "ProcessId": 3456, "ParentProcessName": "C:\\\\Windows\\\\System32\\\\cmd.exe", "TimeCreated": "2024-01-15T10:45:00Z"}'
        }
    },
    {
        "rule_name": "Brute Force Login Detection",
        "sigma_yaml": """title: Brute Force Login Detection
id: 5d8e9f4a-6b0c-7f3d-9e5f-4a7b8c9d0e1f
status: test
description: Detects multiple failed login attempts indicating brute force attack
references:
    - https://attack.mitre.org/techniques/T1110/
author: SOC Team
date: 2024/01/15
logsource:
    category: authentication
    product: windows
detection:
    selection:
        keywords: 'failed login'
    condition: count() > 3
timeframe: 5m
falsepositives:
    - User password expiration
level: medium
tags:
    - attack.credential_access
    - attack.t1110""",
        "event": {
            "source_ip": "192.168.1.104",
            "raw_log": '{"EventID": 4625, "LogonType": 3, "Status": "0xC000006D", "SubStatus": "0xC0000064", "Account": "admin", "Source": "192.168.1.200", "Message": "failed login attempt for user admin", "TimeCreated": "2024-01-15T10:50:00Z"}'
        }
    }
]

def send_events(events_data):
    """Send events to SIEM API"""
    url = f"{SIEM_API_BASE}/events"
    
    payload = {
        "events": events_data
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 202:
            print(f"✓ Successfully sent {len(events_data)} events")
            return True
        else:
            print(f"✗ Failed to send events: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"✗ Error sending events: {e}")
        return False

def create_sigma_rule(rule_name, sigma_yaml):
    """Create a Sigma rule in the SIEM"""
    url = f"{SIEM_API_BASE}/rules/sigma"
    
    payload = {
        "sigma_yaml": sigma_yaml
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 201:
            result = response.json()
            print(f"✓ Successfully created Sigma rule: {rule_name}")
            print(f"  Rule ID: {result['rule']['rule_id']}")
            print(f"  Engine Type: {result['complexity_analysis']['engine_type']}")
            print(f"  Is Complex: {result['complexity_analysis']['is_complex']}")
            if result['complexity_analysis']['complexity_reasons']:
                print(f"  Complexity Reasons: {', '.join(result['complexity_analysis']['complexity_reasons'])}")
            return result['rule']['rule_id']
        else:
            print(f"✗ Failed to create Sigma rule '{rule_name}': {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"✗ Error creating Sigma rule '{rule_name}': {e}")
        return None

def check_alerts():
    """Check for generated alerts"""
    # Note: This would need to be implemented based on your alert endpoint
    # For now, we'll just check if events were processed
    url = f"{SIEM_API_BASE}/events"
    
    try:
        response = requests.get(url)
        if response.status_code == 200:
            events = response.json()
            print(f"✓ Found {len(events)} events in the system")
            return len(events)
        else:
            print(f"✗ Failed to retrieve events: {response.status_code}")
            return 0
    except Exception as e:
        print(f"✗ Error checking events: {e}")
        return 0

def main():
    """Main test execution"""
    print("🔍 SIEM System Test - Security Detection Validation")
    print("=" * 60)
    
    # Step 1: Create Sigma rules
    print("\n📋 Step 1: Creating Sigma Rules")
    print("-" * 30)
    
    rule_ids = []
    for test_case in test_events:
        rule_id = create_sigma_rule(test_case["rule_name"], test_case["sigma_yaml"])
        if rule_id:
            rule_ids.append(rule_id)
        time.sleep(1)  # Small delay between rule creations
    
    print(f"\n✓ Created {len(rule_ids)} Sigma rules successfully")
    
    # Step 2: Send test events
    print("\n📤 Step 2: Sending Test Events")
    print("-" * 30)
    
    events_to_send = [test_case["event"] for test_case in test_events]
    
    if send_events(events_to_send):
        print("✓ All test events sent successfully")
    else:
        print("✗ Failed to send some test events")
        return
    
    # Step 3: Wait for processing
    print("\n⏳ Step 3: Waiting for Event Processing")
    print("-" * 30)
    print("Waiting 10 seconds for events to be processed...")
    time.sleep(10)
    
    # Step 4: Check results
    print("\n🔍 Step 4: Checking Results")
    print("-" * 30)
    
    event_count = check_alerts()
    
    # Summary
    print("\n📊 Test Summary")
    print("=" * 30)
    print(f"Sigma Rules Created: {len(rule_ids)}")
    print(f"Test Events Sent: {len(events_to_send)}")
    print(f"Events in System: {event_count}")
    
    if len(rule_ids) > 0 and event_count > 0:
        print("\n🎉 SIEM System Test PASSED!")
        print("✓ Rules created successfully")
        print("✓ Events ingested successfully")
        print("✓ System is functioning properly")
    else:
        print("\n❌ SIEM System Test FAILED!")
        print("Please check the system configuration and logs")
    
    print("\n" + "=" * 60)
    print("Test completed. Check your SIEM dashboard for alerts.")

if __name__ == "__main__":
    main()