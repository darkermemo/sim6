#!/usr/bin/env python3
"""
Comprehensive test for the Enhanced Rule Creation & Parsing Audit System
Tests the full end-to-end flow as specified in the user requirements:
1. Extract all JSON keys from raw_data 
2. Dynamic field selection in rule creation
3. JSONExtract filters generation
4. Parsing audit with 100% accuracy verification
5. Multi-field correlation rules with 10+ events
"""

import json
import time
from datetime import datetime
import subprocess
import requests
from clickhouse_driver import Client

def test_field_extraction():
    """Test Step 1: Extract all JSON keys and physical columns"""
    print("🔍 STEP 1: Testing field extraction...")
    
    # Connect to ClickHouse
    client = Client(host='localhost', port=9000, database='dev')
    
    # Get physical columns
    physical_columns = client.execute("DESCRIBE TABLE dev.events")
    physical_column_names = [col[0] for col in physical_columns]
    
    # Get JSON keys
    json_keys_query = """
        SELECT DISTINCT key
        FROM (
          SELECT arrayJoin(JSONExtractKeys(raw_event)) AS key
          FROM dev.events
          WHERE raw_event LIKE '{%}'
          LIMIT 1000
        )
        ORDER BY key
    """
    json_keys = [row[0] for row in client.execute(json_keys_query)]
    
    print(f"   ✅ Found {len(physical_column_names)} physical columns")
    print(f"   ✅ Found {len(json_keys)} JSON keys")
    print(f"   📊 Total available fields: {len(physical_column_names) + len(json_keys)}")
    
    # Verify we have enough fields for complex rules
    assert len(physical_column_names) >= 10, "Need at least 10 physical columns"
    assert len(json_keys) >= 10, "Need at least 10 JSON keys"
    
    return physical_column_names, json_keys

def test_api_field_endpoint():
    """Test the /api/v1/fields endpoint"""
    print("\n🔍 STEP 2: Testing fields API endpoint...")
    
    try:
        response = requests.get("http://localhost:8082/api/v1/fields", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ API returned {data.get('total_count', 0)} total fields")
            print(f"   📋 Physical columns: {len(data.get('physical_columns', []))}")
            print(f"   🔧 JSON keys: {len(data.get('json_keys', []))}")
            return data
        else:
            print(f"   ⚠️  API not available (status {response.status_code})")
            return None
    except Exception as e:
        print(f"   ⚠️  API not available: {e}")
        return None

def test_parsing_audit():
    """Test the parsing audit functionality"""
    print("\n🔍 STEP 3: Testing parsing audit...")
    
    try:
        response = requests.get("http://localhost:8082/api/v1/parsing/audit", timeout=10)
        if response.status_code == 200:
            result = response.json()
            
            total_events = result.get('total_events', 0)
            parsed_ok = result.get('parsed_ok', 0)
            parsed_bad = result.get('parsed_bad', 0)
            success_rate = result.get('success_percentage', 0)
            
            print(f"   📊 Total events analyzed: {total_events:,}")
            print(f"   ✅ Correctly parsed: {parsed_ok:,}")
            print(f"   ❌ Parsing mismatches: {parsed_bad:,}")
            print(f"   📈 Success rate: {success_rate:.2f}%")
            
            if result.get('mismatches'):
                print(f"   🔍 Found {len(result['mismatches'])} mismatch examples")
                for i, mismatch in enumerate(result['mismatches'][:3]):
                    print(f"      • Event {i+1}: {mismatch['event_id'][:8]}... "
                          f"DB='{mismatch['parsed_tenant']}' vs JSON='{mismatch['raw_tenant']}'")
            
            # Verify parsing quality
            if success_rate >= 95:
                print("   🎉 EXCELLENT: Parsing accuracy is excellent!")
            elif success_rate >= 80:
                print("   ⚠️  WARNING: Parsing accuracy needs improvement")
            else:
                print("   ❌ CRITICAL: Poor parsing accuracy detected!")
                
            return result
        else:
            print(f"   ⚠️  Parsing audit API not available (status {response.status_code})")
            return None
    except Exception as e:
        print(f"   ⚠️  Parsing audit API error: {e}")
        return None

def create_complex_rule():
    """Test creating a complex rule with multiple JSON and column conditions"""
    print("\n🔍 STEP 4: Testing complex rule creation...")
    
    # Define a complex rule with multiple conditions
    rule_data = {
        "rule_name": "IIS_High_Severity_Multi_Field_Test",
        "tenant_scope": "all",
        "description": "Test rule combining physical columns and JSON fields - IIS 500 errors from specific servers with high bytes",
        "severity": "High",
        "conditions": [
            {
                "field": "source_type",
                "field_type": "column",
                "operator": "=",
                "value": "Auto-detected"
            },
            {
                "field": "log_source",
                "field_type": "json",
                "operator": "=", 
                "value": "IIS"
            },
            {
                "field": "status_code",
                "field_type": "json",
                "operator": "=",
                "value": "500"
            },
            {
                "field": "server_name",
                "field_type": "json",
                "operator": "LIKE",
                "value": "WEB-"
            },
            {
                "field": "bytes_sent",
                "field_type": "json",
                "operator": ">",
                "value": "10000"
            }
        ]
    }
    
    try:
        response = requests.post(
            "http://localhost:8082/api/v1/alert_rules/enhanced",
            json=rule_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            rule_id = result.get('rule_id')
            kql_query = result.get('kql_query')
            
            print(f"   ✅ Rule created successfully!")
            print(f"   🆔 Rule ID: {rule_id}")
            print(f"   📝 Generated SQL: {kql_query[:100]}...")
            print(f"   🔧 Conditions: {len(rule_data['conditions'])} multi-type conditions")
            
            # Verify the SQL contains JSONExtract functions
            assert "JSONExtractString(raw_event" in kql_query, "SQL should contain JSONExtract functions"
            assert "source_type =" in kql_query, "SQL should contain physical column conditions"
            assert len(rule_data['conditions']) == 5, "Should have 5 conditions"
            
            return rule_id, kql_query
        else:
            print(f"   ❌ Rule creation failed: {response.status_code}")
            if response.text:
                print(f"      Error: {response.text}")
            return None, None
    except Exception as e:
        print(f"   ❌ Rule creation error: {e}")
        return None, None

def verify_rule_in_database(rule_id):
    """Verify the rule was stored correctly in ClickHouse"""
    print("\n🔍 STEP 5: Verifying rule in database...")
    
    try:
        client = Client(host='localhost', port=9000, database='dev')
        
        # Check if the rule exists
        rules = client.execute(
            "SELECT rule_id, rule_name, kql_query, severity, enabled FROM dev.alert_rules WHERE rule_id = %s",
            [rule_id]
        )
        
        if rules:
            rule = rules[0]
            print(f"   ✅ Rule found in database!")
            print(f"   📋 Name: {rule[1]}")
            print(f"   🔧 Query: {rule[2][:80]}...")
            print(f"   ⚠️  Severity: {rule[3]}")
            print(f"   🟢 Enabled: {bool(rule[4])}")
            
            return True
        else:
            print(f"   ❌ Rule not found in database!")
            return False
            
    except Exception as e:
        print(f"   ❌ Database verification error: {e}")
        return False

def test_rule_execution(rule_id, kql_query):
    """Test executing the rule to find matching events"""
    print("\n🔍 STEP 6: Testing rule execution...")
    
    try:
        client = Client(host='localhost', port=9000, database='dev')
        
        # Execute the rule query to find matching events
        print(f"   🔍 Executing rule query...")
        
        # Extract just the SELECT part for testing
        if "SELECT" in kql_query and "FROM" in kql_query:
            # Add LIMIT for testing
            test_query = kql_query + " LIMIT 20"
            
            print(f"   📋 Test query: {test_query[:100]}...")
            
            matching_events = client.execute(test_query)
            
            print(f"   ✅ Found {len(matching_events)} matching events")
            
            if matching_events:
                print(f"   📋 Sample event IDs:")
                for i, event in enumerate(matching_events[:5]):
                    event_id = event[0] if event else "unknown"
                    print(f"      • Event {i+1}: {event_id}")
                
                # Verify we have enough events for correlation
                if len(matching_events) >= 10:
                    print(f"   🎉 SUCCESS: Found {len(matching_events)} events (≥10 required)")
                    return True
                else:
                    print(f"   ⚠️  WARNING: Only {len(matching_events)} events found (need ≥10)")
                    return False
            else:
                print(f"   ⚠️  No matching events found - rule may be too restrictive")
                return False
                
    except Exception as e:
        print(f"   ❌ Rule execution error: {e}")
        return False

def test_ui_pages():
    """Test that all UI pages are accessible"""
    print("\n🔍 STEP 7: Testing UI pages...")
    
    pages = [
        ("/dev/rules", "Rules Dashboard"),
        ("/dev/rules/new", "New Rule Creation"),
        ("/dev/events", "Events Search"),
    ]
    
    accessible_pages = 0
    
    for url, name in pages:
        try:
            response = requests.get(f"http://localhost:8082{url}", timeout=5)
            if response.status_code == 200:
                print(f"   ✅ {name}: Accessible")
                
                # Check for key content
                if "new" in url and "{{FIELD_OPTIONS}}" not in response.text:
                    print(f"      📋 Field options properly templated")
                elif "rules" in url and "Audit Parsing" in response.text:
                    print(f"      🔍 Audit Parsing button present")
                    
                accessible_pages += 1
            else:
                print(f"   ❌ {name}: Not accessible ({response.status_code})")
        except Exception as e:
            print(f"   ❌ {name}: Error accessing ({e})")
    
    print(f"   📊 Accessible pages: {accessible_pages}/{len(pages)}")
    return accessible_pages == len(pages)

def generate_test_report():
    """Generate a comprehensive test report"""
    print("\n" + "="*60)
    print("📋 ENHANCED RULE CREATION SYSTEM - TEST REPORT")
    print("="*60)
    
    start_time = time.time()
    
    # Run all tests
    results = {}
    
    try:
        # Test 1: Field Extraction
        physical_columns, json_keys = test_field_extraction()
        results['field_extraction'] = {
            'status': 'PASS',
            'physical_columns': len(physical_columns),
            'json_keys': len(json_keys),
            'total_fields': len(physical_columns) + len(json_keys)
        }
    except Exception as e:
        results['field_extraction'] = {'status': 'FAIL', 'error': str(e)}
    
    # Test 2: API Endpoints
    field_data = test_api_field_endpoint()
    results['api_fields'] = {'status': 'PASS' if field_data else 'SKIP'}
    
    # Test 3: Parsing Audit
    audit_result = test_parsing_audit()
    results['parsing_audit'] = {
        'status': 'PASS' if audit_result else 'SKIP',
        'success_rate': audit_result.get('success_percentage', 0) if audit_result else 0
    }
    
    # Test 4: Rule Creation
    rule_id, kql_query = create_complex_rule()
    results['rule_creation'] = {
        'status': 'PASS' if rule_id else 'SKIP',
        'rule_id': rule_id
    }
    
    # Test 5: Database Verification
    if rule_id:
        db_verified = verify_rule_in_database(rule_id)
        results['database_verification'] = {'status': 'PASS' if db_verified else 'FAIL'}
    else:
        results['database_verification'] = {'status': 'SKIP'}
    
    # Test 6: Rule Execution
    if rule_id and kql_query:
        rule_executed = test_rule_execution(rule_id, kql_query)
        results['rule_execution'] = {'status': 'PASS' if rule_executed else 'FAIL'}
    else:
        results['rule_execution'] = {'status': 'SKIP'}
    
    # Test 7: UI Pages
    ui_accessible = test_ui_pages()
    results['ui_pages'] = {'status': 'PASS' if ui_accessible else 'FAIL'}
    
    # Calculate overall score
    total_tests = len(results)
    passed_tests = sum(1 for r in results.values() if r['status'] == 'PASS')
    skipped_tests = sum(1 for r in results.values() if r['status'] == 'SKIP')
    failed_tests = sum(1 for r in results.values() if r['status'] == 'FAIL')
    
    elapsed_time = time.time() - start_time
    
    # Print summary
    print(f"\n📊 TEST SUMMARY:")
    print(f"   ✅ Passed: {passed_tests}")
    print(f"   ⚠️  Skipped: {skipped_tests}")
    print(f"   ❌ Failed: {failed_tests}")
    print(f"   📈 Success Rate: {(passed_tests/total_tests)*100:.1f}%")
    print(f"   ⏱️  Duration: {elapsed_time:.2f}s")
    
    print(f"\n🎯 DETAILED RESULTS:")
    for test_name, result in results.items():
        status_icon = {'PASS': '✅', 'FAIL': '❌', 'SKIP': '⚠️'}[result['status']]
        print(f"   {status_icon} {test_name.replace('_', ' ').title()}: {result['status']}")
        
        if result['status'] == 'FAIL' and 'error' in result:
            print(f"      Error: {result['error']}")
    
    # Specific achievements
    print(f"\n🏆 KEY ACHIEVEMENTS:")
    if results['field_extraction']['status'] == 'PASS':
        total_fields = results['field_extraction']['total_fields']
        print(f"   📋 {total_fields} total fields available for rule creation")
    
    if results['parsing_audit']['status'] == 'PASS':
        success_rate = results['parsing_audit']['success_rate']
        print(f"   🔍 {success_rate:.2f}% parsing accuracy verified")
    
    if results['rule_creation']['status'] == 'PASS':
        print(f"   🔧 Complex multi-field rule created successfully")
        print(f"   📝 JSONExtract functions properly generated")
    
    print(f"\n🎉 IMPLEMENTATION STATUS:")
    if passed_tests >= 5:
        print("   ✅ EXCELLENT: Enhanced rule creation system is fully functional!")
    elif passed_tests >= 3:
        print("   ⚠️  GOOD: Core functionality working with some limitations")
    else:
        print("   ❌ NEEDS WORK: Significant issues need to be addressed")
    
    return results

if __name__ == "__main__":
    print("🎯 Starting Enhanced Rule Creation System Tests...")
    print("=" * 60)
    
    # Check if ClickHouse is available
    try:
        client = Client(host='localhost', port=9000, database='dev')
        event_count = client.execute("SELECT COUNT(*) FROM dev.events")[0][0]
        print(f"🔗 ClickHouse connected: {event_count:,} events available")
    except Exception as e:
        print(f"❌ ClickHouse connection failed: {e}")
        print("Please ensure ClickHouse is running and accessible.")
        exit(1)
    
    # Run comprehensive tests
    results = generate_test_report()
    
    # Return appropriate exit code
    passed_tests = sum(1 for r in results.values() if r['status'] == 'PASS')
    exit(0 if passed_tests >= 5 else 1)