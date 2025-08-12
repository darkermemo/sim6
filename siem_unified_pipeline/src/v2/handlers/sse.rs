use axum::response::sse::{Event, KeepAlive, Sse};
use axum::extract::{Query, State};
use std::{convert::Infallible, time::Duration, sync::Arc};
use futures_util::{stream, Stream};
use tokio::time::sleep;
use serde::Deserialize;
use crate::v2::{state::AppState, api::EventSearchQuery};

pub async fn stream_stub() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let s = stream::unfold((), move |_| async {
        sleep(Duration::from_secs(5)).await;
        Some((Ok(Event::default().event("heartbeat").data("ok")), ()))
    });
    Sse::new(s).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)).text("keep-alive"))
}

#[derive(Debug, Deserialize)]
pub struct TailParams {
    pub since_seconds: Option<u64>,
    pub limit: Option<u32>,
    pub interval_ms: Option<u64>,
    pub query: Option<String>,
    pub source: Option<String>,
    pub severity: Option<String>,
    pub tenant_id: Option<String>,
}

pub async fn tail_stream(
    State(st): State<Arc<AppState>>,
    Query(mut p): Query<TailParams>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let poll_ms = p.interval_ms.unwrap_or(1000).clamp(100, 10_000);
    let per_tick = p.limit.unwrap_or(200).min(10_000);
    let now = chrono::Utc::now();
    let since_sec = p.since_seconds.unwrap_or(300);
    let last_ts: u32 = (now.timestamp() as u64 - since_sec) as u32;

    let base = EventSearchQuery {
        query: p.query.take(),
        source: p.source.take(),
        severity: p.severity.take(),
        tenant_id: p.tenant_id.take(),
        start_time: None,
        end_time: None,
        limit: Some(per_tick),
        offset: Some(0),
    };

    let s = stream::unfold((st, base, last_ts, poll_ms), move |(st, base, mut last_ts, poll_ms)| async move {
        let mut conditions: Vec<String> = Vec::new();
        if let Some(src) = &base.source { conditions.push(format!("source_type = '{}'", src.replace('\'', "''"))); }
        if let Some(sev) = &base.severity { conditions.push(format!("severity = '{}'", sev.replace('\'', "''"))); }
        if let Some(t) = &base.tenant_id { conditions.push(format!("tenant_id = '{}'", t.replace('\'', "''"))); }
        conditions.push(format!("event_timestamp > {}", last_ts));
        if let Some(qs) = &base.query {
            let s = qs.trim();
            if !s.is_empty() {
                let cols = ["message", "user_name", "user_id", "event_id", "source_type", "event_category", "event_action", "event_outcome"];            
                let make_term = |term: &str| -> String {
                    let esc = term.replace('\'', "''");
                    let per_col: Vec<String> = cols.iter().map(|c| format!("positionCaseInsensitive({}, '{}') > 0", c, esc)).collect();
                    format!("({})", per_col.join(" OR "))
                };
                let mut qcond = String::new();
                if s.contains(" OR ") {
                    let parts = s.split(" OR ").filter(|p| !p.trim().is_empty()).map(|p| make_term(p.trim())).collect::<Vec<_>>();
                    qcond = format!("({})", parts.join(" OR "));
                } else if s.contains(" AND ") {
                    let parts = s.split(" AND ").filter(|p| !p.trim().is_empty()).map(|p| make_term(p.trim())).collect::<Vec<_>>();
                    qcond = format!("({})", parts.join(" AND "));
                } else {
                    let parts = s.split_whitespace().filter(|p| !p.trim().is_empty()).map(|p| make_term(p.trim())).collect::<Vec<_>>();
                    if !parts.is_empty() { qcond = format!("({})", parts.join(" AND ")); }
                }
                if !qcond.is_empty() { conditions.push(qcond); }
            }
        }
        let where_clause = conditions.join(" AND ");
        let sql = format!(
            "SELECT event_id, event_timestamp, tenant_id, source_type, severity, event_category, event_action, user_name, user_id, message, length(raw_event) AS raw_len FROM {} WHERE {} ORDER BY event_timestamp ASC LIMIT {}",
            st.events_table, where_clause, base.limit.unwrap_or(200)
        );
        let rows: Vec<crate::v2::models::CompactEvent> = st.ch.query(&sql).fetch_all().await.unwrap_or_default();
        if rows.is_empty() {
            sleep(Duration::from_millis(poll_ms)).await;
            return Some((Ok(Event::default().event("heartbeat").data("[]")), (st, base, last_ts, poll_ms)));
        }
        if let Some(last) = rows.last() { last_ts = last.event_timestamp; }
        let data = serde_json::to_string(&rows).unwrap_or("[]".to_string());
        Some((Ok(Event::default().event("events").data(data)), (st, base, last_ts, poll_ms)))
    });

    Sse::new(s).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)).text("keep-alive"))
}


