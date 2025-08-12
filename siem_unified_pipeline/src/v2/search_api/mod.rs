use axum::{routing::{post, get, delete}, Router};
use std::sync::Arc;
use crate::v2::state::AppState;

pub mod compiler;
pub mod handlers;

pub fn routes(state: Arc<AppState>) -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v2/search/compile", post(handlers::compile))
        .route("/api/v2/search/execute", post(handlers::execute))
        .route("/api/v2/search/aggs", post(handlers::aggs))
        .route("/api/v2/search/tail", post(handlers::tail))
        .route("/api/v2/search/export", post(handlers::export))
        .route("/api/v2/search/saved", get(handlers::saved_searches))
        .route("/api/v2/search/saved", post(handlers::save_search))
        .route("/api/v2/search/saved/:id", delete(handlers::delete_search))
        .with_state(state)
}


