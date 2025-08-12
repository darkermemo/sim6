//! User-related models for authentication and authorization

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

/// User account information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub user_id: String,
    pub tenant_id: String,
    pub email: String,
    pub password_hash: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: Option<DateTime<Utc>>,
    pub mfa_secret: Option<String>,
    pub mfa_enabled: bool,
    pub failed_login_attempts: i32,
    pub locked_until: Option<DateTime<Utc>>,
    // Additional fields for auth compatibility
    pub id: Uuid,
    pub username: String,
    pub role: UserRole,
    pub permissions: Vec<String>,
}

impl User {
    /// Check if account is locked due to failed login attempts
    pub fn is_account_locked(&self) -> bool {
        if let Some(locked_until) = self.locked_until {
            locked_until > Utc::now()
        } else {
            false
        }
    }
}

/// User role enumeration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum UserRole {
    Admin,
    Analyst,
    Viewer,
    SuperAdmin,
    Investigator,
    ApiUser,
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserRole::Admin => write!(f, "Admin"),
            UserRole::Analyst => write!(f, "Analyst"),
            UserRole::Viewer => write!(f, "Viewer"),
            UserRole::SuperAdmin => write!(f, "SuperAdmin"),
            UserRole::Investigator => write!(f, "Investigator"),
            UserRole::ApiUser => write!(f, "ApiUser"),
        }
    }
}

/// User session information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub refresh_token: String,
    pub ip_address: String,
    pub user_agent: String,
    pub created_at: DateTime<Utc>,
    pub last_accessed_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub is_active: bool,
}

/// Role definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Role {
    pub role_id: String,
    pub role_name: String,
    pub description: String,
}

/// User role assignment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRoleAssignment {
    pub user_id: String,
    pub tenant_id: String,
    pub role_name: String,
}