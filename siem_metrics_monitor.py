#!/usr/bin/env python3
"""
SIEM Consumer Metrics Monitor
Provides real-time monitoring of SIEM consumer performance with context
"""

import requests
import time
import json
from datetime import datetime
import sys

class SIEMMetricsMonitor:
    def __init__(self, consumer_url="http://localhost:9090/metrics", api_url="http://localhost:8080/api/v1/status"):
        self.consumer_url = consumer_url
        self.api_url = api_url
        self.previous_metrics = None
        
    def get_metrics(self):
        """Get current metrics from consumer"""
        try:
            response = requests.get(self.consumer_url, timeout=5)
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            print(f"❌ Error fetching consumer metrics: {e}")
        return None
    
    def get_api_status(self):
        """Get API status"""
        try:
            response = requests.get(self.api_url, timeout=5)
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            print(f"❌ Error fetching API status: {e}")
        return None
    
    def calculate_rates(self, current, previous):
        """Calculate processing rates"""
        if not previous:
            return {}
            
        processed_delta = current['processed'] - previous['processed']
        parsed_delta = current['parsed'] - previous['parsed']
        
        return {
            'processed_rate': processed_delta,
            'parsed_rate': parsed_delta,
            'error_rate': processed_delta - parsed_delta if processed_delta > 0 else 0
        }
    
    def get_health_status(self, metrics):
        """Determine health status based on metrics"""
        if not metrics or metrics['processed'] == 0:
            return "🟡 IDLE", "No events processed"
            
        success_rate = (metrics['parsed'] / metrics['processed']) * 100 if metrics['processed'] > 0 else 0
        
        if success_rate >= 95:
            return "🟢 HEALTHY", f"Success rate: {success_rate:.1f}%"
        elif success_rate >= 80:
            return "🟡 WARNING", f"Success rate: {success_rate:.1f}%"
        else:
            return "🔴 CRITICAL", f"Success rate: {success_rate:.1f}%"
    
    def format_number(self, num):
        """Format large numbers with commas"""
        return f"{num:,}"
    
    def display_metrics(self, metrics, api_status, rates=None):
        """Display formatted metrics"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        print(f"\n📊 SIEM Metrics Monitor - {timestamp}")
        print("=" * 60)
        
        # System Status
        if api_status:
            print(f"🏥 API Status: {api_status.get('status', 'unknown').upper()}")
            services = api_status.get('services', {})
            for service, status in services.items():
                emoji = "✅" if status == "healthy" else "❌"
                print(f"   {emoji} {service.capitalize()}: {status}")
        
        if not metrics:
            print("❌ Consumer metrics unavailable")
            return
            
        # Health Status
        health_status, health_msg = self.get_health_status(metrics)
        print(f"\n{health_status} Consumer Health: {health_msg}")
        
        # Core Metrics
        print(f"\n📈 Core Metrics:")
        print(f"   📥 Processed: {self.format_number(metrics['processed'])}")
        print(f"   ✅ Parsed:    {self.format_number(metrics['parsed'])}")
        print(f"   📋 Queued:    {self.format_number(metrics['queued'])}")
        
        # Calculated Metrics
        if metrics['processed'] > 0:
            success_rate = (metrics['parsed'] / metrics['processed']) * 100
            error_count = metrics['processed'] - metrics['parsed']
            error_rate = (error_count / metrics['processed']) * 100
            
            print(f"\n📊 Calculated Metrics:")
            print(f"   ✅ Success Rate: {success_rate:.2f}%")
            print(f"   ❌ Error Count:  {self.format_number(error_count)}")
            print(f"   ❌ Error Rate:   {error_rate:.2f}%")
        
        # Rate Information (if available)
        if rates:
            print(f"\n⚡ Recent Activity (since last check):")
            print(f"   📥 Processed: +{rates['processed_rate']}")
            print(f"   ✅ Parsed:    +{rates['parsed_rate']}")
            if rates['error_rate'] > 0:
                print(f"   ❌ Errors:    +{rates['error_rate']}")
        
        # Batching Information
        if metrics['queued'] > 0:
            print(f"\n📦 Batching Info:")
            print(f"   🔄 Events in current batch: {metrics['queued']}")
            print(f"   ⏱️  Batch will flush when: 1000 events OR 5-second timeout")
    
    def monitor_continuous(self, interval=10):
        """Continuous monitoring mode"""
        print("🚀 Starting SIEM Metrics Monitor")
        print(f"📡 Consumer: {self.consumer_url}")
        print(f"📡 API: {self.api_url}")
        print(f"⏱️  Update interval: {interval} seconds")
        print("\nPress Ctrl+C to stop...")
        
        try:
            while True:
                # Clear screen (optional)
                # print("\033[2J\033[H", end="")
                
                current_metrics = self.get_metrics()
                api_status = self.get_api_status()
                
                rates = None
                if self.previous_metrics and current_metrics:
                    rates = self.calculate_rates(current_metrics, self.previous_metrics)
                
                self.display_metrics(current_metrics, api_status, rates)
                
                self.previous_metrics = current_metrics
                time.sleep(interval)
                
        except KeyboardInterrupt:
            print("\n\n👋 Monitoring stopped by user")
    
    def monitor_once(self):
        """Single metrics check"""
        current_metrics = self.get_metrics()
        api_status = self.get_api_status()
        self.display_metrics(current_metrics, api_status)

def main():
    monitor = SIEMMetricsMonitor()
    
    if len(sys.argv) > 1 and sys.argv[1] == "--continuous":
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        monitor.monitor_continuous(interval)
    else:
        monitor.monitor_once()

if __name__ == '__main__':
    main()