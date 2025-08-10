use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use rand::{rngs::StdRng, Rng, SeedableRng};
use serde_json::json;
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};

#[derive(Parser, Debug)]
#[command(name = "siem", version, about = "SIEM CLI: deterministic generators + ClickHouse loader")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Generate deterministic vendor raw + UEM NDJSON aligned to dev.events
    Gen(GenArgs),
    /// Load NDJSON into ClickHouse dev.events via JSONEachRow with preflight
    LoadCh(LoadArgs),
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum SourceKind {
    Cloudtrail,
    GcpAudit,
    OktaSystemLog,
    WindowsSecurity,
    Sysmon,
    ZeekConn,
    ZeekDns,
    ZeekHttp,
    CiscoAsa,
    PanOs,
    Fortigate,
    OtelLogs,
}

#[derive(Parser, Debug)]
struct GenArgs {
    // Positional source to support: `siem gen okta_system_log`
    #[arg(value_enum)]
    source: SourceKind,
    #[arg(long, default_value_t = 1337u64)]
    seed: u64,
    #[arg(long, default_value_t = 100usize)]
    count: usize,
    #[arg(long, default_value = "default")]
    tenant: String,
    #[arg(long, default_value_t = 1_725_000_000u64)]
    start_ts: u64,
    #[arg(long, default_value_t = 1u32)]
    step_sec: u32,
    #[arg(long, value_name = "FILE")]
    out: PathBuf,
    #[arg(long = "out-ndjson", value_name = "FILE")]
    out_ndjson: PathBuf,
}

#[derive(Parser, Debug)]
struct LoadArgs {
    #[arg(long, default_value = "dev.events")]
    table: String,
    // Support --file (user flow) for input NDJSON
    #[arg(long = "file", value_name = "FILE")]
    file: PathBuf,
    #[arg(long, default_value_t = 50000usize)]
    batch: usize,
}

fn ensure_parent(path: &Path) -> Result<()> {
    if let Some(dir) = path.parent() {
        if !dir.as_os_str().is_empty() { std::fs::create_dir_all(dir)?; }
    }
    Ok(())
}

fn write_lines(path: &Path, lines: &[String]) -> Result<()> {
    ensure_parent(path)?;
    let f = File::create(path).with_context(|| format!("create {:?}", path))?;
    let mut w = BufWriter::new(f);
    for l in lines { writeln!(w, "{}", l)?; }
    Ok(())
}

fn metadata_str(v: serde_json::Value) -> String { serde_json::to_string(&v).unwrap_or_else(|_| "{}".into()) }

fn base_uem(args: &GenArgs, ts: u64, event_id: String, category: &str, source_type: &str, raw: &str) -> serde_json::Value {
    // Build a base UEM row with all required dev.events columns
    serde_json::json!({
        "event_id": event_id,
        "event_timestamp": ts,
        "tenant_id": args.tenant,
        "event_category": category,
        "event_action": serde_json::Value::Null,
        "event_outcome": serde_json::Value::Null,
        "source_ip": serde_json::Value::Null,
        "destination_ip": serde_json::Value::Null,
        "user_id": serde_json::Value::Null,
        "user_name": serde_json::Value::Null,
        "severity": serde_json::Value::Null,
        "message": serde_json::Value::Null,
        "raw_event": raw,
        "metadata": "{}",
        "source_type": source_type,
        "created_at": ts,
        "retention_days": 30u16
    })
}

fn gen_record(rng: &mut StdRng, args: &GenArgs, i: usize) -> (String, serde_json::Value) {
    let ts = args.start_ts + (i as u64) * (args.step_sec as u64);
    match args.source {
        SourceKind::Cloudtrail => {
            let user = format!("user{:03}", rng.gen_range(1..=50));
            let src_ip = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
            let action = ["ConsoleLogin", "CreateUser", "AttachRolePolicy"][rng.gen_range(0..3)];
            let raw = json!({
                "eventVersion": "1.08",
                "userIdentity": {"userName": user},
                "eventTime": ts,
                "eventName": action,
                "sourceIPAddress": src_ip,
                "eventSource": "signin.amazonaws.com"
            }).to_string();
            let mut uem = base_uem(args, ts, format!("ct-{:08}", i), "auth", "cloudtrail", &raw);
            uem["event_action"] = json!(action);
            uem["event_outcome"] = json!("success");
            uem["severity"] = json!("INFO");
            uem["user_name"] = json!(user);
            uem["source_ip"] = json!(src_ip);
            (uem["raw_event"].as_str().unwrap().to_string(), uem)
        }
        SourceKind::CiscoAsa => {
            let src = format!("192.168.{}.{}", rng.gen_range(0..=255), rng.gen_range(1..=254));
            let dst = format!("172.16.{}.{}", rng.gen_range(0..=255), rng.gen_range(1..=254));
            let msg_id = ["106100","106023","305011"][rng.gen_range(0..3)];
            let sport: u16 = 40000 + (i as u16 % 20000);
            let dport = [80u16,443u16,53u16][rng.gen_range(0..3)];
            let raw = format!("%ASA-6-{}: Built TCP connection from {}/{} to {}/{}", msg_id, src, sport, dst, dport);
            let mut uem = base_uem(args, ts, format!("asa-{:08}", i), "network", "cisco_asa", &raw);
            uem["event_action"] = json!("connection");
            uem["event_outcome"] = json!("success");
            uem["severity"] = json!("INFO");
            uem["source_ip"] = json!(src);
            uem["destination_ip"] = json!(dst);
            uem["metadata"] = json!(metadata_str(json!({"protocol":"tcp","source_port":sport,"dest_port":dport})));
            (uem["raw_event"].as_str().unwrap().to_string(), uem)
        }
        SourceKind::ZeekConn => {
            let sip = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
            let dip = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
            let raw = format!("{}\t{}\t{}\t{}\t{}\t{}\tS1", ts, sip, 12345, dip, 443, "tcp");
            let mut uem = base_uem(args, ts, format!("zconn-{:08}", i), "network", "zeek_conn", &raw);
            uem["event_action"] = json!("connect");
            uem["event_outcome"] = json!("success");
            uem["severity"] = json!("INFO");
            uem["source_ip"] = json!(sip);
            uem["destination_ip"] = json!(dip);
            uem["metadata"] = json!(metadata_str(json!({"protocol":"tcp","source_port":12345,"dest_port":443})));
            (uem["raw_event"].as_str().unwrap().to_string(), uem)
        }
        SourceKind::GcpAudit => {
            let user = format!("user{:03}", rng.gen_range(1..=50));
            let method = ["storage.objects.get","iam.serviceAccounts.signBlob"][rng.gen_range(0..2)];
            let caller_ip = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
            let raw = json!({"protoPayload":{"methodName":method,"authenticationInfo":{"principalEmail":format!("{}@example.com", user)},"requestMetadata":{"callerIp":caller_ip}}}).to_string();
            let mut uem = base_uem(args, ts, format!("gcp-{:08}", i), "auth", "gcp_audit", &raw);
            uem["event_action"] = json!(method);
            uem["event_outcome"] = json!("success");
            uem["severity"] = json!("INFO");
            uem["user_name"] = json!(format!("{}@example.com", user));
            uem["source_ip"] = json!(caller_ip);
            (uem["raw_event"].as_str().unwrap().to_string(), uem)
        }
        SourceKind::OktaSystemLog => {
            let user = format!("user{:03}", rng.gen_range(1..=50));
            let result = if rng.gen_bool(0.8) {"SUCCESS"} else {"FAILURE"};
            let src_ip = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
            let raw = json!({
                "eventType":"user.session.start",
                "actor":{"alternateId":user},
                "outcome":{"result":result},
                "client": {"ipAddress": src_ip}
            }).to_string();
            let mut uem = base_uem(args, ts, format!("okta-{:08}", i), "auth", "okta_system_log", &raw);
            uem["event_action"] = json!("user.session.start");
            uem["event_outcome"] = json!(if result=="SUCCESS"{"success"} else {"failure"});
            uem["severity"] = json!("INFO");
            uem["user_name"] = json!(user);
            uem["source_ip"] = json!(src_ip);
            (uem["raw_event"].as_str().unwrap().to_string(), uem)
        }
        SourceKind::WindowsSecurity | SourceKind::Sysmon => {
            let eid = if matches!(args.source, SourceKind::WindowsSecurity) { [4624,4625][rng.gen_range(0..2)] } else { 1 };
            let user = format!("user{:03}", rng.gen_range(1..=20));
            let raw = if matches!(args.source, SourceKind::WindowsSecurity) {
                let ip = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
                json!({"EventID": eid, "TargetUserName": user, "IpAddress": ip}).to_string()
            } else {
                json!({"EventID": 1, "Image": "C\\\\Windows\\\\System32\\\\cmd.exe", "TargetUserName": user}).to_string()
            };
            let mut uem = base_uem(args, ts, format!("win-{:08}", i), "auth", if matches!(args.source, SourceKind::WindowsSecurity){"windows_security"} else {"sysmon"}, &raw);
            uem["event_action"] = json!(if eid==4625 {"logon_failed"} else {"logon"});
            uem["event_outcome"] = json!(if eid==4625 {"failure"} else {"success"});
            uem["severity"] = json!("INFO");
            uem["user_name"] = json!(user);
            if matches!(args.source, SourceKind::WindowsSecurity) {
                // reflect IpAddress
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) { if let Some(ip)=v.get("IpAddress").and_then(|x| x.as_str()) { uem["source_ip"] = json!(ip); } }
            }
            (uem["raw_event"].as_str().unwrap().to_string(), uem)
        }
        SourceKind::ZeekDns => {
            let q = ["example.com","okta.com"][rng.gen_range(0..2)];
            let raw = format!("{}\t{}\tA\tNOERROR", ts, q);
            let mut uem = base_uem(args, ts, format!("zdns-{:08}", i), "network", "zeek_dns", &raw);
            uem["event_action"] = json!("query");
            uem["severity"] = json!("INFO");
            uem["metadata"] = json!(metadata_str(json!({"qtype_name":"A","answers":["1.2.3.4"]})));
            (uem["raw_event"].as_str().unwrap().to_string(), uem)
        }
        SourceKind::ZeekHttp => {
            let host = ["example.com","portal.local"][rng.gen_range(0..2)];
            let sip = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
            let dip = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
            // ts \t src \t dst \t method \t uri \t host \t status \t user_agent
            let raw = format!("{}\t{}\t{}\tGET\t/\t{}\t200\tMozilla", ts, sip, dip, host);
            let mut uem = base_uem(args, ts, format!("zhttp-{:08}", i), "http", "zeek_http", &raw);
            uem["event_action"] = json!("request");
            uem["severity"] = json!("INFO");
            uem["source_ip"] = json!(sip);
            uem["destination_ip"] = json!(dip);
            uem["metadata"] = json!(metadata_str(json!({"http":{"host":host,"url":"/","user_agent":"Mozilla","status":200}})));
            (uem["raw_event"].as_str().unwrap().to_string(), uem)
        }
        SourceKind::PanOs => {
            let src = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
            let dst = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
            let raw = format!("PAN-OS,TRAFFIC,{},{}", src, dst);
            let mut uem = base_uem(args, ts, format!("pan-{:08}", i), "network", "pan_os", &raw);
            uem["event_action"] = json!("traffic");
            uem["severity"] = json!("INFO");
            uem["source_ip"] = json!(src);
            uem["destination_ip"] = json!(dst);
            (uem["raw_event"].as_str().unwrap().to_string(), uem)
        }
        SourceKind::Fortigate => {
            let src = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
            let dst = format!("10.{}.{}.{}", rng.gen_range(0..=255), rng.gen_range(0..=255), rng.gen_range(1..=254));
            let raw = format!("date= time= devname=fgt devid=123 type=traffic src={} dst={} status=pass", src, dst);
            let mut uem = base_uem(args, ts, format!("fgt-{:08}", i), "network", "fortigate", &raw);
            uem["event_action"] = json!("forward");
            uem["severity"] = json!("INFO");
            uem["source_ip"] = json!(src);
            uem["destination_ip"] = json!(dst);
            uem["metadata"] = json!(metadata_str(json!({"protocol":"tcp"})));
            (uem["raw_event"].as_str().unwrap().to_string(), uem)
        }
        SourceKind::OtelLogs => {
            let sev = ["INFO","WARN","ERROR"][rng.gen_range(0..3)];
            let raw = json!({"resource":{"service.name":"app"},"severity_text":sev,"body":{"msg":"hello"}}).to_string();
            let mut uem = base_uem(args, ts, format!("otel-{:08}", i), "app", "otel_logs", &raw);
            uem["event_action"] = json!("log");
            uem["severity"] = json!(sev);
            uem["metadata"] = json!(metadata_str(json!({"resource":{"service.name":"app"},"attributes":{"service.name":"app"}})));
            (uem["raw_event"].as_str().unwrap().to_string(), uem)
        }
    }
}

fn cmd_gen(args: GenArgs) -> Result<()> {
    let mut rng = StdRng::seed_from_u64(args.seed);
    let mut raw_lines: Vec<String> = Vec::with_capacity(args.count);
    let mut nd_lines: Vec<String> = Vec::with_capacity(args.count);
    for i in 0..args.count {
        let (raw, mut uem) = gen_record(&mut rng, &args, i);
        // Ensure metadata is valid JSON string
        let meta_ok = uem.get("metadata").and_then(|m| m.as_str()).and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok()).is_some();
        if !meta_ok { uem["metadata"] = json!("{}"); }
        raw_lines.push(raw);
        nd_lines.push(serde_json::to_string(&uem)?);
    }
    write_lines(&args.out, &raw_lines)?;
    write_lines(&args.out_ndjson, &nd_lines)?;
    Ok(())
}

#[derive(serde::Deserialize)]
struct ChDescribeResp { data: Vec<ChCol> }
#[derive(serde::Deserialize)]
struct ChCol { name: String, r#type: String }

fn preflight_describe(client: &reqwest::blocking::Client, table: &str, base_url: &str) -> Result<()> {
    // Use GET with query param to avoid HTTP length required on POST without body length
    let url = format!(
        "{}/?query={}&default_format=JSON",
        base_url.trim_end_matches('/'),
        urlencoding::encode(&format!("DESCRIBE {} FORMAT JSON", table))
    );
    let resp = client.get(&url).send()?;
    if !resp.status().is_success() { bail!("describe failed: {}", resp.text().unwrap_or_default()); }
    let txt = resp.text()?;
    let parsed: ChDescribeResp = serde_json::from_str(&txt).context("parse DESCRIBE JSON")?;
    // Required columns and types
    let required = vec![
        ("event_id","String"), ("event_timestamp","UInt32"), ("tenant_id","String"), ("event_category","String"),
        ("raw_event","String"), ("metadata","String"), ("created_at","UInt32")
    ];
    for (n,t) in required {
        let found = parsed.data.iter().find(|c| c.name==n).ok_or_else(|| anyhow::anyhow!("missing column {}", n))?;
        if found.r#type != t { bail!("column {} type mismatch: expected {}, got {}", n, t, found.r#type); }
    }
    Ok(())
}

fn map_ch_error_to_status(body: &str) -> u16 {
    if let Some(idx) = body.find("Code: ") { if let Some(rest) = body[idx+6..].split(|c:char| !c.is_ascii_digit()).next() { if let Ok(code) = rest.parse::<i32>() {
        return match code { 47 | 62 | 117 => 422, 241 | 242 => 422, 115 => 422, 60 => 503, _ => 500 };
    }}}
    500
}

fn cmd_load_ch(args: LoadArgs) -> Result<()> {
    let ch_url = std::env::var("CLICKHOUSE_URL").unwrap_or_else(|_| "http://localhost:8123".to_string());
    let client = reqwest::blocking::Client::new();
    preflight_describe(&client, &args.table, &ch_url)?;

    let f = File::open(&args.file)?;
    let r = BufReader::new(f);
    let mut batch: Vec<String> = Vec::with_capacity(args.batch);
    for line in r.lines() {
        let l = line?; if l.trim().is_empty() { continue; }
        let _v: serde_json::Value = serde_json::from_str(&l).context("invalid NDJSON line")?;
        batch.push(l);
        if batch.len() >= args.batch { insert_batch(&client, &ch_url, &args.table, &batch)?; batch.clear(); }
    }
    if !batch.is_empty() { insert_batch(&client, &ch_url, &args.table, &batch)?; }
    Ok(())
}

fn insert_batch(client: &reqwest::blocking::Client, base_url: &str, table: &str, rows: &[String]) -> Result<()> {
    let query = format!("INSERT INTO {} FORMAT JSONEachRow", table);
    let params = vec![
        ("max_execution_time","8"),
        ("input_format_skip_unknown_fields","0"),
        ("send_progress_in_http_headers","1"),
        ("wait_end_of_query","1"),
        ("max_insert_block_size","1048576"),
        ("query", query.as_str()),
    ];
    let url = format!("{}/", base_url.trim_end_matches('/'));
    let body = rows.join("\n");
    // Use POST with Content-Length set via body String length; reqwest sets it automatically for String
    let resp = client.post(&url).query(&params).body(body).send()?;
    if !resp.status().is_success() {
        let txt = resp.text().unwrap_or_default();
        let status = map_ch_error_to_status(&txt);
        bail!("ClickHouse insert failed (mapped {}): {}", status, txt);
    }
    Ok(())
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Gen(a) => cmd_gen(a),
        Commands::LoadCh(a) => cmd_load_ch(a),
    }
}
