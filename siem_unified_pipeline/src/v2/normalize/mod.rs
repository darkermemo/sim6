use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Normalized {
    pub event_category: String,
    pub event_type: String,
    pub action: String,
    pub user: String,
    pub source_ip: String,
    pub destination_ip: String,
    pub host: String,
    pub severity: i16,
    pub vendor: String,
    pub product: String,
    pub parsed_fields: HashMap<String, String>,
}

/// Normalize raw log data based on parser type
pub fn normalize(raw: &str, parser_id: Option<&str>) -> Normalized {
    let parser = parser_id.unwrap_or("auto");
    
    match parser {
        "okta" => normalize_okta(raw),
        "windows" => normalize_windows(raw),
        "zeek_http" => normalize_zeek_http(raw),
        "auto" => auto_detect_and_normalize(raw),
        _ => normalize_generic(raw),
    }
}

/// Okta normalization (ECS/CIM style)
fn normalize_okta(raw: &str) -> Normalized {
    let mut norm = Normalized { vendor: "Okta".to_string(), product: "SSO".to_string(), ..Default::default() };
    
    if let Ok(json) = serde_json::from_str::<Value>(raw) {
        // Event categorization
        if let Some(event_type) = json.get("eventType").and_then(|v| v.as_str()) {
            norm.parsed_fields.insert("eventType".to_string(), event_type.to_string());
            
            // Map to ECS categories
            if event_type.contains("user.session.start") {
                norm.event_category = "authentication".to_string();
                norm.event_type = "start".to_string();
                norm.action = "login".to_string();
            } else if event_type.contains("user.session.end") {
                norm.event_category = "authentication".to_string();
                norm.event_type = "end".to_string();
                norm.action = "logout".to_string();
            } else if event_type.contains("user.authentication") {
                norm.event_category = "authentication".to_string();
                norm.event_type = "info".to_string();
                norm.action = event_type.to_string();
            } else {
                norm.event_category = "iam".to_string();
                norm.event_type = "info".to_string();
                norm.action = event_type.to_string();
            }
        }
        
        // User extraction
        if let Some(actor) = json.get("actor") {
            if let Some(display) = actor.get("displayName").and_then(|v| v.as_str()) {
                norm.user = display.to_string();
            } else if let Some(email) = actor.get("alternateId").and_then(|v| v.as_str()) {
                norm.user = email.to_string();
            }
        }
        
        // IP extraction
        if let Some(client) = json.get("client") {
            if let Some(ip) = client.get("ipAddress").and_then(|v| v.as_str()) {
                norm.source_ip = ip.to_string();
            }
        }
        
        // Severity mapping
        if let Some(outcome) = json.get("outcome").and_then(|v| v.get("result")).and_then(|v| v.as_str()) {
            norm.severity = match outcome {
                "FAILURE" | "DENY" => 5,
                "SUCCESS" | "ALLOW" => 3,
                _ => 4,
            };
        }
        
        // Additional fields
        if let Some(msg) = json.get("displayMessage").and_then(|v| v.as_str()) {
            norm.parsed_fields.insert("message".to_string(), msg.to_string());
        }
    }
    
    norm
}

/// Windows Security Event Log normalization
fn normalize_windows(raw: &str) -> Normalized {
    let mut norm = Normalized { vendor: "Microsoft".to_string(), product: "Windows".to_string(), ..Default::default() };
    
    if let Ok(json) = serde_json::from_str::<Value>(raw) {
        // Event ID mapping
        if let Some(event_id) = json.get("EventID").and_then(|v| v.as_u64()) {
            norm.parsed_fields.insert("EventID".to_string(), event_id.to_string());
            
            match event_id {
                4624 => {
                    norm.event_category = "authentication".to_string();
                    norm.event_type = "start".to_string();
                    norm.action = "logon".to_string();
                }
                4625 => {
                    norm.event_category = "authentication".to_string();
                    norm.event_type = "start".to_string();
                    norm.action = "logon_failed".to_string();
                    norm.severity = 5;
                }
                4634 | 4647 => {
                    norm.event_category = "authentication".to_string();
                    norm.event_type = "end".to_string();
                    norm.action = "logoff".to_string();
                }
                4720 => {
                    norm.event_category = "iam".to_string();
                    norm.event_type = "creation".to_string();
                    norm.action = "user_created".to_string();
                }
                _ => {
                    norm.event_category = "system".to_string();
                    norm.event_type = "info".to_string();
                    norm.action = format!("event_{}", event_id);
                }
            }
        }
        
        // User extraction
        if let Some(user) = json.get("TargetUserName").and_then(|v| v.as_str()) {
            norm.user = user.to_string();
        } else if let Some(user) = json.get("SubjectUserName").and_then(|v| v.as_str()) {
            norm.user = user.to_string();
        }
        
        // IP extraction  
        if let Some(ip) = json.get("IpAddress").and_then(|v| v.as_str()) {
            if ip != "-" && ip != "::1" {
                norm.source_ip = ip.to_string();
            }
        }
        
        // Host
        if let Some(host) = json.get("Computer").and_then(|v| v.as_str()) {
            norm.host = host.to_string();
        }
    }
    
    norm
}

/// Zeek HTTP log normalization
fn normalize_zeek_http(raw: &str) -> Normalized {
    let mut norm = Normalized {
        vendor: "Zeek".to_string(),
        product: "Network Security Monitor".to_string(),
        event_category: "network".to_string(),
        event_type: "protocol".to_string(),
        action: "http_request".to_string(),
        ..Default::default()
    };
    
    if let Ok(json) = serde_json::from_str::<Value>(raw) {
        // IPs
        if let Some(ip) = json.get("id.orig_h").and_then(|v| v.as_str()) {
            norm.source_ip = ip.to_string();
        }
        if let Some(ip) = json.get("id.resp_h").and_then(|v| v.as_str()) {
            norm.destination_ip = ip.to_string();
        }
        
        // HTTP details
        if let Some(method) = json.get("method").and_then(|v| v.as_str()) {
            norm.parsed_fields.insert("http.method".to_string(), method.to_string());
        }
        if let Some(uri) = json.get("uri").and_then(|v| v.as_str()) {
            norm.parsed_fields.insert("http.uri".to_string(), uri.to_string());
        }
        if let Some(status) = json.get("status_code").and_then(|v| v.as_u64()) {
            norm.parsed_fields.insert("http.status_code".to_string(), status.to_string());
            
            // Severity based on status code
            norm.severity = match status {
                200..=299 => 2,
                300..=399 => 3,
                400..=499 => 4,
                500..=599 => 5,
                _ => 3,
            };
        }
        
        // User agent
        if let Some(ua) = json.get("user_agent").and_then(|v| v.as_str()) {
            norm.parsed_fields.insert("http.user_agent".to_string(), ua.to_string());
        }
        
        // Host
        if let Some(host) = json.get("host").and_then(|v| v.as_str()) {
            norm.host = host.to_string();
        }
    }
    
    norm
}

/// Auto-detect parser based on content
fn auto_detect_and_normalize(raw: &str) -> Normalized {
    // Try JSON first
    if let Ok(json) = serde_json::from_str::<Value>(raw) {
        // Okta detection
        if json.get("eventType").is_some() && json.get("actor").is_some() {
            return normalize_okta(raw);
        }
        
        // Windows detection
        if json.get("EventID").is_some() && json.get("Computer").is_some() {
            return normalize_windows(raw);
        }
        
        // Zeek detection
        if json.get("id.orig_h").is_some() && json.get("id.resp_h").is_some() {
            return normalize_zeek_http(raw);
        }
    }
    
    // Fallback to generic
    normalize_generic(raw)
}

/// Generic normalization for unknown formats
fn normalize_generic(raw: &str) -> Normalized {
    let mut norm = Normalized { event_category: "unknown".to_string(), event_type: "info".to_string(), severity: 3, ..Default::default() };
    
    // Try to extract basic fields
    if let Ok(json) = serde_json::from_str::<Value>(raw) {
        // Common field names - check source IPs
        if let Some(val) = json.get("src_ip").or_else(|| json.get("source_ip")).or_else(|| json.get("srcip")).and_then(|v| v.as_str()) {
            norm.source_ip = val.to_string();
        }
        
        // Check destination IPs
        if let Some(val) = json.get("dst_ip").or_else(|| json.get("destination_ip")).or_else(|| json.get("dstip")).and_then(|v| v.as_str()) {
            norm.destination_ip = val.to_string();
        }
        
        // Check user fields
        if let Some(val) = json.get("user").or_else(|| json.get("username")).and_then(|v| v.as_str()) {
            norm.user = val.to_string();
        }
        
        // Check host fields
        if let Some(val) = json.get("host").or_else(|| json.get("hostname")).and_then(|v| v.as_str()) {
            norm.host = val.to_string();
        }
        
        // Store all fields in parsed_fields
        if let Some(obj) = json.as_object() {
            for (k, v) in obj {
                if let Some(s) = v.as_str() {
                    norm.parsed_fields.insert(k.clone(), s.to_string());
                } else if let Ok(s) = serde_json::to_string(v) {
                    norm.parsed_fields.insert(k.clone(), s);
                }
            }
        }
    }
    
    norm
}

/// Extract potential IOCs from normalized data
pub fn extract_iocs(norm: &Normalized) -> Vec<(String, String)> {
    let mut iocs = Vec::new();
    
    // IPs
    if !norm.source_ip.is_empty() && norm.source_ip != "0.0.0.0" {
        iocs.push((norm.source_ip.clone(), "ip".to_string()));
    }
    if !norm.destination_ip.is_empty() && norm.destination_ip != "0.0.0.0" {
        iocs.push((norm.destination_ip.clone(), "ip".to_string()));
    }
    
    // Domains from host
    if !norm.host.is_empty() {
        iocs.push((norm.host.clone(), "domain".to_string()));
    }
    
    // Extract from parsed fields
    for (key, value) in &norm.parsed_fields {
        if (key.contains("domain") || key.contains("host")) && !value.is_empty() && value.contains('.') {
            iocs.push((value.clone(), "domain".to_string()));
        }
        if (key.contains("hash") || key.contains("md5") || key.contains("sha")) && value.len() >= 32 && value.chars().all(|c| c.is_ascii_hexdigit()) {
            iocs.push((value.clone(), "hash".to_string()));
        }
    }
    
    iocs
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_normalize_okta() {
        let okta_log = r#"{
            "eventType": "user.session.start",
            "actor": {"displayName": "John Doe", "alternateId": "john@example.com"},
            "client": {"ipAddress": "10.0.0.1"},
            "outcome": {"result": "SUCCESS"}
        }"#;
        
        let norm = normalize(okta_log, Some("okta"));
        assert_eq!(norm.event_category, "authentication");
        assert_eq!(norm.user, "John Doe");
        assert_eq!(norm.source_ip, "10.0.0.1");
        assert_eq!(norm.severity, 3);
    }
    
    #[test]
    fn test_extract_iocs() {
        let norm = Normalized { source_ip: "192.168.1.100".to_string(), host: "malicious.example.com".to_string(), ..Default::default() };
        
        let iocs = extract_iocs(&norm);
        assert_eq!(iocs.len(), 2);
        assert!(iocs.contains(&("192.168.1.100".to_string(), "ip".to_string())));
        assert!(iocs.contains(&("malicious.example.com".to_string(), "domain".to_string())));
    }
}
