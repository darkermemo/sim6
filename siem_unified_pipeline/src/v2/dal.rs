use crate::v2::{api::EventSearchQuery, models::{SiemEvent, CompactEvent}, state::AppState};
use crate::error::{PipelineError, Result};
use serde::{Serialize, Deserialize};
use clickhouse::Row;

pub struct ClickHouseRepo;

impl ClickHouseRepo {
    pub async fn search_events(state: &AppState, q: &EventSearchQuery) -> Result<Vec<SiemEvent>> {
        // Build SQL with explicit column order matching SiemEvent
        let mut conditions: Vec<String> = Vec::new();
        if let Some(src) = &q.source {
            conditions.push(format!("source_type = '{}'", src.replace('\'', "''")));
        }
        if let Some(sev) = &q.severity {
            conditions.push(format!("severity = '{}'", sev.replace('\'', "''")));
        }
        if let Some(t) = &q.tenant_id {
            conditions.push(format!("tenant_id = '{}'", t.replace('\'', "''")));
        }
        if let Some(s) = q.start_time {
            conditions.push(format!("event_timestamp >= {}", s.timestamp() as u32));
        }
        if let Some(e) = q.end_time {
            conditions.push(format!("event_timestamp <= {}", e.timestamp() as u32));
        }

        let where_clause = if conditions.is_empty() {
            String::from("1")
        } else {
            conditions.join(" AND ")
        };

        let limit = q.limit.unwrap_or(100).min(10_000);
        let offset = q.offset.unwrap_or(0);

        let sql = format!(
            "SELECT \
                event_id, event_timestamp, tenant_id, event_category, \
                event_action, event_outcome, source_ip, destination_ip, \
                user_id, user_name, severity, message, raw_event, \
                metadata, created_at, source_type \
             FROM {} \
             WHERE {} \
             ORDER BY event_timestamp DESC \
             LIMIT {} OFFSET {}",
            state.events_table, where_clause, limit, offset
        );

        tracing::debug!("search SQL: {}", sql);
        let rows: Vec<SiemEvent> = state
            .ch
            .query(&sql)
            .fetch_all()
            .await
            .map_err(|e| PipelineError::database(format!("search failed: {e}")))?;
        Ok(rows)
    }

    pub async fn search_events_compact(state: &AppState, q: &EventSearchQuery) -> Result<Vec<CompactEvent>> {
        let mut conditions: Vec<String> = Vec::new();
        if let Some(src) = &q.source { conditions.push(format!("source_type = '{}'", src.replace('\'', "''"))); }
        if let Some(sev) = &q.severity { conditions.push(format!("severity = '{}'", sev.replace('\'', "''"))); }
        if let Some(t) = &q.tenant_id { conditions.push(format!("tenant_id = '{}'", t.replace('\'', "''"))); }
        if let Some(s) = q.start_time { conditions.push(format!("event_timestamp >= {}", s.timestamp() as u32)); }
        if let Some(e) = q.end_time { conditions.push(format!("event_timestamp <= {}", e.timestamp() as u32)); }
        if let Some(qs) = &q.query {
            let s = qs.trim();
            if !s.is_empty() {
                // Simple boolean parsing: supports ' OR ' and ' AND ' (default AND for spaces)
                // Each term applies across selected text columns via positionCaseInsensitive > 0
                let cols = [
                    "message", "user_name", "user_id", "event_id", "source_type", "event_category", "event_action", "event_outcome"
                ];
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
        let where_clause = if conditions.is_empty() { String::from("1") } else { conditions.join(" AND ") };
        let limit = q.limit.unwrap_or(10_000).min(100_000);
        let offset = q.offset.unwrap_or(0);
        let sql = format!(
            "SELECT event_id, event_timestamp, tenant_id, source_type, severity, event_category, event_action, user_name, user_id, message, length(raw_event) AS raw_len FROM {} WHERE {} ORDER BY event_timestamp DESC LIMIT {} OFFSET {}",
            state.events_table, where_clause, limit, offset
        );
        tracing::debug!("search compact SQL: {}", sql);
        let rows: Vec<CompactEvent> = state.ch.query(&sql).fetch_all().await
            .map_err(|e| PipelineError::database(format!("search compact failed: {e}")))?;
        Ok(rows)
    }

    pub async fn insert_events(state: &AppState, events: &[SiemEvent]) -> Result<u64> {
        if events.is_empty() {
            return Ok(0);
        }

        // Use HTTP client to send data directly to ClickHouse
        let mut inserted = 0;
        let client = reqwest::Client::new();
        
        for event in events {
            let json = serde_json::to_string(event)
                .map_err(|e| PipelineError::database(format!("serialization failed: {e}")))?;
            
            let sql = format!("INSERT INTO {} FORMAT JSONEachRow", state.events_table);
            let url = "http://localhost:8123/";
            
            let response = client.post(url)
                .query(&[("query", sql)])
                .body(json)
                .send()
                .await
                .map_err(|e| PipelineError::database(format!("HTTP request failed: {e}")))?;
            
            if !response.status().is_success() {
                let error_text = response.text().await.unwrap_or_default();
                return Err(PipelineError::database(format!("ClickHouse insert failed: {}", error_text)));
            }
            
            inserted += 1;
        }
        
        Ok(inserted)
    }

    pub async fn ping(state: &AppState) -> Result<()> {
        state.ch.query("SELECT 1").execute().await
            .map_err(|e| PipelineError::database(format!("ping failed: {e}")))?;
        Ok(())
    }

    pub async fn fetch_alerts(state: &AppState, q: &crate::v2::handlers::alerts::AlertsQuery) -> Result<Vec<AlertRow>> {
        let mut conditions: Vec<String> = Vec::new();
        if let Some(t) = &q.tenant_id { conditions.push(format!("tenant_id = '{}'", t.replace('\'', "''"))); }
        if let Some(s) = &q.severity { conditions.push(format!("severity = '{}'", s.replace('\'', "''"))); }
        if let Some(st) = &q.status { conditions.push(format!("status = '{}'", st.replace('\'', "''"))); }
        if let Some(since) = q.since { conditions.push(format!("alert_timestamp >= {}", since)); }
        let where_clause = if conditions.is_empty() { String::from("1") } else { conditions.join(" AND ") };
        let limit = q.limit.unwrap_or(100).min(10_000);
        let offset = q.offset.unwrap_or(0);
        // Match aggregated alerts schema (v2)
        let sql = format!(
            "SELECT alert_id, tenant_id, rule_id, alert_title, alert_description, event_refs, severity, status, alert_timestamp, created_at, updated_at FROM dev.alerts WHERE {} ORDER BY alert_timestamp DESC LIMIT {} OFFSET {}",
            where_clause, limit, offset
        );
        tracing::debug!("alerts SQL: {}", sql);
        let rows: Vec<AlertRow> = state.ch.query(&sql)
            .fetch_all()
            .await
            .map_err(|e| PipelineError::database(format!("alerts fetch failed: {e}")))?;
        Ok(rows)
    }

    pub async fn insert_alerts(_state: &AppState, alerts: &[AlertRow]) -> Result<u64> {
        if alerts.is_empty() { return Ok(0); }

        let client = reqwest::Client::new();
        let sql = "INSERT INTO dev.alerts FORMAT JSONEachRow".to_string();
        let url = "http://localhost:8123/";

        for alert in alerts {
            let json = serde_json::to_string(alert)
                .map_err(|e| PipelineError::database(format!("serialization failed: {e}")))?;
            let response = client.post(url)
                .query(&[("query", sql.clone())])
                .body(json)
                .send()
                .await
                .map_err(|e| PipelineError::database(format!("HTTP request failed: {e}")))?;

            if !response.status().is_success() {
                let error_text = response.text().await.unwrap_or_default();
                return Err(PipelineError::database(format!("ClickHouse insert alerts failed: {}", error_text)));
            }
        }

        Ok(alerts.len() as u64)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct AlertRow {
    pub alert_id: String,
    pub tenant_id: String,
    pub rule_id: String,
    pub alert_title: String,
    pub alert_description: String,
    pub event_refs: String,
    pub severity: String,
    pub status: String,
    pub alert_timestamp: u32,
    pub created_at: u32,
    pub updated_at: u32,
}


