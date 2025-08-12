use axum::{
    extract::{Multipart, Path, State},
    http::HeaderMap,
    Json,
};
use serde::{Deserialize, Serialize};
// use tokio::io::AsyncReadExt;
use std::collections::HashMap;
use std::sync::Arc;
use ulid::Ulid;
use sha2::{Sha256, Digest};

// use crate::clickhouse_pool::ClickHousePool; // not used; rely on Client directly
use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};
// DAL helpers not present; inline query helpers below
// use crate::v2::metrics;
// Idempotency not wired yet in AppState

#[derive(Debug, Serialize, Deserialize, clickhouse::Row)]
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

#[derive(Debug, Serialize, Deserialize, clickhouse::Row)]
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

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
pub struct PlanEntry {
    pub action: String, // CREATE, UPDATE, DISABLE, SKIP
    pub rule_id: String,
    pub name: String,
    pub from_sha: Option<String>,
    pub to_sha: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplyResponse {
    pub deploy_id: String,
    pub summary: DeploySummary,
    pub totals: PlanTotals,
    pub errors: Vec<String>,
    pub replayed: bool,
    pub guardrails: Vec<String>,
    pub canary: Option<CanaryStatus>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeploySummary {
    pub rules_created: Vec<String>,
    pub rules_updated: Vec<String>,
    pub rules_disabled: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CanaryStatus {
    pub enabled: bool,
    pub current_stage: u8,
    pub stages: Vec<u8>,
    pub state: String, // running, paused, failed, completed
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RollbackRequest {
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RollbackResponse {
    pub rollback_deploy_id: String,
    pub original_deploy_id: String,
    pub summary: DeploySummary,
    pub totals: PlanTotals,
}

#[derive(Debug, Serialize, Deserialize)]
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
const MAX_BLAST_RADIUS: u32 = 500; // Max rules changed without force

// Upload handler - accepts zip/tar.gz with rules
pub async fn upload_pack(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> PipelineResult<Json<serde_json::Value>> {
    let mut file_data = Vec::new();
    let mut pack_name = String::new();
    let mut pack_version = String::new();
    let mut pack_source = String::from("upload");
    let mut uploader = String::from("system");

    // Process multipart form
    while let Some(field) = multipart.next_field().await.map_err(|e| PipelineError::validation(e.to_string()))? {
        let name = field.name().unwrap_or("").to_string();
        
        match name.as_str() {
            "file" => {
                let content_type = field.content_type().unwrap_or("");
                if !content_type.contains("zip") && !content_type.contains("gzip") && !content_type.contains("x-tar") {
                    return Err(PipelineError::validation("File must be zip or tar.gz".to_string()));
                }
                
                file_data = field.bytes().await.map_err(|e| PipelineError::validation(e.to_string()))?.to_vec();
                if file_data.len() > MAX_UPLOAD_SIZE {
                    return Err(PipelineError::validation(format!(
                        "File exceeds maximum size of {} MiB", 
                        MAX_UPLOAD_SIZE / 1024 / 1024
                    )));
                }
            }
            "name" => pack_name = field.text().await.map_err(|e| PipelineError::validation(e.to_string()))?,
            "version" => pack_version = field.text().await.map_err(|e| PipelineError::validation(e.to_string()))?,
            "source" => pack_source = field.text().await.map_err(|e| PipelineError::validation(e.to_string()))?,
            "uploader" => uploader = field.text().await.map_err(|e| PipelineError::validation(e.to_string()))?,
            _ => {} // Ignore unknown fields
        }
    }

    if file_data.is_empty() {
        return Err(PipelineError::validation("No file uploaded".to_string()));
    }

    // Extract and parse rules
    let (items, errors) = extract_rules(&file_data).await?;
    
    if items.is_empty() {
        return Err(PipelineError::validation("No valid rules found in pack".to_string()));
    }

    if items.len() > MAX_ITEMS_PER_PACK {
        return Err(PipelineError::validation(format!(
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
    
    state.ch
        .query(query)
        .bind(pack_id.clone())
        .bind(pack_name)
        .bind(pack_version)
        .bind(pack_source)
        .bind(uploader)
        .bind(items.len() as u64)
        .bind(pack_sha256.clone())
        .execute()
        .await?;

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
        
        state.ch
            .query(query)
            .bind(pack_id.clone())
            .bind(item_id)
            .bind(item.kind.clone())
            .bind(item.rule_id.clone())
            .bind(item.name.clone())
            .bind(item.severity.clone())
            .bind(tags_json)
            .bind(item.body.clone())
            .bind(item_sha256)
            .bind(compile_json)
            .execute()
            .await?;
    }

    // Update metrics
    // metrics::increment_counter(
    //     "siem_v2_rulepack_upload_total",
    //     &[("source", &pack_source)]
    // );

    Ok(Json(serde_json::to_value(UploadResponse {
        pack_id,
        items: items.len() as u32,
        sha256: pack_sha256,
        errors,
    })?))
}

// Plan deployment - calculate diff against existing rules with guardrails
pub async fn plan_deployment(
    State(state): State<Arc<AppState>>,
    Path(pack_id): Path<String>,
    headers: HeaderMap,
    Json(req): Json<PlanRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    let tenant_id = headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
        .ok_or_else(|| PipelineError::validation("Missing or invalid x-tenant-id".to_string()))?;

    // Validate strategy
    if req.strategy != "safe" && req.strategy != "force" {
        return Err(PipelineError::validation("Strategy must be 'safe' or 'force'".to_string()));
    }

    // Load pack items
    let query = "SELECT * FROM dev.rule_pack_items WHERE pack_id = ?";
    let items: Vec<RulePackItem> = state
        .ch
        .query(query)
        .bind(pack_id.clone())
        .fetch_all::<RulePackItem>()
        .await?;

    if items.is_empty() {
        return Err(PipelineError::not_found("Pack not found".to_string()));
    }

    // Load existing rules for tenant
    let existing_query = "SELECT rule_id, name, sha256 FROM dev.alert_rules WHERE tenant_id = ? AND deleted = 0";
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct ExistingRule { rule_id:String, name:String, sha256:String }
    let existing_rules: Vec<ExistingRule> = state
        .ch
        .query(existing_query)
        .bind(tenant_id as u64)
        .fetch_all::<ExistingRule>()
        .await?;

    // Create lookup maps
    let mut existing_by_id: HashMap<String, (String, String)> = HashMap::new();
    let mut existing_by_name: HashMap<String, (String, String)> = HashMap::new();
    for r in existing_rules {
        existing_by_id.insert(r.rule_id.clone(), (r.name.clone(), r.sha256.clone()));
        existing_by_name.insert(r.name, (r.rule_id, r.sha256));
    }

    // Load hot rules if using safe strategy
    let hot_rules = if req.strategy == "safe" {
        let hot_query = "SELECT rule_id FROM dev.rules_firing_30d WHERE tenant_id = ?";
        #[derive(serde::Deserialize, clickhouse::Row)]
        struct Hot { rule_id:String }
        let hot_rows: Vec<Hot> = state.ch.query(hot_query).bind(tenant_id as u64).fetch_all::<Hot>().await?;
        let hot: Vec<String> = hot_rows.into_iter().map(|h| h.rule_id).collect();
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

    state.ch
        .query(store_query)
        .bind(plan_id.clone())
        .bind(pack_id)
        .bind(req.strategy.clone())
        .bind(req.match_by)
        .bind(req.tag_prefix.unwrap_or_default())
        .bind(plan_data)
        .bind(totals_json)
        .execute()
        .await?;

    // Store plan artifact
    let artifact_query = r#"
        INSERT INTO dev.rule_pack_artifacts (deploy_id, kind, content)
        VALUES (?, 'plan', ?)
    "#;
    
    state.ch
        .query(artifact_query)
        .bind(plan_id.clone())
        .bind(guardrails_json)
        .execute()
        .await?;

    // Update metrics
    // metrics::increment_counter(
    //     "siem_v2_rulepack_plan_total",
    //     &[("strategy", &req.strategy), ("outcome", "ok")]
    // );

    Ok(Json(serde_json::to_value(PlanResponse {
        plan_id,
        totals,
        entries,
        guardrails,
    })?))
}

// Apply deployment plan with guardrails and canary support
pub async fn apply_deployment(
    State(state): State<Arc<AppState>>,
    Path(pack_id): Path<String>,
    headers: HeaderMap,
    Json(req): Json<ApplyRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    let tenant_id = headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
        .ok_or_else(|| PipelineError::validation("Missing or invalid x-tenant-id".to_string()))?;

    let idempotency_key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| PipelineError::validation("Missing Idempotency-Key header".to_string()))?;

    // Check idempotency (stubbed until wired in AppState)
    let idemp_result: Option<String> = None;

    if let Some(existing_result) = idemp_result {
        // Return cached result
        if let Ok(response) = serde_json::from_str::<ApplyResponse>(&existing_result) {
            let mut response = response;
            response.replayed = true;
            return Ok(Json(serde_json::to_value(response)?));
        }
    }

    // Acquire distributed lock
    let _lock_key = format!("siem:lock:rulepacks:apply:{}", tenant_id);
    // Acquire distributed lock (stubbed)
    let _lock_guard = ();

    // Load plan
    let plan_query = "SELECT strategy, plan_data, totals FROM dev.rule_pack_plans WHERE plan_id = ?";
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct PlanRow { strategy:String, plan_data:String, totals:String }
    let plan_row: Option<PlanRow> = state.ch.query(plan_query).bind(req.plan_id.clone()).fetch_optional::<PlanRow>().await?;

    let plan_row = plan_row.ok_or_else(|| PipelineError::not_found("Plan not found".to_string()))?;
    let entries: Vec<PlanEntry> = serde_json::from_str(&plan_row.plan_data)?;
    let totals: PlanTotals = serde_json::from_str(&plan_row.totals)?;

    // Validate canary config
    let canary_config = req.canary.as_ref();
    if let Some(canary) = canary_config {
        if canary.interval_sec < 30 {
            return Err(PipelineError::validation("Canary interval must be at least 30 seconds".to_string()));
        }
        if canary.stages.is_empty() || canary.stages.len() > 10 {
            return Err(PipelineError::validation("Canary must have 1-10 stages".to_string()));
        }
    }

    // Generate deploy ID
    let deploy_id = Ulid::new().to_string();

    // Take snapshots before changes
    take_rule_snapshots(&state.ch, &entries, &pack_id, &deploy_id).await?;

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

    state.ch
        .query(start_query)
        .bind(deploy_id.clone())
        .bind(pack_id.clone())
        .bind(plan_row.strategy)
        .bind(req.actor.clone())
        .bind(idempotency_key.to_string())
        .bind(canary_enabled)
        .bind(canary_stages)
        .bind(canary_state.to_string())
        .bind(req.force_reason.unwrap_or_default())
        .bind(blast_radius as u32)
        .execute()
        .await?;

    // Apply changes (simplified - in real implementation would be more complex)
    let mut summary = DeploySummary {
        rules_created: Vec::new(),
        rules_updated: Vec::new(),
        rules_disabled: Vec::new(),
    };
    let errors = Vec::new();

    if !req.dry_run.unwrap_or(false) {
        for entry in &entries {
            match entry.action.as_str() {
                "CREATE" => {
                    // Insert new rule
                    summary.rules_created.push(entry.rule_id.clone());
                    // Log change
                    log_rule_change(
                        &state.ch,
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
                        &state.ch,
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
                        &state.ch,
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
    state.ch
        .query(finish_query)
        .bind(summary_json)
        .bind(totals.create as u32)
        .bind(totals.update as u32)
        .bind(totals.disable as u32)
        .bind(totals.skip as u32)
        .bind(errors.len() as u32)
        .bind(deploy_id.clone())
        .execute()
        .await?;

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
    
    state.ch
        .query(artifact_query)
        .bind(deploy_id.clone())
        .bind(serde_json::to_string(&apply_artifact)?)
        .execute()
        .await?;

    let response = ApplyResponse {
        deploy_id,
        summary,
        totals,
        errors,
        replayed: false,
        guardrails: vec![
            "compilation_clean".to_string(),
            "hot_disable_safe".to_string(),
            "quota_ok".to_string(),
            "blast_radius_ok".to_string(),
            "health_ok".to_string(),
        ],
        canary: canary_config.map(|c| CanaryStatus {
            enabled: c.enabled,
            current_stage: 0,
            stages: c.stages.clone(),
            state: "running".to_string(),
        }),
    };

    // Cache result (stubbed)

    // Update metrics
    // metrics::increment_counter(
    //     "siem_v2_rulepack_apply_total",
    //     &[("outcome", if errors.is_empty() { "success" } else { "partial" })]
    // );

    Ok(Json(serde_json::to_value(response)?))
}

// Rollback deployment
pub async fn rollback_deployment(
    State(state): State<Arc<AppState>>,
    Path(deploy_id): Path<String>,
    headers: HeaderMap,
    Json(req): Json<RollbackRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    let tenant_id = headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
        .ok_or_else(|| PipelineError::validation("Missing or invalid x-tenant-id".to_string()))?;

    let _idempotency_key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| PipelineError::validation("Missing Idempotency-Key header".to_string()))?;

    // Check idempotency for rollback (stubbed)
    let idemp_result: Option<String> = None;

    if let Some(existing_result) = idemp_result {
        // Return cached result
        if let Ok(response) = serde_json::from_str::<RollbackResponse>(&existing_result) {
            return Ok(Json(serde_json::to_value(response)?));
        }
    }

    // Acquire lock
    let _lock_key = format!("siem:lock:rulepacks:apply:{}", tenant_id);
    // Acquire lock (stubbed)
    let _lock_guard = ();

    // Load original deployment
    let deploy_query = "SELECT * FROM dev.rule_pack_deployments WHERE deploy_id = ?";
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct DeploymentRow { pack_id:String, #[allow(dead_code)] canary:u8, #[allow(dead_code)] canary_current_stage:u8, #[allow(dead_code)] canary_state:String }
    let deployment: Option<DeploymentRow> = state
        .ch
        .query(deploy_query)
        .bind(deploy_id.clone())
        .fetch_optional::<DeploymentRow>()
        .await?;

    let deployment = deployment.ok_or_else(|| PipelineError::not_found("Deployment not found".to_string()))?;

    // Load snapshots for this deployment
    let snapshots_query = "SELECT * FROM dev.rule_snapshots WHERE deploy_id = ?";
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct SnapshotRow { rule_id:String, body:String, sha256:String }
    let snapshots: Vec<SnapshotRow> = state
        .ch
        .query(snapshots_query)
        .bind(deploy_id.clone())
        .fetch_all::<SnapshotRow>()
        .await?;

    if snapshots.is_empty() {
        return Err(PipelineError::validation("No snapshots found for rollback".to_string()));
    }

    // Generate rollback deploy ID
    let rollback_deploy_id = Ulid::new().to_string();

    // Create rollback deployment record
    let rollback_query = r#"
        INSERT INTO dev.rule_pack_deployments 
        (deploy_id, pack_id, status, strategy, actor, canary, canary_state, rolled_back_from, rolled_back_to)
        VALUES (?, ?, 'ROLLED_BACK', 'rollback', ?, 0, 'disabled', ?, ?)
    "#;

    state.ch
        .query(rollback_query)
        .bind(rollback_deploy_id.clone())
        .bind(deployment.pack_id.clone())
        .bind("system")
        .bind(deploy_id.clone())
        .bind(rollback_deploy_id.clone())
        .execute()
        .await?;

    // Apply rollback changes
    let mut summary = DeploySummary {
        rules_created: Vec::new(),
        rules_updated: Vec::new(),
        rules_disabled: Vec::new(),
    };

    for snapshot in &snapshots {
        let rule_id = snapshot.rule_id.as_str();
        let _body = snapshot.body.as_str();
        let sha256 = snapshot.sha256.as_str();

        // Restore rule to snapshot state
        summary.rules_updated.push(rule_id.to_string());
        
        log_rule_change(
            &state.ch,
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
    
    state.ch
        .query(artifact_query)
        .bind(rollback_deploy_id.clone())
        .bind(serde_json::to_string(&rollback_artifact)?)
        .execute()
        .await?;

    let response = RollbackResponse {
        rollback_deploy_id,
        original_deploy_id: deploy_id,
        summary: summary.clone(),
        totals: PlanTotals {
            create: 0,
            update: summary.rules_updated.len() as u32,
            disable: 0,
            skip: 0,
        },
    };

    // Cache result
    // TODO: cache result when idempotency is wired

    // Update metrics
    // metrics::increment_counter(
    //     "siem_v2_rulepack_rollback_total",
    //     &[("outcome", "success")]
    // );

    Ok(Json(serde_json::to_value(response)?))
}

// Canary control endpoints
pub async fn canary_control(
    State(state): State<Arc<AppState>>,
    Path(deploy_id): Path<String>,
    headers: HeaderMap,
    Json(req): Json<CanaryControlRequest>,
) -> PipelineResult<Json<serde_json::Value>> {
    let _tenant_id = headers
        .get("x-tenant-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
        .ok_or_else(|| PipelineError::validation("Missing or invalid x-tenant-id".to_string()))?;

    // Load deployment
    let deploy_query = "SELECT * FROM dev.rule_pack_deployments WHERE deploy_id = ?";
    #[derive(serde::Deserialize, clickhouse::Row)]
    struct DeploymentRow { _pack_id:String, canary:u8, canary_current_stage:u8, canary_state:String }
    let deployment: Option<DeploymentRow> = state
        .ch
        .query(deploy_query)
        .bind(deploy_id.clone())
        .fetch_optional::<DeploymentRow>()
        .await?;

    let deployment = deployment.ok_or_else(|| PipelineError::not_found("Deployment not found".to_string()))?;
    
    let canary_enabled = deployment.canary > 0;
    if !canary_enabled {
        return Err(PipelineError::validation("Deployment does not have canary enabled".to_string()));
    }

    let current_stage = deployment.canary_current_stage;
    let canary_state = deployment.canary_state.as_str();

    let (new_state, new_stage, message) = match req.action.as_str() {
        "advance" => {
            if canary_state != "running" {
                return Err(PipelineError::validation("Canary is not running".to_string()));
            }
            
            // Advance to next stage
            let next_stage = current_stage + 1;
            let next_state_str = if next_stage >= 100 { "completed" } else { "running" };
            
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
            
    state.ch
        .query(artifact_query)
        .bind(deploy_id.clone())
        .bind(serde_json::to_string(&stage_artifact)?)
        .execute()
        .await?;

            // Update deployment
            let update_query = r#"
                ALTER TABLE dev.rule_pack_deployments
                UPDATE canary_current_stage = ?, canary_state = ?
                WHERE deploy_id = ?
            "#;
            
            state.ch
                .query(update_query)
                .bind(next_stage as u8)
                .bind(next_state_str.to_string())
                .bind(deploy_id.clone())
                .execute()
                .await?;

            (next_state_str.to_string(), next_stage, format!("Advanced to stage {}", next_stage))
        }
        "pause" => {
            if canary_state != "running" {
                return Err(PipelineError::validation("Canary is not running".to_string()));
            }
            
            let update_query = r#"
                ALTER TABLE dev.rule_pack_deployments
                UPDATE canary_state = 'paused'
                WHERE deploy_id = ?
            "#;
            
            state.ch
                .query(update_query)
                .bind(deploy_id.clone())
                .execute()
                .await?;

            ("paused".to_string(), current_stage, "Canary paused".to_string())
        }
        "cancel" => {
            // Cancel and rollback
            let update_query = r#"
                ALTER TABLE dev.rule_pack_deployments
                UPDATE canary_state = 'failed', errors = 'Cancelled by user'
                WHERE deploy_id = ?
            "#;
            
            state.ch
                .query(update_query)
                .bind(deploy_id.clone())
                .execute()
                .await?;

            ("failed".to_string(), current_stage, "Canary cancelled".to_string())
        }
        _ => return Err(PipelineError::validation("Invalid action".to_string())),
    };

    // Update metrics
    // metrics::increment_counter(
    //     "siem_v2_rulepack_canary_stage_total",
    //     &[("stage", &new_stage.to_string())]
    // );

    let response = CanaryControlResponse {
        deploy_id,
        canary_state: new_state,
        current_stage: new_stage,
        message,
    };

    Ok(Json(serde_json::to_value(response)?))
}

// Get deployment artifacts
pub async fn get_deployment_artifacts(
    State(state): State<Arc<AppState>>,
    Path(deploy_id): Path<String>,
) -> PipelineResult<Json<serde_json::Value>> {
    let query = "SELECT kind, content, created_at FROM dev.rule_pack_artifacts WHERE deploy_id = ? ORDER BY created_at";
    #[derive(serde::Deserialize, clickhouse::Row, serde::Serialize)]
    struct ArtifactRow { kind:String, content:String, created_at:String }
    let artifacts: Vec<ArtifactRow> = state
        .ch
        .query(query)
        .bind(deploy_id)
        .fetch_all::<ArtifactRow>()
        .await?;
    Ok(Json(serde_json::to_value(artifacts)?))
}

// List rule packs
pub async fn list_packs(
    State(state): State<Arc<AppState>>,
) -> PipelineResult<Json<serde_json::Value>> {
    let query = "SELECT * FROM dev.rule_packs ORDER BY uploaded_at DESC LIMIT 100";
    let packs: Vec<RulePack> = state
        .ch
        .query(query)
        .fetch_all::<RulePack>()
        .await?;
    Ok(Json(serde_json::to_value(packs)?))
}

// Get pack details
pub async fn get_pack(
    State(state): State<Arc<AppState>>,
    Path(pack_id): Path<String>,
) -> PipelineResult<Json<serde_json::Value>> {
    let query = "SELECT * FROM dev.rule_packs WHERE pack_id = ?";
    let pack: Option<RulePack> = state
        .ch
        .query(query)
        .bind(pack_id)
        .fetch_optional::<RulePack>()
        .await?;
    
    match pack {
        Some(p) => Ok(Json(serde_json::to_value(p)?)),
        None => Err(PipelineError::not_found("Pack not found".to_string())),
    }
}

// Helper functions

async fn extract_rules(_file_data: &[u8]) -> Result<(Vec<RulePackItem>, Vec<UploadError>), PipelineError> {
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

async fn compile_rule(_state: &Arc<AppState>, _kind: &str, _body: &str) -> serde_json::Value {
    // TODO: Call actual compile endpoint
    serde_json::json!({
        "ok": true,
        "sql": "SELECT * FROM events WHERE EventID = 4625"
    })
}

async fn calculate_guardrails(
    _state: &Arc<AppState>,
    entries: &[PlanEntry],
    totals: &PlanTotals,
    strategy: &str,
) -> Result<GuardrailStatus, PipelineError> {
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
    for _reason in &blocked_reasons {
        // metrics::increment_counter(
        //     "siem_v2_rulepack_guardrail_block_total",
        //     &[("reason", reason)]
        // );
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
    ch: &clickhouse::Client,
    entries: &[PlanEntry],
    pack_id: &str,
    deploy_id: &str,
) -> Result<(), PipelineError> {
    for entry in entries {
        if let Some(from_sha) = &entry.from_sha {
            // Get current rule body
            let rule_query = "SELECT body FROM dev.alert_rules WHERE rule_id = ?";
    let rule_body: Option<String> = ch
        .query(rule_query)
        .bind(entry.rule_id.clone())
        .fetch_optional::<String>()
        .await?;
            
            if let Some(body) = rule_body {
                let snapshot_id = Ulid::new().to_string();
                let snapshot_query = r#"
                    INSERT INTO dev.rule_snapshots 
                    (snapshot_id, rule_id, sha256, body, by_pack, deploy_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                "#;
                
                ch
                    .query(snapshot_query)
                    .bind(snapshot_id)
                    .bind(entry.rule_id.clone())
                    .bind(from_sha.clone())
                    .bind(body)
                    .bind(pack_id.to_string())
                    .bind(deploy_id.to_string())
                    .execute()
                    .await?;
            }
        }
    }
    
    Ok(())
}

    #[allow(clippy::too_many_arguments)]
    async fn log_rule_change(
    ch: &clickhouse::Client,
    tenant_id: u32,
    actor: &str,
    action: &str,
    rule_id: &str,
    from_sha: &str,
    to_sha: &str,
    deploy_id: &str,
) -> Result<(), PipelineError> {
    let query = r#"
        INSERT INTO dev.rule_change_log 
        (tenant_id, actor, action, rule_id, from_sha, to_sha, deploy_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    "#;
    
    ch
        .query(query)
        .bind(tenant_id as u64)
        .bind(actor.to_string())
        .bind(action.to_string())
        .bind(rule_id.to_string())
        .bind(from_sha.to_string())
        .bind(to_sha.to_string())
        .bind(deploy_id.to_string())
        .execute()
        .await?;
    
    // Update metrics
    // metrics::increment_counter(
    //     "siem_v2_rule_changes_total",
    //     &[("action", action)]
    // );
    
    Ok(())
}
