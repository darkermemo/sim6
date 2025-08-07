#!/usr/bin/env python3
"""
Enterprise Event Seeder for SIEM ClickHouse Database
Seeds millions of realistic security events for testing /dev/events page
"""

import json
import random
import time
from datetime import datetime, timedelta
import requests
import sys

def generate_enterprise_events(count=1000000):
    """Generate realistic enterprise security events"""
    
    sources = [
        'windows_security', 'linux_syslog', 'cisco_firewall', 'palo_alto_fw',
        'exchange_server', 'sql_server', 'oracle_db', 'active_directory',
        'aws_cloudtrail', 'azure_ad', 'okta_sso', 'splunk_uf', 'elastic_beats',
        'apache_access', 'nginx_access', 'kubernetes', 'docker_runtime',
        'network_ids', 'web_proxy', 'email_security', 'endpoint_protection'
    ]
    
    severities = ['critical', 'high', 'medium', 'low', 'info']
    tenants = ['finance', 'hr', 'engineering', 'sales', 'marketing', 'ops', 'security', 'admin']
    users = [
        'admin', 'john.doe', 'jane.smith', 'service_sql', 'backup_svc',
        'web_app_pool', 'ldap_sync', 'monitoring', 'scanner', 'api_gateway',
        'sarah.wilson', 'mike.johnson', 'system_admin', 'db_backup',
        'security_analyst', 'network_admin', 'devops_user', 'audit_service'
    ]
    
    event_templates = {
        'windows_security': [
            'User {} logon from {}',
            'Failed login attempt for user {} from {}',
            'Privilege escalation detected for user {}',
            'Windows service {} started by user {}',
            'Registry modification by user {} on key {}'
        ],
        'linux_syslog': [
            'SSH connection established for user {} from {}',
            'Sudo command executed by user {}: {}',
            'Process {} started with PID {} by user {}',
            'File permission changed: {} by user {}',
            'Cron job executed for user {}: {}'
        ],
        'cisco_firewall': [
            'Traffic blocked from {} to {} on port {}',
            'VPN connection established for user {} from {}',
            'Firewall rule {} triggered for traffic from {}',
            'Port scan detected from {} targeting {}',
            'Suspicious traffic pattern from {} to {}'
        ],
        'sql_server': [
            'Query executed by {}: SELECT * FROM users',
            'Database backup completed for {} by user {}',
            'Failed login to database {} for user {}',
            'Table {} accessed by user {} - {} rows returned',
            'Database connection established for user {} from {}'
        ],
        'aws_cloudtrail': [
            'S3 bucket {} accessed by user {} from {}',
            'EC2 instance {} started by user {}',
            'IAM policy modified for user {} by {}',
            'CloudWatch alarm {} triggered for resource {}',
            'Lambda function {} executed by user {}'
        ]
    }
    
    events = []
    base_time = datetime.now() - timedelta(days=30)
    
    print(f"Generating {count} enterprise security events...")
    
    for i in range(count):
        if i % 100000 == 0 and i > 0:
            print(f"Generated {i} events...")
        
        # Distribute events over 30 days
        timestamp = base_time + timedelta(
            days=random.randint(0, 30),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59),
            seconds=random.randint(0, 59)
        )
        
        source = random.choice(sources)
        severity = random.choice(severities)
        tenant = random.choice(tenants)
        user = random.choice(users)
        
        # Generate realistic IP addresses
        if random.random() < 0.7:  # 70% internal IPs
            source_ip = f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"
        else:  # 30% external IPs
            source_ip = f"{random.randint(1,223)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"
        
        # Generate message based on source type
        if source in event_templates:
            template = random.choice(event_templates[source])
            if '{}' in template:
                placeholders = template.count('{}')
                if placeholders == 1:
                    message = template.format(user)
                elif placeholders == 2:
                    message = template.format(user, source_ip)
                elif placeholders == 3:
                    port = random.randint(80, 65535)
                    message = template.format(source_ip, f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}", port)
                else:
                    message = template.format(*[f"value_{j}" for j in range(placeholders)])
            else:
                message = template
        else:
            message = f"{source}: Event {i} for user {user} with severity {severity}"
        
        event = {
            'event_id': f"evt_{i:08d}",
            'tenant_id': tenant,
            'event_timestamp': timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            'source_ip': source_ip,
            'source': source,
            'source_type': source,
            'severity': severity,
            'facility': '16',
            'hostname': f"host-{tenant}-{random.randint(1,100):03d}.corp.local",
            'process': f"{source}_agent",
            'message': message,
            'raw_data': json.dumps({
                'event_id': f"evt_{i:08d}",
                'timestamp': timestamp.isoformat(),
                'source': source,
                'user': user,
                'action': 'logged',
                'details': message
            }),
            'source_port': random.randint(1024, 65535),
            'protocol': random.choice(['TCP', 'UDP', 'ICMP']),
            'tags': [source, severity, tenant],
            'fields': json.dumps({
                'user': user,
                'tenant': tenant,
                'event_category': source.split('_')[0],
                'priority': random.randint(1, 10)
            }),
            'processing_stage': 'processed',
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'updated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        events.append(event)
    
    return events

def seed_clickhouse_via_http(events, batch_size=10000):
    """Seed ClickHouse via HTTP API"""
    print("Attempting to seed ClickHouse via HTTP API...")
    
    for i in range(0, len(events), batch_size):
        batch = events[i:i + batch_size]
        
        # Prepare JSONEachRow format
        json_lines = []
        for event in batch:
            json_lines.append(json.dumps(event))
        
        data = '\n'.join(json_lines)
        
        try:
            response = requests.post(
                'http://localhost:8123/',
                params={
                    'query': 'INSERT INTO dev.events FORMAT JSONEachRow'
                },
                data=data,
                headers={'Content-Type': 'text/plain'},
                timeout=30
            )
            
            if response.status_code == 200:
                print(f"Successfully inserted batch {i//batch_size + 1}/{(len(events)-1)//batch_size + 1}")
            else:
                print(f"Failed to insert batch {i//batch_size + 1}: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"Error inserting batch {i//batch_size + 1}: {e}")
            return False
    
    return True

def create_json_files(events, batch_size=100000):
    """Create JSON files for manual import"""
    print("Creating JSON files for manual import...")
    
    for i in range(0, len(events), batch_size):
        batch = events[i:i + batch_size]
        filename = f"enterprise_events_batch_{i//batch_size + 1}.json"
        
        with open(filename, 'w') as f:
            for event in batch:
                f.write(json.dumps(event) + '\n')
        
        print(f"Created {filename} with {len(batch)} events")

def main():
    count = 1000000  # 1 million events
    if len(sys.argv) > 1:
        count = int(sys.argv[1])
    
    print(f"Seeding enterprise SIEM with {count} realistic security events")
    print("This will simulate a production environment with millions of logs")
    print("-" * 60)
    
    # Generate events
    events = generate_enterprise_events(count)
    
    # Try ClickHouse HTTP API first
    if seed_clickhouse_via_http(events):
        print(f"✅ Successfully seeded {count} events to ClickHouse!")
        print("Your /dev/events page will now show enterprise-scale data")
    else:
        print("❌ ClickHouse seeding failed, creating JSON files for manual import...")
        create_json_files(events)
        print("\nTo manually import:")
        print("1. Start ClickHouse: docker run -d --name clickhouse-server -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server")
        print("2. Import files: cat enterprise_events_batch_*.json | clickhouse-client --query='INSERT INTO dev.events FORMAT JSONEachRow'")

if __name__ == '__main__':
    main()