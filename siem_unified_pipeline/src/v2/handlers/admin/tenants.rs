use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
// use uuid::Uuid;

use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};
// use crate::v2::metrics;

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
) -> PipelineResult<Json<serde_json::Value>> {
    let limit: u64 = query.limit.unwrap_or(50).min(100) as u64;
    let offset = query.cursor.and_then(|c| c.parse::<u64>().ok()).unwrap_or(0);
    
    let mut sql = "SELECT tenant_id, slug, name, status, region, created_at FROM dev.tenants WHERE 1=1".to_string();
    let mut params: Vec<String> = Vec::new();
    
    if let Some(search) = &query.q {
        sql.push_str(" AND (slug ILIKE ? OR name ILIKE ?)");
        params.push(format!("%{}%", search));
        params.push(format!("%{}%", search));
    }
    
    sql.push_str(&format!(" ORDER BY tenant_id LIMIT {} OFFSET {}", limit, offset));
    
    #[derive(Deserialize, clickhouse::Row)]
    struct Row { tenant_id: u64, slug: String, name: String, status: String, region: String, created_at: String }
    let rows: Vec<Row> = state.ch.query(&sql).fetch_all::<Row>().await?;
    let tenants: Vec<Tenant> = rows.into_iter().map(|r| Tenant{ tenant_id:r.tenant_id, slug:r.slug, name:r.name, status:r.status, region:r.region, created_at:r.created_at }).collect();
    
    // Get total count
    let count_sql = "SELECT count() as total FROM dev.tenants WHERE 1=1";
    let total: u64 = state.ch.query(count_sql).fetch_one::<u64>().await.unwrap_or(0);
    
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
    
    Ok(Json(serde_json::to_value(response)?))
}

pub async fn create_tenant(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateTenantRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
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
    let replayed: Option<u8> = state.ch.query(existing_sql).fetch_optional::<u8>().await?;
    let replayed = replayed.is_some();
    
    if !replayed {
        // Insert new tenant
        let insert_sql = "INSERT INTO dev.tenants (tenant_id, slug, name, status, region) VALUES (?, ?, ?, ?, ?)";
        state
            .ch
            .query(insert_sql)
            .bind(tenant_id.to_string())
            .bind(req.slug.clone())
            .bind(req.name.clone())
            .bind(status.clone())
            .bind(region.clone())
            .execute()
            .await?;
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
    
    Ok(Json(serde_json::to_value(response)?))
}

pub async fn get_tenant(
    State(state): State<Arc<AppState>>,
    Path(tenant_id): Path<u64>,
) -> PipelineResult<Json<serde_json::Value>> {
    let sql = "SELECT tenant_id, slug, name, status, region, created_at FROM dev.tenants WHERE tenant_id = ?";
    #[derive(Deserialize, clickhouse::Row)]
    struct TR { tenant_id: u64, slug: String, name: String, status: String, region: String, created_at: String }
    let row: Option<TR> = state.ch.query(sql).bind(tenant_id).fetch_optional::<TR>().await?;
    match row { Some(r) => Ok(Json(serde_json::to_value(Tenant{ tenant_id:r.tenant_id, slug:r.slug, name:r.name, status:r.status, region:r.region, created_at:r.created_at })?)), None => Err(PipelineError::not_found("Tenant not found")) }
}

pub async fn update_tenant(
    State(state): State<Arc<AppState>>,
    Path(tenant_id): Path<u64>,
    Json(req): Json<UpdateTenantRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
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
        return Err(PipelineError::validation("No fields to update"));
    }
    
    params.push(tenant_id.to_string());
    
    let sql = format!(
        "ALTER TABLE dev.tenants UPDATE {} WHERE tenant_id = ?",
        updates.join(", ")
    );
    
    state.ch.query(&sql).execute().await?;
    
    Ok(Json(serde_json::json!({"status": "ok"})))
}
