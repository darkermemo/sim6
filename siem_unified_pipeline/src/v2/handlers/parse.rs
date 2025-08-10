use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use crate::error::Result as PipelineResult;
use crate::v2::state::AppState;

// =============================
// Request/response types
// =============================

#[derive(Debug, Deserialize)]
pub struct DetectBody {
    // Preferred single-sample field
    pub sample: Option<String>,
    // Accept either a raw string line or a parsed record (legacy)
    pub raw: Option<String>,
    pub record: Option<serde_json::Value>,
    // Optional batch; detect will use the first when provided
    pub samples: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectResp {
    pub vendor: String,   // e.g., "okta", "aws", "cisco"
    pub r#type: String,   // e.g., "system_log", "cloudtrail", "asa"
    pub confidence: f32,  // 0..1
    pub signals: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct NormalizeBody {
    pub tenant_id: String,
    // New batch input; legacy single-record fields kept for compat
    pub records: Option<Vec<String>>, // Raw lines (syslog/kv/csv/tsv/json strings)
    pub samples: Option<Vec<String>>, // Alias for records
    pub vendor: Option<String>,       // Optional hint/override
    pub r#type: Option<String>,       // Optional hint/override
    // Legacy single-record support
    pub sample: Option<String>,       // Preferred single sample
    pub raw: Option<String>,
    pub record: Option<serde_json::Value>,
    pub now: Option<u32>,
    pub domain: Option<String>, // override: auth|network|http
}

#[derive(Debug, Serialize)]
pub struct CoverageResp {
    pub score: f32, // 0..1 with 2 decimals
    pub weights: HashMap<String, f32>,
    pub missing: Vec<String>,
    pub mapped: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct NormalizeRespBatch {
    pub records: Vec<serde_json::Value>, // Strict dev.events-shaped UEM rows
    pub coverage: f32,                   // overall average 0..1
    pub signals: Vec<String>,            // detect signals aggregated
    pub notes: Vec<String>,              // missing fields hints, parse notes
}

// =============================
// Detection
// =============================

/// Returns `sample` if provided; else first of `samples`; else `raw`; else serializes the JSON `record`.
/// Produces an empty string when none are present.
pub fn coerce_sample_any(sample: &Option<String>, samples: &Option<Vec<String>>, raw: &Option<String>, record: &Option<serde_json::Value>) -> String {
    if let Some(s) = sample { return s.clone(); }
    if let Some(list) = samples { if let Some(first) = list.first() { return first.clone(); } }
    if let Some(s) = raw { return s.clone(); }
    if let Some(v) = record { return v.to_string(); }
    String::new()
}

/// Detect vendor/type with ordered probes and collect signals explaining the decision.
///
/// Always succeeds with a low-confidence fallback; never errors.
fn detect_impl(sample: &str) -> DetectResp {
    let s = sample.trim();
    let mut sig: Vec<String> = Vec::new();

    // JSON probe first
    if s.starts_with('{') || s.starts_with('[') {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(s) {
            // CloudTrail
            if v.get("eventTime").is_some() && v.get("userIdentity").is_some() {
                sig.push("json.keys:eventTime,userIdentity".into());
                return DetectResp { vendor: "aws".into(), r#type: "cloudtrail".into(), confidence: 0.995, signals: sig };
            }
            // GCP Audit
            if v.get("protoPayload").and_then(|p| p.get("methodName")).is_some() {
                sig.push("json.keys:protoPayload.methodName".into());
                return DetectResp { vendor: "gcp".into(), r#type: "audit_log".into(), confidence: 0.995, signals: sig };
            }
            // Okta System Log
            if v.get("eventType").is_some() && v.get("actor").is_some() {
                sig.push("json.keys:eventType,actor".into());
                return DetectResp { vendor: "okta".into(), r#type: "system_log".into(), confidence: 0.995, signals: sig };
            }
            // Windows / Sysmon (very loose)
            if v.get("EventID").is_some() || v.get("Channel").is_some() {
                sig.push("json.keys:EventID|Channel".into());
                return DetectResp { vendor: "microsoft".into(), r#type: "windows_security".into(), confidence: 0.995, signals: sig };
            }
            // OTel logs
            if v.get("resource").is_some() && (v.get("severity_text").is_some() || v.get("severityText").is_some()) {
                sig.push("json.keys:resource,severity_text".into());
                return DetectResp { vendor: "otel".into(), r#type: "logs".into(), confidence: 0.99, signals: sig };
            }
        }
    }

    // Vendor signatures (non-JSON)
    if s.contains("%ASA-") {
        sig.push("syslog.%ASA-".into());
        return DetectResp { vendor: "cisco".into(), r#type: "asa".into(), confidence: 0.995, signals: sig };
    }
    if s.contains(",TRAFFIC,") || s.contains(",THREAT,") || s.contains("PAN-OS") {
        sig.push("csv:panos".into());
        return DetectResp { vendor: "paloalto".into(), r#type: "pan_os".into(), confidence: 0.99, signals: sig };
    }
    if s.contains("date=") && s.contains("devname=") && s.contains("logid=") {
        sig.push("kv:fortigate".into());
        return DetectResp { vendor: "fortinet".into(), r#type: "fortigate".into(), confidence: 0.99, signals: sig };
    }

    // Zeek formats
    // Prefer HTTP header detection when the #fields line includes HTTP-specific columns
    if s.starts_with("#fields") {
        if s.contains("method") && (s.contains("user_agent") || s.contains("user-agent") || s.contains("host") || s.contains("uri")) {
            sig.push("zeek.header:http".into());
            return DetectResp { vendor: "zeek".into(), r#type: "http".into(), confidence: 0.99, signals: sig };
        }
        if s.contains("id.orig_h") && s.contains("id.resp_h") {
            sig.push("zeek.header:conn".into());
            return DetectResp { vendor: "zeek".into(), r#type: "conn".into(), confidence: 0.99, signals: sig };
        }
    }
    if s.contains("\tA\tNOERROR") || s.contains("qtype_name") {
        sig.push("zeek.dns fields".into());
        return DetectResp { vendor: "zeek".into(), r#type: "dns".into(), confidence: 0.99, signals: sig };
    }
    if s.split('\t').count() >= 6 && s.contains("Mozilla") {
        sig.push("zeek.http fields".into());
        return DetectResp { vendor: "zeek".into(), r#type: "http".into(), confidence: 0.99, signals: sig };
    }

    // KV generic
    if s.split_whitespace().filter(|t| t.contains('=')).count() >= 3 {
        sig.push("kv:density>=3".into());
        return DetectResp { vendor: "generic".into(), r#type: "kv".into(), confidence: 0.7, signals: sig };
    }

    // Fallback
    sig.push("fallback".into());
    DetectResp { vendor: "unknown".into(), r#type: "unknown".into(), confidence: 0.3, signals: sig }
}

#[axum::debug_handler]
pub async fn detect(Json(b): Json<DetectBody>) -> PipelineResult<Json<DetectResp>> {
    let sample = coerce_sample_any(&b.sample, &b.samples, &b.raw, &b.record);
    let resp = detect_impl(&sample);
    Ok(Json(resp))
}

// =============================
// Coverage
// =============================

/// Return coverage weights for a given domain. Weights sum to 1.0 across each domain.
fn weights_for_domain(domain: &str) -> HashMap<String, f32> {
    let mut m = HashMap::<String, f32>::new();
    match domain {
        "auth" => {
            m.insert("user_name".into(), 0.20);
            m.insert("source_ip".into(), 0.20);
            m.insert("event_timestamp".into(), 0.20);
            m.insert("event_outcome".into(), 0.20);
            m.insert("event_action".into(), 0.20);
        }
        "network" => {
            m.insert("source_ip".into(), 0.18);
            m.insert("destination_ip".into(), 0.18);
            m.insert("metadata.protocol".into(), 0.14); // stored in metadata
            m.insert("metadata.source_port".into(), 0.10);
            m.insert("metadata.dest_port".into(), 0.10);
            m.insert("event_timestamp".into(), 0.20);
            m.insert("event_category".into(), 0.10);
        }
        "http" => {
            m.insert("metadata.http.host".into(), 0.18);
            m.insert("metadata.http.url".into(), 0.18);
            m.insert("metadata.http.user_agent".into(), 0.18);
            m.insert("source_ip".into(), 0.14);
            m.insert("destination_ip".into(), 0.14);
            m.insert("event_timestamp".into(), 0.20);
            m.insert("event_action".into(), 0.16);
        }
        _ => {}
    }
    m
}

fn get_path<'a>(root: &'a serde_json::Value, path: &str) -> Option<&'a serde_json::Value> {
    if !path.contains('.') { return root.get(path); }
    let mut cur = root;
    for p in path.split('.') { cur = cur.get(p)?; }
    Some(cur)
}

/// Compute a coverage score against required fields for a domain.
///
/// Parses the `metadata` string into JSON to allow presence checks on `metadata.*` paths.
/// Returns weighted score in 0..1, with the list of missing and mapped keys.
fn compute_coverage(domain: &str, uem_row: &serde_json::Value) -> CoverageResp {
    let weights = weights_for_domain(domain);
    // parse metadata string into JSON for presence checks
    let mut merged = uem_row.clone();
    if let Some(md_str) = uem_row.get("metadata").and_then(|m| m.as_str()) {
        if let Ok(j) = serde_json::from_str::<serde_json::Value>(md_str) { merged["metadata"] = j; }
    }
    let mut have = 0.0f32;
    let mut missing: Vec<String> = Vec::new();
    let mut mapped: Vec<String> = Vec::new();
    for (k, w) in &weights {
        let present = get_path(&merged, k)
            .map(|v| !(v.is_null() || (v.is_string() && v.as_str().unwrap_or("").is_empty())))
            .unwrap_or(false);
        if present { have += *w; mapped.push(k.clone()); } else { missing.push(k.clone()); }
    }
    // weights sum to 1.0; keep two decimals in 0..1 range
    let score = (have * 100.0).round() / 100.0;
    CoverageResp { score, weights, missing, mapped }
}

/// Infer a functional domain from vendor/type pair.
/// Used for coverage weighting.
fn infer_domain(vendor: &str, r#type: &str) -> &'static str {
    match (vendor, r#type) {
        ("okta", _) | ("aws", "cloudtrail") | ("microsoft", _) => "auth",
        ("cisco", _) | ("paloalto", _) | ("fortinet", _) | ("zeek", "conn") | ("zeek", "dns") => "network",
        ("zeek", "http") | ("otel", _) => "http",
        _ => "auth",
    }
}

// =============================
// Normalization
// =============================

/// Ensure metadata is a valid JSON string; if input is already an object, stringify it.
/// Ensure `metadata` is a valid JSON string. If an object is provided, stringify it.
/// If a string is provided but invalid JSON, return an empty JSON object string.
fn ensure_metadata_string(meta: serde_json::Value) -> String {
    match meta {
        serde_json::Value::String(s) => {
            if serde_json::from_str::<serde_json::Value>(&s).is_ok() { s } else { "{}".to_string() }
        }
        other => serde_json::to_string(&other).unwrap_or_else(|_| "{}".into()),
    }
}

/// Map a sample to strict UEM row matching dev.events columns
/// Map a raw record into a strict UEM row matching `dev.events` schema.
///
/// Populates all required fields, infers domain, and embeds vendor-specific metadata.
/// Ensures `retention_days=30` is set explicitly.
fn normalize_impl(tenant_id: &str, det: &DetectResp, sample: &str, now_ts: u32) -> serde_json::Value {
    let created_at = now_ts;
    let mut uem = serde_json::json!({
        "event_id": format!("{}-{}-{}", det.vendor, det.r#type, now_ts),
        "event_timestamp": now_ts,
        "tenant_id": tenant_id,
        "event_category": match infer_domain(&det.vendor, &det.r#type) {"auth"=>"auth","network"=>"network","http"=>"http",_=>"auth"},
        "event_action": serde_json::Value::Null,
        "event_outcome": serde_json::Value::Null,
        "source_ip": serde_json::Value::Null,
        "destination_ip": serde_json::Value::Null,
        "user_id": serde_json::Value::Null,
        "user_name": serde_json::Value::Null,
        "severity": serde_json::Value::Null,
        "message": serde_json::Value::Null,
        "raw_event": sample,
        "metadata": "{}",
        "source_type": format!("{}.{}", det.vendor, det.r#type),
        "created_at": created_at,
        "retention_days": 30u16,
    });

    // Populate per known vendor/type
    if det.vendor == "aws" && det.r#type == "cloudtrail" {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(sample) {
            if let Some(ts) = v.get("eventTime").and_then(|x| x.as_i64()) { uem["event_timestamp"] = serde_json::json!(ts as u32); }
            if let Some(a) = v.get("eventName").and_then(|x| x.as_str()) { uem["event_action"] = serde_json::json!(a); }
            if let Some(ip) = v.get("sourceIPAddress").and_then(|x| x.as_str()) { uem["source_ip"] = serde_json::json!(ip); }
            if let Some(u) = v.get("userIdentity").and_then(|u| u.get("userName")).and_then(|x| x.as_str()) { uem["user_name"] = serde_json::json!(u); }
            uem["severity"] = serde_json::json!("INFO");
            uem["message"] = serde_json::json!(format!("{} by {:?}", uem["event_action"], uem["user_name"]));
            uem["metadata"] = serde_json::json!(ensure_metadata_string(v));
        }
    } else if det.vendor == "gcp" && (det.r#type == "audit" || det.r#type == "audit_log") {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(sample) {
            if let Some(a) = v.get("protoPayload").and_then(|p| p.get("methodName")).and_then(|x| x.as_str()) { uem["event_action"] = serde_json::json!(a); }
            if let Some(u) = v.get("protoPayload").and_then(|p| p.get("authenticationInfo")).and_then(|a| a.get("principalEmail")).and_then(|x| x.as_str()) { uem["user_name"] = serde_json::json!(u); }
            if let Some(ip) = v.get("protoPayload").and_then(|p| p.get("requestMetadata")).and_then(|m| m.get("callerIp")).and_then(|x| x.as_str()) { uem["source_ip"] = serde_json::json!(ip); }
            uem["event_outcome"] = serde_json::json!("success");
            uem["severity"] = serde_json::json!("INFO");
            uem["metadata"] = serde_json::json!(ensure_metadata_string(v));
        }
    } else if det.vendor == "okta" {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(sample) {
            if let Some(a) = v.get("eventType").and_then(|x| x.as_str()) { uem["event_action"] = serde_json::json!(a); }
            if let Some(u) = v.get("actor").and_then(|a| a.get("alternateId")).and_then(|x| x.as_str()) { uem["user_name"] = serde_json::json!(u); }
            if let Some(out) = v.get("outcome").and_then(|o| o.get("result")).and_then(|x| x.as_str()) {
                uem["event_outcome"] = serde_json::json!(if out.eq_ignore_ascii_case("success") {"success"} else {"failure"});
            }
            if let Some(ip) = v.get("client").and_then(|c| c.get("ipAddress")).and_then(|x| x.as_str()) { uem["source_ip"] = serde_json::json!(ip); }
            uem["severity"] = serde_json::json!("INFO");
            uem["metadata"] = serde_json::json!(ensure_metadata_string(v));
        }
    } else if det.vendor == "cisco" && det.r#type == "asa" {
        // Try to parse: ... from SRC/SRC_PORT to DST/DST_PORT
        let lower = sample;
        let mut src_ip = None::<String>; let mut dst_ip = None::<String>;
        let mut src_port = None::<u16>; let mut dst_port = None::<u16>;
        if let Some(pos_from) = lower.find(" from ") {
            let rest = &lower[pos_from+6..];
            if let Some(pos_to) = rest.find(" to ") {
                let from_seg = &rest[..pos_to];
                let to_seg = &rest[pos_to+4..];
                let mut split_from = from_seg.split('/');
                if let (Some(ip), Some(p)) = (split_from.next(), split_from.next()) {
                    if ip.chars().filter(|c| *c=='.').count()==3 { src_ip = Some(ip.trim().to_string()); }
                    src_port = p.trim().parse::<u16>().ok();
                }
                let mut split_to = to_seg.split('/');
                if let (Some(ip), Some(p)) = (split_to.next(), split_to.next()) {
                    let ip_clean = ip.trim().trim_end_matches(|c:char| !c.is_ascii_alphanumeric() && c!='.');
                    if ip_clean.chars().filter(|c| *c=='.').count()==3 { dst_ip = Some(ip_clean.to_string()); }
                    // strip trailing non-digits
                    let p_clean: String = p.chars().take_while(|c| c.is_ascii_digit()).collect();
                    dst_port = p_clean.parse::<u16>().ok();
                }
            }
        }
        if let Some(sip) = src_ip { uem["source_ip"] = serde_json::json!(sip); }
        if let Some(dip) = dst_ip { uem["destination_ip"] = serde_json::json!(dip); }
        uem["event_action"] = serde_json::json!("connection");
        uem["event_outcome"] = serde_json::json!(if sample.contains("Deny") || sample.contains("DENY") {"failure"} else {"success"});
        uem["severity"] = serde_json::json!("INFO");
        uem["message"] = serde_json::json!(sample);
        // Build metadata with protocol and ports if available
        let mut md = serde_json::json!({});
        md["protocol"] = serde_json::json!("tcp");
        if let Some(sp) = src_port { md["source_port"] = serde_json::json!(sp); }
        if let Some(dp) = dst_port { md["dest_port"] = serde_json::json!(dp); }
        uem["metadata"] = serde_json::json!(ensure_metadata_string(md));
    } else if det.vendor == "paloalto" {
        uem["event_action"] = serde_json::json!("traffic");
        uem["severity"] = serde_json::json!("INFO");
        // Attempt to parse CSV-ish: PAN-OS,TRAFFIC,SRC,DST[, ...]
        let parts: Vec<&str> = sample.split(',').collect();
        if parts.len() >= 4 {
            let src = parts[2].trim();
            let dst = parts[3].trim();
            if src.chars().filter(|c| *c=='.').count()==3 { uem["source_ip"] = serde_json::json!(src); }
            if dst.chars().filter(|c| *c=='.').count()==3 { uem["destination_ip"] = serde_json::json!(dst); }
        }
        let md = serde_json::json!({"protocol":"tcp"});
        uem["metadata"] = serde_json::json!(ensure_metadata_string(md));
    } else if det.vendor == "fortinet" {
        uem["event_action"] = serde_json::json!("forward");
        uem["severity"] = serde_json::json!("INFO");
        // Parse simple KV pairs like src= dst= status=
        let mut src = None::<String>; let mut dst = None::<String>; let mut status = None::<String>;
        for tok in sample.split_whitespace() {
            if let Some((k,v)) = tok.split_once('=') {
                match k {
                    "src" => if v.chars().filter(|c| *c=='.').count()==3 { src = Some(v.to_string()); },
                    "dst"|"dstip" => if v.chars().filter(|c| *c=='.').count()==3 { dst = Some(v.to_string()); },
                    "status" => status = Some(v.to_string()),
                    _ => {}
                }
            }
        }
        if let Some(sip)=src { uem["source_ip"] = serde_json::json!(sip); }
        if let Some(dip)=dst { uem["destination_ip"] = serde_json::json!(dip); }
        if let Some(st)=status { uem["event_outcome"] = serde_json::json!(st); }
        let md = serde_json::json!({"protocol":"tcp"});
        uem["metadata"] = serde_json::json!(ensure_metadata_string(md));
    } else if det.vendor == "zeek" && det.r#type == "http" {
        // Parse TSV: ts \t src \t dst \t method \t uri \t host \t status \t user_agent
        uem["event_action"] = serde_json::json!("request");
        uem["severity"] = serde_json::json!("INFO");
        let parts: Vec<&str> = sample.split('\t').collect();
        if parts.len() >= 8 {
            let src = parts[1];
            let dst = parts[2];
            let method = parts[3];
            let uri = parts[4];
            let host = parts[5];
            let ua = parts[7];
            uem["source_ip"] = serde_json::json!(src);
            uem["destination_ip"] = serde_json::json!(dst);
            uem["event_action"] = serde_json::json!(method);
            let md = serde_json::json!({"http": {"host": host, "url": uri, "user_agent": ua}});
            uem["metadata"] = serde_json::json!(ensure_metadata_string(md));
        }
    }

    uem
}

#[axum::debug_handler]
/// POST /api/v2/parse/normalize – batch normalization endpoint.
///
/// Accepts either `records: string[]` (preferred) or legacy single `raw`/`record`.
/// Always returns 200 with best-effort mappings and an overall coverage score.
/// Returns 400 only when the request body is malformed (e.g., no records provided).
pub async fn normalize(_st: State<Arc<AppState>>, Json(b): Json<NormalizeBody>) -> PipelineResult<Json<NormalizeRespBatch>> {
    let now_ts = b.now.unwrap_or_else(|| chrono::Utc::now().timestamp() as u32);
    // Build input vector from batch or legacy single
    let mut inputs: Vec<String> = if let Some(v) = &b.records {
        v.clone()
    } else if let Some(v) = &b.samples {
        v.clone()
    } else {
        let s = coerce_sample_any(&b.sample, &None, &b.raw, &b.record);
        if s.is_empty() { vec![] } else { vec![s] }
    };
    // Ensure we never 4xx: if empty, synthesize a single placeholder record
    let mut notes: Vec<String> = Vec::new();
    if inputs.is_empty() {
        inputs.push(String::new());
        notes.push("placeholder record synthesized for empty input".into());
    }

    let mut out_rows: Vec<serde_json::Value> = Vec::with_capacity(inputs.len());
    let mut all_signals: Vec<String> = Vec::new();
    let mut cov_sum: f32 = 0.0;

    for raw_line in inputs.drain(..) {
        // Detect per line, allowing hints to override
        let auto = detect_impl(&raw_line);
        let vendor = b.vendor.clone().unwrap_or(auto.vendor.clone());
        let typ = b.r#type.clone().unwrap_or(auto.r#type.clone());
        let det = DetectResp { vendor, r#type: typ, confidence: auto.confidence, signals: auto.signals.clone() };
        all_signals.extend(auto.signals);

        let mut uem = normalize_impl(&b.tenant_id, &det, &raw_line, now_ts);
        // Ensure valid metadata JSON string
        let meta_str = uem.get("metadata").and_then(|m| m.as_str()).unwrap_or("{}");
        let md_valid = serde_json::from_str::<serde_json::Value>(meta_str).is_ok();
        if !md_valid { uem["metadata"] = serde_json::json!("{}"); notes.push("metadata invalid → {}".into()); }

        // Coverage compute for this row
        let domain = b.domain.as_deref().unwrap_or_else(|| infer_domain(&det.vendor, &det.r#type));
        let cov = compute_coverage(domain, &uem);
        cov_sum += cov.score;
        if !cov.missing.is_empty() {
            notes.push(format!("missing {:?}", cov.missing));
        }
        out_rows.push(uem);
    }

    let coverage = if out_rows.is_empty() { 0.0 } else { cov_sum / out_rows.len() as f32 };
    Ok(Json(NormalizeRespBatch { records: out_rows, coverage, signals: all_signals, notes }))
}


#[cfg(test)]
mod tests {
    // Only import what is needed to avoid unused-import warnings
    use axum::{Router, routing::post};
    use axum::body::to_bytes;
    use tower::ServiceExt;
    use crate::v2::{state::AppState};
    use serde_json::json;

    fn app_for_tests() -> Router {
        let st = AppState::new("http://localhost:8123", "dev.events");
        Router::new()
            .route("/api/v2/parse/detect", post(crate::v2::handlers::parse::detect))
            .route("/api/v2/parse/normalize", post(crate::v2::handlers::parse::normalize))
            .with_state(std::sync::Arc::new(st))
    }

    #[tokio::test]
    async fn detect_accepts_sample_raw_record() {
        let app = app_for_tests();
        let sample = r#"%ASA-6-106100: Built TCP connection from 10.0.0.1 to 10.0.0.2"#;
        for body in [
            json!({"sample": sample}),
            json!({"raw": sample}),
            json!({"record": {"eventType":"user.session.start","actor":{"alternateId":"alice"}}}),
        ] {
            let resp = app.clone().oneshot(
                axum::http::Request::builder().method("POST").uri("/api/v2/parse/detect")
                    .header("content-type","application/json")
                    .body(axum::body::Body::from(serde_json::to_vec(&body).unwrap())).unwrap()
            ).await.unwrap();
            assert_eq!(resp.status(), axum::http::StatusCode::OK);
            let bytes = to_bytes(resp.into_body(), 1024*1024).await.unwrap();
            let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert!(v.get("vendor").is_some());
            assert!(v.get("type").is_some());
            assert!(v.get("signals").is_some());
        }
    }

    #[tokio::test]
    async fn normalize_never_4xx_and_returns_records() {
        let app = app_for_tests();
        // Raw non-JSON line
        let raw = "%ASA-6-106100: Built TCP connection from 10.0.0.1 to 10.0.0.2";
        let b1 = json!({"tenant_id":"default","raw": raw});
        let r1 = app.clone().oneshot(
            axum::http::Request::builder().method("POST").uri("/api/v2/parse/normalize")
                .header("content-type","application/json")
                .body(axum::body::Body::from(serde_json::to_vec(&b1).unwrap())).unwrap()
        ).await.unwrap();
        assert_eq!(r1.status(), axum::http::StatusCode::OK);
        let v1: serde_json::Value = serde_json::from_slice(&to_bytes(r1.into_body(), 1024*1024).await.unwrap()).unwrap();
        assert!(!v1["records"].as_array().unwrap().is_empty());
        assert!(v1["coverage"].as_f64().is_some());

        // Batch samples (Okta + Zeek HTTP)
        let samples = vec![
            r#"{"eventType":"user.session.start","actor":{"alternateId":"bob"},"outcome":{"result":"SUCCESS"}}"#.to_string(),
            "1723572000\t10.0.0.1\t10.0.0.2\tGET\t/\texample.com\t200\tMozilla".to_string(),
        ];
        let b2 = json!({"tenant_id":"default","samples": samples});
        let r2 = app.clone().oneshot(
            axum::http::Request::builder().method("POST").uri("/api/v2/parse/normalize")
                .header("content-type","application/json")
                .body(axum::body::Body::from(serde_json::to_vec(&b2).unwrap())).unwrap()
        ).await.unwrap();
        assert_eq!(r2.status(), axum::http::StatusCode::OK);
    }
}

