use axum::{routing::{get, post}, Router};
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer, services::{ServeDir, ServeFile}};
use crate::v2::{handlers::{health::health_check, events::{search_events, search_events_compact, insert_events}, sse::stream_stub, metrics::get_eps_stats, ingest::ingest_raw, alerts::list_alerts, assets::favicon, alert_rules::list_alert_rules}, state::AppState};

pub fn build(state: AppState) -> Router {
    let state = Arc::new(state);
    Router::new()
        .route("/favicon.ico", get(favicon))
        .route("/health", get(health_check))
        .route("/api/v2/health", get(health_check))
        .route("/api/v2/events/search", get(search_events))
        .route("/api/v2/events/search_compact", get(search_events_compact))
        .route("/api/v2/events/stream/ch", get(stream_stub))
        .route("/api/v2/events/insert", axum::routing::post(insert_events))
        .route("/api/v2/metrics/eps", get(get_eps_stats))
        .route("/api/v2/ingest/raw", axum::routing::post(ingest_raw))
        .route("/api/v2/alerts", get(list_alerts))
        .route("/api/v2/alert_rules", get(list_alert_rules))
        // Convenience aliases for dev pages
        .route_service("/dev/stream", ServeFile::new("web/stream.html"))
        .route_service("/dev/events", ServeFile::new("web/events.html"))
        .route_service("/dev/v2-events", ServeFile::new("siem_unified_pipeline/web/v2-events.html"))
        .nest_service(
            "/dev",
            ServeDir::new("web").append_index_html_on_directories(true),
        )
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state)
}


