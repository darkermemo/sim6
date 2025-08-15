/**
 * World-class SIEM detection handlers
 * Provides compile, run, and test endpoints for enterprise detection rules
 */

use axum::{Json, extract::{State, Query}};
use std::sync::Arc;
use std::collections::HashMap;
use serde_json::{json, Value};
use crate::v2::state::AppState;
use reqwest;

#[derive(serde::Deserialize)]
pub struct DetectionSpec {
    #[serde(rename = "type")]
    pub rule_type: String,
    pub tenant_id: String,
    pub time: TimeSpec,
    pub by: Vec<String>,
    pub emit: Option<EmitSpec>,
    // Rule-specific fields (flattened)
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(serde::Deserialize)]
pub struct TimeSpec {
    pub from: Option<String>,
    pub to: Option<String>,
    pub last_seconds: Option<u64>,
}

#[derive(serde::Deserialize)]
pub struct EmitSpec {
    pub limit: Option<u64>,
}

#[derive(serde::Serialize)]
pub struct CompileResponse {
    pub sql: String,
    pub rule_type: String,
    pub validation_errors: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct RunResponse {
    pub sql: String,
    pub hits: Vec<Value>,
    pub total_hits: usize,
    pub execution_time_ms: u64,
}

#[derive(serde::Serialize)]
pub struct TestResponse {
    pub ok: bool,
    pub rows_count: usize,
    pub sample: Vec<Value>,
    pub sql: String,
    pub validation_errors: Vec<String>,
}

/// POST /api/v2/detections/compile - Compile rule to SQL
pub async fn compile_detection(
    State(_app): State<Arc<AppState>>,
    Json(spec): Json<DetectionSpec>
) -> Result<Json<CompileResponse>, axum::http::StatusCode> {
    
    // Basic validation
    let mut errors = Vec::new();
    if spec.tenant_id.is_empty() {
        errors.push("tenant_id is required".to_string());
    }
    if spec.time.last_seconds.is_none() && (spec.time.from.is_none() || spec.time.to.is_none()) {
        errors.push("time range is required (last_seconds or from/to)".to_string());
    }
    
    // Compile to SQL based on rule type
    let sql = match spec.rule_type.as_str() {
        "sequence" => compile_sequence(&spec),
        "sequence_absence" => compile_absence(&spec),
        "chain" => compile_chain(&spec),
        "rolling_threshold" => compile_rolling(&spec),
        "ratio" => compile_ratio(&spec),
        "first_seen" => compile_first_seen(&spec),
        "beaconing" => compile_beaconing(&spec),
        // CHUNK 1: Advanced Detection Families
        "spike" => compile_spike(&spec),
        "spread" => compile_spread(&spec),
        "peer_out" => compile_peer_out(&spec),
        // CHUNK 2: Behavioral Detection Families
        "burst" => compile_burst(&spec),
        "time_of_day" => compile_time_of_day(&spec),
        "travel" => compile_travel(&spec),
        "lex" => compile_lex(&spec),
        _ => {
            errors.push(format!("unsupported rule type: {}", spec.rule_type));
            "-- Invalid rule type".to_string()
        }
    };
    
    Ok(Json(CompileResponse {
        sql,
        rule_type: spec.rule_type,
        validation_errors: errors,
    }))
}

/// POST /api/v2/detections/run - Compile and execute rule
pub async fn run_detection(
    State(_app): State<Arc<AppState>>,
    Json(spec): Json<DetectionSpec>
) -> Result<Json<RunResponse>, axum::http::StatusCode> {
    
    let sql = match spec.rule_type.as_str() {
        "sequence" => compile_sequence(&spec),
        "sequence_absence" => compile_absence(&spec),
        "chain" => compile_chain(&spec),
        "rolling_threshold" => compile_rolling(&spec),
        "ratio" => compile_ratio(&spec),
        "first_seen" => compile_first_seen(&spec),
        "beaconing" => compile_beaconing(&spec),
        // CHUNK 1: Advanced Detection Families
        "spike" => compile_spike(&spec),
        "spread" => compile_spread(&spec),
        "peer_out" => compile_peer_out(&spec),
        _ => return Err(axum::http::StatusCode::BAD_REQUEST),
    };
    
    // Execute against ClickHouse
    let start_time = std::time::Instant::now();
    let client = reqwest::Client::new();
    
    let resp = client
        .get("http://localhost:8123/")
        .query(&[("query", format!("{} FORMAT JSON", sql))])
        .send()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;

    if !resp.status().is_success() {
        return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
    }

    let execution_time = start_time.elapsed().as_millis() as u64;
    let text = resp.text().await.map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    let result: Value = serde_json::from_str(&text).map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let hits = result.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default();
    let total_hits = hits.len();
    
    Ok(Json(RunResponse {
        sql,
        hits,
        total_hits,
        execution_time_ms: execution_time,
    }))
}

/// POST /api/v2/detections/test - Test rule with basic validation
pub async fn test_detection(
    State(_app): State<Arc<AppState>>,
    Json(spec): Json<DetectionSpec>
) -> Result<Json<TestResponse>, axum::http::StatusCode> {
    
    let mut errors = Vec::new();
    
    // Validate required fields
    if spec.tenant_id.is_empty() {
        errors.push("tenant_id is required".to_string());
    }
    
    let sql = match spec.rule_type.as_str() {
        "sequence" => compile_sequence(&spec),
        "sequence_absence" => compile_absence(&spec),
        "chain" => compile_chain(&spec),
        "rolling_threshold" => compile_rolling(&spec),
        "ratio" => compile_ratio(&spec),
        "first_seen" => compile_first_seen(&spec),
        "beaconing" => compile_beaconing(&spec),
        // CHUNK 1: Advanced Detection Families
        "spike" => compile_spike(&spec),
        "spread" => compile_spread(&spec),
        "peer_out" => compile_peer_out(&spec),
        // CHUNK 2: Behavioral Detection Families
        "burst" => compile_burst(&spec),
        "time_of_day" => compile_time_of_day(&spec),
        "travel" => compile_travel(&spec),
        "lex" => compile_lex(&spec),
        _ => {
            errors.push(format!("unsupported rule type: {}", spec.rule_type));
            "-- Invalid rule type".to_string()
        }
    };
    
    // Quick execution test
    let client = reqwest::Client::new();
    let test_sql = format!("{} LIMIT 5", sql);
    
    let resp = client
        .get("http://localhost:8123/")
        .query(&[("query", format!("{} FORMAT JSON", test_sql))])
        .send()
        .await
        .map_err(|_| axum::http::StatusCode::BAD_GATEWAY)?;

    let ok = resp.status().is_success();
    let text = resp.text().await.unwrap_or_default();
    
    let sample = if ok {
        if let Ok(result) = serde_json::from_str::<Value>(&text) {
            result.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default()
        } else {
            Vec::new()
        }
    } else {
        errors.push(format!("SQL execution failed: {}", text));
        Vec::new()
    };
    
    Ok(Json(TestResponse {
        ok,
        rows_count: sample.len(),
        sample: sample.into_iter().take(5).collect(),
        sql,
        validation_errors: errors,
    }))
}

// === SQL Compilation Functions ===

fn time_where(time: &TimeSpec) -> String {
    if let Some(last_seconds) = time.last_seconds {
        format!("ts >= now() - INTERVAL {} SECOND", last_seconds)
    } else if let (Some(from), Some(to)) = (&time.from, &time.to) {
        format!("ts BETWEEN toDateTime64('{}',3) AND toDateTime64('{}',3)", from, to)
    } else {
        "ts >= now() - INTERVAL 3600 SECOND".to_string() // Default 1 hour
    }
}

fn by_key(by: &[String]) -> String {
    if by.is_empty() {
        "tenant_id".to_string()
    } else {
        format!("tenant_id, {}", by.join(", "))
    }
}

fn emit_limit(emit: &Option<EmitSpec>) -> String {
    let limit = emit.as_ref().and_then(|e| e.limit).unwrap_or(1000);
    format!("LIMIT {}", limit)
}

fn compile_sequence(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    
    // Extract sequence-specific fields
    let window_sec = spec.extra.get("window_sec").and_then(|v| v.as_u64()).unwrap_or(300);
    let strict = spec.extra.get("strict").and_then(|v| v.as_str()).unwrap_or("default");
    
    // For now, use a simple example. In production, you'd parse the stages array
    let stages = "(event_type='auth' AND outcome='fail'), (event_type='auth' AND outcome='success')";
    let strict_param = if strict != "default" { format!(", ['{}']", strict) } else { String::new() };
    
    format!(
        "SELECT {} AS entity_keys, min(ts) AS first_ts, max(ts) AS last_ts, count() AS total_events \
         FROM siem_v3.events_norm \
         WHERE tenant_id='{}' AND {} \
         GROUP BY {} \
         HAVING windowFunnel({}{})(ts_uint32, {}) >= 2 \
         ORDER BY last_ts DESC {}",
        by_clause, spec.tenant_id, time_clause, by_clause, window_sec, strict_param, stages, limit_clause
    )
}

fn compile_absence(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    let window_sec = spec.extra.get("window_sec").and_then(|v| v.as_u64()).unwrap_or(600);
    
    // Example: password reset then NO MFA
    let a_cond = "event_type='idp' AND action='password_reset'";
    let b_cond = "event_type='idp' AND action='mfa_challenge'";
    
    format!(
        "SELECT {} AS entity_keys, min(ts) AS a_ts, countIf({}) AS a_count, countIf({}) AS b_count \
         FROM siem_v3.events_norm \
         WHERE tenant_id='{}' AND {} \
         GROUP BY {} \
         HAVING windowFunnel({})(ts_uint32, ({}), ({})) < 2 AND countIf({}) > 0 \
         ORDER BY a_ts DESC {}",
        by_clause, a_cond, b_cond, spec.tenant_id, time_clause, by_clause, 
        window_sec, a_cond, b_cond, a_cond, limit_clause
    )
}

fn compile_chain(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    let window_sec = spec.extra.get("window_sec").and_then(|v| v.as_u64()).unwrap_or(900);
    
    // Example: login → oauth → mailbox rule
    let stages = "(event_type='auth' AND outcome='success'), (event_type='oauth' AND consent='granted'), (event_type='mail' AND action='create_inbox_rule')";
    
    format!(
        "SELECT {} AS entity_keys, min(ts) AS first_ts, max(ts) AS last_ts \
         FROM siem_v3.events_norm \
         WHERE tenant_id='{}' AND {} \
         GROUP BY {} \
         HAVING windowFunnel({})(ts_uint32, {}) = 3 \
         ORDER BY last_ts DESC {}",
        by_clause, spec.tenant_id, time_clause, by_clause, window_sec, stages, limit_clause
    )
}

fn compile_rolling(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    let window_sec = spec.extra.get("window_sec").and_then(|v| v.as_u64()).unwrap_or(300);
    let expr = spec.extra.get("expr").and_then(|v| v.as_str()).unwrap_or("rolling > 100");
    
    format!(
        "WITH b AS ( \
           SELECT {}, toStartOfMinute(ts) AS bucket, count() AS c \
           FROM siem_v3.events_norm \
           WHERE tenant_id='{}' AND {} \
           GROUP BY {}, bucket \
         ) \
         SELECT {} AS entity_keys, max(bucket) AS bucket_end, \
                sum(c) OVER (PARTITION BY {} ORDER BY bucket RANGE BETWEEN {} PRECEDING AND CURRENT ROW) AS rolling \
         FROM b \
         WHERE {} \
         ORDER BY bucket_end DESC {}",
        by_clause, spec.tenant_id, time_clause, by_clause, by_clause, by_clause, 
        window_sec / 60, expr.replace("rolling", "rolling"), limit_clause
    )
}

fn compile_ratio(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    let bucket_sec = spec.extra.get("bucket_sec").and_then(|v| v.as_u64()).unwrap_or(600);
    let ratio_gt = spec.extra.get("ratio_gt").and_then(|v| v.as_f64()).unwrap_or(20.0);
    
    // Example: auth failures vs successes
    let numerator = "event_type='auth' AND outcome='fail'";
    let denominator = "event_type='auth' AND outcome='success'";
    
    format!(
        "SELECT {} AS entity_keys, toStartOfInterval(ts, INTERVAL {} SECOND) AS bucket, \
                countIf({}) AS numerator, countIf({}) AS denominator, \
                countIf({}) / countIf({}) AS ratio \
         FROM siem_v3.events_norm \
         WHERE tenant_id='{}' AND {} \
         GROUP BY {}, bucket \
         HAVING denominator > 0 AND ratio > {} \
         ORDER BY bucket DESC, ratio DESC {}",
        by_clause, bucket_sec, numerator, denominator, numerator, denominator,
        spec.tenant_id, time_clause, by_clause, ratio_gt, limit_clause
    )
}

fn compile_first_seen(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    let entity = spec.extra.get("entity").and_then(|v| v.as_str()).unwrap_or("src_ip");
    let horizon_days = spec.extra.get("horizon_days").and_then(|v| v.as_u64()).unwrap_or(180);
    
    format!(
        "WITH baseline AS ( \
           SELECT DISTINCT {}, {} \
           FROM siem_v3.events_norm \
           WHERE tenant_id='{}' AND ts >= now() - INTERVAL {} DAY AND ts < now() - INTERVAL {} SECOND \
         ), \
         recent AS ( \
           SELECT {}, {}, min(ts) AS first_ts, count() AS event_count \
           FROM siem_v3.events_norm \
           WHERE tenant_id='{}' AND {} \
           GROUP BY {}, {} \
         ) \
         SELECT r.{}, r.{}, r.first_ts, r.event_count \
         FROM recent r \
         LEFT JOIN baseline b ON r.{} = b.{} AND r.{} = b.{} \
         WHERE b.{} IS NULL \
         ORDER BY first_ts DESC {}",
        by_clause, entity, spec.tenant_id, horizon_days, spec.time.last_seconds.unwrap_or(3600),
        by_clause, entity, spec.tenant_id, time_clause, by_clause, entity,
        by_clause.replace("tenant_id, ", ""), entity, by_clause.replace("tenant_id, ", ""), 
        by_clause.replace("tenant_id, ", ""), entity, entity, entity, limit_clause
    )
}

fn compile_beaconing(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let limit_clause = emit_limit(&spec.emit);
    let partition = spec.extra.get("partition").and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(", "))
        .unwrap_or_else(|| "src_ip, dest_ip".to_string());
    let min_events = spec.extra.get("min_events").and_then(|v| v.as_u64()).unwrap_or(20);
    let rsd_lt = spec.extra.get("rsd_lt").and_then(|v| v.as_f64()).unwrap_or(0.2);
    
    format!(
        "WITH intervals AS ( \
           SELECT tenant_id, {}, ts, \
                  ts - lagInFrame(ts) OVER (PARTITION BY tenant_id, {} ORDER BY ts) AS interval_sec \
           FROM siem_v3.events_norm \
           WHERE tenant_id='{}' AND {} \
         ), \
         stats AS ( \
           SELECT tenant_id, {}, count() AS event_count, \
                  avg(interval_sec) AS avg_interval, stddevPop(interval_sec) AS stddev_interval, \
                  stddevPop(interval_sec) / avg(interval_sec) AS rsd, \
                  min(ts) AS first_ts, max(ts) AS last_ts \
           FROM intervals \
           WHERE interval_sec IS NOT NULL \
           GROUP BY tenant_id, {} \
         ) \
         SELECT tenant_id, {} AS entity_keys, event_count, avg_interval, rsd, first_ts, last_ts \
         FROM stats \
         WHERE event_count >= {} AND rsd < {} \
         ORDER BY rsd ASC, event_count DESC {}",
        partition, partition, spec.tenant_id, time_clause, partition, 
        partition, partition, min_events, rsd_lt, limit_clause
    )
}

// === CHUNK 1: Advanced Detection Compilers ===

fn compile_spike(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    
    let bucket_sec = spec.extra.get("bucket_sec").and_then(|v| v.as_u64()).unwrap_or(300);
    let hist_buckets = spec.extra.get("hist_buckets").and_then(|v| v.as_u64()).unwrap_or(288);
    let z_threshold = spec.extra.get("z").and_then(|v| v.as_f64()).unwrap_or(3.0);
    let metric_sql = spec.extra.get("metric").and_then(|v| v.get("sql")).and_then(|v| v.as_str()).unwrap_or("1");
    
    format!(
        "WITH b AS ( \
           SELECT {}, toStartOfInterval(ts, INTERVAL {} SECOND) AS bkt, \
                  countIf({}) AS c \
           FROM siem_v3.events_norm \
           WHERE tenant_id='{}' AND {} \
           GROUP BY {}, bkt \
         ), \
         z AS ( \
           SELECT {}, bkt, c, \
                  avg(c) OVER (PARTITION BY {} ORDER BY bkt ROWS BETWEEN {} PRECEDING AND 1 PRECEDING) AS mu, \
                  stddevPop(c) OVER (PARTITION BY {} ORDER BY bkt ROWS BETWEEN {} PRECEDING AND 1 PRECEDING) AS sigma \
           FROM b \
         ) \
         SELECT {} AS entity_keys, bkt AS bucket_end, \
                c AS current_value, mu AS baseline_avg, sigma AS baseline_stddev, \
                (c - mu) / nullIf(sigma,0) AS z_score \
         FROM z \
         WHERE z_score >= {} \
         ORDER BY bucket_end DESC, z_score DESC {}",
        by_clause, bucket_sec, metric_sql, spec.tenant_id, time_clause, by_clause,
        by_clause, by_clause, hist_buckets, by_clause, hist_buckets,
        by_clause, z_threshold, limit_clause
    )
}

fn compile_spread(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    
    let window_sec = spec.extra.get("window_sec").and_then(|v| v.as_u64()).unwrap_or(600);
    let min_distinct = spec.extra.get("min_distinct").and_then(|v| v.as_u64()).unwrap_or(20);
    let target = spec.extra.get("target").and_then(|v| v.as_str()).unwrap_or("user");
    let where_clause = spec.extra.get("where").and_then(|v| v.get("sql")).and_then(|v| v.as_str()).unwrap_or("");
    let where_sql = if where_clause.is_empty() { String::new() } else { format!("AND ({})", where_clause) };
    
    format!(
        "SELECT {} AS entity_keys, \
                toStartOfInterval(ts, INTERVAL {} SECOND) AS window_start, \
                uniqExact({}) AS distinct_{}, \
                count() AS total_events \
         FROM siem_v3.events_norm \
         WHERE tenant_id='{}' AND {} {} \
         GROUP BY {}, window_start \
         HAVING distinct_{} >= {} \
         ORDER BY window_start DESC, distinct_{} DESC {}",
        by_clause, window_sec, target, target.replace(|c: char| !c.is_alphanumeric(), "_"),
        spec.tenant_id, time_clause, where_sql, by_clause,
        target.replace(|c: char| !c.is_alphanumeric(), "_"), min_distinct,
        target.replace(|c: char| !c.is_alphanumeric(), "_"), limit_clause
    )
}

fn compile_peer_out(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    
    let bucket_sec = spec.extra.get("bucket_sec").and_then(|v| v.as_u64()).unwrap_or(3600);
    let p = spec.extra.get("p").and_then(|v| v.as_f64()).unwrap_or(0.95);
    let peer_field = spec.extra.get("peer_label_field").and_then(|v| v.as_str()).unwrap_or("event_type");
    let kpi_sql = spec.extra.get("kpi").and_then(|v| v.get("sql")).and_then(|v| v.as_str()).unwrap_or("1");
    
    format!(
        "WITH bucketed AS ( \
           SELECT {}, {} AS peer_label, \
                  toStartOfInterval(ts, INTERVAL {} SECOND) AS bkt, \
                  sumIf(1, {}) AS kpi_value \
           FROM siem_v3.events_norm \
           WHERE tenant_id='{}' AND {} \
           GROUP BY {}, peer_label, bkt \
         ), \
         peer_baseline AS ( \
           SELECT peer_label, quantileTDigest({})(kpi_value) AS peer_pctl, \
                  count() AS peer_observations \
           FROM bucketed \
           GROUP BY peer_label \
         ) \
         SELECT b.{} AS entity_keys, b.peer_label, b.bkt AS bucket_end, \
                b.kpi_value, p.peer_pctl AS peer_{}th_percentile, p.peer_observations \
         FROM bucketed b \
         JOIN peer_baseline p USING (peer_label) \
         WHERE b.kpi_value > p.peer_pctl \
         ORDER BY bucket_end DESC, b.kpi_value DESC {}",
        by_clause, peer_field, bucket_sec, kpi_sql, spec.tenant_id, time_clause,
        by_clause, p, by_clause.replace("tenant_id, ", ""), (p * 100.0) as u32, limit_clause
    )
}

// === CHUNK 2: Behavioral Detection Compilers ===

fn compile_burst(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    
    let bucket_fast_sec = spec.extra.get("bucket_fast_sec").and_then(|v| v.as_u64()).unwrap_or(120);
    let bucket_slow_sec = spec.extra.get("bucket_slow_sec").and_then(|v| v.as_u64()).unwrap_or(600);
    let ratio_gt = spec.extra.get("ratio_gt").and_then(|v| v.as_f64()).unwrap_or(10.0);
    let where_clause = spec.extra.get("where").and_then(|v| v.get("sql")).and_then(|v| v.as_str()).unwrap_or("");
    let where_sql = if where_clause.is_empty() { String::new() } else { format!("AND ({})", where_clause) };
    
    format!(
        "WITH fast AS ( \
           SELECT {}, toStartOfInterval(ts, INTERVAL {} SECOND) AS b, count() AS c_fast \
           FROM siem_v3.events_norm \
           WHERE tenant_id='{}' AND {} {} \
           GROUP BY {}, b \
         ), \
         slow AS ( \
           SELECT {}, toStartOfInterval(ts, INTERVAL {} SECOND) AS b_slow, count() AS c_slow \
           FROM siem_v3.events_norm \
           WHERE tenant_id='{}' AND {} {} \
           GROUP BY {}, b_slow \
         ), \
         j AS ( \
           SELECT f.{}, f.b AS bucket_end, f.c_fast, anyLast(s.c_slow) AS c_slow \
           FROM fast f \
           LEFT JOIN slow s ON {} AND s.b_slow <= f.b \
           GROUP BY {}, f.b, f.c_fast \
         ) \
         SELECT {} AS entity_keys, bucket_end, c_fast, c_slow, c_fast / nullIf(c_slow,0) AS ratio \
         FROM j \
         WHERE c_slow > 0 AND ratio >= {} \
         ORDER BY bucket_end DESC, ratio DESC {}",
        by_clause, bucket_fast_sec, spec.tenant_id, time_clause, where_sql, by_clause,
        by_clause, bucket_slow_sec, spec.tenant_id, time_clause, where_sql, by_clause,
        by_clause.replace("tenant_id, ", ""),
        spec.by.iter().map(|k| format!("f.{} = s.{}", k, k)).collect::<Vec<_>>().join(" AND "),
        by_clause.replace("tenant_id, ", ""), by_clause, ratio_gt, limit_clause
    )
}

fn compile_time_of_day(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    
    let hour_start = spec.extra.get("hour_start").and_then(|v| v.as_u64()).unwrap_or(2);
    let hour_end = spec.extra.get("hour_end").and_then(|v| v.as_u64()).unwrap_or(4);
    let bucket_sec = spec.extra.get("bucket_sec").and_then(|v| v.as_u64()).unwrap_or(3600);
    let hist_buckets = spec.extra.get("hist_buckets").and_then(|v| v.as_u64()).unwrap_or(24);
    let z_threshold = spec.extra.get("z").and_then(|v| v.as_f64()).unwrap_or(3.0);
    let where_clause = spec.extra.get("where").and_then(|v| v.get("sql")).and_then(|v| v.as_str()).unwrap_or("");
    let where_sql = if where_clause.is_empty() { String::new() } else { format!("AND ({})", where_clause) };
    
    format!(
        "WITH b AS ( \
           SELECT {}, toStartOfInterval(ts, INTERVAL {} SECOND) AS bkt, toHour(ts) AS hr, count() AS c \
           FROM siem_v3.events_norm \
           WHERE tenant_id='{}' AND {} {} \
           GROUP BY {}, bkt, hr \
         ), \
         f AS ( \
           SELECT * FROM b WHERE hr BETWEEN {} AND {} \
         ), \
         z AS ( \
           SELECT {}, bkt, c, \
                  avg(c) OVER (PARTITION BY {} ORDER BY bkt ROWS BETWEEN {} PRECEDING AND 1 PRECEDING) AS mu, \
                  stddevPop(c) OVER (PARTITION BY {} ORDER BY bkt ROWS BETWEEN {} PRECEDING AND 1 PRECEDING) AS sigma \
           FROM f \
         ) \
         SELECT {} AS entity_keys, bkt AS bucket_end, c AS current_value, \
                mu AS baseline_avg, sigma AS baseline_stddev, \
                (c - mu) / nullIf(sigma,0) AS z_score \
         FROM z \
         WHERE z_score >= {} \
         ORDER BY bucket_end DESC, z_score DESC {}",
        by_clause, bucket_sec, spec.tenant_id, time_clause, where_sql, by_clause,
        hour_start, hour_end, by_clause, by_clause, hist_buckets, by_clause, hist_buckets,
        by_clause, z_threshold, limit_clause
    )
}

fn compile_travel(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    
    let max_interval = spec.extra.get("max_interval_sec").and_then(|v| v.as_u64()).unwrap_or(3600);
    let countries_only = spec.extra.get("countries_only").and_then(|v| v.as_bool()).unwrap_or(true);
    let speed_kmh = spec.extra.get("speed_kmh_gt").and_then(|v| v.as_f64());
    
    // Country-only detection (simplified)
    if countries_only && speed_kmh.is_none() {
        format!(
            "WITH auth AS ( \
               SELECT {}, ts, \
                      assumeNotNull(coalesce(parsed_fields['country'], 'UNKNOWN')) AS country \
               FROM siem_v3.events_norm \
               WHERE tenant_id='{}' AND {} AND (event_type='auth' AND outcome='success') \
             ), \
             w AS ( \
               SELECT {}, ts, country, \
                      lagInFrame(ts) OVER (PARTITION BY {} ORDER BY ts) AS prev_ts, \
                      lagInFrame(country) OVER (PARTITION BY {} ORDER BY ts) AS prev_country \
               FROM auth \
             ) \
             SELECT {} AS entity_keys, ts, prev_ts, country, prev_country, \
                    toUInt32(ts - prev_ts) AS dt_sec \
             FROM w \
             WHERE prev_ts IS NOT NULL AND country != prev_country \
               AND country != 'UNKNOWN' AND prev_country != 'UNKNOWN' \
               AND (ts - prev_ts) <= {} \
             ORDER BY ts DESC {}",
            by_clause, spec.tenant_id, time_clause, by_clause, by_clause, by_clause,
            by_clause, max_interval, limit_clause
        )
    } else {
        // Speed-based detection (requires geo data)
        format!(
            "WITH auth AS ( \
               SELECT {}, ts, \
                      toFloat64OrZero(parsed_fields['lat']) AS lat, \
                      toFloat64OrZero(parsed_fields['lon']) AS lon \
               FROM siem_v3.events_norm \
               WHERE tenant_id='{}' AND {} AND (event_type='auth' AND outcome='success') \
                 AND parsed_fields['lat'] != '' AND parsed_fields['lon'] != '' \
             ), \
             w AS ( \
               SELECT {}, ts, lat, lon, \
                      lagInFrame(ts) OVER (PARTITION BY {} ORDER BY ts) AS prev_ts, \
                      lagInFrame(lat) OVER (PARTITION BY {} ORDER BY ts) AS prev_lat, \
                      lagInFrame(lon) OVER (PARTITION BY {} ORDER BY ts) AS prev_lon \
               FROM auth \
             ), \
             s AS ( \
               SELECT {}, ts, prev_ts, \
                      greatCircleDistance(lat, lon, prev_lat, prev_lon) / 1000.0 AS km, \
                      toUInt32(ts - prev_ts) AS dt_sec \
               FROM w WHERE prev_ts IS NOT NULL AND (ts - prev_ts) <= {} \
             ) \
             SELECT {} AS entity_keys, ts, prev_ts, km, dt_sec, \
                    (km / nullIf(dt_sec,0)) * 3600.0 AS kmh \
             FROM s \
             WHERE kmh >= {} \
             ORDER BY ts DESC {}",
            by_clause, spec.tenant_id, time_clause, by_clause, by_clause, by_clause, by_clause,
            by_clause, max_interval, by_clause, speed_kmh.unwrap_or(900.0), limit_clause
        )
    }
}

fn compile_lex(spec: &DetectionSpec) -> String {
    let time_clause = time_where(&spec.time);
    let by_clause = by_key(&spec.by);
    let limit_clause = emit_limit(&spec.emit);
    
    let field = spec.extra.get("field").and_then(|v| v.as_str()).unwrap_or("message");
    let min_len = spec.extra.get("min_len").and_then(|v| v.as_u64()).unwrap_or(30);
    let where_clause = spec.extra.get("where").and_then(|v| v.get("sql")).and_then(|v| v.as_str()).unwrap_or("");
    let where_sql = if where_clause.is_empty() { String::new() } else { format!("AND ({})", where_clause) };
    
    // Check for custom scoring
    if let (Some(score_sql), Some(score_gt)) = (
        spec.extra.get("score_sql").and_then(|v| v.get("sql")).and_then(|v| v.as_str()),
        spec.extra.get("score_gt").and_then(|v| v.as_f64())
    ) {
        format!(
            "SELECT {} AS entity_keys, ts, {} AS suspicious_value, ({}) AS lexical_score \
             FROM siem_v3.events_norm \
             WHERE tenant_id='{}' AND {} {} \
               AND length({}) >= {} AND lexical_score >= {} \
             ORDER BY ts DESC, lexical_score DESC {}",
            by_clause, field, score_sql, spec.tenant_id, time_clause, where_sql,
            field, min_len, score_gt, limit_clause
        )
    } else {
        // Default heuristics
        let min_pattern_len = std::cmp::max(24, min_len);
        format!(
            "SELECT {} AS entity_keys, ts, {} AS suspicious_value, length({}) AS string_length, \
                    multiIf( \
                      match({}, '^[A-Za-z0-9+/=]{{{}.*}}$'), 'base64_like', \
                      match({}, '^[A-Fa-f0-9]{{{}.*}}$'), 'hex_like', \
                      match({}, '[^A-Za-z0-9._-]{{10,}}'), 'symbol_heavy', \
                      'other' \
                    ) AS pattern_type \
             FROM siem_v3.events_norm \
             WHERE tenant_id='{}' AND {} {} \
               AND length({}) >= {} \
               AND (match({}, '^[A-Za-z0-9+/=]{{{}.*}}$') \
                 OR match({}, '^[A-Fa-f0-9]{{{}.*}}$') \
                 OR match({}, '[^A-Za-z0-9._-]{{10,}}')) \
             ORDER BY ts DESC, string_length DESC {}",
            by_clause, field, field, field, min_pattern_len, field, min_pattern_len, field,
            spec.tenant_id, time_clause, where_sql, field, min_len,
            field, min_pattern_len, field, min_pattern_len, field, limit_clause
        )
    }
}
