//! Log template generators for various security products
//! Provides realistic log formats for Fortinet, Sophos, F5, and Trend Micro

use crate::generator::tenant_simulator::TenantInfo;
use chrono::Utc;
use rand::Rng;
use rand::seq::SliceRandom;
use serde_json::{json, Value};

/// Generate a Fortinet FortiGate firewall log
pub fn generate_fortinet_log(tenant: &TenantInfo, thread_id: usize, index: usize) -> Value {
    let mut rng = rand::thread_rng();
    let timestamp = Utc::now();
    
    // Generate realistic IP addresses
    let src_ip = generate_tenant_ip(tenant, thread_id, index);
    let dst_ip = generate_random_ip(&mut rng);
    
    // Random ports
    let src_port = rng.gen_range(1024..65535);
    let dst_port = *[80, 443, 22, 21, 25, 53, 3389].choose(&mut rng).unwrap_or(&80);
    
    // Random actions and severities
    let action = *["accept", "deny", "block", "drop"].choose(&mut rng).unwrap_or(&"deny");
    let severity = *["critical", "high", "medium", "low", "info"].choose(&mut rng).unwrap_or(&"medium");
    
    // Protocol
    let protocol = *["TCP", "UDP", "ICMP"].choose(&mut rng).unwrap_or(&"TCP");
    
    json!({
        "log_type": "fortinet",
        "vendor": "Fortinet",
        "product": "FortiGate",
        "version": "6.4.8",
        "timestamp": timestamp.to_rfc3339(),
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "device_id": format!("FGT-{}-{:03}", tenant.id, thread_id),
        "log_id": format!("{:016x}", rng.gen::<u64>()),
        "type": "traffic",
        "subtype": "forward",
        "level": severity,
        "action": action,
        "policyid": rng.gen_range(1..1000),
        "policytype": "policy",
        "srcip": src_ip,
        "dstip": dst_ip,
        "srcport": src_port,
        "dstport": dst_port,
        "srcintf": "port1",
        "dstintf": "port2",
        "proto": protocol,
        "service": format!("{}_{}", protocol, dst_port),
        "duration": rng.gen_range(1..3600),
        "sentbyte": rng.gen_range(64..1048576),
        "rcvdbyte": rng.gen_range(64..1048576),
        "sentpkt": rng.gen_range(1..1000),
        "rcvdpkt": rng.gen_range(1..1000),
        "appcat": "unscanned",
        "crscore": rng.gen_range(1..100),
        "craction": rng.gen_range(1..10),
        "crlevel": "low"
    })
}

/// Generate a Sophos WAF log
pub fn generate_sophos_log(tenant: &TenantInfo, thread_id: usize, index: usize) -> Value {
    let mut rng = rand::thread_rng();
    let timestamp = Utc::now();
    
    let src_ip = generate_tenant_ip(tenant, thread_id, index);
    let _dst_ip = generate_random_ip(&mut rng);
    
    // HTTP methods and status codes
    let method = *["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"].choose(&mut rng).unwrap_or(&"GET");
    let status_code = *[200, 301, 302, 400, 401, 403, 404, 500, 502, 503].choose(&mut rng).unwrap_or(&200);
    
    // WAF actions
    let action = *["allow", "block", "monitor", "challenge"].choose(&mut rng).unwrap_or(&"allow");
    let threat_type = *["SQL Injection", "XSS", "Command Injection", "Path Traversal", "Malware", "Bot"].choose(&mut rng).unwrap_or(&"SQL Injection");
    
    // Generate realistic URLs
    let urls = [
        "/api/v1/users",
        "/login",
        "/admin/dashboard",
        "/search?q=test",
        "/upload",
        "/api/data",
        "/static/js/app.js",
        "/images/logo.png"
    ];
    let url = *urls.choose(&mut rng).unwrap_or(&"/");
    
    json!({
        "log_type": "sophos",
        "vendor": "Sophos",
        "product": "WAF",
        "version": "9.7.1",
        "timestamp": timestamp.to_rfc3339(),
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "device_id": format!("SWAF-{}-{:03}", tenant.id, thread_id),
        "log_id": format!("{:016x}", rng.gen::<u64>()),
        "event_type": "web_attack",
        "severity": *["critical", "high", "medium", "low"].choose(&mut rng).unwrap_or(&"medium"),
        "action": action,
        "src_ip": src_ip,
        "dst_ip": _dst_ip,
        "src_port": rng.gen_range(1024..65535),
        "dst_port": 80,
        "protocol": "HTTP",
        "method": method,
        "url": url,
        "user_agent": generate_user_agent(&mut rng),
        "referer": format!("https://example{}.com/", tenant.id),
        "status_code": status_code,
        "response_size": rng.gen_range(100..10000),
        "request_size": rng.gen_range(50..5000),
        "threat_type": threat_type,
        "rule_id": rng.gen_range(1000..9999),
        "rule_name": format!("WAF_RULE_{}", rng.gen_range(1..100)),
        "confidence": rng.gen_range(1..100),
        "country": *["US", "GB", "DE", "FR", "JP", "CN", "RU"].choose(&mut rng).unwrap_or(&"US"),
        "asn": rng.gen_range(1000..99999)
    })
}

/// Generate an F5 ASM (Application Security Manager) log
pub fn generate_f5_log(tenant: &TenantInfo, thread_id: usize, index: usize) -> Value {
    let mut rng = rand::thread_rng();
    let timestamp = Utc::now();
    
    let src_ip = generate_tenant_ip(tenant, thread_id, index);
    let _dst_ip = generate_random_ip(&mut rng);
    
    let method = *["GET", "POST", "PUT", "DELETE", "PATCH"].choose(&mut rng).unwrap_or(&"GET");
    let violation_type = *[
        "VIOL_PARAMETER",
        "VIOL_COOKIE",
        "VIOL_HEADER",
        "VIOL_URL",
        "VIOL_METHOD",
        "VIOL_FILETYPE",
        "VIOL_ATTACK_SIGNATURE"
    ].choose(&mut rng).unwrap_or(&"VIOL_PARAMETER");
    
    let severity = *["Critical", "Error", "Warning", "Notice", "Informational"].choose(&mut rng).unwrap_or(&"Warning");
    
    json!({
        "log_type": "f5",
        "vendor": "F5",
        "product": "ASM",
        "version": "15.1.0",
        "timestamp": timestamp.to_rfc3339(),
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "device_id": format!("F5ASM-{}-{:03}", tenant.id, thread_id),
        "log_id": format!("{:016x}", rng.gen::<u64>()),
        "event_type": "security_event",
        "severity": severity,
        "policy_name": format!("policy_tenant_{}", tenant.id),
        "src_ip": src_ip,
        "dest_ip": _dst_ip,
        "src_port": rng.gen_range(1024..65535),
        "dest_port": *[80, 443, 8080, 8443].choose(&mut rng).unwrap_or(&80),
        "protocol": "HTTP",
        "method": method,
        "uri": format!("/api/v{}/endpoint", rng.gen_range(1..4)),
        "query_string": format!("id={}&action=view", rng.gen_range(1..1000)),
        "user_agent": generate_user_agent(&mut rng),
        "violation_type": violation_type,
        "violation_rating": rng.gen_range(1..5),
        "request_status": *["blocked", "alerted", "passed"].choose(&mut rng).unwrap_or(&"alerted"),
        "response_code": *[200, 403, 404, 500].choose(&mut rng).unwrap_or(&200),
        "attack_type": *["Cross Site Scripting (XSS)", "SQL-Injection", "Command Execution", "Path Traversal"].choose(&mut rng).unwrap_or(&"SQL-Injection"),
        "geo_location": *["US", "CA", "GB", "DE", "FR", "AU", "JP"].choose(&mut rng).unwrap_or(&"US"),
        "signature_ids": format!("{},{},{}", rng.gen_range(200000000..299999999), rng.gen_range(200000000..299999999), rng.gen_range(200000000..299999999)),
        "x_forwarded_for": generate_random_ip(&mut rng),
        "session_id": format!("{:032x}", rng.gen::<u128>())
    })
}

/// Generate a Trend Micro LEEF (Log Event Extended Format) log
pub fn generate_trendmicro_log(tenant: &TenantInfo, thread_id: usize, index: usize) -> Value {
    let mut rng = rand::thread_rng();
    let timestamp = Utc::now();
    
    let src_ip = generate_tenant_ip(tenant, thread_id, index);
    let _dst_ip = generate_random_ip(&mut rng);
    
    let event_type = *[
        "Virus/Malware",
        "Spyware/Grayware",
        "URL Filtering",
        "Web Reputation",
        "Application Control",
        "Device Control"
    ].choose(&mut rng).unwrap_or(&"Virus/Malware");
    
    let action = *["Quarantine", "Delete", "Block", "Allow", "Monitor"].choose(&mut rng).unwrap_or(&"Block");
    
    // Generate malware names
    let malware_names = [
        "TROJ_GENERIC.R12345",
        "WORM_CONFICKER.A",
        "BKDR_POISON.SMM",
        "ADWARE_ADLOAD.A",
        "SPYW_KEYLOG.B",
        "RANSOM_WANNACRY.A"
    ];
    let malware = *malware_names.choose(&mut rng).unwrap_or(&"TROJ_GENERIC.R12345");
    
    json!({
        "log_type": "trendmicro",
        "vendor": "Trend Micro",
        "product": "Deep Security",
        "version": "20.0.0",
        "timestamp": timestamp.to_rfc3339(),
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "device_id": format!("TMDS-{}-{:03}", tenant.id, thread_id),
        "log_id": format!("{:016x}", rng.gen::<u64>()),
        "event_type": event_type,
        "severity": rng.gen_range(1..11),
        "computer_name": format!("HOST-{}-{:03}", tenant.id, rng.gen_range(1..100)),
        "computer_ip": src_ip,
        "computer_guid": format!("{{{:08x}-{:04x}-{:04x}-{:04x}-{:012x}}}", 
                                rng.gen::<u32>(), rng.gen::<u16>(), rng.gen::<u16>(), 
                                rng.gen::<u16>(), rng.gen::<u64>() & 0xffffffffffff),
        "action": action,
        "malware_name": malware,
        "file_path": format!("C:\\Users\\user{}\\Downloads\\file{}.exe", rng.gen_range(1..100), index),
        "file_hash_sha1": format!("{:040x}", rng.gen::<u128>() & 0xffffffffffffffffu128),
        "file_hash_md5": format!("{:032x}", rng.gen::<u128>()),
        "file_size": rng.gen_range(1024..10485760),
        "scan_type": *["Real-time", "Manual", "Scheduled", "Quick"].choose(&mut rng).unwrap_or(&"Real-time"),
        "scan_result": *["Found", "Cleaned", "Quarantined", "Deleted"].choose(&mut rng).unwrap_or(&"Found"),
        "engine_version": format!("{}.{:03}.{:02}", rng.gen_range(15..20), rng.gen_range(1..999), rng.gen_range(1..99)),
        "pattern_version": format!("{}.{:03}.{:02}", rng.gen_range(15..20), rng.gen_range(1..999), rng.gen_range(1..99)),
        "url": format!("http://malicious{}.example.com/payload.exe", rng.gen_range(1..1000)),
        "user_name": format!("user{}", rng.gen_range(1..100)),
        "domain_name": format!("DOMAIN{}", tenant.id),
        "process_name": *["chrome.exe", "firefox.exe", "explorer.exe", "winword.exe", "excel.exe"].choose(&mut rng).unwrap_or(&"chrome.exe"),
        "risk_level": *["High", "Medium", "Low"].choose(&mut rng).unwrap_or(&"Medium")
    })
}

/// Generate a tenant-specific IP address
fn generate_tenant_ip(tenant: &TenantInfo, thread_id: usize, index: usize) -> String {
    // Use tenant ID to create unique IP ranges
    let base_octet = (tenant.id % 254) + 1;
    let thread_octet = (thread_id % 254) + 1;
    let index_octet = (index % 254) + 1;
    
    format!("10.{}.{}.{}", base_octet, thread_octet, index_octet)
}

/// Generate a random IP address
fn generate_random_ip<R: Rng>(rng: &mut R) -> String {
    format!(
        "{}.{}.{}.{}",
        rng.gen_range(1..255),
        rng.gen_range(0..255),
        rng.gen_range(0..255),
        rng.gen_range(1..255)
    )
}

/// Generate a realistic user agent string
fn generate_user_agent<R: Rng>(rng: &mut R) -> String {
    let user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/91.0.864.59",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    ];
    
    user_agents.choose(rng).unwrap_or(&user_agents[0]).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generator::TemplateType;
    
    fn create_test_tenant() -> TenantInfo {
        TenantInfo {
            id: 1,
            name: "Test Tenant".to_string(),
            preferred_log_type: Some(TemplateType::Fortinet),
            ip_range: "10.1.0.0/24".to_string(),
        }
    }
    
    #[test]
    fn test_fortinet_log_generation() {
        let tenant = create_test_tenant();
        let log = generate_fortinet_log(&tenant, 0, 0);
        
        assert_eq!(log["log_type"], "fortinet");
        assert_eq!(log["vendor"], "Fortinet");
        assert_eq!(log["tenant_id"], 1);
        assert!(log["timestamp"].is_string());
        assert!(log["srcip"].is_string());
        assert!(log["dstip"].is_string());
    }
    
    #[test]
    fn test_sophos_log_generation() {
        let tenant = create_test_tenant();
        let log = generate_sophos_log(&tenant, 0, 0);
        
        assert_eq!(log["log_type"], "sophos");
        assert_eq!(log["vendor"], "Sophos");
        assert_eq!(log["tenant_id"], 1);
        assert!(log["timestamp"].is_string());
        assert!(log["src_ip"].is_string());
        assert!(log["method"].is_string());
    }
    
    #[test]
    fn test_f5_log_generation() {
        let tenant = create_test_tenant();
        let log = generate_f5_log(&tenant, 0, 0);
        
        assert_eq!(log["log_type"], "f5");
        assert_eq!(log["vendor"], "F5");
        assert_eq!(log["tenant_id"], 1);
        assert!(log["timestamp"].is_string());
        assert!(log["src_ip"].is_string());
        assert!(log["violation_type"].is_string());
    }
    
    #[test]
    fn test_trendmicro_log_generation() {
        let tenant = create_test_tenant();
        let log = generate_trendmicro_log(&tenant, 0, 0);
        
        assert_eq!(log["log_type"], "trendmicro");
        assert_eq!(log["vendor"], "Trend Micro");
        assert_eq!(log["tenant_id"], 1);
        assert!(log["timestamp"].is_string());
        assert!(log["computer_ip"].is_string());
        assert!(log["malware_name"].is_string());
    }
    
    #[test]
    fn test_ip_generation() {
        let tenant = create_test_tenant();
        let ip1 = generate_tenant_ip(&tenant, 0, 0);
        let ip2 = generate_tenant_ip(&tenant, 1, 0);
        
        assert!(ip1.starts_with("10."));
        assert!(ip2.starts_with("10."));
        assert_ne!(ip1, ip2); // Different thread IDs should generate different IPs
    }
    
    #[test]
    fn test_user_agent_generation() {
        let mut rng = rand::thread_rng();
        let ua = generate_user_agent(&mut rng);
        
        assert!(ua.contains("Mozilla"));
        assert!(!ua.is_empty());
    }
}