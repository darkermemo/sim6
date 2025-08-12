use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;
use std::time::Instant;
use crate::v2::{state::AppState, dal::ClickHouseRepo, capabilities};
use crate::v2::util::circuit_breaker::CIRCUIT_BREAKER;

#[derive(Serialize)]
pub struct Health {
    pub status: &'static str,
    pub cidr_fn: &'static str,
    pub ingest_path: &'static str,
    pub redis: &'static str,
    pub clickhouse: UpstreamHealth,
    pub redis_detail: UpstreamHealth,
}

#[derive(Serialize)]
pub struct UpstreamHealth {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<i64>,
}

pub async fn health_check(State(st): State<Arc<AppState>>) -> Json<Health> {
    // Report the actual CIDR function the compiler will use
    let cidr_fn = if capabilities::ipcidr_available() { "ipCIDRMatch" } else { "IPv4CIDRMatch" };
    let ingest_path = "api"; // default now that CLI posts via /ingest/bulk
    
    // Check ClickHouse
    let ch_start = Instant::now();
    let ch_ok = ClickHouseRepo::ping(&st).await.is_ok();
    let ch_latency = if ch_ok { Some(ch_start.elapsed().as_millis() as i64) } else { None };
    let ch_circuit_healthy = CIRCUIT_BREAKER.is_healthy();
    
    // Check Redis
    let (redis_ok, redis_latency) = if let Some(redis) = &st.redis {
        let redis_start = Instant::now();
        let mut conn = redis.clone();
        match redis::cmd("PING").query_async::<redis::aio::ConnectionManager, String>(&mut conn).await {
            Ok(_) => (true, Some(redis_start.elapsed().as_millis() as i64)),
            Err(_) => (false, None),
        }
    } else {
        (false, None)
    };
    
    // Update Redis metrics
    crate::v2::metrics::set_redis_up(redis_ok);
    if let Some(rtt) = redis_latency {
        crate::v2::metrics::set_redis_rtt_ms(rtt);
    }
    
    // Determine overall status
    let status = if ch_ok && ch_circuit_healthy && (st.redis.is_none() || redis_ok) {
        "ok"
    } else {
        "degraded"
    };
    
    // Legacy redis field for compatibility
    let redis_status = if redis_ok { "ok" } else { "down" };
    
    Json(Health {
        status,
        cidr_fn,
        ingest_path,
        redis: redis_status,
        clickhouse: UpstreamHealth {
            ok: ch_ok && ch_circuit_healthy,
            latency_ms: ch_latency,
        },
        redis_detail: UpstreamHealth {
            ok: redis_ok,
            latency_ms: redis_latency,
        },
    })
}


