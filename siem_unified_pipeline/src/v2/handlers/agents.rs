use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;
use blake3::Hasher;

use crate::v2::{AppError, AppState};
use crate::v2::metrics;

#[derive(Debug, Deserialize)]
pub struct ListAgentsQuery {
    pub tenant: Option<u64>,
    pub cursor: Option<String>,
    pub q: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEnrollKeyRequest {
    pub tenant_id: u64,
    pub ttl_days: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct EnrollAgentRequest {
    pub enroll_key: String,
    pub agent_facts: AgentFacts,
}

#[derive(Debug, Deserialize)]
pub struct AgentFacts {
    pub name: String,
    pub kind: String,
    pub version: String,
    pub hostname: Option<String>,
    pub os: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HeartbeatRequest {
    pub eps: u64,
    pub queue_depth: u64,
    pub version: String,
}

#[derive(Debug, Deserialize)]
pub struct ApplyConfigRequest {
    pub template_id: String,
    pub overrides: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct TestPipelineRequest {
    pub sample: String,
}

#[derive(Debug, Serialize)]
pub struct EnrollKey {
    pub tenant_id: u64,
    pub enroll_key: String,
    pub created_at: String,
    pub expires_at: String,
    pub revoked: bool,
}

#[derive(Debug, Serialize)]
pub struct CreateEnrollKeyResponse {
    pub enroll_key: String,
    pub expires_at: String,
}

#[derive(Debug, Serialize)]
pub struct EnrollAgentResponse {
    pub agent_id: String,
    pub api_key: String, // Secret returned once
}

#[derive(Debug, Serialize)]
pub struct Agent {
    pub agent_id: String,
    pub tenant_id: u64,
    pub name: String,
    pub kind: String,
    pub version: String,
    pub hostname: Option<String>,
    pub os: Option<String>,
    pub online: bool,
    pub last_seen_at: String,
    pub eps: u64,
    pub queue_depth: u64,
}

#[derive(Debug, Serialize)]
pub struct ListAgentsResponse {
    pub agents: Vec<Agent>,
    pub next_cursor: Option<String>,
    pub total: u64,
}

#[derive(Debug, Serialize)]
pub struct AgentConfig {
    pub endpoints: Vec<String>,
    pub parsers: Vec<String>,
    pub filters: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct TestPipelineResponse {
    pub accepted: u64,
    pub quarantined: u64,
    pub normalized: Option<String>,
    pub reasons: Option<Vec<String>>,
}

pub async fn list_agents(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListAgentsQuery>,
) -> Result<Response, AppError> {
    let limit = 50;
    let offset = query.cursor.and_then(|c| c.parse::<u64>().ok()).unwrap_or(0);
    
    let mut sql = "SELECT agent_id, tenant_id, name, kind, version, hostname, os, last_seen_at FROM dev.agents WHERE 1=1".to_string();
    let mut params: Vec<String> = Vec::new();
    
    if let Some(tenant) = query.tenant {
        sql.push_str(" AND tenant_id = ?");
        params.push(tenant.to_string());
    }
    
    if let Some(search) = &query.q {
        sql.push_str(" AND (name ILIKE ? OR kind ILIKE ?)");
        params.push(format!("%{}%", search));
        params.push(format!("%{}%", search));
    }
    
    sql.push_str(&format!(" ORDER BY last_seen_at DESC LIMIT {} OFFSET {}", limit, offset));
    
    let mut result = state.clickhouse.query(&sql, &params).await?;
    
    let mut agents = Vec::new();
    while let Some(row) = result.next().await? {
        let last_seen: String = row.get("last_seen_at")?;
        let online = chrono::DateTime::parse_from_rfc3339(&last_seen)
            .map(|dt| chrono::Utc::now() - dt < chrono::Duration::minutes(5))
            .unwrap_or(false);
        
        agents.push(Agent {
            agent_id: row.get("agent_id")?,
            tenant_id: row.get("tenant_id")?,
            name: row.get("name")?,
            kind: row.get("kind")?,
            version: row.get("version")?,
            hostname: row.get("hostname")?,
            os: row.get("os")?,
            online,
            last_seen_at: last_seen,
            eps: 0, // Would need to get from agents_online table
            queue_depth: 0, // Would need to get from agents_online table
        });
    }
    
    // Get total count
    let count_sql = "SELECT count() as total FROM dev.agents WHERE 1=1";
    let mut count_result = state.clickhouse.query(count_sql, &[]).await?;
    let total: u64 = if let Some(row) = count_result.next().await? {
        row.get("total")?
    } else {
        0
    };
    
    let next_cursor = if agents.len() == limit as usize {
        Some((offset + limit).to_string())
    } else {
        None
    };
    
    let response = ListAgentsResponse {
        agents,
        next_cursor,
        total,
    };
    
    Ok(Json(response).into_response())
}

pub async fn create_enroll_key(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateEnrollKeyRequest>,
) -> Result<Response, AppError> {
    let enroll_key = Uuid::new_v4().to_string();
    let ttl_days = req.ttl_days.unwrap_or(7);
    let expires_at = chrono::Utc::now() + chrono::Duration::days(ttl_days as i64);
    
    let insert_sql = "INSERT INTO dev.agent_enroll_keys (tenant_id, enroll_key, expires_at) VALUES (?, ?, ?)";
    state.clickhouse.execute(insert_sql, &[
        req.tenant_id.to_string(),
        enroll_key.clone(),
        expires_at.to_rfc3339(),
    ]).await?;
    
    let response = CreateEnrollKeyResponse {
        enroll_key,
        expires_at: expires_at.to_rfc3339(),
    };
    
    Ok(Json(response).into_response())
}

pub async fn enroll_agent(
    State(state): State<Arc<AppState>>,
    Json(req): Json<EnrollAgentRequest>,
) -> Result<Response, AppError> {
    // Validate enroll key
    let key_sql = "SELECT tenant_id, revoked FROM dev.agent_enroll_keys WHERE enroll_key = ? AND expires_at > now()";
    let mut key_result = state.clickhouse.query(key_sql, &[req.enroll_key.clone()]).await?;
    
    let (tenant_id, revoked): (u64, u8) = if let Some(row) = key_result.next().await? {
        (row.get("tenant_id")?, row.get("revoked")?)
    } else {
        return Err(AppError::BadRequest("Invalid or expired enroll key".to_string()));
    };
    
    if revoked == 1 {
        return Err(AppError::BadRequest("Enroll key has been revoked".to_string()));
    }
    
    let agent_id = Uuid::new_v4().to_string();
    let api_key = Uuid::new_v4().to_string();
    
    // Hash the API key
    let mut hasher = Hasher::new();
    hasher.update(api_key.as_bytes());
    let hash = hasher.finalize().to_string();
    
    // Insert agent
    let insert_agent_sql = "INSERT INTO dev.agents (agent_id, tenant_id, name, kind, version, hostname, os, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    state.clickhouse.execute(insert_agent_sql, &[
        agent_id.clone(),
        tenant_id.to_string(),
        req.agent_facts.name.clone(),
        req.agent_facts.kind.clone(),
        req.agent_facts.version.clone(),
        req.agent_facts.hostname.clone().unwrap_or_default(),
        req.agent_facts.os.clone().unwrap_or_default(),
        chrono::Utc::now().to_rfc3339(),
    ]).await?;
    
    // Insert API key
    let insert_key_sql = "INSERT INTO dev.api_keys (tenant_id, key_id, prefix, hash, role) VALUES (?, ?, ?, ?, ?)";
    state.clickhouse.execute(insert_key_sql, &[
        tenant_id.to_string(),
        agent_id.clone(),
        api_key[..8].to_string(),
        hash,
        "agent".to_string(),
    ]).await?;
    
    // Revoke enroll key (one-time use)
    let revoke_sql = "ALTER TABLE dev.agent_enroll_keys UPDATE revoked = 1 WHERE enroll_key = ?";
    state.clickhouse.execute(revoke_sql, &[req.enroll_key.clone()]).await?;
    
    // Increment metrics
    metrics::increment_counter("siem_v2_agents_enrolled_total", &[("tenant_id", &tenant_id.to_string())]);
    
    let response = EnrollAgentResponse {
        agent_id,
        api_key, // Only returned once
    };
    
    Ok(Json(response).into_response())
}

pub async fn heartbeat(
    State(state): State<Arc<AppState>>,
    Path(agent_id): Path<String>,
    Json(req): Json<HeartbeatRequest>,
) -> Result<Response, AppError> {
    // Update agent last_seen_at
    let update_agent_sql = "ALTER TABLE dev.agents UPDATE last_seen_at = ? WHERE agent_id = ?";
    state.clickhouse.execute(update_agent_sql, &[
        chrono::Utc::now().to_rfc3339(),
        agent_id.clone(),
    ]).await?;
    
    // Update or insert online status
    let upsert_online_sql = "INSERT INTO dev.agents_online (agent_id, eps, queue_depth, version, last_seen_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE eps = VALUES(eps), queue_depth = VALUES(queue_depth), version = VALUES(version), last_seen_at = VALUES(last_seen_at)";
    state.clickhouse.execute(upsert_online_sql, &[
        agent_id.clone(),
        req.eps.to_string(),
        req.queue_depth.to_string(),
        req.version.clone(),
        chrono::Utc::now().to_rfc3339(),
    ]).await?;
    
    // Increment metrics
    metrics::increment_counter("siem_v2_agents_heartbeat_total", &[("agent_id", &agent_id)]);
    
    Ok(StatusCode::OK.into_response())
}

pub async fn get_agent_config(
    State(state): State<Arc<AppState>>,
    Path(agent_id): Path<String>,
) -> Result<Response, AppError> {
    // Get agent details
    let agent_sql = "SELECT tenant_id FROM dev.agents WHERE agent_id = ?";
    let mut agent_result = state.clickhouse.query(agent_sql, &[agent_id.clone()]).await?;
    
    let tenant_id: u64 = if let Some(row) = agent_result.next().await? {
        row.get("tenant_id")?
    } else {
        return Err(AppError::NotFound("Agent not found".to_string()));
    };
    
    // Get log sources for this tenant
    let sources_sql = "SELECT endpoint FROM dev.log_sources_admin WHERE tenant_id = ? AND status = 'ENABLED'";
    let mut sources_result = state.clickhouse.query(sources_sql, &[tenant_id.to_string()]).await?;
    
    let mut endpoints = Vec::new();
    while let Some(row) = sources_result.next().await? {
        endpoints.push(row.get("endpoint")?);
    }
    
    // TODO: Get actual parsers and filters from configuration
    let config = AgentConfig {
        endpoints,
        parsers: vec!["default".to_string()],
        filters: serde_json::json!({}),
    };
    
    Ok(Json(config).into_response())
}

pub async fn apply_config(
    State(state): State<Arc<AppState>>,
    Path(agent_id): Path<String>,
    Json(req): Json<ApplyConfigRequest>,
) -> Result<Response, AppError> {
    // Get agent details
    let agent_sql = "SELECT tenant_id FROM dev.agents WHERE agent_id = ?";
    let mut agent_result = state.clickhouse.query(agent_sql, &[agent_id.clone()]).await?;
    
    let tenant_id: u64 = if let Some(row) = agent_result.next().await? {
        row.get("tenant_id")?
    } else {
        return Err(AppError::NotFound("Agent not found".to_string()));
    };
    
    // Get next version
    let version_sql = "SELECT max(version) as max_version FROM dev.agent_config_audit WHERE agent_id = ?";
    let mut version_result = state.clickhouse.query(version_sql, &[agent_id.clone()]).await?;
    
    let next_version: u64 = if let Some(row) = version_result.next().await? {
        row.get("max_version").unwrap_or(0) + 1
    } else {
        1
    };
    
    // Insert audit record
    let insert_sql = "INSERT INTO dev.agent_config_audit (tenant_id, agent_id, version, diff) VALUES (?, ?, ?, ?)";
    state.clickhouse.execute(insert_sql, &[
        tenant_id.to_string(),
        agent_id.clone(),
        next_version.to_string(),
        serde_json::to_string(&req.overrides)?,
    ]).await?;
    
    // Increment metrics
    metrics::increment_counter("siem_v2_agent_config_apply_total", &[("agent_id", &agent_id)]);
    
    Ok(StatusCode::OK.into_response())
}

pub async fn test_pipeline(
    State(state): State<Arc<AppState>>,
    Path(agent_id): Path<String>,
    Json(req): Json<TestPipelineRequest>,
) -> Result<Response, AppError> {
    // TODO: Implement actual pipeline testing
    // For now, return placeholder response
    let response = TestPipelineResponse {
        accepted: 1,
        quarantined: 0,
        normalized: Some(format!("Test normalized: {}", req.sample)),
        reasons: None,
    };
    
    // Increment metrics
    metrics::increment_counter("siem_v2_test_pipeline_total", &[
        ("agent_id", &agent_id),
        ("outcome", "success"),
    ]);
    
    Ok(Json(response).into_response())
}
