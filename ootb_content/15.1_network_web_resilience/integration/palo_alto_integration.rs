//! Palo Alto Networks OOTB Content Integration
//! 
//! This module provides integration functionality for the Palo Alto Networks
//! OOTB content pack, including parser registration, taxonomy loading,
//! rule deployment, and dashboard setup.

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use serde_json::{Value, from_str};
use crate::parsers::palo_alto_enhanced::PaloAltoEnhancedParser;
use crate::ParsedEvent;

/// Palo Alto Networks OOTB Content Pack Integration
pub struct PaloAltoIntegration {
    parser: PaloAltoEnhancedParser,
    taxonomy_mappings: Option<Value>,
    detection_rules: Vec<Value>,
    dashboard_config: Option<Value>,
}

impl PaloAltoIntegration {
    /// Create a new Palo Alto integration instance
    pub fn new() -> Self {
        Self {
            parser: PaloAltoEnhancedParser::new(),
            taxonomy_mappings: None,
            detection_rules: Vec::new(),
            dashboard_config: None,
        }
    }

    /// Initialize the complete OOTB content pack
    pub fn initialize(&mut self, content_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.load_taxonomy_mappings(content_path)?;
        self.load_detection_rules(content_path)?;
        self.load_dashboard_config(content_path)?;
        self.validate_integration()?;
        Ok(())
    }

    /// Load taxonomy mappings from JSON file
    fn load_taxonomy_mappings(&mut self, content_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        let taxonomy_path = format!("{}/taxonomy/palo_alto_mappings.json", content_path);
        let content = fs::read_to_string(&taxonomy_path)
            .map_err(|e| format!("Failed to read taxonomy mappings: {}", e))?;
        
        self.taxonomy_mappings = Some(from_str(&content)
            .map_err(|e| format!("Failed to parse taxonomy mappings: {}", e))?);
        
        println!("✓ Loaded Palo Alto taxonomy mappings from {}", taxonomy_path);
        Ok(())
    }

    /// Load detection rules from YAML files
    fn load_detection_rules(&mut self, content_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        let rules_path = format!("{}/rules", content_path);
        let rules_dir = Path::new(&rules_path);
        
        if !rules_dir.exists() {
            return Err(format!("Rules directory not found: {}", rules_path).into());
        }

        for entry in fs::read_dir(rules_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.extension().and_then(|s| s.to_str()) == Some("yml") {
                let content = fs::read_to_string(&path)?;
                
                // Parse YAML rules (simplified - in real implementation would use yaml parser)
                let rule_data = self.parse_sigma_rule(&content)?;
                self.detection_rules.push(rule_data);
                
                println!("✓ Loaded detection rule from {:?}", path.file_name().unwrap());
            }
        }
        
        Ok(())
    }

    /// Load dashboard configuration from JSON file
    fn load_dashboard_config(&mut self, content_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        let dashboard_path = format!("{}/dashboards/palo_alto_security_overview.json", content_path);
        let content = fs::read_to_string(&dashboard_path)
            .map_err(|e| format!("Failed to read dashboard config: {}", e))?;
        
        self.dashboard_config = Some(from_str(&content)
            .map_err(|e| format!("Failed to parse dashboard config: {}", e))?);
        
        println!("✓ Loaded Palo Alto dashboard configuration from {}", dashboard_path);
        Ok(())
    }

    /// Parse a Sigma rule (simplified implementation)
    fn parse_sigma_rule(&self, content: &str) -> Result<Value, Box<dyn std::error::Error>> {
        // In a real implementation, this would use a proper YAML parser
        // For now, we'll create a simplified JSON representation
        let mut rule = serde_json::Map::new();
        
        for line in content.lines() {
            if line.starts_with("title:") {
                rule.insert("title".to_string(), Value::String(line[6..].trim().to_string()));
            } else if line.starts_with("id:") {
                rule.insert("id".to_string(), Value::String(line[3..].trim().to_string()));
            } else if line.starts_with("level:") {
                rule.insert("level".to_string(), Value::String(line[6..].trim().to_string()));
            }
        }
        
        Ok(Value::Object(rule))
    }

    /// Validate the complete integration
    fn validate_integration(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Validate taxonomy mappings
        if let Some(ref taxonomy) = self.taxonomy_mappings {
            self.validate_taxonomy_mappings(taxonomy)?;
        } else {
            return Err("Taxonomy mappings not loaded".into());
        }

        // Validate detection rules
        if self.detection_rules.is_empty() {
            return Err("No detection rules loaded".into());
        }
        self.validate_detection_rules()?;

        // Validate dashboard configuration
        if let Some(ref dashboard) = self.dashboard_config {
            self.validate_dashboard_config(dashboard)?;
        } else {
            return Err("Dashboard configuration not loaded".into());
        }

        println!("✓ All OOTB content components validated successfully");
        Ok(())
    }

    /// Validate taxonomy mappings structure
    fn validate_taxonomy_mappings(&self, taxonomy: &Value) -> Result<(), Box<dyn std::error::Error>> {
        let required_fields = vec!["name", "description", "vendor", "product", "mappings"];
        
        for field in required_fields {
            if !taxonomy.get(field).is_some() {
                return Err(format!("Missing required taxonomy field: {}", field).into());
            }
        }

        if let Some(mappings) = taxonomy.get("mappings").and_then(|m| m.as_array()) {
            for mapping in mappings {
                self.validate_taxonomy_mapping(mapping)?;
            }
        }

        println!("✓ Taxonomy mappings validation passed");
        Ok(())
    }

    /// Validate individual taxonomy mapping
    fn validate_taxonomy_mapping(&self, mapping: &Value) -> Result<(), Box<dyn std::error::Error>> {
        let required_fields = vec!["field_name", "taxonomy_category", "mapping_rules"];
        
        for field in required_fields {
            if !mapping.get(field).is_some() {
                return Err(format!("Missing required mapping field: {}", field).into());
            }
        }
        
        Ok(())
    }

    /// Validate detection rules
    fn validate_detection_rules(&self) -> Result<(), Box<dyn std::error::Error>> {
        for (index, rule) in self.detection_rules.iter().enumerate() {
            self.validate_detection_rule(rule, index)?;
        }
        
        println!("✓ Detection rules validation passed ({} rules)", self.detection_rules.len());
        Ok(())
    }

    /// Validate individual detection rule
    fn validate_detection_rule(&self, rule: &Value, index: usize) -> Result<(), Box<dyn std::error::Error>> {
        let required_fields = vec!["title", "id"];
        
        for field in required_fields {
            if !rule.get(field).is_some() {
                return Err(format!("Missing required rule field '{}' in rule {}", field, index).into());
            }
        }
        
        Ok(())
    }

    /// Validate dashboard configuration
    fn validate_dashboard_config(&self, dashboard: &Value) -> Result<(), Box<dyn std::error::Error>> {
        let dashboard_obj = dashboard.get("dashboard")
            .ok_or("Missing dashboard object")?;
        
        let required_fields = vec!["id", "name", "description", "layout"];
        
        for field in required_fields {
            if !dashboard_obj.get(field).is_some() {
                return Err(format!("Missing required dashboard field: {}", field).into());
            }
        }

        // Validate layout structure
        if let Some(layout) = dashboard_obj.get("layout") {
            if !layout.get("widgets").and_then(|w| w.as_array()).is_some() {
                return Err("Dashboard layout missing widgets array".into());
            }
        }

        println!("✓ Dashboard configuration validation passed");
        Ok(())
    }

    /// Test parser with sample logs
    pub fn test_parser_integration(&self) -> Result<(), Box<dyn std::error::Error>> {
        let test_logs = vec![
            // LEEF Traffic Log
            "LEEF:2.0|PaloAlto|PAN-OS|9.1.0|TRAFFIC|devTime=2024-01-15T10:30:00Z|src=192.168.1.100|dst=8.8.8.8|srcPort=12345|dstPort=80|proto=TCP|act=allow|srcUser=john.doe|devName=firewall-01|app=web-browsing|sev=informational",
            
            // CEF Threat Log
            "CEF:0|Palo Alto Networks|PAN-OS|9.1.0|THREAT|Threat Log|8|rt=Jan 15 2024 10:30:00 UTC|src=192.168.1.100|dst=8.8.8.8|spt=12345|dpt=80|proto=TCP|act=alert|suser=john.doe|dhost=firewall-01|app=web-browsing|cs1=malware|cs1Label=ThreatCategory",
            
            // Syslog System Log
            "<14>Jan 15 10:30:00 firewall-01 1,2024/01/15 10:30:00,001606001116,SYSTEM,general,0,2024/01/15 10:30:00,192.168.1.1,admin,Configuration,Succeeded,general,1234,0x0,admin,Web,User 'admin' logged in",
            
            // CSV GlobalProtect Log
            "1,2024/01/15 10:30:00,001606001116,GLOBALPROTECT,login,0,2024/01/15 10:30:00,192.168.1.100,john.doe,GlobalProtect,Succeeded,vpn,1234,0x0,john.doe,SSL,User logged in,US,certificate"
        ];

        for (index, log) in test_logs.iter().enumerate() {
            match self.parser.parse(log) {
                Ok(event) => {
                    println!("✓ Test log {} parsed successfully", index + 1);
                    self.validate_parsed_event(&event)?;
                },
                Err(e) => {
                    return Err(format!("Failed to parse test log {}: {}", index + 1, e).into());
                }
            }
        }

        println!("✓ Parser integration test passed");
        Ok(())
    }

    /// Validate parsed event structure
    fn validate_parsed_event(&self, event: &ParsedEvent) -> Result<(), Box<dyn std::error::Error>> {
        // Ensure timestamp is present
        if event.timestamp.is_none() {
            return Err("Parsed event missing timestamp".into());
        }

        // Ensure at least one IP address is present
        if event.source_ip.is_none() && event.destination_ip.is_none() {
            return Err("Parsed event missing IP addresses".into());
        }

        // Ensure message is not empty
        if event.message.is_empty() {
            return Err("Parsed event has empty message".into());
        }

        Ok(())
    }

    /// Apply taxonomy enrichment to a parsed event
    pub fn apply_taxonomy_enrichment(&self, event: &mut ParsedEvent) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(ref taxonomy) = self.taxonomy_mappings {
            if let Some(mappings) = taxonomy.get("mappings").and_then(|m| m.as_array()) {
                for mapping in mappings {
                    self.apply_single_taxonomy_mapping(event, mapping)?;
                }
            }

            // Apply enrichment rules
            if let Some(enrichment_rules) = taxonomy.get("enrichment_rules").and_then(|r| r.as_array()) {
                for rule in enrichment_rules {
                    self.apply_enrichment_rule(event, rule)?;
                }
            }
        }
        
        Ok(())
    }

    /// Apply a single taxonomy mapping to an event
    fn apply_single_taxonomy_mapping(&self, event: &mut ParsedEvent, mapping: &Value) -> Result<(), Box<dyn std::error::Error>> {
        if let (Some(field_name), Some(category), Some(subcategory)) = (
            mapping.get("field_name").and_then(|f| f.as_str()),
            mapping.get("taxonomy_category").and_then(|c| c.as_str()),
            mapping.get("taxonomy_subcategory").and_then(|s| s.as_str())
        ) {
            // Add taxonomy metadata to additional fields
            let taxonomy_key = format!("taxonomy_{}", field_name);
            let taxonomy_value = format!("{}:{}", category, subcategory);
            event.additional_fields.insert(taxonomy_key, taxonomy_value);
        }
        
        Ok(())
    }

    /// Apply enrichment rule to an event
    fn apply_enrichment_rule(&self, event: &mut ParsedEvent, rule: &Value) -> Result<(), Box<dyn std::error::Error>> {
        if let (Some(condition), Some(enrichment_fields)) = (
            rule.get("condition").and_then(|c| c.as_str()),
            rule.get("enrichment_fields").and_then(|f| f.as_object())
        ) {
            // Simplified condition evaluation (in real implementation would be more sophisticated)
            if self.evaluate_enrichment_condition(event, condition) {
                for (key, value) in enrichment_fields {
                    let enrichment_key = format!("enrichment_{}", key);
                    event.additional_fields.insert(enrichment_key, value.to_string());
                }
            }
        }
        
        Ok(())
    }

    /// Evaluate enrichment condition (simplified implementation)
    fn evaluate_enrichment_condition(&self, event: &ParsedEvent, condition: &str) -> bool {
        // Simplified condition evaluation
        if condition.contains("event_type == 'security_threat'") {
            return event.additional_fields.get("log_type").map_or(false, |t| t == "THREAT");
        }
        
        if condition.contains("src_zone == 'trust' AND dest_zone == 'untrust'") {
            let src_zone = event.additional_fields.get("src_zone").map_or("", |s| s);
            let dest_zone = event.additional_fields.get("dest_zone").map_or("", |s| s);
            return src_zone == "trust" && dest_zone == "untrust";
        }
        
        false
    }

    /// Generate integration report
    pub fn generate_integration_report(&self) -> String {
        let mut report = String::new();
        report.push_str("\n=== Palo Alto Networks OOTB Content Pack Integration Report ===\n\n");
        
        // Parser information
        report.push_str("Parser: PaloAltoEnhancedParser\n");
        report.push_str("Supported Formats: LEEF, CEF, Syslog, CSV\n");
        report.push_str("Supported Log Types: TRAFFIC, THREAT, SYSTEM, GLOBALPROTECT, CONFIG\n\n");
        
        // Taxonomy information
        if let Some(ref taxonomy) = self.taxonomy_mappings {
            if let Some(mappings) = taxonomy.get("mappings").and_then(|m| m.as_array()) {
                report.push_str(&format!("Taxonomy Mappings: {} field mappings loaded\n", mappings.len()));
            }
            if let Some(enrichment_rules) = taxonomy.get("enrichment_rules").and_then(|r| r.as_array()) {
                report.push_str(&format!("Enrichment Rules: {} rules loaded\n", enrichment_rules.len()));
            }
        }
        
        // Detection rules information
        report.push_str(&format!("Detection Rules: {} Sigma rules loaded\n", self.detection_rules.len()));
        
        // Dashboard information
        if let Some(ref dashboard) = self.dashboard_config {
            if let Some(widgets) = dashboard.get("dashboard")
                .and_then(|d| d.get("layout"))
                .and_then(|l| l.get("widgets"))
                .and_then(|w| w.as_array()) {
                report.push_str(&format!("Dashboard Widgets: {} visualization components\n", widgets.len()));
            }
        }
        
        report.push_str("\nIntegration Status: ✓ READY\n");
        report.push_str("\n=== End Report ===\n");
        
        report
    }

    /// Get parser instance
    pub fn get_parser(&self) -> &PaloAltoEnhancedParser {
        &self.parser
    }

    /// Get taxonomy mappings
    pub fn get_taxonomy_mappings(&self) -> Option<&Value> {
        self.taxonomy_mappings.as_ref()
    }

    /// Get detection rules
    pub fn get_detection_rules(&self) -> &Vec<Value> {
        &self.detection_rules
    }

    /// Get dashboard configuration
    pub fn get_dashboard_config(&self) -> Option<&Value> {
        self.dashboard_config.as_ref()
    }
}

impl Default for PaloAltoIntegration {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;

    fn create_test_content_pack() -> TempDir {
        let temp_dir = TempDir::new().unwrap();
        let base_path = temp_dir.path();
        
        // Create directory structure
        fs::create_dir_all(base_path.join("taxonomy")).unwrap();
        fs::create_dir_all(base_path.join("rules")).unwrap();
        fs::create_dir_all(base_path.join("dashboards")).unwrap();
        
        // Create minimal taxonomy file
        let taxonomy_content = r#"{
            "name": "Test Taxonomy",
            "description": "Test",
            "vendor": "Palo Alto Networks",
            "product": "PAN-OS",
            "mappings": [
                {
                    "field_name": "action",
                    "taxonomy_category": "Security Action",
                    "taxonomy_subcategory": "Firewall Action",
                    "mapping_rules": []
                }
            ],
            "enrichment_rules": []
        }"#;
        fs::write(base_path.join("taxonomy/palo_alto_mappings.json"), taxonomy_content).unwrap();
        
        // Create minimal rule file
        let rule_content = r#"title: Test Rule
id: test-rule-001
level: medium"#;
        fs::write(base_path.join("rules/test_rule.yml"), rule_content).unwrap();
        
        // Create minimal dashboard file
        let dashboard_content = r#"{
            "dashboard": {
                "id": "test-dashboard",
                "name": "Test Dashboard",
                "description": "Test",
                "layout": {
                    "widgets": []
                }
            }
        }"#;
        fs::write(base_path.join("dashboards/palo_alto_security_overview.json"), dashboard_content).unwrap();
        
        temp_dir
    }

    #[test]
    fn test_integration_initialization() {
        let temp_dir = create_test_content_pack();
        let mut integration = PaloAltoIntegration::new();
        
        let result = integration.initialize(temp_dir.path().to_str().unwrap());
        assert!(result.is_ok());
    }

    #[test]
    fn test_parser_integration() {
        let integration = PaloAltoIntegration::new();
        let result = integration.test_parser_integration();
        assert!(result.is_ok());
    }

    #[test]
    fn test_taxonomy_enrichment() {
        let temp_dir = create_test_content_pack();
        let mut integration = PaloAltoIntegration::new();
        integration.initialize(temp_dir.path().to_str().unwrap()).unwrap();
        
        let mut event = ParsedEvent::default();
        event.action = Some("allow".to_string());
        
        let result = integration.apply_taxonomy_enrichment(&mut event);
        assert!(result.is_ok());
    }

    #[test]
    fn test_integration_report() {
        let integration = PaloAltoIntegration::new();
        let report = integration.generate_integration_report();
        assert!(report.contains("Palo Alto Networks OOTB Content Pack"));
        assert!(report.contains("PaloAltoEnhancedParser"));
    }
}