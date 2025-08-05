#!/usr/bin/env python3
"""
Comprehensive Log Test Generator for SIEM Parser Testing
Generates 500+ diverse log samples representing real-world log sources
"""

import json
import random
import time
from datetime import datetime, timedelta
from typing import Dict, List
import uuid

class ComprehensiveLogGenerator:
    def __init__(self):
        self.current_time = int(time.time())
        self.test_data = []
        
    def generate_ecs_logs(self, count: int = 50) -> List[Dict]:
        """Generate Elastic Common Schema (ECS) logs"""
        logs = []
        for i in range(count):
            log = {
                "@timestamp": (datetime.now() - timedelta(hours=random.randint(0, 24))).isoformat() + "Z",
                "event": {
                    "category": random.choice(["network", "process", "file", "authentication", "web"]),
                    "action": random.choice(["connection", "login", "file_create", "http_request", "deny"]),
                    "outcome": random.choice(["success", "failure", "unknown"]),
                    "dataset": "test-ecs",
                    "module": "test"
                },
                "source": {
                    "ip": f"192.168.{random.randint(1,254)}.{random.randint(1,254)}",
                    "port": random.choice([80, 443, 22, 21, 25, 993, 8080, 3389]),
                    "geo": {
                        "country_name": random.choice(["United States", "Germany", "Japan", "Brazil"])
                    }
                },
                "destination": {
                    "ip": f"10.0.{random.randint(1,254)}.{random.randint(1,254)}",
                    "port": random.choice([80, 443, 22, 21, 25, 993, 8080, 3389])
                },
                "network": {
                    "protocol": random.choice(["tcp", "udp", "icmp"]),
                    "bytes": random.randint(64, 65536)
                },
                "user": {
                    "name": random.choice(["admin", "user1", "jdoe", "alice", "bob", "service_account"]),
                    "id": str(random.randint(1000, 9999))
                },
                "host": {
                    "name": f"host-{random.randint(1,100)}",
                    "ip": f"192.168.{random.randint(1,254)}.{random.randint(1,254)}"
                },
                "http": {
                    "request": {
                        "method": random.choice(["GET", "POST", "PUT", "DELETE", "HEAD"]),
                        "bytes": random.randint(100, 5000)
                    },
                    "response": {
                        "status_code": random.choice([200, 301, 404, 403, 500, 502]),
                        "bytes": random.randint(500, 50000)
                    }
                },
                "message": f"ECS test log entry {i} - {random.choice(['Authentication successful', 'File access denied', 'Network connection established', 'HTTP request processed', 'System event logged'])}"
            }
            logs.append(log)
        return logs
    
    def generate_splunk_cim_logs(self, count: int = 50) -> List[Dict]:
        """Generate Splunk Common Information Model logs"""
        logs = []
        for i in range(count):
            log = {
                "_time": self.current_time - random.randint(0, 86400),  # Unix timestamp
                "sourcetype": random.choice(["access_combined", "cisco:asa", "windows:security", "linux:audit", "aws:cloudtrail"]),
                "source": f"/var/log/{random.choice(['access.log', 'security.log', 'audit.log', 'firewall.log'])}",
                "host": f"splunk-host-{random.randint(1,50)}",
                "index": "test_index",
                "src": f"172.16.{random.randint(1,254)}.{random.randint(1,254)}",
                "dest": f"10.10.{random.randint(1,254)}.{random.randint(1,254)}",
                "src_port": random.choice([80, 443, 22, 21, 3389, 135, 445]),
                "dest_port": random.choice([80, 443, 22, 21, 3389, 135, 445]),
                "protocol": random.choice(["tcp", "udp", "icmp"]),
                "action": random.choice(["allowed", "blocked", "dropped", "accepted"]),
                "user": random.choice(["admin", "service", "guest", "user123", "system"]),
                "app": random.choice(["web", "ssh", "ftp", "rdp", "smtp"]),
                "vendor_product": random.choice(["Cisco ASA", "Windows Security", "Apache", "Nginx", "F5 BIG-IP"]),
                "severity": random.choice(["high", "medium", "low", "informational"]),
                "signature": f"Signature_{random.randint(1000,9999)}",
                "category": random.choice(["malware", "intrusion", "policy_violation", "data_exfiltration"]),
                "bytes_in": random.randint(1024, 1048576),
                "bytes_out": random.randint(512, 524288),
                "duration": random.randint(1, 3600),
                "raw": f"Splunk CIM test event {i} with detailed logging information",
                "tag": ["test", "automation", "siem"]
            }
            logs.append(log)
        return logs
    
    def generate_windows_event_logs(self, count: int = 50) -> List[Dict]:
        """Generate Windows Event Logs (JSON format)"""
        logs = []
        event_ids = [4624, 4625, 4648, 4672, 4688, 4697, 4698, 4719, 4720, 4726]
        
        for i in range(count):
            event_id = random.choice(event_ids)
            log = {
                "EventID": event_id,
                "Computer": f"WIN-{random.choice(['DC01', 'WS001', 'SRV02', 'LAPTOP01'])}",
                "TimeCreated": {
                    "SystemTime": (datetime.now() - timedelta(hours=random.randint(0, 48))).isoformat() + "Z"
                },
                "EventRecordID": random.randint(100000, 999999),
                "ProcessID": random.randint(1000, 9999),
                "ThreadID": random.randint(1000, 9999),
                "Channel": "Security",
                "Task": random.choice(["Logon", "Logoff", "Account Management", "Process Tracking"]),
                "Level": random.choice(["Information", "Warning", "Error"]),
                "Keywords": "Audit Success" if random.choice([True, False]) else "Audit Failure",
                "EventData": {
                    "SubjectUserSid": f"S-1-5-21-{random.randint(1000000000, 9999999999)}-{random.randint(1000000000, 9999999999)}-{random.randint(1000000000, 9999999999)}-{random.randint(1000, 9999)}",
                    "SubjectUserName": random.choice(["Administrator", "System", "User1", "ServiceAccount", "Guest"]),
                    "SubjectDomainName": random.choice(["DOMAIN", "WORKGROUP", "LOCAL"]),
                    "TargetUserName": random.choice(["admin", "user", "service", "guest", "system"]),
                    "TargetDomainName": random.choice(["CORPORATE", "LOCAL", "DOMAIN"]),
                    "LogonType": random.choice([2, 3, 4, 5, 7, 8, 9, 10, 11]),
                    "IpAddress": f"192.168.{random.randint(1,254)}.{random.randint(1,254)}",
                    "IpPort": random.choice([0, 135, 445, 3389, 5985]),
                    "ProcessName": random.choice(["C:\\Windows\\System32\\svchost.exe", "C:\\Windows\\explorer.exe", "C:\\Program Files\\App\\app.exe"]),
                    "CommandLine": random.choice(["", "svchost.exe -k netsvcs", "explorer.exe", "powershell.exe -Command Get-Process"])
                },
                "Message": f"Windows Security Event {event_id} - Test event {i}"
            }
            logs.append(log)
        return logs
    
    def generate_cisco_asa_logs(self, count: int = 50) -> List[str]:
        """Generate Cisco ASA firewall logs"""
        logs = []
        severity_levels = [1, 2, 3, 4, 5, 6, 7]
        message_ids = [106001, 106006, 106014, 106015, 106021, 302013, 302014, 302015, 302016, 305011]
        
        for i in range(count):
            severity = random.choice(severity_levels)
            msg_id = random.choice(message_ids)
            src_ip = f"192.168.{random.randint(1,254)}.{random.randint(1,254)}"
            dst_ip = f"10.0.{random.randint(1,254)}.{random.randint(1,254)}"
            src_port = random.randint(1024, 65535)
            dst_port = random.choice([80, 443, 22, 21, 25, 53, 110, 143])
            
            timestamp = datetime.now() - timedelta(hours=random.randint(0, 24))
            
            actions = ["Built", "Teardown", "Deny", "Permit"]
            action = random.choice(actions)
            
            log = f"{timestamp.strftime('%b %d %H:%M:%S')} firewall.example.com %ASA-{severity}-{msg_id}: {action} inbound TCP connection from {src_ip}:{src_port} to {dst_ip}:{dst_port}"
            logs.append(log)
        return logs
    
    def generate_palo_alto_logs(self, count: int = 50) -> List[str]:
        """Generate Palo Alto firewall logs (CSV format)"""
        logs = []
        
        for i in range(count):
            timestamp = datetime.now() - timedelta(hours=random.randint(0, 24))
            fields = [
                "TRAFFIC",  # Log type
                timestamp.strftime("%Y/%m/%d %H:%M:%S"),  # Generated time
                "PA-VM",  # Serial number
                "traffic",  # Type/Subtype
                "start",  # Config version
                timestamp.strftime("%Y/%m/%d %H:%M:%S"),  # Generate time
                f"192.168.{random.randint(1,254)}.{random.randint(1,254)}",  # Source IP
                f"10.0.{random.randint(1,254)}.{random.randint(1,254)}",  # Destination IP  
                f"192.168.{random.randint(1,254)}.{random.randint(1,254)}",  # NAT Source IP
                f"10.0.{random.randint(1,254)}.{random.randint(1,254)}",  # NAT Destination IP
                "ethernet1/1",  # Source zone
                "ethernet1/2",  # Destination zone
                "trust",  # Source zone
                "untrust",  # Destination zone
                str(random.randint(1024, 65535)),  # Source port
                str(random.choice([80, 443, 22, 21, 25, 53])),  # Destination port
                str(random.randint(1024, 65535)),  # NAT Source port  
                str(random.choice([80, 443, 22, 21, 25, 53])),  # NAT Destination port
                "tcp",  # Protocol
                random.choice(["allow", "deny", "drop"]),  # Action
                str(random.randint(1000, 99999)),  # Bytes
                str(random.randint(500, 50000)),  # Bytes sent
                str(random.randint(500, 50000)),  # Bytes received
                str(random.randint(1, 50)),  # Packets
                str(random.randint(1, 100)),  # Session duration
                "web-browsing",  # Application
                "Business",  # Category
                str(random.randint(1, 10)),  # Rule matched
                f"Rule_{random.randint(1, 100)}",  # Rule name
                "outbound"  # Direction
            ]
            
            log = ",".join(fields)
            logs.append(log)
        return logs
    
    def generate_key_value_logs(self, count: int = 50) -> List[str]:
        """Generate key-value format logs"""
        logs = []
        
        for i in range(count):
            timestamp = datetime.now() - timedelta(hours=random.randint(0, 24))
            
            fields = {
                "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                "src_ip": f"172.16.{random.randint(1,254)}.{random.randint(1,254)}",
                "dst_ip": f"10.10.{random.randint(1,254)}.{random.randint(1,254)}",
                "src_port": str(random.randint(1024, 65535)),
                "dst_port": str(random.choice([80, 443, 22, 21, 3389])),
                "protocol": random.choice(["TCP", "UDP", "ICMP"]),
                "action": random.choice(["ACCEPT", "DENY", "DROP", "REJECT"]),
                "user": random.choice(["admin", "user1", "service", "guest", ""]),
                "hostname": f"server-{random.randint(1,100)}",
                "severity": random.choice(["INFO", "WARN", "ERROR", "DEBUG"]),
                "bytes": str(random.randint(64, 65536)),
                "packets": str(random.randint(1, 1000)),
                "duration": str(random.randint(1, 3600)),
                "message": f"Key-value test event {i}",
                "rule_id": str(random.randint(1000, 9999)),
                "policy": random.choice(["ALLOW_ALL", "BLOCK_MALWARE", "RESTRICT_ACCESS"]),
                "zone": random.choice(["internal", "external", "dmz", "guest"])
            }
            
            log_parts = [f"{k}={v}" for k, v in fields.items() if v]  # Skip empty values
            log = " ".join(log_parts)
            logs.append(log)
        return logs
    
    def generate_generic_json_logs(self, count: int = 50) -> List[Dict]:
        """Generate generic JSON logs"""
        logs = []
        
        for i in range(count):
            log = {
                "timestamp": (datetime.now() - timedelta(hours=random.randint(0, 24))).isoformat(),
                "level": random.choice(["INFO", "WARN", "ERROR", "DEBUG", "TRACE"]),
                "logger": random.choice(["app.security", "app.database", "app.auth", "app.api", "app.frontend"]),
                "source_ip": f"203.0.{random.randint(1,254)}.{random.randint(1,254)}",
                "user_id": random.choice([None, str(random.randint(1000, 9999)), "anonymous"]),
                "session_id": str(uuid.uuid4()),
                "request_id": str(uuid.uuid4()),
                "method": random.choice(["GET", "POST", "PUT", "DELETE", "PATCH"]),
                "url": random.choice(["/api/login", "/api/users", "/api/data", "/admin/dashboard", "/upload"]),
                "status_code": random.choice([200, 201, 400, 401, 403, 404, 500, 502]),
                "response_time": random.randint(10, 5000),
                "user_agent": random.choice([
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "curl/7.64.1",
                    "Python-requests/2.25.1"
                ]),
                "content_length": random.randint(0, 10000),
                "referer": random.choice(["", "https://example.com", "https://google.com"]),
                "message": f"Generic JSON log entry {i} - {random.choice(['Request processed', 'Error occurred', 'User authenticated', 'Data retrieved', 'Transaction completed'])}",
                "metadata": {
                    "service": "test-service",
                    "version": "1.0.0",
                    "environment": "test"
                }
            }
            logs.append(log)
        return logs
    
    def generate_syslog_logs(self, count: int = 50) -> List[str]:
        """Generate RFC3164 Syslog format logs"""
        logs = []
        facilities = ["auth", "authpriv", "cron", "daemon", "kern", "mail", "syslog", "user"]
        severities = ["emerg", "alert", "crit", "err", "warning", "notice", "info", "debug"]
        
        for i in range(count):
            timestamp = datetime.now() - timedelta(hours=random.randint(0, 24))
            facility = random.choice(facilities)
            severity = random.choice(severities)
            hostname = f"server-{random.randint(1,50)}"
            process = random.choice(["sshd", "httpd", "mysqld", "cron", "kernel", "postfix"])
            pid = random.randint(1000, 9999)
            
            messages = [
                "Authentication successful",
                "Failed password for user",
                "Connection established",
                "Service started successfully",
                "Configuration reloaded",
                "Backup completed",
                "Disk usage warning",
                "Network interface up"
            ]
            
            message = random.choice(messages)
            
            log = f"{timestamp.strftime('%b %d %H:%M:%S')} {hostname} {process}[{pid}]: {message} - test entry {i}"
            logs.append(log)
        return logs
    
    def generate_iis_logs(self, count: int = 30) -> List[str]:
        """Generate IIS web server logs"""
        logs = []
        
        for i in range(count):
            timestamp = datetime.now() - timedelta(hours=random.randint(0, 24))
            
            fields = [
                timestamp.strftime("%Y-%m-%d %H:%M:%S"),  # Date and time
                f"192.168.{random.randint(1,254)}.{random.randint(1,254)}",  # Client IP
                random.choice(["GET", "POST", "PUT", "DELETE", "HEAD"]),  # Method
                random.choice(["/", "/login", "/api/data", "/admin", "/images/logo.png", "/css/style.css"]),  # URI stem
                str(random.choice([200, 301, 404, 403, 500, 502])),  # Status code
                "Mozilla/5.0+(Windows+NT+10.0;+Win64;+x64)",  # User agent
                f"10.0.{random.randint(1,254)}.{random.randint(1,254)}",  # Server IP
                str(random.randint(80, 8080)),  # Server port
                str(random.randint(100, 10000)),  # Bytes sent
                str(random.randint(100, 5000)),  # Bytes received
                str(random.randint(10, 5000))  # Time taken
            ]
            
            log = " ".join(fields)
            logs.append(log)
        return logs
    
    def generate_all_test_data(self) -> Dict:
        """Generate comprehensive test dataset"""
        print("🔄 Generating comprehensive SIEM parser test data...")
        
        test_data = {
            "metadata": {
                "generated_at": datetime.now().isoformat(),
                "total_samples": 0,
                "formats": []
            },
            "samples": {}
        }
        
        # Generate all log formats
        formats = [
            ("ecs_logs", self.generate_ecs_logs, 50),
            ("splunk_cim_logs", self.generate_splunk_cim_logs, 50),
            ("windows_event_logs", self.generate_windows_event_logs, 50), 
            ("cisco_asa_logs", self.generate_cisco_asa_logs, 50),
            ("palo_alto_logs", self.generate_palo_alto_logs, 50),
            ("key_value_logs", self.generate_key_value_logs, 50),
            ("generic_json_logs", self.generate_generic_json_logs, 50),
            ("syslog_logs", self.generate_syslog_logs, 50),
            ("iis_logs", self.generate_iis_logs, 30)
        ]
        
        total_samples = 0
        for format_name, generator_func, count in formats:
            print(f"  📝 Generating {count} {format_name}...")
            samples = generator_func(count)
            test_data["samples"][format_name] = samples
            test_data["metadata"]["formats"].append({
                "name": format_name,
                "count": len(samples),
                "sample_type": "json" if isinstance(samples[0], dict) else "text"
            })
            total_samples += len(samples)
        
        test_data["metadata"]["total_samples"] = total_samples
        
        print(f"✅ Generated {total_samples} test samples across {len(formats)} formats")
        return test_data

def main():
    """Generate and save comprehensive test data"""
    generator = ComprehensiveLogGenerator()
    test_data = generator.generate_all_test_data()
    
    # Save to JSON file
    output_file = "comprehensive_siem_test_data.json"
    with open(output_file, 'w') as f:
        json.dump(test_data, f, indent=2, default=str)
    
    print(f"📁 Test data saved to {output_file}")
    
    # Print summary
    print("\n📊 Test Data Summary:")
    print(f"Total Samples: {test_data['metadata']['total_samples']}")
    print("Format Breakdown:")
    for format_info in test_data['metadata']['formats']:
        print(f"  - {format_info['name']}: {format_info['count']} samples ({format_info['sample_type']})")

if __name__ == "__main__":
    main()