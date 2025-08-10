use reqwest::Client;
use serde_json::json;

#[tokio::main]
async fn main() {
    let base = "http://127.0.0.1:9999";
    let client = Client::new();

    // Payload 1 - compile
    let p1_yaml = r#"---

title: Multiple Failed Logins
id: 6d8f2fbb-2c6d-4f65-9a21-5a5b6e9a8a33
status: experimental
logsource:
  product: auth

detection:
  selection:
    event.category: authentication
    event.action: failure
  timeframe: 5m
  condition: selection | count(user.name) by user.name, source.ip >= 5
level: medium
"#;
    let comp = json!({
        "sigma": p1_yaml,
        "tenant_ids":["default"],
        "time_range": {"last_minutes": 15},
        "mapping_profile": "default_cim_v1",
        "allow_unmapped": false
    });
    match client.post(format!("{}/api/v2/rules/sigma/compile", base)).json(&comp).send().await {
        Ok(r) => {
            println!("/rules/sigma/compile HTTP {}", r.status());
            let txt = r.text().await.unwrap_or_default();
            println!("{}", txt);
        }
        Err(e) => eprintln!("compile error: {}", e),
    }

    // Create rule
    let create = json!({
        "sigma": p1_yaml,
        "tenant_ids":["default"],
        "time_range": {"last_minutes": 15},
        "mapping_profile": "default_cim_v1",
        "allow_unmapped": false,
        "tenant_scope": "all",
        "tags": ["auth","failed_logins"]
    });
    let mut rule_id = String::new();
    match client.post(format!("{}/api/v2/rules/sigma", base)).json(&create).send().await {
        Ok(r) => {
            println!("/rules/sigma HTTP {}", r.status());
            let txt = r.text().await.unwrap_or_default();
            println!("{}", txt);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&txt) { if let Some(id) = v.get("id").and_then(|x| x.as_str()) { rule_id = id.to_string(); } }
        }
        Err(e) => eprintln!("create error: {}", e),
    }

    // search execute
    let dsl = json!({"version":"1","search":{"tenant_ids":["default"],"time_range":{"last_seconds":900}}});
    match client.post(format!("{}/api/v2/search/execute", base)).json(&json!({"dsl": dsl})).send().await {
        Ok(r) => {
            println!("/search/execute HTTP {}", r.status());
            let txt = r.text().await.unwrap_or_default();
            println!("{}", txt);
        }
        Err(e) => eprintln!("execute error: {}", e),
    }

    // search estimate
    match client.post(format!("{}/api/v2/search/estimate", base)).json(&json!({"dsl": dsl})).send().await {
        Ok(r) => {
            println!("/search/estimate HTTP {}", r.status());
            let txt = r.text().await.unwrap_or_default();
            println!("{}", txt);
        }
        Err(e) => eprintln!("estimate error: {}", e),
    }

    // search facets (topK)
    match client.post(format!("{}/api/v2/search/facets", base)).json(&json!({"dsl": dsl, "field": "source_type", "k": 5})).send().await {
        Ok(r) => {
            println!("/search/facets HTTP {}", r.status());
            let txt = r.text().await.unwrap_or_default();
            println!("{}", txt);
        }
        Err(e) => eprintln!("facets error: {}", e),
    }

    // rules dry-run and run-now (if rule id captured)
    if !rule_id.is_empty() {
        match client.post(format!("{}/api/v2/rules/{}/dry-run", base, rule_id)).json(&json!({"limit": 5})).send().await {
            Ok(r) => {
                println!("/rules/{}/dry-run HTTP {}", rule_id, r.status());
                let txt = r.text().await.unwrap_or_default();
                println!("{}", txt);
            }
            Err(e) => eprintln!("dry-run error: {}", e),
        }
        match client.post(format!("{}/api/v2/rules/{}/run-now", base, rule_id)).json(&json!({"limit": 5})).send().await {
            Ok(r) => {
                println!("/rules/{}/run-now HTTP {}", rule_id, r.status());
                let txt = r.text().await.unwrap_or_default();
                println!("{}", txt);
            }
            Err(e) => eprintln!("run-now error: {}", e),
        }
    }
}


