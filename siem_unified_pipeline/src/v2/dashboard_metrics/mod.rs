use std::sync::Arc;
use axum::{Router, routing::get};
use crate::v2::state::AppState;

mod handlers;

pub fn routes(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/ingest", get(handlers::ingest))
        .route("/query", get(handlers::query))
        .route("/storage", get(handlers::storage))
        .route("/errors", get(handlers::errors))
        .route("/freshness", get(handlers::freshness))
        .with_state(state)
}
