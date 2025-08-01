//! Common test utilities for integration tests

use axum::Router;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

// Re-export the main application modules for testing
use siem_clickhouse_search::{
    config::Config,
    database::ClickHouseService,
    handlers::{create_router, AppState},
    security::SecurityService,
    validation::ValidationService,
};

/// Test JWT Claims structure
#[derive(Debug, Serialize, Deserialize)]
pub struct TestClaims {
    pub sub: String,
    pub tenant_id: String,
    pub roles: Vec<String>,
    pub iat: usize,
    pub exp: usize,
    pub iss: String,
    pub aud: String,
    pub jti: String,
}

/// Setup a test application with in-memory or test database
pub async fn setup_test_app() -> Router {
    // Initialize test configuration
    let config = create_test_config();
    
    // Initialize services
    let clickhouse_service = ClickHouseService::new(config.clone())
        .await
        .expect("Failed to initialize test ClickHouse service");
    
    let security_service = SecurityService::new(config.clone())
        .expect("Failed to initialize test security service");
    
    let validation_service = ValidationService::new();
    
    // Create test application state
    let app_state = AppState {
        config: config.clone(),
        db_service: Arc::new(clickhouse_service),
        security_service: Arc::new(security_service),
        validation_service: Arc::new(validation_service),
        start_time: std::time::Instant::now(),
    };
    
    // Create router
    create_router(app_state)
}

/// Create test configuration
fn create_test_config() -> Arc<Config> {
    let mut config = Config::default();
    
    // Override with test-specific settings
    config.server.host = "127.0.0.1".to_string();
    config.server.port = 0; // Use random port for tests
    
    // Use test database
    config.clickhouse.database = "test_siem".to_string();
    config.clickhouse.host = std::env::var("TEST_CLICKHOUSE_HOST")
        .unwrap_or_else(|_| "localhost".to_string());
    config.clickhouse.port = std::env::var("TEST_CLICKHOUSE_PORT")
        .unwrap_or_else(|_| "8123".to_string())
        .parse()
        .unwrap_or(8123);
    
    // Test JWT settings
    config.security.jwt_secret = "test_secret_key_for_testing_only_not_for_production".to_string();
    config.security.enable_tenant_isolation = true;
    config.security.token_expiry_hours = 24;
    
    Arc::new(config)
}

/// Generate a test JWT token for a given tenant
pub fn generate_test_jwt(tenant_id: &str, roles: Vec<String>) -> String {
    let now = chrono::Utc::now().timestamp() as usize;
    let exp = now + 3600; // 1 hour expiry
    
    let claims = TestClaims {
        sub: Uuid::new_v4().to_string(),
        tenant_id: tenant_id.to_string(),
        roles,
        iat: now,
        exp,
        iss: "test-issuer".to_string(),
        aud: "test-audience".to_string(),
        jti: Uuid::new_v4().to_string(),
    };
    
    let secret = "test_secret_key_for_testing_only_not_for_production";
    let encoding_key = EncodingKey::from_secret(secret.as_ref());
    
    encode(&Header::default(), &claims, &encoding_key)
        .expect("Failed to generate test JWT")
}

/// Insert a test event into the database
pub async fn insert_test_event(app: &Router, event: &Value) {
    // This would typically use the ingestion endpoint
    // For now, we'll assume events are inserted directly into the test database
    // In a real implementation, you would call the ingestion API endpoint
    
    // Example implementation:
    // let response = app
    //     .clone()
    //     .oneshot(
    //         Request::builder()
    //             .method("POST")
    //             .uri("/api/v1/events/ingest")
    //             .header("Content-Type", "application/json")
    //             .body(Body::from(event.to_string()))
    //             .unwrap(),
    //     )
    //     .await
    //     .unwrap();
    // 
    // assert_eq!(response.status(), StatusCode::OK);
    
    // For now, we'll just log that we would insert the event
    println!("Would insert test event: {}", event);
}

/// Clean up test data
pub async fn cleanup_test_data() {
    // Clean up any test data from the database
    // This should be called after each test to ensure isolation
    println!("Cleaning up test data");
}

/// Assert that a response contains an error with a specific message pattern
pub fn assert_error_response(response_body: &[u8], expected_pattern: &str) {
    let error_response: Value = serde_json::from_slice(response_body)
        .expect("Response should be valid JSON");
    
    let error_message = error_response["error"]
        .as_str()
        .expect("Response should contain error field");
    
    assert!(
        error_message.contains(expected_pattern),
        "Error message '{}' should contain '{}'",
        error_message,
        expected_pattern
    );
}

/// Create a test search request with default values
pub fn create_test_search_request() -> Value {
    serde_json::json!({
        "query": "test",
        "time_range": {
            "start": "2022-01-01T00:00:00Z",
            "end": "2022-01-02T00:00:00Z"
        },
        "pagination": {
            "size": 10
        }
    })
}

/// Wait for async operations to complete (useful for eventual consistency)
pub async fn wait_for_consistency() {
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
}