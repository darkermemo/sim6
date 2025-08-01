//! Development token authentication extractor
//!
//! This module provides a simple, hard-coded token authentication mechanism
//! for development and testing purposes. It should only be used with the
//! "dev-auth" feature flag and never in production.

use axum::{async_trait, extract::FromRequestParts, http::StatusCode};
use axum::http::request::Parts;

/// Development admin authentication extractor
/// 
/// This extractor validates requests against a single, long-lived admin token
/// stored in the DEV_ADMIN_TOKEN environment variable. It expects the token
/// to be provided in the Authorization header as a Bearer token.
/// 
/// # Security Note
/// This is intended for development use only. The token never expires and
/// provides full admin access. Use only behind the "dev-auth" feature flag.
#[derive(Debug, Clone)]
pub struct DevAdmin;

#[async_trait]
impl<S> FromRequestParts<S> for DevAdmin
where
    S: Send + Sync,
{
    type Rejection = StatusCode;
    
    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        const BEARER_PREFIX: &str = "Bearer ";
        
        // Get the configured token from environment
        let cfg_token = match std::env::var("DEV_ADMIN_TOKEN") {
            Ok(token) => token,
            Err(_) => {
                tracing::error!("DEV_ADMIN_TOKEN environment variable not set");
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        };
        
        // Get the Authorization header
        let header = match parts.headers.get("authorization") {
            Some(h) => h,
            None => {
                tracing::debug!("Authorization header missing");
                return Err(StatusCode::UNAUTHORIZED);
            }
        };
        
        // Convert header to string
        let header_str = match header.to_str() {
            Ok(s) => s,
            Err(_) => {
                tracing::debug!("Authorization header contains invalid characters");
                return Err(StatusCode::UNAUTHORIZED);
            }
        };
        
        // Check if the header starts with "Bearer " and matches our token
        if let Some(token) = header_str.strip_prefix(BEARER_PREFIX) {
            if token == cfg_token {
                tracing::debug!("Dev admin token validated successfully");
                Ok(DevAdmin)
            } else {
                tracing::debug!("Invalid dev admin token provided");
                Err(StatusCode::UNAUTHORIZED)
            }
        } else {
            tracing::debug!("Authorization header does not start with 'Bearer '");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue, Method, Uri, Version, Request};
    use axum::body::Body;
    use std::env;
    
    fn create_test_request_with_headers(headers: HeaderMap) -> Request<Body> {
        let mut req = Request::builder()
            .method("GET")
            .uri("/test")
            .body(Body::empty())
            .unwrap();
        *req.headers_mut() = headers;
        req
    }
    
    #[tokio::test]
    async fn test_dev_admin_valid_token() {
        // Clean up any existing env var first
        env::remove_var("DEV_ADMIN_TOKEN");
        
        // Set up environment variable
        let test_token = "test-dev-admin-token-12345";
        env::set_var("DEV_ADMIN_TOKEN", test_token);
        
        // Create test request with valid Authorization header
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_str(&format!("Bearer {}", test_token)).unwrap(),
        );
        let req = create_test_request_with_headers(headers);
        let (mut parts, _) = req.into_parts();
        
        // Test extraction
        let result = DevAdmin::from_request_parts(&mut parts, &()).await;
        assert!(result.is_ok());
        
        // Clean up
        env::remove_var("DEV_ADMIN_TOKEN");
    }
    
    #[tokio::test]
    async fn test_dev_admin_invalid_token() {
        // Clean up any existing env var first
        env::remove_var("DEV_ADMIN_TOKEN");
        
        // Set up environment variable
        env::set_var("DEV_ADMIN_TOKEN", "correct-token");
        
        // Create test request with invalid Authorization header
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_str("Bearer wrong-token").unwrap(),
        );
        let req = create_test_request_with_headers(headers);
        let (mut parts, _) = req.into_parts();
        
        // Test extraction
        let result = DevAdmin::from_request_parts(&mut parts, &()).await;
        assert_eq!(result.unwrap_err(), StatusCode::UNAUTHORIZED);
        
        // Clean up
        env::remove_var("DEV_ADMIN_TOKEN");
    }
    
    #[tokio::test]
    async fn test_dev_admin_missing_header() {
        // Clean up any existing env var first
        env::remove_var("DEV_ADMIN_TOKEN");
        
        // Set up environment variable
        env::set_var("DEV_ADMIN_TOKEN", "test-token");
        
        // Create test request without Authorization header
        let headers = HeaderMap::new();
        let req = create_test_request_with_headers(headers);
        let (mut parts, _) = req.into_parts();
        
        // Test extraction
        let result = DevAdmin::from_request_parts(&mut parts, &()).await;
        assert_eq!(result.unwrap_err(), StatusCode::UNAUTHORIZED);
        
        // Clean up
        env::remove_var("DEV_ADMIN_TOKEN");
    }
    
    #[tokio::test]
    async fn test_dev_admin_missing_env_var() {
        // Ensure environment variable is not set
        env::remove_var("DEV_ADMIN_TOKEN");
        
        // Create test request
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_str("Bearer some-token").unwrap(),
        );
        let req = create_test_request_with_headers(headers);
        let (mut parts, _) = req.into_parts();
        
        // Test extraction
        let result = DevAdmin::from_request_parts(&mut parts, &()).await;
        assert_eq!(result.unwrap_err(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}