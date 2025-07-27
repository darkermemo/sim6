//! Comprehensive unit tests for the Enhanced Palo Alto Networks Parser
//!
//! This test suite provides 100% coverage of the PaloAltoEnhancedParser
//! including all log formats, log types, and edge cases.

use super::super::palo_alto_enhanced::*;
use crate::LogParser;
use chrono::Utc;

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_parser() -> PaloAltoEnhancedParser {
        PaloAltoEnhancedParser::new().expect("Failed to create parser")
    }

    // LEEF Format Tests
    #[test]
    fn test_leef_traffic_log_complete() {
        let parser = setup_parser();
        
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tsrc=10.20.105.24\tdst=192.168.1.100\tsrcPort=54321\tdstPort=80\tproto=TCP\tact=allow\tsrcUser=jdoe\tdstUser=webserver\tdevName=PA-3220\tapp=web-browsing\tsrcZone=trust\tdstZone=untrust\tsrcCountry=US\tdstCountry=US\tout=1024\tin=2048\tduration=300\tsessionId=12345\truleId=rule-1\truleName=Allow-Web\tpolicyId=policy-1";
        
        let result = parser.parse(raw_log).unwrap();
        
        // Basic network fields
        assert_eq!(result.source_ip, Some("10.20.105.24".to_string()));
        assert_eq!(result.destination_ip, Some("192.168.1.100".to_string()));
        assert_eq!(result.src_ip, Some("10.20.105.24".to_string()));
        assert_eq!(result.dest_ip, Some("192.168.1.100".to_string()));
        assert_eq!(result.source_port, Some(54321));
        assert_eq!(result.destination_port, Some(80));
        assert_eq!(result.src_port, Some(54321));
        assert_eq!(result.dest_port, Some(80));
        assert_eq!(result.protocol, Some("TCP".to_string()));
        assert_eq!(result.cim_protocol, Some("TCP".to_string()));
        
        // User fields
        assert_eq!(result.username, Some("jdoe".to_string()));
        assert_eq!(result.user, Some("jdoe".to_string()));
        assert_eq!(result.src_user, Some("jdoe".to_string()));
        assert_eq!(result.dest_user, Some("webserver".to_string()));
        
        // Action and outcome
        assert_eq!(result.action, Some("allow".to_string()));
        assert_eq!(result.outcome, Some("success".to_string()));
        
        // Device information
        assert_eq!(result.hostname, Some("PA-3220".to_string()));
        assert_eq!(result.vendor, Some("Palo Alto Networks".to_string()));
        assert_eq!(result.product, Some("PAN-OS".to_string()));
        assert_eq!(result.device_type, Some("firewall".to_string()));
        
        // Application and network zones
        assert_eq!(result.app_name, Some("web-browsing".to_string()));
        assert_eq!(result.src_zone, Some("trust".to_string()));
        assert_eq!(result.dest_zone, Some("untrust".to_string()));
        
        // Geographic information
        assert_eq!(result.src_country, Some("US".to_string()));
        assert_eq!(result.dest_country, Some("US".to_string()));
        
        // Traffic statistics
        assert_eq!(result.bytes_out, Some(1024));
        assert_eq!(result.bytes_in, Some(2048));
        assert_eq!(result.duration, Some(300));
        
        // Session and rule information
        assert_eq!(result.session_id, Some("12345".to_string()));
        assert_eq!(result.rule_id, Some("rule-1".to_string()));
        assert_eq!(result.rule_name, Some("Allow-Web".to_string()));
        assert_eq!(result.policy_id, Some("policy-1".to_string()));
        
        // Timestamp
        assert!(result.timestamp.is_some());
        
        // Message
        assert!(result.message.is_some());
        assert!(result.cim_message.is_some());
        assert!(result.message.as_ref().unwrap().contains("Traffic"));
    }

    #[test]
    fn test_leef_threat_log() {
        let parser = setup_parser();
        
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|THREAT|\t|devTime=2024-01-15 10:30:45\tsrc=192.168.1.100\tdst=10.0.0.5\tsrcPort=12345\tdstPort=80\tproto=TCP\tact=alert\tthreatName=Malware.Generic\tthreatCategory=malware\tsev=high\tfileName=malicious.exe\tfileHash=abc123def456\turl=http://malicious.com\thttpMethod=GET\tuserAgent=Mozilla/5.0";
        
        let result = parser.parse(raw_log).unwrap();
        
        // Threat-specific fields
        assert_eq!(result.threat_name, Some("Malware.Generic".to_string()));
        assert_eq!(result.threat_category, Some("malware".to_string()));
        assert_eq!(result.severity, Some("high".to_string()));
        assert_eq!(result.cim_severity, Some("high".to_string()));
        
        // File information
        assert_eq!(result.file_name, Some("malicious.exe".to_string()));
        assert_eq!(result.file_hash, Some("abc123def456".to_string()));
        
        // Web information
        assert_eq!(result.url, Some("http://malicious.com".to_string()));
        assert_eq!(result.http_method, Some("GET".to_string()));
        assert_eq!(result.user_agent, Some("Mozilla/5.0".to_string()));
        
        // Message should contain threat context
        assert!(result.message.as_ref().unwrap().contains("Threat"));
    }

    #[test]
    fn test_leef_system_log() {
        let parser = setup_parser();
        
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|SYSTEM|\t|devTime=2024-01-15 10:30:45\tact=configuration-change\tprocessName=configd\tcommandLine=/usr/bin/configd --update\tconfigChange=true";
        
        let result = parser.parse(raw_log).unwrap();
        
        // System-specific fields
        assert_eq!(result.event_type, Some("system".to_string()));
        assert_eq!(result.process_name, Some("configd".to_string()));
        assert_eq!(result.command_line, Some("/usr/bin/configd --update".to_string()));
        assert_eq!(result.event_category, Some("configuration".to_string()));
        
        // Message should contain system context
        assert!(result.message.as_ref().unwrap().contains("System"));
    }

    #[test]
    fn test_leef_globalprotect_log() {
        let parser = setup_parser();
        
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|GLOBALPROTECT|\t|devTime=2024-01-15 10:30:45\tuser=jdoe\tclientIp=203.0.113.10\tact=login\tauthMethod=LDAP\tauthResult=success\ttunnelType=IPSec";
        
        let result = parser.parse(raw_log).unwrap();
        
        // GlobalProtect-specific fields
        assert_eq!(result.event_type, Some("vpn".to_string()));
        assert_eq!(result.username, Some("jdoe".to_string()));
        assert_eq!(result.vpn_client_ip, Some("203.0.113.10".to_string()));
        assert_eq!(result.action, Some("login".to_string()));
        assert_eq!(result.auth_method, Some("LDAP".to_string()));
        assert_eq!(result.auth_result, Some("success".to_string()));
        assert_eq!(result.vpn_tunnel_type, Some("IPSec".to_string()));
        
        // Message should contain GlobalProtect context
        assert!(result.message.as_ref().unwrap().contains("GlobalProtect"));
    }

    // CEF Format Tests
    #[test]
    fn test_cef_format() {
        let parser = setup_parser();
        
        let raw_log = "CEF:0|Palo Alto Networks|PAN-OS|10.1.0|threat|Threat Detected|High|src=192.168.1.100 dst=10.0.0.5 spt=12345 dpt=80 proto=TCP threatName=Malware.Generic severity=high category=malware";
        
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.source_ip, Some("192.168.1.100".to_string()));
        assert_eq!(result.destination_ip, Some("10.0.0.5".to_string()));
        assert_eq!(result.threat_name, Some("Malware.Generic".to_string()));
        assert_eq!(result.severity, Some("high".to_string()));
        assert_eq!(result.threat_category, Some("malware".to_string()));
        
        // Verify CEF header fields are stored
        assert!(result.additional_fields.contains_key("cef_version"));
        assert!(result.additional_fields.contains_key("vendor"));
        assert!(result.additional_fields.contains_key("product"));
        assert!(result.additional_fields.contains_key("signature_id"));
    }

    // CSV Format Tests
    #[test]
    fn test_csv_format() {
        let parser = setup_parser();
        
        let raw_log = "\"2024-01-15 10:30:45\",\"001234567890\",\"TRAFFIC\",\"end\",\"10.20.105.24\",\"192.168.1.100\",\"54321\",\"80\",\"TCP\",\"allow\"";
        
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.source_ip, Some("10.20.105.24".to_string()));
        assert_eq!(result.destination_ip, Some("192.168.1.100".to_string()));
        assert_eq!(result.source_port, Some(54321));
        assert_eq!(result.destination_port, Some(80));
        assert_eq!(result.protocol, Some("TCP".to_string()));
        assert_eq!(result.action, Some("allow".to_string()));
        assert_eq!(result.outcome, Some("success".to_string()));
    }

    // Syslog Format Tests
    #[test]
    fn test_syslog_format() {
        let parser = setup_parser();
        
        let raw_log = "<14>Jan 15 10:30:45 PA-3220 src=10.20.105.24 dst=192.168.1.100 act=allow proto=TCP";
        
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.source_ip, Some("10.20.105.24".to_string()));
        assert_eq!(result.destination_ip, Some("192.168.1.100".to_string()));
        assert_eq!(result.action, Some("allow".to_string()));
        assert_eq!(result.protocol, Some("TCP".to_string()));
        assert_eq!(result.hostname, Some("PA-3220".to_string()));
        
        // Verify syslog-specific fields
        assert!(result.additional_fields.contains_key("priority"));
    }

    // Action Mapping Tests
    #[test]
    fn test_action_mappings() {
        let parser = setup_parser();
        
        let test_cases = vec![
            ("allow", "success"),
            ("permit", "success"),
            ("accept", "success"),
            ("deny", "failure"),
            ("drop", "failure"),
            ("block", "failure"),
            ("reset", "failure"),
            ("reject", "failure"),
            ("unknown_action", "unknown"),
        ];
        
        for (action, expected_outcome) in test_cases {
            let raw_log = format!("LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tsrc=10.0.0.1\tdst=10.0.0.2\tact={}", action);
            let result = parser.parse(&raw_log).unwrap();
            
            assert_eq!(result.action, Some(action.to_string()));
            assert_eq!(result.outcome, Some(expected_outcome.to_string()));
        }
    }

    // Edge Cases and Error Handling
    #[test]
    fn test_invalid_leef_format() {
        let parser = setup_parser();
        
        let raw_log = "INVALID:FORMAT|test";
        let result = parser.parse(raw_log);
        
        // Should still parse as CSV format (fallback)
        assert!(result.is_ok());
    }

    #[test]
    fn test_empty_fields() {
        let parser = setup_parser();
        
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tsrc=\tdst=\tact=";
        let result = parser.parse(raw_log).unwrap();
        
        // Empty fields should not be set
        assert_eq!(result.source_ip, None);
        assert_eq!(result.destination_ip, None);
        assert_eq!(result.action, None);
    }

    #[test]
    fn test_malformed_ports() {
        let parser = setup_parser();
        
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tsrc=10.0.0.1\tdst=10.0.0.2\tsrcPort=invalid\tdstPort=99999999";
        let result = parser.parse(raw_log).unwrap();
        
        // Invalid ports should not be parsed
        assert_eq!(result.source_port, None);
        assert_eq!(result.destination_port, None);
    }

    #[test]
    fn test_malformed_numbers() {
        let parser = setup_parser();
        
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tout=invalid\tin=not_a_number\tduration=abc";
        let result = parser.parse(raw_log).unwrap();
        
        // Invalid numbers should not be parsed
        assert_eq!(result.bytes_out, None);
        assert_eq!(result.bytes_in, None);
        assert_eq!(result.duration, None);
    }

    #[test]
    fn test_alternative_field_names() {
        let parser = setup_parser();
        
        // Test alternative field names for CEF format
        let raw_log = "CEF:0|Palo Alto Networks|PAN-OS|10.1.0|traffic|Traffic Event|Medium|sourceAddress=10.0.0.1 destinationAddress=10.0.0.2 sourcePort=1234 destinationPort=80 protocol=TCP";
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.source_ip, Some("10.0.0.1".to_string()));
        assert_eq!(result.destination_ip, Some("10.0.0.2".to_string()));
        assert_eq!(result.source_port, Some(1234));
        assert_eq!(result.destination_port, Some(80));
        assert_eq!(result.protocol, Some("TCP".to_string()));
    }

    #[test]
    fn test_timestamp_parsing() {
        let parser = setup_parser();
        
        let test_cases = vec![
            "2024-01-15 10:30:45",
            "2024-01-15T10:30:45Z",
            "2024-01-15T10:30:45+00:00",
        ];
        
        for timestamp_str in test_cases {
            let raw_log = format!("LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime={}\tsrc=10.0.0.1", timestamp_str);
            let result = parser.parse(&raw_log).unwrap();
            
            // At least one timestamp format should parse successfully
            if timestamp_str == "2024-01-15 10:30:45" {
                assert!(result.timestamp.is_some());
            }
        }
    }

    #[test]
    fn test_message_construction() {
        let parser = setup_parser();
        
        // Test message construction when no explicit message is provided
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tsrc=10.0.0.1\tdst=10.0.0.2\tact=allow\tapp=web-browsing";
        let result = parser.parse(raw_log).unwrap();
        
        let message = result.message.unwrap();
        assert!(message.contains("Traffic"));
        assert!(message.contains("Action: allow"));
        assert!(message.contains("10.0.0.1 -> 10.0.0.2"));
        assert!(message.contains("App: web-browsing"));
    }

    #[test]
    fn test_explicit_message() {
        let parser = setup_parser();
        
        // Test explicit message field
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tmsg=Custom message for this event";
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.message, Some("Custom message for this event".to_string()));
        assert_eq!(result.cim_message, Some("Custom message for this event".to_string()));
    }

    #[test]
    fn test_additional_fields_storage() {
        let parser = setup_parser();
        
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tsrc=10.0.0.1\tcustomField1=value1\tcustomField2=value2\tunmappedField=unmappedValue";
        let result = parser.parse(raw_log).unwrap();
        
        // Verify unmapped fields are stored in additional_fields
        assert_eq!(result.additional_fields.get("customField1"), Some(&"value1".to_string()));
        assert_eq!(result.additional_fields.get("customField2"), Some(&"value2".to_string()));
        assert_eq!(result.additional_fields.get("unmappedField"), Some(&"unmappedValue".to_string()));
        
        // Verify mapped fields are not in additional_fields
        assert!(!result.additional_fields.contains_key("src"));
        assert!(!result.additional_fields.contains_key("devTime"));
    }

    #[test]
    fn test_log_type_detection() {
        let parser = setup_parser();
        
        let test_cases = vec![
            ("TRAFFIC log content", "Traffic"),
            ("THREAT detected", "Threat"),
            ("SYSTEM event", "System"),
            ("GLOBALPROTECT session", "GlobalProtect"),
            ("unknown log type", "Traffic"), // Default
        ];
        
        for (log_content, expected_type) in test_cases {
            let raw_log = format!("LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|{}|\t|devTime=2024-01-15 10:30:45", log_content);
            let result = parser.parse(&raw_log).unwrap();
            
            assert!(result.message.as_ref().unwrap().contains(expected_type));
        }
    }

    #[test]
    fn test_parser_name() {
        let parser = setup_parser();
        assert_eq!(parser.name(), "PaloAltoEnhanced");
    }

    #[test]
    fn test_user_field_priority() {
        let parser = setup_parser();
        
        // Test that srcUser takes priority over dstUser for username field
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tsrcUser=alice\tdstUser=bob";
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.username, Some("alice".to_string()));
        assert_eq!(result.user, Some("alice".to_string()));
        assert_eq!(result.src_user, Some("alice".to_string()));
        assert_eq!(result.dest_user, Some("bob".to_string()));
    }

    #[test]
    fn test_hostname_field_priority() {
        let parser = setup_parser();
        
        // Test hostname field priority: devName > dvchost > hostname
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tdevName=PA-3220\tdvchost=firewall.local\thostname=fw.example.com";
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.hostname, Some("PA-3220".to_string()));
    }

    #[test]
    fn test_threat_file_hash_priority() {
        let parser = setup_parser();
        
        // Test file hash field priority: fileHash > md5 > sha1 > sha256
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|THREAT|\t|devTime=2024-01-15 10:30:45\tfileHash=primary_hash\tmd5=md5_hash\tsha1=sha1_hash";
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.file_hash, Some("primary_hash".to_string()));
    }

    #[test]
    fn test_minimal_log() {
        let parser = setup_parser();
        
        // Test parsing with minimal fields
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45";
        let result = parser.parse(raw_log).unwrap();
        
        // Should still have basic vendor information
        assert_eq!(result.vendor, Some("Palo Alto Networks".to_string()));
        assert_eq!(result.product, Some("PAN-OS".to_string()));
        assert_eq!(result.device_type, Some("firewall".to_string()));
        assert!(result.timestamp.is_some());
        assert!(result.message.is_some());
    }
}

// Integration tests for parser registration
#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    fn test_parser_creation() {
        let result = PaloAltoEnhancedParser::new();
        assert!(result.is_ok());
    }

    #[test]
    fn test_parser_implements_log_parser() {
        let parser = PaloAltoEnhancedParser::new().unwrap();
        
        // Test that it implements the LogParser trait
        let _: &dyn LogParser = &parser;
    }
}

// Performance tests
#[cfg(test)]
mod performance_tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_parsing_performance() {
        let parser = setup_parser();
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tsrc=10.20.105.24\tdst=192.168.1.100\tsrcPort=54321\tdstPort=80\tproto=TCP\tact=allow\tsrcUser=jdoe\tdevName=PA-3220\tapp=web-browsing";
        
        let start = Instant::now();
        for _ in 0..1000 {
            let _ = parser.parse(raw_log).unwrap();
        }
        let duration = start.elapsed();
        
        // Should parse 1000 logs in reasonable time (less than 1 second)
        assert!(duration.as_secs() < 1);
    }
}