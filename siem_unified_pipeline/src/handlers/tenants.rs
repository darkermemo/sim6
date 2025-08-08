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
pub struct Tenant {
    pub tenant_id: String,
    pub tenant_name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTenantRequest {
    pub tenant_id: String,
    pub tenant_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TenantsResponse {
    pub tenants: Vec<Tenant>,
    pub total_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTenantResponse {
    pub tenant_id: String,
    pub status: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TenantDetailResponse {
    pub tenant_id: String,
    pub tenant_name: String,
    pub created_at: DateTime<Utc>,
    pub event_count: u64,
    pub last_event_time: Option<DateTime<Utc>>,
}

// Helper function to get ClickHouse client from config
async fn get_clickhouse_client(
    state: &AppState,
) -> Result<ClickHouseClient, crate::error::PipelineError> {
    let config = state.config.read().await;

    // Extract ClickHouse connection details from the config
    // This assumes ClickHouse is configured as a destination
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

/// GET /api/v1/tenants - List all tenants
pub async fn get_tenants(State(state): State<AppState>) -> Result<impl IntoResponse> {
    debug!("Fetching all tenants");

    let client = get_clickhouse_client(&state).await.map_err(|e| {
        error!("Failed to get ClickHouse client: {}", e);
        e
    })?;

    // Query tenants from ClickHouse
    let query = "SELECT tenant_id, tenant_name, created_at FROM dev.tenants ORDER BY created_at";

    match client
        .query(query)
        .fetch_all::<(String, String, DateTime<Utc>)>()
        .await
    {
        Ok(rows) => {
            let tenants: Vec<Tenant> = rows
                .into_iter()
                .map(|(tenant_id, tenant_name, created_at)| Tenant {
                    tenant_id,
                    tenant_name,
                    created_at,
                })
                .collect();

            let response = TenantsResponse {
                total_count: tenants.len(),
                tenants,
            };

            info!("Retrieved {} tenants", response.total_count);
            Ok(Json(response))
        }
        Err(e) => {
            error!("Failed to fetch tenants: {}", e);
            Err(crate::error::PipelineError::database(format!(
                "Failed to fetch tenants: {}",
                e
            )))
        }
    }
}

/// POST /api/v1/tenants - Create a new tenant
pub async fn create_tenant(
    State(state): State<AppState>,
    Json(request): Json<CreateTenantRequest>,
) -> Result<impl IntoResponse> {
    debug!("Creating tenant: {}", request.tenant_id);

    let client = get_clickhouse_client(&state).await?;
    let created_at = Utc::now();

    // Insert tenant into ClickHouse
    let query = "INSERT INTO dev.tenants (tenant_id, tenant_name, created_at) VALUES (?, ?, ?)";

    match client
        .query(query)
        .bind(&request.tenant_id)
        .bind(&request.tenant_name)
        .bind(created_at)
        .execute()
        .await
    {
        Ok(_) => {
            let response = CreateTenantResponse {
                tenant_id: request.tenant_id.clone(),
                status: "created".to_string(),
                message: "Tenant created successfully".to_string(),
                created_at,
            };

            info!("Tenant {} created successfully", request.tenant_id);
            Ok((StatusCode::CREATED, Json(response)))
        }
        Err(e) => {
            error!("Failed to create tenant {}: {}", request.tenant_id, e);
            Err(crate::error::PipelineError::database(format!(
                "Failed to create tenant: {}",
                e
            )))
        }
    }
}

/// GET /api/v1/tenants/{id} - Get tenant details
pub async fn get_tenant(
    State(state): State<AppState>,
    Path(tenant_id): Path<String>,
) -> Result<impl IntoResponse> {
    debug!("Fetching tenant details: {}", tenant_id);

    let client = get_clickhouse_client(&state).await?;

    // Get tenant basic info
    let tenant_query =
        "SELECT tenant_id, tenant_name, created_at FROM dev.tenants WHERE tenant_id = ?";
    let tenant_row = client
        .query(tenant_query)
        .bind(&tenant_id)
        .fetch_optional::<(String, String, DateTime<Utc>)>()
        .await
        .map_err(|e| {
            crate::error::PipelineError::database(format!("Failed to fetch tenant: {}", e))
        })?;

    if let Some((tenant_id, tenant_name, created_at)) = tenant_row {
        // Get event statistics for this tenant
        let stats_query = "SELECT count(*) as event_count, max(event_timestamp) as last_event FROM dev.events WHERE tenant_id = ?";
        let (event_count, last_event_time): (u64, Option<DateTime<Utc>>) = client
            .query(stats_query)
            .bind(&tenant_id)
            .fetch_one()
            .await
            .unwrap_or((0, None));

        let response = TenantDetailResponse {
            tenant_id,
            tenant_name,
            created_at,
            event_count,
            last_event_time,
        };

        info!("Retrieved details for tenant {}", response.tenant_id);
        Ok(Json(response))
    } else {
        warn!("Tenant {} not found", tenant_id);
        Err(crate::error::PipelineError::not_found(format!(
            "Tenant {} not found",
            tenant_id
        )))
    }
}

/// PUT /api/v1/tenants/{id} - Update tenant
pub async fn update_tenant(
    State(state): State<AppState>,
    Path(tenant_id): Path<String>,
    Json(request): Json<serde_json::Value>,
) -> Result<impl IntoResponse> {
    debug!("Updating tenant: {}", tenant_id);

    let client = get_clickhouse_client(&state).await?;

    if let Some(tenant_name) = request.get("tenant_name").and_then(|v| v.as_str()) {
        let query = "ALTER TABLE dev.tenants UPDATE tenant_name = ? WHERE tenant_id = ?";

        match client
            .query(query)
            .bind(tenant_name)
            .bind(&tenant_id)
            .execute()
            .await
        {
            Ok(_) => {
                let response = serde_json::json!({
                    "tenant_id": tenant_id,
                    "status": "updated",
                    "message": "Tenant updated successfully"
                });

                info!("Tenant {} updated successfully", tenant_id);
                Ok(Json(response))
            }
            Err(e) => {
                error!("Failed to update tenant {}: {}", tenant_id, e);
                Err(crate::error::PipelineError::database(format!(
                    "Failed to update tenant: {}",
                    e
                )))
            }
        }
    } else {
        Err(crate::error::PipelineError::validation(
            "tenant_name is required".to_string(),
        ))
    }
}
