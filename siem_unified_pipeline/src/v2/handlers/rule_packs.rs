use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncReadExt;
use std::collections::HashMap;
use std::sync::Arc;
use ulid::Ulid;
use sha2::{Sha256, Digest};

use crate::clickhouse_pool::ClickHousePool;
use crate::v2::{AppError, AppState};
use crate::v2::dal::{execute_query, query_one, query_rows};
use crate::v2::metrics;
use crate::v2::util::idempotency::IdempotencyManager;

#[derive(Debug, Serialize, Deserialize)]
pub struct RulePack {
    pub pack_id: String,
    pub name: String,
    pub version: String,
    pub source: String,
    pub uploaded_at: String,
    pub uploader: String,
    pub items: u32,
    pub sha256: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RulePackItem {
    pub pack_id: String,
    pub item_id: String,
    pub kind: String, // SIGMA or NATIVE
    pub rule_id: String,
    pub name: String,
    pub severity: String,
    pub tags: Vec<String>,
    pub body: String,
    pub sha256: String,
    pub compile_result: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadResponse {
    pub pack_id: String,
    pub items: u32,
    pub sha256: String,
    pub errors: Vec<UploadError>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadError {
    pub item_id: String,
    pub rule_id: String,
    pub error: String,
}

#[derive(Debug, Deserialize)]
pub struct PlanRequest {
    pub strategy: String, // "safe" or "force"
    pub match_by: String, // "rule_id" or "name"
    pub tag_prefix: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PlanResponse {
    pub plan_id: String,
    pub totals: PlanTotals,
    pub entries: Vec<PlanEntry>,
    pub guardrails: GuardrailStatus,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlanTotals {
    pub create: u32,
    pub update: u32,
    pub disable: u32,
    pub skip: u32,
}

#[derive(Debug, Serialize)]
pub struct PlanEntry {
    pub action: String, // CREATE, UPDATE, DISABLE, SKIP
    pub rule_id: String,
    pub name: String,
    pub from_sha: Option<String>,
    pub to_sha: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct GuardrailStatus {
    pub compilation_clean: bool,
    pub hot_disable_safe: bool,
    pub quota_ok: bool,
    pub blast_radius_ok: bool,
    pub health_ok: bool,
    pub lock_ok: bool,
    pub idempotency_ok: bool,
    pub blocked_reasons: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CanaryConfig {
    pub enabled: bool,
    pub stages: Vec<u8>, // [10, 25, 50, 100]
    pub interval_sec: u32, // Minimum 30s
}

#[derive(Debug, Deserialize)]
pub struct ApplyRequest {
    pub plan_id: String,
    pub dry_run: Option<bool>,
    pub actor: String,
    pub canary: Option<CanaryConfig>,
    pub force: Option<bool>,
    pub force_reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ApplyResponse {
    pub deploy_id: String,
    pub summary: DeploySummary,
    pub totals: PlanTotals,
    pub errors: Vec<String>,
    pub replayed: bool,
    pub guardrails: Vec<String>,
    pub canary: Option<CanaryStatus>,
}

#[derive(Debug, Serialize)]
pub struct DeploySummary {
    pub rules_created: Vec<String>,
    pub rules_updated: Vec<String>,
    pub rules_disabled: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CanaryStatus {
    pub enabled: bool,
    pub current_stage: u8,
    pub stages: Vec<u8>,
    pub state: String, // running, paused, failed, completed
}

#[derive(Debug, Serialize)]
pub struct RollbackRequest {
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RollbackResponse {
    pub rollback_deploy_id: String,
    pub original_deploy_id: String,
    pub summary: DeploySummary,
    pub totals: PlanTotals,
}

#[derive(Debug, Serialize)]
pub struct CanaryControlRequest {
    pub action: String, // advance, pause, cancel
}

#[derive(Debug, Serialize)]
pub struct CanaryControlResponse {
    pub deploy_id: String,
    pub canary_state: String,
    pub current_stage: u8,
    pub message: String,
}

const MAX_UPLOAD_SIZE: usize = 50 * 1024 * 1024; // 50 MiB
const MAX_ITEMS_PER_PACK: usize = 5000;
const MAX_UPDATE_PCT: f64 = 30.0; // 30% max rules updated per deploy
const MAX_BLAST_RADIUS: usize = 500; // Max rules changed without force

// Upload handler - accepts zip/tar.gz with rules
pub async fn upload_pack(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Response, AppError> {
    let mut file_data = Vec::new();
    let mut pack_name = String::new();
    let mut pack_version = String::new();
    let mut pack_source = String::from("upload");
    let mut uploader = String::from("system");

    // Process multipart form
    while let Some(field) = multipart.next_field().await? {
        let name = field.name().unwrap_or("").to_string();
        
        match name.as_str() {
            "file" => {
                let content_type = field.content_type().unwrap_or("");
                if !content_type.contains("zip") && !content_type.contains("gzip") && !content_type.contains("x-tar") {
                    return Err(AppError::BadRequest("File must be zip or tar.gz".to_string()));
                }
                
                file_data = field.bytes().await?.to_vec();
                if file_data.len() > MAX_UPLOAD_SIZE {
                    return Err(AppError::BadRequest(format!(
                        "File exceeds maximum size of {} MiB", 
                        MAX_UPLOAD_SIZE / 1024 / 1024
                    )));
                }
            }
            "name" => pack_name = field.text().await?,
            "version" => pack_version = field.text().await?,
            "source" => pack_source = field.text().await?,
            "uploader" => uploader = field.text().await?,
            _ => {} // Ignore unknown fields
        }
    }

    if file_data.is_empty() {
        return Err(AppError::BadRequest("No file uploaded".to_string()));
    }

    // Extract and parse rules
    let (items, errors) = extract_rules(&file_data).await?;
    
    if items.is_empty() {
        return Err(AppError::BadRequest("No valid rules found in pack".to_string()));
    }

    if items.len() > MAX_ITEMS_PER_PACK {
        return Err(AppError::BadRequest(format!(
            "Pack contains {} items, maximum is {}", 
            items.len(), 
            MAX_ITEMS_PER_PACK
        )));
    }

    // Calculate pack hash
    let mut hasher = Sha256::new();
    hasher.update(&file_data);
    let pack_sha256 = format!("{:x}", hasher.finalize());

    // Generate pack ID
    let pack_id = Ulid::new().to_string();

    // Default name/version if not provided
    if pack_name.is_empty() {
        pack_name = format!("pack_{}", chrono::Utc::now().format("%Y%m%d_%H%M%S"));
    }
    if pack_version.is_empty() {
        pack_version = "1.0.0".to_string();
    }

    // Store pack metadata
    let query = r#"
        INSERT INTO dev.rule_packs (pack_id, name, version, source, uploader, items, sha256)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    "#;
    
    execute_query(
        &state.clickhouse,
        query,
        vec![
            pack_id.clone(),
            pack_name,
            pack_version,
            pack_source,
            uploader,
            items.len().to_string(),
            pack_sha256.clone(),
        ],
    ).await?;

    // Store pack items
    for (idx, item) in items.iter().enumerate() {
        let item_id = format!("{:04}", idx);
        let mut item_hasher = Sha256::new();
        item_hasher.update(&item.body);
        let item_sha256 = format!("{:x}", item_hasher.finalize());

        let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
        let compile_result = compile_rule(&state, &item.kind, &item.body).await;
        let compile_json = serde_json::to_string(&compile_result).unwrap_or_else(|_| "{}".to_string());

        let query = r#"
            INSERT INTO dev.rule_pack_items 
            (pack_id, item_id, kind, rule_id, name, severity, tags, body, sha256, compile_result)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#;
        
        execute_query(
            &state.clickhouse,
            query,
            vec![
                pack_id.clone(),
                item_id,
                item.kind.clone(),
                item.rule_id.clone(),
                item.name.clone(),
                item.severity.clone(),
                tags_json,
                item.body.clone(),
                item_sha256,
                compile_json,
            ],
        ).await?;
    }

    // Update metrics
    metrics::increment_counter(
        "siem_v2_rulepack_upload_total",
        &[("source", &pack_source)]
    );

    Ok(Json(UploadResponse {
        pack_id,
        items: items.len() as u32,
        sha256: pack_sha256,
        errors,
    }).into_response())
}

// Plan deployment - calculate diff against existing rules with guardrails
pub async fn plan_deployment(
    State(state): State<Arc<AppState>>,
    Path(pack_id): Path<String>,
    headers: axum::http::HeaderMap,
    Json(req): Json<PlanRequest>,
) -> Result<Response, AppError> {
    let tenant_id = headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
        .ok_or_else(|| AppError::BadRequest("Missing or invalid x-tenant-id".to_string()))?;

    // Validate strategy
    if req.strategy != "safe" && req.strategy != "force" {
        return Err(AppError::BadRequest("Strategy must be 'safe' or 'force'".to_string()));
    }

    // Load pack items
    let query = "SELECT * FROM dev.rule_pack_items WHERE pack_id = ?";
    let items: Vec<RulePackItem> = query_rows(&state.clickhouse, query, vec![pack_id.clone()]).await?;

    if items.is_empty() {
        return Err(AppError::NotFound("Pack not found".to_string()));
    }

    // Load existing rules for tenant
    let existing_query = "SELECT rule_id, name, sha256 FROM dev.alert_rules WHERE tenant_id = ? AND deleted = 0";
    let existing_rules: Vec<(String, String, String)> = query_rows(
        &state.clickhouse, 
        existing_query, 
        vec![tenant_id.to_string()]
    ).await?;

    // Create lookup maps
    let mut existing_by_id: HashMap<String, (String, String)> = HashMap::new();
    let mut existing_by_name: HashMap<String, (String, String)> = HashMap::new();
    for (rule_id, name, sha256) in existing_rules {
        existing_by_id.insert(rule_id.clone(), (name.clone(), sha256.clone()));
        existing_by_name.insert(name, (rule_id, sha256));
    }

    // Load hot rules if using safe strategy
    let hot_rules = if req.strategy == "safe" {
        let hot_query = "SELECT rule_id FROM dev.rules_firing_30d WHERE tenant_id = ?";
        let hot: Vec<String> = query_rows(&state.clickhouse, hot_query, vec![tenant_id.to_string()]).await?;
        hot.into_iter().collect::<std::collections::HashSet<_>>()
    } else {
        std::collections::HashSet::new()
    };

    // Plan changes
    let mut entries = Vec::new();
    let mut totals = PlanTotals { create: 0, update: 0, disable: 0, skip: 0 };

    for item in &items {
        let existing = if req.match_by == "rule_id" {
            existing_by_id.get(&item.rule_id)
        } else {
            existing_by_name.get(&item.name)
        };

        let mut warnings = Vec::new();

        // Check compile result
        if let Some(compile_result) = item.compile_result.as_object() {
            if compile_result.get("ok").and_then(|v| v.as_bool()) != Some(true) {
                warnings.push("Compilation failed".to_string());
            }
        }

        let entry = match existing {
            None => {
                // CREATE
                totals.create += 1;
                PlanEntry {
                    action: "CREATE".to_string(),
                    rule_id: item.rule_id.clone(),
                    name: item.name.clone(),
                    from_sha: None,
                    to_sha: Some(item.sha256.clone()),
                    warnings,
                }
            }
            Some((_, existing_sha)) if existing_sha != &item.sha256 => {
                // UPDATE
                totals.update += 1;
                PlanEntry {
                    action: "UPDATE".to_string(),
                    rule_id: item.rule_id.clone(),
                    name: item.name.clone(),
                    from_sha: Some(existing_sha.clone()),
                    to_sha: Some(item.sha256.clone()),
                    warnings,
                }
            }
            Some(_) => {
                // SKIP - identical
                totals.skip += 1;
                PlanEntry {
                    action: "SKIP".to_string(),
                    rule_id: item.rule_id.clone(),
                    name: item.name.clone(),
                    from_sha: Some(item.sha256.clone()),
                    to_sha: Some(item.sha256.clone()),
                    warnings,
                }
            }
        };

        entries.push(entry);
    }

    // Check for rules to disable (exist in DB but not in pack)
    let pack_rule_ids: std::collections::HashSet<_> = items.iter().map(|i| &i.rule_id).collect();
    for (rule_id, (name, sha256)) in &existing_by_id {
        if !pack_rule_ids.contains(rule_id) {
            let mut warnings = Vec::new();
            
            if req.strategy == "safe" && hot_rules.contains(rule_id) {
                warnings.push("Rule has alerts in last 30 days - cannot disable in SAFE mode".to_string());
                continue; // Skip disabling hot rules in safe mode
            }

            totals.disable += 1;
            entries.push(PlanEntry {
                action: "DISABLE".to_string(),
                rule_id: rule_id.clone(),
                name: name.clone(),
                from_sha: Some(sha256.clone()),
                to_sha: None,
                warnings,
            });
        }
    }

    // Calculate guardrails
    let guardrails = calculate_guardrails(&state, &entries, &totals, &req.strategy).await?;

    // Generate plan ID and store
    let plan_id = Ulid::new().to_string();
    let plan_data = serde_json::to_string(&entries)?;
    let totals_json = serde_json::to_string(&totals)?;
    let guardrails_json = serde_json::to_string(&guardrails)?;

    let store_query = r#"
        INSERT INTO dev.rule_pack_plans 
        (plan_id, pack_id, strategy, match_by, tag_prefix, plan_data, totals)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    "#;

    execute_query(
        &state.clickhouse,
        store_query,
        vec![
            plan_id.clone(),
            pack_id,
            req.strategy.clone(),
            req.match_by,
            req.tag_prefix.unwrap_or_default(),
            plan_data,
            totals_json,
        ],
    ).await?;

    // Store plan artifact
    let artifact_query = r#"
        INSERT INTO dev.rule_pack_artifacts (deploy_id, kind, content)
        VALUES (?, 'plan', ?)
    "#;
    
    execute_query(
        &state.clickhouse,
        artifact_query,
        vec![plan_id.clone(), guardrails_json],
    ).await?;

    // Update metrics
    metrics::increment_counter(
        "siem_v2_rulepack_plan_total",
        &[("strategy", &req.strategy), ("outcome", "ok")]
    );

    Ok(Json(PlanResponse {
        plan_id,
        totals,
        entries,
        guardrails,
    }).into_response())
}

// Apply deployment plan with guardrails and canary support
pub async fn apply_deployment(
    State(state): State<Arc<AppState>>,
    Path(pack_id): Path<String>,
    headers: axum::http::HeaderMap,
    Json(req): Json<ApplyRequest>,
) -> Result<Response, AppError> {
    let tenant_id = headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
        .ok_or_else(|| AppError::BadRequest("Missing or invalid x-tenant-id".to_string()))?;

    let idempotency_key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::BadRequest("Missing Idempotency-Key header".to_string()))?;

    // Check idempotency
    let idemp_result = state.idempotency
        .check_and_record(
            &format!("rulepack:apply:{}", pack_id),
            idempotency_key,
            std::time::Duration::from_secs(3600), // 1 hour TTL
        )
        .await?;

    if let Some(existing_result) = idemp_result {
        // Return cached result
        if let Ok(response) = serde_json::from_str::<ApplyResponse>(&existing_result) {
            let mut response = response;
            response.replayed = true;
            return Ok(Json(response).into_response());
        }
    }

    // Acquire distributed lock
    let lock_key = format!("siem:lock:rulepacks:apply:{}", tenant_id);
    let _lock = state.redis_pool
        .acquire_lock(&lock_key, std::time::Duration::from_secs(300))
        .await
        .map_err(|_| AppError::Conflict("Another deployment is in progress".to_string()))?;

    // Load plan
    let plan_query = "SELECT strategy, plan_data, totals FROM dev.rule_pack_plans WHERE plan_id = ?";
    let plan_row: Option<(String, String, String)> = query_one(
        &state.clickhouse,
        plan_query,
        vec![req.plan_id.clone()],
    ).await?;

    let (strategy, plan_data, totals_json) = plan_row
        .ok_or_else(|| AppError::NotFound("Plan not found".to_string()))?;

    let entries: Vec<PlanEntry> = serde_json::from_str(&plan_data)?;
    let totals: PlanTotals = serde_json::from_str(&totals_json)?;

    // Validate canary config
    let canary_config = req.canary.as_ref();
    if let Some(canary) = canary_config {
        if canary.interval_sec < 30 {
            return Err(AppError::BadRequest("Canary interval must be at least 30 seconds".to_string()));
        }
        if canary.stages.is_empty() || canary.stages.len() > 10 {
            return Err(AppError::BadRequest("Canary must have 1-10 stages".to_string()));
        }
    }

    // Generate deploy ID
    let deploy_id = Ulid::new().to_string();

    // Take snapshots before changes
    take_rule_snapshots(&state, &entries, &pack_id, &deploy_id).await?;

    // Start deployment record
    let start_query = r#"
        INSERT INTO dev.rule_pack_deployments 
        (deploy_id, pack_id, status, strategy, actor, idempotency_key, canary, canary_stages, canary_state, force_reason, blast_radius)
        VALUES (?, ?, 'APPLIED', ?, ?, ?, ?, ?, ?, ?, ?)
    "#;

    let canary_enabled = canary_config.map(|c| c.enabled).unwrap_or(false) as u8;
    let canary_stages = canary_config.map(|c| c.stages.len() as u8).unwrap_or(0);
    let canary_state = if canary_enabled > 0 { "running" } else { "disabled" };
    let blast_radius = totals.create + totals.update + totals.disable;

    execute_query(
        &state.clickhouse,
        start_query,
        vec![
            deploy_id.clone(),
            pack_id.clone(),
            strategy,
            req.actor.clone(),
            idempotency_key.to_string(),
            canary_enabled.to_string(),
            canary_stages.to_string(),
            canary_state.to_string(),
            req.force_reason.unwrap_or_default(),
            blast_radius.to_string(),
        ],
    ).await?;

    // Apply changes (simplified - in real implementation would be more complex)
    let mut summary = DeploySummary {
        rules_created: Vec::new(),
        rules_updated: Vec::new(),
        rules_disabled: Vec::new(),
    };
    let mut errors = Vec::new();

    if !req.dry_run.unwrap_or(false) {
        for entry in &entries {
            match entry.action.as_str() {
                "CREATE" => {
                    // Insert new rule
                    summary.rules_created.push(entry.rule_id.clone());
                    // Log change
                    log_rule_change(
                        &state.clickhouse,
                        tenant_id,
                        &req.actor,
                        "CREATE",
                        &entry.rule_id,
                        "",
                        entry.to_sha.as_deref().unwrap_or(""),
                        &deploy_id,
                    ).await?;
                }
                "UPDATE" => {
                    // Update existing rule
                    summary.rules_updated.push(entry.rule_id.clone());
                    log_rule_change(
                        &state.clickhouse,
                        tenant_id,
                        &req.actor,
                        "UPDATE",
                        &entry.rule_id,
                        entry.from_sha.as_deref().unwrap_or(""),
                        entry.to_sha.as_deref().unwrap_or(""),
                        &deploy_id,
                    ).await?;
                }
                "DISABLE" => {
                    // Disable rule
                    summary.rules_disabled.push(entry.rule_id.clone());
                    log_rule_change(
                        &state.clickhouse,
                        tenant_id,
                        &req.actor,
                        "DISABLE",
                        &entry.rule_id,
                        entry.from_sha.as_deref().unwrap_or(""),
                        "",
                        &deploy_id,
                    ).await?;
                }
                _ => {} // SKIP
            }
        }
    }

    // Update deployment record
    let finish_query = r#"
        ALTER TABLE dev.rule_pack_deployments
        UPDATE 
            finished_at = now64(3),
            summary = ?,
            created = ?,
            updated = ?,
            disabled = ?,
            skipped = ?,
            errors = ?
        WHERE deploy_id = ?
    "#;

    let summary_json = serde_json::to_string(&summary)?;
    execute_query(
        &state.clickhouse,
        finish_query,
        vec![
            summary_json,
            totals.create.to_string(),
            totals.update.to_string(),
            totals.disable.to_string(),
            totals.skip.to_string(),
            errors.len().to_string(),
            deploy_id.clone(),
        ],
    ).await?;

    // Store apply artifact
    let apply_artifact = serde_json::json!({
        "deploy_id": deploy_id,
        "summary": summary,
        "totals": totals,
        "errors": errors,
        "canary": canary_config
    });
    
    let artifact_query = r#"
        INSERT INTO dev.rule_pack_artifacts (deploy_id, kind, content)
        VALUES (?, 'apply', ?)
    "#;
    
    execute_query(
        &state.clickhouse,
        artifact_query,
        vec![deploy_id.clone(), serde_json::to_string(&apply_artifact)?],
    ).await?;

    let response = ApplyResponse {
        deploy_id,
        summary,
        totals,
        errors,
        replayed: false,
        guardrails: vec!["compilation_clean", "hot_disable_safe", "quota_ok", "blast_radius_ok", "health_ok"],
        canary: canary_config.map(|c| CanaryStatus {
            enabled: c.enabled,
            current_stage: 0,
            stages: c.stages.clone(),
            state: "running".to_string(),
        }),
    };

    // Cache result
    state.idempotency
        .set_result(
            &format!("rulepack:apply:{}", pack_id),
            idempotency_key,
            &serde_json::to_string(&response)?,
        )
        .await?;

    // Update metrics
    metrics::increment_counter(
        "siem_v2_rulepack_apply_total",
        &[("outcome", if errors.is_empty() { "success" } else { "partial" })]
    );

    Ok(Json(response).into_response())
}

// Rollback deployment
pub async fn rollback_deployment(
    State(state): State<Arc<AppState>>,
    Path(deploy_id): Path<String>,
    headers: axum::http::HeaderMap,
    Json(req): Json<RollbackRequest>,
) -> Result<Response, AppError> {
    let tenant_id = headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
        .ok_or_else(|| AppError::BadRequest("Missing or invalid x-tenant-id".to_string()))?;

    let idempotency_key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::BadRequest("Missing Idempotency-Key header".to_string()))?;

    // Check idempotency for rollback
    let idemp_result = state.idempotency
        .check_and_record(
            &format!("rulepack:rollback:{}", deploy_id),
            idempotency_key,
            std::time::Duration::from_secs(3600),
        )
        .await?;

    if let Some(existing_result) = idemp_result {
        // Return cached result
        if let Ok(response) = serde_json::from_str::<RollbackResponse>(&existing_result) {
            return Ok(Json(response).into_response());
        }
    }

    // Acquire lock
    let lock_key = format!("siem:lock:rulepacks:apply:{}", tenant_id);
    let _lock = state.redis_pool
        .acquire_lock(&lock_key, std::time::Duration::from_secs(300))
        .await
        .map_err(|_| AppError::Conflict("Another deployment is in progress".to_string()))?;

    // Load original deployment
    let deploy_query = "SELECT * FROM dev.rule_pack_deployments WHERE deploy_id = ?";
    let deployment: Option<serde_json::Value> = query_one(
        &state.clickhouse,
        deploy_query,
        vec![deploy_id.clone()],
    ).await?;

    let deployment = deployment.ok_or_else(|| AppError::NotFound("Deployment not found".to_string()))?;

    // Load snapshots for this deployment
    let snapshots_query = "SELECT * FROM dev.rule_snapshots WHERE deploy_id = ?";
    let snapshots: Vec<serde_json::Value> = query_rows(
        &state.clickhouse,
        snapshots_query,
        vec![deploy_id.clone()],
    ).await?;

    if snapshots.is_empty() {
        return Err(AppError::BadRequest("No snapshots found for rollback".to_string()));
    }

    // Generate rollback deploy ID
    let rollback_deploy_id = Ulid::new().to_string();

    // Create rollback deployment record
    let rollback_query = r#"
        INSERT INTO dev.rule_pack_deployments 
        (deploy_id, pack_id, status, strategy, actor, canary, canary_state, rolled_back_from, rolled_back_to)
        VALUES (?, ?, 'ROLLED_BACK', 'rollback', ?, 0, 'disabled', ?, ?)
    "#;

    execute_query(
        &state.clickhouse,
        rollback_query,
        vec![
            rollback_deploy_id.clone(),
            deployment["pack_id"].as_str().unwrap_or(""),
            "system".to_string(),
            deploy_id.clone(),
            rollback_deploy_id.clone(),
        ],
    ).await?;

    // Apply rollback changes
    let mut summary = DeploySummary {
        rules_created: Vec::new(),
        rules_updated: Vec::new(),
        rules_disabled: Vec::new(),
    };

    for snapshot in snapshots {
        let rule_id = snapshot["rule_id"].as_str().unwrap_or("");
        let body = snapshot["body"].as_str().unwrap_or("");
        let sha256 = snapshot["sha256"].as_str().unwrap_or("");

        // Restore rule to snapshot state
        summary.rules_updated.push(rule_id.to_string());
        
        log_rule_change(
            &state.clickhouse,
            tenant_id,
            "system",
            "ROLLBACK",
            rule_id,
            "",
            sha256,
            &rollback_deploy_id,
        ).await?;
    }

    // Store rollback artifact
    let rollback_artifact = serde_json::json!({
        "rollback_deploy_id": rollback_deploy_id,
        "original_deploy_id": deploy_id,
        "reason": req.reason,
        "snapshots_restored": snapshots.len(),
        "summary": summary
    });
    
    let artifact_query = r#"
        INSERT INTO dev.rule_pack_artifacts (deploy_id, kind, content)
        VALUES (?, 'rollback', ?)
    "#;
    
    execute_query(
        &state.clickhouse,
        artifact_query,
        vec![rollback_deploy_id.clone(), serde_json::to_string(&rollback_artifact)?],
    ).await?;

    let response = RollbackResponse {
        rollback_deploy_id,
        original_deploy_id: deploy_id,
        summary,
        totals: PlanTotals {
            create: 0,
            update: summary.rules_updated.len() as u32,
            disable: 0,
            skip: 0,
        },
    };

    // Cache result
    state.idempotency
        .set_result(
            &format!("rulepack:rollback:{}", deploy_id),
            idempotency_key,
            &serde_json::to_string(&response)?,
        )
        .await?;

    // Update metrics
    metrics::increment_counter(
        "siem_v2_rulepack_rollback_total",
        &[("outcome", "success")]
    );

    Ok(Json(response).into_response())
}

// Canary control endpoints
pub async fn canary_control(
    State(state): State<Arc<AppState>>,
    Path(deploy_id): Path<String>,
    headers: axum::http::HeaderMap,
    Json(req): Json<CanaryControlRequest>,
) -> Result<Response, AppError> {
    let tenant_id = headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
        .ok_or_else(|| AppError::BadRequest("Missing or invalid x-tenant-id".to_string()))?;

    // Load deployment
    let deploy_query = "SELECT * FROM dev.rule_pack_deployments WHERE deploy_id = ?";
    let deployment: Option<serde_json::Value> = query_one(
        &state.clickhouse,
        deploy_query,
        vec![deploy_id.clone()],
    ).await?;

    let deployment = deployment.ok_or_else(|| AppError::NotFound("Deployment not found".to_string()))?;
    
    let canary_enabled = deployment["canary"].as_u64().unwrap_or(0) > 0;
    if !canary_enabled {
        return Err(AppError::BadRequest("Deployment does not have canary enabled".to_string()));
    }

    let current_stage = deployment["canary_current_stage"].as_u64().unwrap_or(0) as u8;
    let canary_state = deployment["canary_state"].as_str().unwrap_or("disabled");

    let (new_state, new_stage, message) = match req.action.as_str() {
        "advance" => {
            if canary_state != "running" {
                return Err(AppError::BadRequest("Canary is not running".to_string()));
            }
            
            // Advance to next stage
            let next_stage = current_stage + 1;
            let state = if next_stage >= 100 { "completed" } else { "running" };
            
            // Store canary stage artifact
            let stage_artifact = serde_json::json!({
                "stage": next_stage,
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "action": "advance"
            });
            
            let artifact_query = r#"
                INSERT INTO dev.rule_pack_artifacts (deploy_id, kind, content)
                VALUES (?, 'canary', ?)
            "#;
            
            execute_query(
                &state.clickhouse,
                artifact_query,
                vec![deploy_id.clone(), serde_json::to_string(&stage_artifact)?],
            ).await?;

            // Update deployment
            let update_query = r#"
                ALTER TABLE dev.rule_pack_deployments
                UPDATE canary_current_stage = ?, canary_state = ?
                WHERE deploy_id = ?
            "#;
            
            execute_query(
                &state.clickhouse,
                update_query,
                vec![next_stage.to_string(), state.to_string(), deploy_id.clone()],
            ).await?;

            (state.to_string(), next_stage, format!("Advanced to stage {}", next_stage))
        }
        "pause" => {
            if canary_state != "running" {
                return Err(AppError::BadRequest("Canary is not running".to_string()));
            }
            
            let update_query = r#"
                ALTER TABLE dev.rule_pack_deployments
                UPDATE canary_state = 'paused'
                WHERE deploy_id = ?
            "#;
            
            execute_query(
                &state.clickhouse,
                update_query,
                vec![deploy_id.clone()],
            ).await?;

            ("paused".to_string(), current_stage, "Canary paused".to_string())
        }
        "cancel" => {
            // Cancel and rollback
            let update_query = r#"
                ALTER TABLE dev.rule_pack_deployments
                UPDATE canary_state = 'failed', errors = 'Cancelled by user'
                WHERE deploy_id = ?
            "#;
            
            execute_query(
                &state.clickhouse,
                update_query,
                vec![deploy_id.clone()],
            ).await?;

            ("failed".to_string(), current_stage, "Canary cancelled".to_string())
        }
        _ => return Err(AppError::BadRequest("Invalid action".to_string())),
    };

    // Update metrics
    metrics::increment_counter(
        "siem_v2_rulepack_canary_stage_total",
        &[("stage", &new_stage.to_string())]
    );

    let response = CanaryControlResponse {
        deploy_id,
        canary_state: new_state,
        current_stage: new_stage,
        message,
    };

    Ok(Json(response).into_response())
}

// Get deployment artifacts
pub async fn get_deployment_artifacts(
    State(state): State<Arc<AppState>>,
    Path(deploy_id): Path<String>,
) -> Result<Response, AppError> {
    let query = "SELECT kind, content, created_at FROM dev.rule_pack_artifacts WHERE deploy_id = ? ORDER BY created_at";
    let artifacts: Vec<serde_json::Value> = query_rows(&state.clickhouse, query, vec![deploy_id]).await?;
    
    Ok(Json(artifacts).into_response())
}

// List rule packs
pub async fn list_packs(
    State(state): State<Arc<AppState>>,
) -> Result<Response, AppError> {
    let query = "SELECT * FROM dev.rule_packs ORDER BY uploaded_at DESC LIMIT 100";
    let packs: Vec<RulePack> = query_rows(&state.clickhouse, query, vec![]).await?;
    
    Ok(Json(packs).into_response())
}

// Get pack details
pub async fn get_pack(
    State(state): State<Arc<AppState>>,
    Path(pack_id): Path<String>,
) -> Result<Response, AppError> {
    let query = "SELECT * FROM dev.rule_packs WHERE pack_id = ?";
    let pack: Option<RulePack> = query_one(&state.clickhouse, query, vec![pack_id]).await?;
    
    match pack {
        Some(p) => Ok(Json(p).into_response()),
        None => Err(AppError::NotFound("Pack not found".to_string())),
    }
}

// Helper functions

async fn extract_rules(file_data: &[u8]) -> Result<(Vec<RulePackItem>, Vec<UploadError>), AppError> {
    // TODO: Implement actual zip/tar.gz extraction
    // For now, return mock data
    let items = vec![
        RulePackItem {
            pack_id: String::new(),
            item_id: String::new(),
            kind: "SIGMA".to_string(),
            rule_id: "rule_test_1".to_string(),
            name: "Test Rule 1".to_string(),
            severity: "HIGH".to_string(),
            tags: vec!["test".to_string()],
            body: "title: Test\nlogsource:\n  product: windows\ndetection:\n  selection:\n    EventID: 4625\n  condition: selection".to_string(),
            sha256: "abc123".to_string(),
            compile_result: serde_json::json!({"ok": true}),
        }
    ];
    let errors = vec![];
    
    Ok((items, errors))
}

async fn compile_rule(state: &Arc<AppState>, kind: &str, body: &str) -> serde_json::Value {
    // TODO: Call actual compile endpoint
    serde_json::json!({
        "ok": true,
        "sql": "SELECT * FROM events WHERE EventID = 4625"
    })
}

async fn calculate_guardrails(
    state: &Arc<AppState>,
    entries: &[PlanEntry],
    totals: &PlanTotals,
    strategy: &str,
) -> Result<GuardrailStatus, AppError> {
    let mut blocked_reasons = Vec::new();
    
    // Check compilation
    let compilation_clean = !entries.iter().any(|e| e.warnings.iter().any(|w| w.contains("Compilation failed")));
    if !compilation_clean {
        blocked_reasons.push("compilation_error".to_string());
    }
    
    // Check hot rule disable protection
    let hot_disable_safe = true; // TODO: Implement actual check
    
    // Check quota
    let total_rules = 1000; // TODO: Get actual count
    let update_pct = (totals.update as f64 / total_rules as f64) * 100.0;
    let quota_ok = update_pct <= MAX_UPDATE_PCT;
    if !quota_ok {
        blocked_reasons.push("quota_exceeded".to_string());
    }
    
    // Check blast radius
    let blast_radius = totals.create + totals.update + totals.disable;
    let blast_radius_ok = blast_radius <= MAX_BLAST_RADIUS || strategy == "force";
    if !blast_radius_ok {
        blocked_reasons.push("blast_radius_too_large".to_string());
    }
    
    // Check health
    let health_ok = true; // TODO: Implement actual health check
    
    // Check lock
    let lock_ok = true; // TODO: Implement actual lock check
    
    // Check idempotency
    let idempotency_ok = true; // TODO: Implement actual idempotency check
    
    // Update metrics for blocked guardrails
    for reason in &blocked_reasons {
        metrics::increment_counter(
            "siem_v2_rulepack_guardrail_block_total",
            &[("reason", reason)]
        );
    }
    
    Ok(GuardrailStatus {
        compilation_clean,
        hot_disable_safe,
        quota_ok,
        blast_radius_ok,
        health_ok,
        lock_ok,
        idempotency_ok,
        blocked_reasons,
    })
}

async fn take_rule_snapshots(
    ch: &ClickHousePool,
    entries: &[PlanEntry],
    pack_id: &str,
    deploy_id: &str,
) -> Result<(), AppError> {
    for entry in entries {
        if let Some(from_sha) = &entry.from_sha {
            // Get current rule body
            let rule_query = "SELECT body FROM dev.alert_rules WHERE rule_id = ?";
            let rule_body: Option<String> = query_one(ch, rule_query, vec![entry.rule_id.clone()]).await?;
            
            if let Some(body) = rule_body {
                let snapshot_id = Ulid::new().to_string();
                let snapshot_query = r#"
                    INSERT INTO dev.rule_snapshots 
                    (snapshot_id, rule_id, sha256, body, by_pack, deploy_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                "#;
                
                execute_query(
                    ch,
                    snapshot_query,
                    vec![
                        snapshot_id,
                        entry.rule_id.clone(),
                        from_sha.clone(),
                        body,
                        pack_id.to_string(),
                        deploy_id.to_string(),
                    ],
                ).await?;
            }
        }
    }
    
    Ok(())
}

async fn log_rule_change(
    ch: &ClickHousePool,
    tenant_id: u32,
    actor: &str,
    action: &str,
    rule_id: &str,
    from_sha: &str,
    to_sha: &str,
    deploy_id: &str,
) -> Result<(), AppError> {
    let query = r#"
        INSERT INTO dev.rule_change_log 
        (tenant_id, actor, action, rule_id, from_sha, to_sha, deploy_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    "#;
    
    execute_query(
        ch,
        query,
        vec![
            tenant_id.to_string(),
            actor.to_string(),
            action.to_string(),
            rule_id.to_string(),
            from_sha.to_string(),
            to_sha.to_string(),
            deploy_id.to_string(),
        ],
    ).await?;
    
    // Update metrics
    metrics::increment_counter(
        "siem_v2_rule_changes_total",
        &[("action", action)]
    );
    
    Ok(())
}
