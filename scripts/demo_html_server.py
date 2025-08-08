#!/usr/bin/env python3
"""
Simple HTTP server to demonstrate the Enhanced Correlation Rules HTML interface
Serves the HTML files from siem_unified_pipeline/web/ and provides basic API endpoints
"""

import json
import http.server
import socketserver
import urllib.parse
import random
import datetime
import os
import datetime
from pathlib import Path

# Configuration
PORT = 8082
WEB_DIR = Path("siem_unified_pipeline/web")

class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        print(f"📥 GET {path}")
        
        # Route /dev paths to HTML files
        if path == '/dev' or path == '/dev/':
            self.serve_file('dashboard.html')
        elif path == '/dev/rules':
            self.serve_file('rules.html')
        elif path == '/dev/events':
            self.serve_file('events.html')
        elif path == '/dev/alerts':
            self.serve_file('alerts.html')
        elif path == '/dev/settings':
            self.serve_file('settings.html')
        
        # API endpoints
        elif path == '/api/v1/alert_rules':
            self.serve_alert_rules()
        elif path == '/api/v1/alerts':
            self.serve_alerts()
        elif path == '/api/v1/metrics':
            self.serve_metrics()
        elif path == '/api/v1/events/search':
            self.serve_event_search(parsed_path.query)
        
        # Default file serving
        else:
            super().do_GET()
    
    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        print(f"📤 POST {path}")
        
        if path == '/api/v1/rules/evaluate':
            self.handle_evaluate_rules()
        else:
            self.send_response(404)
            self.end_headers()
    
    def serve_file(self, filename):
        """Serve a specific HTML file from the web directory"""
        try:
            file_path = WEB_DIR / filename
            if file_path.exists():
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                self.send_response(200)
                self.send_header('Content-type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b'File not found')
        except Exception as e:
            print(f"❌ Error serving {filename}: {e}")
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f'Error: {e}'.encode())
    
    def serve_alert_rules(self):
        """Serve the 50 enhanced correlation rules"""
        rules = []
        
        # Generate our 50 enhanced rules
        severities = ['critical', 'high', 'medium', 'low', 'info']
        categories = [
            'Multi-Tenant Correlation',
            'IP Pattern Analysis', 
            'User Behavior Analytics',
            'Temporal Pattern Detection',
            'Volume Anomaly Detection'
        ]
        
        for i in range(1, 51):
            category_index = (i - 1) // 10
            category = categories[category_index] if category_index < len(categories) else categories[-1]
            severity = severities[i % 5]
            
            rules.append({
                'rule_id': f'enhanced_rule_{i}',
                'rule_name': f'{category} Rule {i}',
                'description': f'{category} pattern detection and analysis (Rule {i})',
                'severity': severity,
                'enabled': True,
                'tenant_scope': 'all',
                'created_at': datetime.datetime.now().isoformat(),
                'updated_at': datetime.datetime.now().isoformat()
            })
        
        self.send_json_response(rules)
    
    def serve_alerts(self):
        """Serve sample alerts data"""
        alerts = []
        
        # Generate sample alerts for demonstration
        import random
        severities = ['critical', 'high', 'medium', 'low', 'info']
        
        for i in range(150):  # Generate 150 sample alerts
            rule_id = f'enhanced_rule_{random.randint(1, 50)}'
            severity = random.choice(severities)
            
            alerts.append({
                'alert_id': f'alert_{i + 1}',
                'rule_id': rule_id,
                'severity': severity,
                'created_at': int(datetime.datetime.now().timestamp()) - random.randint(0, 3600),
                'status': 'alert',
                'event_ids': [f'event_{j}' for j in range(random.randint(10, 50))]
            })
        
        self.send_json_response(alerts)
    
    def serve_metrics(self):
        """Serve system metrics"""
        import random
        
        metrics = {
            'ingestion_rate': random.randint(500, 2000),
            'parsed_count': random.randint(50000, 200000),
            'total_events': random.randint(500000, 2000000),
            'total_alerts': random.randint(1000, 50000),
            'system_status': 'healthy',
            'timestamp': datetime.datetime.now().isoformat()
        }
        
        self.send_json_response(metrics)
    
    def handle_evaluate_rules(self):
        """Handle rule evaluation request"""
        response = {
            'status': 'success',
            'message': 'Rule evaluation triggered successfully',
            'rules_evaluated': 50,
            'timestamp': datetime.datetime.now().isoformat()
        }
        
        self.send_json_response(response)
    
    def serve_event_search(self, query_string):
        """Serve advanced event search with filters - Enterprise Scale"""
        try:
            # Parse query parameters
            import urllib.parse
            params = urllib.parse.parse_qs(query_string) if query_string else {}
            
            # Get pagination parameters
            page = int(params.get('page', ['1'])[0])
            page_size = int(params.get('page_size', ['100'])[0])
            
            # Generate realistic events based on search criteria
            events = self.generate_realistic_events(params, page, page_size)
            
            # Simulate massive enterprise dataset
            total_events = self.calculate_total_events(params)
            
            response = {
                'events': events,
                'total': total_events,  # Realistic enterprise scale
                'page': page,
                'page_size': page_size,
                'total_pages': (total_events + page_size - 1) // page_size,
                'search_time_ms': random.randint(150, 800),  # Realistic search time
                'data_sources': ['Windows Security', 'Linux Syslog', 'Firewall', 'Web Proxy', 'Database Audit', 'Network IDS', 'Email Security', 'Cloud Audit'],
                'event_types': ['Authentication', 'Network', 'File Access', 'Process Execution', 'System', 'Application', 'Database', 'Web Traffic'],
                'filtered_count': len(events) if params else total_events
            }
            
            self.send_json_response(response)
            
        except Exception as e:
            print(f"❌ Error in event search: {e}")
            self.send_json_response({'error': 'Search failed', 'events': []})

    def calculate_total_events(self, params):
        """Calculate total events based on realistic enterprise volumes"""
        # Base volume: simulate 24 hours of enterprise security events
        base_volume = 15_000_000  # 15 million events per day (typical enterprise)
        
        # Adjust based on filters
        if params.get('global_search'):
            # Text search reduces volume significantly
            base_volume = random.randint(50_000, 500_000)
        elif params.get('tenant'):
            # Single tenant = ~20% of total volume
            base_volume = random.randint(2_000_000, 4_000_000)
        elif params.get('severity'):
            severity = params.get('severity', [''])[0]
            if severity in ['critical', 'high']:
                base_volume = random.randint(100_000, 800_000)
            elif severity == 'medium':
                base_volume = random.randint(1_000_000, 3_000_000)
        elif params.get('user'):
            # Single user events
            base_volume = random.randint(10_000, 100_000)
        elif params.get('source_ip'):
            # Single IP events
            base_volume = random.randint(5_000, 50_000)
        
        return base_volume

    def generate_realistic_events(self, params, page=1, page_size=100):
        """Generate realistic events based on search parameters - Enterprise Scale"""
        events = []
        severities = ['critical', 'high', 'medium', 'low', 'info']
        # Enterprise-scale data sources and dimensions
        sources = ['windows_security', 'linux_syslog', 'cisco_firewall', 'palo_alto_fw', 
                  'web_proxy', 'exchange_mail', 'sql_server', 'oracle_db', 'active_directory',
                  'network_ids', 'aws_cloudtrail', 'azure_ad', 'okta_sso', 'vmware_vcenter',
                  'apache_access', 'nginx_access', 'kubernetes', 'docker_runtime']
        
        tenants = ['finance_dept', 'hr_department', 'engineering', 'sales_team', 'marketing',
                  'operations', 'security_team', 'executive', 'contractor_access', 'external_partners']
        
        users = ['admin', 'john.doe', 'jane.smith', 'service_sql', 'backup_svc', 'web_app_pool',
                'ldap_sync', 'monitoring_agent', 'elastic_beats', 'splunk_forwarder', 'scanner_nessus',
                'api_gateway', 'load_balancer', 'mail_relay', 'dns_resolver']
        
        # Realistic enterprise IP ranges
        ip_ranges = [
            '10.0.{}.{}', '172.16.{}.{}', '192.168.{}.{}',  # Internal
            '203.0.113.{}', '198.51.100.{}', '93.184.216.{}',  # External
            '8.8.8.{}', '1.1.1.{}', '208.67.222.{}'  # DNS/CDN
        ]
        
        # Enterprise-scale event templates covering all security domains
        event_templates = [
            # Authentication Events
            {
                'template': 'User {user} successful login from {source_ip} via {protocol}',
                'category': 'authentication',
                'fields': {'event_type': 'auth_success', 'protocol': 'rdp'}
            },
            {
                'template': 'Failed login attempt from {source_ip} for user {user} - {attempts} attempts',
                'category': 'authentication', 
                'fields': {'event_type': 'auth_failure', 'attempts': 5}
            },
            {
                'template': 'Privilege escalation: {user} granted admin rights on {hostname}',
                'category': 'privilege_escalation',
                'fields': {'event_type': 'privilege_change', 'new_role': 'administrator'}
            },
            # Network Security Events
            {
                'template': 'Firewall blocked connection from {source_ip}:{src_port} to {dest_ip}:{dest_port}',
                'category': 'network_security',
                'fields': {'event_type': 'firewall_block', 'protocol': 'tcp'}
            },
            {
                'template': 'Suspicious DNS query: {hostname} resolved {domain} to {dest_ip}',
                'category': 'dns_security',
                'fields': {'event_type': 'dns_query', 'domain': 'malicious-site.com'}
            },
            {
                'template': 'IDS Alert: Potential SQL injection from {source_ip} targeting {hostname}',
                'category': 'web_security',
                'fields': {'event_type': 'sql_injection', 'payload': 'union select'}
            },
            # System & Application Events
            {
                'template': 'Process created: {process} by {user} on {hostname} (PID: {pid})',
                'category': 'process_execution',
                'fields': {'event_type': 'process_start', 'process': 'powershell.exe', 'pid': 1234}
            },
            {
                'template': 'File access: {user} opened {file_path} from {source_ip}',
                'category': 'file_access',
                'fields': {'event_type': 'file_open', 'file_path': '/etc/shadow'}
            },
            {
                'template': 'Service {service_name} stopped unexpectedly on {hostname}',
                'category': 'system_event',
                'fields': {'event_type': 'service_stop', 'service_name': 'antivirus'}
            },
            # Database & Application Security
            {
                'template': 'Database login: {user} connected to {db_name} from {source_ip}',
                'category': 'database_access',
                'fields': {'event_type': 'db_connect', 'db_name': 'customer_db'}
            },
            {
                'template': 'High-privilege SQL query executed: {user} ran {query_type} on {db_name}',
                'category': 'database_security',
                'fields': {'event_type': 'sensitive_query', 'query_type': 'SELECT * FROM users'}
            },
            # Cloud & Modern Infrastructure
            {
                'template': 'AWS API call: {user} performed {api_action} from {source_ip}',
                'category': 'cloud_audit',
                'fields': {'event_type': 'aws_api', 'api_action': 'CreateUser'}
            },
            {
                'template': 'Container started: {container_image} on {hostname} by {user}',
                'category': 'container_security',
                'fields': {'event_type': 'container_start', 'container_image': 'nginx:latest'}
            },
            # Email & Communication Security
            {
                'template': 'Email blocked: {sender} to {recipient} - suspicious attachment detected',
                'category': 'email_security',
                'fields': {'event_type': 'email_block', 'attachment_type': 'executable'}
            },
            # Insider Threat & Behavioral
            {
                'template': 'Unusual data access: {user} accessed {data_volume}GB from {hostname}',
                'category': 'data_access',
                'fields': {'event_type': 'bulk_download', 'data_volume': 50}
            },
            {
                'template': 'After-hours access: {user} logged in at {timestamp} from {source_ip}',
                'category': 'behavioral_anomaly',
                'fields': {'event_type': 'off_hours_access', 'risk_score': 85}
            }
            {
                'template': 'Suspicious file access: {user} accessed {file_path} from {source_ip}',
                'category': 'file_access', 
                'fields': {'event_type': 'file_access', 'file_path': '/etc/passwd'}
            },
            {
                'template': 'Network connection to suspicious IP {dest_ip} from {source_ip}',
                'category': 'network',
                'fields': {'event_type': 'network_connection', 'dest_port': 443}
            },
            {
                'template': 'Process executed: {process} by user {user} on {hostname}',
                'category': 'process',
                'fields': {'event_type': 'process_execution', 'process': 'powershell.exe'}
            },
            {
                'template': 'Database query executed: {sql_query} by {user}',
                'category': 'database',
                'fields': {'event_type': 'sql_execution', 'sql_query': 'SELECT * FROM users'}
            }
        ]
        
        # Generate 50 realistic events
        for i in range(50):
            template = random.choice(event_templates)
            timestamp = datetime.datetime.now() - datetime.timedelta(
                minutes=random.randint(0, 1440)  # Last 24 hours
            )
            
            # Apply search filters
            tenant = random.choice(tenants)
            severity = random.choice(severities)
            source = random.choice(sources)
            user = random.choice(users)
            source_ip = f"192.168.{random.randint(1, 255)}.{random.randint(1, 255)}"
            dest_ip = f"10.0.{random.randint(1, 255)}.{random.randint(1, 255)}"
            hostname = f"host-{random.randint(1, 100)}"
            
            # Check if event matches search criteria
            if self.matches_search_criteria(params, tenant, severity, source, user, source_ip):
                message = template['template'].format(
                    source_ip=source_ip,
                    dest_ip=dest_ip,
                    user=user,
                    hostname=hostname,
                    file_path=template['fields'].get('file_path', '/tmp/file'),
                    process=template['fields'].get('process', 'cmd.exe'),
                    sql_query=template['fields'].get('sql_query', 'SELECT 1')
                )
                
                event = {
                    'event_id': f'evt_{i}_{int(timestamp.timestamp())}',
                    'event_timestamp': int(timestamp.timestamp()),
                    'tenant_id': tenant,
                    'source': source,
                    'severity': severity,
                    'source_ip': source_ip,
                    'dest_ip': dest_ip,
                    'user': user,
                    'hostname': hostname,
                    'message': message,
                    'raw_event': message,
                    'category': template['category'],
                    'event_type': template['fields']['event_type'],
                    'tags': [template['category'], 'security', f'severity_{severity}'],
                    'fields': {
                        **template['fields'],
                        'source_ip': source_ip,
                        'dest_ip': dest_ip,
                        'user': user,
                        'hostname': hostname
                    }
                }
                events.append(event)
        
        # Sort by timestamp (newest first)
        events.sort(key=lambda x: x['event_timestamp'], reverse=True)
        return events

    def matches_search_criteria(self, params, tenant, severity, source, user, source_ip):
        """Check if event matches search criteria"""
        # Global search
        global_search = params.get('global_search', [''])[0].lower()
        if global_search:
            search_text = f"{tenant} {severity} {source} {user} {source_ip}".lower()
            if global_search not in search_text:
                return False
        
        # Tenant filter
        tenant_filter = params.get('tenant', [''])[0]
        if tenant_filter and tenant != tenant_filter:
            return False
            
        # Source filter  
        source_filter = params.get('source', [''])[0]
        if source_filter and source != source_filter:
            return False
            
        # User filter
        user_filter = params.get('user', [''])[0]
        if user_filter and user_filter.lower() not in user.lower():
            return False
            
        # Source IP filter
        source_ip_filter = params.get('source_ip', [''])[0]
        if source_ip_filter and source_ip_filter not in source_ip:
            return False
            
        return True

    def send_json_response(self, data):
        """Send a JSON response"""
        json_data = json.dumps(data, indent=2, default=str)
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json_data.encode('utf-8'))

def main():
    print("🚀 Starting Enhanced Correlation Rules HTML Demo Server")
    print(f"📂 Serving from: {WEB_DIR.absolute()}")
    print(f"🌐 Server URL: http://localhost:{PORT}")
    print(f"🎯 Dashboard: http://localhost:{PORT}/dev")
    print(f"🔬 Rules Console: http://localhost:{PORT}/dev/rules")
    print()
    
    # Check if web directory exists
    if not WEB_DIR.exists():
        print(f"❌ Web directory not found: {WEB_DIR}")
        print("Please run this script from the project root directory")
        return
    
    # List available HTML files
    html_files = list(WEB_DIR.glob("*.html"))
    if html_files:
        print("📄 Available HTML files:")
        for file in html_files:
            print(f"   • {file.name}")
    else:
        print("⚠️ No HTML files found in web directory")
    
    print("\n🎬 Starting server...")
    
    try:
        with socketserver.TCPServer(("", PORT), CORSHTTPRequestHandler) as httpd:
            print(f"✅ Server running on port {PORT}")
            print("Press Ctrl+C to stop")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
    except Exception as e:
        print(f"❌ Server error: {e}")

if __name__ == "__main__":
    main()