use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use siem_unified_pipeline::{handlers, AppState, config};
use tower::ServiceExt;

#[tokio::test]
async fn dev_routes_resolve() {
    let cfg = config::minimal_config();
    let state = create_test_state(cfg).await;
    let app = handlers::create_router(state);

    for path in ["/dev/", "/dev/index.html", "/dev/stream.html", "/dev/events.html"] {
        let request = Request::builder()
            .uri(path)
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "path {} should return 200",
            path
        );
    }
}

#[tokio::test]
async fn api_routes_resolve() {
    let cfg = config::minimal_config();
    let state = create_test_state(cfg).await;
    let app = handlers::create_router(state);

    for path in ["/api/v1/health", "/health", "/test"] {
        let request = Request::builder()
            .uri(path)
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "path {} should return 200",
            path
        );
    }
}

#[tokio::test]
async fn not_found_routes_404() {
    let cfg = config::minimal_config();
    let state = create_test_state(cfg).await;
    let app = handlers::create_router(state);

    for path in ["/does/not/exist", "/dev/nonexistent", "/api/v1/fake"] {
        let request = Request::builder()
            .uri(path)
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(
            response.status(),
            StatusCode::NOT_FOUND,
            "path {} should return 404",
            path
        );
    }
}

/// Create a minimal test state for testing
async fn create_test_state(cfg: config::AppCfg) -> AppState {
    use siem_unified_pipeline::{metrics::MetricsCollector, field_metadata::FieldMetadata, storage::StorageManager, PipelineConfig};
    use std::sync::Arc;
    use tokio::sync::RwLock;
    
    // Create minimal components for testing
    let metrics = Arc::new(MetricsCollector::new(PipelineConfig::default()).await.unwrap());
    let field_metadata = Arc::new(RwLock::new(FieldMetadata::new()));
    let storage = Arc::new(StorageManager::new(PipelineConfig::default()).await.unwrap());
    
    AppState {
        metrics,
        field_metadata,
        storage,
    }
}