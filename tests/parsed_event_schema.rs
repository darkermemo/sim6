//! ParsedEvent Schema Tests
//!
//! This module contains comprehensive tests for the ParsedEvent struct to ensure
//! proper deserialization, field mapping, and schema compliance with ECS/CIM/UDM standards.

use chrono::Utc;
use serde_json::json;

// Import the ParsedEvent from the main crate
use siem_schema_validator::parsed_event::ParsedEvent;

#[cfg(test)]
mod tests {
    use super::*;

    /// Test 1: Basic Network Event Deserialization
    /// Validates that a network security event with source/destination IPs and ports
    /// can be properly deserialized into the ParsedEvent struct
    #[test]
    fn test_network_event_deserialization() {
        let json_data = json!({
            "@timestamp": "2024-01-15T10:30:45.123Z",
            "source.ip": "192.168.1.100",
            "destination.ip": "10.0.0.50",
            "source.port": 54321,
            "destination.port": 443,
            "network.protocol": "TCP",
            "event.action": "connection_established",
            "event.outcome": "success"
        });

        let event: ParsedEvent =
            serde_json::from_value(json_data).expect("Failed to deserialize network event");

        assert_eq!(event.source_ip, Some("192.168.1.100".to_string()));
        assert_eq!(event.destination_ip, Some("10.0.0.50".to_string()));
        assert_eq!(event.source_port, Some(54321));
        assert_eq!(event.destination_port, Some(443));
        assert_eq!(event.protocol, Some("TCP".to_string()));
        assert_eq!(
            event.event_action,
            Some("connection_established".to_string())
        );
        assert_eq!(event.event_outcome, Some("success".to_string()));
        assert!(event.timestamp.is_some());
        assert!(event.is_network_event());
    }

    /// Test 2: Web Application Event Deserialization
    /// Validates that HTTP/web events with status codes, URLs, and user agents
    /// are properly mapped to canonical fields
    #[test]
    fn test_web_event_deserialization() {
        let json_data = json!({
            "@timestamp": "2024-01-15T14:22:33.456Z",
            "source.ip": "203.0.113.45",
            "http.response.status_code": 404,
            "url.original": "https://example.com/admin/login",
            "http.request.method": "POST",
            "user_agent.original": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "user.name": "admin",
            "event.action": "http_request",
            "log.level": "warning"
        });

        let event: ParsedEvent =
            serde_json::from_value(json_data).expect("Failed to deserialize web event");

        assert_eq!(event.source_ip, Some("203.0.113.45".to_string()));
        assert_eq!(event.http_response_status_code, Some(404));
        assert_eq!(
            event.url_original,
            Some("https://example.com/admin/login".to_string())
        );
        assert_eq!(event.http_method, Some("POST".to_string()));
        assert_eq!(
            event.user_agent,
            Some("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36".to_string())
        );
        assert_eq!(event.user_name, Some("admin".to_string()));
        assert_eq!(event.event_action, Some("http_request".to_string()));
        assert_eq!(event.log_level, Some("warning".to_string()));
        assert!(event.is_web_event());
    }

    /// Test 3: Process/Endpoint Event Deserialization
    /// Validates that process execution events with PIDs, file paths, and hashes
    /// are correctly mapped to the canonical schema
    #[test]
    fn test_process_event_deserialization() {
        let json_data = json!({
            "@timestamp": "2024-01-15T09:15:22.789Z",
            "host.name": "workstation-01",
            "process.name": "powershell.exe",
            "process.pid": 4567,
            "file.path": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
            "file.name": "powershell.exe",
            "file.hash.sha256": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
            "user.name": "alice.smith",
            "event.action": "process_creation",
            "event.id": "proc-2024-001",
            "log.level": "info"
        });

        let event: ParsedEvent =
            serde_json::from_value(json_data).expect("Failed to deserialize process event");

        assert_eq!(event.host_name, Some("workstation-01".to_string()));
        assert_eq!(event.process_name, Some("powershell.exe".to_string()));
        assert_eq!(event.process_pid, Some(4567));
        assert_eq!(
            event.file_path,
            Some("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe".to_string())
        );
        assert_eq!(event.file_name, Some("powershell.exe".to_string()));
        assert_eq!(
            event.file_hash_sha256,
            Some("a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456".to_string())
        );
        assert_eq!(event.user_name, Some("alice.smith".to_string()));
        assert_eq!(event.event_action, Some("process_creation".to_string()));
        assert_eq!(event.event_id, Some("proc-2024-001".to_string()));
        assert_eq!(event.log_level, Some("info".to_string()));
        assert!(event.is_process_event());
    }

    /// Test 4: Security Event with Additional Fields
    /// Validates that security events with threat indicators and custom fields
    /// are properly handled, including the additional_fields fallback bucket
    #[test]
    fn test_security_event_with_additional_fields() {
        let json_data = json!({
            "@timestamp": "2024-01-15T16:45:12.321Z",
            "source.ip": "198.51.100.25",
            "destination.ip": "192.168.10.100",
            "rule.id": "IDS-001",
            "rule.name": "Suspicious Network Activity",
            "threat.indicator.name": "Malware.Generic.Trojan",
            "observer.vendor": "Snort",
            "observer.product": "IDS",
            "observer.version": "2.9.20",
            "event.action": "intrusion_detected",
            "log.level": "critical",
            "custom_severity_score": 95,
            "attack_vector": "network",
            "ioc_type": "ip_address",
            "analyst_notes": "Confirmed malicious activity from known botnet"
        });

        let event: ParsedEvent =
            serde_json::from_value(json_data).expect("Failed to deserialize security event");

        // Test canonical fields
        assert_eq!(event.source_ip, Some("198.51.100.25".to_string()));
        assert_eq!(event.destination_ip, Some("192.168.10.100".to_string()));
        assert_eq!(event.rule_id, Some("IDS-001".to_string()));
        assert_eq!(
            event.rule_name,
            Some("Suspicious Network Activity".to_string())
        );
        assert_eq!(
            event.threat_name,
            Some("Malware.Generic.Trojan".to_string())
        );
        assert_eq!(event.device_vendor, Some("Snort".to_string()));
        assert_eq!(event.device_product, Some("IDS".to_string()));
        assert_eq!(event.device_version, Some("2.9.20".to_string()));
        assert_eq!(event.event_action, Some("intrusion_detected".to_string()));
        assert_eq!(event.log_level, Some("critical".to_string()));

        // Test additional fields (custom fields that don't have canonical mappings)
        assert_eq!(event.get_field("custom_severity_score"), Some(&json!(95)));
        assert_eq!(event.get_field("attack_vector"), Some(&json!("network")));
        assert_eq!(event.get_field("ioc_type"), Some(&json!("ip_address")));
        assert_eq!(
            event.get_field("analyst_notes"),
            Some(&json!("Confirmed malicious activity from known botnet"))
        );
    }

    /// Test 5: Complete Event Lifecycle and Validation
    /// Validates the complete event processing lifecycle including creation,
    /// modification, serialization, and validation of all field types
    #[test]
    fn test_complete_event_lifecycle_and_validation() {
        // Create event programmatically
        let mut event = ParsedEvent::with_timestamp(Utc::now());

        // Set various field types
        event
            .set_source_ip("172.16.0.100")
            .set_destination_ip("8.8.8.8")
            .set_user_name("security.analyst")
            .set_event_action("dns_query")
            .add_field("query_type", "A")
            .add_field("response_code", 0)
            .add_field("query_domain", "malicious-domain.com")
            .add_field("blocked", true);

        // Set additional canonical fields
        event.source_port = Some(53124);
        event.destination_port = Some(53);
        event.protocol = Some("UDP".to_string());
        event.log_level = Some("info".to_string());
        event.event_outcome = Some("success".to_string());
        event.host_name = Some("dns-server-01".to_string());

        // Validate field types and values
        assert!(event.has_timestamp());
        assert!(event.is_network_event());
        assert_eq!(event.source_port, Some(53124));
        assert_eq!(event.destination_port, Some(53));
        assert_eq!(event.get_severity(), Some("info"));

        // Test serialization to JSON
        let json_string = event.to_json().expect("Failed to serialize event");
        assert!(json_string.contains("172.16.0.100"));
        assert!(json_string.contains("dns_query"));
        assert!(json_string.contains("malicious-domain.com"));

        // Test deserialization from JSON
        let deserialized_event =
            ParsedEvent::from_json(&json_string).expect("Failed to deserialize event");

        // Validate round-trip consistency
        assert_eq!(event.source_ip, deserialized_event.source_ip);
        assert_eq!(event.destination_ip, deserialized_event.destination_ip);
        assert_eq!(event.user_name, deserialized_event.user_name);
        assert_eq!(event.event_action, deserialized_event.event_action);
        assert_eq!(event.source_port, deserialized_event.source_port);
        assert_eq!(event.destination_port, deserialized_event.destination_port);
        assert_eq!(
            event.additional_fields,
            deserialized_event.additional_fields
        );

        // Validate additional fields preservation
        assert_eq!(
            deserialized_event.get_field("query_type"),
            Some(&json!("A"))
        );
        assert_eq!(
            deserialized_event.get_field("response_code"),
            Some(&json!(0))
        );
        assert_eq!(
            deserialized_event.get_field("query_domain"),
            Some(&json!("malicious-domain.com"))
        );
        assert_eq!(deserialized_event.get_field("blocked"), Some(&json!(true)));

        // Test pretty JSON formatting
        let pretty_json = event
            .to_json_pretty()
            .expect("Failed to serialize pretty JSON");
        assert!(pretty_json.contains("\n")); // Should contain newlines for formatting
        assert!(pretty_json.len() > json_string.len()); // Should be longer due to formatting
    }
}
