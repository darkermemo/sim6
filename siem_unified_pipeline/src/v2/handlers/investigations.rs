use axum::{extract::{State, Path, Query}, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::v2::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ListViewsQuery { pub tenant_id: Option<String> }

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedView { pub id:String, pub tenant_id:String, pub name:String, pub dsl:String, pub created_by:String, pub created_at:u32, pub updated_at:u32 }

#[derive(Debug, Deserialize)]
pub struct CreateViewRequest { pub id:Option<String>, pub tenant_id:String, pub name:String, pub dsl:serde_json::Value, pub created_by:String }

pub async fn list_views(State(st): State<Arc<AppState>>, Query(q): Query<ListViewsQuery>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let where_clause = if let Some(t) = q.tenant_id { format!("WHERE tenant_id='{}'", t.replace("'","''")) } else { String::new() };
    let sql = format!("SELECT id,tenant_id,name,dsl,created_by,created_at,updated_at FROM dev.saved_views {} ORDER BY updated_at DESC LIMIT 100 FORMAT JSON", where_clause);
    let client = reqwest::Client::new();
    let r = client.get("http://localhost:8123/").query(&[("query", sql)]).send().await.map_err(|e| crate::error::PipelineError::database(format!("list views: {e}")))?;
    if !r.status().is_success() { return Err(crate::error::PipelineError::database(format!("list views status {}", r.status()))); }
    let txt = r.text().await.unwrap_or_else(|_| "{}".to_string());
    let v: serde_json::Value = serde_json::from_str(&txt).unwrap_or_else(|_| serde_json::json!({"data":[]}));
    Ok(Json(v))
}

pub async fn create_view(State(_st): State<Arc<AppState>>, Json(b): Json<CreateViewRequest>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let id = b.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let tenant = b.tenant_id.replace("'","''");
    let name = b.name.replace("'","''");
    let dsl = serde_json::to_string(&b.dsl).unwrap_or("{}".to_string()).replace("'","''");
    let by = b.created_by.replace("'","''");
    let now = chrono::Utc::now().timestamp() as u32;
    let sql = format!("INSERT INTO dev.saved_views (id,tenant_id,name,dsl,created_by,created_at,updated_at) VALUES ('{}','{}','{}','{}','{}',{},{})", id.replace("'","''"), tenant, name, dsl, by, now, now);
    let client = reqwest::Client::new();
    let r = client.post("http://localhost:8123/").query(&[("query", sql)]).header("Content-Length","0").send().await.map_err(|e| crate::error::PipelineError::database(format!("create view: {e}")))?;
    if !r.status().is_success() { return Err(crate::error::PipelineError::database(format!("create view status {}", r.status()))); }
    Ok(Json(serde_json::json!({"id": id, "status":"created"})))
}

pub async fn get_view(Path(id): Path<String>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let sql = format!("SELECT id,tenant_id,name,dsl,created_by,created_at,updated_at FROM dev.saved_views WHERE id='{}' LIMIT 1 FORMAT JSON", id.replace("'","''"));
    let client = reqwest::Client::new();
    let r = client.get("http://localhost:8123/").query(&[("query", sql)]).send().await.map_err(|e| crate::error::PipelineError::database(format!("get view: {e}")))?;
    if !r.status().is_success() { return Err(crate::error::PipelineError::database(format!("get view status {}", r.status()))); }
    let txt = r.text().await.unwrap_or_else(|_| "{}".to_string());
    let v: serde_json::Value = serde_json::from_str(&txt).unwrap_or_else(|_| serde_json::json!({"data":[]}));
    Ok(Json(v))
}

pub async fn delete_view(Path(id): Path<String>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let sql = format!("ALTER TABLE dev.saved_views DELETE WHERE id='{}'", id.replace("'","''"));
    let client = reqwest::Client::new();
    let r = client.post("http://localhost:8123/").query(&[("query", sql)]).header("Content-Length","0").send().await.map_err(|e| crate::error::PipelineError::database(format!("delete view: {e}")))?;
    if !r.status().is_success() { return Err(crate::error::PipelineError::database(format!("delete view status {}", r.status()))); }
    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Debug, Deserialize)]
pub struct CreateNoteRequest { pub view_id:String, pub author:String, pub body:String }

pub async fn list_notes(Path(view_id): Path<String>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let sql = format!("SELECT id,view_id,author,body,created_at FROM dev.investigation_notes WHERE view_id='{}' ORDER BY created_at DESC FORMAT JSON", view_id.replace("'","''"));
    let client = reqwest::Client::new();
    let r = client.get("http://localhost:8123/").query(&[("query", sql)]).send().await.map_err(|e| crate::error::PipelineError::database(format!("list notes: {e}")))?;
    if !r.status().is_success() { return Err(crate::error::PipelineError::database(format!("list notes status {}", r.status()))); }
    let txt = r.text().await.unwrap_or_else(|_| "{}".to_string());
    let v: serde_json::Value = serde_json::from_str(&txt).unwrap_or_else(|_| serde_json::json!({"data":[]}));
    Ok(Json(v))
}

pub async fn create_note(Json(b): Json<CreateNoteRequest>) -> Result<Json<serde_json::Value>, crate::error::PipelineError> {
    let id = uuid::Uuid::new_v4().to_string();
    let view = b.view_id.replace("'","''");
    let author = b.author.replace("'","''");
    let body = b.body.replace("'","''");
    let now = chrono::Utc::now().timestamp() as u32;
    let sql = format!("INSERT INTO dev.investigation_notes (id,view_id,author,body,created_at) VALUES ('{}','{}','{}','{}',{})", id.replace("'","''"), view, author, body, now);
    let client = reqwest::Client::new();
    let r = client.post("http://localhost:8123/").query(&[("query", sql)]).header("Content-Length","0").send().await.map_err(|e| crate::error::PipelineError::database(format!("create note: {e}")))?;
    if !r.status().is_success() { return Err(crate::error::PipelineError::database(format!("create note status {}", r.status()))); }
    Ok(Json(serde_json::json!({"id": id, "status":"created"})))
}


