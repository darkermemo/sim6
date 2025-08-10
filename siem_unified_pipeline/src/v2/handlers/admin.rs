use axum::{extract::State, Json};
use serde_json::Value;
use std::sync::Arc;
use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError};

pub async fn get_config(State(st): State<Arc<AppState>>) -> PipelineResult<Json<Value>> {
    let rows: Vec<(String, String)> = st.ch.query("SELECT k,v FROM dev.admin_config").fetch_all().await
        .map_err(|e| PipelineError::database(format!("admin cfg: {e}")))?;
    let mut obj = serde_json::Map::new();
    for (k, v) in rows {
        obj.insert(k, serde_json::from_str::<Value>(&v).unwrap_or(Value::String(v)));
    }
    Ok(Json(Value::Object(obj)))
}

pub async fn put_config(State(st): State<Arc<AppState>>, Json(v): Json<Value>) -> PipelineResult<Json<Value>> {
    // Replace all keys for simplicity
    let _ = st.ch.query("TRUNCATE TABLE dev.admin_config").execute().await;
    if let Some(map) = v.as_object() {
        for (k, val) in map.iter() {
            let js = val.to_string().replace("'","''");
            let sql = format!("INSERT INTO dev.admin_config (k,v) VALUES ('{}','{}')", k.replace("'","''"), js);
            let _ = st.ch.query(&sql).execute().await;
        }
    }
    Ok(Json(v))
}


