//! Security module for JWT validation, tenant isolation, and rate limiting
//! Handles authentication, authorization, and security policies

use crate::config::Config;
use anyhow::{Context, Result};
use axum::http::HeaderMap;
use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, warn};
use uuid::Uuid;

/// JWT claims structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (user ID)
    pub sub: String,
    
    /// Tenant ID for multi-tenant isolation
    pub tenant_id: String,
    
    /// User roles/permissions
    pub roles: Vec<String>,
    
    /// Issued at timestamp
    pub iat: i64,
    
    /// Expiration timestamp (optional for permanent tokens)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exp: Option<i64>,
    
    /// Issuer
    pub iss: String,
    
    /// Audience
    pub aud: String,
    
    /// JWT ID
    pub jti: String,
    
    /// Custom claims
    pub custom: Option<HashMap<String, serde_json::Value>>,
}

/// Rate limiting entry
#[derive(Debug, Clone)]
struct RateLimitEntry {
    count: u32,
    window_start: DateTime<Utc>,
    last_request: DateTime<Utc>,
}

/// Security service for authentication and authorization
pub struct SecurityService {
    config: Arc<Config>,
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    validation: Validation,
    rate_limits: Arc<RwLock<HashMap<String, RateLimitEntry>>>,
    blocked_tokens: Arc<RwLock<HashMap<String, DateTime<Utc>>>>,
}

impl SecurityService {
    /// Create a new security service
    pub fn new(config: Arc<Config>) -> Result<Self> {
        let secret = config.security.jwt_secret.as_bytes();
        
        if secret.len() < 32 {
            return Err(anyhow::anyhow!("JWT secret must be at least 32 characters long"));
        }
        
        let encoding_key = EncodingKey::from_secret(secret);
        let decoding_key = DecodingKey::from_secret(secret);
        
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_audience(&["siem-search"]);
        validation.set_issuer(&["siem-auth"]);
        validation.validate_exp = false; // Allow tokens without expiration for permanent tokens
        validation.validate_nbf = false;
        validation.required_spec_claims.remove("exp"); // Remove exp from required claims
        
        Ok(Self {
            config,
            encoding_key,
            decoding_key,
            validation,
            rate_limits: Arc::new(RwLock::new(HashMap::new())),
            blocked_tokens: Arc::new(RwLock::new(HashMap::new())),
        })
    }
    
    /// Validate incoming request and extract claims
    pub async fn validate_request(&self, headers: &HeaderMap) -> Result<Claims> {
        // Extract JWT token from Authorization header
        let token = self.extract_token(headers)
            .context("Missing or invalid Authorization header")?;
        
        // Check if token is blocked
        if self.is_token_blocked(&token).await {
            return Err(anyhow::anyhow!("Token has been revoked"));
        }
        
        // Decode and validate JWT
        let claims = self.decode_token(&token)
            .context("Invalid JWT token")?;
        
        // Validate tenant access
        self.validate_tenant_access(&claims)
            .context("Tenant access denied")?;
        
        // Check rate limits
        self.check_rate_limit(&claims).await
            .context("Rate limit exceeded")?;
        
        debug!("Request validated for user: {}, tenant: {}", claims.sub, claims.tenant_id);
        
        Ok(claims)
    }
    
    /// Generate a new JWT token
    pub fn generate_token(
        &self,
        user_id: &str,
        tenant_id: &str,
        roles: Vec<String>,
        custom_claims: Option<HashMap<String, serde_json::Value>>,
    ) -> Result<String> {
        let now = Utc::now();
        
        // Set expiration only if token_expiration_secs > 0 (permanent tokens when 0)
        let exp = if self.config.security.token_expiration_secs > 0 {
            Some((now + Duration::seconds(self.config.security.token_expiration_secs as i64)).timestamp())
        } else {
            None // Permanent token - no expiration
        };
        
        let claims = Claims {
            sub: user_id.to_string(),
            tenant_id: tenant_id.to_string(),
            roles,
            iat: now.timestamp(),
            exp,
            iss: "siem-auth".to_string(),
            aud: "siem-search".to_string(),
            jti: Uuid::new_v4().to_string(),
            custom: custom_claims,
        };
        
        let header = Header::new(Algorithm::HS256);
        
        encode(&header, &claims, &self.encoding_key)
            .context("Failed to encode JWT token")
    }
    
    /// Revoke a JWT token
    pub async fn revoke_token(&self, token: &str) -> Result<()> {
        let claims = self.decode_token(token)
            .context("Invalid token for revocation")?;
        
        // For permanent tokens (no exp), use a far future date for cleanup
        let exp_time = if let Some(exp) = claims.exp {
            DateTime::from_timestamp(exp, 0)
                .unwrap_or_else(|| Utc::now() + Duration::hours(24))
        } else {
            // Permanent token - keep blocked for a very long time
            Utc::now() + Duration::days(365 * 10) // 10 years
        };
        
        let mut blocked = self.blocked_tokens.write().await;
        blocked.insert(claims.jti, exp_time);
        
        // Clean up expired blocked tokens
        let now = Utc::now();
        blocked.retain(|_, exp| *exp > now);
        
        Ok(())
    }
    
    /// Extract JWT token from Authorization header
    fn extract_token(&self, headers: &HeaderMap) -> Result<String> {
        let auth_header = headers.get("authorization")
            .ok_or_else(|| anyhow::anyhow!("Missing Authorization header"))?;
        
        let auth_str = auth_header.to_str()
            .context("Invalid Authorization header format")?;
        
        if !auth_str.starts_with("Bearer ") {
            return Err(anyhow::anyhow!("Authorization header must start with 'Bearer '"));
        }
        
        Ok(auth_str[7..].to_string())
    }
    
    /// Decode and validate JWT token
    fn decode_token(&self, token: &str) -> Result<Claims> {
        debug!("Attempting to decode JWT token with length: {}", token.len());
        debug!("Expected audience: {:?}", self.validation.aud);
        debug!("Expected issuer: {:?}", self.validation.iss);
        
        let token_data = decode::<Claims>(token, &self.decoding_key, &self.validation)
            .map_err(|e| {
                error!("JWT decode error: {:?}", e);
                anyhow::anyhow!("Failed to decode JWT token: {}", e)
            })?;
        
        debug!("Successfully decoded JWT token for user: {}", token_data.claims.sub);
        Ok(token_data.claims)
    }
    
    /// Check if token is in the blocked list
    async fn is_token_blocked(&self, token: &str) -> bool {
        if let Ok(claims) = self.decode_token(token) {
            let blocked = self.blocked_tokens.read().await;
            blocked.contains_key(&claims.jti)
        } else {
            false
        }
    }
    
    /// Validate tenant access permissions
    fn validate_tenant_access(&self, claims: &Claims) -> Result<()> {
        if !self.config.security.enable_tenant_isolation {
            return Ok(());
        }
        
        // Check if tenant is in allowed list (if configured)
        if !self.config.security.allowed_tenants.is_empty() {
            if !self.config.security.allowed_tenants.contains(&claims.tenant_id) {
                return Err(anyhow::anyhow!("Tenant '{}' is not allowed", claims.tenant_id));
            }
        }
        
        // Validate tenant ID format
        if claims.tenant_id.is_empty() {
            return Err(anyhow::anyhow!("Tenant ID cannot be empty"));
        }
        
        // Additional tenant validation rules can be added here
        if claims.tenant_id.len() > 64 {
            return Err(anyhow::anyhow!("Tenant ID too long"));
        }
        
        if !claims.tenant_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
            return Err(anyhow::anyhow!("Tenant ID contains invalid characters"));
        }
        
        Ok(())
    }
    
    /// Check rate limits for the user/tenant
    async fn check_rate_limit(&self, claims: &Claims) -> Result<()> {
        if !self.config.security.enable_rate_limiting {
            return Ok(());
        }
        
        let rate_limit_key = format!("{}:{}", claims.tenant_id, claims.sub);
        let now = Utc::now();
        let window_duration = Duration::minutes(1); // 1-minute window
        let max_requests = self.config.security.rate_limit_per_tenant;
        
        let mut rate_limits = self.rate_limits.write().await;
        
        let entry = rate_limits.entry(rate_limit_key.clone()).or_insert(RateLimitEntry {
            count: 0,
            window_start: now,
            last_request: now,
        });
        
        // Reset window if expired
        if now - entry.window_start > window_duration {
            entry.count = 0;
            entry.window_start = now;
        }
        
        // Check if rate limit exceeded
        if entry.count >= max_requests {
            warn!("Rate limit exceeded for {}", rate_limit_key);
            return Err(anyhow::anyhow!("Rate limit exceeded. Try again later."));
        }
        
        // Update counters
        entry.count += 1;
        entry.last_request = now;
        
        // Clean up old entries
        rate_limits.retain(|_, entry| now - entry.last_request < Duration::hours(1));
        
        Ok(())
    }
    
    /// Get rate limit status for a user/tenant
    pub async fn get_rate_limit_status(&self, claims: &Claims) -> RateLimitStatus {
        if !self.config.security.enable_rate_limiting {
            return RateLimitStatus {
                limit: 0,
                remaining: 0,
                reset_time: Utc::now(),
                enabled: false,
            };
        }
        
        let rate_limit_key = format!("{}:{}", claims.tenant_id, claims.sub);
        let rate_limits = self.rate_limits.read().await;
        
        if let Some(entry) = rate_limits.get(&rate_limit_key) {
            let window_duration = Duration::minutes(1);
            let reset_time = entry.window_start + window_duration;
            
            RateLimitStatus {
                limit: self.config.security.rate_limit_per_tenant,
                remaining: self.config.security.rate_limit_per_tenant.saturating_sub(entry.count),
                reset_time,
                enabled: true,
            }
        } else {
            RateLimitStatus {
                limit: self.config.security.rate_limit_per_tenant,
                remaining: self.config.security.rate_limit_per_tenant,
                reset_time: Utc::now() + Duration::minutes(1),
                enabled: true,
            }
        }
    }
    
    /// Validate user permissions for specific operations
    pub fn validate_permissions(&self, claims: &Claims, required_permission: &str) -> Result<()> {
        // Check if user has required role/permission
        if claims.roles.contains(&"admin".to_string()) {
            return Ok(()); // Admins have all permissions
        }
        
        match required_permission {
            "search:read" => {
                if claims.roles.contains(&"search_user".to_string()) ||
                   claims.roles.contains(&"analyst".to_string()) {
                    Ok(())
                } else {
                    Err(anyhow::anyhow!("Insufficient permissions for search operations"))
                }
            }
            "search:admin" => {
                if claims.roles.contains(&"search_admin".to_string()) {
                    Ok(())
                } else {
                    Err(anyhow::anyhow!("Insufficient permissions for admin operations"))
                }
            }
            "metrics:read" => {
                if claims.roles.contains(&"monitor".to_string()) ||
                   claims.roles.contains(&"analyst".to_string()) {
                    Ok(())
                } else {
                    Err(anyhow::anyhow!("Insufficient permissions for metrics access"))
                }
            }
            _ => Err(anyhow::anyhow!("Unknown permission: {}", required_permission))
        }
    }
    
    /// Generate API key for service-to-service authentication
    pub fn generate_api_key(&self, service_name: &str, tenant_id: &str) -> Result<String> {
        let claims = Claims {
            sub: format!("service:{}", service_name),
            tenant_id: tenant_id.to_string(),
            roles: vec!["service".to_string()],
            iat: Utc::now().timestamp(),
            exp: Some((Utc::now() + Duration::days(365)).timestamp()), // 1 year expiration
            iss: "siem-auth".to_string(),
            aud: "siem-search".to_string(),
            jti: Uuid::new_v4().to_string(),
            custom: Some({
                let mut custom = HashMap::new();
                custom.insert("service_name".to_string(), serde_json::Value::String(service_name.to_string()));
                custom.insert("api_key".to_string(), serde_json::Value::Bool(true));
                custom
            }),
        };
        
        let header = Header::new(Algorithm::HS256);
        
        encode(&header, &claims, &self.encoding_key)
            .context("Failed to encode API key")
    }
    
    /// Validate API key
    pub fn validate_api_key(&self, token: &str) -> Result<Claims> {
        let claims = self.decode_token(token)
            .context("Invalid API key")?;
        
        // Check if it's actually an API key
        if let Some(custom) = &claims.custom {
            if custom.get("api_key").and_then(|v| v.as_bool()).unwrap_or(false) {
                return Ok(claims);
            }
        }
        
        Err(anyhow::anyhow!("Token is not a valid API key"))
    }
    
    /// Get security metrics
    pub async fn get_security_metrics(&self) -> SecurityMetrics {
        let rate_limits = self.rate_limits.read().await;
        let blocked_tokens = self.blocked_tokens.read().await;
        
        SecurityMetrics {
            active_rate_limits: rate_limits.len() as u64,
            blocked_tokens: blocked_tokens.len() as u64,
            rate_limiting_enabled: self.config.security.enable_rate_limiting,
            tenant_isolation_enabled: self.config.security.enable_tenant_isolation,
            audit_logging_enabled: self.config.security.enable_audit_logging,
        }
    }
}

/// Rate limit status information
#[derive(Debug, Clone, Serialize)]
pub struct RateLimitStatus {
    pub limit: u32,
    pub remaining: u32,
    pub reset_time: DateTime<Utc>,
    pub enabled: bool,
}

/// Security metrics
#[derive(Debug, Clone, Serialize)]
pub struct SecurityMetrics {
    pub active_rate_limits: u64,
    pub blocked_tokens: u64,
    pub rate_limiting_enabled: bool,
    pub tenant_isolation_enabled: bool,
    pub audit_logging_enabled: bool,
}

/// Audit log entry
#[derive(Debug, Clone, Serialize)]
pub struct AuditLogEntry {
    pub timestamp: DateTime<Utc>,
    pub user_id: String,
    pub tenant_id: String,
    pub action: String,
    pub resource: String,
    pub result: AuditResult,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub details: Option<HashMap<String, serde_json::Value>>,
}

/// Audit result enumeration
#[derive(Debug, Clone, Serialize)]
pub enum AuditResult {
    Success,
    Failure,
    Denied,
}

/// Audit logger for security events
pub struct AuditLogger {
    config: Arc<Config>,
}

impl AuditLogger {
    pub fn new(config: Arc<Config>) -> Self {
        Self { config }
    }
    
    /// Log an audit event
    pub async fn log_event(&self, entry: AuditLogEntry) {
        if !self.config.security.enable_audit_logging {
            return;
        }
        
        // Log to structured logger
        match entry.result {
            AuditResult::Success => {
                debug!(
                    "AUDIT: {} performed {} on {} - SUCCESS",
                    entry.user_id, entry.action, entry.resource
                );
            }
            AuditResult::Failure => {
                warn!(
                    "AUDIT: {} attempted {} on {} - FAILURE",
                    entry.user_id, entry.action, entry.resource
                );
            }
            AuditResult::Denied => {
                warn!(
                    "AUDIT: {} denied {} on {} - ACCESS DENIED",
                    entry.user_id, entry.action, entry.resource
                );
            }
        }
        
        // TODO: Send to external audit system or database
        // This could be implemented to send audit logs to:
        // - Elasticsearch for centralized logging
        // - Database for compliance requirements
        // - External SIEM systems
        // - File-based audit logs
    }
    
    /// Log search operation
    pub async fn log_search(
        &self,
        claims: &Claims,
        query: Option<&str>,
        result: AuditResult,
        ip_address: Option<String>,
    ) {
        let entry = AuditLogEntry {
            timestamp: Utc::now(),
            user_id: claims.sub.clone(),
            tenant_id: claims.tenant_id.clone(),
            action: "search".to_string(),
            resource: "logs".to_string(),
            result,
            ip_address,
            user_agent: None,
            details: query.map(|q| {
                let mut details = HashMap::new();
                details.insert("query".to_string(), serde_json::Value::String(q.to_string()));
                details
            }),
        };
        
        self.log_event(entry).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::SecurityConfig;
    
    fn create_test_config() -> Config {
        let mut config = Config::default();
        config.security = SecurityConfig {
            enable_tenant_isolation: true,
            jwt_secret: "test-secret-key-that-is-long-enough-for-testing".to_string(),
            token_expiration_secs: 3600,
            enable_rate_limiting: true,
            rate_limit_per_tenant: 100,
            enable_audit_logging: true,
            allowed_tenants: vec![],
        };
        config
    }
    
    #[tokio::test]
    async fn test_token_generation_and_validation() {
        let config = Arc::new(create_test_config());
        let security_service = SecurityService::new(config).unwrap();
        
        // Generate token
        let token = security_service.generate_token(
            "user123",
            "tenant456",
            vec!["search_user".to_string()],
            None,
        ).unwrap();
        
        // Validate token
        let claims = security_service.decode_token(&token).unwrap();
        assert_eq!(claims.sub, "user123");
        assert_eq!(claims.tenant_id, "tenant456");
        assert!(claims.roles.contains(&"search_user".to_string()));
    }
    
    #[tokio::test]
    async fn test_rate_limiting() {
        let config = Arc::new(create_test_config());
        let security_service = SecurityService::new(config).unwrap();
        
        let claims = Claims {
            sub: "user123".to_string(),
            tenant_id: "tenant456".to_string(),
            roles: vec!["search_user".to_string()],
            iat: Utc::now().timestamp(),
            exp: Some((Utc::now() + Duration::hours(1)).timestamp()),
            iss: "siem-auth".to_string(),
            aud: "siem-search".to_string(),
            jti: Uuid::new_v4().to_string(),
            custom: None,
        };
        
        // First request should succeed
        assert!(security_service.check_rate_limit(&claims).await.is_ok());
        
        // Get rate limit status
        let status = security_service.get_rate_limit_status(&claims).await;
        assert_eq!(status.remaining, 99); // One request used
    }
}