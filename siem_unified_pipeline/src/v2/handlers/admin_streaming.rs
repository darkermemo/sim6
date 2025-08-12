use axum::{extract::{Query, State}, Json, http::StatusCode};
// use redis::AsyncCommands;
use serde::Serialize;
use std::sync::Arc;

use crate::v2::state::AppState;
use crate::error::Result;

#[derive(Debug, serde::Deserialize)]
pub struct StatusQ { pub tenant_id: String }

#[derive(Debug, Serialize, Default)]
pub struct ConsumerInfo { pub name:String, pub pending:u64, pub idle_ms:u64 }

#[derive(Debug, Serialize, Default)]
pub struct StreamingStatus { pub stream_len:i64, pub lag_ms:i64, pub consumers: Vec<ConsumerInfo> }

/// GET /api/v2/admin/streaming/status?tenant_id=
pub async fn streaming_status(State(st): State<Arc<AppState>>, Query(q): Query<StatusQ>) -> Result<Json<StreamingStatus>> {
    let mut out = StreamingStatus::default();
    let cm = st.redis.clone().ok_or_else(|| crate::error::PipelineError::service_unavailable("redis not configured"))?;
    let mut conn = cm.clone();
    let key = format!("siem:events:{}", q.tenant_id);
    // Length
    let len: i64 = redis::cmd("XLEN").arg(&key).query_async(&mut conn).await.unwrap_or(0);
    out.stream_len = len;
    // Lag from XINFO STREAM last-generated-id
    let info: redis::Value = redis::cmd("XINFO").arg("STREAM").arg(&key).query_async(&mut conn).await.unwrap_or(redis::Value::Nil);
    if let redis::Value::Bulk(fields) = info {
        for pair in fields.chunks(2) {
            if pair.len()==2 {
                if let (redis::Value::Data(k), v) = (&pair[0], &pair[1]) {
                    if k == b"last-generated-id" { if let redis::Value::Data(bid) = v { if let Some(ms) = String::from_utf8_lossy(bid).split('-').next().and_then(|s| s.parse::<i64>().ok()) { let now_ms = chrono::Utc::now().timestamp_millis(); out.lag_ms = (now_ms - ms).max(0); } } }
                }
            }
        }
    }
    // Consumers for default group
    let group = std::env::var("STREAM_GROUP").unwrap_or_else(|_| "gr1".to_string());
    let cons: redis::Value = redis::cmd("XINFO").arg("CONSUMERS").arg(&key).arg(&group).query_async(&mut conn).await.unwrap_or(redis::Value::Nil);
    if let redis::Value::Bulk(list) = cons {
        for c in list { if let redis::Value::Bulk(fields) = c { let mut name = String::new(); let mut pending=0_u64; let mut idle=0_u64; for pair in fields.chunks(2) { if pair.len()==2 { if let (redis::Value::Data(k), v) = (&pair[0], &pair[1]) { match (k.as_slice(), v) { (b"name", redis::Value::Data(b)) => { name=String::from_utf8_lossy(b).to_string(); }, (b"pending", redis::Value::Int(n)) => { pending = *n as u64; }, (b"idle", redis::Value::Int(n)) => { idle = *n as u64; }, _ => {} } } } } out.consumers.push(ConsumerInfo{ name, pending, idle_ms: idle }); } }
    }
    Ok(Json(out))
}

/// POST /api/v2/admin/streaming/reclaim?tenant_id=
pub async fn streaming_reclaim(State(st): State<Arc<AppState>>, Query(q): Query<StatusQ>) -> Result<Json<serde_json::Value>> {
    let cm = st.redis.clone().ok_or_else(|| crate::error::PipelineError::service_unavailable("redis not configured"))?;
    let mut conn = cm.clone();
    let key = format!("siem:events:{}", q.tenant_id);
    let group = std::env::var("STREAM_GROUP").unwrap_or_else(|_| "gr1".to_string());
    let _: redis::Value = redis::cmd("XAUTOCLAIM").arg(&key).arg(&group).arg("runner-1").arg(60_000).arg("0-0").arg("COUNT").arg(100).query_async(&mut conn).await.unwrap_or(redis::Value::Nil);
    Ok(Json(serde_json::json!({"ok": true})))
}

/// GET /api/v2/admin/streaming/kafka/status
pub async fn kafka_status(State(st): State<Arc<AppState>>) -> Result<Json<serde_json::Value>> {
    // Check if Kafka consumer is running
    if let Some(ref consumer) = st.kafka_consumer {
        let status = consumer.read().await.get_status().await;
        Ok(Json(status))
    } else {
        Ok(Json(serde_json::json!({
            "running": false,
            "reason": "KAFKA_BROKERS not configured"
        })))
    }
}

/// POST /api/v2/admin/streaming/kafka/reclaim
pub async fn kafka_reclaim(State(_st): State<Arc<AppState>>) -> Result<StatusCode> {
    // In production, this would trigger a rebalance or restart
    // For now, just return success
    Ok(StatusCode::NO_CONTENT)
}


