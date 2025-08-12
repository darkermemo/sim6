use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::v2::{AppError, AppState};

#[derive(Debug, Deserialize)]
pub struct UpdateRoleRequest {
    pub perms: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct Role {
    pub role: String,
    pub description: String,
    pub perms: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ListRolesResponse {
    pub roles: Vec<Role>,
}

pub async fn list_roles(
    State(state): State<Arc<AppState>>,
) -> Result<Response, AppError> {
    let sql = "SELECT role, description, perms FROM dev.roles ORDER BY role";
    let mut result = state.clickhouse.query(sql, &[]).await?;
    
    let mut roles = Vec::new();
    while let Some(row) = result.next().await? {
        roles.push(Role {
            role: row.get("role")?,
            description: row.get("description")?,
            perms: row.get("perms")?,
        });
    }
    
    let response = ListRolesResponse { roles };
    Ok(Json(response).into_response())
}

pub async fn update_role(
    State(state): State<Arc<AppState>>,
    Path(role): Path<String>,
    Json(req): Json<UpdateRoleRequest>,
) -> Result<Response, AppError> {
    // Validate permissions
    let valid_perms = [
        "*", "search:read", "search:write", "alerts:read", "alerts:write", 
        "rules:read", "rules:write", "rules:run", "exports:read", "exports:write",
        "admin:read", "admin:write"
    ];
    
    for perm in &req.perms {
        if !valid_perms.contains(&perm.as_str()) {
            return Err(AppError::BadRequest(format!("Invalid permission: {}", perm)));
        }
    }
    
    // Check if role exists
    let existing_sql = "SELECT role FROM dev.roles WHERE role = ?";
    let mut existing_result = state.clickhouse.query(existing_sql, &[role.clone()]).await?;
    
    if existing_result.next().await?.is_some() {
        // Update existing role
        let update_sql = "ALTER TABLE dev.roles UPDATE perms = ? WHERE role = ?";
        state.clickhouse.execute(update_sql, &[
            serde_json::to_string(&req.perms)?,
            role.clone(),
        ]).await?;
    } else {
        // Insert new role
        let insert_sql = "INSERT INTO dev.roles (role, description, perms) VALUES (?, ?, ?)";
        state.clickhouse.execute(insert_sql, &[
            role.clone(),
            format!("Custom role: {}", role),
            serde_json::to_string(&req.perms)?,
        ]).await?;
    }
    
    Ok(StatusCode::OK.into_response())
}
