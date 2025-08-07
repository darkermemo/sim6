#!/usr/bin/env python3
"""
SIEM System Log Forwarder
Forwards ClickHouse, Rust, system, and error logs to the SIEM as events
"""

import os
import sys
import json
import time
import subprocess
import threading
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
import logging
import requests

class SIEMLogForwarder:
    def __init__(self, clickhouse_url="http://localhost:8123", 
                 siem_ingest_url="http://localhost:3000/api/v1/events"):
        self.clickhouse_url = clickhouse_url
        self.siem_ingest_url = siem_ingest_url
        self.tenant_id = "siem-system"
        self.setup_logging()
        
    def setup_logging(self):
        """Setup logging to capture our own activities"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        self.logger = logging.getLogger('SIEMLogForwarder')
        
    def send_to_siem(self, log_entry):
        """Send a log entry to the SIEM ingestion endpoint"""
        try:
            event = {
                "tenant_id": self.tenant_id,
                "source_type": log_entry.get("source", "system"),
                "message": log_entry.get("message", ""),
                "timestamp": int(time.time()),
                "raw_event": json.dumps(log_entry),
                "event_id": f"siem-log-{int(time.time() * 1000000)}",
                "severity": log_entry.get("level", "info").lower(),
                "log_source": log_entry.get("component", "unknown"),
                "hostname": os.uname().nodename,
                "process_id": os.getpid()
            }
            
            # Try to send via HTTP to ingestion endpoint
            response = requests.post(self.siem_ingest_url, json=event, timeout=5)
            if response.status_code == 200:
                print(f"✅ Sent {log_entry['source']} log to SIEM")
            else:
                # Fallback: Direct ClickHouse insert
                self.direct_clickhouse_insert(event)
                
        except Exception as e:
            # Last resort: Direct ClickHouse insert
            try:
                self.direct_clickhouse_insert(event)
            except Exception as e2:
                print(f"❌ Failed to send log to SIEM: {e2}")
    
    def direct_clickhouse_insert(self, event):
        """Direct insert to ClickHouse if SIEM endpoint is down"""
        try:
            sql = f"""
            INSERT INTO dev.events (event_id, tenant_id, source_type, raw_event, message, source_ip, event_timestamp)
            VALUES ('{event['event_id']}', '{event['tenant_id']}', '{event['source_type']}', 
                    '{json.dumps(event).replace("'", "''")}', '{event['message'].replace("'", "''")}', 
                    '127.0.0.1', {event['timestamp']})
            """
            result = subprocess.run([
                'curl', '-s', self.clickhouse_url, '--data', sql
            ], capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0:
                print(f"📥 Direct ClickHouse insert: {event['source_type']}")
            else:
                print(f"❌ ClickHouse insert failed: {result.stderr}")
                
        except Exception as e:
            print(f"❌ Direct ClickHouse insert error: {e}")
    
    def monitor_clickhouse_logs(self):
        """Monitor ClickHouse logs"""
        clickhouse_log_paths = [
            "/var/log/clickhouse-server/clickhouse-server.log",
            "/opt/homebrew/var/log/clickhouse-server/clickhouse-server.log",
            "/usr/local/var/log/clickhouse-server/clickhouse-server.log"
        ]
        
        for log_path in clickhouse_log_paths:
            if os.path.exists(log_path):
                threading.Thread(target=self.tail_file, 
                               args=(log_path, "clickhouse"), daemon=True).start()
                print(f"🔍 Monitoring ClickHouse logs: {log_path}")
                break
    
    def monitor_rust_logs(self):
        """Monitor Rust application logs"""
        rust_log_paths = [
            "siem_unified_pipeline.log",
            "target/debug/siem_unified_pipeline.log",
            "/tmp/siem_unified_pipeline.log"
        ]
        
        for log_path in rust_log_paths:
            if os.path.exists(log_path):
                threading.Thread(target=self.tail_file, 
                               args=(log_path, "rust-siem"), daemon=True).start()
                print(f"🦀 Monitoring Rust logs: {log_path}")
    
    def monitor_system_logs(self):
        """Monitor system logs"""
        if sys.platform.startswith('darwin'):  # macOS
            threading.Thread(target=self.monitor_macos_logs, daemon=True).start()
        elif sys.platform.startswith('linux'):
            threading.Thread(target=self.tail_file, 
                           args=("/var/log/syslog", "system"), daemon=True).start()
    
    def monitor_macos_logs(self):
        """Monitor macOS logs using log command"""
        try:
            process = subprocess.Popen([
                'log', 'stream', '--predicate', 
                'subsystem CONTAINS "clickhouse" OR subsystem CONTAINS "rust" OR eventMessage CONTAINS "siem"',
                '--style', 'json'
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            
            print("🍎 Monitoring macOS system logs for SIEM-related activity")
            
            for line in iter(process.stdout.readline, ''):
                if line.strip():
                    try:
                        log_data = json.loads(line.strip())
                        self.send_to_siem({
                            "source": "macos-system",
                            "component": log_data.get("subsystem", "unknown"),
                            "message": log_data.get("eventMessage", ""),
                            "level": "info",
                            "timestamp": log_data.get("timestamp", datetime.now().isoformat()),
                            "process": log_data.get("process", "unknown")
                        })
                    except json.JSONDecodeError:
                        pass
                        
        except Exception as e:
            print(f"❌ macOS log monitoring error: {e}")
    
    def tail_file(self, filepath, source):
        """Tail a log file and send new lines to SIEM"""
        try:
            process = subprocess.Popen(['tail', '-f', filepath], 
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            
            for line in iter(process.stdout.readline, ''):
                if line.strip():
                    level = "error" if any(word in line.lower() for word in ["error", "exception", "failed"]) else "info"
                    
                    self.send_to_siem({
                        "source": source,
                        "component": source,
                        "message": line.strip(),
                        "level": level,
                        "timestamp": datetime.now().isoformat(),
                        "file": filepath
                    })
                    
        except Exception as e:
            print(f"❌ Error tailing {filepath}: {e}")
    
    def generate_test_logs(self):
        """Generate test logs to verify the system is working"""
        test_logs = [
            {"source": "siem-test", "message": "🧪 SIEM Log Forwarder Started", "level": "info"},
            {"source": "siem-test", "message": "📊 Monitoring system logs for SIEM ingestion", "level": "info"},
            {"source": "clickhouse-test", "message": "ClickHouse connection test", "level": "info"},
            {"source": "rust-test", "message": "Rust SIEM pipeline health check", "level": "info"},
            {"source": "system-test", "message": "System monitoring active", "level": "info"}
        ]
        
        for log_entry in test_logs:
            log_entry["component"] = "test-generator"
            self.send_to_siem(log_entry)
            time.sleep(1)
    
    def start_monitoring(self):
        """Start all monitoring threads"""
        print("🚀 Starting SIEM System Log Forwarder...")
        
        # Generate test logs first
        self.generate_test_logs()
        
        # Start monitoring various log sources
        self.monitor_clickhouse_logs()
        self.monitor_rust_logs()
        self.monitor_system_logs()
        
        # Monitor our own Python server logs
        threading.Thread(target=self.monitor_python_logs, daemon=True).start()
        
        print("✅ All log monitoring threads started")
        print("📊 Logs will be forwarded to SIEM with tenant_id='siem-system'")
        print("🔍 Check your SIEM events page to see system logs appearing!")
        
        # Keep the main thread alive
        try:
            while True:
                time.sleep(60)
                # Send a heartbeat log every minute
                self.send_to_siem({
                    "source": "siem-heartbeat",
                    "component": "log-forwarder",
                    "message": f"📊 Log forwarder heartbeat - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
                    "level": "info"
                })
        except KeyboardInterrupt:
            print("\n🛑 Log forwarder stopped")
    
    def monitor_python_logs(self):
        """Monitor Python server logs"""
        # Capture stdout/stderr from our Python processes
        threading.Thread(target=self.capture_python_output, daemon=True).start()
    
    def capture_python_output(self):
        """Capture Python output for SIEM"""
        # This would capture output from real_clickhouse_server.py
        # For now, we'll just send periodic status updates
        while True:
            try:
                # Check if our Python server is running
                result = subprocess.run(['pgrep', '-f', 'real_clickhouse_server.py'], 
                                      capture_output=True, text=True)
                
                if result.returncode == 0:
                    pids = result.stdout.strip().split('\n')
                    self.send_to_siem({
                        "source": "python-monitor",
                        "component": "real_clickhouse_server",
                        "message": f"Python SIEM server running (PIDs: {', '.join(pids)})",
                        "level": "info"
                    })
                else:
                    self.send_to_siem({
                        "source": "python-monitor",
                        "component": "real_clickhouse_server",
                        "message": "⚠️ Python SIEM server not running",
                        "level": "warning"
                    })
                    
                time.sleep(300)  # Check every 5 minutes
                
            except Exception as e:
                self.send_to_siem({
                    "source": "python-monitor",
                    "component": "monitor-error",
                    "message": f"❌ Python monitoring error: {e}",
                    "level": "error"
                })
                time.sleep(60)

if __name__ == "__main__":
    forwarder = SIEMLogForwarder()
    forwarder.start_monitoring()