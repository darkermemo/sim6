use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post, delete, patch, put},
    Router,
};
use std::sync::Arc;

use crate::v2::state::AppState;
use crate::v2::handlers::{
    alerts, alert_rules, rule_packs, search, agents, incidents, investigations,
    saved_searches, health, metrics, events, schema, cim, investigate,
    admin_streaming, admin_storage, collectors, ingest, parse, assets,
};
use crate::v2::metrics as v2_metrics;

// v2 admin (authoritative)
use crate::v2::handlers::admin::{parsers as v2_admin_parsers, tenants as v2_admin_tenants, limits as v2_admin_limits};
use crate::v2::handlers::admin_log_sources as v2_admin_log_sources;

// legacy admin (optional)
#[cfg(feature = "legacy-admin")]
use crate::v2::handlers::admin::{apikeys as legacy_admin_apikeys, roles as legacy_admin_roles, agents as legacy_admin_agents, health as legacy_admin_health};

#[cfg(feature = "legacy-admin")]
fn legacy_admin_router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    use axum::routing::{get, post, delete};
    Router::new()
        .route("/api/v2/admin/apikeys", post(legacy_admin_apikeys::create_key).get(legacy_admin_apikeys::list_keys))
        .route("/api/v2/admin/apikeys/:id", get(legacy_admin_apikeys::get_key).delete(legacy_admin_apikeys::delete_key))
        .route("/api/v2/admin/roles", get(legacy_admin_roles::list_roles))
        .route("/api/v2/admin/agents", get(legacy_admin_agents::list_agents))
        .route("/api/v2/admin/health", get(legacy_admin_health::get_config))
}

#[cfg(not(feature = "legacy-admin"))]
fn legacy_admin_router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
}

pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        // Health and metrics endpoints
        .route("/health", get(health::health_check))
        .route("/metrics", get(v2_metrics::metrics_text))
        .route("/api/v2/health", get(health::health_check))
        .route("/api/v2/metrics", get(metrics::get_quick_stats))
        
        // Alerts endpoints
        .route("/api/v2/alerts", get(alerts::list_alerts))
        .route("/api/v2/alerts/:id", get(alerts::get_alert))
        .route("/api/v2/alerts/:id/notes", post(alerts::add_note))
        .route("/api/v2/alerts/:id/status", patch(alerts::patch_alert))
        
        // Rules endpoints
        .route("/api/v2/rules", get(alert_rules::list_alert_rules))
        .route("/api/v2/rules", post(alert_rules::create_rule))
        .route("/api/v2/rules/:id", get(alert_rules::get_rule))
        .route("/api/v2/rules/:id", patch(alert_rules::patch_rule))
        .route("/api/v2/rules/:id", delete(alert_rules::delete_rule))
        .route("/api/v2/rules/:id/compile", post(alert_rules::sigma_compile))
        .route("/api/v2/rules/:id/dry-run", post(alert_rules::rule_dry_run))
        .route("/api/v2/rules/:id/run-now", post(alert_rules::rule_run_now))
        
        // Rule packs endpoints
        .route("/api/v2/rule-packs", get(rule_packs::list_packs))
        .route("/api/v2/rule-packs/upload", post(rule_packs::upload_pack)
            .layer(DefaultBodyLimit::max(50 * 1024 * 1024))) // 50 MiB limit
        .route("/api/v2/rule-packs/:pack_id", get(rule_packs::get_pack))
        .route("/api/v2/rule-packs/:pack_id/plan", post(rule_packs::plan_deployment))
        .route("/api/v2/rule-packs/:pack_id/apply", post(rule_packs::apply_deployment))
        .route("/api/v2/rule-packs/deployments/:deploy_id/rollback", post(rule_packs::rollback_deployment))
        .route("/api/v2/rule-packs/deployments/:deploy_id/canary/advance", post(rule_packs::canary_control))
        .route("/api/v2/rule-packs/deployments/:deploy_id/canary/pause", post(rule_packs::canary_control))
        .route("/api/v2/rule-packs/deployments/:deploy_id/canary/cancel", post(rule_packs::canary_control))
        .route("/api/v2/rule-packs/deployments/:deploy_id/artifacts", get(rule_packs::get_deployment_artifacts))
        
        // Search endpoints
        .route("/api/v2/search", post(search::search_execute))
        .route("/api/v2/search/compile", post(search::search_estimate))
        .route("/api/v2/search/facets", post(search::search_facets))
        
        // Saved searches endpoints
        .route("/api/v2/saved-searches", get(saved_searches::list_saved))
        .route("/api/v2/saved-searches", post(saved_searches::create_saved))
        .route("/api/v2/saved-searches/:id", get(saved_searches::get_saved))
        .route("/api/v2/saved-searches/:id", patch(saved_searches::update_saved))
        .route("/api/v2/saved-searches/:id", delete(saved_searches::delete_saved))
        
        // Log sources endpoints (v2 admin authoritative handlers)
        .route("/api/v2/log-sources", get(v2_admin_log_sources::list_sources))
        .route("/api/v2/log-sources", post(v2_admin_log_sources::create_source))
        .route("/api/v2/log-sources/:id", get(v2_admin_log_sources::get_source))
        .route("/api/v2/log-sources/:id", patch(v2_admin_log_sources::update_source))
        .route("/api/v2/log-sources/:id", delete(v2_admin_log_sources::delete_source))
        
        // Incidents endpoints
        .route("/api/v2/incidents", get(incidents::list_incidents))
        .route("/api/v2/incidents", post(incidents::create_incident))
        .route("/api/v2/incidents/:id", get(incidents::get_incident))
        .route("/api/v2/incidents/:id", patch(incidents::patch_incident))
        .route("/api/v2/incidents/:id", delete(incidents::delete_incident))
        
        // Investigations endpoints
        .route("/api/v2/investigations", get(investigations::list_views))
        .route("/api/v2/investigations", post(investigations::create_view))
        .route("/api/v2/investigations/:id", get(investigations::get_view))
        .route("/api/v2/investigations/:id", patch(investigations::update_view))
        .route("/api/v2/investigations/:id", delete(investigations::delete_view))
        
        // v2 Admin log sources endpoints
        .route("/api/v2/admin/log-sources", get(v2_admin_log_sources::list_sources))
        .route("/api/v2/admin/log-sources", post(v2_admin_log_sources::create_source))
        .route("/api/v2/admin/log-sources/:id", get(v2_admin_log_sources::get_source))
        .route("/api/v2/admin/log-sources/:id", patch(v2_admin_log_sources::update_source))
        .route("/api/v2/admin/log-sources/:id", delete(v2_admin_log_sources::delete_source))

        // v2 Admin parsers endpoints
        .route("/api/v2/admin/parsers", get(v2_admin_parsers::list_parsers))
        .route("/api/v2/admin/parsers", post(v2_admin_parsers::create_parser))
        .route("/api/v2/admin/parsers/:parser_id/validate", get(v2_admin_parsers::validate_parser))
        .route("/api/v2/admin/parsers/:parser_id/sample", post(v2_admin_parsers::test_sample))
        .route("/api/v2/admin/parsers/:parser_id", delete(v2_admin_parsers::delete_parser))

        // v2 Admin tenants endpoints
        .route("/api/v2/admin/tenants", get(v2_admin_tenants::list_tenants).post(v2_admin_tenants::create_tenant))
        .route("/api/v2/admin/tenants/:id", get(v2_admin_tenants::get_tenant).patch(v2_admin_tenants::update_tenant))
        .route("/api/v2/admin/tenants/:id/limits", get(v2_admin_limits::get_tenant_limits).put(v2_admin_limits::update_tenant_limits))
        
        // Agents endpoints
        .route("/agents", get(agents::list_agents))
        .route("/agents/enroll-keys", post(agents::create_enroll_key))
        .route("/agents/enroll", post(agents::enroll_agent))
        .route("/agents/:agent_id/heartbeat", post(agents::heartbeat))
        .route("/agents/:agent_id/config", get(agents::get_agent_config))
        .route("/agents/:agent_id/config/apply", post(agents::apply_config))
        .route("/agents/:agent_id/test-pipeline", post(agents::test_pipeline))
        
        // Additional endpoints
        .route("/api/v2/events", post(events::search_events))
        .route("/api/v2/events/compact", post(events::search_events_compact))
        .route("/api/v2/events/insert", post(events::insert_events))
        
        .route("/api/v2/schema/fields", get(schema::get_fields))
        .route("/api/v2/schema/enums", get(schema::get_enums))
        
        .route("/api/v2/cim/validate", post(cim::cim_validate))
        .route("/api/v2/cim/coverage", get(cim::get_coverage))
        
        .route("/api/v2/investigate/graph", post(investigate::graph))
        
        .route("/api/v2/streaming/status", get(admin_streaming::streaming_status))
        .route("/api/v2/streaming/reclaim", post(admin_streaming::streaming_reclaim))
        .route("/api/v2/streaming/kafka/status", get(admin_streaming::kafka_status))
        .route("/api/v2/streaming/kafka/reclaim", post(admin_streaming::kafka_reclaim))
        
        .route("/api/v2/storage/:tenant", get(admin_storage::get_storage))
        .route("/api/v2/storage/:tenant", put(admin_storage::put_storage))
        
        .route("/api/v2/collectors/health", get(collectors::health))
        .route("/api/v2/collectors/metrics", get(collectors::metrics))
        .route("/api/v2/collectors/configure", post(collectors::configure))
        
        .route("/api/v2/ingest/raw", post(ingest::ingest_raw))
        .route("/api/v2/ingest/bulk", post(ingest::ingest_bulk))
        
        .route("/api/v2/parse/detect", post(parse::detect))
        .route("/api/v2/parse/normalize", post(parse::normalize))
        
        .route("/favicon.ico", get(assets::favicon))
        
        .merge(legacy_admin_router::<Arc<AppState>>())
        .with_state(state)
}

// Backwards-compatible name expected by main.rs
pub fn build(state: Arc<AppState>) -> Router {
    create_router(state)
}


