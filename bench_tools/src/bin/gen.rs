use clap::{Parser, ValueEnum};
use rand::{SeedableRng, rngs::StdRng, Rng};
use serde_json::json;
use std::{fs::File, io::Write};

#[derive(ValueEnum, Clone, Debug)]
enum SourceKind { Cloudtrail, CiscoAsa }

#[derive(Parser, Debug)]
#[command(name="siem gen")]
struct Args {
    #[arg(long)] source: SourceKind,
    #[arg(long, default_value_t=1337)] seed: u64,
    #[arg(long, default_value_t=100)] count: usize,
    #[arg(long, required=true)] out: String,
    #[arg(long, required=true)] out_ndjson: String,
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let mut rng = StdRng::seed_from_u64(args.seed);
    let mut raw = File::create(&args.out)?;
    let mut nd = File::create(&args.out_ndjson)?;
    for _ in 0..args.count {
        match args.source {
            SourceKind::Cloudtrail => {
                let user = format!("user{}", rng.gen_range(1..=10));
                let src_ip = format!("10.0.{}.{}", rng.gen_range(0..=255), rng.gen_range(1..=254));
                let raw_line = format!("{{\"eventVersion\":\"1.08\",\"userIdentity\":{{\"userName\":\"{}\"}},\"sourceIPAddress\":\"{}\",\"eventName\":\"ConsoleLogin\"}}\n", user, src_ip);
                raw.write_all(raw_line.as_bytes())?;
                let ndj = json!({"tenant_id":"default","event_category":"auth","event_action":"login","user_name":user,"source_ip":src_ip});
                writeln!(nd, "{}", ndj.to_string())?;
            }
            SourceKind::CiscoAsa => {
                let src_ip = format!("192.168.{}.{}", rng.gen_range(0..=255), rng.gen_range(1..=254));
                let dst_ip = format!("172.16.{}.{}", rng.gen_range(0..=255), rng.gen_range(1..=254));
                let raw_line = format!("%ASA-6-302013: Built inbound TCP connection from {}/123 to {}/443\n", src_ip, dst_ip);
                raw.write_all(raw_line.as_bytes())?;
                let ndj = json!({"tenant_id":"default","event_category":"network","event_action":"allow","source_ip":src_ip,"destination_ip":dst_ip});
                writeln!(nd, "{}", ndj.to_string())?;
            }
        }
    }
    Ok(())
}


