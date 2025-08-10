use clap::Parser;
use std::{fs::File, io::{BufRead, BufReader}};

#[derive(Parser, Debug)]
#[command(name="siem load-ch")]
struct Args { #[arg(long)] table:String, #[arg(long)] r#in:String, #[arg(long, default_value_t=50000)] batch:usize }

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let f = File::open(&args.r#in)?; let mut rdr = BufReader::new(f);
    let client = reqwest::Client::new();
    let mut buf = Vec::with_capacity(args.batch);
    loop {
        let mut line = String::new();
        let n = rdr.read_line(&mut line)?; if n==0 { break; }
        if !line.trim().is_empty() { buf.push(line); }
        if buf.len() >= args.batch {
            flush(&client, &args.table, &mut buf).await?;
        }
    }
    if !buf.is_empty() { flush(&client, &args.table, &mut buf).await?; }
    Ok(())
}

async fn flush(client:&reqwest::Client, table:&str, buf:&mut Vec<String>) -> anyhow::Result<()> {
    let payload = format!("INSERT INTO {} FORMAT JSONEachRow\n{}", table, buf.join(""));
    let resp = client.post("http://localhost:8123/").body(payload).send().await?;
    if !resp.status().is_success() { anyhow::bail!("CH load failed: {}", resp.text().await.unwrap_or_default()); }
    buf.clear(); Ok(())
}


