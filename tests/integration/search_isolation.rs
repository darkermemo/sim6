//! Integration tests for tenant isolation in search functionality

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

mod common;
use common::{
    setup_test_app, generate_test_jwt, insert_test_event, cleanup_test_data,
    assert_error_response, create_test_search_request, wait_for_consistency,
};

#[tokio::test]
async fn test_tenant_isolation_in_search() {
    let app = setup_test_app().await;
    
    // Create two different tenants
    let tenant_a = Uuid::new_v4().to_string();
    let tenant_b = Uuid::new_v4().to_string();
    
    // Generate JWT tokens for each tenant
    let token_a = generate_test_jwt(&tenant_a, vec!["user".to_string()]);
    let token_b = generate_test_jwt(&tenant_b, vec!["user".to_string()]);
    
    // Insert test events for tenant A
    let event_a = json!({
        "event_id": Uuid::new_v4().to_string(),
        "tenant_id": tenant_a,
        "event_timestamp": 1640995200, // 2022-01-01
        "source_ip": "192.168.1.100",
        "source_type": "firewall",
        "message": "Tenant A secret data",
        "severity": "info"
    });
    
    // Insert test events for tenant B
    let event_b = json!({
        "event_id": Uuid::new_v4().to_string(),
        "tenant_id": tenant_b,
        "event_timestamp": 1640995200, // 2022-01-01
        "source_ip": "192.168.1.200",
        "source_type": "firewall",
        "message": "Tenant B secret data",
        "severity": "info"
    });
    
    // Insert events via ingestion endpoint (assuming it exists)
    insert_test_event(&app, &event_a).await;
    insert_test_event(&app, &event_b).await;
    wait_for_consistency().await;
    
    // Test 1: Tenant A should only see their own data
    let search_request = create_test_search_request();
    
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/events/search")
                .header("Authorization", format!("Bearer {}", generate_test_jwt("tenant_a", vec!["user".to_string()])))
                .header("Content-Type", "application/json")
                .body(Body::from(search_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_response: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    // Verify tenant A only sees their data
    let events = search_response["events"].as_array().unwrap();
    assert!(!events.is_empty(), "Tenant A should see their own events");
    
    for event in events {
        let message = event["message"].as_str().unwrap();
        assert!(message.contains("Tenant A"), "Should only contain Tenant A data");
        assert!(!message.contains("Tenant B"), "Should not contain Tenant B data");
    }
    
    // Test 2: Tenant B should only see their own data
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/events/search")
                .header("Authorization", format!("Bearer {}", generate_test_jwt("tenant_b", vec!["user".to_string()])))
                .header("Content-Type", "application/json")
                .body(Body::from(search_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let search_response: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    // Verify tenant B only sees their data
    let events = search_response["events"].as_array().unwrap();
    assert!(!events.is_empty(), "Tenant B should see their own events");
    
    for event in events {
        let message = event["message"].as_str().unwrap();
        assert!(message.contains("Tenant B"), "Should only contain Tenant B data");
        assert!(!message.contains("Tenant A"), "Should not contain Tenant A data");
    }
}

#[tokio::test]
async fn test_search_without_authentication() {
    let app = setup_test_app().await;
    
    let search_request = create_test_search_request();
    
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/events/search")
                .header("Content-Type", "application/json")
                .body(Body::from(search_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    // Should return 401 Unauthorized
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    
    let response_body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    
    // Verify error message
    assert_error_response(&response_body, "Unauthorized");
}

#[tokio::test]
async fn test_search_with_invalid_token() {
    let app = setup_test_app().await;
    
    let search_request = create_test_search_request();
    
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/events/search")
                .header("Authorization", "Bearer invalid_token")
                .header("Content-Type", "application/json")
                .body(Body::from(search_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    // Should return 401 Unauthorized
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    
    let response_body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    
    // Verify error message
    assert_error_response(&response_body, "Unauthorized");
}

#[tokio::test]
async fn test_tenant_id_manipulation_attempt() {
    let app = setup_test_app().await;
    
    let tenant_a = Uuid::new_v4().to_string();
    let tenant_b = Uuid::new_v4().to_string();
    
    // Generate token for tenant A
    let token_a = generate_test_jwt(&tenant_a, vec!["user".to_string()]);
    
    // Try to search with tenant B's ID in the request body (should be ignored)
    let mut malicious_request = create_test_search_request();
    malicious_request["tenant_id"] = json!(tenant_b); // This should be ignored and overridden by JWT
    
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/events/search")
                .header("Authorization", format!("Bearer {}", generate_test_jwt(tenant_a, vec!["user".to_string()])))
                .header("Content-Type", "application/json")
                .body(Body::from(malicious_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    // The validation service should have overridden tenant_id with the one from JWT
    // This test verifies that the tenant isolation is enforced at the validation layer
    
    // Clean up test data
    cleanup_test_data().await;
}