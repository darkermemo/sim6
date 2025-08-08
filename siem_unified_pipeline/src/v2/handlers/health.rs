use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;
use crate::v2::{state::AppState, dal::ClickHouseRepo};

#[derive(Serialize)]
pub struct Health { pub status: &'static str }

pub async fn health_check(State(st): State<Arc<AppState>>) -> Json<Health> {
    if ClickHouseRepo::ping(&st).await.is_ok() { Json(Health { status: "ok" }) }
    else { Json(Health { status: "degraded" }) }
}


