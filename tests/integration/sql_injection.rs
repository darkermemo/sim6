//! Integration tests for SQL injection prevention

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

mod common;
use common::{
    setup_test_app, generate_test_jwt, cleanup_test_data,
    assert_error_response, create_test_search_request,
};

#[tokio::test]
async fn test_sql_injection_in_search_query() {
    let app = setup_test_app().await;
    
    let tenant_id = Uuid::new_v4().to_string();
    let token = generate_test_jwt(&tenant_id, vec!["user".to_string()]);
    
    // Test various SQL injection attempts in the search query
    let injection_attempts = vec![
        "test' OR 1=1 --",
        "test'; DROP TABLE events; --",
        "test' UNION SELECT * FROM events --",
        "test'; INSERT INTO events VALUES ('malicious'); --",
        "test' OR 'a'='a",
        "test'; UPDATE events SET message='hacked'; --",
        "test' OR tenant_id != tenant_id --",
        "'; SELECT * FROM information_schema.tables; --",
        "test' AND (SELECT COUNT(*) FROM events) > 0 --",
        "test'; EXEC xp_cmdshell('dir'); --",
    ];
    
    for injection_query in injection_attempts {
        let mut search_request = create_test_search_request();
        search_request["query"] = json!(injection_query);
        
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/events/search")
                    .header("Authorization", format!("Bearer {}", token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(search_request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        
        // Should return 400 Bad Request due to validation error
        assert_eq!(
            response.status(),
            StatusCode::BAD_REQUEST,
            "SQL injection attempt should be blocked: {}",
            injection_query
        );
        
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        
        // Verify error message indicates validation failure
        assert_error_response(&body, "validation");
    }
    
    cleanup_test_data().await;
}

#[tokio::test]
async fn test_sql_injection_in_filters() {
    let app = setup_test_app().await;
    
    let tenant_id = Uuid::new_v4().to_string();
    let token = generate_test_jwt(&tenant_id, vec!["user".to_string()]);
    
    // Test SQL injection in filter values
    let malicious_filters = vec![
        ("severity", "info' OR '1'='1"),
        ("source_type", "firewall'; DROP TABLE events; --"),
        ("severity", "critical' UNION SELECT password FROM users --"),
    ];
    
    for (filter_field, malicious_value) in malicious_filters {
        let mut filters = json!({});
        filters[filter_field] = json!({
            "eq": malicious_value
        });
        
        let mut search_request = create_test_search_request();
        search_request["query"] = json!("test");
        search_request["filters"] = filters;
        
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/events/search")
                    .header("Authorization", format!("Bearer {}", token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(search_request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        
        // Should return 400 Bad Request due to validation error
        assert_eq!(
            response.status(),
            StatusCode::BAD_REQUEST,
            "SQL injection in {} filter should be blocked: {}",
            filter_field,
            malicious_value
        );
        
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_error_response(&body, "validation");
    }
    
    cleanup_test_data().await;
}

#[tokio::test]
async fn test_legitimate_search_queries_pass() {
    let app = setup_test_app().await;
    
    let tenant_id = Uuid::new_v4().to_string();
    let token = generate_test_jwt(&tenant_id, vec!["user".to_string()]);
    
    // Test legitimate search queries that should pass validation
    let legitimate_queries = vec![
        "error",
        "192.168.1.1",
        "user login",
        "firewall blocked",
        "authentication failed",
        "connection timeout",
        "file.txt",
        "process.exe",
        "http://example.com",
        "user@domain.com",
    ];
    
    for query in legitimate_queries {
        let mut search_request = create_test_search_request();
        search_request["query"] = json!(query);
        
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/events/search")
                    .header("Authorization", format!("Bearer {}", token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(search_request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        
        // Should succeed (200 OK) or return empty results, but not validation error
        assert!(
            response.status() == StatusCode::OK,
            "Legitimate query should pass validation: {}",
            query
        );
    }
    
    cleanup_test_data().await;
}

#[tokio::test]
async fn test_query_length_validation() {
    let app = setup_test_app().await;
    
    let tenant_id = Uuid::new_v4().to_string();
    let token = generate_test_jwt(&tenant_id, vec!["user".to_string()]);
    
    // Test query that exceeds maximum length (256 characters)
    let long_query = "a".repeat(300);
    
    let mut search_request = create_test_search_request();
    search_request["query"] = json!(long_query);
    
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/events/search")
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(search_request.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    // Should return 400 Bad Request due to query length validation
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    assert_error_response(&body, "length");
    
    cleanup_test_data().await;
}

#[tokio::test]
async fn test_special_characters_validation() {
    let app = setup_test_app().await;
    
    let tenant_id = Uuid::new_v4().to_string();
    let token = generate_test_jwt(&tenant_id, vec!["user".to_string()]);
    
    // Test queries with dangerous special characters
    let dangerous_queries = vec![
        "test;",
        "test--comment",
        "test/*comment*/",
        "test\x00null",
        "test\r\nCRLF",
        "test<script>",
        "test&lt;script&gt;",
    ];
    
    for query in dangerous_queries {
        let mut search_request = create_test_search_request();
        search_request["query"] = json!(query);
        
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/events/search")
                    .header("Authorization", format!("Bearer {}", token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(search_request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        
        // Should return 400 Bad Request due to dangerous characters
        assert_eq!(
            response.status(),
            StatusCode::BAD_REQUEST,
            "Query with dangerous characters should be blocked: {}",
            query
        );
        
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_error_response(&body, "validation");
    }
    
    cleanup_test_data().await;
}