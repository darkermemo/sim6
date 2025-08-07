use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use clickhouse::{Client as ClickHouseClient, Row};
use serde::{Deserialize, Serialize};
use serde_json;
use std::collections::HashMap;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::error::Result;
use crate::handlers::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub rule_id: String,
    pub tenant_scope: String,
    pub rule_name: String,
    pub kql_query: String,
    pub severity: String,
    pub enabled: bool,
    pub description: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub alert_id: String,
    pub tenant_id: String,
    pub rule_id: String,
    pub event_refs: Vec<String>,
    pub alert_title: String,
    pub alert_description: String,
    pub severity: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRuleRequest {
    pub rule_name: String,
    pub tenant_scope: String,
    pub kql_query: String,
    pub severity: String,
    pub description: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AlertsResponse {
    pub alerts: Vec<Alert>,
    pub total_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RulesResponse {
    pub rules: Vec<AlertRule>,
    pub total_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRuleResponse {
    pub rule_id: String,
    pub status: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRuleRequest {
    pub rule_name: Option<String>,
    pub kql_query: Option<String>,
    pub severity: Option<String>,
    pub enabled: Option<bool>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EvaluateRulesRequest {
    pub rule_ids: Option<Vec<String>>, // None = all enabled rules
}

// Row-derivable structs for ClickHouse deserialization
#[derive(Debug, Clone, Serialize, Deserialize, clickhouse::Row)]
pub struct AlertRuleRow {
    pub rule_id: String,
    pub tenant_scope: String,
    pub rule_name: String,
    pub kql_query: String,
    pub severity: String,
    pub enabled: u8,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, clickhouse::Row)]
pub struct AlertRow {
    pub alert_id: String,
    pub tenant_id: String,
    pub rule_id: String,
    pub event_refs: String,
    pub alert_title: String,
    pub alert_description: String,
    pub severity: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

// Helper function to get ClickHouse client from config
async fn get_clickhouse_client(state: &AppState) -> crate::error::Result<ClickHouseClient> {
    let config = state.config.read().await;

    let clickhouse_dest = config
        .destinations
        .iter()
        .find(|(_, dest)| {
            matches!(
                dest.destination_type,
                crate::config::DestinationType::ClickHouse { .. }
            )
        })
        .ok_or_else(|| {
            crate::error::PipelineError::configuration("No ClickHouse destination configured")
        })?;

    let (url, database) = match &clickhouse_dest.1.destination_type {
        crate::config::DestinationType::ClickHouse {
            connection_string,
            database,
            ..
        } => (connection_string.clone(), database.clone()),
        _ => {
            return Err(crate::error::PipelineError::configuration(
                "Invalid ClickHouse destination",
            ))
        }
    };

    let client = ClickHouseClient::default()
        .with_url(&url)
        .with_database(&database);

    Ok(client)
}

/// GET /api/v1/rules - Get all correlation rules
pub async fn get_rules(State(state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("Fetching all alert rules");

    let client = get_clickhouse_client(&state).await?;

    let query = "SELECT rule_id, tenant_scope, rule_name, kql_query, severity, enabled, description, created_at, updated_at FROM dev.alert_rules ORDER BY created_at";

    match client.query(query).fetch_all::<AlertRuleRow>().await {
        Ok(rows) => {
            let rules: Vec<AlertRule> = rows
                .into_iter()
                .map(|row| AlertRule {
                    rule_id: row.rule_id,
                    tenant_scope: row.tenant_scope,
                    rule_name: row.rule_name,
                    kql_query: row.kql_query,
                    severity: row.severity,
                    enabled: row.enabled == 1,
                    description: row.description,
                    created_at: chrono::DateTime::parse_from_rfc3339(&row.created_at)
                        .unwrap_or_else(|_| chrono::Utc::now().into())
                        .with_timezone(&chrono::Utc),
                    updated_at: chrono::DateTime::parse_from_rfc3339(&row.updated_at)
                        .unwrap_or_else(|_| chrono::Utc::now().into())
                        .with_timezone(&chrono::Utc),
                })
                .collect();

            let response = RulesResponse {
                total_count: rules.len(),
                rules,
            };

            info!("Retrieved {} alert rules", response.total_count);
            Ok(Json(response))
        }
        Err(e) => {
            error!("Failed to fetch alert rules: {}", e);
            Err(crate::error::PipelineError::database(format!(
                "Failed to fetch alert rules: {}",
                e
            )))
        }
    }
}

/// POST /api/v1/rules - Create a new correlation rule
pub async fn create_rule(
    State(state): State<AppState>,
    Json(request): Json<CreateRuleRequest>,
) -> Result<impl IntoResponse> {
    let rule_id = Uuid::new_v4().to_string();
    debug!("Creating alert rule: {}", rule_id);

    let client = get_clickhouse_client(&state).await?;
    let created_at = Utc::now();
    let enabled = request.enabled.unwrap_or(true);
    let description = request.description.unwrap_or_else(|| "".to_string());

    let query = "INSERT INTO dev.alert_rules (rule_id, tenant_scope, rule_name, kql_query, severity, enabled, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

    match client
        .query(query)
        .bind(&rule_id)
        .bind(&request.tenant_scope)
        .bind(&request.rule_name)
        .bind(&request.kql_query)
        .bind(&request.severity)
        .bind(if enabled { 1u8 } else { 0u8 })
        .bind(&description)
        .bind(created_at)
        .bind(created_at)
        .execute()
        .await
    {
        Ok(_) => {
            let response = CreateRuleResponse {
                rule_id: rule_id.clone(),
                status: "created".to_string(),
                message: "Alert rule created successfully".to_string(),
                created_at,
            };

            info!("Alert rule {} created successfully", rule_id);
            Ok((StatusCode::CREATED, Json(response)))
        }
        Err(e) => {
            error!("Failed to create alert rule {}: {}", rule_id, e);
            Err(crate::error::PipelineError::database(format!(
                "Failed to create alert rule: {}",
                e
            )))
        }
    }
}

/// GET /api/v1/rules/{id} - Get specific rule details
pub async fn get_rule(
    State(state): State<AppState>,
    Path(rule_id): Path<String>,
) -> Result<impl IntoResponse> {
    debug!("Fetching rule details: {}", rule_id);

    let client = get_clickhouse_client(&state).await?;

    let query = "SELECT rule_id, tenant_scope, rule_name, kql_query, severity, enabled, description, created_at, updated_at FROM dev.alert_rules WHERE rule_id = ?";

    match client
        .query(query)
        .bind(&rule_id)
        .fetch_optional::<AlertRuleRow>()
        .await
    {
        Ok(Some(row)) => {
            let rule = AlertRule {
                rule_id: row.rule_id,
                tenant_scope: row.tenant_scope,
                rule_name: row.rule_name,
                kql_query: row.kql_query,
                severity: row.severity,
                enabled: row.enabled == 1,
                description: row.description,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.created_at)
                    .unwrap_or_else(|_| chrono::Utc::now().into())
                    .with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.updated_at)
                    .unwrap_or_else(|_| chrono::Utc::now().into())
                    .with_timezone(&chrono::Utc),
            };

            info!("Retrieved details for rule {}", rule.rule_id);
            Ok(Json(rule))
        }
        Ok(None) => {
            warn!("Rule {} not found", rule_id);
            Err(crate::error::PipelineError::not_found(format!(
                "Rule {} not found",
                rule_id
            )))
        }
        Err(e) => {
            error!("Failed to fetch rule {}: {}", rule_id, e);
            Err(crate::error::PipelineError::database(format!(
                "Failed to fetch rule: {}",
                e
            )))
        }
    }
}

/// GET /api/v1/alerts - Get alerts with optional tenant filtering
pub async fn get_alerts(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<impl IntoResponse> {
    debug!("Fetching alerts with filters: {:?}", query);

    let client = get_clickhouse_client(&state).await?;

    let mut sql = "SELECT alert_id, tenant_id, rule_id, event_refs, alert_title, alert_description, severity, status, created_at, updated_at FROM dev.alerts".to_string();
    let mut conditions = Vec::new();

    // Add tenant filter if provided
    if let Some(tenant) = query.get("tenant") {
        if tenant != "all" {
            conditions.push(format!("tenant_id = '{}'", tenant));
        }
        // If tenant=all, don't add tenant filter (returns all tenants' alerts)
    }

    // Add status filter if provided
    if let Some(status) = query.get("status") {
        conditions.push(format!("status = '{}'", status));
    }

    // Add severity filter if provided
    if let Some(severity) = query.get("severity") {
        conditions.push(format!("severity = '{}'", severity));
    }

    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }

    sql.push_str(" ORDER BY created_at DESC LIMIT 100");

    match client.query(&sql).fetch_all::<AlertRow>().await {
        Ok(rows) => {
            let alerts: Vec<Alert> = rows
                .into_iter()
                .map(|row| {
                    let event_refs: Vec<String> =
                        serde_json::from_str(&row.event_refs).unwrap_or_default();
                    Alert {
                        alert_id: row.alert_id,
                        tenant_id: row.tenant_id,
                        rule_id: row.rule_id,
                        event_refs,
                        alert_title: row.alert_title,
                        alert_description: row.alert_description,
                        severity: row.severity,
                        status: row.status,
                        created_at: chrono::DateTime::parse_from_rfc3339(&row.created_at)
                            .unwrap_or_else(|_| chrono::Utc::now().into())
                            .with_timezone(&chrono::Utc),
                        updated_at: chrono::DateTime::parse_from_rfc3339(&row.updated_at)
                            .unwrap_or_else(|_| chrono::Utc::now().into())
                            .with_timezone(&chrono::Utc),
                    }
                })
                .collect();

            let response = AlertsResponse {
                total_count: alerts.len(),
                alerts,
            };

            info!("Retrieved {} alerts", response.total_count);
            Ok(Json(response))
        }
        Err(e) => {
            error!("Failed to fetch alerts: {}", e);
            Err(crate::error::PipelineError::database(format!(
                "Failed to fetch alerts: {}",
                e
            )))
        }
    }
}

/// PUT /api/v1/alert_rules/{id} - Update a correlation rule
pub async fn update_rule(
    State(state): State<AppState>,
    Path(rule_id): Path<String>,
    Json(request): Json<UpdateRuleRequest>,
) -> Result<impl IntoResponse> {
    debug!("Updating alert rule: {}", rule_id);

    let client = get_clickhouse_client(&state).await?;

    // Build dynamic update query
    let mut set_clauses = Vec::new();
    let mut params: Vec<String> = Vec::new();

    if let Some(rule_name) = &request.rule_name {
        set_clauses.push("rule_name = ?");
        params.push(rule_name.clone());
    }
    if let Some(kql_query) = &request.kql_query {
        set_clauses.push("kql_query = ?");
        params.push(kql_query.clone());
    }
    if let Some(severity) = &request.severity {
        set_clauses.push("severity = ?");
        params.push(severity.clone());
    }
    if let Some(enabled) = request.enabled {
        set_clauses.push("enabled = ?");
        params.push(if enabled {
            "1".to_string()
        } else {
            "0".to_string()
        });
    }
    if let Some(description) = &request.description {
        set_clauses.push("description = ?");
        params.push(description.clone());
    }

    if set_clauses.is_empty() {
        return Err(crate::error::PipelineError::bad_request(
            "No fields to update".to_string(),
        ));
    }

    set_clauses.push("updated_at = now()");

    // For now, use a simple approach - ClickHouse ALTER UPDATE syntax
    let query = format!(
        "ALTER TABLE dev.alert_rules UPDATE {} WHERE rule_id = '{}'",
        set_clauses.join(", "),
        rule_id
    );

    match client.query(&query).execute().await {
        Ok(_) => {
            let response = serde_json::json!({
                "rule_id": rule_id,
                "status": "updated",
                "message": "Alert rule updated successfully"
            });

            info!("Alert rule {} updated successfully", rule_id);
            Ok(Json(response))
        }
        Err(e) => {
            error!("Failed to update alert rule {}: {}", rule_id, e);
            Err(crate::error::PipelineError::database(format!(
                "Failed to update alert rule: {}",
                e
            )))
        }
    }
}

/// DELETE /api/v1/alert_rules/{id} - Delete (disable) a correlation rule
pub async fn delete_rule(
    State(state): State<AppState>,
    Path(rule_id): Path<String>,
) -> Result<impl IntoResponse> {
    debug!("Deleting alert rule: {}", rule_id);

    let client = get_clickhouse_client(&state).await?;

    // Disable the rule instead of hard delete
    let query = format!(
        "ALTER TABLE dev.alert_rules UPDATE enabled = 0, updated_at = now() WHERE rule_id = '{}'",
        rule_id
    );

    match client.query(&query).execute().await {
        Ok(_) => {
            let response = serde_json::json!({
                "rule_id": rule_id,
                "status": "disabled",
                "message": "Alert rule disabled successfully"
            });

            info!("Alert rule {} disabled successfully", rule_id);
            Ok(Json(response))
        }
        Err(e) => {
            error!("Failed to disable alert rule {}: {}", rule_id, e);
            Err(crate::error::PipelineError::database(format!(
                "Failed to disable alert rule: {}",
                e
            )))
        }
    }
}

/// POST /api/v1/rules/evaluate - Manually trigger rule evaluation
pub async fn evaluate_rules(
    State(state): State<AppState>,
    Json(request): Json<EvaluateRulesRequest>,
) -> Result<impl IntoResponse> {
    debug!("Manual rule evaluation triggered");

    // For now, return a success response
    // In a production system, this would trigger the correlation engine
    let response = serde_json::json!({
        "status": "triggered",
        "message": "Rule evaluation triggered successfully",
        "rule_ids": request.rule_ids.unwrap_or_else(|| vec!["all".to_string()]),
        "timestamp": Utc::now()
    });

    info!("Rule evaluation triggered manually");
    Ok(Json(response))
}
