use sqlx::{Pool, Postgres, Row};
use sqlx::postgres::{PgPoolOptions, PgRow};
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
    pool: Pool<Postgres>,
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

        Ok(Self { pool, config })
    }

    pub async fn migrate(&self) -> Result<(), PipelineError> {
        info!("Running database migrations");
        
        sqlx::migrate!("./migrations")
            .run(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to run database migrations: {}", e)))?;

        info!("Database migrations completed successfully");
        Ok(())
    }

    pub async fn health_check(&self) -> Result<bool, PipelineError> {
        let result = sqlx::query("SELECT 1")
            .fetch_one(&self.pool)
            .await;

        match result {
            Ok(_) => Ok(true),
            Err(e) => {
                error!("Database health check failed: {}", e);
                Ok(false)
            }
        }
    }

    pub fn get_pool(&self) -> &Pool<Postgres> {
        &self.pool
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

        sqlx::query(query)
            .bind(event.id)
            .bind(event.timestamp)
            .bind(&event.source)
            .bind(&event.source_type)
            .bind(&event.severity)
            .bind(&event.facility)
            .bind(&event.hostname)
            .bind(&event.process)
            .bind(&event.message)
            .bind(&event.raw_message)
            .bind(&event.source_ip)
            .bind(event.source_port)
            .bind(&event.protocol)
            .bind(&event.tags)
            .bind(&event.fields)
            .bind(&event.processing_stage)
            .bind(event.created_at)
            .bind(event.updated_at)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to insert event: {}", e)))?;

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

            sqlx::query(query)
                .bind(event.id)
                .bind(event.timestamp)
                .bind(&event.source)
                .bind(&event.source_type)
                .bind(&event.severity)
                .bind(&event.facility)
                .bind(&event.hostname)
                .bind(&event.process)
                .bind(&event.message)
                .bind(&event.raw_message)
                .bind(&event.source_ip)
                .bind(event.source_port)
                .bind(&event.protocol)
                .bind(&event.tags)
                .bind(&event.fields)
                .bind(&event.processing_stage)
                .bind(event.created_at)
                .bind(event.updated_at)
                .execute(&mut *tx)
                .await
                .map_err(|e| PipelineError::database(format!("Failed to insert event in batch: {}", e)))?;
        }

        tx.commit().await
            .map_err(|e| PipelineError::database(format!("Failed to commit batch insert transaction: {}", e)))?;

        debug!("Inserted {} events in batch", events.len());
        Ok(())
    }

    pub async fn get_event_by_id(&self, id: Uuid) -> Result<Option<Event>, PipelineError> {
        let query = "SELECT * FROM events WHERE id = $1";
        
        let result = sqlx::query_as::<_, Event>(query)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to fetch event by ID: {}", e)))?;

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

        sqlx::query(query)
            .bind(alert.id)
            .bind(&alert.title)
            .bind(&alert.description)
            .bind(&alert.severity)
            .bind(&alert.status)
            .bind(&alert.rule_name)
            .bind(alert.rule_id)
            .bind(&alert.event_ids)
            .bind(alert.source_events_count)
            .bind(&alert.mitre_tactics)
            .bind(&alert.mitre_techniques)
            .bind(&alert.indicators)
            .bind(&alert.affected_assets)
            .bind(&alert.affected_users)
            .bind(alert.confidence_score)
            .bind(alert.risk_score)
            .bind(alert.false_positive_probability)
            .bind(&alert.assigned_to)
            .bind(alert.escalation_level)
            .bind(alert.sla_deadline)
            .bind(alert.created_at)
            .bind(alert.updated_at)
            .bind(alert.resolved_at)
            .bind(&alert.resolution_notes)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to insert alert: {}", e)))?;

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

        sqlx::query(query)
            .bind(&status)
            .bind(resolved_at)
            .bind(&resolution_notes)
            .bind(Utc::now())
            .bind(alert_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to update alert status: {}", e)))?;

        Ok(())
    }

    pub async fn get_open_alerts(&self) -> Result<Vec<Alert>, PipelineError> {
        let query = "SELECT * FROM alerts WHERE status IN ('open', 'in_progress') ORDER BY created_at DESC";
        
        let alerts = sqlx::query_as::<_, Alert>(query)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to fetch open alerts: {}", e)))?;

        Ok(alerts)
    }

    pub async fn get_alerts_by_severity(&self, severity: AlertSeverity) -> Result<Vec<Alert>, PipelineError> {
        let query = "SELECT * FROM alerts WHERE severity = $1 ORDER BY created_at DESC";
        
        let alerts = sqlx::query_as::<_, Alert>(query)
            .bind(&severity)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to fetch alerts by severity: {}", e)))?;

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

        sqlx::query(query)
            .bind(user.id)
            .bind(&user.username)
            .bind(&user.email)
            .bind(&user.password_hash)
            .bind(&user.full_name)
            .bind(&user.department)
            .bind(&user.role)
            .bind(&user.permissions)
            .bind(user.is_active)
            .bind(user.last_login)
            .bind(user.failed_login_attempts)
            .bind(user.account_locked_until)
            .bind(user.password_changed_at)
            .bind(user.mfa_enabled)
            .bind(&user.mfa_secret)
            .bind(user.created_at)
            .bind(user.updated_at)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to insert user: {}", e)))?;

        Ok(())
    }

    pub async fn get_user_by_username(&self, username: &str) -> Result<Option<User>, PipelineError> {
        let query = "SELECT * FROM users WHERE username = $1";
        
        let user = sqlx::query_as::<_, User>(query)
            .bind(username)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to fetch user by username: {}", e)))?;

        Ok(user)
    }

    pub async fn get_user_by_email(&self, email: &str) -> Result<Option<User>, PipelineError> {
        let query = "SELECT * FROM users WHERE email = $1";
        
        let user = sqlx::query_as::<_, User>(query)
            .bind(email)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to fetch user by email: {}", e)))?;

        Ok(user)
    }

    pub async fn get_user_by_id(&self, user_id: Uuid) -> Result<Option<User>, PipelineError> {
        let query = "SELECT * FROM users WHERE id = $1";
        
        let user = sqlx::query_as::<_, User>(query)
            .bind(user_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to get user by ID: {}", e)))?;

        Ok(user)
    }

    pub async fn update_user_password(&self, user_id: Uuid, password_hash: &str) -> Result<(), PipelineError> {
        let query = "UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3";
        
        sqlx::query(query)
            .bind(password_hash)
            .bind(Utc::now())
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to update user password: {}", e)))?;

        Ok(())
    }

    pub async fn update_user_last_login(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "UPDATE users SET last_login = $1, updated_at = $2 WHERE id = $3";
        
        sqlx::query(query)
            .bind(Utc::now())
            .bind(Utc::now())
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to update user last login: {}", e)))?;

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

        sqlx::query(query)
            .bind(rule.id)
            .bind(&rule.name)
            .bind(&rule.description)
            .bind(&rule.severity)
            .bind(&rule.rule_type)
            .bind(&rule.query)
            .bind(&rule.conditions)
            .bind(rule.enabled)
            .bind(&rule.author)
            .bind(&rule.version)
            .bind(&rule.mitre_tactics)
            .bind(&rule.mitre_techniques)
            .bind(&rule.tags)
            .bind(&rule.references)
            .bind(rule.false_positive_rate)
            .bind(rule.last_triggered)
            .bind(rule.trigger_count)
            .bind(&rule.suppression_rules)
            .bind(rule.created_at)
            .bind(rule.updated_at)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to insert detection rule: {}", e)))?;

        Ok(())
    }

    pub async fn get_enabled_detection_rules(&self) -> Result<Vec<DetectionRule>, PipelineError> {
        let query = "SELECT * FROM detection_rules WHERE enabled = true ORDER BY name";
        
        let rules = sqlx::query_as::<_, DetectionRule>(query)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to fetch enabled detection rules: {}", e)))?;

        Ok(rules)
    }

    pub async fn update_rule_trigger_count(&self, rule_id: Uuid) -> Result<(), PipelineError> {
        let query = r#"
            UPDATE detection_rules 
            SET trigger_count = trigger_count + 1, last_triggered = $1, updated_at = $2
            WHERE id = $3
        "#;
        
        sqlx::query(query)
            .bind(Utc::now())
            .bind(Utc::now())
            .bind(rule_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to update rule trigger count: {}", e)))?;

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

        sqlx::query(query)
            .bind(source.id)
            .bind(&source.name)
            .bind(&source.description)
            .bind(&source.source_type)
            .bind(&source.connection_config)
            .bind(&source.parsing_config)
            .bind(source.enabled)
            .bind(&source.health_status)
            .bind(source.last_health_check)
            .bind(source.events_per_second)
            .bind(source.total_events_processed)
            .bind(source.error_count)
            .bind(source.created_at)
            .bind(source.updated_at)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to insert data source: {}", e)))?;

        Ok(())
    }

    pub async fn get_enabled_data_sources(&self) -> Result<Vec<DataSource>, PipelineError> {
        let query = "SELECT * FROM data_sources WHERE enabled = true ORDER BY name";
        
        let sources = sqlx::query_as::<_, DataSource>(query)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to fetch enabled data sources: {}", e)))?;

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

        sqlx::query(query)
            .bind(log.id)
            .bind(log.user_id)
            .bind(&log.action)
            .bind(&log.resource_type)
            .bind(&log.resource_id)
            .bind(&log.details)
            .bind(&log.ip_address)
            .bind(&log.user_agent)
            .bind(log.success)
            .bind(&log.error_message)
            .bind(log.created_at)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to insert audit log: {}", e)))?;

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
        
        let audit_logs = sqlx_query
            .fetch_all(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to fetch audit logs: {}", e)))?;

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
        let total_events: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM events WHERE timestamp >= $1 AND timestamp <= $2"
        )
        .bind(start_time)
        .bind(end_time)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| PipelineError::database(format!("Failed to get total events count: {}", e)))?;

        // Events by severity
        let severity_rows: Vec<PgRow> = sqlx::query(
            "SELECT severity, COUNT(*) as count FROM events WHERE timestamp >= $1 AND timestamp <= $2 GROUP BY severity"
        )
        .bind(start_time)
        .bind(end_time)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| PipelineError::database(format!("Failed to get events by severity: {}", e)))?;

        let mut events_by_severity = HashMap::new();
        for row in severity_rows {
            let severity: String = row.get("severity");
            let count: i64 = row.get("count");
            events_by_severity.insert(severity, count);
        }

        // Events by source
        let source_rows: Vec<PgRow> = sqlx::query(
            "SELECT source, COUNT(*) as count FROM events WHERE timestamp >= $1 AND timestamp <= $2 GROUP BY source ORDER BY count DESC LIMIT 10"
        )
        .bind(start_time)
        .bind(end_time)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| PipelineError::database(format!("Failed to get events by source: {}", e)))?;

        let mut events_by_source = HashMap::new();
        let mut top_sources = Vec::new();
        for row in source_rows {
            let source: String = row.get("source");
            let count: i64 = row.get("count");
            events_by_source.insert(source.clone(), count);
            top_sources.push((source, count));
        }

        // Events by hour (last 24 hours)
        let hourly_rows: Vec<PgRow> = sqlx::query(
            r#"
            SELECT 
                date_trunc('hour', timestamp) as hour,
                COUNT(*) as count
            FROM events 
            WHERE timestamp >= $1 AND timestamp <= $2
            GROUP BY hour
            ORDER BY hour
            "#
        )
        .bind(start_time)
        .bind(end_time)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| PipelineError::database(format!("Failed to get events by hour: {}", e)))?;

        let mut events_by_hour = Vec::new();
        for row in hourly_rows {
            let hour: DateTime<Utc> = row.get("hour");
            let count: i64 = row.get("count");
            events_by_hour.push((hour, count));
        }

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
        let total_alerts: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM alerts WHERE created_at >= $1 AND created_at <= $2"
        )
        .bind(start_time)
        .bind(end_time)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| PipelineError::database(format!("Failed to get total alerts count: {}", e)))?;

        // Open alerts
        let open_alerts: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM alerts WHERE status IN ('open', 'in_progress')"
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| PipelineError::database(format!("Failed to get open alerts count: {}", e)))?;

        // Alerts by severity
        let severity_rows: Vec<PgRow> = sqlx::query(
            "SELECT severity, COUNT(*) as count FROM alerts WHERE created_at >= $1 AND created_at <= $2 GROUP BY severity"
        )
        .bind(start_time)
        .bind(end_time)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| PipelineError::database(format!("Failed to get alerts by severity: {}", e)))?;

        let mut alerts_by_severity = HashMap::new();
        for row in severity_rows {
            let severity: String = row.get("severity");
            let count: i64 = row.get("count");
            alerts_by_severity.insert(severity, count);
        }

        // Alerts by status
        let status_rows: Vec<PgRow> = sqlx::query(
            "SELECT status, COUNT(*) as count FROM alerts WHERE created_at >= $1 AND created_at <= $2 GROUP BY status"
        )
        .bind(start_time)
        .bind(end_time)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| PipelineError::database(format!("Failed to get alerts by status: {}", e)))?;

        let mut alerts_by_status = HashMap::new();
        for row in status_rows {
            let status: String = row.get("status");
            let count: i64 = row.get("count");
            alerts_by_status.insert(status, count);
        }

        // Top triggered rules
        let rule_rows: Vec<PgRow> = sqlx::query(
            "SELECT rule_name, COUNT(*) as count FROM alerts WHERE created_at >= $1 AND created_at <= $2 GROUP BY rule_name ORDER BY count DESC LIMIT 10"
        )
        .bind(start_time)
        .bind(end_time)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| PipelineError::database(format!("Failed to get top triggered rules: {}", e)))?;

        let mut top_triggered_rules = Vec::new();
        for row in rule_rows {
            let rule_name: String = row.get("rule_name");
            let count: i64 = row.get("count");
            top_triggered_rules.push((rule_name, count));
        }

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
        
        let result = sqlx::query("DELETE FROM events WHERE created_at < $1")
            .bind(cutoff_date)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to cleanup old events: {}", e)))?;

        Ok(result.rows_affected())
    }

    pub async fn cleanup_old_audit_logs(&self, retention_days: u32) -> Result<u64, PipelineError> {
        let cutoff_date = Utc::now() - chrono::Duration::days(retention_days as i64);
        
        let result = sqlx::query("DELETE FROM audit_logs WHERE created_at < $1")
            .bind(cutoff_date)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to cleanup old audit logs: {}", e)))?;

        Ok(result.rows_affected())
    }

    // Session management methods
    pub async fn insert_user_session(&self, session: &UserSession) -> Result<(), PipelineError> {
        let query = r#"
            INSERT INTO user_sessions (
                id, user_id, session_token, refresh_token, ip_address, user_agent,
                created_at, expires_at, last_accessed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#;

        sqlx::query(query)
            .bind(session.id)
            .bind(session.user_id)
            .bind(&session.session_token)
            .bind(&session.refresh_token)
            .bind(&session.ip_address)
            .bind(&session.user_agent)
            .bind(session.created_at)
            .bind(session.expires_at)
            .bind(session.last_activity)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to insert user session: {}", e)))?;

        Ok(())
    }

    pub async fn get_session_by_refresh_token(&self, refresh_token: &str) -> Result<Option<UserSession>, PipelineError> {
        let query = "SELECT * FROM user_sessions WHERE refresh_token = $1 AND expires_at > NOW()";
        
        let session = sqlx::query_as::<_, UserSession>(query)
            .bind(refresh_token)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to fetch session by refresh token: {}", e)))?;

        Ok(session)
    }

    pub async fn delete_session(&self, session_id: Uuid) -> Result<(), PipelineError> {
        let query = "DELETE FROM user_sessions WHERE id = $1";
        
        sqlx::query(query)
            .bind(session_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to delete session: {}", e)))?;

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
        
        sqlx::query(query)
            .bind(session_id)
            .bind(new_session_id)
            .bind(new_session_id.to_string())
            .bind(new_refresh_token)
            .bind(expires_at)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to update session: {}", e)))?;

        Ok(())
    }

    pub async fn delete_all_user_sessions(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "DELETE FROM user_sessions WHERE user_id = $1";
        
        sqlx::query(query)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to delete all user sessions: {}", e)))?;

        Ok(())
    }

    pub async fn get_active_sessions_for_user(&self, user_id: Uuid) -> Result<Vec<UserSession>, PipelineError> {
        let query = "SELECT * FROM user_sessions WHERE user_id = $1 AND expires_at > NOW() ORDER BY last_accessed_at DESC";
        
        let sessions = sqlx::query_as::<_, UserSession>(query)
            .bind(user_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to fetch active sessions for user: {}", e)))?;

        Ok(sessions)
    }

    pub async fn lock_user_account(&self, user_id: Uuid, lockout_until: DateTime<Utc>) -> Result<(), PipelineError> {
        let query = "UPDATE users SET is_locked = true, locked_at = NOW(), account_locked_until = $1 WHERE id = $2";
        
        sqlx::query(query)
            .bind(lockout_until)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to lock user account: {}", e)))?;

        Ok(())
    }

    pub async fn increment_failed_login_attempts(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "UPDATE users SET failed_login_attempts = failed_login_attempts + 1, last_failed_login = NOW() WHERE id = $1";
        
        sqlx::query(query)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to increment failed login attempts: {}", e)))?;

        Ok(())
    }

    pub async fn reset_failed_login_attempts(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "UPDATE users SET failed_login_attempts = 0, last_failed_login = NULL WHERE id = $1";
        
        sqlx::query(query)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to reset failed login attempts: {}", e)))?;

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
        
        sqlx::query(query)
            .bind(user_id)
            .bind(secret)
            .bind(backup_codes_json)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to store pending MFA secret: {}", e)))?;
        
        Ok(())
    }

    /// Get pending MFA setup for a user
    pub async fn get_pending_mfa_setup(&self, user_id: Uuid) -> Result<Option<PendingMfaSetup>, PipelineError> {
        let query = "SELECT user_id, secret, backup_codes, created_at FROM pending_mfa_setups WHERE user_id = $1";
        
        let row = sqlx::query(query)
            .bind(user_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to get pending MFA setup: {}", e)))?;
            
        if let Some(row) = row {
            let backup_codes_json: String = row.get("backup_codes");
            let backup_codes: Vec<String> = serde_json::from_str(&backup_codes_json)
             .map_err(|e| PipelineError::internal(format!("Failed to deserialize backup codes: {}", e)))?;
                
            Ok(Some(PendingMfaSetup {
                user_id: row.get("user_id"),
                secret: row.get("secret"),
                backup_codes,
                created_at: row.get("created_at"),
            }))
        } else {
            Ok(None)
        }
    }

    /// Enable MFA for a user
    pub async fn enable_mfa_for_user(&self, user_id: Uuid, secret: &str, backup_codes: &[String]) -> Result<(), PipelineError> {
        let backup_codes_json = serde_json::to_string(&backup_codes)
            .map_err(|e| PipelineError::internal(format!("Failed to serialize backup codes: {}", e)))?;
            
        let query = "UPDATE users SET mfa_secret = $1, mfa_backup_codes = $2, mfa_enabled = true WHERE id = $3";
        
        sqlx::query(query)
            .bind(secret)
            .bind(backup_codes_json)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to enable MFA for user: {}", e)))?;
        
        Ok(())
    }

    /// Remove pending MFA setup for a user
    pub async fn remove_pending_mfa_setup(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "DELETE FROM pending_mfa_setups WHERE user_id = $1";
        
        sqlx::query(query)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to remove pending MFA setup: {}", e)))?;
        
        Ok(())
    }

    /// Disable MFA for a user
    pub async fn disable_mfa_for_user(&self, user_id: Uuid) -> Result<(), PipelineError> {
        let query = "UPDATE users SET mfa_secret = NULL, mfa_enabled = false WHERE id = $1";
        
        sqlx::query(query)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(|e| PipelineError::database(format!("Failed to disable MFA for user: {}", e)))?;
        
        Ok(())
    }

    pub async fn close(&self) {
        self.pool.close().await;
        info!("Database connection pool closed");
    }
}