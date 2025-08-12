use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use chrono::{Duration, Utc};
use uuid::Uuid;
use bcrypt::{hash, verify, DEFAULT_COST};
use anyhow::Result;
use tracing::{info, warn};
use axum::http::HeaderMap;
use totp_rs::{Algorithm as TotpAlgorithm, TOTP};
use base32;
use rand::Rng;
use base64::{engine::general_purpose, Engine as _};

use crate::models::{User, UserRole, UserSession};
use crate::error::PipelineError;

// Temporary stub for DatabaseManager until we implement proper database layer
#[derive(Clone, Debug)]
pub struct DatabaseManager;

impl DatabaseManager {
    pub fn new() -> Self {
        Self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,      // Subject (user ID)
    pub username: String, // Username
    pub role: UserRole,   // User role
    pub permissions: Vec<String>, // User permissions
    pub exp: i64,         // Expiration time
    pub iat: i64,         // Issued at
    pub jti: String,      // JWT ID (session ID)
}

#[derive(Debug, Clone)]
pub struct AuthConfig {
    pub jwt_secret: String,
    pub jwt_expiration_hours: i64,
    pub refresh_token_expiration_days: i64,
    pub max_failed_attempts: i32,
    pub account_lockout_duration_minutes: i64,
    pub password_min_length: usize,
    pub require_mfa: bool,
    pub session_timeout_minutes: i64,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            jwt_secret: "your-secret-key".to_string(),
            jwt_expiration_hours: 8,
            refresh_token_expiration_days: 30,
            max_failed_attempts: 5,
            account_lockout_duration_minutes: 30,
            password_min_length: 8,
            require_mfa: false,
            session_timeout_minutes: 480, // 8 hours
        }
    }
}

#[derive(Clone)]
pub struct AuthManager {
    config: AuthConfig,
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    db: DatabaseManager,
}

impl std::fmt::Debug for AuthManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthManager")
            .field("config", &self.config)
            .field("encoding_key", &"[REDACTED]")
            .field("decoding_key", &"[REDACTED]")
            .field("db", &self.db)
            .finish()
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
    pub mfa_code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub user: UserInfo,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct UserInfo {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub full_name: String,
    pub role: UserRole,
    pub permissions: Vec<String>,
    pub mfa_enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SetupMfaResponse {
    pub secret: String,
    pub qr_code_url: String,
    pub backup_codes: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct VerifyMfaRequest {
    pub code: String,
}

impl AuthManager {
    pub fn new(config: AuthConfig, db: DatabaseManager) -> Result<Self, PipelineError> {
        let encoding_key = EncodingKey::from_secret(config.jwt_secret.as_ref());
        let decoding_key = DecodingKey::from_secret(config.jwt_secret.as_ref());

        Ok(Self {
            config,
            encoding_key,
            decoding_key,
            db,
        })
    }

    pub async fn authenticate(
        &self,
        login_request: LoginRequest,
        ip_address: String,
        user_agent: String,
    ) -> Result<LoginResponse, PipelineError> {
        // Get user from database
        let user = self
            .db
            .get_user_by_username(&login_request.username)
            .await?
            .ok_or_else(|| PipelineError::authentication("Invalid credentials".to_string()))?;

        // Check if account is active
        if !user.is_active {
            return Err(PipelineError::authentication("Account is disabled".to_string()));
        }

        // Check if account is locked
        if user.is_account_locked() {
            return Err(PipelineError::authentication("Account is locked".to_string()));
        }

        // Verify password
        if !verify(&login_request.password, &user.password_hash)
            .map_err(|e| PipelineError::authentication(format!("Failed to verify password: {}", e)))?
        {
            // Increment failed login attempts
            self.handle_failed_login(&user).await?;
            return Err(PipelineError::authentication("Invalid credentials".to_string()));
        }

        // Check MFA if enabled
        if user.mfa_enabled {
            if let Some(mfa_code) = login_request.mfa_code {
                if !self.verify_mfa_code(&user, &mfa_code)? {
                    return Err(PipelineError::authentication("Invalid MFA code".to_string()));
                }
            } else {
                return Err(PipelineError::authentication("MFA code required".to_string()));
            }
        }

        // Reset failed login attempts on successful login
        self.reset_failed_login_attempts(&user).await?;

        // Update last login
        self.db.update_user_last_login(user.id).await?;

        // Generate tokens
        let session_id = Uuid::new_v4();
        let access_token = self.generate_access_token(&user, session_id)?;
        let refresh_token = self.generate_refresh_token();

        // Store session
        self.store_session(&user, session_id, &refresh_token, &ip_address, &user_agent)
            .await?;

        info!("User {} logged in successfully", user.username);

        Ok(LoginResponse {
            access_token,
            refresh_token,
            expires_in: self.config.jwt_expiration_hours * 3600,
            user: UserInfo {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                permissions: user.permissions,
                mfa_enabled: user.mfa_enabled,
            },
        })
    }

    pub async fn refresh_token(
        &self,
        refresh_request: RefreshTokenRequest,
    ) -> Result<LoginResponse, PipelineError> {
        // Validate refresh token and get session
        let session = self.validate_refresh_token(&refresh_request.refresh_token).await?;
        
        // Get user
        let user = self
            .db
            .get_user_by_id(session.user_id)
            .await?
            .ok_or_else(|| PipelineError::authentication("User not found".to_string()))?;

        // Check if user is still active
        if !user.is_active {
            return Err(PipelineError::authentication("Account is disabled".to_string()));
        }

        // Generate new tokens
        let new_session_id = Uuid::new_v4();
        let access_token = self.generate_access_token(&user, new_session_id)?;
        let new_refresh_token = self.generate_refresh_token();

        // Update session
        self.update_session(&session, new_session_id, &new_refresh_token).await?;

        Ok(LoginResponse {
            access_token,
            refresh_token: new_refresh_token,
            expires_in: self.config.jwt_expiration_hours * 3600,
            user: UserInfo {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                permissions: user.permissions,
                mfa_enabled: user.mfa_enabled,
            },
        })
    }

    pub fn validate_token(&self, token: &str) -> Result<Claims, PipelineError> {
        let validation = Validation::new(Algorithm::HS256);
        
        let token_data = decode::<Claims>(token, &self.decoding_key, &validation)
            .map_err(|e| PipelineError::authentication(format!("Failed to decode JWT token: {}", e)))?;

        Ok(token_data.claims)
    }

    pub fn extract_token_from_headers(&self, headers: &HeaderMap) -> Option<String> {
        headers
            .get("authorization")
            .and_then(|auth_header| auth_header.to_str().ok())
            .and_then(|auth_str| {
                 auth_str.strip_prefix("Bearer ").map(|stripped| stripped.to_string())
             })
    }

    pub async fn logout(&self, session_id: Uuid) -> Result<(), PipelineError> {
        self.invalidate_session(session_id).await?;
        info!("Session {} logged out", session_id);
        Ok(())
    }

    pub async fn change_password(
        &self,
        user_id: Uuid,
        change_request: ChangePasswordRequest,
    ) -> Result<(), PipelineError> {
        // Get user
        let user = self
            .db
            .get_user_by_id(user_id)
            .await?
            .ok_or_else(|| PipelineError::not_found("User not found".to_string()))?;

        // Verify current password
        if !verify(&change_request.current_password, &user.password_hash)
            .map_err(|e| PipelineError::authentication(format!("Failed to verify current password: {}", e)))?
        {
            return Err(PipelineError::authentication("Invalid current password".to_string()));
        }

        // Validate new password
        self.validate_password(&change_request.new_password)?;

        // Hash new password
        let new_password_hash = hash(&change_request.new_password, DEFAULT_COST)
            .map_err(|e| PipelineError::internal(format!("Failed to hash new password: {}", e)))?;

        // Update password in database
        self.db.update_user_password(user_id, &new_password_hash).await?;

        // Invalidate all sessions for this user
        self.invalidate_all_user_sessions(user_id).await?;

        info!("Password changed for user {}", user.username);
        Ok(())
    }

    pub async fn setup_mfa(&self, user_id: Uuid) -> Result<SetupMfaResponse, PipelineError> {
        let user = self
            .db
            .get_user_by_id(user_id)
            .await?
            .ok_or_else(|| PipelineError::not_found("User not found".to_string()))?;

        // Generate secret
        let secret = self.generate_mfa_secret();
        
        // Create TOTP
        let _totp = TOTP::new(
            TotpAlgorithm::SHA1,
            6,
            1,
            30,
            secret.as_bytes().to_vec(),
        ).map_err(|e| PipelineError::internal(format!("Failed to create TOTP: {}", e)))?;

        // Generate QR code URL
        let qr_code_url = format!(
            "otpauth://totp/{}?secret={}&issuer=SIEM",
            user.username,
            base32::encode(base32::Alphabet::RFC4648 { padding: true }, secret.as_bytes())
        );

        // Generate backup codes
        let backup_codes = self.generate_backup_codes();

        // Store MFA secret (temporarily, until verified)
        self.db.store_pending_mfa_secret(user_id, &secret, &backup_codes).await?;

        Ok(SetupMfaResponse {
            secret: base32::encode(base32::Alphabet::RFC4648 { padding: true }, secret.as_bytes()),
            qr_code_url,
            backup_codes,
        })
    }

    pub async fn verify_and_enable_mfa(
        &self,
        user_id: Uuid,
        verify_request: VerifyMfaRequest,
    ) -> Result<(), PipelineError> {
        // Get pending MFA setup
        let pending_mfa = self.db.get_pending_mfa_setup(user_id).await?
            .ok_or_else(|| PipelineError::bad_request("No pending MFA setup found".to_string()))?;

        // Verify the code
        if !self.verify_mfa_code_with_secret(&pending_mfa.secret, &verify_request.code)? {
            return Err(PipelineError::authentication("Invalid MFA code".to_string()));
        }

        // Enable MFA for user
        self.db.enable_mfa_for_user(user_id, &pending_mfa.secret, &pending_mfa.backup_codes).await?;

        // Clean up pending setup
        self.db.remove_pending_mfa_setup(user_id).await?;

        info!("MFA enabled for user {}", user_id);
        Ok(())
    }

    pub async fn disable_mfa(&self, user_id: Uuid) -> Result<(), PipelineError> {
        self.db.disable_mfa_for_user(user_id).await?;
        info!("MFA disabled for user {}", user_id);
        Ok(())
    }

    pub fn check_permission(&self, claims: &Claims, required_permission: &str) -> bool {
        // Admin has all permissions
        if matches!(claims.role, UserRole::Admin) {
            return true;
        }

        // Check specific permission
        claims.permissions.contains(&required_permission.to_string())
    }

    pub fn check_role(&self, claims: &Claims, required_roles: &[UserRole]) -> bool {
        required_roles.contains(&claims.role)
    }

    pub async fn get_user_sessions(&self, user_id: Uuid) -> Result<Vec<UserSession>, PipelineError> {
        self.db.get_active_sessions_for_user(user_id).await
    }

    pub async fn revoke_session(&self, session_id: Uuid) -> Result<(), PipelineError> {
        self.invalidate_session(session_id).await
    }

    // Private helper methods
    fn generate_access_token(&self, user: &User, session_id: Uuid) -> Result<String, PipelineError> {
        let now = Utc::now();
        let exp = now + Duration::hours(self.config.jwt_expiration_hours);

        let claims = Claims {
            sub: user.id.to_string(),
            username: user.username.clone(),
            role: user.role.clone(),
            permissions: user.permissions.clone(),
            exp: exp.timestamp(),
            iat: now.timestamp(),
            jti: session_id.to_string(),
        };

        encode(&Header::default(), &claims, &self.encoding_key)
            .map_err(|e| PipelineError::internal(format!("Failed to encode JWT token: {}", e)))
    }

    fn generate_refresh_token(&self) -> String {
        let mut rng = rand::thread_rng();
        let token: [u8; 32] = rng.gen();
        token.iter().map(|b| format!("{:02x}", b)).collect::<String>()
    }

    fn generate_mfa_secret(&self) -> String {
        let mut rng = rand::thread_rng();
        let secret: [u8; 20] = rng.gen();
        secret.iter().map(|b| format!("{:02x}", b)).collect::<String>()
    }

    fn generate_backup_codes(&self) -> Vec<String> {
        let mut rng = rand::thread_rng();
        (0..10)
            .map(|_| {
                format!("{:04}-{:04}", rng.gen_range(1000..9999), rng.gen_range(1000..9999))
            })
            .collect()
    }

    fn verify_mfa_code(&self, user: &User, code: &str) -> Result<bool, PipelineError> {
        if let Some(ref secret) = user.mfa_secret {
            self.verify_mfa_code_with_secret(secret, code)
        } else {
            Ok(false)
        }
    }

    fn verify_mfa_code_with_secret(&self, secret: &str, code: &str) -> Result<bool, PipelineError> {
        let secret_bytes = general_purpose::STANDARD.decode(secret)
            .map_err(|e| PipelineError::internal(format!("Failed to decode MFA secret: {}", e)))?;

        let totp = TOTP::new(
            TotpAlgorithm::SHA1,
            6,
            1,
            30,
            secret_bytes,
        ).map_err(|e| PipelineError::internal(format!("Failed to create TOTP for verification: {}", e)))?;

        Ok(totp.check_current(code).unwrap_or(false))
    }

    fn validate_password(&self, password: &str) -> Result<(), PipelineError> {
        if password.len() < self.config.password_min_length {
            return Err(PipelineError::bad_request(format!(
                "Password must be at least {} characters long",
                self.config.password_min_length
            )));
        }

        // Add more password validation rules as needed
        let has_uppercase = password.chars().any(|c| c.is_uppercase());
        let has_lowercase = password.chars().any(|c| c.is_lowercase());
        let has_digit = password.chars().any(|c| c.is_ascii_digit());
        let has_special = password.chars().any(|c| !c.is_alphanumeric());

        if !has_uppercase || !has_lowercase || !has_digit || !has_special {
            return Err(PipelineError::bad_request(
                "Password must contain uppercase, lowercase, digit, and special character".to_string(),
            ));
        }

        Ok(())
    }

    async fn handle_failed_login(&self, user: &User) -> Result<(), PipelineError> {
        let new_attempts = user.failed_login_attempts + 1;
        
        if new_attempts >= self.config.max_failed_attempts {
            let lockout_until = Utc::now() + Duration::minutes(self.config.account_lockout_duration_minutes);
            self.db.lock_user_account(user.id, lockout_until).await?;
            warn!("Account {} locked due to too many failed attempts", user.username);
        } else {
            self.db.increment_failed_login_attempts(user.id).await?;
        }

        Ok(())
    }

    async fn reset_failed_login_attempts(&self, user: &User) -> Result<(), PipelineError> {
        if user.failed_login_attempts > 0 {
            self.db.reset_failed_login_attempts(user.id).await?;
        }
        Ok(())
    }

    async fn store_session(
        &self,
        user: &User,
        session_id: Uuid,
        refresh_token: &str,
        ip_address: &str,
        user_agent: &str,
    ) -> Result<(), PipelineError> {
        let session = UserSession {
            id: session_id,
            user_id: user.id,
            session_token: session_id.to_string(),
            refresh_token: refresh_token.to_string(),
            ip_address: ip_address.to_string(),
            user_agent: user_agent.to_string(),
            expires_at: Utc::now() + Duration::days(self.config.refresh_token_expiration_days),
            created_at: Utc::now(),
            last_activity: Utc::now(),
        };

        self.db.insert_user_session(&session).await
    }

    async fn validate_refresh_token(&self, refresh_token: &str) -> Result<UserSession, PipelineError> {
        let session = self.db.get_session_by_refresh_token(refresh_token).await?
            .ok_or_else(|| PipelineError::authentication("Invalid refresh token".to_string()))?;

        if session.expires_at < Utc::now() {
            self.db.delete_session(session.id).await?;
            return Err(PipelineError::authentication("Refresh token expired".to_string()));
        }

        Ok(session)
    }

    async fn update_session(
        &self,
        session: &UserSession,
        new_session_id: Uuid,
        new_refresh_token: &str,
    ) -> Result<(), PipelineError> {
        self.db.update_session(
            session.id,
            new_session_id,
            new_refresh_token,
            Utc::now() + Duration::days(self.config.refresh_token_expiration_days),
        ).await
    }

    async fn invalidate_session(&self, session_id: Uuid) -> Result<(), PipelineError> {
        self.db.delete_session(session_id).await
    }

    async fn invalidate_all_user_sessions(&self, user_id: Uuid) -> Result<(), PipelineError> {
        self.db.delete_all_user_sessions(user_id).await
    }
}

// Permission constants
pub mod permissions {
    pub const VIEW_EVENTS: &str = "events:view";
    pub const CREATE_EVENTS: &str = "events:create";
    pub const UPDATE_EVENTS: &str = "events:update";
    pub const DELETE_EVENTS: &str = "events:delete";
    
    pub const VIEW_ALERTS: &str = "alerts:view";
    pub const CREATE_ALERTS: &str = "alerts:create";
    pub const UPDATE_ALERTS: &str = "alerts:update";
    pub const DELETE_ALERTS: &str = "alerts:delete";
    pub const ASSIGN_ALERTS: &str = "alerts:assign";
    
    pub const VIEW_RULES: &str = "rules:view";
    pub const CREATE_RULES: &str = "rules:create";
    pub const UPDATE_RULES: &str = "rules:update";
    pub const DELETE_RULES: &str = "rules:delete";
    
    pub const VIEW_USERS: &str = "users:view";
    pub const CREATE_USERS: &str = "users:create";
    pub const UPDATE_USERS: &str = "users:update";
    pub const DELETE_USERS: &str = "users:delete";
    
    pub const VIEW_SYSTEM: &str = "system:view";
    pub const MANAGE_SYSTEM: &str = "system:manage";
    pub const VIEW_AUDIT_LOGS: &str = "audit:view";
    
    pub const INVESTIGATE: &str = "investigate";
    pub const RESPOND: &str = "respond";
}

// Helper macros for authorization are defined in middleware.rs

// Default role permissions
impl UserRole {
    pub fn default_permissions(&self) -> Vec<String> {
        use permissions::*;
        
        match self {
            UserRole::Admin => vec![
                VIEW_EVENTS.to_string(),
                CREATE_EVENTS.to_string(),
                UPDATE_EVENTS.to_string(),
                DELETE_EVENTS.to_string(),
                VIEW_ALERTS.to_string(),
                CREATE_ALERTS.to_string(),
                UPDATE_ALERTS.to_string(),
                DELETE_ALERTS.to_string(),
                ASSIGN_ALERTS.to_string(),
                VIEW_RULES.to_string(),
                CREATE_RULES.to_string(),
                UPDATE_RULES.to_string(),
                DELETE_RULES.to_string(),
                VIEW_USERS.to_string(),
                CREATE_USERS.to_string(),
                UPDATE_USERS.to_string(),
                DELETE_USERS.to_string(),
                VIEW_SYSTEM.to_string(),
                MANAGE_SYSTEM.to_string(),
                VIEW_AUDIT_LOGS.to_string(),
                INVESTIGATE.to_string(),
                RESPOND.to_string(),
            ],
            UserRole::Analyst => vec![
                VIEW_EVENTS.to_string(),
                VIEW_ALERTS.to_string(),
                UPDATE_ALERTS.to_string(),
                ASSIGN_ALERTS.to_string(),
                VIEW_RULES.to_string(),
                CREATE_RULES.to_string(),
                UPDATE_RULES.to_string(),
                INVESTIGATE.to_string(),
                RESPOND.to_string(),
            ],
            UserRole::Investigator => vec![
                VIEW_EVENTS.to_string(),
                VIEW_ALERTS.to_string(),
                UPDATE_ALERTS.to_string(),
                INVESTIGATE.to_string(),
            ],
            UserRole::Viewer => vec![
                VIEW_EVENTS.to_string(),
                VIEW_ALERTS.to_string(),
            ],
            UserRole::ApiUser => vec![
                VIEW_EVENTS.to_string(),
                CREATE_EVENTS.to_string(),
                VIEW_ALERTS.to_string(),
            ],
            UserRole::SuperAdmin => vec![
                VIEW_EVENTS.to_string(),
                CREATE_EVENTS.to_string(),
                UPDATE_EVENTS.to_string(),
                DELETE_EVENTS.to_string(),
                VIEW_ALERTS.to_string(),
                CREATE_ALERTS.to_string(),
                UPDATE_ALERTS.to_string(),
                DELETE_ALERTS.to_string(),
                ASSIGN_ALERTS.to_string(),
                VIEW_RULES.to_string(),
                CREATE_RULES.to_string(),
                UPDATE_RULES.to_string(),
                DELETE_RULES.to_string(),
                VIEW_USERS.to_string(),
                CREATE_USERS.to_string(),
                UPDATE_USERS.to_string(),
                DELETE_USERS.to_string(),
                VIEW_SYSTEM.to_string(),
                MANAGE_SYSTEM.to_string(),
                VIEW_AUDIT_LOGS.to_string(),
                INVESTIGATE.to_string(),
                RESPOND.to_string(),
            ],
        }
    }
}