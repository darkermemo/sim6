use axum::{extract::State, Json, http::StatusCode};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use crate::v2::state::AppState;
use crate::ch::{Ch, ChResponse, default_query_settings};

// Dashboard panel types - allow-listed, no custom SQL

#[derive(Debug, Deserialize)]
pub struct PanelsRequest {
    pub tenant_id: String,
    pub time: TimeRange,
    pub panels: Vec<PanelDef>,
}

#[derive(Debug, Deserialize)]
pub struct TimeRange {
    pub from: u64,
    pub to: u64,
    #[serde(default = "default_interval")]
    pub interval_seconds: u32,
}

fn default_interval() -> u32 { 60 }

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
pub enum PanelDef {
    #[serde(rename = "timeseries_count")]
    TimeseriesCount { 
        id: String,
        #[serde(default)]
        filters: PanelFilters,
    },
    
    #[serde(rename = "by_severity_top")]
    BySeverityTop { 
        id: String,
        #[serde(default = "default_top_limit")]
        limit: u32,
    },
    
    #[serde(rename = "single_stat")]
    SingleStat {
        id: String,
        stat: StatType,
        #[serde(default)]
        filters: PanelFilters,
    },
    
    #[serde(rename = "top_sources")]
    TopSources {
        id: String,
        #[serde(default = "default_top_limit")]
        limit: u32,
    },
    
    #[serde(rename = "event_types")]
    EventTypes {
        id: String,
        #[serde(default = "default_top_limit")]
        limit: u32,
    },
}

#[derive(Debug, Deserialize, Default)]
pub struct PanelFilters {
    pub severity: Option<String>,
    pub event_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StatType {
    Count,
    UniqueUsers,
    UniqueSources,
}

fn default_top_limit() -> u32 { 10 }

#[derive(Debug, Serialize)]
pub struct PanelsResponse {
    pub results: Vec<PanelResult>,
}

#[derive(Debug, Serialize)]
pub struct PanelResult {
    pub id: String,
    pub columns: Vec<&'static str>,
    pub rows: Vec<Value>,
    pub error: Option<String>,
}

/// POST /api/v2/dashboards/panels - Execute multiple dashboard panels
/// All panels use allow-listed SQL templates with parameters
pub async fn run_panels(
    State(st): State<Arc<AppState>>,
    Json(req): Json<PanelsRequest>,
) -> Result<Json<PanelsResponse>, StatusCode> {
    // Validate inputs
    let tenant_id = validate_tenant_id(&req.tenant_id)?;
    let interval = req.time.interval_seconds.clamp(10, 3600);
    
    // Validate time range
    if req.time.from >= req.time.to {
        return Err(StatusCode::BAD_REQUEST);
    }
    
    // Max 30 days
    if req.time.to - req.time.from > 2592000 {
        return Err(StatusCode::BAD_REQUEST);
    }
    
    // Shared parameters for all queries
    let base_params = vec![
        ("tenant", tenant_id.clone()),
        ("from", req.time.from.to_string()),
        ("to", req.time.to.to_string()),
        ("interval", interval.to_string()),
    ];
    
    let settings = default_query_settings();
    let ch = get_ch_client(&st)?;
    
    // Execute each panel
    let mut results = Vec::new();
    
    for panel in &req.panels {
        let result = match panel {
            PanelDef::TimeseriesCount { id, filters } => {
                execute_timeseries_count(&ch, &base_params, &settings, id, filters).await
            },
            PanelDef::BySeverityTop { id, limit } => {
                execute_by_severity_top(&ch, &base_params, &settings, id, *limit).await
            },
            PanelDef::SingleStat { id, stat, filters } => {
                execute_single_stat(&ch, &base_params, &settings, id, stat, filters).await
            },
            PanelDef::TopSources { id, limit } => {
                execute_top_sources(&ch, &base_params, &settings, id, *limit).await
            },
            PanelDef::EventTypes { id, limit } => {
                execute_event_types(&ch, &base_params, &settings, id, *limit).await
            },
        };
        
        results.push(result);
    }
    
    Ok(Json(PanelsResponse { results }))
}

/// Execute timeseries count panel
async fn execute_timeseries_count(
    ch: &Ch,
    base_params: &[(&str, String)],
    settings: &[(&str, &str)],
    id: &str,
    filters: &PanelFilters,
) -> PanelResult {
    let sql = r#"
        SELECT 
            toUnixTimestamp(toStartOfInterval(event_timestamp, INTERVAL {interval:UInt32} SECOND)) AS ts,
            count() AS count
        FROM dev.events
        WHERE 
            tenant_id = {tenant:String}
            AND event_timestamp >= toDateTime({from:UInt32})
            AND event_timestamp < toDateTime({to:UInt32})
            {filters}
        GROUP BY ts 
        ORDER BY ts ASC
    "#;
    
    let mut params = base_params.to_vec();
    let filters_sql = build_panel_filters(filters, &mut params);
    let sql = sql.replace("{filters}", &filters_sql);
    
    match ch.query_json::<ChResponse>(&sql, &params, settings).await {
        Ok(resp) => PanelResult {
            id: id.to_string(),
            columns: vec!["ts", "count"],
            rows: resp.data,
            error: None,
        },
        Err(e) => PanelResult {
            id: id.to_string(),
            columns: vec![],
            rows: vec![],
            error: Some(format!("Query failed: {}", e)),
        },
    }
}

/// Execute severity distribution panel
async fn execute_by_severity_top(
    ch: &Ch,
    base_params: &[(&str, String)],
    settings: &[(&str, &str)],
    id: &str,
    limit: u32,
) -> PanelResult {
    let sql = r#"
        SELECT 
            severity,
            count() AS count
        FROM dev.events
        WHERE 
            tenant_id = {tenant:String}
            AND event_timestamp >= toDateTime({from:UInt32})
            AND event_timestamp < toDateTime({to:UInt32})
        GROUP BY severity
        ORDER BY count DESC
        LIMIT {limit:UInt32}
    "#;
    
    let mut params = base_params.to_vec();
    params.push(("limit", limit.clamp(1, 100).to_string()));
    
    match ch.query_json::<ChResponse>(&sql, &params, settings).await {
        Ok(resp) => PanelResult {
            id: id.to_string(),
            columns: vec!["severity", "count"],
            rows: resp.data,
            error: None,
        },
        Err(e) => PanelResult {
            id: id.to_string(),
            columns: vec![],
            rows: vec![],
            error: Some(format!("Query failed: {}", e)),
        },
    }
}

/// Execute single stat panel
async fn execute_single_stat(
    ch: &Ch,
    base_params: &[(&str, String)],
    settings: &[(&str, &str)],
    id: &str,
    stat: &StatType,
    filters: &PanelFilters,
) -> PanelResult {
    let sql = match stat {
        StatType::Count => r#"
            SELECT count() AS value
            FROM dev.events
            WHERE 
                tenant_id = {tenant:String}
                AND event_timestamp >= toDateTime({from:UInt32})
                AND event_timestamp < toDateTime({to:UInt32})
                {filters}
        "#,
        StatType::UniqueUsers => r#"
            SELECT count(DISTINCT user_name) AS value
            FROM dev.events
            WHERE 
                tenant_id = {tenant:String}
                AND event_timestamp >= toDateTime({from:UInt32})
                AND event_timestamp < toDateTime({to:UInt32})
                AND user_name != ''
                {filters}
        "#,
        StatType::UniqueSources => r#"
            SELECT count(DISTINCT source_ip) AS value
            FROM dev.events
            WHERE 
                tenant_id = {tenant:String}
                AND event_timestamp >= toDateTime({from:UInt32})
                AND event_timestamp < toDateTime({to:UInt32})
                AND source_ip != ''
                {filters}
        "#,
    };
    
    let mut params = base_params.to_vec();
    let filters_sql = build_panel_filters(filters, &mut params);
    let sql = sql.replace("{filters}", &filters_sql);
    
    match ch.query_json::<ChResponse>(&sql, &params, settings).await {
        Ok(resp) => PanelResult {
            id: id.to_string(),
            columns: vec!["value"],
            rows: resp.data,
            error: None,
        },
        Err(e) => PanelResult {
            id: id.to_string(),
            columns: vec![],
            rows: vec![],
            error: Some(format!("Query failed: {}", e)),
        },
    }
}

/// Execute top sources panel
async fn execute_top_sources(
    ch: &Ch,
    base_params: &[(&str, String)],
    settings: &[(&str, &str)],
    id: &str,
    limit: u32,
) -> PanelResult {
    let sql = r#"
        SELECT 
            source_ip,
            count() AS count
        FROM dev.events
        WHERE 
            tenant_id = {tenant:String}
            AND event_timestamp >= toDateTime({from:UInt32})
            AND event_timestamp < toDateTime({to:UInt32})
            AND source_ip != ''
        GROUP BY source_ip
        ORDER BY count DESC
        LIMIT {limit:UInt32}
    "#;
    
    let mut params = base_params.to_vec();
    params.push(("limit", limit.clamp(1, 100).to_string()));
    
    match ch.query_json::<ChResponse>(&sql, &params, settings).await {
        Ok(resp) => PanelResult {
            id: id.to_string(),
            columns: vec!["source_ip", "count"],
            rows: resp.data,
            error: None,
        },
        Err(e) => PanelResult {
            id: id.to_string(),
            columns: vec![],
            rows: vec![],
            error: Some(format!("Query failed: {}", e)),
        },
    }
}

/// Execute event types panel
async fn execute_event_types(
    ch: &Ch,
    base_params: &[(&str, String)],
    settings: &[(&str, &str)],
    id: &str,
    limit: u32,
) -> PanelResult {
    let sql = r#"
        SELECT 
            event_type,
            count() AS count
        FROM dev.events
        WHERE 
            tenant_id = {tenant:String}
            AND event_timestamp >= toDateTime({from:UInt32})
            AND event_timestamp < toDateTime({to:UInt32})
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT {limit:UInt32}
    "#;
    
    let mut params = base_params.to_vec();
    params.push(("limit", limit.clamp(1, 100).to_string()));
    
    match ch.query_json::<ChResponse>(&sql, &params, settings).await {
        Ok(resp) => PanelResult {
            id: id.to_string(),
            columns: vec!["event_type", "count"],
            rows: resp.data,
            error: None,
        },
        Err(e) => PanelResult {
            id: id.to_string(),
            columns: vec![],
            rows: vec![],
            error: Some(format!("Query failed: {}", e)),
        },
    }
}

/// Build filter clause from panel filters
fn build_panel_filters(filters: &PanelFilters, params: &mut Vec<(&str, String)>) -> String {
    let mut clauses = Vec::new();
    
    if let Some(severity) = &filters.severity {
        params.push(("filter_severity", severity.clone()));
        clauses.push("AND severity = {filter_severity:String}");
    }
    
    if let Some(event_type) = &filters.event_type {
        params.push(("filter_event_type", event_type.clone()));
        clauses.push("AND event_type = {filter_event_type:String}");
    }
    
    clauses.join(" ")
}

/// Validate tenant ID
fn validate_tenant_id(tenant_id: &str) -> Result<String, StatusCode> {
    if tenant_id.is_empty() || tenant_id.len() > 64 {
        return Err(StatusCode::BAD_REQUEST);
    }
    
    if !tenant_id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err(StatusCode::BAD_REQUEST);
    }
    
    Ok(tenant_id.to_string())
}

/// Get ClickHouse client
fn get_ch_client(st: &AppState) -> Result<Ch, StatusCode> {
    use crate::ch::Ch;
    
    // In production, this would come from app state
    let ch = Ch::new(
        "http://127.0.0.1:8123".to_string(),
        "default".to_string(),
        "".to_string(),
    );
    Ok(ch)
}
