use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::v2::{AppError, AppState};
use crate::v2::metrics;

#[derive(Debug, Deserialize)]
pub struct ListTenantsQuery {
    pub cursor: Option<String>,
    pub limit: Option<u32>,
    pub q: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTenantRequest {
    pub tenant_id: Option<u64>,
    pub slug: String,
    pub name: String,
    pub region: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTenantRequest {
    pub slug: Option<String>,
    pub name: Option<String>,
    pub region: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Tenant {
    pub tenant_id: u64,
    pub slug: String,
    pub name: String,
    pub status: String,
    pub region: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ListTenantsResponse {
    pub tenants: Vec<Tenant>,
    pub next_cursor: Option<String>,
    pub total: u64,
}

#[derive(Debug, Serialize)]
pub struct CreateTenantResponse {
    pub tenant: Tenant,
    pub replayed: bool,
}

pub async fn list_tenants(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListTenantsQuery>,
) -> Result<Response, AppError> {
    let limit = query.limit.unwrap_or(50).min(100);
    let offset = query.cursor.and_then(|c| c.parse::<u64>().ok()).unwrap_or(0);
    
    let mut sql = "SELECT tenant_id, slug, name, status, region, created_at FROM dev.tenants WHERE 1=1".to_string();
    let mut params: Vec<String> = Vec::new();
    
    if let Some(search) = &query.q {
        sql.push_str(" AND (slug ILIKE ? OR name ILIKE ?)");
        params.push(format!("%{}%", search));
        params.push(format!("%{}%", search));
    }
    
    sql.push_str(&format!(" ORDER BY tenant_id LIMIT {} OFFSET {}", limit, offset));
    
    let mut result = state.clickhouse.query(&sql, &params).await?;
    
    let mut tenants = Vec::new();
    while let Some(row) = result.next().await? {
        tenants.push(Tenant {
            tenant_id: row.get("tenant_id")?,
            slug: row.get("slug")?,
            name: row.get("name")?,
            status: row.get("status")?,
            region: row.get("region")?,
            created_at: row.get("created_at")?,
        });
    }
    
    // Get total count
    let count_sql = "SELECT count() as total FROM dev.tenants WHERE 1=1";
    let mut count_result = state.clickhouse.query(count_sql, &[]).await?;
    let total: u64 = if let Some(row) = count_result.next().await? {
        row.get("total")?
    } else {
        0
    };
    
    let next_cursor = if tenants.len() == limit as usize {
        Some((offset + limit).to_string())
    } else {
        None
    };
    
    let response = ListTenantsResponse {
        tenants,
        next_cursor,
        total,
    };
    
    Ok(Json(response).into_response())
}

pub async fn create_tenant(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateTenantRequest>,
) -> Result<Response, AppError> {
    let tenant_id = req.tenant_id.unwrap_or_else(|| {
        // Generate a new tenant ID if not provided
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    });
    
    let region = req.region.unwrap_or_else(|| "default".to_string());
    let status = req.status.unwrap_or_else(|| "ACTIVE".to_string());
    
    // Check if tenant already exists
    let existing_sql = "SELECT tenant_id FROM dev.tenants WHERE tenant_id = ? OR slug = ?";
    let mut existing_result = state.clickhouse.query(existing_sql, &[tenant_id.to_string(), req.slug.clone()]).await?;
    
    let replayed = existing_result.next().await?.is_some();
    
    if !replayed {
        // Insert new tenant
        let insert_sql = "INSERT INTO dev.tenants (tenant_id, slug, name, status, region) VALUES (?, ?, ?, ?, ?)";
        state.clickhouse.execute(insert_sql, &[
            tenant_id.to_string(),
            req.slug.clone(),
            req.name.clone(),
            status.clone(),
            region.clone(),
        ]).await?;
    }
    
    let tenant = Tenant {
        tenant_id,
        slug: req.slug,
        name: req.name,
        status,
        region,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    
    let response = CreateTenantResponse {
        tenant,
        replayed,
    };
    
    Ok(Json(response).into_response())
}

pub async fn get_tenant(
    State(state): State<Arc<AppState>>,
    Path(tenant_id): Path<u64>,
) -> Result<Response, AppError> {
    let sql = "SELECT tenant_id, slug, name, status, region, created_at FROM dev.tenants WHERE tenant_id = ?";
    let mut result = state.clickhouse.query(sql, &[tenant_id.to_string()]).await?;
    
    if let Some(row) = result.next().await? {
        let tenant = Tenant {
            tenant_id: row.get("tenant_id")?,
            slug: row.get("slug")?,
            name: row.get("name")?,
            status: row.get("status")?,
            region: row.get("region")?,
            created_at: row.get("created_at")?,
        };
        Ok(Json(tenant).into_response())
    } else {
        Err(AppError::NotFound("Tenant not found".to_string()))
    }
}

pub async fn update_tenant(
    State(state): State<Arc<AppState>>,
    Path(tenant_id): Path<u64>,
    Json(req): Json<UpdateTenantRequest>,
) -> Result<Response, AppError> {
    let mut updates = Vec::new();
    let mut params = Vec::new();
    
    if let Some(slug) = req.slug {
        updates.push("slug = ?");
        params.push(slug);
    }
    
    if let Some(name) = req.name {
        updates.push("name = ?");
        params.push(name);
    }
    
    if let Some(region) = req.region {
        updates.push("region = ?");
        params.push(region);
    }
    
    if let Some(status) = req.status {
        updates.push("status = ?");
        params.push(status);
    }
    
    if updates.is_empty() {
        return Err(AppError::BadRequest("No fields to update".to_string()));
    }
    
    params.push(tenant_id.to_string());
    
    let sql = format!(
        "ALTER TABLE dev.tenants UPDATE {} WHERE tenant_id = ?",
        updates.join(", ")
    );
    
    state.clickhouse.execute(&sql, &params).await?;
    
    Ok(StatusCode::OK.into_response())
}
