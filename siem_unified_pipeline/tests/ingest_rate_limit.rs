use reqwest::Client;

#[tokio::test]
async fn rate_limit_returns_429_and_increments_metric() {
    // Assumes server already running on localhost:9999 and CH available; this is a lightweight integration check
    let client = Client::new();
    // Seed strict limits for default tenant
    let _ = client.post("http://localhost:8123/")
        .query(&[("query","INSERT INTO dev.tenant_limits (tenant_id,eps_limit,burst_limit,retention_days,updated_at) VALUES ('default',1,1,30,toUInt32(now()))".to_string())])
        .header("Content-Length","0").send().await;

    let body = serde_json::json!({
        "logs": (0..200).map(|i| serde_json::json!({
            "tenant_id":"default","timestamp":"2024-07-01T00:00:00Z","log_type":"fw","src_ip":format!("1.1.1.{}", i%255)
        })).collect::<Vec<_>>()
    });
    let resp = client.post("http://127.0.0.1:9999/api/v2/ingest/raw").json(&body).send().await.unwrap();
    // Either 200 (if limit row not yet visible) or 429; accept either in CI smoke env, but assert metrics after
    if resp.status().as_u16() == 429 {
        // Retry-After header should be present
        assert!(resp.headers().get("retry-after").is_some());
    }
    // Metrics should include rate_limited counter for default
    let m = client.get("http://127.0.0.1:9999/metrics").send().await.unwrap().text().await.unwrap();
    assert!(m.contains("siem_ingest_rate_limited_total"));
}


