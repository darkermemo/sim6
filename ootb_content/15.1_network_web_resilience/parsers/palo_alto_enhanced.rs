//! Enhanced Palo Alto Networks Parser
//!
//! This parser provides comprehensive support for Palo Alto Networks PAN-OS logs
//! including traffic, threat, system, and configuration logs in multiple formats:
//! - LEEF (Log Event Extended Format)
//! - CEF (Common Event Format)
//! - Syslog (RFC 3164/5424)
//! - CSV format
//!
//! The parser normalizes all log types to the Common Information Model (CIM)
//! for consistent analysis and correlation.

use crate::{LogParser, ParsedEvent};
use chrono::{DateTime, NaiveDateTime, Utc};
use regex::Regex;
use std::collections::HashMap;
use std::error::Error;
use std::fmt;

#[derive(Debug)]
pub struct PaloAltoEnhancedParser {
    leef_regex: Regex,
    cef_regex: Regex,
    csv_regex: Regex,
    syslog_regex: Regex,
}

#[derive(Debug)]
pub enum PaloAltoLogType {
    Traffic,
    Threat,
    System,
    Config,
    HipMatch,
    Correlation,
    GlobalProtect,
    Tunnel,
    Auth,
    Userid,
}

#[derive(Debug)]
pub enum PaloAltoLogFormat {
    Leef,
    Cef,
    Csv,
    Syslog,
}

#[derive(Debug)]
pub struct PaloAltoParseError {
    message: String,
}

impl fmt::Display for PaloAltoParseError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Palo Alto parse error: {}", self.message)
    }
}

impl Error for PaloAltoParseError {}

impl PaloAltoEnhancedParser {
    pub fn new() -> Result<Self, Box<dyn Error>> {
        let leef_regex = Regex::new(
            r"LEEF:([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]*)\|(.+)"
        )?;
        
        let cef_regex = Regex::new(
            r"CEF:([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|(.+)"
        )?;
        
        let csv_regex = Regex::new(
            r"^([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),(.+)$"
        )?;
        
        let syslog_regex = Regex::new(
            r"<(\d+)>([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+([^\s]+)\s+(.+)"
        )?;

        Ok(PaloAltoEnhancedParser {
            leef_regex,
            cef_regex,
            csv_regex,
            syslog_regex,
        })
    }

    fn detect_format(&self, raw_log: &str) -> PaloAltoLogFormat {
        if raw_log.starts_with("LEEF:") {
            PaloAltoLogFormat::Leef
        } else if raw_log.starts_with("CEF:") {
            PaloAltoLogFormat::Cef
        } else if raw_log.starts_with("<") && self.syslog_regex.is_match(raw_log) {
            PaloAltoLogFormat::Syslog
        } else {
            PaloAltoLogFormat::Csv
        }
    }

    fn detect_log_type(&self, log_content: &str) -> PaloAltoLogType {
        let content_lower = log_content.to_lowercase();
        
        if content_lower.contains("traffic") || content_lower.contains("connection") {
            PaloAltoLogType::Traffic
        } else if content_lower.contains("threat") || content_lower.contains("vulnerability") 
            || content_lower.contains("spyware") || content_lower.contains("virus") {
            PaloAltoLogType::Threat
        } else if content_lower.contains("system") || content_lower.contains("general") {
            PaloAltoLogType::System
        } else if content_lower.contains("config") || content_lower.contains("configuration") {
            PaloAltoLogType::Config
        } else if content_lower.contains("hip") {
            PaloAltoLogType::HipMatch
        } else if content_lower.contains("correlation") {
            PaloAltoLogType::Correlation
        } else if content_lower.contains("globalprotect") || content_lower.contains("gp") {
            PaloAltoLogType::GlobalProtect
        } else if content_lower.contains("tunnel") {
            PaloAltoLogType::Tunnel
        } else if content_lower.contains("auth") || content_lower.contains("authentication") {
            PaloAltoLogType::Auth
        } else if content_lower.contains("userid") || content_lower.contains("user-id") {
            PaloAltoLogType::Userid
        } else {
            PaloAltoLogType::Traffic // Default
        }
    }

    fn parse_leef(&self, raw_log: &str) -> Result<HashMap<String, String>, Box<dyn Error>> {
        let caps = self.leef_regex.captures(raw_log)
            .ok_or_else(|| PaloAltoParseError {
                message: "Invalid LEEF format".to_string(),
            })?;

        let mut fields = HashMap::new();
        
        // Extract LEEF header fields
        fields.insert("leef_version".to_string(), caps[1].to_string());
        fields.insert("vendor".to_string(), caps[2].to_string());
        fields.insert("product".to_string(), caps[3].to_string());
        fields.insert("version".to_string(), caps[4].to_string());
        fields.insert("event_id".to_string(), caps[5].to_string());
        fields.insert("delimiter".to_string(), caps[6].to_string());
        
        // Parse key-value pairs from the extension
        let extension = &caps[7];
        let delimiter = if caps[6].is_empty() { "\t" } else { &caps[6] };
        
        for pair in extension.split(delimiter) {
            if let Some(eq_pos) = pair.find('=') {
                let key = pair[..eq_pos].trim().to_string();
                let value = pair[eq_pos + 1..].trim().to_string();
                if !key.is_empty() && !value.is_empty() {
                    fields.insert(key, value);
                }
            }
        }

        Ok(fields)
    }

    fn parse_cef(&self, raw_log: &str) -> Result<HashMap<String, String>, Box<dyn Error>> {
        let caps = self.cef_regex.captures(raw_log)
            .ok_or_else(|| PaloAltoParseError {
                message: "Invalid CEF format".to_string(),
            })?;

        let mut fields = HashMap::new();
        
        // Extract CEF header fields
        fields.insert("cef_version".to_string(), caps[1].to_string());
        fields.insert("vendor".to_string(), caps[2].to_string());
        fields.insert("product".to_string(), caps[3].to_string());
        fields.insert("version".to_string(), caps[4].to_string());
        fields.insert("signature_id".to_string(), caps[5].to_string());
        fields.insert("name".to_string(), caps[6].to_string());
        fields.insert("severity".to_string(), caps[7].to_string());
        
        // Parse key-value pairs from the extension
        let extension = &caps[8];
        
        for pair in extension.split(' ') {
            if let Some(eq_pos) = pair.find('=') {
                let key = pair[..eq_pos].trim().to_string();
                let value = pair[eq_pos + 1..].trim().to_string();
                if !key.is_empty() && !value.is_empty() {
                    fields.insert(key, value);
                }
            }
        }

        Ok(fields)
    }

    fn parse_csv(&self, raw_log: &str) -> Result<HashMap<String, String>, Box<dyn Error>> {
        // Parse CSV format - this is a simplified version
        // In practice, you'd need to handle CSV parsing more robustly
        let parts: Vec<&str> = raw_log.split(',').collect();
        let mut fields = HashMap::new();
        
        // Map CSV fields based on Palo Alto CSV log format
        // This is a basic mapping - real implementation would be more comprehensive
        if parts.len() >= 10 {
            fields.insert("timestamp".to_string(), parts[0].trim_matches('"').to_string());
            fields.insert("serial".to_string(), parts[1].trim_matches('"').to_string());
            fields.insert("type".to_string(), parts[2].trim_matches('"').to_string());
            fields.insert("subtype".to_string(), parts[3].trim_matches('"').to_string());
            fields.insert("src".to_string(), parts[4].trim_matches('"').to_string());
            fields.insert("dst".to_string(), parts[5].trim_matches('"').to_string());
            fields.insert("srcPort".to_string(), parts[6].trim_matches('"').to_string());
            fields.insert("dstPort".to_string(), parts[7].trim_matches('"').to_string());
            fields.insert("proto".to_string(), parts[8].trim_matches('"').to_string());
            fields.insert("act".to_string(), parts[9].trim_matches('"').to_string());
        }

        Ok(fields)
    }

    fn parse_syslog(&self, raw_log: &str) -> Result<HashMap<String, String>, Box<dyn Error>> {
        let caps = self.syslog_regex.captures(raw_log)
            .ok_or_else(|| PaloAltoParseError {
                message: "Invalid syslog format".to_string(),
            })?;

        let mut fields = HashMap::new();
        
        fields.insert("priority".to_string(), caps[1].to_string());
        fields.insert("timestamp".to_string(), caps[2].to_string());
        fields.insert("hostname".to_string(), caps[3].to_string());
        fields.insert("message".to_string(), caps[4].to_string());

        // Try to extract additional fields from the message content
        let message = &caps[4];
        for pair in message.split_whitespace() {
            if let Some(eq_pos) = pair.find('=') {
                let key = pair[..eq_pos].trim().to_string();
                let value = pair[eq_pos + 1..].trim().to_string();
                if !key.is_empty() && !value.is_empty() {
                    fields.insert(key, value);
                }
            }
        }

        Ok(fields)
    }

    fn map_to_cim(&self, fields: &HashMap<String, String>, log_type: &PaloAltoLogType) -> ParsedEvent {
        let mut parsed = ParsedEvent::default();

        // Parse timestamp
        if let Some(timestamp_str) = fields.get("devTime").or_else(|| fields.get("timestamp")) {
            if let Ok(dt) = DateTime::parse_from_str(timestamp_str, "%Y-%m-%d %H:%M:%S") {
                parsed.timestamp = Some(dt.with_timezone(&Utc));
            } else if let Ok(dt) = NaiveDateTime::parse_from_str(timestamp_str, "%Y-%m-%d %H:%M:%S") {
                parsed.timestamp = Some(dt.and_utc());
            }
        }

        // Basic network fields
        parsed.source_ip = fields.get("src").or_else(|| fields.get("sourceAddress")).cloned();
        parsed.destination_ip = fields.get("dst").or_else(|| fields.get("destinationAddress")).cloned();
        parsed.src_ip = parsed.source_ip.clone();
        parsed.dest_ip = parsed.destination_ip.clone();

        // Ports
        if let Some(sport) = fields.get("srcPort").or_else(|| fields.get("sourcePort")) {
            if let Ok(port) = sport.parse() {
                parsed.source_port = Some(port);
                parsed.src_port = Some(port);
            }
        }

        if let Some(dport) = fields.get("dstPort").or_else(|| fields.get("destinationPort")) {
            if let Ok(port) = dport.parse() {
                parsed.destination_port = Some(port);
                parsed.dest_port = Some(port);
            }
        }

        // Protocol
        parsed.protocol = fields.get("proto").or_else(|| fields.get("protocol")).cloned();
        parsed.cim_protocol = parsed.protocol.clone();

        // User information
        parsed.username = fields.get("srcUser")
            .or_else(|| fields.get("dstUser"))
            .or_else(|| fields.get("user"))
            .cloned();
        parsed.user = parsed.username.clone();
        parsed.src_user = fields.get("srcUser").cloned();
        parsed.dest_user = fields.get("dstUser").cloned();

        // Action and outcome
        if let Some(action) = fields.get("act").or_else(|| fields.get("action")) {
            parsed.action = Some(action.clone());
            parsed.outcome = match action.to_lowercase().as_str() {
                "allow" | "permit" | "accept" => Some("success".to_string()),
                "deny" | "drop" | "block" | "reset" | "reject" => Some("failure".to_string()),
                _ => Some("unknown".to_string()),
            };
        }

        // Device information
        parsed.hostname = fields.get("devName")
            .or_else(|| fields.get("dvchost"))
            .or_else(|| fields.get("hostname"))
            .cloned();
        
        parsed.vendor = Some("Palo Alto Networks".to_string());
        parsed.product = Some("PAN-OS".to_string());
        parsed.device_type = Some("firewall".to_string());

        // Log type specific mappings
        match log_type {
            PaloAltoLogType::Traffic => {
                self.map_traffic_fields(&mut parsed, fields);
            },
            PaloAltoLogType::Threat => {
                self.map_threat_fields(&mut parsed, fields);
            },
            PaloAltoLogType::System => {
                self.map_system_fields(&mut parsed, fields);
            },
            PaloAltoLogType::GlobalProtect => {
                self.map_globalprotect_fields(&mut parsed, fields);
            },
            _ => {
                // Default mapping for other log types
            }
        }

        // Message construction
        if let Some(msg) = fields.get("msg").or_else(|| fields.get("message")) {
            parsed.message = Some(msg.clone());
            parsed.cim_message = Some(msg.clone());
        } else {
            let message = self.construct_message(fields, log_type);
            parsed.message = Some(message.clone());
            parsed.cim_message = Some(message);
        }

        // Store unmapped fields
        let mapped_fields = [
            "devTime", "timestamp", "src", "dst", "srcPort", "dstPort", "proto",
            "srcUser", "dstUser", "user", "act", "action", "devName", "dvchost",
            "hostname", "msg", "message", "sourceAddress", "destinationAddress",
            "sourcePort", "destinationPort", "protocol"
        ];
        
        for (key, value) in fields {
            if !mapped_fields.contains(&key.as_str()) {
                parsed.additional_fields.insert(key.clone(), value.clone());
            }
        }

        parsed
    }

    fn map_traffic_fields(&self, parsed: &mut ParsedEvent, fields: &HashMap<String, String>) {
        // Traffic-specific field mappings
        
        // Bytes and packets
        if let Some(bytes_out) = fields.get("out").or_else(|| fields.get("bytesOut")) {
            if let Ok(bytes) = bytes_out.parse() {
                parsed.bytes_out = Some(bytes);
            }
        }

        if let Some(bytes_in) = fields.get("in").or_else(|| fields.get("bytesIn")) {
            if let Ok(bytes) = bytes_in.parse() {
                parsed.bytes_in = Some(bytes);
            }
        }

        if let Some(packets_out) = fields.get("packetsOut") {
            if let Ok(packets) = packets_out.parse() {
                parsed.packets_out = Some(packets);
            }
        }

        if let Some(packets_in) = fields.get("packetsIn") {
            if let Ok(packets) = packets_in.parse() {
                parsed.packets_in = Some(packets);
            }
        }

        // Duration
        if let Some(duration_str) = fields.get("duration") {
            if let Ok(dur) = duration_str.parse() {
                parsed.duration = Some(dur);
            }
        }

        // Network zones
        parsed.src_zone = fields.get("srcZone").or_else(|| fields.get("fromZone")).cloned();
        parsed.dest_zone = fields.get("dstZone").or_else(|| fields.get("toZone")).cloned();

        // Geographic information
        parsed.src_country = fields.get("srcCountry").cloned();
        parsed.dest_country = fields.get("dstCountry").cloned();

        // Application information
        parsed.app_name = fields.get("app").or_else(|| fields.get("application")).cloned();
        parsed.app_category = fields.get("appcat").or_else(|| fields.get("applicationCategory")).cloned();

        // Session information
        parsed.session_id = fields.get("sessionId").or_else(|| fields.get("sessionid")).cloned();

        // Rule information
        parsed.rule_id = fields.get("ruleId").or_else(|| fields.get("rule")).cloned();
        parsed.rule_name = fields.get("ruleName").cloned();
        parsed.policy_id = fields.get("policyId").cloned();
    }

    fn map_threat_fields(&self, parsed: &mut ParsedEvent, fields: &HashMap<String, String>) {
        // Threat-specific field mappings
        
        parsed.threat_name = fields.get("threatName")
            .or_else(|| fields.get("threat"))
            .or_else(|| fields.get("signature"))
            .cloned();
        
        parsed.threat_category = fields.get("threatCategory")
            .or_else(|| fields.get("category"))
            .cloned();

        // Severity mapping
        if let Some(sev) = fields.get("sev").or_else(|| fields.get("severity")) {
            parsed.severity = Some(sev.clone());
            parsed.cim_severity = Some(sev.clone());
        }

        // File information for malware events
        parsed.file_name = fields.get("fileName").or_else(|| fields.get("filename")).cloned();
        parsed.file_path = fields.get("filePath").or_else(|| fields.get("filepath")).cloned();
        parsed.file_hash = fields.get("fileHash")
            .or_else(|| fields.get("md5"))
            .or_else(|| fields.get("sha1"))
            .or_else(|| fields.get("sha256"))
            .cloned();

        // URL information for web threats
        parsed.url = fields.get("url").or_else(|| fields.get("requestURL")).cloned();
        parsed.http_method = fields.get("httpMethod").or_else(|| fields.get("method")).cloned();
        parsed.user_agent = fields.get("userAgent").or_else(|| fields.get("ua")).cloned();
        parsed.http_status = fields.get("httpStatus").or_else(|| fields.get("status")).cloned();
    }

    fn map_system_fields(&self, parsed: &mut ParsedEvent, fields: &HashMap<String, String>) {
        // System-specific field mappings
        
        parsed.event_type = Some("system".to_string());
        
        // System event details
        parsed.process_name = fields.get("processName").or_else(|| fields.get("process")).cloned();
        parsed.command_line = fields.get("commandLine").or_else(|| fields.get("cmd")).cloned();
        
        // Configuration changes
        if fields.contains_key("configChange") || fields.contains_key("configuration") {
            parsed.event_category = Some("configuration".to_string());
        }
    }

    fn map_globalprotect_fields(&self, parsed: &mut ParsedEvent, fields: &HashMap<String, String>) {
        // GlobalProtect-specific field mappings
        
        parsed.event_type = Some("vpn".to_string());
        
        // VPN session information
        parsed.vpn_client_ip = fields.get("clientIp").or_else(|| fields.get("vpnIp")).cloned();
        parsed.vpn_tunnel_type = fields.get("tunnelType").cloned();
        
        // Authentication details
        parsed.auth_method = fields.get("authMethod").or_else(|| fields.get("authentication")).cloned();
        parsed.auth_result = fields.get("authResult").or_else(|| fields.get("result")).cloned();
    }

    fn construct_message(&self, fields: &HashMap<String, String>, log_type: &PaloAltoLogType) -> String {
        let mut msg_parts = Vec::new();
        
        // Add log type context
        match log_type {
            PaloAltoLogType::Traffic => msg_parts.push("Traffic".to_string()),
            PaloAltoLogType::Threat => msg_parts.push("Threat".to_string()),
            PaloAltoLogType::System => msg_parts.push("System".to_string()),
            PaloAltoLogType::GlobalProtect => msg_parts.push("GlobalProtect".to_string()),
            _ => {},
        }
        
        // Add action if available
        if let Some(action) = fields.get("act").or_else(|| fields.get("action")) {
            msg_parts.push(format!("Action: {}", action));
        }
        
        // Add source/destination for network events
        if let Some(src) = fields.get("src") {
            if let Some(dst) = fields.get("dst") {
                msg_parts.push(format!("{} -> {}", src, dst));
            }
        }
        
        // Add threat name for threat events
        if let Some(threat) = fields.get("threatName").or_else(|| fields.get("threat")) {
            msg_parts.push(format!("Threat: {}", threat));
        }
        
        // Add application for traffic events
        if let Some(app) = fields.get("app").or_else(|| fields.get("application")) {
            msg_parts.push(format!("App: {}", app));
        }
        
        if msg_parts.is_empty() {
            "Palo Alto Networks event".to_string()
        } else {
            msg_parts.join(" | ")
        }
    }
}

impl LogParser for PaloAltoEnhancedParser {
    fn parse(&self, raw_log: &str) -> Result<ParsedEvent, Box<dyn Error>> {
        let format = self.detect_format(raw_log);
        
        let fields = match format {
            PaloAltoLogFormat::Leef => self.parse_leef(raw_log)?,
            PaloAltoLogFormat::Cef => self.parse_cef(raw_log)?,
            PaloAltoLogFormat::Csv => self.parse_csv(raw_log)?,
            PaloAltoLogFormat::Syslog => self.parse_syslog(raw_log)?,
        };
        
        let log_type = self.detect_log_type(raw_log);
        let parsed = self.map_to_cim(&fields, &log_type);
        
        Ok(parsed)
    }

    fn name(&self) -> &str {
        "PaloAltoEnhanced"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_leef_traffic_log() {
        let parser = PaloAltoEnhancedParser::new().unwrap();
        
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tsrc=10.20.105.24\tdst=192.168.1.100\tsrcPort=54321\tdstPort=80\tproto=TCP\tact=allow\tsrcUser=jdoe\tdevName=PA-3220\tapp=web-browsing\tsrcZone=trust\tdstZone=untrust";
        
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.source_ip, Some("10.20.105.24".to_string()));
        assert_eq!(result.destination_ip, Some("192.168.1.100".to_string()));
        assert_eq!(result.source_port, Some(54321));
        assert_eq!(result.destination_port, Some(80));
        assert_eq!(result.protocol, Some("TCP".to_string()));
        assert_eq!(result.username, Some("jdoe".to_string()));
        assert_eq!(result.action, Some("allow".to_string()));
        assert_eq!(result.outcome, Some("success".to_string()));
        assert_eq!(result.hostname, Some("PA-3220".to_string()));
        assert_eq!(result.app_name, Some("web-browsing".to_string()));
        assert_eq!(result.src_zone, Some("trust".to_string()));
        assert_eq!(result.dest_zone, Some("untrust".to_string()));
        assert!(result.timestamp.is_some());
    }

    #[test]
    fn test_cef_threat_log() {
        let parser = PaloAltoEnhancedParser::new().unwrap();
        
        let raw_log = "CEF:0|Palo Alto Networks|PAN-OS|10.1.0|threat|Threat Detected|High|src=192.168.1.100 dst=10.0.0.5 threatName=Malware.Generic severity=high category=malware";
        
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.source_ip, Some("192.168.1.100".to_string()));
        assert_eq!(result.destination_ip, Some("10.0.0.5".to_string()));
        assert_eq!(result.threat_name, Some("Malware.Generic".to_string()));
        assert_eq!(result.severity, Some("high".to_string()));
        assert_eq!(result.threat_category, Some("malware".to_string()));
    }

    #[test]
    fn test_csv_format() {
        let parser = PaloAltoEnhancedParser::new().unwrap();
        
        let raw_log = "\"2024-01-15 10:30:45\",\"001234567890\",\"TRAFFIC\",\"end\",\"10.20.105.24\",\"192.168.1.100\",\"54321\",\"80\",\"TCP\",\"allow\"";
        
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.source_ip, Some("10.20.105.24".to_string()));
        assert_eq!(result.destination_ip, Some("192.168.1.100".to_string()));
        assert_eq!(result.action, Some("allow".to_string()));
    }

    #[test]
    fn test_deny_action_mapping() {
        let parser = PaloAltoEnhancedParser::new().unwrap();
        
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|TRAFFIC|\t|devTime=2024-01-15 10:30:45\tsrc=192.168.1.200\tdst=10.0.0.5\tact=deny";
        
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.action, Some("deny".to_string()));
        assert_eq!(result.outcome, Some("failure".to_string()));
    }

    #[test]
    fn test_globalprotect_log() {
        let parser = PaloAltoEnhancedParser::new().unwrap();
        
        let raw_log = "LEEF:2.0|Palo Alto Networks|PAN-OS|10.1.0|GLOBALPROTECT|\t|devTime=2024-01-15 10:30:45\tuser=jdoe\tclientIp=203.0.113.10\tact=login\tauthMethod=LDAP\tauthResult=success";
        
        let result = parser.parse(raw_log).unwrap();
        
        assert_eq!(result.username, Some("jdoe".to_string()));
        assert_eq!(result.action, Some("login".to_string()));
        assert_eq!(result.outcome, Some("success".to_string()));
        assert!(result.message.as_ref().unwrap().contains("GlobalProtect"));
    }
}