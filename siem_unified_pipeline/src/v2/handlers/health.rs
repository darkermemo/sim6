use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;
use crate::v2::{state::AppState, dal::ClickHouseRepo, capabilities};

#[derive(Serialize)]
pub struct Health {
    pub status: &'static str,
    pub cidr_fn: &'static str,
}

pub async fn health_check(State(st): State<Arc<AppState>>) -> Json<Health> {
    // Report the actual CIDR function the compiler will use
    let cidr_fn = if capabilities::ipcidr_available() { "ipCIDRMatch" } else { "IPv4CIDRMatch" };
    if ClickHouseRepo::ping(&st).await.is_ok() {
        Json(Health { status: "ok", cidr_fn })
    } else {
        Json(Health { status: "degraded", cidr_fn })
    }
}


