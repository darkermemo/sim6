use axum::{extract::{Query, State}, Json};
use std::sync::Arc;
use crate::v2::{api::EventSearchQuery, dal::ClickHouseRepo, state::AppState, models::SiemEvent};
use crate::error::Result;
use axum::extract::Json as AxumJson;

pub async fn search_events(
    State(st): State<Arc<AppState>>,
    Query(q): Query<EventSearchQuery>,
) -> Result<Json<serde_json::Value>> {
    tracing::info!("search_events: start");
    match ClickHouseRepo::search_events(&st, &q).await {
        Ok(rows) => {
            tracing::info!("search_events: ok total={}", rows.len());
            Ok(Json(serde_json::json!({
                "total": rows.len(),
                "events": rows,
            })))
        }
        Err(e) => {
            tracing::error!("search_events: error: {:?}", e);
            Err(e)
        }
    }
}

pub async fn search_events_compact(
    State(st): State<Arc<AppState>>,
    Query(q): Query<EventSearchQuery>,
) -> Result<Json<serde_json::Value>> {
    tracing::info!("search_events_compact: start");
    match ClickHouseRepo::search_events_compact(&st, &q).await {
        Ok(rows) => {
            tracing::info!("search_events_compact: ok total={}", rows.len());
            Ok(Json(serde_json::json!({
                "total": rows.len(),
                "events": rows,
            })))
        }
        Err(e) => {
            tracing::error!("search_events_compact: error: {:?}", e);
            Err(e)
        }
    }
}

pub async fn insert_events(
    State(st): State<Arc<AppState>>,
    AxumJson(payload): AxumJson<Vec<SiemEvent>>,
) -> Result<Json<serde_json::Value>> {
    tracing::info!("Received {} events for insertion", payload.len());
    
    match ClickHouseRepo::insert_events(&st, &payload).await {
        Ok(inserted) => {
            tracing::info!("Successfully inserted {} events", inserted);
            Ok(Json(serde_json::json!({ "inserted": inserted })))
        }
        Err(e) => {
            tracing::error!("Failed to insert events: {:?}", e);
            Err(e)
        }
    }
}


