use axum::{extract::{State, Query}, Json};
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

