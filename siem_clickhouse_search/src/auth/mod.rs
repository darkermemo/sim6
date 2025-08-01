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

// Future JWT implementation placeholder
#[cfg(not(feature = "dev-auth"))]
mod jwt_auth {
    use axum::{async_trait, extract::FromRequestParts, http::StatusCode};
    use axum::http::request::Parts;
    
    pub struct JwtAuth;
    
    #[async_trait]
    impl<S> FromRequestParts<S> for JwtAuth
    where
        S: Send + Sync,
    {
        type Rejection = StatusCode;
        
        async fn from_request_parts(_parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
            // TODO: Implement JWT validation
            Err(StatusCode::NOT_IMPLEMENTED)
        }
    }
}