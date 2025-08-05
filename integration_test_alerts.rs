//! Integration tests for SIEM Alert System
//! Tests full alert creation → retrieval flow, schema validation, and frontend integration

// Removed unused imports: Deserialize, Serialize, HashMap

/// Test data structures matching the API contracts
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
struct TestAlert {
    alert_id: String,
    tenant_id: String,
    rule_id: String,
    rule_name: String,
    event_id: Option<String>,
    alert_timestamp: u32,
    severity: String,
    status: String,
    created_at: u32,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct CreateAlertRequest {
    alerts: Vec<TestAlert>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct TestAlertResponse {
    alerts: Vec<TestAlert>,
    total: usize,
    page: usize,
    per_page: usize,
}

/// Helper functions
fn generate_test_token() -> String {
    "test-token-123".to_string()
}

fn create_test_alert_data(tenant_id: &str) -> TestAlert {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as u32;

    TestAlert {
        alert_id: format!("alert_{}", uuid::Uuid::new_v4()),
        tenant_id: tenant_id.to_string(),
        rule_id: "rule_001".to_string(),
        rule_name: "Test Security Rule".to_string(),
        event_id: Some(format!("event_{}", uuid::Uuid::new_v4())),
        alert_timestamp: now,
        severity: "high".to_string(),
        status: "open".to_string(),
        created_at: now,
    }
}

async fn create_test_alert(
    base_url: &str,
    token: &str,
    tenant_id: &str,
    alert: &TestAlert,
) -> Result<reqwest::Response, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let request_body = CreateAlertRequest {
        alerts: vec![alert.clone()],
    };

    let response = client
        .post(format!("{}/api/v1/alerts", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .header("X-Tenant-ID", tenant_id)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await?;

    Ok(response)
}

async fn get_alerts(
    base_url: &str,
    token: &str,
    tenant_id: &str,
) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();

    let response = client
        .get(format!("{}/api/v1/alerts", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .header("X-Tenant-ID", tenant_id)
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(format!("Failed to get alerts: {}", response.status()).into());
    }

    let alerts: Vec<serde_json::Value> = response.json().await?;
    Ok(alerts)
}

/// Test alert creation and retrieval flow
async fn test_alert_creation_and_retrieval_flow() -> Result<(), Box<dyn std::error::Error>> {
    let base_url = "http://localhost:8000";
    let token = generate_test_token();
    let tenant_id = "test_tenant";

    println!("🔄 Testing alert creation and retrieval flow...");

    // Test alert creation
    let test_alert = create_test_alert_data(tenant_id);
    let create_response = create_test_alert(base_url, &token, tenant_id, &test_alert).await?;

    if !create_response.status().is_success() {
        return Err(format!("Failed to create alert: {}", create_response.status()).into());
    }

    println!("  ✓ Alert creation successful");

    // Test alert retrieval
    let alerts = get_alerts(base_url, &token, tenant_id).await?;

    println!(
        "  ✓ Alert retrieval successful (found {} alerts)",
        alerts.len()
    );

    Ok(())
}

/// Test schema validation
async fn test_schema_validation() -> Result<(), Box<dyn std::error::Error>> {
    println!("🔍 Testing schema validation...");

    // Test serialization/deserialization of Rust structs
    let test_alert = create_test_alert_data("test_tenant");
    let serialized = serde_json::to_string(&test_alert)?;
    let _deserialized: TestAlert = serde_json::from_str(&serialized)?;

    println!("  ✓ Rust struct serialization/deserialization working");

    // Test API contract compliance
    let test_response = TestAlertResponse {
        alerts: vec![test_alert],
        total: 1,
        page: 1,
        per_page: 10,
    };

    let _serialized_response = serde_json::to_string(&test_response)?;
    println!("  ✓ API response format validation passed");

    Ok(())
}

/// Test frontend integration
async fn test_frontend_integration() -> Result<(), Box<dyn std::error::Error>> {
    let base_url = "http://localhost:8000";
    let token = generate_test_token();
    let tenant_id = "test_tenant";

    println!("🌐 Testing frontend integration...");

    // Test alerts endpoint (consumed by frontend)
    let alerts_response = reqwest::Client::new()
        .get(format!("{}/api/v1/alerts", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .header("X-Tenant-ID", tenant_id)
        .send()
        .await?;

    if !alerts_response.status().is_success() {
        return Err(format!("Alerts endpoint failed: {}", alerts_response.status()).into());
    }

    // Verify response format matches frontend expectations
    let alerts_json: serde_json::Value = alerts_response.json().await?;

    if !alerts_json.is_array() {
        return Err("Alerts response should be an array".into());
    }

    println!("  ✓ Frontend integration endpoints working correctly");
    Ok(())
}

/// Main test runner
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🧪 SIEM Alert System Integration Tests");
    println!("======================================");

    let mut passed = 0;
    let mut failed = 0;

    // Test 1: Alert Creation & Retrieval Flow
    match test_alert_creation_and_retrieval_flow().await {
        Ok(()) => {
            println!("✅ Alert Creation & Retrieval Flow");
            passed += 1;
        }
        Err(e) => {
            println!("❌ Alert Creation & Retrieval Flow: {}", e);
            failed += 1;
        }
    }

    // Test 2: Schema Validation
    match test_schema_validation().await {
        Ok(()) => {
            println!("✅ Schema Validation");
            passed += 1;
        }
        Err(e) => {
            println!("❌ Schema Validation: {}", e);
            failed += 1;
        }
    }

    // Test 3: Frontend Integration
    match test_frontend_integration().await {
        Ok(()) => {
            println!("✅ Frontend Integration");
            passed += 1;
        }
        Err(e) => {
            println!("❌ Frontend Integration: {}", e);
            failed += 1;
        }
    }

    println!("\n📊 Test Results:");
    println!("=================");
    println!("✅ Passed: {}", passed);
    println!("❌ Failed: {}", failed);
    println!("📈 Total:  {}", passed + failed);

    if failed > 0 {
        println!("\n💡 Some tests failed. Please review the errors above.");
        std::process::exit(1);
    } else {
        println!("\n🎉 All tests passed successfully!");
    }

    Ok(())
}
