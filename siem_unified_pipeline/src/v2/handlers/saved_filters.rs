use axum::{extract::{Path, State}, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;
use crate::v2::state::AppState;

#[derive(Serialize, Deserialize)]
pub struct SavedFilter { pub id:String, pub name:String, pub tenant_id:String, pub root:Value, pub created_at:String, pub updated_at:String }

#[derive(Serialize, Deserialize)]
pub struct CreateSavedFilter { pub name:String, pub tenant_id:String, pub root:Value }

async fn ch_post_json(sql: String) -> Result<serde_json::Value, axum::http::StatusCode> {
    let client = reqwest::Client::new();
    let resp = client.post("http://localhost:8123/?default_format=JSON").body(sql).send().await.map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;
    if !resp.status().is_success() { return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR) }
    resp.json().await.map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn list_saved_filters(State(_): State<Arc<AppState>>) -> Result<Json<Vec<SavedFilter>>, axum::http::StatusCode> {
    let js = ch_post_json("SELECT id,name,tenant_id,root,toString(created_at) AS created_at,toString(updated_at) AS updated_at FROM saved_filters ORDER BY updated_at DESC FORMAT JSON".into()).await?;
    let mut out = vec![];
    if let Some(arr) = js.get("data").and_then(|v| v.as_array()) {
        for r in arr { out.push(SavedFilter{ id:r["id"].as_str().unwrap_or_default().into(), name:r["name"].as_str().unwrap_or_default().into(), tenant_id:r["tenant_id"].as_str().unwrap_or_default().into(), root:r["root"].clone(), created_at:r["created_at"].as_str().unwrap_or_default().into(), updated_at:r["updated_at"].as_str().unwrap_or_default().into() }) }
    }
    Ok(Json(out))
}

pub async fn create_saved_filter(State(_): State<Arc<AppState>>, Json(b): Json<CreateSavedFilter>) -> Result<Json<SavedFilter>, axum::http::StatusCode> {
    let id = Uuid::new_v4().to_string();
    let root = b.root.to_string().replace("'","''");
    let sql = format!("INSERT INTO saved_filters (id,name,tenant_id,root) VALUES ('{}','{}','{}',parseJson('{}'))", id, b.name.replace("'","''"), b.tenant_id.replace("'","''"), root);
    let _ = ch_post_json(sql).await?;
    get_saved_filter(State(Arc::new(AppState::default())), Path(id)).await
}

pub async fn get_saved_filter(State(_): State<Arc<AppState>>, Path(id): Path<String>) -> Result<Json<SavedFilter>, axum::http::StatusCode> {
    let sql = format!("SELECT id,name,tenant_id,root,toString(created_at) AS created_at,toString(updated_at) AS updated_at FROM saved_filters WHERE id='{}' LIMIT 1 FORMAT JSON", id.replace("'","''"));
    let js = ch_post_json(sql).await?;
    let row = js["data"][0].clone();
    Ok(Json(SavedFilter{ id:row["id"].as_str().unwrap_or_default().into(), name:row["name"].as_str().unwrap_or_default().into(), tenant_id:row["tenant_id"].as_str().unwrap_or_default().into(), root:row["root"].clone(), created_at:row["created_at"].as_str().unwrap_or_default().into(), updated_at:row["updated_at"].as_str().unwrap_or_default().into() }))
}

pub async fn update_saved_filter(State(_): State<Arc<AppState>>, Path(id): Path<String>, Json(b): Json<CreateSavedFilter>) -> Result<Json<SavedFilter>, axum::http::StatusCode> {
    let root = b.root.to_string().replace("'","''");
    let sql = format!("ALTER TABLE saved_filters UPDATE name='{}', tenant_id='{}', root=parseJson('{}'), updated_at=now64(3) WHERE id='{}'", b.name.replace("'","''"), b.tenant_id.replace("'","''"), root, id.replace("'","''"));
    let _ = ch_post_json(sql).await?;
    get_saved_filter(State(Arc::new(AppState::default())), Path(id)).await
}

pub async fn delete_saved_filter(State(_): State<Arc<AppState>>, Path(id): Path<String>) -> Result<Json<serde_json::Value>, axum::http::StatusCode> {
    // Soft-delete: leave row; optionally set name suffix
    let sql = format!("ALTER TABLE saved_filters UPDATE name=concat(name,' (deleted)'), updated_at=now64(3) WHERE id='{}'", id.replace("'","''"));
    let _ = ch_post_json(sql).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}


