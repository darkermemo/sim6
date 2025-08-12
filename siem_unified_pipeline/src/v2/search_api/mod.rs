use axum::{routing::{post, get, delete}, Router};

pub mod compiler;
pub mod handlers;

pub fn router() -> Router<std::sync::Arc<crate::v2::state::AppState>> {
    Router::new()
        .route("/api/v2/search/compile", post(handlers::compile))
        // Keep legacy simple-body execute under /execute2; main /execute uses unified handler
        .route("/api/v2/search/execute2", post(handlers::execute))
        .route("/api/v2/search/aggs", post(handlers::aggs))
        .route("/api/v2/search/tail", post(handlers::tail))
        .route("/api/v2/search/tail", get(handlers::tail_get))
        .route("/api/v2/search/export", post(handlers::export))
        .route("/api/v2/search/saved", get(handlers::saved_searches))
        .route("/api/v2/search/saved", post(handlers::save_search))
        .route("/api/v2/search/saved/:id", delete(handlers::delete_search))
}


