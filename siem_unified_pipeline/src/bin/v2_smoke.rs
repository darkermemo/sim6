use reqwest::Client;
use serde_json::{json, Value};
use std::fs;
use std::time::Duration;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base = std::env::var("BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:9999".to_string());
    let out_dir = "target/test-artifacts";
    fs::create_dir_all(out_dir)?;
    let client = Client::builder().timeout(Duration::from_secs(10)).build()?;

    let mut report = String::new();
    let mut steps: Vec<Value> = Vec::new();

    // Health
    let mut health_ok = false;
    for _ in 0..20 {
        match client.get(format!("{}/health", base)).send().await {
            Ok(r) if r.status().is_success() => { health_ok = true; break; }
            _ => tokio::time::sleep(Duration::from_millis(250)).await,
        }
    }
    report.push_str(&format!("Health: {}\n", if health_ok {"OK"} else {"FAIL"}));
    steps.push(json!({"health": health_ok}));

    // Search compile/execute/estimate/facets
    let dsl = json!({"version":"1","search":{"tenant_ids":["default"],"time_range":{"last_seconds":900}}});
    let compile = client.post(format!("{}/api/v2/search/compile", base)).json(&dsl).send().await?;
    let compile_body = compile.text().await.unwrap_or_default();
    fs::write(format!("{}/compile.json", out_dir), &compile_body)?;
    report.push_str("Search compile: OK\n");
    let exec = client.post(format!("{}/api/v2/search/execute", base)).json(&json!({"dsl": dsl})).send().await?;
    let exec_body = exec.text().await.unwrap_or_default();
    fs::write(format!("{}/execute.json", out_dir), &exec_body)?;
    report.push_str("Search execute: OK\n");
    let est = client.post(format!("{}/api/v2/search/estimate", base)).json(&json!({"dsl": dsl})).send().await?;
    fs::write(format!("{}/estimate.json", out_dir), est.text().await.unwrap_or_default())?;
    report.push_str("Search estimate: OK\n");
    let facets = client.post(format!("{}/api/v2/search/facets", base)).json(&json!({"dsl": dsl, "field": "source_type", "k": 5})).send().await?;
    fs::write(format!("{}/facets.json", out_dir), facets.text().await.unwrap_or_default())?;
    report.push_str("Search facets: OK\n");

    // Sigma compile + create
    let sigma_yaml = "---\ntitle: Test\nid: 00000000-0000-4000-8000-000000000000\nlogsource: { product: auth }\ndetection:\n  sel:\n    event.category: authentication\n    event.action: failure\n  condition: sel\nlevel: medium\n";
    let comp = client.post(format!("{}/api/v2/rules/sigma/compile", base)).json(&json!({
        "sigma": sigma_yaml,
        "tenant_ids": ["default"],
        "time_range": {"last_minutes": 15},
        "mapping_profile": "default_cim_v1",
        "allow_unmapped": false
    })).send().await?;
    fs::write(format!("{}/sigma_compile.json", out_dir), comp.text().await.unwrap_or_default())?;
    report.push_str("Sigma compile: OK\n");
    let created = client.post(format!("{}/api/v2/rules/sigma", base)).json(&json!({
        "sigma": sigma_yaml,
        "tenant_ids": ["default"],
        "time_range": {"last_minutes": 15},
        "mapping_profile": "default_cim_v1",
        "allow_unmapped": false,
        "tenant_scope": "all",
        "tags": ["e2e"]
    })).send().await?;
    let created_txt = created.text().await.unwrap_or_default();
    fs::write(format!("{}/sigma_create.json", out_dir), &created_txt)?;
    let rule_id = serde_json::from_str::<Value>(&created_txt).ok().and_then(|v| v.get("id").and_then(|s| s.as_str()).map(|s| s.to_string())).unwrap_or_default();
    report.push_str(&format!("Sigma create: {}\n", if rule_id.is_empty() {"FAIL"} else {"OK"}));

    // Generic create + dry-run + run-now
    let crud = client.post(format!("{}/api/v2/rules", base)).json(&json!({
        "name": "CRUD Test",
        "tenant_scope": "all",
        "severity": "HIGH",
        "compiled_sql": "SELECT event_id, event_timestamp, tenant_id, source_type FROM dev.events WHERE tenant_id IN ('default') AND event_timestamp >= toUInt32(now()) - 900"
    })).send().await?;
    let crud_txt = crud.text().await.unwrap_or_default();
    fs::write(format!("{}/crud_create.json", out_dir), &crud_txt)?;
    let crud_id = serde_json::from_str::<Value>(&crud_txt).ok().and_then(|v| v.get("id").and_then(|s| s.as_str()).map(|s| s.to_string())).unwrap_or_default();
    if !crud_id.is_empty() {
        let dr = client.post(format!("{}/api/v2/rules/{}/dry-run", base, crud_id)).json(&json!({"limit": 5})).send().await?;
        fs::write(format!("{}/dry_run.json", out_dir), dr.text().await.unwrap_or_default())?;
        let rn = client.post(format!("{}/api/v2/rules/{}/run-now", base, crud_id)).json(&json!({"limit": 5})).send().await?;
        fs::write(format!("{}/run_now.json", out_dir), rn.text().await.unwrap_or_default())?;
        report.push_str("CRUD dry-run/run-now: OK\n");
    } else {
        report.push_str("CRUD create: FAIL\n");
    }

    // Alerts list
    let alerts = client.get(format!("{}/api/v2/alerts?limit=5", base)).send().await?;
    fs::write(format!("{}/alerts.json", out_dir), alerts.text().await.unwrap_or_default())?;
    report.push_str("Alerts list: OK\n");

    // Write report
    let full = json!({"base": base, "steps": steps});
    fs::write(format!("{}/final_reportv1.md", out_dir), report)?;
    fs::write(format!("{}/final_reportv1.json", out_dir), serde_json::to_string_pretty(&full)?)?;
    println!("OK");
    Ok(())
}


