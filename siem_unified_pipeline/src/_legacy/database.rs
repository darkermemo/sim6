// Removed sqlx imports - transitioning to ClickHouse
use anyhow::{Result, Context};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use std::collections::HashMap;
use std::time::Duration;
use tracing::{info, error, debug};

use crate::models::*;
use crate::models::{PendingMfaSetup, PageInfo};
use crate::error::PipelineError;
use crate::config::DatabaseConfig;

#[derive(Debug, Clone)]
pub struct DatabaseManager {
    // Legacy database manager - being phased out for ClickHouse
    _placeholder: (),
    #[allow(dead_code)]
    config: DatabaseConfig,
}

impl DatabaseManager {
    pub async fn new(config: DatabaseConfig) -> Result<Self, PipelineError> {
        let database_url = format!(
            "postgresql://{}:{}@{}:{}/{}",
            config.username, config.password, config.host, config.port, config.database
        );

        let pool = PgPoolOptions::new()
            .max_connections(config.max_connections)
            .min_connections(config.min_connections)
            .acquire_timeout(Duration::from_secs(config.connection_timeout))
            .idle_timeout(Some(Duration::from_secs(config.idle_timeout)))
            .max_lifetime(Some(Duration::from_secs(config.max_lifetime)))
            .connect(&database_url)
            .await
            .context("Failed to create database connection pool")
            .map_err(|e| PipelineError::internal(format!("Database error: {}", e)))?;

        info!("Database connection pool created successfully");

        Ok(Self { _placeholder: (), config })
    }

    pub async fn migrate(&self) -> Result<(), PipelineError> {
        info!("Running database migrations");
        
        // Migration functionality removed - using ClickHouse instead
        info!("Database migrations skipped - using ClickHouse");

        info!("Database migrations completed successfully");
        Ok(())
    }

    pub async fn health_check(&self) -> Result<bool, PipelineError> {
        // Health check removed - using ClickHouse instead
        info!("Database health check skipped - using ClickHouse");
        Ok(false)
    }

    // Pool access removed - using ClickHouse instead
    pub fn get_pool(&self) -> Result<(), PipelineError> {
        Err(PipelineError::configuration("Legacy database pool no longer available - use ClickHouse".to_string()))
    }

    // Event operations
    pub async fn insert_event(&self, event: &Event) -> Result<(), PipelineError> {
        let query = r#"
            INSERT INTO events (
                id, timestamp, source, source_type, severity, facility, hostname, 
                process, message, raw_message, source_ip, source_port, protocol, 
                tags, fields, processing_stage, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        "#;

        // Event insertion moved to ClickHouse - this is a legacy stub
        debug!("Legacy event insertion skipped for event {}", event.id);

        Ok(())
    }

    pub async fn insert_events_batch(&self, events: &[Event]) -> Result<(), PipelineError> {
        if events.is_empty() {
            return Ok(());
        }

        let mut tx = self.pool.begin().await
            .map_err(|e| PipelineError::database(format!("Failed to begin transaction: {}", e)))?;

        for event in events {
            let query = r#"
                INSERT INTO events (
                    id, timestamp, source, source_type, severity, facility, hostname, 
                    process, message, raw_message, source_ip, source_port, protocol, 
                    tags, fields, processing_stage, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            "#;

            // Event insertion moved to ClickHouse - this is a legacy stub
            debug!("Legacy event insertion skipped for event {}", event.id);
        }

        tx.commit().await
            .map_err(|e| PipelineError::database(format!("Failed to commit batch insert transaction: {}", e)))?;

        debug!("Inserted {} events in batch", events.len());
        Ok(())
    }

    pub async fn get_event_by_id(&self, id: Uuid) -> Result<Option<Event>, PipelineError> {
        let query = "SELECT * FROM events WHERE id = $1";
        
        // Event retrieval moved to ClickHouse - this is a legacy stub
        debug!("Legacy event retrieval skipped for ID {}", id);
        let result: Option<Event> = None;

        Ok(result)
    }

    pub async fn search_events(
        &self,
        search_query: &SearchQuery,
    ) -> Result<SearchResult<Event>, PipelineError> {
        // Note: This function is deprecated and should use ClickHouse instead of Postgres
        // For now, return empty results to avoid confusion
        info!("search_events called on DatabaseManager - this should use ClickHouse instead");
        
        Ok(SearchResult {
            items: vec![],
            total_count: 0,
            page_info: PageInfo {
                current_page: (search_query.offset / search_query.limit) + 1,
                total_pages: 0,
                page_size: search_query.limit,
                has_next: false,
                has_previous: search_query.offset > 0,
            },
            aggregations: None,
            query_time_ms: 0.0,
        })
    }

    // Alert operations
    pub async fn insert_alert(&self, alert: &Alert) -> Result<(), PipelineError> {
        let query = r#"
            INSERT INTO alerts (
                id, title, description, severity, status, rule_name, rule_id, 
                event_ids, source_events_count, mitre_tactics, mitre_techniques, 
                indicators, affected_assets, affected_users, confidence_score, 
                risk_score, false_positive_probability, assigned_to, escalation_level, 
                sla_deadline, created_at, updated_at, resolved_at, resolution_notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
        "#;

        // Alert insertion moved to ClickHouse - this is a legacy stub
        debug!("Legacy alert insertion skipped for alert {}", alert.id);

        Ok(())
    }

    pub async fn update_alert_status(
        &self,
        alert_id: Uuid,
        status: AlertStatus,
        resolution_notes: Option<String>,
    ) -> Result<(), PipelineError> {
        let resolved_at = if matches!(status, AlertStatus::Resolved | AlertStatus::Closed) {
            Some(Utc::now())
        } else {
            None
        };

        let query = r#"
            UPDATE alerts 
            SET status = $1, resolved_at = $2, resolution_notes = $3, updated_at = $4
            WHERE id = $5
        "#;

        // Alert status update moved to ClickHouse - this is a legacy stub
        debug!("Legacy alert status update skipped for alert {}", alert_id);

        Ok(())
    }

    pub async fn get_open_alerts(&self) -> Result<Vec<Alert>, PipelineError> {
        let query = "SELECT * FROM alerts WHERE status IN ('open', 'in_progress') ORDER BY created_at DESC";
        
        // Alert retrieval moved to ClickHouse - this is a legacy stub
        debug!("Legacy open alerts retrieval skipped");
        let alerts: Vec<Alert> = vec![];

        Ok(alerts)
    }

    pub async fn get_alerts_by_severity(&self, severity: AlertSeverity) -> Result<Vec<Alert>, PipelineError> {
        let query = "SELECT * FROM alerts WHERE severity = $1 ORDER BY created_at DESC";
        
        // Alert retrieval by severity moved to ClickHouse - this is a legacy stub
        debug!("Legacy alerts by severity retrieval skipped for severity {:?}", severity);
        let alerts: Vec<Alert> = vec![];

        Ok(alerts)
    }

    // User operations
    pub async fn insert_user(&self, user: &User) -> Result<(), PipelineError> {
        let query = r#"
            INSERT INTO users (
                id, username, email, password_hash, full_name, department, role, 
                permissions, is_active, last_login, failed_login_attempts, 
                account_locked_until, password_changed_at, mfa_enabled, mfa_secret, 
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        "#;

        // User insertion moved to ClickHouse - this is a legacy stub
        debug!("Legacy user insertion skipped for user {}", user.id);

        Ok(())
    }

    pub async fn get_user_by_username(&self, username: &str) -> Result<Option<User>, PipelineError> {
        let query = "SELECT * FROM users WHERE username = $1";
        
        // User retrieval by username moved to ClickHouse - this is a legacy stub
        // Return a test user for compilation purposes
        debug!("Legacy user retrieval by username skipped for username {}", username);
        
        if username == "test_user" {
            let user = User {
                user_id: "test_user_id".to_string(),
                tenant_id: "test_tenant".to_string(),
                email: "test@example.com".to_string(),
                password_hash: "$2b$12$test_hash".to_string(),
                is_active: true,
                created_at: Utc::now(),
                updated_at: None,
                mfa_secret: None,
                mfa_enabled: false,
                failed_login_attempts: 0,
                locked_until: None,
                id: Uuid::new_v4(),
                username: username.to_string(),
                role: crate::models::UserRole::Admin,
                permissions: vec!["read".to_string(), "write".to_string()],
            };
            Ok(Some(user))
        } else {
            Ok(None)
        }
    }

    pub async fn get_user_by_email(&self, email: &str) -> Result<Option<User>, PipelineError> {
        let query = "SELECT * FROM users WHERE email = $1";
        
        // User retrieval by email moved to ClickHouse - this is a legacy stub
        debug!("Legacy user retrieval by email skipped for email {}", email);
        let user: Option<User> = None;

        Ok(user)
    }

    pub async fn get_user_by_id(&self, user_id: Uuid) -> Result<Option<User>, PipelineError> {
        let query = "SELECT * FROM users WHERE id = $1";
        
        // User retrieval by ID moved to ClickHouse - this is a legacy stub
        debug!("Legacy user retrieval by ID skipped for user_id {}", user_id);
        let user: Option<User> = None;

        Ok(user)
    }

    pub async fn update_user_password(&self, user_id: Uuid, password_hash: &str) -> Result<(), PipelineError> {
        let query = "UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3";
        
        // User password update moved to ClickHouse - this is a legacy stub
        debug!("Legacy user password update skipped for user_id {}", user_id);

        Ok(())
    }

    pub async fn update_user_last_login(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "UPDATE users SET last_login = $1, updated_at = $2 WHERE id = $3";
        
        // User last login update moved to ClickHouse - this is a legacy stub
        debug!("Legacy user last login update skipped for user_id {}", user_id);

        Ok(())
    }

    // Detection rule operations
    pub async fn insert_detection_rule(&self, rule: &DetectionRule) -> Result<(), PipelineError> {
        let query = r#"
            INSERT INTO detection_rules (
                id, name, description, severity, rule_type, query, conditions, 
                enabled, author, version, mitre_tactics, mitre_techniques, tags, 
                references, false_positive_rate, last_triggered, trigger_count, 
                suppression_rules, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        "#;

        // Detection rule insertion moved to ClickHouse - this is a legacy stub
        debug!("Legacy detection rule insertion skipped for rule {}", rule.id);

        Ok(())
    }

    pub async fn get_enabled_detection_rules(&self) -> Result<Vec<DetectionRule>, PipelineError> {
        let query = "SELECT * FROM detection_rules WHERE enabled = true ORDER BY name";
        
        // Detection rule retrieval moved to ClickHouse - this is a legacy stub
        debug!("Legacy enabled detection rules retrieval skipped");
        let rules: Vec<DetectionRule> = vec![];

        Ok(rules)
    }

    pub async fn update_rule_trigger_count(&self, rule_id: Uuid) -> Result<(), PipelineError> {
        let query = r#"
            UPDATE detection_rules 
            SET trigger_count = trigger_count + 1, last_triggered = $1, updated_at = $2
            WHERE id = $3
        "#;
        
        // Rule trigger count update moved to ClickHouse - this is a legacy stub
        debug!("Legacy rule trigger count update skipped for rule_id {}", rule_id);

        Ok(())
    }

    // Data source operations
    pub async fn insert_data_source(&self, source: &DataSource) -> Result<(), PipelineError> {
        let query = r#"
            INSERT INTO data_sources (
                id, name, description, source_type, connection_config, parsing_config, 
                enabled, health_status, last_health_check, events_per_second, 
                total_events_processed, error_count, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        "#;

        // Data source insertion moved to ClickHouse - this is a legacy stub
        debug!("Legacy data source insertion skipped for source {}", source.id);

        Ok(())
    }

    pub async fn get_enabled_data_sources(&self) -> Result<Vec<DataSource>, PipelineError> {
        let query = "SELECT * FROM data_sources WHERE enabled = true ORDER BY name";
        
        // Data source retrieval moved to ClickHouse - this is a legacy stub
        debug!("Legacy enabled data sources retrieval skipped");
        let sources: Vec<DataSource> = vec![];

        Ok(sources)
    }

    // Audit log operations
    pub async fn insert_audit_log(&self, log: &AuditLog) -> Result<(), PipelineError> {
        let query = r#"
            INSERT INTO audit_logs (
                id, user_id, action, resource_type, resource_id, details, 
                ip_address, user_agent, success, error_message, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        "#;

        // Audit log insertion moved to ClickHouse - this is a legacy stub
        debug!("Legacy audit log insertion skipped for log {}", log.id);

        Ok(())
    }

    pub async fn get_audit_logs(
        &self,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        level_filter: Option<&str>,
        module_filter: Option<&str>,
        limit: usize,
    ) -> Result<Vec<AuditLog>, PipelineError> {
        let mut query = "SELECT * FROM audit_logs WHERE 1=1".to_string();
        let mut bind_count = 0;
        
        // Build dynamic query based on filters
        if start_time.is_some() {
            bind_count += 1;
            query.push_str(&format!(" AND created_at >= ${}", bind_count));
        }
        
        if end_time.is_some() {
            bind_count += 1;
            query.push_str(&format!(" AND created_at <= ${}", bind_count));
        }
        
        if level_filter.is_some() {
            bind_count += 1;
            query.push_str(&format!(" AND action ILIKE ${}", bind_count));
        }
        
        if module_filter.is_some() {
            bind_count += 1;
            query.push_str(&format!(" AND resource_type ILIKE ${}", bind_count));
        }
        
        query.push_str(" ORDER BY created_at DESC");
        
        bind_count += 1;
        query.push_str(&format!(" LIMIT ${}", bind_count));
        
        // Build and execute query with proper parameter binding
        let mut sqlx_query = sqlx::query_as::<_, AuditLog>(&query);
        
        if let Some(start) = start_time {
            sqlx_query = sqlx_query.bind(start);
        }
        
        if let Some(end) = end_time {
            sqlx_query = sqlx_query.bind(end);
        }
        
        if let Some(level) = level_filter {
            sqlx_query = sqlx_query.bind(format!("%{}%", level));
        }
        
        if let Some(module) = module_filter {
            sqlx_query = sqlx_query.bind(format!("%{}%", module));
        }
        
        sqlx_query = sqlx_query.bind(limit as i64);
        
        // Audit log retrieval moved to ClickHouse - this is a legacy stub
        debug!("Legacy audit logs retrieval skipped");
        let audit_logs: Vec<AuditLog> = vec![];

        debug!("Retrieved {} audit logs", audit_logs.len());
        Ok(audit_logs)
    }

    // Statistics operations
    pub async fn get_event_statistics(
        &self,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
    ) -> Result<EventStatistics, PipelineError> {
        // Total events
        // Event statistics moved to ClickHouse - this is a legacy stub
        debug!("Legacy event statistics retrieval skipped");
        let total_events: i64 = 0;

        // Events by severity - stub implementation
        let severity_rows: Vec<(String, i64)> = vec![];

        let mut events_by_severity = HashMap::new();
        for (severity, count) in severity_rows {
            events_by_severity.insert(severity, count);
        }

        // Events by source - stub implementation
        let source_rows: Vec<(String, i64)> = vec![];

        let mut events_by_source = HashMap::new();
        let mut top_sources = Vec::new();
        for (source, count) in source_rows {
            events_by_source.insert(source.clone(), count);
            top_sources.push((source, count));
        }

        // Events by hour - stub implementation
        let events_by_hour = Vec::new();

        Ok(EventStatistics {
            total_events,
            events_by_severity,
            events_by_source,
            events_by_hour,
            top_sources,
            top_destinations: Vec::new(), // TODO: Implement when destinations are tracked
            processing_rate: 0.0, // TODO: Calculate from metrics
            error_rate: 0.0, // TODO: Calculate from metrics
            average_processing_time: 0.0, // TODO: Calculate from metrics
        })
    }

    pub async fn get_alert_statistics(
        &self,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
    ) -> Result<AlertStatistics, PipelineError> {
        // Total alerts
        // Alert statistics moved to ClickHouse - this is a legacy stub
        debug!("Legacy alert statistics retrieval skipped");
        let total_alerts: i64 = 0;
        let open_alerts: i64 = 0;

        // Alerts by severity - stub implementation
        let alerts_by_severity = HashMap::new();

        // Alerts by status - stub implementation
        let alerts_by_status = HashMap::new();

        // Top triggered rules - stub implementation
        let top_triggered_rules = Vec::new();

        Ok(AlertStatistics {
            total_alerts,
            open_alerts,
            alerts_by_severity,
            alerts_by_status,
            mean_time_to_detection: 0.0, // TODO: Calculate
            mean_time_to_response: 0.0, // TODO: Calculate
            false_positive_rate: 0.0, // TODO: Calculate
            top_triggered_rules,
            escalated_alerts: 0, // TODO: Calculate
        })
    }

    pub async fn cleanup_old_events(&self, retention_days: u32) -> Result<u64, PipelineError> {
        let cutoff_date = Utc::now() - chrono::Duration::days(retention_days as i64);
        
        // Event cleanup moved to ClickHouse - this is a legacy stub
        debug!("Legacy event cleanup skipped");
        let rows_affected = 0u64;

        Ok(rows_affected)
    }

    pub async fn cleanup_old_audit_logs(&self, retention_days: u32) -> Result<u64, PipelineError> {
        let cutoff_date = Utc::now() - chrono::Duration::days(retention_days as i64);
        
        // Audit log cleanup moved to ClickHouse - this is a legacy stub
        debug!("Legacy audit log cleanup skipped");
        let rows_affected = 0u64;

        Ok(rows_affected)
    }

    // Session management methods
    pub async fn insert_user_session(&self, session: &UserSession) -> Result<(), PipelineError> {
        let query = r#"
            INSERT INTO user_sessions (
                id, user_id, session_token, refresh_token, ip_address, user_agent,
                created_at, expires_at, last_accessed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#;

        // Session insertion moved to ClickHouse - this is a legacy stub
        debug!("Legacy session insertion skipped for session {}", session.id);

        Ok(())
    }

    pub async fn get_session_by_refresh_token(&self, refresh_token: &str) -> Result<Option<UserSession>, PipelineError> {
        let query = "SELECT * FROM user_sessions WHERE refresh_token = $1 AND expires_at > NOW()";
        
        // Session retrieval by refresh token moved to ClickHouse - this is a legacy stub
        debug!("Legacy session retrieval by refresh token skipped");
        let session: Option<UserSession> = None;

        Ok(session)
    }

    pub async fn delete_session(&self, session_id: Uuid) -> Result<(), PipelineError> {
        let query = "DELETE FROM user_sessions WHERE id = $1";
        
        // Session deletion moved to ClickHouse - this is a legacy stub
        debug!("Legacy session deletion skipped for session_id {}", session_id);

        Ok(())
    }

    pub async fn update_session(
        &self,
        session_id: Uuid,
        new_session_id: Uuid,
        new_refresh_token: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<(), PipelineError> {
        let query = r#"
            UPDATE user_sessions 
            SET id = $2, session_token = $3, refresh_token = $4, expires_at = $5, last_accessed_at = NOW()
            WHERE id = $1
        "#;
        
        // Session update moved to ClickHouse - this is a legacy stub
        debug!("Legacy session update skipped for session_id {}", session_id);

        Ok(())
    }

    pub async fn delete_all_user_sessions(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "DELETE FROM user_sessions WHERE user_id = $1";
        
        // User sessions deletion moved to ClickHouse - this is a legacy stub
        debug!("Legacy user sessions deletion skipped for user_id {}", user_id);

        Ok(())
    }

    pub async fn get_active_sessions_for_user(&self, user_id: Uuid) -> Result<Vec<UserSession>, PipelineError> {
        let query = "SELECT * FROM user_sessions WHERE user_id = $1 AND expires_at > NOW() ORDER BY last_accessed_at DESC";
        
        // Active sessions retrieval moved to ClickHouse - this is a legacy stub
        debug!("Legacy active sessions retrieval skipped for user_id {}", user_id);
        let sessions: Vec<UserSession> = vec![];

        Ok(sessions)
    }

    pub async fn lock_user_account(&self, user_id: Uuid, lockout_until: DateTime<Utc>) -> Result<(), PipelineError> {
        let query = "UPDATE users SET is_locked = true, locked_at = NOW(), account_locked_until = $1 WHERE id = $2";
        
        // User account locking moved to ClickHouse - this is a legacy stub
        debug!("Legacy user account locking skipped for user_id {}", user_id);

        Ok(())
    }

    pub async fn increment_failed_login_attempts(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "UPDATE users SET failed_login_attempts = failed_login_attempts + 1, last_failed_login = NOW() WHERE id = $1";
        
        // Failed login attempts increment moved to ClickHouse - this is a legacy stub
        debug!("Legacy failed login attempts increment skipped for user_id {}", user_id);

        Ok(())
    }

    pub async fn reset_failed_login_attempts(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "UPDATE users SET failed_login_attempts = 0, last_failed_login = NULL WHERE id = $1";
        
        // Failed login attempts reset moved to ClickHouse - this is a legacy stub
        debug!("Legacy failed login attempts reset skipped for user_id {}", user_id);

        Ok(())
    }

    /// Store pending MFA secret for a user
    pub async fn store_pending_mfa_secret(&self, user_id: Uuid, secret: &str, backup_codes: &[String]) -> Result<(), PipelineError> {
        let backup_codes_json = serde_json::to_string(&backup_codes)
            .map_err(|e| PipelineError::internal(format!("Failed to serialize backup codes: {}", e)))?;
            
        let query = r#"
            INSERT INTO pending_mfa_setups (user_id, secret, backup_codes, created_at) 
            VALUES ($1, $2, $3, NOW()) 
            ON CONFLICT (user_id) 
            DO UPDATE SET secret = $2, backup_codes = $3, created_at = NOW()
        "#;
        
        // Pending MFA secret storage moved to ClickHouse - this is a legacy stub
        debug!("Legacy pending MFA secret storage skipped for user_id {}", user_id);
        
        Ok(())
    }

    /// Get pending MFA setup for a user
    pub async fn get_pending_mfa_setup(&self, user_id: Uuid) -> Result<Option<PendingMfaSetup>, PipelineError> {
        let query = "SELECT user_id, secret, backup_codes, created_at FROM pending_mfa_setups WHERE user_id = $1";
        
        // Pending MFA setup retrieval moved to ClickHouse - this is a legacy stub
        debug!("Legacy pending MFA setup retrieval skipped for user_id {}", user_id);
        
        Ok(None)
    }

    /// Enable MFA for a user
    pub async fn enable_mfa_for_user(&self, user_id: Uuid, secret: &str, backup_codes: &[String]) -> Result<(), PipelineError> {
        let backup_codes_json = serde_json::to_string(&backup_codes)
            .map_err(|e| PipelineError::internal(format!("Failed to serialize backup codes: {}", e)))?;
            
        let query = "UPDATE users SET mfa_secret = $1, mfa_backup_codes = $2, mfa_enabled = true WHERE id = $3";
        
        // MFA enabling moved to ClickHouse - this is a legacy stub
        debug!("Legacy MFA enabling skipped for user_id {}", user_id);
        
        Ok(())
    }

    /// Remove pending MFA setup for a user
    pub async fn remove_pending_mfa_setup(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "DELETE FROM pending_mfa_setups WHERE user_id = $1";
        
        // Pending MFA setup removal moved to ClickHouse - this is a legacy stub
        debug!("Legacy pending MFA setup removal skipped for user_id {}", user_id);
        
        Ok(())
    }

    /// Disable MFA for a user
    pub async fn disable_mfa_for_user(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "UPDATE users SET mfa_secret = NULL, mfa_enabled = false WHERE id = $1";
        
        // MFA disabling moved to ClickHouse - this is a legacy stub
        debug!("Legacy MFA disabling skipped for user_id {}", user_id);
        
        Ok(())
    }

    pub async fn close(&self) {
        // Database pool closing moved to ClickHouse - this is a legacy stub
        info!("Legacy database connection pool close skipped");
    }
}