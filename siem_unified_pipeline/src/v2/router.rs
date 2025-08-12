use axum::{
    extract::{DefaultBodyLimit, Path, Query, State},
    routing::{get, post, delete, patch, put},
    Json, Router,
};
use std::sync::Arc;

use crate::v2::state::AppState;
use crate::v2::handlers::{
    alerts, alert_rules, rule_packs, search, agents, incidents, investigations,
    saved_searches, admin_log_sources, admin_parsers, admin_api_keys, admin_tenants,
    sources, parsers, health, metrics, events, schema, cim, investigate, sse,
    admin_streaming, admin_storage, collectors, ingest, parse, assets,
    admin::{health as admin_health, sources as admin_sources, parsers as admin_parsers_main}
};

pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        // Health and metrics endpoints
        .route("/health", get(health::health_check))
        .route("/metrics", get(metrics::get_quick_stats))
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
        
        // Log sources endpoints
        .route("/api/v2/log-sources", get(sources::list_sources))
        .route("/api/v2/log-sources", post(sources::create_source))
        .route("/api/v2/log-sources/:id", get(sources::get_source))
        .route("/api/v2/log-sources/:id", patch(sources::patch_source))
        .route("/api/v2/log-sources/:id", delete(sources::deploy_source))
        
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
        
        // Admin API keys endpoints
        .route("/api/v2/admin/api-keys", get(admin_api_keys::list_keys))
        .route("/api/v2/admin/api-keys", post(admin_api_keys::create_key))
        .route("/api/v2/admin/api-keys/:id", get(admin_api_keys::get_key))
        .route("/api/v2/admin/api-keys/:id", patch(admin_api_keys::update_key))
        .route("/api/v2/admin/api-keys/:id", delete(admin_api_keys::delete_key))
        .route("/api/v2/admin/api-keys/:id/rotate", post(admin_api_keys::rotate_key))
        
        // Admin log sources endpoints
        .route("/api/v2/admin/log-sources", get(admin_log_sources::list_sources))
        .route("/api/v2/admin/log-sources", post(admin_log_sources::create_source))
        .route("/api/v2/admin/log-sources/:id", get(admin_log_sources::get_source))
        .route("/api/v2/admin/log-sources/:id", patch(admin_log_sources::update_source))
        .route("/api/v2/admin/log-sources/:id", delete(admin_log_sources::delete_source))
        
        // Admin parsers endpoints
        .route("/api/v2/admin/parsers", get(admin_parsers::list_parsers))
        .route("/api/v2/admin/parsers", post(admin_parsers::create_parser))
        .route("/api/v2/admin/parsers/:id", get(admin_parsers::get_parser))
        .route("/api/v2/admin/parsers/:id", patch(admin_parsers::update_parser))
        .route("/api/v2/admin/parsers/:id", delete(admin_parsers::delete_parser))
        
        // Admin tenants endpoints
        .route("/admin/tenants", get(admin_tenants::list_tenants).post(admin_tenants::create_tenant))
        .route("/admin/tenants/:id", get(admin_tenants::get_tenant).patch(admin_tenants::patch_tenant))
        .route("/admin/tenants/:id/limits", get(admin_tenants::get_limits).put(admin_tenants::put_limits))
        .route("/admin/tenants/:id/api-keys", get(admin_tenants::list_api_keys).post(admin_tenants::create_api_key))
        .route("/admin/tenants/:id/api-keys/:key_id", delete(admin_tenants::revoke_api_key))
        
        // Admin roles endpoints
        .route("/admin/roles", get(admin_health::get_config))
        .route("/admin/roles/:role", put(admin_health::put_config))
        
        // Admin deep health endpoints
        .route("/admin/deep-health", get(admin_health::get_config).post(admin_health::put_config))
        
        // Admin sources endpoints
        .route("/admin/sources", get(admin_sources::list_sources).post(admin_sources::create_source))
        .route("/admin/sources/:source_id", patch(admin_sources::update_source).delete(admin_sources::delete_source))
        .route("/admin/sources/:source_id/test-connection", post(admin_sources::test_connection))
        .route("/admin/sources/:source_id/test-connection/:token/tail", get(sse::tail_stream))
        .route("/admin/sources/:source_id/test-sample", post(admin_sources::test_sample))
        
        // Admin parsers endpoints
        .route("/admin/parsers", get(admin_parsers_main::list_parsers).post(admin_parsers_main::create_parser))
        .route("/admin/parsers/:parser_id/validate", get(admin_parsers_main::validate_parser))
        .route("/admin/parsers/:parser_id/sample", post(admin_parsers_main::test_sample))
        .route("/admin/parsers/:parser_id", delete(admin_parsers_main::delete_parser))
        
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
        
        .with_state(state)
}


