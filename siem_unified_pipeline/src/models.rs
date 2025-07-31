use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use uuid::Uuid;
use sqlx::FromRow;
use validator::{Validate, ValidationError};

// Core event models
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Validate)]
#[serde(rename_all = "snake_case")]
pub struct Event {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    #[validate(length(min = 1, max = 255))]
    pub source: String,
    #[validate(length(min = 1, max = 100))]
    pub source_type: String,
    #[validate(length(min = 1, max = 50))]
    pub severity: String,
    #[validate(length(min = 1, max = 50))]
    pub facility: String,
    #[validate(length(min = 1, max = 255))]
    pub hostname: String,
    #[validate(length(min = 1, max = 255))]
    pub process: String,
    #[validate(length(min = 1))]
    pub message: String,
    pub raw_message: String,
    pub source_ip: String,
    #[validate(range(min = 0, max = 65535))]
    pub source_port: i32,
    #[validate(length(min = 1, max = 20))]
    pub protocol: String,
    pub tags: Vec<String>,
    pub fields: serde_json::Value,
    pub processing_stage: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EventMetadata {
    pub event_id: Uuid,
    pub enrichment_data: HashMap<String, serde_json::Value>,
    pub geo_location: Option<GeoLocation>,
    pub threat_intel: Option<ThreatIntelligence>,
    pub asset_info: Option<AssetInfo>,
    pub user_info: Option<UserInfo>,
    pub correlation_id: Option<Uuid>,
    pub parent_event_id: Option<Uuid>,
    pub child_event_ids: Vec<Uuid>,
    pub processing_time_ms: f64,
    pub quality_score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct GeoLocation {
    pub country: Option<String>,
    pub country_code: Option<String>,
    pub region: Option<String>,
    pub city: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub timezone: Option<String>,
    pub isp: Option<String>,
    pub organization: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct ThreatIntelligence {
    pub is_malicious: bool,
    pub threat_type: Option<String>,
    pub confidence_score: f32,
    pub source: String,
    pub indicators: Vec<String>,
    pub mitre_tactics: Vec<String>,
    pub mitre_techniques: Vec<String>,
    pub severity_score: f32,
    pub last_seen: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct AssetInfo {
    pub asset_id: String,
    pub asset_name: String,
    pub asset_type: String,
    pub owner: String,
    pub department: String,
    pub criticality: String,
    pub operating_system: Option<String>,
    pub software_inventory: Vec<String>,
    pub network_segment: String,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct UserInfo {
    pub user_id: String,
    pub username: String,
    pub email: String,
    pub full_name: String,
    pub department: String,
    pub role: String,
    pub privileges: Vec<String>,
    pub is_privileged: bool,
    pub last_login: Option<DateTime<Utc>>,
    pub account_status: String,
}

// Alert models
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Validate)]
#[serde(rename_all = "snake_case")]
pub struct Alert {
    pub id: Uuid,
    #[validate(length(min = 1, max = 255))]
    pub title: String,
    pub description: String,
    #[validate(custom = "validate_severity")]
    pub severity: AlertSeverity,
    pub status: AlertStatus,
    #[validate(length(min = 1, max = 100))]
    pub rule_name: String,
    pub rule_id: Uuid,
    pub event_ids: Vec<Uuid>,
    pub source_events_count: i32,
    pub mitre_tactics: Vec<String>,
    pub mitre_techniques: Vec<String>,
    pub indicators: Vec<String>,
    pub affected_assets: Vec<String>,
    pub affected_users: Vec<String>,
    pub confidence_score: f32,
    pub risk_score: f32,
    pub false_positive_probability: f32,
    pub assigned_to: Option<String>,
    pub escalation_level: i32,
    pub sla_deadline: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolution_notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "alert_severity", rename_all = "lowercase")]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum AlertSeverity {
    Critical,
    High,
    Medium,
    Low,
    #[default]
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "alert_status", rename_all = "lowercase")]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum AlertStatus {
    #[default]
    Open,
    InProgress,
    Resolved,
    Closed,
    FalsePositive,
    Suppressed,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct AlertComment {
    pub id: Uuid,
    pub alert_id: Uuid,
    pub user_id: String,
    pub comment: String,
    pub comment_type: CommentType,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "comment_type", rename_all = "lowercase")]
#[serde(rename_all = "snake_case")]
pub enum CommentType {
    Note,
    Investigation,
    Resolution,
    Escalation,
    System,
}

// Detection rule models
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Validate)]
#[serde(rename_all = "snake_case")]
pub struct DetectionRule {
    pub id: Uuid,
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub description: String,
    #[validate(custom = "validate_severity")]
    pub severity: AlertSeverity,
    pub rule_type: RuleType,
    pub query: String,
    pub conditions: serde_json::Value,
    pub enabled: bool,
    pub author: String,
    pub version: String,
    pub mitre_tactics: Vec<String>,
    pub mitre_techniques: Vec<String>,
    pub tags: Vec<String>,
    pub references: Vec<String>,
    pub false_positive_rate: f32,
    pub last_triggered: Option<DateTime<Utc>>,
    pub trigger_count: i64,
    pub suppression_rules: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "rule_type", rename_all = "lowercase")]
#[serde(rename_all = "snake_case")]
pub enum RuleType {
    Sigma,
    Yara,
    Custom,
    Correlation,
    Statistical,
    MachineLearning,
}

// User and authentication models
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Validate)]
#[serde(rename_all = "snake_case")]
pub struct User {
    pub id: Uuid,
    #[validate(length(min = 3, max = 50))]
    pub username: String,
    #[validate(email)]
    pub email: String,
    pub password_hash: String,
    #[validate(length(min = 1, max = 100))]
    pub full_name: String,
    pub department: String,
    pub role: UserRole,
    pub permissions: Vec<String>,
    pub is_active: bool,
    pub last_login: Option<DateTime<Utc>>,
    pub failed_login_attempts: i32,
    pub account_locked_until: Option<DateTime<Utc>>,
    pub password_changed_at: DateTime<Utc>,
    pub mfa_enabled: bool,
    pub mfa_secret: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, sqlx::Type)]
#[sqlx(type_name = "user_role", rename_all = "lowercase")]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum UserRole {
    Admin,
    Analyst,
    Investigator,
    #[default]
    Viewer,
    ApiUser,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct UserSession {
    pub id: Uuid,
    pub user_id: Uuid,
    pub session_token: String,
    pub refresh_token: String,
    pub ip_address: String,
    pub user_agent: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub last_activity: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct PendingMfaSetup {
    pub user_id: Uuid,
    pub secret: String,
    pub backup_codes: Vec<String>,
    pub created_at: DateTime<Utc>,
}

// Configuration models
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Validate)]
#[serde(rename_all = "snake_case")]
pub struct DataSource {
    pub id: Uuid,
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub description: String,
    pub source_type: DataSourceType,
    pub connection_config: serde_json::Value,
    pub parsing_config: serde_json::Value,
    pub enabled: bool,
    pub health_status: HealthStatus,
    pub last_health_check: DateTime<Utc>,
    pub events_per_second: f64,
    pub total_events_processed: i64,
    pub error_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "data_source_type", rename_all = "lowercase")]
#[serde(rename_all = "snake_case")]
pub enum DataSourceType {
    Syslog,
    File,
    Http,
    Kafka,
    Tcp,
    Udp,
    Database,
    Api,
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "health_status", rename_all = "lowercase")]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct Destination {
    pub id: Uuid,
    pub name: String,
    pub destination_type: DestinationType,
    pub connection_config: serde_json::Value,
    pub enabled: bool,
    pub health_status: HealthStatus,
    pub last_health_check: DateTime<Utc>,
    pub events_stored: i64,
    pub storage_rate_per_second: f64,
    pub error_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "destination_type", rename_all = "lowercase")]
#[serde(rename_all = "snake_case")]
pub enum DestinationType {
    ClickHouse,
    Kafka,
    File,
    S3,
    Database,
}

// Audit and compliance models
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct AuditLog {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub action: String,
    pub resource_type: String,
    pub resource_id: Option<String>,
    pub details: serde_json::Value,
    pub ip_address: String,
    pub user_agent: String,
    pub success: bool,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "snake_case")]
pub struct ComplianceReport {
    pub id: Uuid,
    pub report_type: String,
    pub framework: String, // e.g., "SOX", "PCI-DSS", "GDPR"
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub status: ReportStatus,
    pub findings: serde_json::Value,
    pub recommendations: Vec<String>,
    pub generated_by: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "report_status", rename_all = "lowercase")]
#[serde(rename_all = "snake_case")]
pub enum ReportStatus {
    Draft,
    InReview,
    Approved,
    Published,
}

// Statistics and metrics models
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EventStatistics {
    pub total_events: i64,
    pub events_by_severity: HashMap<String, i64>,
    pub events_by_source: HashMap<String, i64>,
    pub events_by_hour: Vec<(DateTime<Utc>, i64)>,
    pub top_sources: Vec<(String, i64)>,
    pub top_destinations: Vec<(String, i64)>,
    pub processing_rate: f64,
    pub error_rate: f64,
    pub average_processing_time: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AlertStatistics {
    pub total_alerts: i64,
    pub open_alerts: i64,
    pub alerts_by_severity: HashMap<String, i64>,
    pub alerts_by_status: HashMap<String, i64>,
    pub mean_time_to_detection: f64,
    pub mean_time_to_response: f64,
    pub false_positive_rate: f64,
    pub top_triggered_rules: Vec<(String, i64)>,
    pub escalated_alerts: i64,
}

// Search and query models
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "snake_case")]
pub struct SearchQuery {
    #[validate(length(min = 1))]
    pub query: String,
    pub filters: HashMap<String, serde_json::Value>,
    pub time_range: TimeRange,
    pub sort_by: Option<String>,
    pub sort_order: SortOrder,
    #[validate(range(min = 1, max = 10000))]
    pub limit: u32,
    #[validate(range(min = 0))]
    pub offset: u32,
    pub include_metadata: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TimeRange {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum SortOrder {
    Asc,
    #[default]
    Desc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SearchResult<T> {
    pub items: Vec<T>,
    pub total_count: i64,
    pub page_info: PageInfo,
    pub aggregations: Option<HashMap<String, serde_json::Value>>,
    pub query_time_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PageInfo {
    pub current_page: u32,
    pub total_pages: u32,
    pub page_size: u32,
    pub has_next: bool,
    pub has_previous: bool,
}

// Validation functions
fn validate_severity(severity: &AlertSeverity) -> Result<(), ValidationError> {
    match severity {
        AlertSeverity::Critical | AlertSeverity::High | AlertSeverity::Medium | AlertSeverity::Low | AlertSeverity::Info => Ok(()),
    }
}

// Implementation blocks for common operations
impl Event {
    pub fn new(
        source: String,
        source_type: String,
        message: String,
        raw_message: String,
        source_ip: String,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source,
            source_type,
            severity: "info".to_string(),
            facility: "user".to_string(),
            hostname: "unknown".to_string(),
            process: "unknown".to_string(),
            message,
            raw_message,
            source_ip,
            source_port: 0,
            protocol: "unknown".to_string(),
            tags: Vec::new(),
            fields: serde_json::Value::Object(serde_json::Map::new()),
            processing_stage: "ingested".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
    
    pub fn add_tag(&mut self, tag: String) {
        if !self.tags.contains(&tag) {
            self.tags.push(tag);
        }
    }
    
    pub fn set_field(&mut self, key: &str, value: serde_json::Value) {
        if let serde_json::Value::Object(ref mut map) = self.fields {
            map.insert(key.to_string(), value);
        }
    }
    
    pub fn get_field(&self, key: &str) -> Option<&serde_json::Value> {
        if let serde_json::Value::Object(ref map) = self.fields {
            map.get(key)
        } else {
            None
        }
    }
}

impl Alert {
    pub fn new(
        title: String,
        description: String,
        severity: AlertSeverity,
        rule_name: String,
        rule_id: Uuid,
        event_ids: Vec<Uuid>,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            title,
            description,
            severity,
            status: AlertStatus::Open,
            rule_name,
            rule_id,
            event_ids,
            source_events_count: 0,
            mitre_tactics: Vec::new(),
            mitre_techniques: Vec::new(),
            indicators: Vec::new(),
            affected_assets: Vec::new(),
            affected_users: Vec::new(),
            confidence_score: 0.0,
            risk_score: 0.0,
            false_positive_probability: 0.0,
            assigned_to: None,
            escalation_level: 0,
            sla_deadline: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            resolved_at: None,
            resolution_notes: None,
        }
    }
    
    pub fn is_critical(&self) -> bool {
        matches!(self.severity, AlertSeverity::Critical)
    }
    
    pub fn is_open(&self) -> bool {
        matches!(self.status, AlertStatus::Open | AlertStatus::InProgress)
    }
    
    pub fn resolve(&mut self, notes: Option<String>) {
        self.status = AlertStatus::Resolved;
        self.resolved_at = Some(Utc::now());
        self.resolution_notes = notes;
        self.updated_at = Utc::now();
    }
}

impl User {
    pub fn new(username: String, email: String, full_name: String, role: UserRole) -> Self {
        Self {
            id: Uuid::new_v4(),
            username,
            email,
            password_hash: String::new(), // Should be set separately
            full_name,
            department: String::new(),
            role,
            permissions: Vec::new(),
            is_active: true,
            last_login: None,
            failed_login_attempts: 0,
            account_locked_until: None,
            password_changed_at: Utc::now(),
            mfa_enabled: false,
            mfa_secret: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
    
    pub fn is_admin(&self) -> bool {
        matches!(self.role, UserRole::Admin)
    }
    
    pub fn can_investigate(&self) -> bool {
        matches!(self.role, UserRole::Admin | UserRole::Analyst | UserRole::Investigator)
    }
    
    pub fn is_account_locked(&self) -> bool {
        if let Some(locked_until) = self.account_locked_until {
            Utc::now() < locked_until
        } else {
            false
        }
    }
}

// Display implementations for enums
impl std::fmt::Display for AlertSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AlertSeverity::Critical => write!(f, "critical"),
            AlertSeverity::High => write!(f, "high"),
            AlertSeverity::Medium => write!(f, "medium"),
            AlertSeverity::Low => write!(f, "low"),
            AlertSeverity::Info => write!(f, "info"),
        }
    }
}

impl std::fmt::Display for AlertStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AlertStatus::Open => write!(f, "open"),
            AlertStatus::InProgress => write!(f, "in_progress"),
            AlertStatus::Resolved => write!(f, "resolved"),
            AlertStatus::Closed => write!(f, "closed"),
            AlertStatus::FalsePositive => write!(f, "false_positive"),
            AlertStatus::Suppressed => write!(f, "suppressed"),
        }
    }
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserRole::Admin => write!(f, "admin"),
            UserRole::Analyst => write!(f, "analyst"),
            UserRole::Investigator => write!(f, "investigator"),
            UserRole::Viewer => write!(f, "viewer"),
            UserRole::ApiUser => write!(f, "api_user"),
        }
    }
}

// Default implementations




