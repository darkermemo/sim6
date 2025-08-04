use axum::{extract::State, response::Html, routing::get, Router};
use chrono::{DateTime, Utc};
use clickhouse::Client;
use maud::{html, Markup};
use std::{net::SocketAddr, sync::Arc};

/// Application state containing ClickHouse client
#[derive(Clone)]
struct AppState {
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
        .query("SELECT toString(event_id) as event_id, tenant_id, toString(timestamp) as timestamp, toString(source_ip) as source_ip, source, message FROM dev.events ORDER BY timestamp DESC")
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

    // Create router with single /events route
    let app = Router::new()
        .route("/events", get(events_html))
        .with_state(app_state);

    tracing::info!("Router configured with /events route");

    let addr: SocketAddr = "0.0.0.0:3000".parse()?;
    
    tracing::info!("🚀 Server starting on http://localhost:3000");
    tracing::info!("📊 Events page available at: http://localhost:3000/events");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("TCP listener bound to {}", addr);
    
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;
    
    Ok(())
}
