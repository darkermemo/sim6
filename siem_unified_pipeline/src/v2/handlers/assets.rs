use axum::http::StatusCode;

/// Serve a placeholder favicon to avoid 404 noise in browser dev tools
pub async fn favicon() -> StatusCode {
    StatusCode::NO_CONTENT
}


