#!/usr/bin/env python3
"""
Comprehensive SIEM Test Data Generator
Generates 1,000,000 events across 10 tenants with 5 different log source types:
- OWA (Outlook Web Access)
- IIS (Internet Information Services)
- Proxy Logs
- Firewall Logs
- Windows Security Logs
"""

import json
import random
import time
import requests
import threading
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys
import os
from typing import Dict, List, Any

# Configuration
TOTAL_EVENTS = 1_000_000
TENANT_COUNT = 10
BATCH_SIZE = 1000
MAX_WORKERS = 10
API_BASE_URL = "http://localhost:8080"
DEV_ADMIN_TOKEN = os.getenv('DEV_ADMIN_TOKEN', 'dev-admin-token-12345')

# Tenant configuration
TENANTS = [f"tenant-{chr(65+i)}" for i in range(TENANT_COUNT)]  # tenant-A to tenant-J

# Log source types distribution
LOG_SOURCES = {
    "OWA": 0.2,      # 20% OWA logs
    "IIS": 0.2,      # 20% IIS logs
    "Proxy": 0.2,    # 20% Proxy logs
    "Firewall": 0.2, # 20% Firewall logs
    "Windows": 0.2   # 20% Windows Security logs
}

# Realistic data pools
USERNAMES = [
    "admin", "john.doe", "jane.smith", "bob.wilson", "alice.brown",
    "mike.davis", "sarah.jones", "tom.miller", "lisa.garcia", "david.martinez",
    "emily.rodriguez", "chris.lopez", "amanda.lee", "kevin.white", "michelle.hall",
    "service_account", "backup_user", "monitoring", "svc_web", "svc_db"
]

HOSTNAMES = [
    "DC-01", "DC-02", "WEB-01", "WEB-02", "DB-01", "DB-02",
    "FW-01", "PROXY-01", "MAIL-01", "FILE-01", "APP-01", "APP-02",
    "WIN-CLIENT-01", "WIN-CLIENT-02", "LINUX-01", "LINUX-02"
]

IP_RANGES = {
    "internal": ["192.168.1.", "192.168.2.", "10.0.0.", "10.0.1.", "172.16.0."],
    "external": ["203.0.113.", "198.51.100.", "8.8.8.", "1.1.1.", "208.67.222."]
}

URLS = [
    "/api/v1/users", "/api/v1/auth", "/api/v1/data", "/login", "/logout",
    "/admin/dashboard", "/reports/monthly", "/files/download", "/mail/inbox",
    "/owa/auth.owa", "/owa/logon.aspx", "/exchange/", "/autodiscover/"
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0)",
    "curl/7.68.0", "Python-requests/2.25.1"
]

class EventGenerator:
    def __init__(self):
        self.start_time = datetime.now() - timedelta(days=7)
        self.end_time = datetime.now()
        self.events_generated = 0
        self.events_ingested = 0
        self.errors = []
        self.lock = threading.Lock()
    
    def generate_timestamp(self) -> int:
        """Generate random timestamp within the last 7 days"""
        time_diff = self.end_time - self.start_time
        random_seconds = random.randint(0, int(time_diff.total_seconds()))
        event_time = self.start_time + timedelta(seconds=random_seconds)
        return int(event_time.timestamp())
    
    def generate_ip(self, ip_type: str = "internal") -> str:
        """Generate realistic IP address"""
        prefix = random.choice(IP_RANGES[ip_type])
        suffix = random.randint(1, 254)
        return f"{prefix}{suffix}"
    
    def generate_owa_event(self, tenant_id: str) -> Dict[str, Any]:
        """Generate OWA (Outlook Web Access) log event"""
        actions = ["login", "logout", "send_email", "read_email", "delete_email", "move_email"]
        action = random.choice(actions)
        source_ip = self.generate_ip("external")
        user_email = f"{random.choice(USERNAMES)}@company.com"
        timestamp = self.generate_timestamp()
        
        # Create structured raw log
        raw_log = json.dumps({
            "tenant_id": tenant_id,
            "timestamp": timestamp,
            "log_source": "OWA",
            "user_email": user_email,
            "action": action,
            "mailbox_name": random.choice(USERNAMES),
            "user_agent": random.choice(USER_AGENTS),
            "session_id": f"owa-{random.randint(100000, 999999)}",
            "server_name": "MAIL-01",
            "status_code": random.choice([200, 401, 403, 500])
        })
        
        return {
            "source_ip": source_ip,
            "raw_log": raw_log
        }
    
    def generate_iis_event(self, tenant_id: str) -> Dict[str, Any]:
        """Generate IIS web server log event"""
        methods = ["GET", "POST", "PUT", "DELETE"]
        status_codes = [200, 201, 301, 302, 400, 401, 403, 404, 500, 502]
        source_ip = self.generate_ip("external")
        method = random.choice(methods)
        uri = random.choice(URLS)
        status = random.choice(status_codes)
        timestamp = self.generate_timestamp()
        
        raw_log = json.dumps({
            "tenant_id": tenant_id,
            "timestamp": timestamp,
            "log_source": "IIS",
            "remote_addr": source_ip,
            "request_uri": uri,
            "http_method": method,
            "status_code": status,
            "user_agent": random.choice(USER_AGENTS),
            "referer": f"https://company.com{random.choice(URLS)}",
            "bytes_sent": random.randint(100, 50000),
            "time_taken": random.randint(10, 5000),
            "server_name": random.choice(["WEB-01", "WEB-02"])
        })
        
        return {
            "source_ip": source_ip,
            "raw_log": raw_log
        }
    
    def generate_proxy_event(self, tenant_id: str) -> Dict[str, Any]:
        """Generate Proxy server log event"""
        actions = ["allow", "block", "redirect"]
        categories = ["business", "social", "malware", "phishing", "adult", "gambling"]
        source_ip = self.generate_ip("internal")
        action = random.choice(actions)
        category = random.choice(categories)
        timestamp = self.generate_timestamp()
        
        raw_log = json.dumps({
            "tenant_id": tenant_id,
            "event_timestamp": timestamp,
            "log_source_id": "Proxy",
            "client_ip": source_ip,
            "dest_ip": self.generate_ip("external"),
            "url": f"https://{random.choice(['google.com', 'facebook.com', 'malicious-site.com', 'company.com'])}{random.choice(URLS)}",
            "http_method": random.choice(["GET", "POST"]),
            "status_code": random.choice([200, 403, 404, 502]),
            "bytes_in": random.randint(100, 10000),
            "bytes_out": random.randint(500, 100000),
            "category": category,
            "action": action,
            "user_name": random.choice(USERNAMES),
            "proxy_server": "PROXY-01",
            "message": f"Proxy {action} {category} request",
            "level": "info",
            "source": "proxy-server",
            "fields": {"service": "proxy", "protocol": "http"}
        })
        
        return {
            "source_ip": source_ip,
            "raw_log": raw_log
        }
    
    def generate_firewall_event(self, tenant_id: str) -> Dict[str, Any]:
        """Generate Firewall log event"""
        protocols = ["tcp", "udp", "icmp"]
        actions = ["allow", "deny", "drop"]
        source_ip = self.generate_ip("internal")
        action = random.choice(actions)
        protocol = random.choice(protocols)
        timestamp = self.generate_timestamp()
        
        raw_log = json.dumps({
            "tenant_id": tenant_id,
            "event_timestamp": timestamp,
            "log_source_id": "Firewall",
            "srcip": source_ip,
            "dstip": self.generate_ip("external"),
            "srcport": random.randint(1024, 65535),
            "dstport": random.choice([80, 443, 22, 23, 53, 25, 110, 143]),
            "protocol": protocol,
            "action": action,
            "rule_name": f"RULE-{random.randint(1, 100)}",
            "interface_in": "eth0",
            "interface_out": "eth1",
            "devname": "FW-01",
            "bytes": random.randint(64, 1500),
            "message": f"Firewall {action} {protocol} connection",
            "level": "info",
            "source": "firewall",
            "fields": {"service": "firewall", "device_type": "network"}
        })
        
        return {
            "source_ip": source_ip,
            "raw_log": raw_log
        }
    
    def generate_windows_event(self, tenant_id: str) -> Dict[str, Any]:
        """Generate Windows Security log event"""
        event_ids = ["4624", "4625", "4648", "4672", "4720", "4726"]
        logon_types = ["2", "3", "4", "5", "7", "8", "9", "10"]
        source_ip = self.generate_ip("internal")
        event_id = random.choice(event_ids)
        username = random.choice(USERNAMES)
        timestamp = self.generate_timestamp()
        
        raw_log = json.dumps({
            "tenant_id": tenant_id,
            "event_timestamp": timestamp,
            "log_source_id": "Windows",
            "EventID": event_id,
            "ComputerName": f"{random.choice(HOSTNAMES)}.corp.local",
            "SubjectUserName": username,
            "TargetUserName": random.choice(USERNAMES),
            "IpAddress": source_ip,
            "LogonType": random.choice(logon_types),
            "AuthenticationPackageName": random.choice(["NTLM", "Kerberos", "Negotiate"]),
            "ProcessId": random.randint(1000, 9999),
            "ProcessName": random.choice(["winlogon.exe", "lsass.exe", "explorer.exe", "cmd.exe"]),
            "message": f"Windows Security Event {event_id} for {username}",
            "level": "info",
            "source": "windows-security",
            "fields": {"service": "windows", "event_type": "security"}
        })
        
        return {
            "source_ip": source_ip,
            "raw_log": raw_log
        }
    
    def generate_event(self, tenant_id: str) -> Dict[str, Any]:
        """Generate a random event based on log source distribution"""
        rand = random.random()
        cumulative = 0
        
        for source, probability in LOG_SOURCES.items():
            cumulative += probability
            if rand <= cumulative:
                if source == "OWA":
                    return self.generate_owa_event(tenant_id)
                elif source == "IIS":
                    return self.generate_iis_event(tenant_id)
                elif source == "Proxy":
                    return self.generate_proxy_event(tenant_id)
                elif source == "Firewall":
                    return self.generate_firewall_event(tenant_id)
                elif source == "Windows":
                    return self.generate_windows_event(tenant_id)
        
        # Fallback to Windows event
        return self.generate_windows_event(tenant_id)
    
    def generate_batch(self, batch_size: int) -> List[Dict[str, Any]]:
        """Generate a batch of events"""
        events = []
        for _ in range(batch_size):
            tenant_id = random.choice(TENANTS)
            event = self.generate_event(tenant_id)
            events.append(event)
            
            with self.lock:
                self.events_generated += 1
        
        return events
    
    def ingest_batch(self, events: List[Dict[str, Any]]) -> bool:
        """Ingest a batch of events via API"""
        try:
            headers = {
                "Authorization": f"Bearer {DEV_ADMIN_TOKEN}",
                "Content-Type": "application/json"
            }
            
            payload = {"events": events}
            
            response = requests.post(
                f"{API_BASE_URL}/api/v1/events/ingest",
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 202:
                with self.lock:
                    self.events_ingested += len(events)
                return True
            else:
                error_msg = f"API Error: {response.status_code} - {response.text}"
                with self.lock:
                    self.errors.append(error_msg)
                return False
                
        except Exception as e:
            error_msg = f"Exception during ingestion: {str(e)}"
            with self.lock:
                self.errors.append(error_msg)
            return False
    
    def run_test(self):
        """Run the comprehensive test"""
        print(f"Starting comprehensive SIEM test...")
        print(f"Target: {TOTAL_EVENTS:,} events across {TENANT_COUNT} tenants")
        print(f"Batch size: {BATCH_SIZE}, Workers: {MAX_WORKERS}")
        print(f"API URL: {API_BASE_URL}")
        print("-" * 60)
        
        start_time = time.time()
        batches_needed = TOTAL_EVENTS // BATCH_SIZE
        
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # Submit all batch generation and ingestion tasks
            futures = []
            
            for batch_num in range(batches_needed):
                # Generate batch
                events = self.generate_batch(BATCH_SIZE)
                
                # Submit ingestion task
                future = executor.submit(self.ingest_batch, events)
                futures.append(future)
                
                # Progress reporting
                if (batch_num + 1) % 10 == 0:
                    elapsed = time.time() - start_time
                    rate = self.events_generated / elapsed if elapsed > 0 else 0
                    print(f"Generated: {self.events_generated:,} events, Rate: {rate:.0f} events/sec")
            
            # Wait for all ingestion tasks to complete
            successful_batches = 0
            for future in as_completed(futures):
                if future.result():
                    successful_batches += 1
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Generate test report
        self.generate_report(duration, successful_batches, batches_needed)
    
    def generate_report(self, duration: float, successful_batches: int, total_batches: int):
        """Generate comprehensive test report"""
        report = {
            "test_summary": {
                "total_events_generated": self.events_generated,
                "total_events_ingested": self.events_ingested,
                "successful_batches": successful_batches,
                "total_batches": total_batches,
                "success_rate": (successful_batches / total_batches) * 100 if total_batches > 0 else 0,
                "duration_seconds": duration,
                "events_per_second": self.events_generated / duration if duration > 0 else 0,
                "ingestion_rate": self.events_ingested / duration if duration > 0 else 0
            },
            "configuration": {
                "total_events": TOTAL_EVENTS,
                "tenant_count": TENANT_COUNT,
                "batch_size": BATCH_SIZE,
                "max_workers": MAX_WORKERS,
                "api_base_url": API_BASE_URL,
                "log_sources": LOG_SOURCES
            },
            "errors": self.errors[:10],  # First 10 errors
            "total_errors": len(self.errors)
        }
        
        # Save report
        with open("comprehensive_test_report.json", "w") as f:
            json.dump(report, f, indent=2)
        
        # Print summary
        print("\n" + "=" * 60)
        print("COMPREHENSIVE TEST REPORT")
        print("=" * 60)
        print(f"Events Generated: {self.events_generated:,}")
        print(f"Events Ingested: {self.events_ingested:,}")
        print(f"Success Rate: {report['test_summary']['success_rate']:.1f}%")
        print(f"Duration: {duration:.1f} seconds")
        print(f"Generation Rate: {report['test_summary']['events_per_second']:.0f} events/sec")
        print(f"Ingestion Rate: {report['test_summary']['ingestion_rate']:.0f} events/sec")
        print(f"Errors: {len(self.errors)}")
        
        if self.errors:
            print("\nFirst few errors:")
            for error in self.errors[:3]:
                print(f"  - {error}")
        
        print(f"\nDetailed report saved to: comprehensive_test_report.json")

def main():
    """Main function"""
    if len(sys.argv) > 1:
        global TOTAL_EVENTS
        TOTAL_EVENTS = int(sys.argv[1])
    
    generator = EventGenerator()
    generator.run_test()

if __name__ == "__main__":
    main()