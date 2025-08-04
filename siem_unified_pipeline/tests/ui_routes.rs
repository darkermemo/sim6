//! Integration tests for UI routes
//! Tests that web UI routes are properly accessible when the web-ui feature is enabled

use siem_unified_pipeline::handlers::{create_router, AppState};
use std::sync::Arc;
use tokio::net::TcpListener;

/// Create a dummy AppState for testing
async fn create_dummy_state() -> AppState {
    use siem_unified_pipeline::pipeline::Pipeline;
    use siem_unified_pipeline::config::PipelineConfig;
    use siem_unified_pipeline::metrics::MetricsCollector;
    
    let config = PipelineConfig::default();
    
    AppState {
        pipeline: Arc::new(Pipeline::new(config.clone()).await.expect("Failed to create pipeline")),
        metrics: Arc::new(MetricsCollector::new(&config).expect("Failed to create metrics collector")),
        config: Arc::new(tokio::sync::RwLock::new(config)),
        redis_client: None,
    }
}

#[cfg(feature = "web-ui")]
#[tokio::test]
async fn test_ui_routes_accessibility() {
    // Create the router with dummy state
    let app_state = create_dummy_state().await;
    let app = create_router(app_state).into_make_service();
    
    // Bind to an ephemeral port
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    
    // Start the server in the background
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    
    // Give the server a moment to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    let client = reqwest::Client::new();
    
    // Test /test-ui route
    let response = client
        .get(&format!("http://{}/test-ui", addr))
        .send()
        .await
        .unwrap();
    
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let content_type = response.headers().get("content-type").unwrap();
    assert!(content_type.to_str().unwrap().starts_with("text/plain"));
    
    // Test root / route
    let response = client
        .get(&format!("http://{}/", addr))
        .send()
        .await
        .unwrap();
    
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let content_type = response.headers().get("content-type").unwrap();
    assert!(content_type.to_str().unwrap().starts_with("text/html"));
}

#[cfg(not(feature = "web-ui"))]
#[tokio::test]
async fn test_ui_routes_not_available_without_feature() {
    // When web-ui feature is not enabled, UI routes should not be available
    let app_state = create_dummy_state().await;
    let app = create_router(app_state).into_make_service();
    
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    let client = reqwest::Client::new();
    
    // Test /test-ui route should return 404
    let response = client
        .get(&format!("http://{}/test-ui", addr))
        .send()
        .await
        .unwrap();
    
    assert_eq!(response.status(), reqwest::StatusCode::NOT_FOUND);
    
    // Test root / route should return 404
    let response = client
        .get(&format!("http://{}/", addr))
        .send()
        .await
        .unwrap();
    
    assert_eq!(response.status(), reqwest::StatusCode::NOT_FOUND);
}