use once_cell::sync::Lazy;
use prometheus::{Encoder, IntCounterVec, HistogramVec, Opts, HistogramOpts, TextEncoder, Registry, GaugeVec, IntGaugeVec};
use std::env;

static REGISTRY: Lazy<Registry> = Lazy::new(Registry::new);

static COMPILE_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_v2_compile_total", "Compile attempts by source and outcome"),
        &["source", "outcome"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static SEARCH_SECS: Lazy<HistogramVec> = Lazy::new(|| {
    let h = HistogramVec::new(
        HistogramOpts::new("siem_v2_search_execute_seconds", "Search endpoint latency seconds"),
        &["endpoint"],
    ).unwrap();
    REGISTRY.register(Box::new(h.clone())).ok();
    h
});

static SEARCH_COMPILE_SECS: Lazy<HistogramVec> = Lazy::new(|| {
    let h = HistogramVec::new(
        HistogramOpts::new("siem_search_compile_seconds", "Search compile latency seconds"),
        &["endpoint"],
    ).unwrap();
    REGISTRY.register(Box::new(h.clone())).ok();
    h
});

static RULES_RUN_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_v2_rules_run_total", "Rules executed by rule and tenant with outcome"),
        &["rule", "tenant", "outcome", "error_reason", "run_id"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static ALERTS_WRITTEN_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_v2_alerts_written_total", "Alerts written by rule and tenant"),
        &["rule", "tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static SCHEDULER_SECS: Lazy<HistogramVec> = Lazy::new(|| {
    let h = HistogramVec::new(
        HistogramOpts::new("siem_v2_scheduler_tick_seconds", "Scheduler per-rule execution duration"),
        &["rule"],
    ).unwrap();
    REGISTRY.register(Box::new(h.clone())).ok();
    h
});

static SCHEDULER_WINDOWS_BEHIND: Lazy<IntGaugeVec> = Lazy::new(|| {
    let g = IntGaugeVec::new(
        Opts::new("siem_scheduler_windows_behind", "Scheduler pending windows by rule/tenant"),
        &["rule", "tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(g.clone())).ok();
    g
});

static SCHEDULER_LEASE_CONFLICTS: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_scheduler_lease_conflicts_total", "Conflicts acquiring distributed scheduler leases"),
        &["rule", "tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static STREAM_EVENTS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_v2_stream_events_total", "Streaming events by outcome"),
        &["outcome"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static STREAM_MATCHES_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_v2_stream_matches_total", "Stream rule matches by rule/tenant"),
        &["rule","tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static STREAM_LAG_MS: Lazy<IntGaugeVec> = Lazy::new(|| {
    let g = IntGaugeVec::new(
        Opts::new("siem_v2_stream_lag_ms", "Observed stream lag in milliseconds by tenant"),
        &["tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(g.clone())).ok();
    g
});

// Acks emitted by runner after successful write
static STREAM_ACK_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_v2_stream_ack_total", "Stream acks by tenant"),
        &["tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

// Evaluation errors while processing stream entries
static STREAM_EVAL_ERRORS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_v2_stream_eval_errors_total", "Stream evaluation errors by rule/tenant"),
        &["rule","tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

// Backpressure events when enqueue is paused due to large stream size
static STREAM_BACKPRESSURE_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_v2_stream_backpressure_total", "Backpressure signals by tenant"),
        &["tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static STREAM_EVAL_SECS: Lazy<HistogramVec> = Lazy::new(|| {
    let h = HistogramVec::new(
        HistogramOpts::new("siem_v2_stream_eval_seconds", "Per-rule streaming eval duration seconds"),
        &["rule"],
    ).unwrap();
    REGISTRY.register(Box::new(h.clone())).ok();
    h
});

static INGEST_RL_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_ingest_rate_limited_total", "Ingest requests throttled by tenant/source"),
        &["tenant", "source_type"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static INGEST_RECORDS_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_ingest_records_total", "Total records ingested by tenant/source"),
        &["tenant", "source_type"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static INGEST_EPS_GAUGE: Lazy<GaugeVec> = Lazy::new(|| {
    let g = GaugeVec::new(
        Opts::new("siem_ingest_eps", "Observed ingest rate per request (records/second) by tenant/source"),
        &["tenant", "source_type"],
    ).unwrap();
    REGISTRY.register(Box::new(g.clone())).ok();
    g
});

static RETENTION_DAYS_GAUGE: Lazy<GaugeVec> = Lazy::new(|| {
    let g = GaugeVec::new(
        Opts::new("siem_retention_days_current", "Current retention days configured per tenant"),
        &["tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(g.clone())).ok();
    g
});

static INGEST_BYTES_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_ingest_bytes_total", "Total bytes ingested by path (api|ch)"),
        &["path"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static EPS_THROTTLES_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_eps_throttles_total", "Total EPS throttle occurrences per tenant"),
        &["tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static V2_INGEST_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_v2_ingest_total", "Ingest outcomes per tenant"),
        &["tenant","outcome"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static V2_RATE_LIMIT_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_v2_rate_limit_total", "HTTP 429 rate-limit responses per tenant"),
        &["tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

static V2_STREAM_ENQUEUE_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    let c = IntCounterVec::new(
        Opts::new("siem_v2_stream_enqueue_total", "Events enqueued to Redis stream per tenant"),
        &["tenant"],
    ).unwrap();
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

pub fn init() {
    Lazy::force(&COMPILE_TOTAL);
    Lazy::force(&SEARCH_SECS);
    Lazy::force(&SEARCH_COMPILE_SECS);
    Lazy::force(&RULES_RUN_TOTAL);
    Lazy::force(&ALERTS_WRITTEN_TOTAL);
    Lazy::force(&SCHEDULER_SECS);
    Lazy::force(&SCHEDULER_WINDOWS_BEHIND);
    Lazy::force(&SCHEDULER_LEASE_CONFLICTS);
    Lazy::force(&STREAM_EVENTS_TOTAL);
    Lazy::force(&STREAM_EVAL_SECS);
    Lazy::force(&INGEST_RL_TOTAL);
    Lazy::force(&INGEST_RECORDS_TOTAL);
    Lazy::force(&INGEST_EPS_GAUGE);
    Lazy::force(&RETENTION_DAYS_GAUGE);
    Lazy::force(&INGEST_BYTES_TOTAL);
    Lazy::force(&EPS_THROTTLES_TOTAL);
    Lazy::force(&STREAM_MATCHES_TOTAL);
    Lazy::force(&STREAM_LAG_MS);
    Lazy::force(&STREAM_ACK_TOTAL);
    Lazy::force(&STREAM_EVAL_ERRORS_TOTAL);
    Lazy::force(&STREAM_BACKPRESSURE_TOTAL);
    Lazy::force(&V2_INGEST_TOTAL);
    Lazy::force(&V2_RATE_LIMIT_TOTAL);
    Lazy::force(&V2_STREAM_ENQUEUE_TOTAL);
}

pub fn rule_lbl(rule_id: &str) -> String {
    let h = blake3::hash(rule_id.as_bytes());
    format!("{:08}", u32::from_le_bytes(h.as_bytes()[0..4].try_into().unwrap()))
}

fn run_id_label() -> String {
    env::var("RUN_ID").unwrap_or_else(|_| "-".to_string())
}

pub fn inc_compile(source: &str, outcome: &str) {
    COMPILE_TOTAL.with_label_values(&[source, outcome]).inc();
}

pub fn obs_search(endpoint: &str, secs: f64) {
    SEARCH_SECS.with_label_values(&[endpoint]).observe(secs);
}

pub fn obs_search_compile(endpoint: &str, secs: f64) {
    SEARCH_COMPILE_SECS.with_label_values(&[endpoint]).observe(secs);
}

pub fn inc_rules_run(rule_id: &str, tenant: &str, outcome: &str, error_reason: &str) {
    RULES_RUN_TOTAL
        .with_label_values(&[&rule_lbl(rule_id), tenant, outcome, if error_reason.is_empty() { "-" } else { error_reason }, &run_id_label()])
        .inc();
}

pub fn inc_ingest_rate_limited(tenant: &str, source_type: &str) {
    INGEST_RL_TOTAL.with_label_values(&[tenant, source_type]).inc();
}

pub fn inc_ingest_records(tenant: &str, source_type: &str, n: u64) {
    INGEST_RECORDS_TOTAL.with_label_values(&[tenant, source_type]).inc_by(n);
}

pub fn set_ingest_eps(tenant: &str, source_type: &str, eps: f64) {
    INGEST_EPS_GAUGE.with_label_values(&[tenant, source_type]).set(eps);
}

pub fn set_retention_days(tenant: &str, days: u16) {
    RETENTION_DAYS_GAUGE.with_label_values(&[tenant]).set(days as f64);
}

pub fn inc_alerts(rule_id: &str, tenant: &str, n: u64) {
    let _run_id = env::var("RUN_ID").unwrap_or_else(|_| "-".to_string());
    ALERTS_WRITTEN_TOTAL
        .with_label_values(&[&rule_lbl(rule_id), tenant])
        .inc_by(n);
    // Note: ALERTS_WRITTEN_TOTAL remains without error_reason/run_id for cardinality stability; RUN_ID can be joined via rules_run_total
}

pub fn inc_ingest_bytes(path: &str, bytes: u64) {
    INGEST_BYTES_TOTAL.with_label_values(&[path]).inc_by(bytes);
}

pub fn inc_eps_throttles(tenant: &str) {
    EPS_THROTTLES_TOTAL.with_label_values(&[tenant]).inc();
}

/// Build common labels for rule metrics. Pulls RUN_ID from env if present.
/// Keep order stable to match metric registration.
pub fn rule_metric_labels(rule_id: &str, tenant: &str, outcome: &str, error_reason: &str) -> [String; 5] {
    [
        rule_lbl(rule_id),
        tenant.to_string(),
        outcome.to_string(),
        if error_reason.is_empty() { "-".to_string() } else { error_reason.to_string() },
        env::var("RUN_ID").unwrap_or_default(),
    ]
}

pub fn obs_scheduler(rule_id: &str, secs: f64) {
    SCHEDULER_SECS.with_label_values(&[&rule_lbl(rule_id)]).observe(secs);
}

pub fn set_scheduler_windows(rule_id: &str, tenant: &str, n: i64) {
    SCHEDULER_WINDOWS_BEHIND.with_label_values(&[&rule_lbl(rule_id), tenant]).set(n);
}

pub fn inc_scheduler_lease_conflict(rule_id: &str, tenant: &str) {
    SCHEDULER_LEASE_CONFLICTS.with_label_values(&[&rule_lbl(rule_id), tenant]).inc();
}

pub fn inc_stream_events(outcome: &str) {
    STREAM_EVENTS_TOTAL.with_label_values(&[outcome]).inc();
}

pub fn inc_stream_matches(rule_id: &str, tenant: &str) {
    STREAM_MATCHES_TOTAL.with_label_values(&[&rule_lbl(rule_id), tenant]).inc();
}

pub fn inc_stream_acks(tenant: &str) {
    STREAM_ACK_TOTAL.with_label_values(&[tenant]).inc();
}

pub fn inc_stream_eval_error(rule_id: &str, tenant: &str) {
    STREAM_EVAL_ERRORS_TOTAL.with_label_values(&[&rule_lbl(rule_id), tenant]).inc();
}

pub fn inc_v2_ingest(tenant: &str, outcome: &str) {
    V2_INGEST_TOTAL.with_label_values(&[tenant, outcome]).inc();
}

pub fn inc_v2_rate_limit(tenant: &str) {
    V2_RATE_LIMIT_TOTAL.with_label_values(&[tenant]).inc();
}

pub fn inc_v2_stream_enqueue(tenant: &str) {
    V2_STREAM_ENQUEUE_TOTAL.with_label_values(&[tenant]).inc();
}

pub fn set_stream_lag_ms(tenant: &str, lag_ms: i64) {
    STREAM_LAG_MS.with_label_values(&[tenant]).set(lag_ms);
}

pub fn obs_stream_eval(rule_id: &str, secs: f64) {
    STREAM_EVAL_SECS.with_label_values(&[&rule_lbl(rule_id)]).observe(secs);
}

pub fn inc_stream_backpressure(tenant: &str) {
    STREAM_BACKPRESSURE_TOTAL.with_label_values(&[tenant]).inc();
}

pub async fn metrics_text() -> (axum::http::StatusCode, String) {
    let metric_families = REGISTRY.gather();
    let mut buf = Vec::new();
    let encoder = TextEncoder::new();
    let _ = encoder.encode(&metric_families, &mut buf);
    (axum::http::StatusCode::OK, String::from_utf8_lossy(&buf).to_string())
}

#[cfg(test)]
mod tests {
    use super::rule_metric_labels;
    #[test]
    fn labels_include_run_id_and_error_reason() {
        std::env::set_var("RUN_ID", "TEST-RUN-123");
        let labels = rule_metric_labels("r1","default","ok","none");
        assert!(!labels[0].is_empty());
        assert_eq!(labels[1], "default");
        assert_eq!(labels[2], "ok");
        assert_eq!(labels[3], "none");
        assert_eq!(labels[4], "TEST-RUN-123");
        std::env::remove_var("RUN_ID");
    }
}


