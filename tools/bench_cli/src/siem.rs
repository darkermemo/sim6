use clap::{Parser, Subcommand, ValueEnum};
use rand::{SeedableRng, rngs::StdRng, Rng};
use serde_json::json;
use std::{fs::{File, create_dir_all}, io::{BufWriter, Write}, path::Path};

#[derive(Parser)]
#[command(name="siem", version, about="SIEM bench CLI: generators and loaders", author="SIEM")] 
pub struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Gen {
        #[arg(long)] source: Source,
        #[arg(long, default_value_t = 1337u64)] seed: u64,
        #[arg(long, default_value_t = 1000usize)] count: usize,
        #[arg(long, value_name="RAW_FILE")] out: String,
        #[arg(long, value_name="NDJSON_FILE")] out_ndjson: String,
    },
    LoadCh {
        #[arg(long)] table: String,
        #[arg(long, value_name="NDJSON_FILE")] input: String,
        #[arg(long, default_value_t = 50000usize)] batch: usize,
        #[arg(long, default_value = "http://localhost:8123")] clickhouse_url: String,
        #[arg(long, default_value = "dev")] database: String,
    }
}

#[derive(Clone, Copy, ValueEnum)]
enum Source { Cloudtrail, CiscoAsa }

pub fn run() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Gen { source, seed, count, out, out_ndjson } => gen(source, seed, count, &out, &out_ndjson),
        Commands::LoadCh { table, input, batch, clickhouse_url, database } => load_ch(&table, &input, batch, &clickhouse_url, &database),
    }
}

fn gen(source: Source, seed: u64, count: usize, out: &str, out_ndjson: &str) -> anyhow::Result<()> {
    if let Some(parent) = Path::new(out).parent() { if !parent.as_os_str().is_empty() { create_dir_all(parent)?; } }
    if let Some(parent) = Path::new(out_ndjson).parent() { if !parent.as_os_str().is_empty() { create_dir_all(parent)?; } }
    let mut rng = StdRng::seed_from_u64(seed);
    let mut raw = BufWriter::new(File::create(out)?);
    let mut ndj = BufWriter::new(File::create(out_ndjson)?);
    for i in 0..count {
        let (raw_line, uem) = match source {
            Source::Cloudtrail => synth_cloudtrail(&mut rng, i),
            Source::CiscoAsa => synth_cisco_asa(&mut rng, i),
        };
        writeln!(raw, "{}", raw_line)?;
        serde_json::to_writer(&mut ndj, &uem)?; ndj.write_all(b"\n")?;
    }
    raw.flush()?; ndj.flush()?;
    Ok(())
}

fn load_ch(table: &str, input: &str, batch: usize, url: &str, db: &str) -> anyhow::Result<()> {
    let client = reqwest::blocking::Client::builder().build()?;
    let mut rdr = std::io::BufRead::lines(std::io::BufReader::new(File::open(input)?));
    let mut buf: Vec<String> = Vec::with_capacity(batch);
    let endpoint = format!("{}/?database={}", url.trim_end_matches('/'), db);
    loop {
        while buf.len() < batch {
            if let Some(line) = rdr.next() { buf.push(line?); } else { break; }
        }
        if buf.is_empty() { break; }
        let payload = buf.join("\n");
        let q = format!("INSERT INTO {} FORMAT JSONEachRow", table);
        let res = client.post(&endpoint).query(&[("query", q)]).body(payload.clone()).send()?;
        if !res.status().is_success() { anyhow::bail!(format!("CH load failed: {}", res.text().unwrap_or_default())); }
        buf.clear();
    }
    Ok(())
}

fn synth_cloudtrail(rng: &mut StdRng, idx: usize) -> (String, serde_json::Value) {
    let acct = format!("{}", 100000000000u64 + (rng.next_u64()%900000000000));
    let user = format!("user{}", idx % 7);
    let src_ip = format!("10.{}.{}.{}", (idx%250)+1, (idx*3%250)+1, (idx*7%250)+1);
    let event = json!({
        "version":"1.08","userIdentity":{"type":"IAMUser","userName":user},
        "eventTime": chrono::Utc::now().timestamp(),
        "eventSource":"signin.amazonaws.com","eventName":"ConsoleLogin",
        "sourceIPAddress": src_ip,
        "awsRegion":"us-east-1","recipientAccountId": acct
    });
    let raw_line = event.to_string();
    let uem = json!({
        "tenant_id":"default","event_timestamp": event["eventTime"].as_i64().unwrap_or(0),
        "event_category":"auth","event_action":"login","event_outcome":"success",
        "user_name": user, "source_ip": src_ip, "source_type":"cloudtrail", "raw_event": raw_line
    });
    (raw_line, uem)
}

fn synth_cisco_asa(rng: &mut StdRng, idx: usize) -> (String, serde_json::Value) {
    let sev = ["INFO","WARN","ERR"][rng.gen_range(0..3)];
    let msg_id = ["106100","302020","302013"][idx%3];
    let src = format!("192.168.{}.{}", (idx%200)+1, (idx*5%200)+1);
    let dst = format!("172.16.{}.{}", (idx%200)+1, (idx*7%200)+1);
    let raw_line = format!("<134>Aug  9 12:00:0{} ASA-{}-{}: Built inbound TCP connection for {} to {}", idx%10, sev, msg_id, src, dst);
    let uem = json!({
        "tenant_id":"default","event_timestamp": chrono::Utc::now().timestamp(),
        "event_category":"network","event_action":"conn","event_outcome":"success",
        "source_ip": src, "destination_ip": dst, "protocol":"tcp", "source_type":"cisco_asa", "raw_event": raw_line
    });
    (raw_line, uem)
}


