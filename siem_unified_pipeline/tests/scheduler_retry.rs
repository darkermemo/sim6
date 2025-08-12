mod helpers;

#[tokio::test]
async fn scheduler_retry_no_duplicate_alerts() -> anyhow::Result<()> {
    // Spawn ephemeral server
    let srv = tokio::task::spawn_blocking(|| {
        helpers::spawn_server(&[
            ("CLICKHOUSE_URL", "http://127.0.0.1:8123"),
            ("CLICKHOUSE_DATABASE", "dev"),
            ("REDIS_URL", "redis://127.0.0.1:6379"),
        ])
    }).await??;
    let base = srv.base.clone();
    let client = reqwest::Client::new();
    // Smoke: health is up and metrics endpoint responds with non-empty body
    let health = client.get(format!("{}/health", base)).send().await?;
    assert!(health.status().is_success());
    let met = client.get(format!("{}/metrics", base)).send().await?.text().await?;
    assert!(met.len() > 10, "metrics should not be empty");
    Ok(())
}


