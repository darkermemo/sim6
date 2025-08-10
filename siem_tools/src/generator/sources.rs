use rand::{rngs::StdRng, Rng, SeedableRng};
use serde_json::json;

#[derive(Clone, Debug)]
pub enum SourceKind {
    CloudTrail,
    CiscoAsa,
    OktaSystemLog,
    WindowsSecurity,
    ZeekConn,
    ZeekDns,
    ZeekHttp,
    PanOs,
    Fortigate,
    OtelLogs,
}

impl SourceKind {
    pub fn parse(name: &str) -> Option<Self> {
        match name.to_ascii_lowercase().as_str() {
            "cloudtrail" => Some(Self::CloudTrail),
            "cisco_asa" | "asa" => Some(Self::CiscoAsa),
            "okta_system_log" | "okta" => Some(Self::OktaSystemLog),
            "windows_security" | "winsec" => Some(Self::WindowsSecurity),
            "zeek_conn" => Some(Self::ZeekConn),
            "zeek_dns" => Some(Self::ZeekDns),
            "zeek_http" => Some(Self::ZeekHttp),
            "pan_os" | "panos" => Some(Self::PanOs),
            "fortigate" => Some(Self::Fortigate),
            "otel_logs" | "otel" => Some(Self::OtelLogs),
            _ => None,
        }
    }
}

pub struct VendorRecord {
    pub raw: String,
    pub uem: serde_json::Value,
}

pub fn generate_records(source: SourceKind, seed: u64, count: usize) -> Vec<VendorRecord> {
    let mut rng = StdRng::seed_from_u64(seed);
    (0..count).map(|i| match source {
        SourceKind::CloudTrail => gen_cloudtrail(&mut rng, i),
        SourceKind::CiscoAsa => gen_cisco_asa(&mut rng, i),
        SourceKind::OktaSystemLog => gen_okta(&mut rng, i),
        SourceKind::WindowsSecurity => gen_winsec(&mut rng, i),
        SourceKind::ZeekConn => gen_zeek_conn(&mut rng, i),
        SourceKind::ZeekDns => gen_zeek_dns(&mut rng, i),
        SourceKind::ZeekHttp => gen_zeek_http(&mut rng, i),
        SourceKind::PanOs => gen_panos(&mut rng, i),
        SourceKind::Fortigate => gen_fortigate(&mut rng, i),
        SourceKind::OtelLogs => gen_otel(&mut rng, i),
    }).collect()
}

fn pick<'a>(rng: &mut StdRng, arr: &'a [&str]) -> &'a str { let idx = rng.gen_range(0..arr.len()); arr[idx] }
fn ip4(rng: &mut StdRng) -> String { format!("{}.{}.{}.{}", rng.gen_range(1..=223), rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254)) }

fn gen_cloudtrail(rng: &mut StdRng, _i: usize) -> VendorRecord {
    let user = pick(rng, &["alice","bob","carol","dave"]);
    let src_ip = ip4(rng);
    let event_name = pick(rng, &["ConsoleLogin","GetObject","DescribeInstances"]);
    let raw = json!({
        "eventVersion":"1.08",
        "eventName": event_name,
        "awsRegion":"us-east-1",
        "sourceIPAddress": src_ip,
        "userIdentity": {"type":"IAMUser","userName": user}
    }).to_string();
    let uem = json!({
        "tenant_id":"default","event_timestamp": (chrono::Utc::now().timestamp() as u32),
        "event_category":"cloud","event_action": event_name,
        "source_ip": src_ip, "user_name": user, "source_type":"cloudtrail",
        "severity":"INFO", "message": format!("{} from {}", event_name, user)
    });
    VendorRecord { raw, uem }
}

fn gen_cisco_asa(rng: &mut StdRng, _i: usize) -> VendorRecord {
    let code = pick(rng, &["%ASA-6-302013","%ASA-6-302014","%ASA-4-313005"]);
    let src = ip4(rng); let dst = ip4(rng);
    let raw = format!("{}: Built outbound TCP connection for {} to {}", code, src, dst);
    let uem = json!({"tenant_id":"default","event_timestamp": (chrono::Utc::now().timestamp() as u32),
        "event_category":"network","event_action":"connection","source_ip": src,"destination_ip": dst,
        "source_type":"cisco_asa","severity":"INFO","message": raw});
    VendorRecord { raw, uem }
}

fn gen_okta(rng: &mut StdRng, _i: usize) -> VendorRecord {
    let user = pick(rng, &["alice","bob","carol"]);
    let outcome = pick(rng, &["SUCCESS","FAILURE"]);
    let raw = json!({"eventType":"user.session.start","actor":{"displayName": user},"outcome":{"result": outcome}}).to_string();
    let uem = json!({"tenant_id":"default","event_timestamp": (chrono::Utc::now().timestamp() as u32),
        "event_category":"auth","event_action":"login","event_outcome": outcome,
        "user_name": user, "source_type":"okta_system_log","severity":"INFO","message": format!("okta {} {}", user, outcome)});
    VendorRecord { raw, uem }
}

fn gen_winsec(rng: &mut StdRng, _i: usize) -> VendorRecord {
    let eid = pick(rng, &["4624","4625"]);
    let user = pick(rng, &["alice","bob"]); let outcome = if eid=="4624" {"SUCCESS"} else {"FAILURE"};
    let raw = json!({"EventID": eid, "TargetUserName": user}).to_string();
    let uem = json!({"tenant_id":"default","event_timestamp": (chrono::Utc::now().timestamp() as u32),
        "event_category":"auth","event_action":"windows_login","event_outcome": outcome,
        "user_name": user, "source_type":"windows_security","severity":"INFO","message": format!("win {} {}", user, outcome)});
    VendorRecord { raw, uem }
}

fn gen_zeek_conn(rng: &mut StdRng, _i: usize) -> VendorRecord {
    let src=ip4(rng); let dst=ip4(rng);
    let raw = format!("{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}", chrono::Utc::now().timestamp(), src, 443, dst, 51515, "tcp", "S1", 200);
    let uem = json!({"tenant_id":"default","event_timestamp": (chrono::Utc::now().timestamp() as u32),
        "event_category":"network","event_action":"zeek_conn","source_ip": src, "destination_ip": dst, "source_type":"zeek_conn","severity":"INFO","message": raw});
    VendorRecord { raw, uem }
}
fn gen_zeek_dns(rng: &mut StdRng, _i: usize) -> VendorRecord {
    let name = pick(rng, &["example.com","okta.com","aws.amazon.com"]);
    let raw = format!("{}\t{}\tA\tNOERROR", chrono::Utc::now().timestamp(), name);
    let uem = json!({"tenant_id":"default","event_timestamp": (chrono::Utc::now().timestamp() as u32),
        "event_category":"network","event_action":"zeek_dns","source_type":"zeek_dns","severity":"INFO","message": raw, "dns_query": name});
    VendorRecord { raw, uem }
}
fn gen_zeek_http(rng: &mut StdRng, _i: usize) -> VendorRecord {
    let host = pick(rng, &["example.com","portal.local"]);
    let raw = format!("{}\tGET\t/\t{}\t200", chrono::Utc::now().timestamp(), host);
    let uem = json!({"tenant_id":"default","event_timestamp": (chrono::Utc::now().timestamp() as u32),
        "event_category":"network","event_action":"zeek_http","source_type":"zeek_http","severity":"INFO","message": raw, "http_host": host});
    VendorRecord { raw, uem }
}

fn gen_panos(rng: &mut StdRng, _i: usize) -> VendorRecord {
    let src=ip4(rng); let dst=ip4(rng);
    let raw = format!("PAN-OS,TRAFFIC,{},{}", src, dst);
    let uem = json!({"tenant_id":"default","event_timestamp": (chrono::Utc::now().timestamp() as u32),
        "event_category":"network","event_action":"pan_traffic","source_ip": src,"destination_ip": dst,"source_type":"pan_os","severity":"INFO","message": raw});
    VendorRecord { raw, uem }
}
fn gen_fortigate(rng: &mut StdRng, _i: usize) -> VendorRecord {
    let src=ip4(rng); let dst=ip4(rng);
    let raw = format!("date= action=pass src={} dst={}", src, dst);
    let uem = json!({"tenant_id":"default","event_timestamp": (chrono::Utc::now().timestamp() as u32),
        "event_category":"network","event_action":"fg_event","source_ip": src,"destination_ip": dst,"source_type":"fortigate","severity":"INFO","message": raw});
    VendorRecord { raw, uem }
}
fn gen_otel(rng: &mut StdRng, _i: usize) -> VendorRecord {
    let sev = pick(rng, &["INFO","WARN","ERROR"]);
    let raw = json!({"resource": {"service.name": "app"}, "severityText": sev, "body": {"msg":"hello"}}).to_string();
    let uem = json!({"tenant_id":"default","event_timestamp": (chrono::Utc::now().timestamp() as u32),
        "event_category":"app","event_action":"otel_log","source_type":"otel_logs","severity": sev, "message":"hello"});
    VendorRecord { raw, uem }
}


