use axum::Json;
use serde_json::json;

/// Temporary stub for alert rules to avoid 404s in dev UI
pub async fn list_alert_rules() -> Json<serde_json::Value> {
    Json(json!({
        "rules": [],
    }))
}


