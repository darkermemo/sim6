use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json, Sse, sse::Event, Html},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio_stream::StreamExt;
use tower_http::cors::CorsLayer;
use tracing::{info, error};
use chrono::{DateTime, Utc};
use uuid::Uuid;

// Simple app state for our SIEM
#[derive(Clone)]
pub struct SiemAppState {
    pub events: Arc<RwLock<Vec<SiemEvent>>>,
    pub event_sender: Arc<tokio::sync::broadcast::Sender<SiemEvent>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiemEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub source: String,
    pub severity: String,
    pub message: String,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: DateTime<Utc>,
    pub version: String,
    pub events_count: usize,
}

impl SiemAppState {
    pub fn new() -> Self {
        let (tx, _rx) = tokio::sync::broadcast::channel(1000);
        Self {
            events: Arc::new(RwLock::new(Vec::new())),
            event_sender: Arc::new(tx),
        }
    }

    pub async fn add_event(&self, event: SiemEvent) {
        let mut events = self.events.write().await;
        events.push(event.clone());
        
        // Keep only last 1000 events
        if events.len() > 1000 {
            let keep_from = events.len() - 1000;
            let mut new_vec = events.split_off(keep_from);
            *events = new_vec;
        }
        
        // Send event to SSE subscribers
        if let Err(e) = self.event_sender.send(event) {
            error!("Failed to send event to SSE subscribers: {}", e);
        }
    }
}

// Health endpoint
pub async fn health_handler(State(state): State<SiemAppState>) -> impl IntoResponse {
    let events = state.events.read().await;
    let response = HealthResponse {
        status: "healthy".to_string(),
        timestamp: Utc::now(),
        version: "1.0.0".to_string(),
        events_count: events.len(),
    };
    Json(response)
}

// Events list endpoint
pub async fn list_events(State(state): State<SiemAppState>) -> impl IntoResponse {
    let events = state.events.read().await;
    Json(events.clone())
}

// Ingest new event
pub async fn ingest_event(
    State(state): State<SiemAppState>,
    Json(mut payload): Json<HashMap<String, serde_json::Value>>,
) -> impl IntoResponse {
    let event = SiemEvent {
        id: Uuid::new_v4().to_string(),
        timestamp: Utc::now(),
        source: payload.remove("source")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "unknown".to_string()),
        severity: payload.remove("severity")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "info".to_string()),
        message: payload.remove("message")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "No message".to_string()),
        metadata: payload.into_iter()
            .filter_map(|(k, v)| v.as_str().map(|s| (k, s.to_string())))
            .collect(),
    };

    state.add_event(event.clone()).await;
    info!("Ingested event: {}", event.id);

    Json(serde_json::json!({
        "status": "success",
        "event_id": event.id,
        "timestamp": event.timestamp
    }))
}

// SSE endpoint for real-time events
pub async fn events_stream(State(state): State<SiemAppState>) -> impl IntoResponse {
    info!("New SSE client connected");
    
    let mut rx = state.event_sender.subscribe();
    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    if let Ok(json_data) = serde_json::to_string(&event) {
                        yield Event::default().data(json_data);
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    continue;
                }
                Err(_) => break,
            }
        }
    };

    Sse::new(stream)
        .keep_alive(
            axum::response::sse::KeepAlive::new()
                .interval(Duration::from_secs(10))
                .text("heartbeat"),
        )
}

// EPS (Events Per Second) metrics endpoint
pub async fn eps_metrics(State(state): State<SiemAppState>) -> impl IntoResponse {
    let events = state.events.read().await;
    let now = Utc::now();
    let minute_ago = now - chrono::Duration::seconds(60);
    
    let recent_events: Vec<&SiemEvent> = events
        .iter()
        .filter(|event| event.timestamp > minute_ago)
        .collect();
    
    let eps = recent_events.len() as f64 / 60.0;
    
    Json(serde_json::json!({
        "eps": eps,
        "total_events": events.len(),
        "recent_events": recent_events.len(),
        "timestamp": now
    }))
}

// Dashboard UI
pub async fn dashboard() -> impl IntoResponse {
    let html = include_str!("../web/dashboard.html");
    Html(html)
}

// Stream UI page
pub async fn stream_page() -> impl IntoResponse {
    let html = include_str!("../web/stream.html");
    Html(html)
}

pub fn create_router() -> Router {
    let state = SiemAppState::new();

    Router::new()
        // API routes
        .route("/health", get(health_handler))
        .route("/api/v1/events", get(list_events).post(ingest_event))
        .route("/api/v1/events/stream", get(events_stream))
        .route("/api/v1/metrics/eps", get(eps_metrics))
        
        // UI routes
        .route("/", get(dashboard))
        .route("/dev", get(dashboard))
        .route("/dev/", get(dashboard))
        .route("/dev/stream", get(stream_page))
        
        .layer(CorsLayer::permissive())
        .with_state(state)
}
