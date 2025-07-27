#!/usr/bin/env python3
"""
SIEM Detection Validation Script
Validates that the SIEM system can detect security events using Sigma rules
"""

import requests
import json
import time
from datetime import datetime

# Configuration
SIEM_API_BASE = "http://localhost:8080/api/v1"
TENANT_ID = "tenant-A"

def check_alerts():
    """Check for generated alerts"""
    print("\n🔍 Checking for Generated Alerts")
    print("=" * 50)
    
    try:
        response = requests.get(f"{SIEM_API_BASE}/alerts")
        if response.status_code == 200:
            data = response.json()
            alerts = data.get('data', [])
            
            print(f"✓ Found {len(alerts)} total alerts in the system")
            
            if alerts:
                print("\n📋 Alert Details:")
                print("-" * 30)
                for i, alert in enumerate(alerts, 1):
                    alert_time = datetime.fromtimestamp(alert['alert_timestamp']).strftime('%Y-%m-%d %H:%M:%S')
                    print(f"{i}. Alert ID: {alert['alert_id']}")
                    print(f"   Rule: {alert['rule_name']}")
                    print(f"   Severity: {alert['severity']}")
                    print(f"   Status: {alert['status']}")
                    print(f"   Time: {alert_time}")
                    print(f"   Event ID: {alert['event_id']}")
                    print()
            
            return len(alerts)
        else:
            print(f"✗ Failed to retrieve alerts: {response.status_code}")
            return 0
    except Exception as e:
        print(f"✗ Error checking alerts: {e}")
        return 0

def check_rules():
    """Check created rules"""
    print("\n📜 Checking Created Rules")
    print("=" * 50)
    
    try:
        response = requests.get(f"{SIEM_API_BASE}/rules")
        if response.status_code == 200:
            data = response.json()
            rules = data.get('data', [])
            
            print(f"✓ Found {len(rules)} total rules in the system")
            
            if rules:
                print("\n📋 Rule Details:")
                print("-" * 30)
                for i, rule in enumerate(rules, 1):
                    created_time = datetime.fromtimestamp(rule['created_at']).strftime('%Y-%m-%d %H:%M:%S')
                    print(f"{i}. Rule ID: {rule['rule_id']}")
                    print(f"   Name: {rule['rule_name']}")
                    print(f"   Engine: {rule.get('engine_type', 'scheduled')}")
                    print(f"   Status: {rule.get('status', 'active')}")
                    print(f"   Created: {created_time}")
                    print()
            
            return len(rules)
        else:
            print(f"✗ Failed to retrieve rules: {response.status_code}")
            return 0
    except Exception as e:
        print(f"✗ Error checking rules: {e}")
        return 0

def check_events():
    """Check ingested events"""
    print("\n📊 Checking Ingested Events")
    print("=" * 50)
    
    try:
        response = requests.get(f"{SIEM_API_BASE}/events")
        if response.status_code == 200:
            events = response.json()
            print(f"✓ Found {len(events)} total events in the system")
            return len(events)
        else:
            print(f"✗ Failed to retrieve events: {response.status_code}")
            return 0
    except Exception as e:
        print(f"✗ Error checking events: {e}")
        return 0

def check_system_health():
    """Check SIEM system health"""
    print("\n🏥 System Health Check")
    print("=" * 50)
    
    endpoints = [
        ("/health", "Health Check"),
        ("/events", "Events API"),
        ("/rules", "Rules API"),
        ("/alerts", "Alerts API")
    ]
    
    healthy_endpoints = 0
    
    for endpoint, name in endpoints:
        try:
            response = requests.get(f"{SIEM_API_BASE.replace('/api/v1', '')}{endpoint}" if endpoint == "/health" else f"{SIEM_API_BASE}{endpoint}")
            if response.status_code in [200, 201]:
                print(f"✓ {name}: OK")
                healthy_endpoints += 1
            else:
                print(f"✗ {name}: Failed ({response.status_code})")
        except Exception as e:
            print(f"✗ {name}: Error - {e}")
    
    print(f"\n📈 System Health: {healthy_endpoints}/{len(endpoints)} endpoints healthy")
    return healthy_endpoints == len(endpoints)

def main():
    """Main validation function"""
    print("🔒 SIEM Detection Validation")
    print("=" * 60)
    print(f"Target: {SIEM_API_BASE}")
    print(f"Tenant: {TENANT_ID}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Check system health
    system_healthy = check_system_health()
    
    # Check components
    rules_count = check_rules()
    events_count = check_events()
    alerts_count = check_alerts()
    
    # Summary
    print("\n🎯 Validation Summary")
    print("=" * 60)
    print(f"System Health: {'✓ HEALTHY' if system_healthy else '✗ UNHEALTHY'}")
    print(f"Rules Created: {rules_count}")
    print(f"Events Ingested: {events_count}")
    print(f"Alerts Generated: {alerts_count}")
    
    # Overall assessment
    if system_healthy and rules_count > 0 and events_count > 0:
        if alerts_count > 0:
            print("\n🎉 VALIDATION PASSED!")
            print("✓ System is healthy")
            print("✓ Rules are created and active")
            print("✓ Events are being ingested")
            print("✓ Alerts are being generated")
            print("\n🛡️  Your SIEM system is working correctly!")
        else:
            print("\n⚠️  PARTIAL SUCCESS")
            print("✓ System is healthy")
            print("✓ Rules are created")
            print("✓ Events are being ingested")
            print("⚠️  No alerts generated yet (may need more time)")
    else:
        print("\n❌ VALIDATION FAILED")
        print("Please check the system configuration and try again.")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()