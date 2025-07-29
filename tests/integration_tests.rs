use std::collections::HashMap;
use tokio::time::{sleep, Duration};
use uuid::Uuid;
use chrono::Utc;
use serde_json::json;
use reqwest::Client;
use siem_unified_pipeline::{
    config::PipelineConfig,
    handlers::*,
    schemas::*,
    routing::RoutingRule,
    pipeline::PipelineEvent,
};

// Test configuration and setup
struct TestSetup {
    client: Client,
    base_url: String,
}

impl TestSetup {
    fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "http://localhost:8080".to_string(),
        }
    }

    async fn post_json(&self, endpoint: &str, body: serde_json::Value) -> reqwest::Response {
        self.client
            .post(&format!("{}{}", self.base_url, endpoint))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .expect("Failed to send request")
    }

    async fn get(&self, endpoint: &str) -> reqwest::Response {
        self.client
            .get(&format!("{}{}", self.base_url, endpoint))
            .send()
            .await
            .expect("Failed to send request")
    }

    async fn get_with_query(&self, endpoint: &str, query: &[(String, String)]) -> reqwest::Response {
        self.client
            .get(&format!("{}{}", self.base_url, endpoint))
            .query(query)
            .send()
            .await
            .expect("Failed to send request")
    }
}

#[tokio::test]
async fn test_events_ingest_happy_path() {
    let setup = TestSetup::new();
    
    // Create a test event for ingestion
    let test_event = json!({
        "timestamp": Utc::now().to_rfc3339(),
        "source": "test-source",
        "source_type": "syslog",
        "severity": "info",
        "facility": "local0",
        "hostname": "test-host",
        "process": "test-process",
        "message": "Test log message for integration test",
        "raw_message": "<14>Jan 1 12:00:00 test-host test-process: Test log message for integration test",
        "source_ip": "192.168.1.100",
        "source_port": 514,
        "protocol": "udp",
        "tags": ["test", "integration"],
        "fields": {
            "custom_field": "custom_value",
            "event_id": "test-001"
        }
    });

    let response = setup.post_json("/events/ingest", test_event).await;
    
    // Assert successful ingestion
    assert_eq!(response.status(), 200, "Event ingestion should succeed");
    
    let response_body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert!(response_body.get("event_id").is_some(), "Response should contain event_id");
    assert_eq!(response_body["status"], "ingested", "Event should be marked as ingested");
}

#[tokio::test]
async fn test_events_ingest_error_path() {
    let setup = TestSetup::new();
    
    // Create an invalid event (missing required fields)
    let invalid_event = json!({
        "message": "Incomplete event missing required fields"
    });

    let response = setup.post_json("/events/ingest", invalid_event).await;
    
    // Assert validation error
    assert_eq!(response.status(), 400, "Invalid event should return 400 Bad Request");
    
    let response_body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert!(response_body.get("error").is_some(), "Response should contain error message");
    assert!(response_body["error"].as_str().unwrap().contains("validation"), "Error should mention validation");
}

#[tokio::test]
async fn test_events_search_happy_path() {
    let setup = TestSetup::new();
    
    // First, ingest a test event to search for
    let test_event = json!({
        "timestamp": Utc::now().to_rfc3339(),
        "source": "search-test-source",
        "source_type": "security",
        "severity": "warning",
        "facility": "auth",
        "hostname": "search-test-host",
        "process": "search-test-process",
        "message": "Searchable test event for integration testing",
        "raw_message": "<38>Jan 1 12:00:00 search-test-host search-test-process: Searchable test event",
        "source_ip": "10.0.0.50",
        "source_port": 22,
        "protocol": "tcp",
        "tags": ["security", "search-test"],
        "fields": {
            "user": "test-user",
            "action": "login_attempt"
        }
    });
    
    // Ingest the event first
    let ingest_response = setup.post_json("/events/ingest", test_event).await;
    assert_eq!(ingest_response.status(), 200, "Event ingestion should succeed before search");
    
    // Wait a moment for indexing
    sleep(Duration::from_millis(100)).await;
    
    // Search for the event
    let search_params = vec![
        ("source".to_string(), "search-test-source".to_string()),
        ("severity".to_string(), "warning".to_string()),
        ("limit".to_string(), "10".to_string()),
    ];
    
    let response = setup.get_with_query("/events/search", &search_params).await;
    
    // Assert successful search
    assert_eq!(response.status(), 200, "Event search should succeed");
    
    let response_body: EventSearchResponse = response.json().await.expect("Failed to parse search response");
    assert!(response_body.total > 0, "Search should return at least one event");
    assert!(!response_body.events.is_empty(), "Events array should not be empty");
    assert!(response_body.query_time_ms > 0.0, "Query time should be positive");
    
    // Verify the returned event matches our search criteria
    let found_event = &response_body.events[0];
    assert_eq!(found_event.source, "search-test-source", "Returned event should match search criteria");
    assert_eq!(found_event.severity, "warning", "Returned event should match severity filter");
}

#[tokio::test]
async fn test_events_search_error_path() {
    let setup = TestSetup::new();
    
    // Search with invalid parameters (invalid IP format)
    let invalid_search_params = vec![
        ("source_ip".to_string(), "invalid-ip-format".to_string()),
        ("limit".to_string(), "5000".to_string()), // Exceeds maximum limit
    ];
    
    let response = setup.get_with_query("/events/search", &invalid_search_params).await;
    
    // Assert validation error
    assert_eq!(response.status(), 400, "Invalid search parameters should return 400 Bad Request");
    
    let response_body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert!(response_body.get("error").is_some(), "Response should contain error message");
}

#[tokio::test]
async fn test_routing_rules_happy_path() {
    let setup = TestSetup::new();
    
    // Test creating a new routing rule
    let new_rule = json!({
        "name": "Integration Test Rule",
        "description": "A test routing rule created during integration testing",
        "conditions": {
            "field": "severity",
            "operator": "equals",
            "value": "critical"
        },
        "actions": {
            "destinations": ["test-destination"]
        },
        "enabled": true,
        "priority": 100,
        "tags": ["test", "integration"]
    });
    
    // Create the rule
    let create_response = setup.post_json("/routing/rules", new_rule).await;
    assert_eq!(create_response.status(), 201, "Routing rule creation should succeed");
    
    let created_rule: RoutingRuleResponse = create_response.json().await.expect("Failed to parse created rule");
    assert_eq!(created_rule.name, "Integration Test Rule", "Created rule should have correct name");
    assert!(created_rule.enabled, "Created rule should be enabled");
    assert_eq!(created_rule.priority, 100, "Created rule should have correct priority");
    
    // Test retrieving all routing rules
    let list_response = setup.get("/routing/rules").await;
    assert_eq!(list_response.status(), 200, "Routing rules list should succeed");
    
    let rules_list: RoutingRulesListResponse = list_response.json().await.expect("Failed to parse rules list");
    assert!(rules_list.total > 0, "Should have at least one routing rule");
    assert!(!rules_list.rules.is_empty(), "Rules array should not be empty");
    
    // Verify our created rule is in the list
    let found_rule = rules_list.rules.iter().find(|r| r.name == "Integration Test Rule");
    assert!(found_rule.is_some(), "Created rule should be found in the list");
    
    // Test retrieving a specific rule by ID
    let rule_id = &created_rule.id;
    let get_response = setup.get(&format!("/routing/rules/{}", rule_id)).await;
    assert_eq!(get_response.status(), 200, "Getting specific rule should succeed");
    
    let retrieved_rule: RoutingRuleResponse = get_response.json().await.expect("Failed to parse retrieved rule");
    assert_eq!(retrieved_rule.id, created_rule.id, "Retrieved rule should have correct ID");
    assert_eq!(retrieved_rule.name, "Integration Test Rule", "Retrieved rule should have correct name");
}

#[tokio::test]
async fn test_routing_rules_error_path() {
    let setup = TestSetup::new();
    
    // Test creating a rule with invalid data (missing required fields)
    let invalid_rule = json!({
        "description": "Invalid rule missing name and conditions",
        "enabled": true
    });
    
    let create_response = setup.post_json("/routing/rules", invalid_rule).await;
    assert_eq!(create_response.status(), 400, "Invalid rule creation should return 400 Bad Request");
    
    let response_body: serde_json::Value = create_response.json().await.expect("Failed to parse response");
    assert!(response_body.get("error").is_some(), "Response should contain error message");
    
    // Test retrieving a non-existent rule
    let non_existent_id = "non-existent-rule-id";
    let get_response = setup.get(&format!("/routing/rules/{}", non_existent_id)).await;
    assert_eq!(get_response.status(), 404, "Getting non-existent rule should return 404 Not Found");
    
    let response_body: serde_json::Value = get_response.json().await.expect("Failed to parse response");
    assert!(response_body.get("error").is_some(), "Response should contain error message");
    assert!(response_body["error"].as_str().unwrap().contains("not found"), "Error should mention not found");
}

#[tokio::test]
async fn test_routing_rules_crud_operations() {
    let setup = TestSetup::new();
    
    // Create a rule
    let new_rule = json!({
        "name": "CRUD Test Rule",
        "description": "A rule for testing CRUD operations",
        "conditions": {
            "field": "source_type",
            "operator": "equals",
            "value": "test"
        },
        "actions": {
            "destinations": ["test-destination"]
        },
        "enabled": false,
        "priority": 50,
        "tags": ["crud", "test"]
    });
    
    let create_response = setup.post_json("/routing/rules", new_rule).await;
    assert_eq!(create_response.status(), 201, "Rule creation should succeed");
    
    let created_rule: RoutingRuleResponse = create_response.json().await.expect("Failed to parse created rule");
    let rule_id = created_rule.id.clone();
    
    // Update the rule
    let update_data = json!({
        "description": "Updated description for CRUD test",
        "enabled": true,
        "priority": 75
    });
    
    let update_response = setup.client
        .put(&format!("{}/routing/rules/{}", setup.base_url, rule_id))
        .header("Content-Type", "application/json")
        .json(&update_data)
        .send()
        .await
        .expect("Failed to send update request");
    
    assert_eq!(update_response.status(), 200, "Rule update should succeed");
    
    // Verify the update
    let get_response = setup.get(&format!("/routing/rules/{}", rule_id)).await;
    let updated_rule: RoutingRuleResponse = get_response.json().await.expect("Failed to parse updated rule");
    assert_eq!(updated_rule.description.unwrap(), "Updated description for CRUD test", "Description should be updated");
    assert!(updated_rule.enabled, "Rule should be enabled after update");
    assert_eq!(updated_rule.priority, 75, "Priority should be updated");
    
    // Delete the rule
    let delete_response = setup.client
        .delete(&format!("{}/routing/rules/{}", setup.base_url, rule_id))
        .send()
        .await
        .expect("Failed to send delete request");
    
    assert_eq!(delete_response.status(), 204, "Rule deletion should succeed");
    
    // Verify deletion
    let get_deleted_response = setup.get(&format!("/routing/rules/{}", rule_id)).await;
    assert_eq!(get_deleted_response.status(), 404, "Deleted rule should not be found");
}

// Helper function to run all tests
#[tokio::test]
async fn run_all_integration_tests() {
    // This test ensures all individual tests can be run together
    // In a real scenario, you might want to set up and tear down test data
    
    println!("Running integration tests for SIEM unified pipeline");
    
    // Test events ingestion
    test_events_ingest_happy_path().await;
    test_events_ingest_error_path().await;
    
    // Test events search
    test_events_search_happy_path().await;
    test_events_search_error_path().await;
    
    // Test routing rules
    test_routing_rules_happy_path().await;
    test_routing_rules_error_path().await;
    test_routing_rules_crud_operations().await;
    
    println!("All integration tests completed successfully");
}