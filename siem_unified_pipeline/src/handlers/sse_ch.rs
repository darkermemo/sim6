//! Server-Sent Events (SSE) handlers for ClickHouse real-time event streaming
//!
//! This module provides SSE endpoints for real-time event streaming using
//! ClickHouse polling. It implements efficient polling with configurable
//! intervals and proper SSE formatting.

use axum::extract::{Query, State};
use axum::response::sse::{Event, KeepAlive};
use axum::response::{IntoResponse, Sse};
use chrono::{DateTime, Duration, TimeZone, Utc};
use clickhouse::Client;
use futures_util::stream::{self, Stream};
use serde_json::json;
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration as StdDuration;
use tokio::time::interval;
use tracing::{debug, error, info};

use crate::error::{PipelineError, Result};
use crate::models::{EventSummary, SiemEvent};
use crate::state::AppState;
use crate::types::api::EventStreamQuery;

/// SSE handler for streaming events from ClickHouse
/// 
/// This endpoint provides real-time event streaming using Server-Sent Events.
/// It polls ClickHouse at regular intervals and streams new events to clients.
/// Supports filtering by source, severity, and security event type.
pub async fn stream_events_ch(
    State(app_state): State<Arc<AppState>>,
    Query(query): Query<EventStreamQuery>,
) -> std::result::Result<Sse<impl Stream<Item = std::result::Result<Event, Infallible>>>, impl IntoResponse>
{
    info!("Starting ClickHouse SSE stream with query: {:?}", query);

    if let Err(msg) = validate_stream_query(&query) {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            axum::Json(json!({"error":"Validation failed","message": msg}))
        ));
    }

    let stream = create_event_stream(
        (*app_state.ch).clone(),
        app_state.events_table.clone(),
        query,
    );

    Ok(Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(StdDuration::from_secs(15))
            .text("keep-alive"),
    ))
}

/// Creates the SSE event stream
fn create_event_stream(
    client: Client,
    table_name: String,
    query: EventStreamQuery,
) -> impl Stream<Item = std::result::Result<Event, Infallible>> {
    let poll_ms = query.heartbeat_interval.unwrap_or(1000).max(250);
    let poll_interval = StdDuration::from_millis(poll_ms as u64);

    // default lookback = last 60s
    let mut last_ts = Utc::now() - Duration::seconds(60);
    let mut ticker = interval(poll_interval);

    stream::unfold(
        (client, table_name, query, last_ts, ticker),
        move |(client, table, query, mut last_ts, mut ticker)| async move {
            ticker.tick().await;

            match poll_new_events(&client, &table, &query, last_ts).await {
                Ok((events, new_last)) => {
                    if !events.is_empty() {
                        last_ts = new_last;

                        let payload = json!({
                            "type": "events",
                            "timestamp": Utc::now(),
                            "count": events.len(),
                            "data": events
                        });

                        let ev = Event::default().event("events").data(payload.to_string());
                        Some((Ok(ev), (client, table, query, last_ts, ticker)))
                    } else {
                        let hb = Event::default().event("heartbeat").data(json!({
                            "type":"heartbeat",
                            "timestamp": Utc::now()
                        }).to_string());
                        Some((Ok(hb), (client, table, query, last_ts, ticker)))
                    }
                }
                Err(e) => {
                    error!("SSE poll error: {e}");
                    let err = Event::default().event("error").data(json!({
                        "type":"error","message": e.to_string(),"timestamp": Utc::now()
                    }).to_string());
                    Some((Ok(err), (client, table, query, last_ts, ticker)))
                }
            }
        },
    )
}

/// Poll ClickHouse for new events since the last timestamp
async fn poll_new_events(
    client: &Client,
    table_name: &str,
    query: &EventStreamQuery,
    since: DateTime<Utc>,
) -> Result<(Vec<EventSummary>, DateTime<Utc>)> {
    // Build SQL incrementally; bind typed parameters in-order.
    let mut sql = format!(
        "SELECT event_id, event_timestamp, source_type, severity, message, source_ip, destination_ip, user_name, tenant_id, event_category \
         FROM {} WHERE event_timestamp > ?",
        table_name
    );

    // Track bind parameters in order
    let mut bind_params: Vec<Box<dyn std::fmt::Debug + Send + Sync>> = vec![];
    bind_params.push(Box::new(since.timestamp() as u32));

    // Optional filters
    if let Some(src) = &query.source {
        sql.push_str(" AND source_type = ?");
        bind_params.push(Box::new(src.clone()));
    }
    if let Some(sev) = &query.severity {
        sql.push_str(" AND severity = ?");
        bind_params.push(Box::new(sev.clone()));
    }

    // Limit = validated buffer_size; use numeric interpolation (safe after bounds check)
    let limit = query.buffer_size.unwrap_or(100).clamp(1, 10_000);
    sql.push_str(&format!(" ORDER BY event_timestamp ASC LIMIT {}", limit));

    debug!("Polling SSE SQL: {sql}");

    // Bind parameters in exact order
    let mut q = client.query(&sql);
    q = q.bind(since.timestamp() as u32);
    
    if let Some(src) = &query.source {
        q = q.bind(src.as_str());
    }
    if let Some(sev) = &query.severity {
        q = q.bind(sev.as_str());
    }

    let events: Vec<SiemEvent> = q
        .fetch_all()
        .await
        .map_err(|e| {
            error!("ClickHouse polling query failed: {}", e);
            PipelineError::database(format!("Polling query failed: {}", e))
        })?;

    let mut new_last_timestamp = since;

    // Convert to EventSummary format and track latest timestamp
    let api_events: Vec<EventSummary> = events
        .into_iter()
        .map(|event| {
            let event_timestamp = DateTime::from_timestamp(event.event_timestamp as i64, 0)
                .unwrap_or_else(|| Utc::now());

            // Update last timestamp to the latest event timestamp
            if event_timestamp > new_last_timestamp {
                new_last_timestamp = event_timestamp;
            }

            EventSummary {
                event_id: event.event_id,
                tenant_id: event.tenant_id,
                event_timestamp: event.event_timestamp,
                source_type: event.source_type,
                severity: event.severity,
                message: event.message,
            }
        })
        .collect();

    Ok((api_events, new_last_timestamp))
}

/// Validates stream query parameters
fn validate_stream_query(query: &EventStreamQuery) -> std::result::Result<(), String> {
    // Validate heartbeat interval (renamed from poll_interval_ms)
    if let Some(interval) = query.heartbeat_interval {
        if interval < 250 || interval > 60000 {
            return Err("Heartbeat interval must be between 250ms and 60000ms".to_string());
        }
    }

    // Validate buffer size (renamed from limit)
    if let Some(buffer_size) = query.buffer_size {
        if buffer_size == 0 || buffer_size > 10_000 {
            return Err("Buffer size must be between 1 and 10,000 for streaming".to_string());
        }
    }

    // Validate severity
    if let Some(severity) = &query.severity {
        if !is_valid_severity(severity) {
            return Err(format!("Invalid severity level: {}", severity));
        }
    }

    Ok(())
}

/// Validates severity level
fn is_valid_severity(severity: &str) -> bool {
    matches!(severity.to_lowercase().as_str(), "low" | "medium" | "high" | "critical" | "info" | "warning" | "error")
}

/// Validates IP address format
fn is_valid_ip(ip: &str) -> bool {
    ip.parse::<std::net::IpAddr>().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_stream_query_valid() {
        let query = EventStreamQuery {
            source: Some("test-source".to_string()),
            severity: Some("high".to_string()),
            security_event: Some(true),
            buffer_size: Some(100),
            heartbeat_interval: Some(1000),
        };

        assert!(validate_stream_query(&query).is_ok());
    }

    #[test]
    fn test_validate_stream_query_invalid_heartbeat_interval() {
        let query = EventStreamQuery {
            source: None,
            severity: None,
            security_event: None,
            buffer_size: None,
            heartbeat_interval: Some(100), // Too low
        };

        assert!(validate_stream_query(&query).is_err());
    }

    #[test]
    fn test_validate_stream_query_invalid_buffer_size() {
        let query = EventStreamQuery {
            source: None,
            severity: None,
            security_event: None,
            buffer_size: Some(20_000), // Too high for streaming
            heartbeat_interval: None,
        };

        assert!(validate_stream_query(&query).is_err());
    }

    #[test]
    fn test_is_valid_severity() {
        assert!(is_valid_severity("low"));
        assert!(is_valid_severity("HIGH"));
        assert!(is_valid_severity("Critical"));
        assert!(is_valid_severity("info"));
        assert!(!is_valid_severity("invalid"));
    }

    #[test]
    fn test_is_valid_ip() {
        assert!(is_valid_ip("192.168.1.1"));
        assert!(is_valid_ip("::1"));
        assert!(!is_valid_ip("invalid-ip"));
    }
}