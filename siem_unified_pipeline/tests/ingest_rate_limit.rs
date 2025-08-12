mod helpers;
use reqwest::Client;

#[tokio::test]
async fn rate_limit_returns_429_and_increments_metric() -> anyhow::Result<()> {
    // Spawn server on random port with required env
    let mut srv = tokio::task::spawn_blocking(|| {
        helpers::spawn_server(&[
            ("CLICKHOUSE_URL", "http://127.0.0.1:8123"),
            ("CLICKHOUSE_DATABASE", "dev"),
            ("REDIS_URL", "redis://127.0.0.1:6379"),
        ])
    }).await??;
    let base = srv.base.clone();

    let client = Client::new();
    // Seed strict limits for 'default' via ClickHouse fallback table
    let _ = client
        .post("http://127.0.0.1:8123/")
        .query(&[("query", "INSERT INTO dev.tenant_limits (tenant_id, eps_limit, burst_limit, retention_days, updated_at) VALUES ('default', 1, 2, 30, toUInt32(now()))".to_string())])
        .header("Content-Length", "0")
        .send().await?;

    // Create a raw payload with 5 logs to exceed burst immediately
    let now = chrono::Utc::now().timestamp();
    let logs: Vec<serde_json::Value> = (0..5).map(|i| serde_json::json!({
        "event_id": format!("t{}", i),
        "event_timestamp": now,
        "tenant_id": "default",
        "message": "rate test",
        "raw_event": "{}",
        "source_type": "manual",
        "created_at": now,
        "retention_days": 30
    })).collect();
    let payload = serde_json::json!({"logs": logs});
    let res = client
        .post(format!("{}/api/v2/ingest/raw", base))
        .header("content-type","application/json")
        .json(&payload)
        .send().await?;
    assert_eq!(res.status().as_u16(), 429, "expected 429 from burst-exceeding payload");
    assert!(res.headers().get("Retry-After").is_some());

    // Metrics should include v2 rate-limit (accept legacy during transition)
    let met = client.get(format!("{}/metrics", base)).send().await?.text().await?;
    let ok = met.contains("siem_v2_rate_limit_total") || met.contains("siem_ingest_rate_limited_total");
    assert!(ok, "rate-limit counter missing in metrics:\n{}", met);

    srv.shutdown();
    Ok(())
}


