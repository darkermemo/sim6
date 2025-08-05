use crate::connection_manager::{ConnectionManager, LogSource};
use std::sync::Arc;
use axum::response::Html;

pub fn generate_dashboard_html(
    connection_manager: Arc<ConnectionManager>,
    processed: u64,
    parsed: u64,
    _queued: u64,
    _errors: u64,
) -> Html<String> {
    let stats = connection_manager.get_stats();
    let sources = connection_manager.get_sources();
    
    let success_rate = if processed > 0 {
        ((parsed as f64) / (processed as f64)) * 100.0
    } else {
        0.0
    };

    let html = format!(r#"
<!DOCTYPE html>
<html>
<head>
    <title>SIEM Consumer Dashboard</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            max-width: 1400px;
            margin: 0 auto;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            text-align: center;
        }}
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        .stat-card {{
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
        }}
        .stat-number {{
            font-size: 2em;
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
        }}
        .stat-label {{
            color: #666;
            text-transform: uppercase;
            font-size: 0.9em;
            letter-spacing: 1px;
        }}
        .success {{ color: #28a745; }}
        .warning {{ color: #ffc107; }}
        .danger {{ color: #dc3545; }}
        .info {{ color: #17a2b8; }}
        
        .sources-section {{
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        .sources-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }}
        .sources-table {{
            width: 100%;
            border-collapse: collapse;
        }}
        .sources-table th,
        .sources-table td {{
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }}
        .sources-table th {{
            background-color: #f8f9fa;
            font-weight: 600;
            color: #333;
        }}
        .status-badge {{
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: 500;
            text-transform: uppercase;
        }}
        .status-active {{ background-color: #d4edda; color: #155724; }}
        .status-idle {{ background-color: #fff3cd; color: #856404; }}
        .status-blocked {{ background-color: #f8d7da; color: #721c24; }}
        .refresh-btn {{
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        }}
        .refresh-btn:hover {{
            background: #5a6fd8;
        }}
        .no-sources {{
            text-align: center;
            color: #666;
            font-style: italic;
            padding: 40px;
        }}
        .action-btn {{
            padding: 4px 8px;
            margin: 0 2px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }}
        .block-btn {{ background-color: #dc3545; color: white; }}
        .unblock-btn {{ background-color: #28a745; color: white; }}
    </style>
    <script>
        function refreshPage() {{
            window.location.reload();
        }}
        
        function blockSource(ip) {{
            fetch('/block/' + ip, {{ method: 'POST' }})
                .then(() => refreshPage());
        }}
        
        function unblockSource(ip) {{
            fetch('/unblock/' + ip, {{ method: 'POST' }})
                .then(() => refreshPage());
        }}
        
        // Auto-refresh every 5 seconds
        setInterval(refreshPage, 5000);
    </script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ SIEM Consumer Dashboard</h1>
            <p>Real-time monitoring of log sources and event processing</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number success">{}</div>
                <div class="stat-label">Active Sources</div>
            </div>
            <div class="stat-card">
                <div class="stat-number info">{}</div>
                <div class="stat-label">Total Events</div>
            </div>
            <div class="stat-card">
                <div class="stat-number {}">{:.1}%</div>
                <div class="stat-label">Success Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-number info">{:.1}</div>
                <div class="stat-label">Average EPS</div>
            </div>
            <div class="stat-card">
                <div class="stat-number {}">{}</div>
                <div class="stat-label">Processed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number {}">{}</div>
                <div class="stat-label">Parsed</div>
            </div>
        </div>
        
        <div class="sources-section">
            <div class="sources-header">
                <h2>📡 Connected Log Sources</h2>
                <button class="refresh-btn" onclick="refreshPage()">🔄 Refresh</button>
            </div>
            
            {}
        </div>
    </div>
</body>
</html>
"#,
        stats.active_sources,
        stats.total_events,
        if success_rate >= 95.0 { "success" } else if success_rate >= 80.0 { "warning" } else { "danger" },
        success_rate,
        stats.avg_eps_overall,
        if processed > 0 { "info" } else { "warning" },
        processed,
        if parsed > 0 { "success" } else { "danger" },
        parsed,
        generate_sources_table(&sources)
    );

    Html(html)
}

fn generate_sources_table(sources: &[LogSource]) -> String {
    if sources.is_empty() {
        return r#"<div class="no-sources">
            <h3>No active log sources</h3>
            <p>Waiting for connections from log senders...</p>
        </div>"#.to_string();
    }

    let mut table_rows = String::new();
    
    for source in sources {
        let status_class = match source.status.as_str() {
            "active" => "status-active",
            "idle" => "status-idle",
            "blocked" => "status-blocked",
            _ => "status-idle",
        };
        
        let action_button = if source.status == "blocked" {
            format!(r#"<button class="action-btn unblock-btn" onclick="unblockSource('{}')">Unblock</button>"#, source.source_ip)
        } else {
            format!(r#"<button class="action-btn block-btn" onclick="blockSource('{}')">Block</button>"#, source.source_ip)
        };
        
        let bytes_mb = source.bytes_received as f64 / 1024.0 / 1024.0;
        let last_seen_ago = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() - source.last_seen;
        
        table_rows.push_str(&format!(r#"
            <tr>
                <td>{}</td>
                <td>{}</td>
                <td><span class="status-badge {}">{}</span></td>
                <td>{}</td>
                <td>{:.2}</td>
                <td>{:.1} MB</td>
                <td>{}s ago</td>
                <td>{}</td>
            </tr>
        "#,
            source.source_ip,
            source.source_port,
            status_class,
            source.status,
            source.event_count,
            source.avg_eps,
            bytes_mb,
            last_seen_ago,
            action_button
        ));
    }

    format!(r#"
        <table class="sources-table">
            <thead>
                <tr>
                    <th>Source IP</th>
                    <th>Port</th>
                    <th>Status</th>
                    <th>Events</th>
                    <th>EPS</th>
                    <th>Data Received</th>
                    <th>Last Seen</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {}
            </tbody>
        </table>
    "#, table_rows)
}