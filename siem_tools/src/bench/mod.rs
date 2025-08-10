use chrono::{Utc, TimeZone};
use rand::{rngs::StdRng, Rng, SeedableRng};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UemEvent {
    pub event_id: String,
    pub event_timestamp: u32,
    pub tenant_id: String,
    pub event_category: String,
    pub event_action: String,
    pub event_outcome: Option<String>,
    pub severity: String,
    pub source_type: String,
    pub user_name: Option<String>,
    pub source_ip: Option<String>,
    pub destination_ip: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GeneratedRecord {
    pub raw_line: String,
    pub uem: UemEvent,
}

fn deterministic_ip(rng: &mut StdRng) -> String { format!("{}.{}.{}.{}", rng.gen_range(1..=223), rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254)) }

fn base_uem(rng: &mut StdRng, source_type: &str, category: &str, action: &str, severity: &str) -> UemEvent {
    let now = Utc::now().timestamp() as u32;
    let user = format!("user{}", rng.gen_range(1000..9999));
    UemEvent { event_id: format!("evt-{}-{}", source_type, now), event_timestamp: now, tenant_id: "default".into(), event_category: category.into(), event_action: action.into(), event_outcome: Some("success".into()), severity: severity.into(), source_type: source_type.into(), user_name: Some(user), source_ip: Some(deterministic_ip(rng)), destination_ip: Some(deterministic_ip(rng)), message: Some(format!("{} {} {}", source_type, category, action)) }
}

pub fn generate(source: &str, seed: u64, count: usize) -> Vec<GeneratedRecord> {
    let mut rng = StdRng::seed_from_u64(seed);
    (0..count).map(|i| {
        match source {
            "cloudtrail" => {
                let u = base_uem(&mut rng, "cloudtrail", "cloud", "api_call", "INFO");
                let raw = format!("{{\"eventSource\":\"iam.amazonaws.com\",\"userIdentity\":{{\"userName\":\"{}\"}},\"eventName\":\"CreateUser\",\"sourceIPAddress\":\"{}\"}}", u.user_name.clone().unwrap_or_default(), u.source_ip.clone().unwrap_or_default());
                GeneratedRecord { raw_line: raw, uem: u }
            }
            "gcp_audit" => {
                let u = base_uem(&mut rng, "gcp_audit", "cloud", "audit_log", "INFO");
                let raw = format!("{{\"protoPayload\":{{\"authenticationInfo\":{{\"principalEmail\":\"{}@example.com\"}},\"methodName\":\"storage.buckets.create\"}},\"ipAddress\":\"{}\"}}", u.user_name.clone().unwrap_or_default(), u.source_ip.clone().unwrap_or_default());
                GeneratedRecord { raw_line: raw, uem: u }
            }
            "okta_system_log" => {
                let u = base_uem(&mut rng, "okta_system_log", "auth", "login", "INFO");
                let raw = format!("{{\"eventType\":\"user.session.start\",\"actor\":{{\"alternateId\":\"{}@example.com\"}},\"client\":{{\"ipAddress\":\"{}\"}}}}", u.user_name.clone().unwrap_or_default(), u.source_ip.clone().unwrap_or_default());
                GeneratedRecord { raw_line: raw, uem: u }
            }
            "windows_security" => {
                let u = base_uem(&mut rng, "windows_security", "auth", if i % 2 == 0 { "4624" } else { "4625" }, if i % 2 == 0 { "INFO" } else { "MEDIUM" });
                let raw = format!("{{\"EventID\":{},\"SubjectUserName\":\"{}\",\"IpAddress\":\"{}\"}}", u.event_action, u.user_name.clone().unwrap_or_default(), u.source_ip.clone().unwrap_or_default());
                GeneratedRecord { raw_line: raw, uem: u }
            }
            "sysmon" => {
                let u = base_uem(&mut rng, "sysmon", "process", "create", "INFO");
                let raw = format!("{{\"Image\":\"C:\\\\Windows\\\\System32\\\\cmd.exe\",\"User\":\"{}\",\"IpAddress\":\"{}\"}}", u.user_name.clone().unwrap_or_default(), u.source_ip.clone().unwrap_or_default());
                GeneratedRecord { raw_line: raw, uem: u }
            }
            "zeek_conn" => {
                let u = base_uem(&mut rng, "zeek_conn", "network", "conn", "INFO");
                let raw = format!("{}\t{}\t{}\t{}\t{}\t{}", Utc.timestamp_opt(u.event_timestamp as i64, 0).unwrap().to_rfc3339(), u.source_ip.clone().unwrap_or_default(), rng.gen_range(1024..65535), u.destination_ip.clone().unwrap_or_default(), 80, "tcp");
                GeneratedRecord { raw_line: raw, uem: u }
            }
            "zeek_dns" => {
                let u = base_uem(&mut rng, "zeek_dns", "network", "dns", "INFO");
                let raw = format!("{}\t{}\t{}", u.source_ip.clone().unwrap_or_default(), "A", "example.com");
                GeneratedRecord { raw_line: raw, uem: u }
            }
            "zeek_http" => {
                let u = base_uem(&mut rng, "zeek_http", "web", "http", "INFO");
                let raw = format!("{}\tGET\t{}\t{}", u.source_ip.clone().unwrap_or_default(), "http://example.com/", 200);
                GeneratedRecord { raw_line: raw, uem: u }
            }
            "cisco_asa" => {
                let u = base_uem(&mut rng, "cisco_asa", "network", "firewall", "INFO");
                let raw = format!("<166> %ASA-6-302013: Built inbound TCP connection for {} to {}", u.source_ip.clone().unwrap_or_default(), u.destination_ip.clone().unwrap_or_default());
                GeneratedRecord { raw_line: raw, uem: u }
            }
            "pan_os" => {
                let u = base_uem(&mut rng, "pan_os", "network", "threat", "MEDIUM");
                let raw = format!("1,2023/01/01,12:00:00,THREAT,\"{}\",\"{}\",alert", u.source_ip.clone().unwrap_or_default(), u.destination_ip.clone().unwrap_or_default());
                GeneratedRecord { raw_line: raw, uem: u }
            }
            "fortigate" => {
                let u = base_uem(&mut rng, "fortigate", "network", "firewall", "INFO");
                let raw = format!("date=2023-01-01 time=12:00:00 devname=FGT devid=FG1 logid=000 srcip={} dstip={}", u.source_ip.clone().unwrap_or_default(), u.destination_ip.clone().unwrap_or_default());
                GeneratedRecord { raw_line: raw, uem: u }
            }
            "otel_logs" => {
                let u = base_uem(&mut rng, "otel_logs", "app", "log", "INFO");
                let raw = format!("{{\"body\":\"{}\",\"attributes\":{{\"net.peer.ip\":\"{}\"}}}}", u.message.clone().unwrap_or_default(), u.source_ip.clone().unwrap_or_default());
                GeneratedRecord { raw_line: raw, uem: u }
            }
            _ => {
                let u = base_uem(&mut rng, source, "misc", "event", "INFO");
                let raw = format!("{} {}", source, u.message.clone().unwrap_or_default());
                GeneratedRecord { raw_line: raw, uem: u }
            }
        }
    }).collect()
}

pub async fn load_clickhouse(ndjson_path: &str, table: &str, batch: usize, ch_url: &str, database: Option<&str>) -> anyhow::Result<u64> {
    let file = std::fs::File::open(ndjson_path)?;
    let reader = BufReader::new(file);
    let client = reqwest::Client::new();
    let mut buf: Vec<String> = Vec::with_capacity(batch);
    let mut sent: u64 = 0;
    let db = database.unwrap_or("");
    for line in reader.lines() {
        let l = line?; if l.trim().is_empty() { continue; }
        buf.push(l);
        if buf.len() >= batch {
            let payload = buf.join("\n");
            let sql = format!("INSERT INTO {} FORMAT JSONEachRow\n{}", table, payload);
            let mut req = client.post(format!("{}/?query=", ch_url));
            if !db.is_empty() { req = client.post(format!("{}/?database={}&query=", ch_url, db)); }
            let res = req.body(sql).send().await?;
            if !res.status().is_success() { anyhow::bail!("CH insert failed: {}", res.text().await.unwrap_or_default()); }
            sent += buf.len() as u64; buf.clear();
        }
    }
    if !buf.is_empty() {
        let payload = buf.join("\n");
        let sql = format!("INSERT INTO {} FORMAT JSONEachRow\n{}", table, payload);
        let mut req = client.post(format!("{}/?query=", ch_url));
        if !database.unwrap_or("").is_empty() { req = client.post(format!("{}/?database={}&query=", ch_url, database.unwrap())); }
        let res = req.body(sql).send().await?;
        if !res.status().is_success() { anyhow::bail!("CH insert failed: {}", res.text().await.unwrap_or_default()); }
        sent += buf.len() as u64;
    }
    Ok(sent)
}


