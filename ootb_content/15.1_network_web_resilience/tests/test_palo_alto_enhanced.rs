#[cfg(test)]
mod tests {
    use super::*;
    use crate::parsers::palo_alto_enhanced::PaloAltoEnhancedParser;
    use crate::ParsedEvent;
    use std::collections::HashMap;

    fn create_parser() -> PaloAltoEnhancedParser {
        PaloAltoEnhancedParser::new()
    }

    #[test]
    fn test_detect_leef_format() {
        let parser = create_parser();
        let leef_log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8";
        assert_eq!(parser.detect_format(leef_log), "LEEF");
    }

    #[test]
    fn test_detect_cef_format() {
        let parser = create_parser();
        let cef_log = "CEF:0|Palo Alto Networks|PAN-OS|9.1.0|TRAFFIC|Traffic Log|3|rt=Jan 15 2024 10:30:00";
        assert_eq!(parser.detect_format(cef_log), "CEF");
    }

    #[test]
    fn test_detect_syslog_format() {
        let parser = create_parser();
        let syslog_log = "<14>Jan 15 10:30:00 firewall-01 1,2024/01/15 10:30:00,001606001116,TRAFFIC,start";
        assert_eq!(parser.detect_format(syslog_log), "Syslog");
    }

    #[test]
    fn test_detect_csv_format() {
        let parser = create_parser();
        let csv_log = "1,2024/01/15 10:30:00,001606001116,TRAFFIC,start,192.168.1.100,8.8.8.8,0.0.0.0,0.0.0.0";
        assert_eq!(parser.detect_format(csv_log), "CSV");
    }

    #[test]
    fn test_detect_unknown_format() {
        let parser = create_parser();
        let unknown_log = "This is not a recognized log format";
        assert_eq!(parser.detect_format(unknown_log), "Unknown");
    }

    #[test]
    fn test_detect_traffic_log_type() {
        let parser = create_parser();
        let traffic_log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z";
        assert_eq!(parser.detect_log_type(traffic_log), "TRAFFIC");
    }

    #[test]
    fn test_detect_threat_log_type() {
        let parser = create_parser();
        let threat_log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|THREAT|devTime=2024-01-15T10:30:00Z";
        assert_eq!(parser.detect_log_type(threat_log), "THREAT");
    }

    #[test]
    fn test_detect_system_log_type() {
        let parser = create_parser();
        let system_log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|SYSTEM|devTime=2024-01-15T10:30:00Z";
        assert_eq!(parser.detect_log_type(system_log), "SYSTEM");
    }

    #[test]
    fn test_detect_globalprotect_log_type() {
        let parser = create_parser();
        let gp_log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|GLOBALPROTECT|devTime=2024-01-15T10:30:00Z";
        assert_eq!(parser.detect_log_type(gp_log), "GLOBALPROTECT");
    }

    #[test]
    fn test_parse_leef_traffic_log() {
        let parser = create_parser();
        let log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8|srcPort=12345|dstPort=80|proto=TCP|act=allow|srcUser=john.doe|devName=firewall-01|app=web-browsing|sev=informational|srcZone=trust|dstZone=untrust|bytesIn=1024|bytesOut=2048|srcCountry=US|dstCountry=US";
        
        let result = parser.parse(log);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert_eq!(event.source_ip, Some("192.168.1.100".to_string()));
        assert_eq!(event.destination_ip, Some("8.8.8.8".to_string()));
        assert_eq!(event.source_port, Some(12345));
        assert_eq!(event.destination_port, Some(80));
        assert_eq!(event.protocol, Some("TCP".to_string()));
        assert_eq!(event.action, Some("allow".to_string()));
        assert_eq!(event.username, Some("john.doe".to_string()));
        assert_eq!(event.hostname, Some("firewall-01".to_string()));
        assert_eq!(event.app_name, Some("web-browsing".to_string()));
        assert_eq!(event.severity, Some("informational".to_string()));
        assert_eq!(event.outcome, Some("success".to_string()));
        assert_eq!(event.bytes_in, Some(1024));
        assert_eq!(event.bytes_out, Some(2048));
        assert_eq!(event.src_country, Some("US".to_string()));
        assert_eq!(event.dest_country, Some("US".to_string()));
    }

    #[test]
    fn test_parse_cef_threat_log() {
        let parser = create_parser();
        let log = "CEF:0|Palo Alto Networks|PAN-OS|9.1.0|THREAT|Threat Log|8|rt=Jan 15 2024 10:30:00 UTC|src=192.168.1.100|dst=8.8.8.8|spt=12345|dpt=80|proto=TCP|act=alert|suser=john.doe|dhost=firewall-01|app=web-browsing|cs1=malware|cs1Label=ThreatCategory|cs2=trojan.generic|cs2Label=ThreatName|cs3=critical|cs3Label=Severity";
        
        let result = parser.parse(log);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert_eq!(event.source_ip, Some("192.168.1.100".to_string()));
        assert_eq!(event.destination_ip, Some("8.8.8.8".to_string()));
        assert_eq!(event.source_port, Some(12345));
        assert_eq!(event.destination_port, Some(80));
        assert_eq!(event.protocol, Some("TCP".to_string()));
        assert_eq!(event.action, Some("alert".to_string()));
        assert_eq!(event.username, Some("john.doe".to_string()));
        assert_eq!(event.hostname, Some("firewall-01".to_string()));
        assert_eq!(event.app_name, Some("web-browsing".to_string()));
        assert_eq!(event.severity, Some("critical".to_string()));
        assert_eq!(event.outcome, Some("failure".to_string()));
        
        // Check additional fields for threat-specific data
        assert!(event.additional_fields.contains_key("threat_category"));
        assert!(event.additional_fields.contains_key("threat_name"));
    }

    #[test]
    fn test_parse_syslog_system_log() {
        let parser = create_parser();
        let log = "<14>Jan 15 10:30:00 firewall-01 1,2024/01/15 10:30:00,001606001116,SYSTEM,general,0,2024/01/15 10:30:00,192.168.1.1,admin,Configuration,Succeeded,general,1234,0x0,admin,Web,User 'admin' logged in via Web from 192.168.1.1";
        
        let result = parser.parse(log);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert_eq!(event.hostname, Some("firewall-01".to_string()));
        assert_eq!(event.username, Some("admin".to_string()));
        assert_eq!(event.source_ip, Some("192.168.1.1".to_string()));
        assert_eq!(event.outcome, Some("success".to_string()));
        assert!(event.message.contains("logged in"));
    }

    #[test]
    fn test_parse_csv_globalprotect_log() {
        let parser = create_parser();
        let log = "1,2024/01/15 10:30:00,001606001116,GLOBALPROTECT,login,0,2024/01/15 10:30:00,192.168.1.100,john.doe,GlobalProtect,Succeeded,vpn,1234,0x0,john.doe,SSL,User 'john.doe' logged in from 192.168.1.100,US,certificate,10.0.0.1";
        
        let result = parser.parse(log);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert_eq!(event.username, Some("john.doe".to_string()));
        assert_eq!(event.source_ip, Some("192.168.1.100".to_string()));
        assert_eq!(event.outcome, Some("success".to_string()));
        assert_eq!(event.src_country, Some("US".to_string()));
        assert!(event.additional_fields.contains_key("auth_method"));
        assert!(event.additional_fields.contains_key("vpn_tunnel_type"));
    }

    #[test]
    fn test_action_to_outcome_mapping() {
        let parser = create_parser();
        
        // Test success outcomes
        assert_eq!(parser.map_action_to_outcome("allow"), "success");
        assert_eq!(parser.map_action_to_outcome("permit"), "success");
        assert_eq!(parser.map_action_to_outcome("accept"), "success");
        
        // Test failure outcomes
        assert_eq!(parser.map_action_to_outcome("deny"), "failure");
        assert_eq!(parser.map_action_to_outcome("drop"), "failure");
        assert_eq!(parser.map_action_to_outcome("block"), "failure");
        assert_eq!(parser.map_action_to_outcome("reject"), "failure");
        assert_eq!(parser.map_action_to_outcome("reset"), "failure");
        assert_eq!(parser.map_action_to_outcome("alert"), "failure");
        
        // Test unknown outcome
        assert_eq!(parser.map_action_to_outcome("unknown_action"), "unknown");
    }

    #[test]
    fn test_parse_malformed_log() {
        let parser = create_parser();
        let malformed_log = "This is not a valid log format at all";
        
        let result = parser.parse(malformed_log);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_empty_log() {
        let parser = create_parser();
        let empty_log = "";
        
        let result = parser.parse(empty_log);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_leef_with_missing_fields() {
        let parser = create_parser();
        let log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.100";
        
        let result = parser.parse(log);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert_eq!(event.source_ip, Some("192.168.1.100".to_string()));
        assert_eq!(event.destination_ip, None);
    }

    #[test]
    fn test_parse_cef_with_special_characters() {
        let parser = create_parser();
        let log = "CEF:0|Palo Alto Networks|PAN-OS|9.1.0|TRAFFIC|Traffic Log|3|rt=Jan 15 2024 10:30:00 UTC|src=192.168.1.100|dst=8.8.8.8|msg=User accessed https://example.com/path?param=value&other=test";
        
        let result = parser.parse(log);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert_eq!(event.source_ip, Some("192.168.1.100".to_string()));
        assert_eq!(event.destination_ip, Some("8.8.8.8".to_string()));
    }

    #[test]
    fn test_parse_high_volume_traffic() {
        let parser = create_parser();
        let log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8|bytesIn=1073741824|bytesOut=2147483648|act=allow";
        
        let result = parser.parse(log);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert_eq!(event.bytes_in, Some(1073741824)); // 1GB
        assert_eq!(event.bytes_out, Some(2147483648)); // 2GB
    }

    #[test]
    fn test_parse_ipv6_addresses() {
        let parser = create_parser();
        let log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=2001:db8::1|dst=2001:db8::2|srcPort=12345|dstPort=80|proto=TCP|act=allow";
        
        let result = parser.parse(log);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert_eq!(event.source_ip, Some("2001:db8::1".to_string()));
        assert_eq!(event.destination_ip, Some("2001:db8::2".to_string()));
    }

    #[test]
    fn test_parse_different_severities() {
        let parser = create_parser();
        let severities = vec!["critical", "high", "medium", "low", "informational"];
        
        for severity in severities {
            let log = format!("LEEF:2.0|PaloAlto|PAN-OS|9.1.0|THREAT|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8|sev={}", severity);
            
            let result = parser.parse(&log);
            assert!(result.is_ok());
            
            let event = result.unwrap();
            assert_eq!(event.severity, Some(severity.to_string()));
        }
    }

    #[test]
    fn test_parse_different_protocols() {
        let parser = create_parser();
        let protocols = vec!["TCP", "UDP", "ICMP", "ESP", "GRE"];
        
        for protocol in protocols {
            let log = format!("LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8|proto={}", protocol);
            
            let result = parser.parse(&log);
            assert!(result.is_ok());
            
            let event = result.unwrap();
            assert_eq!(event.protocol, Some(protocol.to_string()));
        }
    }

    #[test]
    fn test_parse_different_zones() {
        let parser = create_parser();
        let zones = vec![("trust", "untrust"), ("internal", "external"), ("dmz", "guest")];
        
        for (src_zone, dst_zone) in zones {
            let log = format!("LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8|srcZone={}|dstZone={}", src_zone, dst_zone);
            
            let result = parser.parse(&log);
            assert!(result.is_ok());
            
            let event = result.unwrap();
            assert!(event.additional_fields.contains_key("src_zone"));
            assert!(event.additional_fields.contains_key("dest_zone"));
        }
    }

    #[test]
    fn test_parse_threat_categories() {
        let parser = create_parser();
        let threat_categories = vec!["malware", "spyware", "vulnerability", "phishing", "command-and-control"];
        
        for category in threat_categories {
            let log = format!("LEEF:2.0|PaloAlto|PAN-OS|9.1.0|THREAT|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8|threatCategory={}", category);
            
            let result = parser.parse(&log);
            assert!(result.is_ok());
            
            let event = result.unwrap();
            assert!(event.additional_fields.contains_key("threat_category"));
        }
    }

    #[test]
    fn test_parse_authentication_methods() {
        let parser = create_parser();
        let auth_methods = vec!["LDAP", "RADIUS", "SAML", "certificate", "local"];
        
        for method in auth_methods {
            let log = format!("LEEF:2.0|PaloAlto|PAN-OS|9.1.0|GLOBALPROTECT|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|authMethod={}", method);
            
            let result = parser.parse(&log);
            assert!(result.is_ok());
            
            let event = result.unwrap();
            assert!(event.additional_fields.contains_key("auth_method"));
        }
    }

    #[test]
    fn test_parse_vpn_tunnel_types() {
        let parser = create_parser();
        let tunnel_types = vec!["IPSec", "SSL", "L2TP"];
        
        for tunnel_type in tunnel_types {
            let log = format!("LEEF:2.0|PaloAlto|PAN-OS|9.1.0|GLOBALPROTECT|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|tunnelType={}", tunnel_type);
            
            let result = parser.parse(&log);
            assert!(result.is_ok());
            
            let event = result.unwrap();
            assert!(event.additional_fields.contains_key("vpn_tunnel_type"));
        }
    }

    #[test]
    fn test_parse_performance_large_log() {
        let parser = create_parser();
        let mut large_log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8".to_string();
        
        // Add many additional fields to test performance
        for i in 0..100 {
            large_log.push_str(&format!("|customField{}=value{}", i, i));
        }
        
        let start = std::time::Instant::now();
        let result = parser.parse(&large_log);
        let duration = start.elapsed();
        
        assert!(result.is_ok());
        assert!(duration.as_millis() < 100); // Should parse in less than 100ms
    }

    #[test]
    fn test_parse_concurrent_parsing() {
        use std::sync::Arc;
        use std::thread;
        
        let parser = Arc::new(create_parser());
        let mut handles = vec![];
        
        for i in 0..10 {
            let parser_clone = Arc::clone(&parser);
            let handle = thread::spawn(move || {
                let log = format!("LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.{}|dst=8.8.8.8", i);
                parser_clone.parse(&log)
            });
            handles.push(handle);
        }
        
        for handle in handles {
            let result = handle.join().unwrap();
            assert!(result.is_ok());
        }
    }

    #[test]
    fn test_parse_edge_case_port_numbers() {
        let parser = create_parser();
        let log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8|srcPort=0|dstPort=65535";
        
        let result = parser.parse(log);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert_eq!(event.source_port, Some(0));
        assert_eq!(event.destination_port, Some(65535));
    }

    #[test]
    fn test_parse_unicode_usernames() {
        let parser = create_parser();
        let log = "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8|srcUser=用户名|act=allow";
        
        let result = parser.parse(log);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert_eq!(event.username, Some("用户名".to_string()));
    }

    #[test]
    fn test_parse_very_long_field_values() {
        let parser = create_parser();
        let long_value = "a".repeat(1000);
        let log = format!("LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8|msg={}", long_value);
        
        let result = parser.parse(&log);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert!(event.message.len() > 500);
    }

    #[test]
    fn test_parse_timestamp_formats() {
        let parser = create_parser();
        let timestamp_formats = vec![
            "2024-01-15T10:30:00Z",
            "2024/01/15 10:30:00",
            "Jan 15 2024 10:30:00 UTC",
            "1705315800" // Unix timestamp
        ];
        
        for timestamp in timestamp_formats {
            let log = format!("LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime={}|src=192.168.1.100|dst=8.8.8.8", timestamp);
            
            let result = parser.parse(&log);
            assert!(result.is_ok(), "Failed to parse timestamp format: {}", timestamp);
        }
    }

    #[test]
    fn test_parser_implements_required_traits() {
        let parser = create_parser();
        
        // Test that parser implements required traits
        let _: Box<dyn Send> = Box::new(parser.clone());
        let _: Box<dyn Sync> = Box::new(parser);
    }

    #[test]
    fn test_parse_all_log_types_coverage() {
        let parser = create_parser();
        let log_types = vec!["TRAFFIC", "THREAT", "SYSTEM", "GLOBALPROTECT", "CONFIG"];
        
        for log_type in log_types {
            let log = format!("LEEF:2.0|PaloAlto|PAN-OS|9.1.0|{}|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8", log_type);
            
            let result = parser.parse(&log);
            assert!(result.is_ok(), "Failed to parse log type: {}", log_type);
            
            let event = result.unwrap();
            assert!(event.additional_fields.contains_key("log_type"));
        }
    }
}