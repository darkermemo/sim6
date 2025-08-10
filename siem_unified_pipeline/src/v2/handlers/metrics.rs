use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;
use chrono::Utc;
use crate::v2::state::AppState;
// use crate::error::Result;
use clickhouse::Row;
use std::time::Instant;

#[derive(Serialize)]
pub struct EpsStats {
    pub avg_eps: f64,
    pub current_eps: f64,
    pub peak_eps: f64,
    pub window_seconds: u64,
}

#[derive(Serialize)]
pub struct EpsResponse {
    pub global: EpsStats,
    pub per_tenant: serde_json::Value,
    pub timestamp: String,
}

pub async fn get_eps_stats(State(st): State<Arc<AppState>>) -> Json<EpsResponse> {
    // Compute EPS for last 60 seconds using ClickHouse
    let window = 60u64;
    let sql_global = format!(
        "SELECT avg(cnt) AS avg_eps, anyLast(cnt) AS current_eps, max(cnt) AS peak_eps \
         FROM (SELECT toStartOfSecond(toDateTime(event_timestamp)) AS ts, count() AS cnt \
               FROM {} WHERE event_timestamp >= (toUInt32(now()) - {}) \
               GROUP BY ts ORDER BY ts)",
        st.events_table, window
    );

    let row = st.ch.query(&sql_global).fetch_one::<(f64, f64, f64)>().await.ok();
    let (avg_eps, current_eps, peak_eps) = row.unwrap_or((0.0, 0.0, 0.0));

    // Per-tenant EPS map
    let sql_tenant = format!(
        "SELECT tenant_id, avg(cnt) AS avg_eps, anyLast(cnt) AS current_eps, max(cnt) AS peak_eps \
         FROM (SELECT tenant_id, toStartOfSecond(toDateTime(event_timestamp)) AS ts, count() AS cnt \
               FROM {} WHERE event_timestamp >= (toUInt32(now()) - {}) \
               GROUP BY tenant_id, ts ORDER BY ts) GROUP BY tenant_id",
        st.events_table, window
    );

    let per_tenant_rows = st
        .ch
        .query(&sql_tenant)
        .fetch_all::<(String, f64, f64, f64)>()
        .await
        .unwrap_or_default();
    let per_tenant = serde_json::json!({
        "window_seconds": window,
        "tenants": per_tenant_rows.into_iter().map(|(tid,a,c,p)| (tid, serde_json::json!({"avg_eps":a,"current_eps":c,"peak_eps":p}))).collect::<serde_json::Map<_,_>>()
    });

    Json(EpsResponse {
        global: EpsStats { avg_eps, current_eps, peak_eps, window_seconds: window },
        per_tenant,
        timestamp: Utc::now().to_rfc3339(),
    })
}

#[derive(Serialize, Row)]
#[allow(dead_code)]
struct CountRow { c: u64 }

#[derive(Serialize)]
pub struct QuickStats {
    pub total_events: u64,
    pub total_bytes_estimate: u64,
    pub source_count: u64,
}

pub async fn get_quick_stats(State(st): State<Arc<AppState>>) -> Json<QuickStats> {
    let total_events: u64 = st.ch.query(&format!("SELECT toUInt64(count()) FROM {}", st.events_table))
        .fetch_one::<u64>().await.unwrap_or(0);

    // Estimate bytes using avg length of raw_event + some overhead
    let avg_len: u64 = st.ch.query(&format!("SELECT toUInt64(avg(length(raw_event))) FROM {}", st.events_table))
        .fetch_one::<u64>().await.unwrap_or(0);
    let total_bytes_estimate = total_events.saturating_mul(avg_len + 64);

    let source_count: u64 = st.ch.query(&format!("SELECT toUInt64(countDistinct(source_type)) FROM {}", st.events_table))
        .fetch_one::<u64>().await.unwrap_or(0);

    Json(QuickStats { total_events, total_bytes_estimate, source_count })
}


#[derive(Serialize)]
pub struct ChStatusResponse {
    pub version: String,
    pub uptime_seconds: u64,
}

pub async fn get_ch_status(State(st): State<Arc<AppState>>) -> Json<ChStatusResponse> {
    // Fetch ClickHouse version and uptime
    let row = st
        .ch
        .query("SELECT toString(version()) AS v, toUInt64(uptime()) AS u")
        .fetch_one::<(String, u64)>()
        .await
        .unwrap_or_else(|_| ("unknown".to_string(), 0));

    Json(ChStatusResponse { version: row.0, uptime_seconds: row.1 })
}

#[derive(Serialize)]
pub struct ParsingStatsResponse {
    pub total_events: u64,
    pub parsed_events: u64,
    pub parsed_ratio: f64,
}

pub async fn get_parsing_stats(State(st): State<Arc<AppState>>) -> Json<ParsingStatsResponse> {
    // Heuristic: consider an event as "parsed" if any of key fields are present
    // (event_action, user_name, severity). Adjust as parsers improve.
    let sql = format!(
        "SELECT toUInt64(count()) AS total, toUInt64(countIf(event_action IS NOT NULL OR user_name IS NOT NULL OR severity IS NOT NULL)) AS parsed FROM {}",
        st.events_table
    );
    let (total, parsed) = st
        .ch
        .query(&sql)
        .fetch_one::<(u64, u64)>()
        .await
        .unwrap_or((0, 0));
    let ratio = if total == 0 { 0.0 } else { (parsed as f64) / (total as f64) };
    Json(ParsingStatsResponse { total_events: total, parsed_events: parsed, parsed_ratio: ratio })
}

#[derive(Serialize)]
pub struct SystemConfigResponse {
    pub kafka_configured: bool,
    pub redis_configured: bool,
    pub vector_configured: bool,
}

pub async fn get_system_config() -> Json<SystemConfigResponse> {
    let kafka_configured = std::env::var("KAFKA_BROKERS").is_ok();
    let redis_configured = std::env::var("REDIS_URL").is_ok();
    let vector_configured = std::env::var("VECTOR_URL").is_ok() || std::env::var("VECTOR_CONFIG").is_ok();
    Json(SystemConfigResponse { kafka_configured, redis_configured, vector_configured })
}

#[derive(Serialize)]
pub struct KafkaStatusResponse {
    pub configured: bool,
    pub ok: bool,
    pub latency_ms: u128,
    pub brokers: Option<String>,
    pub topic: Option<String>,
    pub partitions: Option<i32>,
    pub lag: Option<i64>,
    pub error: Option<String>,
}

pub async fn get_kafka_status() -> Json<KafkaStatusResponse> {
    use rdkafka::{ClientConfig, consumer::{BaseConsumer, Consumer}};
    let brokers = match std::env::var("KAFKA_BROKERS") {
        Ok(b) if !b.trim().is_empty() => b,
        _ => return Json(KafkaStatusResponse { configured: false, ok: false, latency_ms: 0, brokers: None, topic: None, partitions: None, lag: None, error: None }),
    };
    let topic = std::env::var("KAFKA_TOPIC").ok();
    let t0 = Instant::now();
    let consumer: BaseConsumer = match ClientConfig::new()
        .set("bootstrap.servers", &brokers)
        .set("group.id", format!("probe-{}", uuid::Uuid::new_v4()))
        .set("enable.partition.eof", "false")
        .set("session.timeout.ms", "6000")
        .create::<BaseConsumer>() {
            Ok(c) => c,
            Err(e) => return Json(KafkaStatusResponse { configured: true, ok: false, latency_ms: t0.elapsed().as_millis(), brokers: Some(brokers), topic, partitions: None, lag: None, error: Some(e.to_string()) }),
        };
    let md = consumer.fetch_metadata(topic.as_deref(), std::time::Duration::from_secs(2));
    let ok = md.is_ok();
    let mut partitions: Option<i32> = None;
    if let (Ok(md), Some(tn)) = (md, topic.as_deref()) {
        if let Some(tmeta) = md.topics().iter().find(|t| t.name() == tn) { partitions = Some(tmeta.partitions().len() as i32); }
    }
    let mut lag: Option<i64> = None;
    if ok {
        if let (Some(tn), Ok(md)) = (topic.as_deref(), consumer.fetch_metadata(topic.as_deref(), std::time::Duration::from_secs(2))) {
            let parts: Vec<i32> = md.topics().iter().find(|t| t.name() == tn)
                .map(|t| t.partitions().iter().map(|p| p.id()).collect())
                .unwrap_or_else(Vec::new);
            if let Ok(group) = std::env::var("KAFKA_GROUP_ID") {
                // Create a consumer for this group to read committed offsets
                if let Ok(group_consumer) = ClientConfig::new()
                    .set("bootstrap.servers", &brokers)
                    .set("group.id", &group)
                    .create::<BaseConsumer>() {
                    use rdkafka::TopicPartitionList;
                    let mut tpl = TopicPartitionList::new();
                    for p in &parts { tpl.add_partition(tn, *p); }
                    if let Ok(committed) = group_consumer.committed_offsets(tpl, std::time::Duration::from_secs(2)) {
                        let mut total_lag: i64 = 0;
                        for p in parts { 
                            if let Ok((_low, high)) = group_consumer.fetch_watermarks(tn, p, std::time::Duration::from_secs(2)) {
                                if let Some(co) = committed.find_partition(tn, p).and_then(|x| x.offset().to_raw()) {
                                    let diff = high - co;
                                    if diff > 0 { total_lag += diff; }
                                }
                            }
                        }
                        lag = Some(total_lag);
                    }
                }
            }
        }
    }
    Json(KafkaStatusResponse { configured: true, ok, latency_ms: t0.elapsed().as_millis(), brokers: Some(brokers), topic, partitions, lag, error: None })
}

#[derive(Serialize)]
pub struct RedisStatusResponse {
    pub configured: bool,
    pub ok: bool,
    pub latency_ms: u128,
    pub role: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

pub async fn get_redis_status() -> Json<RedisStatusResponse> {
    let url = match std::env::var("REDIS_URL") {
        Ok(u) if !u.trim().is_empty() => u,
        _ => return Json(RedisStatusResponse { configured: false, ok: false, latency_ms: 0, role: None, version: None, error: None }),
    };
    let t0 = Instant::now();
    let client = match redis::Client::open(url) { Ok(c) => c, Err(e) => return Json(RedisStatusResponse { configured: true, ok: false, latency_ms: t0.elapsed().as_millis(), role: None, version: None, error: Some(e.to_string()) }) };
    let mut conn = match client.get_async_connection().await { Ok(c) => c, Err(e) => return Json(RedisStatusResponse { configured: true, ok: false, latency_ms: t0.elapsed().as_millis(), role: None, version: None, error: Some(e.to_string()) }) };
    // PING
    if let Err(e) = redis::cmd("PING").query_async::<_, String>(&mut conn).await { return Json(RedisStatusResponse { configured: true, ok: false, latency_ms: t0.elapsed().as_millis(), role: None, version: None, error: Some(e.to_string()) }); }
    // INFO server
    let info: String = (redis::cmd("INFO").arg("server").query_async(&mut conn).await).unwrap_or_default();
    let mut role: Option<String> = None; let mut version: Option<String> = None;
    for line in info.lines() { 
        if let Some(v) = line.strip_prefix("redis_version:") { version = Some(v.trim().to_string()); }
        if let Some(r) = line.strip_prefix("role:") { role = Some(r.trim().to_string()); }
    }
    Json(RedisStatusResponse { configured: true, ok: true, latency_ms: t0.elapsed().as_millis(), role, version, error: None })
}

#[derive(Serialize)]
pub struct VectorStatusResponse {
    pub configured: bool,
    pub ok: bool,
    pub latency_ms: u128,
    pub url: Option<String>,
    pub status: Option<u16>,
    pub error: Option<String>,
}

pub async fn get_vector_status() -> Json<VectorStatusResponse> {
    let url = match std::env::var("VECTOR_URL") {
        Ok(u) if !u.trim().is_empty() => u,
        _ => return Json(VectorStatusResponse { configured: false, ok: false, latency_ms: 0, url: None, status: None, error: None }),
    };
    let client = reqwest::Client::new();
    let t0 = Instant::now();
    // Try /health, then /metrics (Prometheus exporter), then base URL
    let base = url.trim_end_matches('/');
    let mut resp = client.get(format!("{}/health", base)).send().await;
    if resp.as_ref().ok().map(|r| r.status().is_success()) != Some(true) {
        resp = client.get(format!("{}/metrics", base)).send().await;
    }
    if resp.as_ref().ok().map(|r| r.status().is_success()) != Some(true) {
        resp = client.get(&url).send().await;
    }
    match resp {
        Ok(r) => Json(VectorStatusResponse { configured: true, ok: r.status().is_success(), latency_ms: t0.elapsed().as_millis(), url: Some(url), status: Some(r.status().as_u16()), error: None }),
        Err(e) => Json(VectorStatusResponse { configured: true, ok: false, latency_ms: t0.elapsed().as_millis(), url: Some(url), status: None, error: Some(e.to_string()) }),
    }
}

#[derive(Serialize)]
pub struct ChStorageResponse {
    pub database: String,
    pub table: String,
    pub rows: u64,
    pub bytes_on_disk: u64,
    pub replica: Option<serde_json::Value>,
}

pub async fn get_ch_storage(State(st): State<Arc<AppState>>) -> Json<ChStorageResponse> {
    // Parse database and table from fully-qualified events_table (e.g., dev.events)
    let (db, tbl) = match st.events_table.split_once('.') {
        Some((d, t)) => (d.to_string(), t.to_string()),
        None => ("default".to_string(), st.events_table.clone()),
    };

    // Sum rows/bytes from system.parts
    let sql = format!(
        "SELECT toUInt64(sum(rows)) AS r, toUInt64(sum(bytes_on_disk)) AS b FROM system.parts WHERE database = '{}' AND table = '{}'",
        db, tbl
    );
    let (rows, bytes) = st.ch.query(&sql).fetch_one::<(u64, u64)>().await.unwrap_or((0, 0));

    // Replica info if any
    let sql_rep = format!(
        "SELECT is_leader, is_readonly, absolute_delay, queue_size FROM system.replicas WHERE database = '{}' AND table = '{}' LIMIT 1",
        db, tbl
    );
    let replica = st
        .ch
        .query(&sql_rep)
        .fetch_one::<(u8, u8, i64, u64)>()
        .await
        .ok()
        .map(|(is_leader, is_readonly, delay, q)| serde_json::json!({
            "is_leader": is_leader == 1,
            "is_readonly": is_readonly == 1,
            "absolute_delay": delay,
            "queue_size": q
        }));

    Json(ChStorageResponse { database: db, table: tbl, rows, bytes_on_disk: bytes, replica })
}

// Kafka per-partition lag details
#[derive(Serialize)]
pub struct KafkaPartitionLag {
    pub partition: i32,
    pub low: Option<i64>,
    pub high: Option<i64>,
    pub committed: Option<i64>,
    pub lag: Option<i64>,
}

#[derive(Serialize)]
pub struct KafkaPartitionsResponse {
    pub configured: bool,
    pub ok: bool,
    pub topic: Option<String>,
    pub group: Option<String>,
    pub partitions: Vec<KafkaPartitionLag>,
    pub error: Option<String>,
}

pub async fn get_kafka_partitions() -> Json<KafkaPartitionsResponse> {
    use rdkafka::{ClientConfig, consumer::{BaseConsumer, Consumer}};
    let brokers = match std::env::var("KAFKA_BROKERS") {
        Ok(b) if !b.trim().is_empty() => b,
        _ => return Json(KafkaPartitionsResponse { configured: false, ok: false, topic: None, group: None, partitions: vec![], error: None }),
    };
    let topic = std::env::var("KAFKA_TOPIC").ok();
    let group = std::env::var("KAFKA_GROUP_ID").ok();
    let tname = match topic.clone() { Some(t) => t, None => return Json(KafkaPartitionsResponse { configured: true, ok: false, topic: None, group, partitions: vec![], error: Some("KAFKA_TOPIC not set".into()) }) };
    let consumer: BaseConsumer = match ClientConfig::new()
        .set("bootstrap.servers", &brokers)
        .set("group.id", format!("probe-{}", uuid::Uuid::new_v4()))
        .create::<BaseConsumer>() {
            Ok(c) => c,
            Err(e) => return Json(KafkaPartitionsResponse { configured: true, ok: false, topic: Some(tname), group, partitions: vec![], error: Some(e.to_string()) }),
        };

    // Fetch partitions
    let md = match consumer.fetch_metadata(Some(&tname), std::time::Duration::from_secs(2)) {
        Ok(m) => m,
        Err(e) => return Json(KafkaPartitionsResponse { configured: true, ok: false, topic: Some(tname), group, partitions: vec![], error: Some(e.to_string()) }),
    };
    let parts: Vec<i32> = md.topics().iter().find(|t| t.name() == tname)
        .map(|t| t.partitions().iter().map(|p| p.id()).collect())
        .unwrap_or_else(Vec::new);

    // If group is set, get committed offsets for that group
    let committed_map = if let Some(ref g) = group {
        if let Ok(gc) = ClientConfig::new().set("bootstrap.servers", &brokers).set("group.id", g).create::<BaseConsumer>() {
            use rdkafka::TopicPartitionList;
            let mut tpl = TopicPartitionList::new();
            for p in &parts { tpl.add_partition(&tname, *p); }
                    if let Ok(committed) = gc.committed_offsets(tpl, std::time::Duration::from_secs(2)) {
                let mut m = std::collections::HashMap::new();
                for p in &parts {
                    let co = committed.find_partition(&tname, *p).and_then(|x| x.offset().to_raw());
                            if let Some(v) = co { m.insert(*p, v); }
                }
                Some(m)
            } else { None }
        } else { None }
    } else { None };

    let mut out = Vec::with_capacity(parts.len());
    for p in parts {
        let (low, high) = consumer.fetch_watermarks(&tname, p, std::time::Duration::from_secs(2)).unwrap_or((0, 0));
        let committed = committed_map.as_ref().and_then(|m| m.get(&p).copied());
        let lag = committed.map(|co| high - co);
        out.push(KafkaPartitionLag { partition: p, low: Some(low), high: Some(high), committed, lag });
    }

    Json(KafkaPartitionsResponse { configured: true, ok: true, topic: Some(tname), group, partitions: out, error: None })
}

// Redis memory stats
#[derive(Serialize)]
pub struct RedisMemoryResponse {
    pub configured: bool,
    pub ok: bool,
    pub used_memory: Option<u64>,
    pub used_memory_rss: Option<u64>,
    pub used_memory_peak: Option<u64>,
    pub mem_fragmentation_ratio: Option<f64>,
    pub error: Option<String>,
}

pub async fn get_redis_memory() -> Json<RedisMemoryResponse> {
    let url = match std::env::var("REDIS_URL") {
        Ok(u) if !u.trim().is_empty() => u,
        _ => return Json(RedisMemoryResponse { configured: false, ok: false, used_memory: None, used_memory_rss: None, used_memory_peak: None, mem_fragmentation_ratio: None, error: None }),
    };
    let client = match redis::Client::open(url) { Ok(c) => c, Err(e) => return Json(RedisMemoryResponse { configured: true, ok: false, used_memory: None, used_memory_rss: None, used_memory_peak: None, mem_fragmentation_ratio: None, error: Some(e.to_string()) }) };
    let mut conn = match client.get_async_connection().await { Ok(c) => c, Err(e) => return Json(RedisMemoryResponse { configured: true, ok: false, used_memory: None, used_memory_rss: None, used_memory_peak: None, mem_fragmentation_ratio: None, error: Some(e.to_string()) }) };
    let info: String = match redis::cmd("INFO").arg("memory").query_async(&mut conn).await { Ok(s) => s, Err(e) => return Json(RedisMemoryResponse { configured: true, ok: false, used_memory: None, used_memory_rss: None, used_memory_peak: None, mem_fragmentation_ratio: None, error: Some(e.to_string()) }) };
    let mut used_memory = None; let mut used_memory_rss = None; let mut used_memory_peak = None; let mut mem_fragmentation_ratio = None;
    for line in info.lines() {
        if let Some(v) = line.strip_prefix("used_memory:") { used_memory = v.trim().parse::<u64>().ok(); }
        if let Some(v) = line.strip_prefix("used_memory_rss:") { used_memory_rss = v.trim().parse::<u64>().ok(); }
        if let Some(v) = line.strip_prefix("used_memory_peak:") { used_memory_peak = v.trim().parse::<u64>().ok(); }
        if let Some(v) = line.strip_prefix("mem_fragmentation_ratio:") { mem_fragmentation_ratio = v.trim().parse::<f64>().ok(); }
    }
    Json(RedisMemoryResponse { configured: true, ok: true, used_memory, used_memory_rss, used_memory_peak, mem_fragmentation_ratio, error: None })
}


