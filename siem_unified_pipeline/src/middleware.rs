use axum::{
    extract::{Request, State},
    http::{HeaderValue, Method, StatusCode},
    middleware::Next,
    response::Response,
};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{warn, debug};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use tower_http::cors::{CorsLayer, Any};
use tower_http::trace::TraceLayer;
use tower::ServiceBuilder;

use crate::config::PipelineConfig;
use crate::error::{Result, PipelineError};
use crate::metrics::MetricsCollector;

// Rate limiting structures
#[derive(Debug, Clone)]
pub struct RateLimiter {
    requests: Arc<RwLock<HashMap<String, ClientRateLimit>>>,
    config: RateLimitConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub enabled: bool,
    pub requests_per_minute: u32,
    pub burst_size: u32,
    pub window_size_seconds: u64,
    pub whitelist: Vec<String>,
    pub blacklist: Vec<String>,
}

#[derive(Debug, Clone)]
struct ClientRateLimit {
    requests: Vec<Instant>,
    last_request: Instant,
    blocked_until: Option<Instant>,
}

// Authentication structures
#[derive(Debug, Clone)]
pub struct AuthConfig {
    pub enabled: bool,
    pub jwt_secret: String,
    pub token_expiry_hours: u64,
    pub require_auth_paths: Vec<String>,
    pub exempt_paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    pub iat: usize,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

// Request context
#[derive(Debug, Clone)]
pub struct RequestContext {
    pub request_id: String,
    pub start_time: Instant,
    pub client_ip: String,
    pub user_agent: Option<String>,
    pub authenticated_user: Option<String>,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

// Security headers configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    pub enabled: bool,
    pub hsts_max_age: u32,
    pub content_type_nosniff: bool,
    pub frame_options: String,
    pub xss_protection: bool,
    pub referrer_policy: String,
    pub csp_policy: Option<String>,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            requests_per_minute: 1000,
            burst_size: 100,
            window_size_seconds: 60,
            whitelist: vec!["127.0.0.1".to_string(), "::1".to_string()],
            blacklist: Vec::new(),
        }
    }
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            enabled: false, // Disabled by default for development
            jwt_secret: "your-secret-key".to_string(),
            token_expiry_hours: 24,
            require_auth_paths: vec![
                "/admin".to_string(),
                "/config".to_string(),
                "/pipeline".to_string(),
            ],
            exempt_paths: vec![
                "/health".to_string(),
                "/metrics".to_string(),
                "/version".to_string(),
            ],
        }
    }
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            hsts_max_age: 31536000, // 1 year
            content_type_nosniff: true,
            frame_options: "DENY".to_string(),
            xss_protection: true,
            referrer_policy: "strict-origin-when-cross-origin".to_string(),
            csp_policy: Some("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'".to_string()),
        }
    }
}

impl RateLimiter {
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            requests: Arc::new(RwLock::new(HashMap::new())),
            config,
        }
    }
    
    pub async fn check_rate_limit(&self, client_ip: &str) -> Result<bool> {
        if !self.config.enabled {
            return Ok(true);
        }
        
        // Check whitelist
        if self.config.whitelist.contains(&client_ip.to_string()) {
            return Ok(true);
        }
        
        // Check blacklist
        if self.config.blacklist.contains(&client_ip.to_string()) {
            return Ok(false);
        }
        
        let now = Instant::now();
        let mut requests = self.requests.write().await;
        
        let client_limit = requests.entry(client_ip.to_string()).or_insert_with(|| {
            ClientRateLimit {
                requests: Vec::new(),
                last_request: now,
                blocked_until: None,
            }
        });
        
        // Check if client is currently blocked
        if let Some(blocked_until) = client_limit.blocked_until {
            if now < blocked_until {
                return Ok(false);
            } else {
                client_limit.blocked_until = None;
            }
        }
        
        // Clean old requests outside the window
        let window_start = now - Duration::from_secs(self.config.window_size_seconds);
        client_limit.requests.retain(|&req_time| req_time > window_start);
        
        // Check if we're within the rate limit
        if client_limit.requests.len() >= self.config.requests_per_minute as usize {
            // Block the client for the remaining window time
            client_limit.blocked_until = Some(now + Duration::from_secs(self.config.window_size_seconds));
            warn!("Rate limit exceeded for client: {}", client_ip);
            return Ok(false);
        }
        
        // Add current request
        client_limit.requests.push(now);
        client_limit.last_request = now;
        
        Ok(true)
    }
    
    pub async fn get_rate_limit_info(&self, client_ip: &str) -> (u32, u32, u64) {
        let requests = self.requests.read().await;
        
        if let Some(client_limit) = requests.get(client_ip) {
            let remaining = self.config.requests_per_minute.saturating_sub(client_limit.requests.len() as u32);
            let reset_time = if let Some(blocked_until) = client_limit.blocked_until {
                blocked_until.duration_since(Instant::now()).as_secs()
            } else {
                self.config.window_size_seconds
            };
            
            (self.config.requests_per_minute, remaining, reset_time)
        } else {
            (self.config.requests_per_minute, self.config.requests_per_minute, self.config.window_size_seconds)
        }
    }
}

// Middleware functions
pub async fn request_id_middleware(mut request: Request, next: Next) -> Response {
    let request_id = Uuid::new_v4().to_string();
    
    // Add request ID to headers
    request.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(&request_id).unwrap(),
    );
    
    // Create a span for this request
    let span = tracing::info_span!(
        "request",
        request_id = %request_id,
        method = %request.method(),
        uri = %request.uri(),
    );
    
    
    
    span.in_scope(|| async move {
        next.run(request).await
    }).await
}

pub async fn rate_limiting_middleware(
    State(rate_limiter): State<Arc<RateLimiter>>,
    request: Request,
    next: Next,
) -> Result<Response> {
    let client_ip = extract_client_ip(&request);
    
    debug!("Rate limiting check for client: {}", client_ip);
    
    if !rate_limiter.check_rate_limit(&client_ip).await? {
        warn!("Rate limit exceeded for client: {}", client_ip);
        
        let (limit, remaining, reset) = rate_limiter.get_rate_limit_info(&client_ip).await;
        
        let response = Response::builder()
            .status(StatusCode::TOO_MANY_REQUESTS)
            .header("X-RateLimit-Limit", limit.to_string())
            .header("X-RateLimit-Remaining", remaining.to_string())
            .header("X-RateLimit-Reset", reset.to_string())
            .body("Rate limit exceeded".into())
            .unwrap();
        
        return Ok(response);
    }
    
    let mut response = next.run(request).await;
    
    // Add rate limit headers to successful responses
    let (limit, remaining, reset) = rate_limiter.get_rate_limit_info(&client_ip).await;
    response.headers_mut().insert("X-RateLimit-Limit", HeaderValue::from_str(&limit.to_string()).unwrap());
    response.headers_mut().insert("X-RateLimit-Remaining", HeaderValue::from_str(&remaining.to_string()).unwrap());
    response.headers_mut().insert("X-RateLimit-Reset", HeaderValue::from_str(&reset.to_string()).unwrap());
    
    Ok(response)
}

pub async fn authentication_middleware(
    State(auth_config): State<Arc<AuthConfig>>,
    mut request: Request,
    next: Next,
) -> Result<Response> {
    if !auth_config.enabled {
        return Ok(next.run(request).await);
    }
    
    let path = request.uri().path();
    
    // Check if path is exempt from authentication
    if auth_config.exempt_paths.iter().any(|exempt| path.starts_with(exempt)) {
        return Ok(next.run(request).await);
    }
    
    // Check if path requires authentication
    let requires_auth = auth_config.require_auth_paths.iter().any(|required| path.starts_with(required));
    
    if requires_auth {
        // Extract and validate JWT token
        let token = extract_bearer_token(&request)
            .ok_or_else(|| PipelineError::authentication("Missing or invalid authorization header"))?;
        
        let claims = validate_jwt_token(&token, &auth_config.jwt_secret)
            .map_err(|e| PipelineError::authentication(format!("Invalid token: {}", e)))?;
        
        // Add user context to request
        let context = RequestContext {
            request_id: extract_request_id(&request),
            start_time: Instant::now(),
            client_ip: extract_client_ip(&request),
            user_agent: extract_user_agent(&request),
            authenticated_user: Some(claims.sub.clone()),
            roles: claims.roles.clone(),
            permissions: claims.permissions.clone(),
        };
        
        // Store context in request extensions
        request.extensions_mut().insert(context);
        
        debug!("Authenticated user: {} with roles: {:?}", claims.sub, claims.roles);
    }
    
    Ok(next.run(request).await)
}

pub async fn security_headers_middleware(
    State(security_config): State<Arc<SecurityConfig>>,
    request: Request,
    next: Next,
) -> Response {
    let mut response = next.run(request).await;
    
    if !security_config.enabled {
        return response;
    }
    
    let headers = response.headers_mut();
    
    // HSTS (HTTP Strict Transport Security)
    headers.insert(
        "Strict-Transport-Security",
        HeaderValue::from_str(&format!("max-age={}", security_config.hsts_max_age)).unwrap(),
    );
    
    // Content Type Options
    if security_config.content_type_nosniff {
        headers.insert("X-Content-Type-Options", HeaderValue::from_static("nosniff"));
    }
    
    // Frame Options
    headers.insert(
        "X-Frame-Options",
        HeaderValue::from_str(&security_config.frame_options).unwrap(),
    );
    
    // XSS Protection
    if security_config.xss_protection {
        headers.insert("X-XSS-Protection", HeaderValue::from_static("1; mode=block"));
    }
    
    // Referrer Policy
    headers.insert(
        "Referrer-Policy",
        HeaderValue::from_str(&security_config.referrer_policy).unwrap(),
    );
    
    // Content Security Policy
    if let Some(ref csp_policy) = security_config.csp_policy {
        headers.insert(
            "Content-Security-Policy",
            HeaderValue::from_str(csp_policy).unwrap(),
        );
    }
    
    // Remove server information
    headers.remove("server");
    
    response
}

pub async fn logging_middleware(
    State(metrics): State<Arc<MetricsCollector>>,
    request: Request,
    next: Next,
) -> Response {
    let start_time = Instant::now();
    let method = request.method().clone();
    let uri = request.uri().clone();
    let client_ip = extract_client_ip(&request);
    let user_agent = extract_user_agent(&request);
    let request_id = extract_request_id(&request);
    
    debug!(
        "Incoming request: {} {} from {} ({})",
        method,
        uri,
        client_ip,
        request_id
    );
    
    let response = next.run(request).await;
    
    let duration = start_time.elapsed();
    let status = response.status();
    
    // Log the response
    if status.is_server_error() {
        tracing::error!(
            "Request completed: {} {} {} in {:.2}ms ({})",
            method,
            uri,
            status,
            duration.as_millis(),
            request_id
        );
    } else if status.is_client_error() {
        tracing::warn!(
            "Request completed: {} {} {} in {:.2}ms ({})",
            method,
            uri,
            status,
            duration.as_millis(),
            request_id
        );
    } else {
        tracing::info!(
            "Request completed: {} {} {} in {:.2}ms ({})",
            method,
            uri,
            status,
            duration.as_millis(),
            request_id
        );
    }
    
    // Record metrics
    if let Some(context) = response.extensions().get::<RequestContext>() {
        metrics.record_component_activity(
            "http_server",
            duration.as_millis() as f64,
            status.is_success(),
        ).await;
    }
    
    response
}

pub async fn cors_middleware(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    
    let headers = response.headers_mut();
    
    // Add CORS headers
    headers.insert("Access-Control-Allow-Origin", HeaderValue::from_static("*"));
    headers.insert(
        "Access-Control-Allow-Methods",
        HeaderValue::from_static("GET, POST, PUT, DELETE, OPTIONS"),
    );
    headers.insert(
        "Access-Control-Allow-Headers",
        HeaderValue::from_static("Content-Type, Authorization, X-Request-ID"),
    );
    headers.insert("Access-Control-Max-Age", HeaderValue::from_static("86400"));
    
    response
}

// Helper functions
fn extract_client_ip(request: &Request) -> String {
    // Try to get real IP from various headers
    let headers = request.headers();
    
    if let Some(forwarded_for) = headers.get("x-forwarded-for") {
        if let Ok(forwarded_str) = forwarded_for.to_str() {
            if let Some(first_ip) = forwarded_str.split(',').next() {
                return first_ip.trim().to_string();
            }
        }
    }
    
    if let Some(real_ip) = headers.get("x-real-ip") {
        if let Ok(real_ip_str) = real_ip.to_str() {
            return real_ip_str.to_string();
        }
    }
    
    // Fallback to connection info (would need to be passed through extensions)
    "unknown".to_string()
}

fn extract_user_agent(request: &Request) -> Option<String> {
    request
        .headers()
        .get("user-agent")
        .and_then(|ua| ua.to_str().ok())
        .map(|s| s.to_string())
}

fn extract_request_id(request: &Request) -> String {
    request
        .headers()
        .get("x-request-id")
        .and_then(|id| id.to_str().ok())
        .unwrap_or("unknown")
        .to_string()
}

fn extract_bearer_token(request: &Request) -> Option<String> {
    request
        .headers()
        .get("authorization")
        .and_then(|auth| auth.to_str().ok())
        .and_then(|auth_str| {
            if auth_str.starts_with("Bearer ") {
                Some(auth_str[7..].to_string())
            } else {
                None
            }
        })
}

fn validate_jwt_token(token: &str, secret: &str) -> Result<Claims> {
    use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
    
    let key = DecodingKey::from_secret(secret.as_ref());
    let validation = Validation::new(Algorithm::HS256);
    
    match decode::<Claims>(token, &key, &validation) {
        Ok(token_data) => Ok(token_data.claims),
        Err(e) => Err(PipelineError::authentication(format!("JWT validation failed: {}", e))),
    }
}

// Middleware layer builder
pub fn create_middleware_stack(
    _config: &PipelineConfig,
    _metrics: Arc<MetricsCollector>,
) -> impl tower::Layer<axum::routing::Router> + Clone {
    // Simplified middleware stack for now
    ServiceBuilder::new()
        .layer(CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
            .allow_headers(Any)
        )
        .layer(TraceLayer::new_for_http())
        .into_inner()
}

// Request context extension methods
impl RequestContext {
    pub fn from_request(request: &Request) -> Self {
        Self {
            request_id: extract_request_id(request),
            start_time: Instant::now(),
            client_ip: extract_client_ip(request),
            user_agent: extract_user_agent(request),
            authenticated_user: None,
            roles: Vec::new(),
            permissions: Vec::new(),
        }
    }
    
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.contains(&role.to_string())
    }
    
    pub fn has_permission(&self, permission: &str) -> bool {
        self.permissions.contains(&permission.to_string())
    }
    
    pub fn is_authenticated(&self) -> bool {
        self.authenticated_user.is_some()
    }
    
    pub fn elapsed(&self) -> Duration {
        self.start_time.elapsed()
    }
}

// Utility macros for authorization checks
#[macro_export]
macro_rules! require_auth {
    ($request:expr) => {
        match $request.extensions().get::<RequestContext>() {
            Some(ctx) if ctx.is_authenticated() => ctx,
            _ => return Err(PipelineError::authentication("Authentication required")),
        }
    };
}

#[macro_export]
macro_rules! require_role {
    ($request:expr, $role:expr) => {
        match $request.extensions().get::<RequestContext>() {
            Some(ctx) if ctx.has_role($role) => ctx,
            Some(_) => return Err(PipelineError::authorization("Insufficient permissions")),
            None => return Err(PipelineError::authentication("Authentication required")),
        }
    };
}

#[macro_export]
macro_rules! require_permission {
    ($request:expr, $permission:expr) => {
        match $request.extensions().get::<RequestContext>() {
            Some(ctx) if ctx.has_permission($permission) => ctx,
            Some(_) => return Err(PipelineError::authorization("Insufficient permissions")),
            None => return Err(PipelineError::authentication("Authentication required")),
        }
    };
}