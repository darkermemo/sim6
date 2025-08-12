use axum::{extract::{State, Query, Path}, Json};
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult};

#[derive(Serialize, Deserialize, Clone)]
pub struct ParserRow { pub vendor:String, pub r#type:String, pub version: Option<String>, pub coverage: Option<f32>, pub enabled: bool }

#[derive(Deserialize)]
pub struct ListQ { pub tenant_id: Option<String> }

pub async fn list_parsers(_st: State<Arc<AppState>>, _q: Query<ListQ>) -> PipelineResult<Json<serde_json::Value>> {
    // Placeholder: return a tiny catalog; backend wiring can be added later
    let parsers = vec![
        ParserRow{ vendor:"okta".into(), r#type:"system_log".into(), version:Some("1".into()), coverage:Some(0.8), enabled:true },
        ParserRow{ vendor:"zeek".into(), r#type:"http".into(), version:Some("1".into()), coverage:Some(0.7), enabled:true },
    ];
    Ok(Json(serde_json::json!({"parsers": parsers})))
}

#[derive(Deserialize)]
pub struct ToggleBody { pub tenant_id: String, pub vendor:String, pub r#type:String, pub enabled: bool }

pub async fn toggle_parser(_st: State<Arc<AppState>>, Json(_b): Json<ToggleBody>) -> PipelineResult<Json<serde_json::Value>> {
    // Stub: accept and reply OK
    Ok(Json(serde_json::json!({"status":"ok"})))
}

#[derive(Deserialize)]
pub struct CreateParserRequest {
    pub tenant_id: String,
    pub vendor: String,
    pub r#type: String,
    pub version: Option<String>,
    pub coverage: Option<f32>,
    pub enabled: bool
}

pub async fn create_parser(
    State(_st): State<Arc<AppState>>,
    Json(body): Json<CreateParserRequest>
) -> PipelineResult<Json<serde_json::Value>> {
    // Stub: accept and reply OK
    Ok(Json(serde_json::json!({
        "id": format!("{}_{}", body.vendor, body.r#type),
        "status": "created"
    })))
}

#[derive(Deserialize)]
pub struct ValidateParserRequest {
    pub tenant_id: String,
    pub vendor: String,
    pub r#type: String
}

pub async fn validate_parser(
    Path(parser_id): Path<String>,
    Query(_q): Query<std::collections::HashMap<String, String>>
) -> PipelineResult<Json<serde_json::Value>> {
    // Stub: return validation result
    Ok(Json(serde_json::json!({
        "valid": true,
        "coverage": 0.85,
        "errors": []
    })))
}

#[derive(Deserialize)]
pub struct TestSampleRequest {
    pub tenant_id: String,
    pub sample_data: serde_json::Value
}

pub async fn test_sample(
    Path(_parser_id): Path<String>,
    Json(body): Json<TestSampleRequest>
) -> PipelineResult<Json<serde_json::Value>> {
    // Stub: return test result
    Ok(Json(serde_json::json!({
        "success": true,
        "parsed_fields": 15,
        "sample_output": body.sample_data
    })))
}

pub async fn delete_parser(
    Path(parser_id): Path<String>
) -> PipelineResult<Json<serde_json::Value>> {
    // Stub: return deletion result
    Ok(Json(serde_json::json!({
        "status": "deleted",
        "parser_id": parser_id
    })))
}

