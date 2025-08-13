use axum::{Json, extract::{State, Query}};
use std::sync::Arc;
use std::collections::HashMap;
use serde_json::{json, Value};
use crate::v2::state::AppState;

#[derive(serde::Serialize)]
pub struct FieldInfo { 
    pub name: String, 
    pub r#type: String 
}

#[derive(serde::Serialize)]
pub struct FieldsResponse {
    pub fields: Vec<FieldInfo>
}

/// GET /api/v2/schema/fields?table=events - dynamic field catalog from ClickHouse
pub async fn get_fields(
    State(app): State<Arc<AppState>>, 
    Query(params): Query<HashMap<String, String>>
) -> Result<Json<FieldsResponse>, axum::http::StatusCode> {
    let table = params.get("table").cloned().unwrap_or_else(|| "events".into());
    
    let sql = format!(
        "SELECT name, type FROM system.columns WHERE database = 'dev' AND table = '{}' ORDER BY position",
        table.replace("'", "''")
    );
    
    let client = reqwest::Client::new();
    let resp = client
        .get("http://localhost:8123/")
        .query(&[("query", format!("{} FORMAT JSON", sql))])
        .send()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;

    if !resp.status().is_success() {
        return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
    }

    let text = resp.text().await.map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    let v: Value = serde_json::from_str(&text).map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let rows = v.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default();
    let mut fields = Vec::new();
    
    for row in rows {
        if let (Some(name), Some(field_type)) = (
            row.get("name").and_then(|n| n.as_str()),
            row.get("type").and_then(|t| t.as_str())
        ) {
            fields.push(FieldInfo {
                name: name.to_string(),
                r#type: field_type.to_string()
            });
        }
    }
    
    Ok(Json(FieldsResponse { fields }))
}

#[derive(serde::Deserialize)]
pub struct EnumQuery {
    pub table: Option<String>,
    pub tenant_id: Option<String>,
    pub last_seconds: Option<u32>,
}

#[derive(serde::Serialize)]
pub struct EnumsResponse {
    pub enums: HashMap<String, Vec<String>>
}

/// GET /api/v2/schema/enums?table=events&tenant_id=default&last_seconds=3600 - dynamic enums from data
pub async fn get_enums(
    State(app): State<Arc<AppState>>,
    Query(params): Query<EnumQuery>
) -> Result<Json<EnumsResponse>, axum::http::StatusCode> {
    let tenant = params.tenant_id.unwrap_or_else(|| "default".into());
    let last = params.last_seconds.unwrap_or(3600);
    
    let enum_fields = vec![
        "severity", "event_type", "source_type", "vendor", 
        "product", "event_outcome", "event_category", "event_action"
    ];
    
    let mut enums = HashMap::new();
    let client = reqwest::Client::new();
    
    for field in enum_fields {
        let sql = format!(
            "SELECT arraySort(groupUniqArray({field})) AS vals FROM dev.events WHERE tenant_id IN ('{tenant}') AND event_timestamp >= now() - INTERVAL {last} SECOND FORMAT JSON",
            field = field,
            tenant = tenant,
            last = last
        );
        
        let resp = client
            .get("http://localhost:8123/")
            .query(&[("query", &sql)])
            .send()
            .await
            .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;

        if resp.status().is_success() {
            if let Ok(text) = resp.text().await {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    if let Some(vals) = v.get("data")
                        .and_then(|d| d.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|row| row.get("vals"))
                        .and_then(|vals| vals.as_array())
                    {
                        let string_vals: Vec<String> = vals
                            .iter()
                            .filter_map(|v| v.as_str())
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string())
                            .collect();
                        enums.insert(field.to_string(), string_vals);
                    }
                }
            }
        }
        
        // Ensure we have at least an empty array for each field
        if !enums.contains_key(field) {
            enums.insert(field.to_string(), Vec::new());
        }
    }
    
    Ok(Json(EnumsResponse { enums }))
}


