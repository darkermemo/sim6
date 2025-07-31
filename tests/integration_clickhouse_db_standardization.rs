//! Integration tests for ClickHouse database standardization
//! Tests the complete ingest → search flow with the standardized 'dev' database

use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time::sleep;

/// Test configuration
struct TestConfig {
    api_url: String,
    ingestor_url: String,
    clickhouse_url: String,
    clickhouse_database: String,
    admin_token: String,
}

impl TestConfig {
    fn from_env() -> Self {
        Self {
            api_url: env::var("API_URL").unwrap_or_else(|_| "http://localhost:8080".to_string()),
            ingestor_url: env::var("INGESTOR_URL").unwrap_or_else(|_| "http://localhost:8081".to_string()),
            clickhouse_url: env::var("CLICKHOUSE_URL").unwrap_or_else(|_| "http://localhost:8123".to_string()),
            clickhouse_database: env::var("CLICKHOUSE_DATABASE").unwrap_or_else(|_| "dev".to_string()),
            admin_token: env::var("ADMIN_TOKEN").unwrap_or_else(|_| "admin-token-12345-change-in-production".to_string()),
        }
    }
}

/// Test event structure
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
struct TestEvent {
    timestamp: u64,
    event_type: String,
    source_ip: String,
    dest_ip: String,
    protocol: String,
    action: String,
    severity: String,
    message: String,
    tenant_id: String,
    vendor: String,
    product: String,
}

impl TestEvent {
    fn new_test_event() -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        Self {
            timestamp: now,
            event_type: "network_traffic".to_string(),
            source_ip: "192.168.1.100".to_string(),
            dest_ip: "10.0.0.50".to_string(),
            protocol: "TCP".to_string(),
            action: "allowed".to_string(),
            severity: "medium".to_string(),
            message: "Test event for database standardization validation".to_string(),
            tenant_id: "test-tenant".to_string(),
            vendor: "test-vendor".to_string(),
            product: "integration-test".to_string(),
        }
    }
}

/// HTTP client for making API requests
struct ApiClient {
    client: reqwest::Client,
    config: TestConfig,
}

impl ApiClient {
    fn new(config: TestConfig) -> Self {
        Self {
            client: reqwest::Client::new(),
            config,
        }
    }

    async fn health_check(&self) -> Result<bool, Box<dyn std::error::Error>> {
        let response = self
            .client
            .get(&format!("{}/health", self.config.api_url))
            .timeout(Duration::from_secs(5))
            .send()
            .await?;
        
        Ok(response.status().is_success())
    }

    async fn ingest_event(&self, event: &TestEvent) -> Result<Value, Box<dyn std::error::Error>> {
        let response = self
            .client
            .post(&format!("{}/api/v1/events/ingest", self.config.ingestor_url))
            .header("Authorization", format!("Bearer {}", self.config.admin_token))
            .header("Content-Type", "application/json")
            .json(event)
            .timeout(Duration::from_secs(10))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("Ingest failed with status: {}", response.status()).into());
        }

        let result: Value = response.json().await?;
        Ok(result)
    }

    async fn search_events(&self, query: &str) -> Result<Value, Box<dyn std::error::Error>> {
        let search_payload = json!({
            "query": query,
            "limit": 100,
            "offset": 0
        });

        let response = self
            .client
            .post(&format!("{}/api/v1/events/search", self.config.api_url))
            .header("Authorization", format!("Bearer {}", self.config.admin_token))
            .header("Content-Type", "application/json")
            .json(&search_payload)
            .timeout(Duration::from_secs(10))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("Search failed with status: {}", response.status()).into());
        }

        let result: Value = response.json().await?;
        Ok(result)
    }

    async fn verify_clickhouse_database(&self) -> Result<bool, Box<dyn std::error::Error>> {
        let query = format!("SELECT count() FROM system.databases WHERE name = '{}'", self.config.clickhouse_database);
        
        let response = self
            .client
            .post(&self.config.clickhouse_url)
            .body(query)
            .timeout(Duration::from_secs(5))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("ClickHouse query failed with status: {}", response.status()).into());
        }

        let result = response.text().await?;
        let count: u32 = result.trim().parse().unwrap_or(0);
        
        Ok(count > 0)
    }

    async fn get_table_count(&self, table: &str) -> Result<u64, Box<dyn std::error::Error>> {
        let query = format!("SELECT count() FROM {}.{}", self.config.clickhouse_database, table);
        
        let response = self
            .client
            .post(&self.config.clickhouse_url)
            .body(query)
            .timeout(Duration::from_secs(5))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("ClickHouse count query failed with status: {}", response.status()).into());
        }

        let result = response.text().await?;
        let count: u64 = result.trim().parse().unwrap_or(0);
        
        Ok(count)
    }
}

/// Main integration test suite
struct IntegrationTestSuite {
    client: ApiClient,
    test_event: TestEvent,
}

impl IntegrationTestSuite {
    fn new() -> Self {
        let config = TestConfig::from_env();
        let client = ApiClient::new(config);
        let test_event = TestEvent::new_test_event();
        
        Self {
            client,
            test_event,
        }
    }

    async fn test_service_health(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("🔍 Testing service health...");
        
        let is_healthy = self.client.health_check().await?;
        if !is_healthy {
            return Err("API health check failed".into());
        }
        
        println!("✅ API service is healthy");
        Ok(())
    }

    async fn test_clickhouse_database_exists(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("🔍 Testing ClickHouse database exists...");
        
        let db_exists = self.client.verify_clickhouse_database().await?;
        if !db_exists {
            return Err(format!("ClickHouse database '{}' does not exist", self.client.config.clickhouse_database).into());
        }
        
        println!("✅ ClickHouse database '{}' exists", self.client.config.clickhouse_database);
        Ok(())
    }

    async fn test_ingest_event(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("🔍 Testing event ingestion...");
        
        let result = self.client.ingest_event(&self.test_event).await?;
        
        // Verify the response indicates success
        if let Some(status) = result.get("status") {
            if status != "success" {
                return Err(format!("Ingest returned non-success status: {}", status).into());
            }
        }
        
        println!("✅ Event ingested successfully");
        
        // Wait for event to be processed
        println!("⏳ Waiting for event processing...");
        sleep(Duration::from_secs(3)).await;
        
        Ok(())
    }

    async fn test_search_event(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("🔍 Testing event search...");
        
        // Search for our test event using multiple criteria
        let search_queries = vec![
            format!("source_ip = '{}'", self.test_event.source_ip),
            format!("dest_ip = '{}'", self.test_event.dest_ip),
            format!("vendor = '{}'", self.test_event.vendor),
            format!("message LIKE '%{}%'", "database standardization validation"),
        ];
        
        for query in search_queries {
            let result = self.client.search_events(&query).await?;
            
            // Verify we got results
            if let Some(events) = result.get("events") {
                if let Some(events_array) = events.as_array() {
                    if events_array.is_empty() {
                        return Err(format!("No events found for query: {}", query).into());
                    }
                    
                    // Verify our test event is in the results
                    let found_test_event = events_array.iter().any(|event| {
                        event.get("source_ip").and_then(|v| v.as_str()) == Some(&self.test_event.source_ip) &&
                        event.get("dest_ip").and_then(|v| v.as_str()) == Some(&self.test_event.dest_ip)
                    });
                    
                    if !found_test_event {
                        return Err(format!("Test event not found in search results for query: {}", query).into());
                    }
                    
                    println!("✅ Found {} events for query: {}", events_array.len(), query);
                } else {
                    return Err(format!("Invalid events format in search response for query: {}", query).into());
                }
            } else {
                return Err(format!("No events field in search response for query: {}", query).into());
            }
        }
        
        println!("✅ Event search successful - all queries returned expected results");
        Ok(())
    }

    async fn test_database_table_counts(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("🔍 Testing database table counts...");
        
        let tables = vec!["events", "alerts", "rules"];
        
        for table in tables {
            match self.client.get_table_count(table).await {
                Ok(count) => {
                    println!("✅ Table '{}.{}' has {} rows", self.client.config.clickhouse_database, table, count);
                }
                Err(e) => {
                    println!("⚠️  Could not query table '{}.{}': {}", self.client.config.clickhouse_database, table, e);
                    // Don't fail the test if table doesn't exist, just warn
                }
            }
        }
        
        Ok(())
    }

    async fn run_all_tests(&self) -> Result<(), Box<dyn std::error::Error>> {
        println!("🧪 Starting ClickHouse Database Standardization Integration Tests");
        println!("==================================================================");
        println!("Database: {}", self.client.config.clickhouse_database);
        println!("API URL: {}", self.client.config.api_url);
        println!("Ingestor URL: {}", self.client.config.ingestor_url);
        println!("ClickHouse URL: {}", self.client.config.clickhouse_url);
        println!();
        
        // Run tests in sequence
        self.test_service_health().await?;
        self.test_clickhouse_database_exists().await?;
        self.test_database_table_counts().await?;
        self.test_ingest_event().await?;
        self.test_search_event().await?;
        
        println!();
        println!("🎉 All integration tests passed successfully!");
        println!("✅ ClickHouse database standardization is working correctly");
        println!("✅ Ingest → Search flow is functional with '{}' database", self.client.config.clickhouse_database);
        
        Ok(())
    }
}

/// Main test runner
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load environment variables from .env if it exists
    if let Ok(entries) = std::fs::read_to_string(".env") {
        for line in entries.lines() {
            if let Some((key, value)) = line.split_once('=') {
                if !key.starts_with('#') && !key.trim().is_empty() {
                    env::set_var(key.trim(), value.trim());
                }
            }
        }
    }
    
    let test_suite = IntegrationTestSuite::new();
    
    match test_suite.run_all_tests().await {
        Ok(()) => {
            println!("\n📊 Integration Test Results:");
            println!("=============================");
            println!("✅ Status: ALL TESTS PASSED");
            println!("✅ Database Standardization: VERIFIED");
            println!("✅ Ingest → Search Flow: FUNCTIONAL");
            println!("✅ ClickHouse Integration: WORKING");
            std::process::exit(0);
        }
        Err(e) => {
            println!("\n📊 Integration Test Results:");
            println!("=============================");
            println!("❌ Status: TESTS FAILED");
            println!("❌ Error: {}", e);
            println!("\n💡 Please check:");
            println!("   - All services are running (API, Ingestor, ClickHouse)");
            println!("   - Environment variables are set correctly");
            println!("   - Database '{}' exists and is accessible", env::var("CLICKHOUSE_DATABASE").unwrap_or_else(|_| "dev".to_string()));
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Run with: cargo test test_integration_suite -- --ignored
    async fn test_integration_suite() {
        let test_suite = IntegrationTestSuite::new();
        test_suite.run_all_tests().await.expect("Integration tests should pass");
    }

    #[test]
    fn test_config_from_env() {
        env::set_var("CLICKHOUSE_DATABASE", "test_db");
        let config = TestConfig::from_env();
        assert_eq!(config.clickhouse_database, "test_db");
    }

    #[test]
    fn test_event_creation() {
        let event = TestEvent::new_test_event();
        assert_eq!(event.vendor, "test-vendor");
        assert_eq!(event.source_ip, "192.168.1.100");
        assert!(event.timestamp > 0);
    }
}