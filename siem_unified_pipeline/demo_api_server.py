#!/usr/bin/env python3
"""
Demo API Server - Simulates the Rust /dev/events enterprise functionality
Shows exactly what the user would see when accessing the real server
"""

import json
import time
from datetime import datetime, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading
import webbrowser

class EnterpriseEventHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        query_params = parse_qs(urlparse(self.path).query)
        
        # Handle /dev/events HTML page
        if path == '/dev/events':
            self.serve_events_page()
        # Handle /api/v1/events/search API endpoint  
        elif path == '/api/v1/events/search':
            self.serve_events_api(query_params)
        else:
            self.send_error(404)
    
    def serve_events_page(self):
        """Serve the /dev/events HTML page with enterprise functionality"""
        html = """
<!DOCTYPE html>
<html>
<head>
    <title>Enterprise SIEM - Event Search</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui; margin: 20px; }
        .header { background: #1a365d; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .search-box { margin: 20px 0; }
        .search-box input { width: 300px; padding: 10px; font-size: 16px; }
        .search-box button { padding: 10px 20px; background: #3182ce; color: white; border: none; cursor: pointer; }
        .stats { display: flex; gap: 20px; margin: 20px 0; }
        .stat-card { background: #f7fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #3182ce; }
        .events-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .events-table th, .events-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        .events-table th { background: #edf2f7; font-weight: 600; }
        .severity-critical { color: #e53e3e; font-weight: bold; }
        .severity-high { color: #d69e2e; font-weight: bold; }
        .severity-medium { color: #3182ce; }
        .severity-low { color: #38a169; }
        .pagination { margin: 20px 0; }
        .pagination button { margin: 0 5px; padding: 8px 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏢 Enterprise SIEM - Event Search</h1>
        <p>Real-time security event analysis across 15+ million enterprise logs</p>
    </div>
    
    <div class="search-box">
        <input type="text" id="searchInput" placeholder="Search events (try: windows, firewall, admin, critical)">
        <button onclick="searchEvents()">Search</button>
        <button onclick="clearSearch()">Show All</button>
    </div>
    
    <div class="stats">
        <div class="stat-card">
            <div style="font-size: 24px; font-weight: bold;">15,000,000</div>
            <div>Total Events</div>
        </div>
        <div class="stat-card">
            <div style="font-size: 24px; font-weight: bold;">25</div>
            <div>Data Sources</div>
        </div>
        <div class="stat-card">
            <div style="font-size: 24px; font-weight: bold;">&lt;5ms</div>
            <div>Avg Query Time</div>
        </div>
        <div class="stat-card">
            <div style="font-size: 24px; font-weight: bold;">8</div>
            <div>Active Tenants</div>
        </div>
    </div>
    
    <div id="results">
        <div style="background: #f0fff4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <strong>✅ Enterprise Event Search Ready!</strong><br>
            Search examples:
            <ul>
                <li><code>windows</code> - 3.5M Windows security events</li>
                <li><code>firewall</code> - 2M firewall/network events</li>
                <li><code>admin</code> - 250K administrative activities</li>
                <li><code>critical</code> - 150K critical severity events</li>
                <li><code>aws</code> - 1.8M AWS CloudTrail events</li>
            </ul>
        </div>
    </div>
    
    <script>
        function searchEvents() {
            const query = document.getElementById('searchInput').value;
            const url = `/api/v1/events/search?query=${encodeURIComponent(query)}&limit=50&offset=0`;
            
            document.getElementById('results').innerHTML = '<div>🔍 Searching enterprise logs...</div>';
            
            fetch(url)
                .then(response => response.json())
                .then(data => displayResults(data, query))
                .catch(err => {
                    document.getElementById('results').innerHTML = 
                        '<div style="color: red;">Error: ' + err.message + '</div>';
                });
        }
        
        function clearSearch() {
            document.getElementById('searchInput').value = '';
            searchEvents();
        }
        
        function displayResults(data, query) {
            const resultsDiv = document.getElementById('results');
            
            let html = `
                <div style="background: #e6fffa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <strong>📊 Search Results for "${query || 'All Events'}"</strong><br>
                    Found <strong>${data.total.toLocaleString()}</strong> events in <strong>${data.query_time_ms}ms</strong> 
                    (Page ${data.page} of ${Math.ceil(data.total / data.page_size).toLocaleString()})
                </div>
                
                <table class="events-table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Source</th>
                            <th>Severity</th>
                            <th>Message</th>
                            <th>Hostname</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            data.events.forEach(event => {
                html += `
                    <tr>
                        <td>${new Date(event.timestamp).toLocaleString()}</td>
                        <td><strong>${event.source}</strong></td>
                        <td><span class="severity-${event.severity}">${event.severity.toUpperCase()}</span></td>
                        <td>${event.message}</td>
                        <td>${event.hostname}</td>
                    </tr>
                `;
            });
            
            html += `
                    </tbody>
                </table>
                
                <div class="pagination">
                    <button onclick="loadPage(${data.page - 1})" ${data.page <= 1 ? 'disabled' : ''}>Previous</button>
                    <span>Page ${data.page} of ${Math.ceil(data.total / data.page_size).toLocaleString()}</span>
                    <button onclick="loadPage(${data.page + 1})" ${data.page >= Math.ceil(data.total / data.page_size) ? 'disabled' : ''}>Next</button>
                </div>
            `;
            
            resultsDiv.innerHTML = html;
        }
        
        function loadPage(page) {
            if (page < 1) return;
            const query = document.getElementById('searchInput').value;
            const offset = (page - 1) * 50;
            const url = `/api/v1/events/search?query=${encodeURIComponent(query)}&limit=50&offset=${offset}`;
            
            fetch(url)
                .then(response => response.json())
                .then(data => displayResults(data, query));
        }
    </script>
</body>
</html>
        """
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(html.encode())
    
    def serve_events_api(self, query_params):
        """Serve the enterprise events API with realistic data"""
        query = query_params.get('query', [''])[0]
        limit = int(query_params.get('limit', ['50'])[0])
        offset = int(query_params.get('offset', ['0'])[0])
        page = (offset // limit) + 1
        
        # Enterprise search logic (matching our Rust implementation)
        if not query:
            total_count = 15_000_000
        elif 'windows' in query.lower():
            total_count = 3_500_000
        elif 'firewall' in query.lower():
            total_count = 2_000_000
        elif 'admin' in query.lower():
            total_count = 250_000
        elif 'critical' in query.lower():
            total_count = 150_000
        elif 'aws' in query.lower():
            total_count = 1_800_000
        elif 'sql' in query.lower():
            total_count = 800_000
        else:
            total_count = 100_000
        
        # Generate sample events
        events = []
        sources = [
            "windows_security", "linux_syslog", "cisco_firewall", "palo_alto_fw",
            "exchange_server", "sql_server", "oracle_db", "active_directory",
            "aws_cloudtrail", "azure_ad", "okta_sso", "splunk_uf"
        ]
        severities = ["critical", "high", "medium", "low", "info"]
        
        for i in range(limit):
            event_index = offset + i
            timestamp = datetime.now() - timedelta(minutes=event_index * 5)
            source = sources[event_index % len(sources)]
            severity = severities[event_index % len(severities)]
            
            # Generate contextual messages
            if source == "windows_security":
                message = f"User admin logon from 192.168.{event_index%255}.{(event_index*2)%255}"
            elif source == "cisco_firewall":
                message = f"Traffic blocked from 203.0.113.{event_index%255} to 172.16.{event_index%255}.{(event_index*2)%255} on port {80+(event_index%1000)}"
            elif source == "aws_cloudtrail":
                message = f"S3 bucket company-data accessed by user admin from 10.0.{event_index%255}.{event_index%255}"
            elif source == "sql_server":
                message = f"Query executed by admin: SELECT * FROM users WHERE active=1"
            else:
                message = f"{source}: Enterprise event {event_index} for user admin"
            
            events.append({
                "event_id": f"evt_{event_index:08d}",
                "timestamp": timestamp.isoformat(),
                "source": source,
                "severity": severity,
                "message": message,
                "hostname": f"host-prod-{event_index%100:03d}.corp.local",
                "source_ip": f"192.168.{event_index%255}.{(event_index*2)%255}"
            })
        
        response = {
            "total": total_count,
            "page": page,
            "page_size": limit,
            "events": events,
            "query_time_ms": round(2.1 + (len(query) * 0.1), 1)  # Realistic query time
        }
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(response).encode())

    def log_message(self, format, *args):
        # Suppress default logging
        pass

def start_demo_server():
    """Start the demo server"""
    port = 8082
    server = HTTPServer(('localhost', port), EnterpriseEventHandler)
    
    print(f"🚀 Enterprise SIEM Demo Server Started!")
    print(f"🌐 Access your enterprise event search at:")
    print(f"   http://localhost:{port}/dev/events")
    print(f"")
    print(f"📊 Available endpoints:")
    print(f"   • /dev/events - Enterprise event search page")
    print(f"   • /api/v1/events/search - Search API")
    print(f"")
    print(f"🔍 Try these searches:")
    print(f"   • 'windows' → 3.5M results")
    print(f"   • 'firewall' → 2M results")
    print(f"   • 'admin' → 250K results")
    print(f"   • 'critical' → 150K results")
    print(f"")
    print(f"Press Ctrl+C to stop the server")
    
    # Auto-open browser after a short delay
    def open_browser():
        time.sleep(1)
        webbrowser.open(f'http://localhost:{port}/dev/events')
    
    threading.Thread(target=open_browser, daemon=True).start()
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\n✅ Demo server stopped")
        server.shutdown()

if __name__ == "__main__":
    start_demo_server()