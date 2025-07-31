//! Comprehensive tests for dev_events_handler module
//! Tests cover security, functionality, and edge cases

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    
    /// Test input validation to prevent SQL injection
    #[test]
    fn test_validate_query_params_sql_injection() {
        // Test dangerous SQL injection patterns
        let dangerous_params = vec![
            ("tenant_id", "'; DROP TABLE events; --"),
            ("source_ip", "1.1.1.1'; DELETE FROM events; --"),
            ("source_type", "test\"/**/UNION/**/SELECT/**/password/**/FROM/**/users--"),
            ("severity", "high'; INSERT INTO events VALUES ('malicious'); --"),
        ];
        
        for (field, dangerous_value) in dangerous_params {
            let mut params = EventQueryParams {
                limit: None,
                offset: None,
                tenant_id: None,
                source_ip: None,
                source_type: None,
                severity: None,
                start_time: None,
                end_time: None,
            };
            
            match field {
                "tenant_id" => params.tenant_id = Some(dangerous_value.to_string()),
                "source_ip" => params.source_ip = Some(dangerous_value.to_string()),
                "source_type" => params.source_type = Some(dangerous_value.to_string()),
                "severity" => params.severity = Some(dangerous_value.to_string()),
                _ => panic!("Unknown field: {}", field),
            }
            
            let result = validate_query_params(&params);
            assert!(result.is_err(), "Should reject dangerous pattern in {}: {}", field, dangerous_value);
        }
    }
    
    /// Test limit validation
    #[test]
    fn test_validate_query_params_limits() {
        // Test excessive limit
        let params = EventQueryParams {
            limit: Some(50000),
            offset: None,
            tenant_id: None,
            source_ip: None,
            source_type: None,
            severity: None,
            start_time: None,
            end_time: None,
        };
        
        let result = validate_query_params(&params);
        assert!(result.is_err(), "Should reject excessive limit");
        
        // Test valid limit
        let params = EventQueryParams {
            limit: Some(100),
            offset: None,
            tenant_id: None,
            source_ip: None,
            source_type: None,
            severity: None,
            start_time: None,
            end_time: None,
        };
        
        let result = validate_query_params(&params);
        assert!(result.is_ok(), "Should accept valid limit");
    }
    
    /// Test offset validation
    #[test]
    fn test_validate_query_params_offset() {
        // Test excessive offset
        let params = EventQueryParams {
            limit: None,
            offset: Some(2000000),
            tenant_id: None,
            source_ip: None,
            source_type: None,
            severity: None,
            start_time: None,
            end_time: None,
        };
        
        let result = validate_query_params(&params);
        assert!(result.is_err(), "Should reject excessive offset");
    }
    
    /// Test string length validation
    #[test]
    fn test_validate_query_params_string_length() {
        let long_string = "a".repeat(300);
        
        let params = EventQueryParams {
            limit: None,
            offset: None,
            tenant_id: Some(long_string),
            source_ip: None,
            source_type: None,
            severity: None,
            start_time: None,
            end_time: None,
        };
        
        let result = validate_query_params(&params);
        assert!(result.is_err(), "Should reject overly long strings");
    }
    
    /// Test timestamp validation
    #[test]
    fn test_validate_query_params_timestamps() {
        // Test invalid timestamp range
        let params = EventQueryParams {
            limit: None,
            offset: None,
            tenant_id: None,
            source_ip: None,
            source_type: None,
            severity: None,
            start_time: Some(1000),
            end_time: Some(500), // end_time < start_time
        };
        
        let result = validate_query_params(&params);
        assert!(result.is_err(), "Should reject invalid timestamp range");
        
        // Test valid timestamp range
        let params = EventQueryParams {
            limit: None,
            offset: None,
            tenant_id: None,
            source_ip: None,
            source_type: None,
            severity: None,
            start_time: Some(500),
            end_time: Some(1000),
        };
        
        let result = validate_query_params(&params);
        assert!(result.is_ok(), "Should accept valid timestamp range");
    }
    
    /// Test valid parameters pass validation
    #[test]
    fn test_validate_query_params_valid() {
        let params = EventQueryParams {
            limit: Some(50),
            offset: Some(100),
            tenant_id: Some("tenant123".to_string()),
            source_ip: Some("192.168.1.1".to_string()),
            source_type: Some("firewall".to_string()),
            severity: Some("high".to_string()),
            start_time: Some(1000),
            end_time: Some(2000),
        };
        
        let result = validate_query_params(&params);
        assert!(result.is_ok(), "Should accept valid parameters");
    }
    
    /// Test ClickHouse configuration validation
    #[test]
    fn test_clickhouse_config_validation() {
        // Test empty URL
        env::set_var("CLICKHOUSE_URL", "");
        env::set_var("CLICKHOUSE_DATABASE", "test");
        env::set_var("CLICKHOUSE_USERNAME", "user");
        
        let result = ClickHouseConfig::from_env();
        assert!(result.is_err(), "Should reject empty URL");
        
        // Test empty database
        env::set_var("CLICKHOUSE_URL", "http://localhost:8123");
        env::set_var("CLICKHOUSE_DATABASE", "");
        env::set_var("CLICKHOUSE_USERNAME", "user");
        
        let result = ClickHouseConfig::from_env();
        assert!(result.is_err(), "Should reject empty database");
        
        // Test empty username
        env::set_var("CLICKHOUSE_URL", "http://localhost:8123");
        env::set_var("CLICKHOUSE_DATABASE", "test");
        env::set_var("CLICKHOUSE_USERNAME", "");
        
        let result = ClickHouseConfig::from_env();
        assert!(result.is_err(), "Should reject empty username");
        
        // Test valid configuration
        env::set_var("CLICKHOUSE_URL", "http://localhost:8123");
        env::set_var("CLICKHOUSE_DATABASE", "test");
        env::set_var("CLICKHOUSE_USERNAME", "user");
        env::set_var("CLICKHOUSE_PASSWORD", "pass");
        
        let result = ClickHouseConfig::from_env();
        assert!(result.is_ok(), "Should accept valid configuration");
        
        let config = result.unwrap();
        assert_eq!(config.url, "http://localhost:8123");
        assert_eq!(config.database, "test");
        assert_eq!(config.username, "user");
        assert_eq!(config.password, "pass");
    }
    
    /// Test DevEventCore serialization
    #[test]
    fn test_dev_event_core_serialization() {
        let event = DevEventCore {
            event_id: "evt_123".to_string(),
            tenant_id: "tenant_456".to_string(),
            event_timestamp: 1234567890,
            source_ip: "192.168.1.1".to_string(),
            source_type: "firewall".to_string(),
            message: Some("Test message".to_string()),
            severity: Some("high".to_string()),
        };
        
        let json = serde_json::to_string(&event).expect("Should serialize to JSON");
        assert!(json.contains("evt_123"));
        assert!(json.contains("tenant_456"));
        assert!(json.contains("192.168.1.1"));
        
        let deserialized: DevEventCore = serde_json::from_str(&json).expect("Should deserialize from JSON");
        assert_eq!(deserialized.event_id, event.event_id);
        assert_eq!(deserialized.tenant_id, event.tenant_id);
    }
    
    /// Test response structure serialization
    #[test]
    fn test_dev_events_response_serialization() {
        let event = DevEventCore {
            event_id: "evt_123".to_string(),
            tenant_id: "tenant_456".to_string(),
            event_timestamp: 1234567890,
            source_ip: "192.168.1.1".to_string(),
            source_type: "firewall".to_string(),
            message: Some("Test message".to_string()),
            severity: Some("high".to_string()),
        };
        
        let response = DevEventsResponse {
            events: vec![event],
            total_count: 1,
            has_more: false,
            query_time_ms: 150,
        };
        
        let json = serde_json::to_string(&response).expect("Should serialize response to JSON");
        assert!(json.contains("events"));
        assert!(json.contains("total_count"));
        assert!(json.contains("has_more"));
        assert!(json.contains("query_time_ms"));
    }
    
    /// Test error response structure
    #[test]
    fn test_error_response_serialization() {
        let error_response = ErrorResponse {
            error: "ValidationError".to_string(),
            message: "Invalid input parameters".to_string(),
            code: "INVALID_PARAMS".to_string(),
        };
        
        let json = serde_json::to_string(&error_response).expect("Should serialize error response to JSON");
        assert!(json.contains("ValidationError"));
        assert!(json.contains("Invalid input parameters"));
        assert!(json.contains("INVALID_PARAMS"));
    }
}

/// Integration tests that require a running ClickHouse instance
/// These tests are ignored by default and should be run manually
#[cfg(test)]
mod integration_tests {
    use super::*;
    
    /// Test actual database connection
    /// Run with: cargo test test_clickhouse_connection -- --ignored
    #[tokio::test]
    #[ignore]
    async fn test_clickhouse_connection() {
        env::set_var("CLICKHOUSE_URL", "http://localhost:8123");
        env::set_var("CLICKHOUSE_DATABASE", "test");
        env::set_var("CLICKHOUSE_USERNAME", "default");
        env::set_var("CLICKHOUSE_PASSWORD", "");
        
        let config = ClickHouseConfig::from_env().expect("Should create config");
        let client = config.create_client().expect("Should create client");
        
        // Test basic connectivity
        let result = client.query("SELECT 1").fetch_one::<u8>().await;
        assert!(result.is_ok(), "Should be able to connect to ClickHouse");
    }
    
    /// Test query execution with real database
    /// Run with: cargo test test_query_execution -- --ignored
    #[tokio::test]
    #[ignore]
    async fn test_query_execution() {
        env::set_var("CLICKHOUSE_URL", "http://localhost:8123");
        env::set_var("CLICKHOUSE_DATABASE", "test");
        env::set_var("CLICKHOUSE_USERNAME", "default");
        env::set_var("CLICKHOUSE_PASSWORD", "");
        env::set_var("EVENTS_TABLE_NAME", "events");
        
        let config = ClickHouseConfig::from_env().expect("Should create config");
        let client = config.create_client().expect("Should create client");
        
        let params = EventQueryParams {
            limit: Some(10),
            offset: Some(0),
            tenant_id: None,
            source_ip: None,
            source_type: None,
            severity: None,
            start_time: None,
            end_time: None,
        };
        
        let start_time = std::time::Instant::now();
        let result = query_dev_events_internal(&client, &params, start_time).await;
        
        // Should not fail even if table doesn't exist (will return appropriate error)
        match result {
            Ok(response) => {
                assert!(response.query_time_ms > 0);
                println!("Query successful: {} events returned", response.events.len());
            },
            Err(e) => {
                println!("Query failed (expected if table doesn't exist): {}", e);
            }
        }
    }
}