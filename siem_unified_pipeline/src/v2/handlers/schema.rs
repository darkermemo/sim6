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

// === NEW FIELD CATALOG ENDPOINTS FOR WORLD-CLASS FILTERING ===

#[derive(serde::Deserialize)]
pub struct FieldCatalogQuery {
    pub tenant_id: Option<String>,
    pub prefix: Option<String>,
}

#[derive(serde::Serialize)]
pub struct FieldCatalogEntry {
    pub field: String,
    pub r#type: String, // "string|int|float|bool|datetime|ip"
    pub approx_cardinality: u64,
    pub top_values: Vec<TopValue>,
}

#[derive(serde::Serialize)]
pub struct TopValue {
    pub value: String,
    pub count: u64,
}

/// GET /api/v2/search/fields?tenant_id=default&prefix=win.
/// Returns live list of parsed fields with type, cardinality, and top values
pub async fn get_search_fields(
    State(app): State<Arc<AppState>>,
    Query(params): Query<FieldCatalogQuery>
) -> Result<Json<Vec<FieldCatalogEntry>>, axum::http::StatusCode> {
    let tenant = params.tenant_id.unwrap_or_else(|| "default".into());
    let prefix = params.prefix.unwrap_or_default();
    
    let client = reqwest::Client::new();
    
    // Step 1: Get schema from system.columns
    let filter_clause = if prefix.is_empty() {
        " ".to_string()
    } else {
        format!(" AND name LIKE '{}%' ", prefix.replace("'", "''"))
    };
    
    let schema_sql = format!(
        "SELECT name, type FROM system.columns WHERE database = 'dev' AND table = 'events'{}ORDER BY position FORMAT JSON",
        filter_clause
    );
    
    let schema_resp = client
        .get("http://localhost:8123/")
        .query(&[("query", &schema_sql)])
        .send()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;

    if !schema_resp.status().is_success() {
        return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
    }

    let schema_text = schema_resp.text().await.map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    let schema_json: Value = serde_json::from_str(&schema_text).map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let schema_rows = schema_json.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default();
    let mut fields = Vec::new();
    
    for row in schema_rows {
        if let (Some(field_name), Some(field_type)) = (
            row.get("name").and_then(|n| n.as_str()),
            row.get("type").and_then(|t| t.as_str())
        ) {
            // Skip system fields
            if field_name.starts_with("_") || field_name == "event_dt" {
                continue;
            }
            
            // Normalize ClickHouse types to simplified types
            let normalized_type = normalize_clickhouse_type(field_type);
            
            // Get cardinality and top values for this field
            let (cardinality, top_values) = get_field_stats(&client, field_name, &tenant).await;
            
            fields.push(FieldCatalogEntry {
                field: field_name.to_string(),
                r#type: normalized_type,
                approx_cardinality: cardinality,
                top_values,
            });
        }
    }
    
    // Sort by field name for consistent ordering
    fields.sort_by(|a, b| a.field.cmp(&b.field));
    
    Ok(Json(fields))
}

#[derive(serde::Deserialize)]
pub struct FieldValuesQuery {
    pub tenant_id: Option<String>,
    pub field: String,
    pub prefix: Option<String>,
    pub limit: Option<u32>,
}

/// GET /api/v2/search/values?tenant_id=default&field=host&prefix=web&limit=20
/// Returns top values for a specific field with optional prefix filtering
pub async fn get_search_values(
    State(app): State<Arc<AppState>>,
    Query(params): Query<FieldValuesQuery>
) -> Result<Json<Vec<TopValue>>, axum::http::StatusCode> {
    let tenant = params.tenant_id.unwrap_or_else(|| "default".into());
    let field = params.field;
    let prefix = params.prefix.unwrap_or_default();
    let limit = params.limit.unwrap_or(20).min(100); // Cap at 100 for performance
    
    let client = reqwest::Client::new();
    
    // Build query with optional prefix filtering
    let where_clause = if prefix.is_empty() {
        format!("tenant_id IN ('{}') AND event_timestamp >= now() - INTERVAL 7 DAY", tenant)
    } else {
        format!(
            "tenant_id IN ('{}') AND event_timestamp >= now() - INTERVAL 7 DAY AND {} LIKE '{}%'",
            tenant,
            field,
            prefix.replace("'", "''")
        )
    };
    
    let sql = format!(
        "SELECT {} AS value, count() AS count FROM dev.events WHERE {} AND {} != '' GROUP BY {} ORDER BY count DESC, value ASC LIMIT {} FORMAT JSON",
        field, where_clause, field, field, limit
    );
    
    let resp = client
        .get("http://localhost:8123/")
        .query(&[("query", &sql)])
        .send()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;

    if !resp.status().is_success() {
        return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
    }

    let text = resp.text().await.map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    let json: Value = serde_json::from_str(&text).map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let rows = json.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default();
    let mut values = Vec::new();
    
    for row in rows {
        if let (Some(value), Some(count)) = (
            row.get("value").and_then(|v| v.as_str()),
            row.get("count").and_then(|c| c.as_u64())
        ) {
            values.push(TopValue {
                value: value.to_string(),
                count,
            });
        }
    }
    
    Ok(Json(values))
}

// Helper functions

fn normalize_clickhouse_type(ch_type: &str) -> String {
    match ch_type {
        t if t.contains("String") || t.contains("LowCardinality(String)") => "string",
        t if t.contains("Int") || t.contains("UInt") => "int",
        t if t.contains("Float") || t.contains("Decimal") => "float",
        t if t.contains("Bool") => "bool",
        t if t.contains("DateTime") || t.contains("Date") => "datetime",
        t if t.contains("IPv4") || t.contains("IPv6") => "ip",
        t if t.contains("Array") => "array",
        t if t.contains("Map") => "map",
        _ => "string", // Default fallback
    }.to_string()
}

async fn get_field_stats(client: &reqwest::Client, field: &str, tenant: &str) -> (u64, Vec<TopValue>) {
    // Get approximate cardinality
    let cardinality_sql = format!(
        "SELECT uniq({}) AS cardinality FROM dev.events WHERE tenant_id IN ('{}') AND event_timestamp >= now() - INTERVAL 7 DAY FORMAT JSON",
        field, tenant
    );
    
    let cardinality = if let Ok(resp) = client.get("http://localhost:8123/").query(&[("query", &cardinality_sql)]).send().await {
        if let Ok(text) = resp.text().await {
            if let Ok(json) = serde_json::from_str::<Value>(&text) {
                json.get("data")
                    .and_then(|d| d.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|row| row.get("cardinality"))
                    .and_then(|c| c.as_u64())
                    .unwrap_or(0)
            } else { 0 }
        } else { 0 }
    } else { 0 };
    
    // Get top 5 values
    let top_values_sql = format!(
        "SELECT {} AS value, count() AS count FROM dev.events WHERE tenant_id IN ('{}') AND event_timestamp >= now() - INTERVAL 7 DAY AND {} != '' GROUP BY {} ORDER BY count DESC LIMIT 5 FORMAT JSON",
        field, tenant, field, field
    );
    
    let top_values = if let Ok(resp) = client.get("http://localhost:8123/").query(&[("query", &top_values_sql)]).send().await {
        if let Ok(text) = resp.text().await {
            if let Ok(json) = serde_json::from_str::<Value>(&text) {
                json.get("data")
                    .and_then(|d| d.as_array())
                    .map(|rows| {
                        rows.iter()
                            .filter_map(|row| {
                                if let (Some(value), Some(count)) = (
                                    row.get("value").and_then(|v| v.as_str()),
                                    row.get("count").and_then(|c| c.as_u64())
                                ) {
                                    Some(TopValue {
                                        value: value.to_string(),
                                        count,
                                    })
                                } else {
                                    None
                                }
                            })
                            .collect()
                    })
                    .unwrap_or_default()
            } else { Vec::new() }
        } else { Vec::new() }
    } else { Vec::new() };
    
    (cardinality, top_values)
}
