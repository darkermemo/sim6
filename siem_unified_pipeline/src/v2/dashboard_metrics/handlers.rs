use std::sync::Arc;
use axum::{extract::{Query, State}, Json};
use serde::{Deserialize, Serialize};
use crate::v2::state::AppState;
use clickhouse::Row;

#[derive(Deserialize, Clone)]
pub struct Window {
    pub since: Option<String>,    // ISO8601
    pub until: Option<String>,    // ISO8601
    pub step:  Option<String>,    // "60s", "5m" etc
    pub tenant_id: Option<String>
}

#[derive(Serialize)]
struct SeriesKV { 
    t: u64, 
    #[serde(skip_serializing_if="Option::is_none")] rows_in: Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")] bytes_in: Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")] qps: Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")] p50_ms: Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")] p95_ms: Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")] storage_bytes: Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")] error_rate: Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")] max_lag_seconds: Option<u64>,
    #[serde(skip_serializing_if="Option::is_none")] avg_lag_seconds: Option<u64> 
}

#[derive(Serialize)]
pub struct IngestResp {
    series: Vec<SeriesKV>,
    totals: IngestTotals,
}

#[derive(Serialize)]
pub struct IngestTotals {
    rows_in: u64,
    bytes_in: u64,
}

#[derive(Serialize)]
pub struct QueryResp {
    series: Vec<SeriesKV>,
    totals: QueryTotals,
}

#[derive(Serialize)]
pub struct QueryTotals {
    queries: u64,
}

#[derive(Serialize)]
pub struct StorageResp {
    series: Vec<SeriesKV>,
    latest: StorageLatest,
}

#[derive(Serialize)]
pub struct StorageLatest {
    storage_bytes: u64,
}

#[derive(Serialize)]
pub struct ErrorsResp {
    series: Vec<SeriesKV>,
    totals: ErrorsTotals,
}

#[derive(Serialize)]
pub struct ErrorsTotals {
    errors: u64,
}

#[derive(Serialize)]
pub struct FreshnessResp {
    series: Vec<SeriesKV>,
}

// ClickHouse result types
#[derive(Row, Deserialize)]
struct IngestRow {
    t: u64,
    rows_in: u64,
    bytes_in: u64,
}

#[derive(Row, Deserialize)]
struct QueryRow {
    t: u64,
    qps: u64,
    p50_ms: u64,
    p95_ms: u64,
}

#[derive(Row, Deserialize)]
struct StorageRow {
    t: u64,
    storage_bytes: u64,
}

#[derive(Row, Deserialize)]
struct ErrorRow {
    t: u64,
    error_rate: u64,
}

#[derive(Row, Deserialize)]
struct FreshnessRow {
    t: u64,
    max_lag_seconds: u64,
    avg_lag_seconds: u64,
}

fn parse_step_seconds(step: &Option<String>) -> u64 {
    if let Some(s) = step {
        if let Some(ss) = s.strip_suffix("s") { return ss.parse().unwrap_or(60); }
        if let Some(mm) = s.strip_suffix("m") { return mm.parse::<u64>().map(|m| m*60).unwrap_or(60); }
        if let Some(hh) = s.strip_suffix("h") { return hh.parse::<u64>().map(|h| h*3600).unwrap_or(3600); }
    }
    60
}



#[axum::debug_handler]
pub async fn ingest(State(app): State<Arc<AppState>>, Query(w): Query<Window>) -> Json<IngestResp> {
    let step = parse_step_seconds(&w.step);
    let sql = format!(r#"
    WITH
      parseDateTimeBestEffortOrNull('{since}') AS since_,
      parseDateTimeBestEffortOrNull('{until}') AS until_,
      toIntervalSecond({step}) AS step_
    SELECT
      toUnixTimestamp(toStartOfInterval(event_timestamp, step_)) AS t,
      count() AS rows_in,
      sum(length(raw_log)) AS bytes_in
    FROM dev.events
    WHERE (since_ IS NULL OR event_timestamp >= since_)
      AND (until_ IS NULL OR event_timestamp <  until_)
      {tenant}
    GROUP BY toStartOfInterval(event_timestamp, step_)
    ORDER BY t
    "#,
    since = w.since.clone().unwrap_or_default(),
    until = w.until.clone().unwrap_or_default(),
    step = step,
    tenant = if let Some(t) = &w.tenant_id { 
        format!("AND tenant_id = '{}'", t.replace('\'', "''")) 
    } else { 
        "".into() 
    });

    let rows: Vec<IngestRow> = match app.ch.query(&sql).fetch_all().await {
        Ok(rows) => rows,
        Err(_) => vec![],
    };
    
    let series: Vec<SeriesKV> = rows.iter().map(|r| SeriesKV {
        t: r.t,
        rows_in: Some(r.rows_in),
        bytes_in: Some(r.bytes_in),
        qps: None, p50_ms: None, p95_ms: None, storage_bytes: None, error_rate: None,
        max_lag_seconds: None, avg_lag_seconds: None
    }).collect();
    
    // Calculate totals
    let total_rows: u64 = series.iter().filter_map(|s| s.rows_in).sum();
    let total_bytes: u64 = series.iter().filter_map(|s| s.bytes_in).sum();
    
    Json(IngestResp {
        series,
        totals: IngestTotals {
            rows_in: total_rows,
            bytes_in: total_bytes,
        }
    })
}

#[axum::debug_handler]
pub async fn query(State(app): State<Arc<AppState>>, Query(w): Query<Window>) -> Json<QueryResp> {
    let step = parse_step_seconds(&w.step);
    let sql = format!(r#"
    WITH
      parseDateTimeBestEffortOrNull('{since}') AS since_,
      parseDateTimeBestEffortOrNull('{until}') AS until_,
      toIntervalSecond({step}) AS step_
    SELECT
      toUnixTimestamp(toStartOfInterval(event_time, step_)) AS t,
      countIf(type='QueryFinish') AS qps,
      quantile(0.5)(query_duration_ms) AS p50_ms,
      quantile(0.95)(query_duration_ms) AS p95_ms
    FROM system.query_log
    WHERE (since_ IS NULL OR event_time >= since_)
      AND (until_ IS NULL OR event_time <  until_)
      AND type IN ('QueryStart','QueryFinish')
    GROUP BY toStartOfInterval(event_time, step_)
    ORDER BY t
    "#,
    since = w.since.clone().unwrap_or_default(),
    until = w.until.clone().unwrap_or_default(),
    step = step);

    let rows: Vec<QueryRow> = match app.ch.query(&sql).fetch_all().await {
        Ok(rows) => rows,
        Err(_) => vec![],
    };
    
    let series: Vec<SeriesKV> = rows.iter().map(|r| SeriesKV {
        t: r.t,
        rows_in: None, bytes_in: None,
        qps: Some(r.qps),
        p50_ms: Some(r.p50_ms),
        p95_ms: Some(r.p95_ms),
        storage_bytes: None, error_rate: None, max_lag_seconds: None, avg_lag_seconds: None
    }).collect();
    
    let total_queries: u64 = series.iter().filter_map(|s| s.qps).sum();
    
    Json(QueryResp {
        series,
        totals: QueryTotals { queries: total_queries }
    })
}

#[axum::debug_handler]
pub async fn storage(State(app): State<Arc<AppState>>, Query(w): Query<Window>) -> Json<StorageResp> {
    let step = parse_step_seconds(&w.step);
    let sql = format!(r#"
    WITH
      parseDateTimeBestEffortOrNull('{since}') AS since_,
      parseDateTimeBestEffortOrNull('{until}') AS until_,
      toIntervalSecond({step}) AS step_
    SELECT
      toUnixTimestamp(toStartOfInterval(modification_time, step_)) AS t,
      sum(bytes_on_disk) AS storage_bytes
    FROM system.parts
    WHERE database='dev' AND table='events' AND active
      AND (since_ IS NULL OR modification_time >= since_)
      AND (until_ IS NULL OR modification_time <  until_)
    GROUP BY toStartOfInterval(modification_time, step_)
    ORDER BY t
    "#,
    since = w.since.clone().unwrap_or_default(),
    until = w.until.clone().unwrap_or_default(),
    step = step);

    let rows: Vec<StorageRow> = match app.ch.query(&sql).fetch_all().await {
        Ok(rows) => rows,
        Err(_) => vec![],
    };
    
    let series: Vec<SeriesKV> = rows.iter().map(|r| SeriesKV {
        t: r.t,
        rows_in: None, bytes_in: None, qps: None, p50_ms: None, p95_ms: None,
        storage_bytes: Some(r.storage_bytes),
        error_rate: None, max_lag_seconds: None, avg_lag_seconds: None
    }).collect();
    
    let latest_bytes = series.last().and_then(|s| s.storage_bytes).unwrap_or(0);
    
    Json(StorageResp {
        series,
        latest: StorageLatest { storage_bytes: latest_bytes }
    })
}

#[axum::debug_handler]
pub async fn errors(State(app): State<Arc<AppState>>, Query(w): Query<Window>) -> Json<ErrorsResp> {
    let step = parse_step_seconds(&w.step);
    let sql = format!(r#"
    WITH
      parseDateTimeBestEffortOrNull('{since}') AS since_,
      parseDateTimeBestEffortOrNull('{until}') AS until_,
      toIntervalSecond({step}) AS step_
    SELECT
      toUnixTimestamp(toStartOfInterval(event_time, step_)) AS t,
      countIf(exception_code != 0) AS error_rate
    FROM system.query_log
    WHERE (since_ IS NULL OR event_time >= since_)
      AND (until_ IS NULL OR event_time <  until_)
    GROUP BY toStartOfInterval(event_time, step_)
    ORDER BY t
    "#,
    since = w.since.clone().unwrap_or_default(),
    until = w.until.clone().unwrap_or_default(),
    step = step);

    let rows: Vec<ErrorRow> = match app.ch.query(&sql).fetch_all().await {
        Ok(rows) => rows,
        Err(_) => vec![],
    };
    
    let series: Vec<SeriesKV> = rows.iter().map(|r| SeriesKV {
        t: r.t,
        error_rate: Some(r.error_rate),
        rows_in: None, bytes_in: None, qps: None, p50_ms: None, p95_ms: None,
        storage_bytes: None, max_lag_seconds: None, avg_lag_seconds: None
    }).collect();
    
    let total_errors: u64 = series.iter().filter_map(|s| s.error_rate).sum();
    
    Json(ErrorsResp {
        series,
        totals: ErrorsTotals { errors: total_errors }
    })
}

#[axum::debug_handler]
pub async fn freshness(State(app): State<Arc<AppState>>, Query(w): Query<Window>) -> Json<FreshnessResp> {
    let step = parse_step_seconds(&w.step);
    let sql = format!(r#"
    WITH
      parseDateTimeBestEffortOrNull('{since}') AS since_,
      parseDateTimeBestEffortOrNull('{until}') AS until_,
      toIntervalSecond({step}) AS step_
    SELECT
      toUnixTimestamp(b) AS t,
      greatest(0, toUInt32(b) - toUInt32(maxTs)) AS max_lag_seconds,
      greatest(0, toUInt32(b) - toUInt32(avgTs)) AS avg_lag_seconds
    FROM (
      SELECT
        toStartOfInterval(event_timestamp, step_) AS b,
        max(event_timestamp) AS maxTs,
        toDateTime(avg(toUInt32(event_timestamp))) AS avgTs
      FROM dev.events
      WHERE (since_ IS NULL OR event_timestamp >= since_)
        AND (until_ IS NULL OR event_timestamp <  until_)
        {tenant}
      GROUP BY b
    )
    ORDER BY t
    "#,
    since = w.since.clone().unwrap_or_default(),
    until = w.until.clone().unwrap_or_default(),
    step = step,
    tenant = if let Some(t) = &w.tenant_id { 
        format!("AND tenant_id = '{}'", t.replace('\'', "''")) 
    } else { 
        "".into() 
    });

    let rows: Vec<FreshnessRow> = match app.ch.query(&sql).fetch_all().await {
        Ok(rows) => rows,
        Err(_) => vec![],
    };
    
    let series: Vec<SeriesKV> = rows.iter().map(|r| SeriesKV {
        t: r.t,
        max_lag_seconds: Some(r.max_lag_seconds),
        avg_lag_seconds: Some(r.avg_lag_seconds),
        rows_in: None, bytes_in: None, qps: None, p50_ms: None, p95_ms: None,
        storage_bytes: None, error_rate: None
    }).collect();
    
    Json(FreshnessResp { series })
}
