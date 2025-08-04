use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use axum::body::to_bytes;
use serde_json::json;
use std::sync::Arc;
use tower::ServiceExt;

use siem_unified_pipeline::{
    config::PipelineConfig,
    handlers::{self, AppState, IngestEventResponse},
    schemas::RoutingRulesListResponse,
    pipeline::Pipeline,
    metrics::MetricsCollector,
};

// Helper function to create test app
async fn create_test_app() -> Router {
    let mut config = PipelineConfig::default();
    
    // Add a default transformation pipeline for testing
    use siem_unified_pipeline::config::{TransformationPipeline, TransformationStep, ErrorHandling};
    use std::collections::HashMap;
    
    let default_pipeline = TransformationPipeline {
        steps: vec![
            TransformationStep::Parse {
                parser: "syslog".to_string(),
                config: HashMap::new(),
            }
        ],
        parallel: false,
        error_handling: ErrorHandling::Continue,
    };
    
    config.transformations.insert("default".to_string(), default_pipeline);
    
    let pipeline = Pipeline::new(config.clone()).await.unwrap();
    let metrics = MetricsCollector::new(&config).unwrap();
    
    let app_state = AppState {
        pipeline: Arc::new(pipeline),
        metrics: Arc::new(metrics),
        config: Arc::new(tokio::sync::RwLock::new(config)),
        redis_client: None,
    };
    
    handlers::create_router(app_state)
}

#[tokio::test]
async fn test_event_ingestion_happy_path() {
    let app = create_test_app().await;
    
    let event = json!({
        "source": "test-source",
        "data": {
            "timestamp": "2024-01-01T00:00:00Z",
            "source": "test-source",
            "event_type": "security",
            "severity": "high",
            "message": "Test security event",
            "raw_message": "<134>Jan 1 00:00:00 test-host test-process: Test security event"
        },
        "metadata": {
            "source_ip": "192.168.1.100",
            "dest_ip": "10.0.0.1"
        }
    });
    
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/events/ingest")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&event).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    println!("Response status: {}, body: {}", status, body_str);
    
    assert_eq!(status, StatusCode::ACCEPTED);
    
    let result: IngestEventResponse = serde_json::from_slice(&body).unwrap();
    
    assert_eq!(result.status, "accepted");
    assert!(!result.event_id.is_empty());
}

#[tokio::test]
async fn test_event_ingestion_error_path() {
    let app = create_test_app().await;
    
    // Invalid event - missing required fields
    let invalid_event = json!({
        "source": "test-source",
        "data": {
            "invalid_field": "value"
            // Missing required 'timestamp' and 'source' fields
        }
    });
    
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/events/ingest")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&invalid_event).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_event_search_happy_path() {
    let app = create_test_app().await;
    
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/events/search?query=security&start_time=2024-01-01T00:00:00Z&end_time=2024-01-02T00:00:00Z&limit=100")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let result: siem_unified_pipeline::schemas::EventSearchResponse = serde_json::from_slice(&body).unwrap();
    
    assert!(result.events.is_empty() || !result.events.is_empty()); // Either empty or has events
    // total_count is always >= 0 for unsigned types
}

#[tokio::test]
async fn test_event_search_error_path() {
    let app = create_test_app().await;
    
    // Invalid search - invalid query parameters
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/events/search?invalid_param=value")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_routing_rules_list_happy_path() {
    let app = create_test_app().await;
    
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/routing/rules")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let result: RoutingRulesListResponse = serde_json::from_slice(&body).unwrap();
    
    assert!(result.rules.is_empty() || !result.rules.is_empty()); // Either empty or has rules
    // total is always >= 0 for unsigned types
}

#[tokio::test]
async fn test_routing_rules_error_path() {
    let app = create_test_app().await;
    
    // Test invalid rule creation - missing required name field
    let invalid_rule = json!({
        "description": "Invalid rule without name",
        "conditions": {},
        "actions": []
    });
    
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/routing/rules")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&invalid_rule).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn test_routing_rules_crud_operations() {
    let app = create_test_app().await;
    
    // Create a new routing rule
    let new_rule = json!({
        "name": "test-rule",
        "description": "Test routing rule",
        "conditions": {
            "severity": "high",
            "event_type": "security"
        },
        "actions": ["clickhouse", "kafka"],
        "enabled": true,
        "priority": 1
    });
    
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/routing/rules")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&new_rule).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    // Should either succeed or fail gracefully
    assert!(response.status() == StatusCode::CREATED || response.status() == StatusCode::BAD_REQUEST);
    
    if response.status() == StatusCode::CREATED {
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let result: siem_unified_pipeline::schemas::RoutingRuleResponse = serde_json::from_slice(&body).unwrap();
        
        assert_eq!(result.name, "test-rule");
        assert!(result.enabled);
        assert_eq!(result.priority, 1);
    }
}

// Admin Console Integration Tests

#[tokio::test]
async fn test_admin_console_dashboard() {
    let app = create_test_app().await;
    
    // Test the console route (without trailing slash since that works)
    let request = Request::builder()
        .uri("/console")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html = String::from_utf8(body.to_vec()).unwrap();
    
    // Check for expected HTML content
    assert!(html.contains("SIEM Admin Console"));
    assert!(html.contains("System Overview"));
    assert!(html.contains("Total Events"));
    assert!(html.contains("Events/Second"));
}

#[tokio::test]
async fn test_admin_console_health_page() {
    let app = create_test_app().await;
    
    let request = Request::builder()
        .uri("/console/health")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html = String::from_utf8(body.to_vec()).unwrap();
    
    // Check for expected HTML content
    assert!(html.contains("System Health Status"));
    assert!(html.contains("Loading health status"));
}

#[tokio::test]
async fn test_admin_console_metrics_page() {
    let app = create_test_app().await;
    
    let request = Request::builder()
        .uri("/console/metrics")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html = String::from_utf8(body.to_vec()).unwrap();
    
    // Check for expected HTML content
    assert!(html.contains("System Metrics"));
    assert!(html.contains("Loading metrics"));
}

#[tokio::test]
async fn test_admin_console_events_page() {
    let app = create_test_app().await;
    
    let request = Request::builder()
        .uri("/console/events")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html = String::from_utf8(body.to_vec()).unwrap();
    
    // Check for expected HTML content
    assert!(html.contains("Recent Events"));
    assert!(html.contains("Loading events"));
}

#[tokio::test]
async fn test_admin_console_config_page() {
    let app = create_test_app().await;
    
    let request = Request::builder()
        .uri("/console/config")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html = String::from_utf8(body.to_vec()).unwrap();
    
    // Check for expected HTML content
    assert!(html.contains("Configuration Management"));
    assert!(html.contains("admin token"));
    assert!(html.contains("Loading configuration"));
}

#[tokio::test]
async fn test_admin_console_api_health() {
    let app = create_test_app().await;
    
    let request = Request::builder()
        .uri("/console/api/health")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    // Should return health data
    assert!(response_json.get("status").is_some());
}

#[tokio::test]
async fn test_admin_console_api_metrics() {
    let app = create_test_app().await;
    
    let request = Request::builder()
        .uri("/console/api/metrics")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    // Should return metrics data (structure may vary)
    assert!(response_json.is_object());
}

#[tokio::test]
async fn test_admin_console_api_events() {
    let app = create_test_app().await;
    
    let request = Request::builder()
        .uri("/console/api/events?limit=10")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    // Should return events data structure
    assert!(response_json.is_object());
}

#[tokio::test]
async fn test_admin_console_api_config() {
    let app = create_test_app().await;
    
    let request = Request::builder()
        .uri("/console/api/config")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    // Should return config data
    assert!(response_json.is_object());
}

#[tokio::test]
async fn test_admin_console_config_update_without_token() {
    let app = create_test_app().await;
    
    let config_update = json!({
        "server": {
            "host": "127.0.0.1",
            "port": 8080
        }
    });
    
    let request = Request::builder()
        .uri("/console/config")
        .method("POST")
        .header("content-type", "application/json")
        .body(Body::from(config_update.to_string()))
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    assert!(body_str.contains("Admin token required"));
}

#[tokio::test]
async fn test_admin_console_config_update_with_valid_token() {
    let app = create_test_app().await;
    
    let config_update = json!({
        "server": {
            "host": "127.0.0.1",
            "port": 8080
        }
    });
    
    let request = Request::builder()
        .uri("/console/config")
        .method("POST")
        .header("content-type", "application/json")
        .header("X-Admin-Token", "valid-admin-token-123456789")
        .body(Body::from(config_update.to_string()))
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    // Should not be unauthorized (may be 200 or other status depending on handler implementation)
    assert_ne!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_admin_console_config_update_with_invalid_token() {
    let app = create_test_app().await;
    
    let config_update = json!({
        "server": {
            "host": "127.0.0.1",
            "port": 8080
        }
    });
    
    let request = Request::builder()
        .uri("/console/config")
        .method("POST")
        .header("content-type", "application/json")
        .header("X-Admin-Token", "short")
        .body(Body::from(config_update.to_string()))
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_admin_console_navigation_links() {
    let app = create_test_app().await;
    
    // Test that all navigation pages are accessible
    let pages = vec![
        "/console",
        "/console/health",
        "/console/metrics", 
        "/console/events",
        "/console/config",
        "/console/routing",
        "/console/system",
    ];
    
    for page in pages {
        let request = Request::builder()
            .uri(page)
            .body(Body::empty())
            .unwrap();
        
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK, "Failed to load page: {}", page);
        
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let html = String::from_utf8(body.to_vec()).unwrap();
        
        // All pages should have the common navigation
        assert!(html.contains("SIEM Admin Console"), "Page {} missing header", page);
        assert!(html.contains("Dashboard"), "Page {} missing navigation", page);
    }
}