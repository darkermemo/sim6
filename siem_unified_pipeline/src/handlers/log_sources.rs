use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use clickhouse::Client as ClickHouseClient;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::error::Result;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogSource {
    pub tenant_id: String,
    pub source_id: String,
    pub source_type: String,
    pub source_name: String,
    pub configuration: serde_json::Value,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateLogSourceRequest {
    pub source_id: String,
    pub source_type: String,
    pub source_name: String,
    pub configuration: serde_json::Value,
    pub enabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LogSourcesResponse {
    pub sources: Vec<LogSource>,
    pub total_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateLogSourceResponse {
    pub tenant_id: String,
    pub source_id: String,
    pub status: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
}

// Helper function to get ClickHouse client from config
async fn get_clickhouse_client(
    state: &AppState,
) -> Result<ClickHouseClient> {
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

/// POST /api/v1/tenants/{id}/sources - Register a log source for a tenant
pub async fn create_log_source(
    State(state): State<AppState>,
    Path(tenant_id): Path<String>,
    Json(request): Json<CreateLogSourceRequest>,
) -> Result<impl IntoResponse> {
    debug!(
        "Creating log source {} for tenant {}",
        request.source_id, tenant_id
    );

    let client = get_clickhouse_client(&state).await?;
    let created_at = Utc::now();
    let enabled = request.enabled.unwrap_or(true);

    // Convert configuration to JSON string
    let config_str = serde_json::to_string(&request.configuration).map_err(|e| {
        crate::error::PipelineError::validation(format!("Invalid configuration JSON: {}", e))
    })?;

    // Insert log source into ClickHouse
    let query = "INSERT INTO dev.log_sources (tenant_id, source_id, source_type, source_name, configuration, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

    match client
        .query(query)
        .bind(&tenant_id)
        .bind(&request.source_id)
        .bind(&request.source_type)
        .bind(&request.source_name)
        .bind(&config_str)
        .bind(if enabled { 1u8 } else { 0u8 })
        .bind(created_at)
        .bind(created_at)
        .execute()
        .await
    {
        Ok(_) => {
            let response = CreateLogSourceResponse {
                tenant_id: tenant_id.clone(),
                source_id: request.source_id.clone(),
                status: "created".to_string(),
                message: "Log source registered successfully".to_string(),
                created_at,
            };

            info!(
                "Log source {} created for tenant {}",
                request.source_id, tenant_id
            );
            Ok((StatusCode::CREATED, Json(response)))
        }
        Err(e) => {
            error!(
                "Failed to create log source {} for tenant {}: {}",
                request.source_id, tenant_id, e
            );
            Err(crate::error::PipelineError::database(format!(
                "Failed to create log source: {}",
                e
            )))
        }
    }
}

/// GET /api/v1/tenants/{id}/sources - List log sources for a tenant
pub async fn get_log_sources(
    State(state): State<AppState>,
    Path(tenant_id): Path<String>,
) -> Result<impl IntoResponse> {
    debug!("Fetching log sources for tenant: {}", tenant_id);

    let client = get_clickhouse_client(&state).await?;

    // Query log sources from ClickHouse
    let query = "SELECT tenant_id, source_id, source_type, source_name, configuration, enabled, created_at, updated_at FROM dev.log_sources WHERE tenant_id = ? ORDER BY created_at";

    match client
        .query(query)
        .bind(&tenant_id)
        .fetch_all::<(String, String, String, String, String, u8, String, String)>()
        .await
    {
        Ok(rows) => {
            let mut sources = Vec::new();

            for (
                tenant_id,
                source_id,
                source_type,
                source_name,
                config_str,
                enabled_flag,
                created_at_str,
                updated_at_str,
            ) in rows
            {
                let configuration = serde_json::from_str(&config_str)
                    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

                sources.push(LogSource {
                    tenant_id,
                    source_id,
                    source_type,
                    source_name,
                    configuration,
                    enabled: enabled_flag == 1,
                    created_at: chrono::DateTime::parse_from_rfc3339(&created_at_str)
                        .unwrap_or_else(|_| chrono::Utc::now().into())
                        .with_timezone(&chrono::Utc),
                    updated_at: chrono::DateTime::parse_from_rfc3339(&updated_at_str)
                        .unwrap_or_else(|_| chrono::Utc::now().into())
                        .with_timezone(&chrono::Utc),
                });
            }

            let response = LogSourcesResponse {
                total_count: sources.len(),
                sources,
            };

            info!(
                "Retrieved {} log sources for tenant {}",
                response.total_count, tenant_id
            );
            Ok(Json(response))
        }
        Err(e) => {
            error!(
                "Failed to fetch log sources for tenant {}: {}",
                tenant_id, e
            );
            Err(crate::error::PipelineError::database(format!(
                "Failed to fetch log sources: {}",
                e
            )))
        }
    }
}

/// GET /api/v1/tenants/{id}/sources/{source_id} - Get specific log source details
pub async fn get_log_source_detail(
    State(state): State<AppState>,
    Path((tenant_id, source_id)): Path<(String, String)>,
) -> Result<impl IntoResponse> {
    debug!("Fetching log source {} for tenant {}", source_id, tenant_id);

    let client = get_clickhouse_client(&state).await?;

    let query = "SELECT tenant_id, source_id, source_type, source_name, configuration, enabled, created_at, updated_at FROM dev.log_sources WHERE tenant_id = ? AND source_id = ?";

    match client
        .query(query)
        .bind(&tenant_id)
        .bind(&source_id)
        .fetch_optional::<(String, String, String, String, String, u8, String, String)>()
        .await
    {
        Ok(Some((
            tenant_id,
            source_id,
            source_type,
            source_name,
            config_str,
            enabled_flag,
            created_at_str,
            updated_at_str,
        ))) => {
            let configuration = serde_json::from_str(&config_str)
                .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

            let source = LogSource {
                tenant_id,
                source_id,
                source_type,
                source_name,
                configuration,
                enabled: enabled_flag == 1,
                created_at: chrono::DateTime::parse_from_rfc3339(&created_at_str)
                    .unwrap_or_else(|_| chrono::Utc::now().into())
                    .with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&updated_at_str)
                    .unwrap_or_else(|_| chrono::Utc::now().into())
                    .with_timezone(&chrono::Utc),
            };

            info!(
                "Retrieved log source {} for tenant {}",
                source.source_id, source.tenant_id
            );
            Ok(Json(source))
        }
        Ok(None) => {
            warn!(
                "Log source {} not found for tenant {}",
                source_id, tenant_id
            );
            Err(crate::error::PipelineError::not_found(format!(
                "Log source {} not found for tenant {}",
                source_id, tenant_id
            )))
        }
        Err(e) => {
            error!(
                "Failed to fetch log source {} for tenant {}: {}",
                source_id, tenant_id, e
            );
            Err(crate::error::PipelineError::database(format!(
                "Failed to fetch log source: {}",
                e
            )))
        }
    }
}

/// PUT /api/v1/tenants/{id}/sources/{source_id} - Update log source
pub async fn update_log_source(
    State(state): State<AppState>,
    Path((tenant_id, source_id)): Path<(String, String)>,
    Json(request): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    debug!("Updating log source {} for tenant {}", source_id, tenant_id);

    let client = get_clickhouse_client(&state).await?;
    let updated_at = Utc::now();

    // Build dynamic update query based on provided fields
    let mut set_clauses = Vec::new();
    let mut values: Vec<String> = Vec::new();

    if let Some(source_name) = request.get("source_name").and_then(|v| v.as_str()) {
        set_clauses.push("source_name = ?");
        values.push(source_name.to_string());
    }

    if let Some(configuration) = request.get("configuration") {
        let config_str = serde_json::to_string(configuration).map_err(|e| {
            crate::error::PipelineError::validation(format!("Invalid configuration JSON: {}", e))
        })?;
        set_clauses.push("configuration = ?");
        values.push(config_str);
    }

    if let Some(enabled) = request.get("enabled").and_then(|v| v.as_bool()) {
        set_clauses.push("enabled = ?");
        values.push(if enabled {
            "1".to_string()
        } else {
            "0".to_string()
        });
    }

    if set_clauses.is_empty() {
        return Err(crate::error::PipelineError::validation(
            "No valid fields to update".to_string(),
        ));
    }

    set_clauses.push("updated_at = ?");
    values.push(updated_at.to_rfc3339());

    let query = format!(
        "ALTER TABLE dev.log_sources UPDATE {} WHERE tenant_id = ? AND source_id = ?",
        set_clauses.join(", ")
    );

    let mut clickhouse_query = client.query(&query);
    for value in &values {
        clickhouse_query = clickhouse_query.bind(value);
    }
    clickhouse_query = clickhouse_query.bind(&tenant_id).bind(&source_id);

    match clickhouse_query.execute().await {
        Ok(_) => {
            let response = serde_json::json!({
                "tenant_id": tenant_id,
                "source_id": source_id,
                "status": "updated",
                "message": "Log source updated successfully",
                "updated_at": updated_at
            });

            info!("Log source {} updated for tenant {}", source_id, tenant_id);
            Ok(Json(response))
        }
        Err(e) => {
            error!(
                "Failed to update log source {} for tenant {}: {}",
                source_id, tenant_id, e
            );
            Err(crate::error::PipelineError::database(format!(
                "Failed to update log source: {}",
                e
            )))
        }
    }
}
