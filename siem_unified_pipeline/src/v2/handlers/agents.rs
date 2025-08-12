use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;
use blake3::Hasher;

use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};
// use crate::v2::metrics;

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

#[derive(Debug, Serialize, Deserialize, clickhouse::Row)]
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
) -> PipelineResult<Json<serde_json::Value>> {
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
    
    let mut query = state.ch.query(&sql);
    for param in &params {
        query = query.bind(param);
    }
    let agents: Vec<Agent> = query.fetch_all().await
        .map_err(|e| PipelineError::database(format!("list agents: {e}")))?;
    
    // Process agents to update online status
    let mut updated_agents = Vec::new();
    for agent in agents {
        let online = chrono::DateTime::parse_from_rfc3339(&agent.last_seen_at)
            .map(|dt| chrono::Utc::now().signed_duration_since(dt) < chrono::Duration::minutes(5))
            .unwrap_or(false);
        
        updated_agents.push(Agent {
            agent_id: agent.agent_id,
            tenant_id: agent.tenant_id,
            name: agent.name,
            kind: agent.kind,
            version: agent.version,
            hostname: agent.hostname,
            os: agent.os,
            online,
            last_seen_at: agent.last_seen_at,
            eps: 0, // Would need to get from agents_online table
            queue_depth: 0, // Would need to get from agents_online table
        });
    }
    
    // Get total count
    let count_sql = "SELECT count() as total FROM dev.agents WHERE 1=1";
    let total: u64 = state.ch.query(count_sql)
        .fetch_one::<u64>()
        .await
        .map_err(|e| PipelineError::database(format!("count agents: {e}")))?;
    
    let next_cursor = if updated_agents.len() == limit as usize {
        Some((offset + limit).to_string())
    } else {
        None
    };
    
    let response = ListAgentsResponse {
        agents: updated_agents,
        next_cursor,
        total,
    };
    
    Ok(Json(serde_json::to_value(response)?))
}

pub async fn create_enroll_key(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateEnrollKeyRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    let enroll_key = Uuid::new_v4().to_string();
    let ttl_days = req.ttl_days.unwrap_or(7);
    let expires_at = chrono::Utc::now() + chrono::Duration::days(ttl_days as i64);
    
    let insert_sql = "INSERT INTO dev.agent_enroll_keys (tenant_id, enroll_key, expires_at) VALUES (?, ?, ?)";
    state.ch.query(insert_sql)
        .bind(req.tenant_id)
        .bind(&enroll_key)
        .bind(expires_at.to_rfc3339())
        .execute()
        .await
        .map_err(|e| PipelineError::database(format!("create enroll key: {e}")))?;
    
    let response = CreateEnrollKeyResponse {
        enroll_key,
        expires_at: expires_at.to_rfc3339(),
    };
    
    Ok(Json(serde_json::to_value(response)?))
}

pub async fn enroll_agent(
    State(state): State<Arc<AppState>>,
    Json(req): Json<EnrollAgentRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    // Validate enroll key
    #[derive(clickhouse::Row, Deserialize)]
    struct KeyRow { tenant_id: u64, revoked: u8 }
    
    let key_sql = "SELECT tenant_id, revoked FROM dev.agent_enroll_keys WHERE enroll_key = ? AND expires_at > now()";
    let key_row: Option<KeyRow> = state.ch.query(key_sql)
        .bind(&req.enroll_key)
        .fetch_optional()
        .await
        .map_err(|e| PipelineError::database(format!("check enroll key: {e}")))?;
    
    let key_info = key_row.ok_or_else(|| PipelineError::validation("Invalid or expired enroll key"))?;
    let tenant_id = key_info.tenant_id;
    let revoked = key_info.revoked;
    
    if revoked == 1 {
        return Err(PipelineError::validation("Enroll key has been revoked"));
    }
    
    let agent_id = Uuid::new_v4().to_string();
    let api_key = Uuid::new_v4().to_string();
    
    // Hash the API key
    let mut hasher = Hasher::new();
    hasher.update(api_key.as_bytes());
    let hash = hasher.finalize().to_string();
    
    // Insert agent
    let insert_agent_sql = "INSERT INTO dev.agents (agent_id, tenant_id, name, kind, version, hostname, os, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    state.ch.query(insert_agent_sql)
        .bind(&agent_id)
        .bind(tenant_id)
        .bind(&req.agent_facts.name)
        .bind(&req.agent_facts.kind)
        .bind(&req.agent_facts.version)
        .bind(req.agent_facts.hostname.clone().unwrap_or_default())
        .bind(req.agent_facts.os.clone().unwrap_or_default())
        .bind(chrono::Utc::now().to_rfc3339())
        .execute()
        .await
        .map_err(|e| PipelineError::database(format!("insert agent: {e}")))?;
    
    // Insert API key
    let insert_key_sql = "INSERT INTO dev.api_keys (tenant_id, key_id, prefix, hash, role) VALUES (?, ?, ?, ?, ?)";
    state.ch.query(insert_key_sql)
        .bind(tenant_id)
        .bind(&agent_id)
        .bind(&api_key[..8])
        .bind(&hash)
        .bind("agent")
        .execute()
        .await
        .map_err(|e| PipelineError::database(format!("insert api key: {e}")))?;
    
    // Revoke enroll key (one-time use)
    let revoke_sql = "ALTER TABLE dev.agent_enroll_keys UPDATE revoked = 1 WHERE enroll_key = ?";
    state.ch.query(revoke_sql)
        .bind(&req.enroll_key)
        .execute()
        .await
        .map_err(|e| PipelineError::database(format!("revoke enroll key: {e}")))?;
    
    // Increment metrics
    // metrics::increment_counter("siem_v2_agents_enrolled_total", &[("tenant_id", &tenant_id.to_string())]);
    
    let response = EnrollAgentResponse {
        agent_id,
        api_key, // Only returned once
    };
    
    Ok(Json(serde_json::to_value(response)?))
}

pub async fn heartbeat(
    State(state): State<Arc<AppState>>,
    Path(agent_id): Path<String>,
    Json(req): Json<HeartbeatRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    // Update agent last_seen_at
    let update_agent_sql = "ALTER TABLE dev.agents UPDATE last_seen_at = ? WHERE agent_id = ?";
    state.ch.query(update_agent_sql)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(&agent_id)
        .execute()
        .await
        .map_err(|e| PipelineError::database(format!("update agent: {e}")))?;
    
    // Update or insert online status
    let upsert_online_sql = "INSERT INTO dev.agents_online (agent_id, eps, queue_depth, version, last_seen_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE eps = VALUES(eps), queue_depth = VALUES(queue_depth), version = VALUES(version), last_seen_at = VALUES(last_seen_at)";
    state.ch.query(upsert_online_sql)
        .bind(&agent_id)
        .bind(req.eps)
        .bind(req.queue_depth)
        .bind(&req.version)
        .bind(chrono::Utc::now().to_rfc3339())
        .execute()
        .await
        .map_err(|e| PipelineError::database(format!("upsert agent online: {e}")))?;
    
    // Increment metrics
    // metrics::increment_counter("siem_v2_agents_heartbeat_total", &[("agent_id", &agent_id)]);
    
    Ok(Json(serde_json::json!({"status": "ok"})))
}

pub async fn get_agent_config(
    State(state): State<Arc<AppState>>,
    Path(_agent_id): Path<String>,
) -> PipelineResult<Json<serde_json::Value>> {
    // Get agent details
    let agent_sql = "SELECT tenant_id FROM dev.agents WHERE agent_id = ?";
    let _agent_result = state.ch.query(agent_sql);
    
    let tenant_id: Option<u64> = state.ch.query(agent_sql).fetch_optional::<u64>().await?;
    let _tenant_id = tenant_id.ok_or_else(|| PipelineError::not_found("Agent not found"))?;
    
    // Get log sources for this tenant
    let sources_sql = "SELECT endpoint FROM dev.log_sources_admin WHERE tenant_id = ? AND status = 'ENABLED'";
    let endpoints: Vec<String> = state
        .ch
        .query(sources_sql)
        .fetch_all::<String>()
        .await?;
    
    // TODO: Get actual parsers and filters from configuration
    let config = AgentConfig {
        endpoints,
        parsers: vec!["default".to_string()],
        filters: serde_json::json!({}),
    };
    
    Ok(Json(serde_json::to_value(config)?))
}

pub async fn apply_config(
    State(state): State<Arc<AppState>>,
    Path(agent_id): Path<String>,
    Json(req): Json<ApplyConfigRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    // Get agent details
    let agent_sql = "SELECT tenant_id FROM dev.agents WHERE agent_id = ?";
    let _agent_result = state.ch.query(agent_sql);
    
    let tenant_id: Option<u64> = state.ch.query(agent_sql).fetch_optional::<u64>().await?;
    let tenant_id = tenant_id.ok_or_else(|| PipelineError::not_found("Agent not found"))?;
    
    // Get next version
    let version_sql = "SELECT max(version) as max_version FROM dev.agent_config_audit WHERE agent_id = ?";
    let max_version: Option<u64> = state.ch.query(version_sql).fetch_optional::<u64>().await?;
    let next_version: u64 = max_version.unwrap_or(0) + 1;
    
    // Insert audit record
    let insert_sql = "INSERT INTO dev.agent_config_audit (tenant_id, agent_id, version, diff) VALUES (?, ?, ?, ?)";
    state.ch.query(insert_sql)
        .bind(tenant_id)
        .bind(&agent_id)
        .bind(next_version)
        .bind(&serde_json::to_string(&req.overrides)?)
        .execute()
        .await
        .map_err(|e| PipelineError::database(format!("insert config audit: {e}")))?;
    
    // Increment metrics
    // metrics::increment_counter("siem_v2_agent_config_apply_total", &[("agent_id", &agent_id)]);
    
    Ok(Json(serde_json::json!({"status": "ok"})))
}

pub async fn test_pipeline(
    State(_state): State<Arc<AppState>>,
    Path(_agent_id): Path<String>,
    Json(req): Json<TestPipelineRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    // TODO: Implement actual pipeline testing
    // For now, return placeholder response
    let response = TestPipelineResponse {
        accepted: 1,
        quarantined: 0,
        normalized: Some(format!("Test normalized: {}", req.sample)),
        reasons: None,
    };
    
    // Increment metrics
    // metrics::increment_counter("siem_v2_test_pipeline_total", &[
    //     ("agent_id", &agent_id),
    //     ("outcome", "success"),
    // ]);
    
    Ok(Json(serde_json::to_value(response)?))
}
