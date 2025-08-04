//! Authentication module for SIEM ClickHouse Search API
//!
//! This module provides authentication extractors for different environments:
//! - DevAdmin: Development-only hard-coded token authentication
//! - JwtAuth: Production JWT-based authentication (future implementation)

pub mod dev_token;

#[cfg(feature = "dev-auth")]
pub use dev_token::DevAdmin as Auth;

#[cfg(not(feature = "dev-auth"))]
pub use jwt_auth::JwtAuth as Auth;

// JWT authentication implementation
#[cfg(not(feature = "dev-auth"))]
mod jwt_auth {
    use axum::{async_trait, extract::FromRequestParts, http::StatusCode};
    use axum::http::request::Parts;
    use crate::security::{SecurityService, Claims};
    use std::sync::Arc;
    
    /// JWT authentication extractor
    /// 
    /// This extractor validates JWT tokens using the SecurityService.
    /// It expects the token to be provided in the Authorization header as a Bearer token.
    #[derive(Debug, Clone)]
    pub struct JwtAuth {
        pub claims: Claims,
    }
    
    #[async_trait]
    impl<S> FromRequestParts<S> for JwtAuth
    where
        S: Send + Sync,
    {
        type Rejection = StatusCode;
        
        async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
            const BEARER_PREFIX: &str = "Bearer ";
            
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
            
            // Extract token from Bearer header
            let token = match header_str.strip_prefix(BEARER_PREFIX) {
                Some(token) => token,
                None => {
                    tracing::debug!("Authorization header does not start with 'Bearer '");
                    return Err(StatusCode::UNAUTHORIZED);
                }
            };
            
            // Create SecurityService for token validation
            // Note: In a real implementation, this should be injected via state
            let config = Arc::new(crate::config::Config::default());
            let security_service = match SecurityService::new(config) {
                Ok(service) => service,
                Err(e) => {
                    tracing::error!("Failed to create SecurityService: {}", e);
                    return Err(StatusCode::INTERNAL_SERVER_ERROR);
                }
            };
            
            // Validate the JWT token
            match security_service.validate_request(&parts.headers).await {
                Ok(claims) => {
                    tracing::debug!("JWT token validated successfully for user: {}", claims.sub);
                    Ok(JwtAuth { claims })
                }
                Err(e) => {
                    tracing::debug!("JWT token validation failed: {}", e);
                    Err(StatusCode::UNAUTHORIZED)
                }
            }
        }
    }
}