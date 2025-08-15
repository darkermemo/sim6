use axum::{Json, extract::{Path, State}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;
use crate::v2::state::AppState;

#[derive(Serialize, Deserialize, Clone)]
pub struct DetectionRecord {
    pub id: String,
    pub name: String,
    pub severity: String,
    pub owner: String,
    pub tags: Option<Vec<String>>,
    pub enabled: bool,
    pub spec: Value,
    pub created_at: String,
    pub updated_at: String,
    pub schedule: Option<Value>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CreateDetectionReq {
    pub name: String,
    pub severity: String,
    pub owner: String,
    pub tags: Option<Vec<String>>,
    pub enabled: bool,
    pub spec: Value,
    pub schedule: Option<Value>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ListRes { pub items: Vec<DetectionRecord> }

async fn ch_post_json(sql: String) -> Result<serde_json::Value, axum::http::StatusCode> {
    let client = reqwest::Client::new();
    let resp = client
        .post("http://localhost:8123/?default_format=JSON")
        .body(sql)
        .send().await.map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;
    if !resp.status().is_success() { return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR) }
    resp.json().await.map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn create_detection(
    State(_app): State<Arc<AppState>>,
    Json(body): Json<CreateDetectionReq>
) -> Result<Json<DetectionRecord>, axum::http::StatusCode> {
    let id = Uuid::new_v4().to_string();
    let now_fn = "now64(3)";
    let spec_str = body.spec.to_string().replace("'", "''");
    let sched_str = body.schedule.as_ref().map(|v| v.to_string().replace("'", "''")).unwrap_or("null".to_string());
    let tags = body.tags.unwrap_or_default();
    let tags_sql = format!("[{}]", tags.into_iter().map(|t| format!("'{}'", t.replace("'","''"))).collect::<Vec<_>>().join(","));
    let sql = format!(
        "INSERT INTO detections (id, name, severity, owner, tags, enabled, spec, created_at, updated_at, schedule) \
         VALUES ('{}','{}','{}','{}', {}, {}, {}, {}, {}, {})",
        id,
        body.name.replace("'","''"),
        body.severity.replace("'","''"),
        body.owner.replace("'","''"),
        tags_sql,
        if body.enabled { "1" } else { "0" },
        format!("parseJson('{}')", spec_str),
        now_fn,
        now_fn,
        if sched_str == "null" { "NULL".to_string() } else { format!("parseJson('{}')", sched_str) }
    );
    let _ = ch_post_json(sql).await?;
    get_detection(State(_app), Path(id)).await
}

pub async fn list_detections(State(_app): State<Arc<AppState>>) -> Result<Json<ListRes>, axum::http::StatusCode> {
    let sql = "SELECT id, name, severity, owner, tags, enabled, spec, toString(created_at) AS created_at, toString(updated_at) AS updated_at, schedule FROM detections ORDER BY updated_at DESC FORMAT JSON".to_string();
    let js = ch_post_json(sql).await?;
    let mut items: Vec<DetectionRecord> = Vec::new();
    if let Some(arr) = js.get("data").and_then(|v| v.as_array()) {
        for row in arr {
            items.push(DetectionRecord {
                id: row["id"].as_str().unwrap_or_default().to_string(),
                name: row["name"].as_str().unwrap_or_default().to_string(),
                severity: row["severity"].as_str().unwrap_or_default().to_string(),
                owner: row["owner"].as_str().unwrap_or_default().to_string(),
                tags: row["tags"].as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()),
                enabled: row["enabled"].as_bool().unwrap_or(false),
                spec: row["spec"].clone(),
                created_at: row["created_at"].as_str().unwrap_or_default().to_string(),
                updated_at: row["updated_at"].as_str().unwrap_or_default().to_string(),
                schedule: row.get("schedule").cloned(),
            });
        }
    }
    Ok(Json(ListRes { items }))
}

pub async fn get_detection(
    State(_app): State<Arc<AppState>>,
    Path(id): Path<String>
) -> Result<Json<DetectionRecord>, axum::http::StatusCode> {
    let sql = format!("SELECT id, name, severity, owner, tags, enabled, spec, toString(created_at) AS created_at, toString(updated_at) AS updated_at, schedule FROM detections WHERE id='{}' LIMIT 1 FORMAT JSON", id.replace("'","''"));
    let js = ch_post_json(sql).await?;
    let row = js.get("data").and_then(|d| d.as_array()).and_then(|a| a.get(0)).ok_or(axum::http::StatusCode::NOT_FOUND)?;
    let rec = DetectionRecord {
        id: row["id"].as_str().unwrap_or_default().to_string(),
        name: row["name"].as_str().unwrap_or_default().to_string(),
        severity: row["severity"].as_str().unwrap_or_default().to_string(),
        owner: row["owner"].as_str().unwrap_or_default().to_string(),
        tags: row["tags"].as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()),
        enabled: row["enabled"].as_bool().unwrap_or(false),
        spec: row["spec"].clone(),
        created_at: row["created_at"].as_str().unwrap_or_default().to_string(),
        updated_at: row["updated_at"].as_str().unwrap_or_default().to_string(),
        schedule: row.get("schedule").cloned(),
    };
    Ok(Json(rec))
}

pub async fn update_detection(
    State(_app): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<CreateDetectionReq>
) -> Result<Json<DetectionRecord>, axum::http::StatusCode> {
    let spec_str = body.spec.to_string().replace("'","''");
    let sched_str = body.schedule.as_ref().map(|v| v.to_string().replace("'", "''")).unwrap_or("null".to_string());
    let tags = body.tags.unwrap_or_default();
    let tags_sql = format!("[{}]", tags.into_iter().map(|t| format!("'{}'", t.replace("'","''"))).collect::<Vec<_>>().join(","));
    let sql = format!(
        "ALTER TABLE detections UPDATE name='{}', severity='{}', owner='{}', tags={}, enabled={}, spec=parseJson('{}'), updated_at=now64(3), schedule={} WHERE id='{}'",
        body.name.replace("'","''"), body.severity.replace("'","''"), body.owner.replace("'","''"), tags_sql,
        if body.enabled { "1" } else { "0" }, spec_str, if sched_str=="null" { "NULL".to_string() } else { format!("parseJson('{}')", sched_str) }, id.replace("'","''")
    );
    let _ = ch_post_json(sql).await?;
    get_detection(State(_app), Path(id)).await
}

pub async fn delete_detection(
    State(_app): State<Arc<AppState>>,
    Path(id): Path<String>
) -> Result<Json<serde_json::Value>, axum::http::StatusCode> {
    // Append-only policy: mark as disabled instead of delete
    let sql = format!("ALTER TABLE detections UPDATE enabled=0, updated_at=now64(3) WHERE id='{}'", id.replace("'","''"));
    let _ = ch_post_json(sql).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Serialize, Deserialize)]
pub struct ScheduleReq { pub cron: String, pub enabled: bool }

pub async fn schedule_detection(
    State(_app): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<ScheduleReq>
) -> Result<Json<DetectionRecord>, axum::http::StatusCode> {
    let sched = serde_json::json!({"cron": body.cron, "enabled": body.enabled}).to_string().replace("'","''");
    let sql = format!("ALTER TABLE detections UPDATE schedule=parseJson('{}'), enabled={}, updated_at=now64(3) WHERE id='{}'",
        sched, if body.enabled { "1" } else { "0" }, id.replace("'","''"));
    let _ = ch_post_json(sql).await?;
    get_detection(State(_app), Path(id)).await
}

pub async fn run_once(
    State(_app): State<Arc<AppState>>,
    Path(id): Path<String>
) -> Result<Json<serde_json::Value>, axum::http::StatusCode> {
    // Minimal stub: record a run row; the scheduler/runner can pick it up
    let run_id = Uuid::new_v4().to_string();
    let sql = format!("INSERT INTO detection_runs (id, detection_id, started_at, status, rows) VALUES ('{}','{}', now64(3), 'queued', 0)", run_id, id.replace("'","''"));
    let _ = ch_post_json(sql).await?;
    Ok(Json(serde_json::json!({"ok": true, "started_at": chrono::Utc::now().to_rfc3339(), "job_id": run_id })))
}


