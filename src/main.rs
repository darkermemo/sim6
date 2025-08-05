#![deny(warnings)]

use axum::{extract::State, response::Html, routing::get, Router};
// Removed unused chrono imports
use clickhouse::Client;
use maud::{html, Markup};
use std::{net::SocketAddr, sync::Arc};

/// Application state containing ClickHouse client
#[derive(Clone)]
pub struct AppState {
    ch_client: Client,
}

/// Row structure for dev.events table
#[derive(clickhouse::Row, serde::Deserialize)]
struct EventRow {
    event_id: String,
    tenant_id: String,
    timestamp: String,
    source_ip: String,
    source: String,
    message: String,
}

/// Handler that serves HTML page with all events from dev.events table
pub async fn events_html(State(state): State<Arc<AppState>>) -> Html<String> {
    tracing::info!("events_html handler called!");
    
    let rows: Vec<EventRow> = match state
        .ch_client
        .query("SELECT toString(event_id) as event_id, tenant_id, toString(ingestion_timestamp) as timestamp, source_ip, source_type as source, raw_event as message FROM dev.events ORDER BY ingestion_timestamp DESC LIMIT 1000")
        .fetch_all()
        .await {
            Ok(rows) => {
                tracing::info!("Successfully fetched {} rows from ClickHouse", rows.len());
                rows
            },
            Err(e) => {
                tracing::error!("Failed to fetch rows from ClickHouse: {}", e);
                Vec::new()
            }
        };

    let markup: Markup = html! {
        (maud::DOCTYPE)
        html {
            head {
                title { "All events" }
                style {
                    "table { border-collapse: collapse; width: 100%; }"
                    "th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }"
                    "th { background-color: #f2f2f2; }"
                }
            }
            body {
                h1 { "dev.events" }
                p { "Total events: " (rows.len()) }
                table {
                    tr {
                        th { "Event ID" }
                        th { "Tenant ID" }
                        th { "Timestamp" }
                        th { "Source IP" }
                        th { "Source" }
                        th { "Message" }
                    }
                    @for r in &rows {
                        tr {
                            td { (&r.event_id) }
                            td { (&r.tenant_id) }
                            td { (&r.timestamp) }
                            td { (&r.source_ip) }
                            td { (&r.source) }
                            td { (&r.message) }
                        }
                    }
                }
            }
        }
    };
    Html(markup.into_string())
}

/// Metrics visualization dashboard with pipeline diagram
pub async fn metrics_visualization(State(state): State<Arc<AppState>>) -> Html<String> {
    tracing::info!("metrics_visualization handler called!");
    
    // Get consumer metrics from the running consumer
    let consumer_metrics = match reqwest::get("http://localhost:9091/metrics").await {
        Ok(resp) => match resp.text().await {
            Ok(text) => serde_json::from_str::<serde_json::Value>(&text).ok(),
            Err(_) => None,
        },
        Err(_) => None,
    };
    
    // Get event count from ClickHouse 
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct CountResult {
        count: u64,
    }
    
    let event_count: u64 = state
        .ch_client
        .query("SELECT COUNT(*) as count FROM dev.events")
        .fetch_one::<CountResult>()
        .await
        .map(|result| result.count)
        .unwrap_or(0);

    let markup: Markup = html! {
        (maud::DOCTYPE)
        html {
            head {
                title { "SIEM Pipeline Metrics" }
                style {
                    "body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }"
                    ".container { max-width: 1400px; margin: 0 auto; }"
                    ".header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; text-align: center; }"
                    ".metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }"
                    ".metric-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }"
                    ".metric-value { font-size: 2.5em; font-weight: bold; margin-bottom: 10px; }"
                    ".metric-label { color: #666; text-transform: uppercase; font-size: 0.9em; }"
                    ".success { color: #28a745; }"
                    ".warning { color: #ffc107; }"
                    ".danger { color: #dc3545; }"
                    ".info { color: #17a2b8; }"
                    ".pipeline-diagram { background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }"
                    ".flow-container { display: flex; justify-content: space-between; align-items: center; margin: 40px 0; }"
                    ".component { background: #e3f2fd; border: 2px solid #2196f3; border-radius: 10px; padding: 15px 20px; min-width: 120px; text-align: center; position: relative; }"
                    ".component.success { background: #e8f5e8; border-color: #4caf50; }"
                    ".component.warning { background: #fff3e0; border-color: #ff9800; }"
                    ".component.error { background: #ffebee; border-color: #f44336; }"
                    ".arrow { font-size: 2em; color: #2196f3; margin: 0 10px; }"
                    ".arrow.success { color: #4caf50; }"
                    ".arrow.error { color: #f44336; }"
                    ".component-title { font-weight: bold; margin-bottom: 5px; }"
                    ".component-status { font-size: 0.8em; color: #666; }"
                    ".refresh-info { text-align: center; margin-top: 20px; color: #666; }"
                }
                script {
                    "setTimeout(() => window.location.reload(), 5000);" // Auto-refresh every 5 seconds
                }
            }
            body {
                div class="container" {
                    div class="header" {
                        h1 { "🛡️ SIEM Pipeline Real-Time Metrics" }
                        p { "Live monitoring of data flow and component health" }
                    }
                    
                    @if let Some(metrics) = &consumer_metrics {
                        div class="metrics-grid" {
                            div class="metric-card" {
                                div class="metric-value success" { (metrics.get("parsed").and_then(|v| v.as_u64()).unwrap_or(0)) }
                                div class="metric-label" { "Events Parsed" }
                            }
                            div class="metric-card" {
                                div class="metric-value info" { (metrics.get("processed").and_then(|v| v.as_u64()).unwrap_or(0)) }
                                div class="metric-label" { "Events Processed" }
                            }
                            @if let Some(connections) = metrics.get("connections") {
                                div class="metric-card" {
                                    div class="metric-value success" { (connections.get("active_sources").and_then(|v| v.as_u64()).unwrap_or(0)) }
                                    div class="metric-label" { "Active Sources" }
                                }
                                div class="metric-card" {
                                    div class="metric-value info" { (format!("{:.1}", connections.get("avg_eps_overall").and_then(|v| v.as_f64()).unwrap_or(0.0))) }
                                    div class="metric-label" { "Events/Second" }
                                }
                            }
                            div class="metric-card" {
                                div class="metric-value info" { (event_count.to_string()) }
                                div class="metric-label" { "Total Stored" }
                            }
                            @if let Some(rates) = metrics.get("rates") {
                                @let success_rate = rates.get("success_rate").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                div class="metric-card" {
                                    div class={"metric-value " (if success_rate >= 95.0 { "success" } else if success_rate >= 80.0 { "warning" } else { "danger" })} { 
                                        (format!("{:.1}%", success_rate)) 
                                    }
                                    div class="metric-label" { "Success Rate" }
                                }
                            }
                        }
                        
                        div class="pipeline-diagram" {
                            h2 { "📊 Data Pipeline Flow" }
                            div class="flow-container" {
                                div class="component success" {
                                    div class="component-title" { "Log Sources" }
                                    div class="component-status" { 
                                        @if let Some(connections) = metrics.get("connections") {
                                            (connections.get("active_sources").and_then(|v| v.as_u64()).unwrap_or(0)) " Active"
                                        } @else {
                                            "0 Active"
                                        }
                                    }
                                }
                                div class="arrow success" { "→" }
                                div class="component success" {
                                    div class="component-title" { "Kafka Queue" }
                                    div class="component-status" { 
                                        (metrics.get("queued").and_then(|v| v.as_u64()).unwrap_or(0)) " Queued"
                                    }
                                }
                                div class="arrow success" { "→" }
                                div class="component success" {
                                    div class="component-title" { "Consumer" }
                                    div class="component-status" { "Processing" }
                                }
                                div class="arrow success" { "→" }
                                div class="component success" {
                                    div class="component-title" { "Parser" }
                                    div class="component-status" { 
                                        @if let Some(rates) = metrics.get("rates") {
                                            @let success_rate = rates.get("success_rate").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                            (format!("{:.1}% Success", success_rate))
                                        } @else {
                                            "Ready"
                                        }
                                    }
                                }
                                div class="arrow success" { "→" }
                                div class="component success" {
                                    div class="component-title" { "ClickHouse" }
                                    div class="component-status" { 
                                        (format!("{:.1}M Events", event_count as f64 / 1_000_000.0))
                                    }
                                }
                                div class="arrow success" { "→" }
                                div class="component success" {
                                    div class="component-title" { "API/UI" }
                                    div class="component-status" { "Serving Data" }
                                }
                            }
                        }
                    } @else {
                        div class="pipeline-diagram" {
                            h2 { "⚠️ Consumer Metrics Unavailable" }
                            p { "The SIEM consumer metrics endpoint is not accessible. Please ensure the consumer is running on port 9091." }
                        }
                    }
                    
                    div class="refresh-info" {
                        p { "🔄 Auto-refreshing every 5 seconds | Last updated: " (chrono::Utc::now().format("%H:%M:%S UTC")) }
                    }
                }
            }
        }
    };
    Html(markup.into_string())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    tracing::info!("Starting application...");

    // Create ClickHouse client
    let ch_client = clickhouse::Client::default()
        .with_url("http://localhost:8123")
        .with_database("dev")
        .with_user("default")
        .with_password("");

    tracing::info!("ClickHouse client created");

    let app_state = Arc::new(AppState { ch_client });

    tracing::info!("AppState created");

    // Create router with events and visualization routes
    let app = Router::new()
        .route("/events", get(events_html))
        .route("/dev/events", get(events_html))
        .route("/dev/metrics/live", get(metrics_visualization))
        .with_state(app_state);

    tracing::info!("Router configured with /events route");

    let addr: SocketAddr = "0.0.0.0:8081".parse()?;
    
    tracing::info!("🚀 Server starting on http://localhost:8081");
    tracing::info!("📊 Events page available at: http://localhost:8081/events");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("TCP listener bound to {}", addr);
    
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;
    
    Ok(())
}
