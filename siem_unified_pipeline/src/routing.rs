use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn, debug};
use serde::{Deserialize, Serialize};
use regex::Regex;
use chrono::{DateTime, Utc};

use crate::config::PipelineConfig;
use crate::error::{Result, PipelineError};
use crate::pipeline::PipelineEvent;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingRule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub priority: u32,
    pub conditions: Vec<RoutingCondition>,
    pub destinations: Vec<String>,
    pub tags: Vec<String>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RoutingCondition {
    pub field: String,
    pub operator: ConditionOperator,
    pub value: serde_json::Value,
    pub case_sensitive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConditionOperator {
    Equals,
    NotEquals,
    Contains,
    NotContains,
    StartsWith,
    EndsWith,
    Regex,
    GreaterThan,
    LessThan,
    GreaterThanOrEqual,
    LessThanOrEqual,
    In,
    NotIn,
    Exists,
    NotExists,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingStats {
    pub rule_id: String,
    pub rule_name: String,
    pub matches: u64,
    pub events_routed: u64,
    pub last_match: Option<DateTime<Utc>>,
    pub destinations_used: HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DestinationStats {
    pub destination_name: String,
    pub events_received: u64,
    pub bytes_sent: u64,
    pub errors: u64,
    pub last_event: Option<DateTime<Utc>>,
    pub health_status: DestinationHealth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DestinationHealth {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}

pub struct RoutingManager {
    config: PipelineConfig,
    rules: Arc<RwLock<Vec<RoutingRule>>>,
    routing_stats: Arc<RwLock<HashMap<String, RoutingStats>>>,
    destination_stats: Arc<RwLock<HashMap<String, DestinationStats>>>,
    compiled_regexes: Arc<RwLock<HashMap<String, Regex>>>,
}

impl RoutingManager {
    pub async fn new(config: &PipelineConfig) -> Result<Self> {
        info!("Initializing routing manager");
        
        let manager = RoutingManager {
            config: config.clone(),
            rules: Arc::new(RwLock::new(Vec::new())),
            routing_stats: Arc::new(RwLock::new(HashMap::new())),
            destination_stats: Arc::new(RwLock::new(HashMap::new())),
            compiled_regexes: Arc::new(RwLock::new(HashMap::new())),
        };
        
        // Initialize destination stats
        {
            let mut dest_stats = manager.destination_stats.write().await;
            for dest_name in config.destinations.keys() {
                dest_stats.insert(dest_name.clone(), DestinationStats {
                    destination_name: dest_name.clone(),
                    events_received: 0,
                    bytes_sent: 0,
                    errors: 0,
                    last_event: None,
                    health_status: DestinationHealth::Unknown,
                });
            }
        }
        
        // Load default routing rules
        manager.load_default_rules().await?;
        
        Ok(manager)
    }
    
    async fn load_default_rules(&self) -> Result<()> {
        let default_rules = vec![
            RoutingRule {
                id: "security_events".to_string(),
                name: "Security Events".to_string(),
                description: "Route security-related events to SIEM storage".to_string(),
                enabled: true,
                priority: 100,
                conditions: vec![
                    RoutingCondition {
                        field: "severity".to_string(),
                        operator: ConditionOperator::In,
                        value: serde_json::json!(["critical", "error", "warning"]),
                        case_sensitive: false,
                    },
                    RoutingCondition {
                        field: "source_type".to_string(),
                        operator: ConditionOperator::In,
                        value: serde_json::json!(["syslog", "windows", "security"]),
                        case_sensitive: false,
                    },
                ],
                destinations: vec!["clickhouse_security".to_string()],
                tags: vec!["security".to_string(), "high_priority".to_string()],
                metadata: HashMap::new(),
            },
            RoutingRule {
                id: "application_logs".to_string(),
                name: "Application Logs".to_string(),
                description: "Route application logs to general storage".to_string(),
                enabled: true,
                priority: 50,
                conditions: vec![
                    RoutingCondition {
                        field: "source_type".to_string(),
                        operator: ConditionOperator::In,
                        value: serde_json::json!(["file", "http", "application"]),
                        case_sensitive: false,
                    },
                ],
                destinations: vec!["clickhouse_logs".to_string()],
                tags: vec!["application".to_string()],
                metadata: HashMap::new(),
            },
            RoutingRule {
                id: "network_events".to_string(),
                name: "Network Events".to_string(),
                description: "Route network events to network analysis storage".to_string(),
                enabled: true,
                priority: 75,
                conditions: vec![
                    RoutingCondition {
                        field: "protocol".to_string(),
                        operator: ConditionOperator::In,
                        value: serde_json::json!(["tcp", "udp", "icmp"]),
                        case_sensitive: false,
                    },
                ],
                destinations: vec!["clickhouse_network".to_string(), "kafka_network".to_string()],
                tags: vec!["network".to_string()],
                metadata: HashMap::new(),
            },
            RoutingRule {
                id: "catch_all".to_string(),
                name: "Catch All".to_string(),
                description: "Default rule for all other events".to_string(),
                enabled: true,
                priority: 1,
                conditions: vec![], // No conditions = matches all
                destinations: vec!["clickhouse_default".to_string()],
                tags: vec!["default".to_string()],
                metadata: HashMap::new(),
            },
        ];
        
        let mut rules_guard = self.rules.write().await;
        *rules_guard = default_rules;
        
        // Initialize stats for rules
        let mut stats_guard = self.routing_stats.write().await;
        for rule in rules_guard.iter() {
            stats_guard.insert(rule.id.clone(), RoutingStats {
                rule_id: rule.id.clone(),
                rule_name: rule.name.clone(),
                matches: 0,
                events_routed: 0,
                last_match: None,
                destinations_used: HashMap::new(),
            });
        }
        
        info!("Loaded {} default routing rules", rules_guard.len());
        Ok(())
    }
    
    pub async fn route_event(&self, event: &PipelineEvent) -> Result<Vec<String>> {
        debug!("Routing event: {}", event.id);
        
        let rules = self.rules.read().await;
        let mut matched_destinations = Vec::new();
        let mut rule_matched = false;
        
        // Sort rules by priority (higher priority first)
        let mut sorted_rules: Vec<_> = rules.iter().collect();
        sorted_rules.sort_by(|a, b| b.priority.cmp(&a.priority));
        
        for rule in sorted_rules {
            if !rule.enabled {
                continue;
            }
            
            if self.evaluate_rule(rule, event).await? {
                debug!("Event {} matched rule: {}", event.id, rule.name);
                
                // Add destinations from this rule
                for dest in &rule.destinations {
                    if !matched_destinations.contains(dest) {
                        matched_destinations.push(dest.clone());
                    }
                }
                
                // Update rule statistics
                self.update_rule_stats(&rule.id, &rule.destinations).await;
                
                rule_matched = true;
                
                // If this is a high-priority rule, we might want to stop here
                // For now, we continue to allow multiple rules to match
            }
        }
        
        if !rule_matched {
            warn!("No routing rules matched for event: {}", event.id);
            // Use default destination if configured
            if let Some(default_dest) = self.get_default_destination().await {
                matched_destinations.push(default_dest);
            }
        }
        
        // Validate destinations exist
        let valid_destinations = self.validate_destinations(&matched_destinations).await?;
        
        debug!("Event {} routed to {} destinations: {:?}", 
               event.id, valid_destinations.len(), valid_destinations);
        
        Ok(valid_destinations)
    }
    
    async fn evaluate_rule(&self, rule: &RoutingRule, event: &PipelineEvent) -> Result<bool> {
        if rule.conditions.is_empty() {
            return Ok(true); // No conditions = always match
        }
        
        for condition in &rule.conditions {
            if !self.evaluate_condition(condition, event).await? {
                return Ok(false); // All conditions must match (AND logic)
            }
        }
        
        Ok(true)
    }
    
    async fn evaluate_condition(&self, condition: &RoutingCondition, event: &PipelineEvent) -> Result<bool> {
        let field_value = self.extract_field_value(&condition.field, event)?;
        
        match &condition.operator {
            ConditionOperator::Equals => {
                Ok(self.compare_values(&field_value, &condition.value, condition.case_sensitive) == std::cmp::Ordering::Equal)
            }
            ConditionOperator::NotEquals => {
                Ok(self.compare_values(&field_value, &condition.value, condition.case_sensitive) != std::cmp::Ordering::Equal)
            }
            ConditionOperator::Contains => {
                if let (Some(field_str), Some(value_str)) = (field_value.as_str(), condition.value.as_str()) {
                    let field_str = if condition.case_sensitive { field_str.to_string() } else { field_str.to_lowercase() };
                    let value_str = if condition.case_sensitive { value_str.to_string() } else { value_str.to_lowercase() };
                    Ok(field_str.contains(&value_str))
                } else {
                    Ok(false)
                }
            }
            ConditionOperator::NotContains => {
                if let (Some(field_str), Some(value_str)) = (field_value.as_str(), condition.value.as_str()) {
                    let field_str = if condition.case_sensitive { field_str.to_string() } else { field_str.to_lowercase() };
                    let value_str = if condition.case_sensitive { value_str.to_string() } else { value_str.to_lowercase() };
                    Ok(!field_str.contains(&value_str))
                } else {
                    Ok(true)
                }
            }
            ConditionOperator::StartsWith => {
                if let (Some(field_str), Some(value_str)) = (field_value.as_str(), condition.value.as_str()) {
                    let field_str = if condition.case_sensitive { field_str.to_string() } else { field_str.to_lowercase() };
                    let value_str = if condition.case_sensitive { value_str.to_string() } else { value_str.to_lowercase() };
                    Ok(field_str.starts_with(&value_str))
                } else {
                    Ok(false)
                }
            }
            ConditionOperator::EndsWith => {
                if let (Some(field_str), Some(value_str)) = (field_value.as_str(), condition.value.as_str()) {
                    let field_str = if condition.case_sensitive { field_str.to_string() } else { field_str.to_lowercase() };
                    let value_str = if condition.case_sensitive { value_str.to_string() } else { value_str.to_lowercase() };
                    Ok(field_str.ends_with(&value_str))
                } else {
                    Ok(false)
                }
            }
            ConditionOperator::Regex => {
                if let (Some(field_str), Some(pattern_str)) = (field_value.as_str(), condition.value.as_str()) {
                    let regex = self.get_or_compile_regex(pattern_str).await?;
                    Ok(regex.is_match(field_str))
                } else {
                    Ok(false)
                }
            }
            ConditionOperator::GreaterThan => {
                Ok(self.compare_values(&field_value, &condition.value, condition.case_sensitive) == std::cmp::Ordering::Greater)
            }
            ConditionOperator::LessThan => {
                Ok(self.compare_values(&field_value, &condition.value, condition.case_sensitive) == std::cmp::Ordering::Less)
            }
            ConditionOperator::GreaterThanOrEqual => {
                let cmp = self.compare_values(&field_value, &condition.value, condition.case_sensitive);
                Ok(cmp == std::cmp::Ordering::Greater || cmp == std::cmp::Ordering::Equal)
            }
            ConditionOperator::LessThanOrEqual => {
                let cmp = self.compare_values(&field_value, &condition.value, condition.case_sensitive);
                Ok(cmp == std::cmp::Ordering::Less || cmp == std::cmp::Ordering::Equal)
            }
            ConditionOperator::In => {
                if let Some(array) = condition.value.as_array() {
                    Ok(array.iter().any(|v| self.compare_values(&field_value, v, condition.case_sensitive) == std::cmp::Ordering::Equal))
                } else {
                    Ok(false)
                }
            }
            ConditionOperator::NotIn => {
                if let Some(array) = condition.value.as_array() {
                    Ok(!array.iter().any(|v| self.compare_values(&field_value, v, condition.case_sensitive) == std::cmp::Ordering::Equal))
                } else {
                    Ok(true)
                }
            }
            ConditionOperator::Exists => {
                Ok(!field_value.is_null())
            }
            ConditionOperator::NotExists => {
                Ok(field_value.is_null())
            }
        }
    }
    
    fn extract_field_value(&self, field_path: &str, event: &PipelineEvent) -> Result<serde_json::Value> {
        // Support dot notation for nested fields
        let parts: Vec<&str> = field_path.split('.').collect();
        
        let mut current_value = match parts[0] {
            "source" => serde_json::Value::String(event.source.clone()),
            "timestamp" => serde_json::Value::String(event.timestamp.to_rfc3339()),
            "processing_stage" => serde_json::Value::String(format!("{:?}", event.processing_stage)),
            "data" => event.data.clone(),
            "metadata" => serde_json::to_value(&event.metadata)
                .map_err(|e| PipelineError::serialization(format!("Failed to serialize metadata: {}", e)))?,
            _ => {
                // Try to find in data first, then metadata
                if let Some(value) = event.data.get(parts[0]) {
                    value.clone()
                } else if let Some(value) = event.metadata.get(parts[0]) {
                    serde_json::Value::String(value.clone())
                } else {
                    serde_json::Value::Null
                }
            }
        };
        
        // Navigate nested fields
        for part in parts.iter().skip(1) {
            if let Some(nested_value) = current_value.get(part) {
                current_value = nested_value.clone();
            } else {
                return Ok(serde_json::Value::Null);
            }
        }
        
        Ok(current_value)
    }
    
    fn compare_values(&self, a: &serde_json::Value, b: &serde_json::Value, case_sensitive: bool) -> std::cmp::Ordering {
        match (a, b) {
            (serde_json::Value::String(a_str), serde_json::Value::String(b_str)) => {
                if case_sensitive {
                    a_str.cmp(b_str)
                } else {
                    a_str.to_lowercase().cmp(&b_str.to_lowercase())
                }
            }
            (serde_json::Value::Number(a_num), serde_json::Value::Number(b_num)) => {
                if let (Some(a_f64), Some(b_f64)) = (a_num.as_f64(), b_num.as_f64()) {
                    a_f64.partial_cmp(&b_f64).unwrap_or(std::cmp::Ordering::Equal)
                } else {
                    std::cmp::Ordering::Equal
                }
            }
            (serde_json::Value::Bool(a_bool), serde_json::Value::Bool(b_bool)) => {
                a_bool.cmp(b_bool)
            }
            _ => {
                // Convert to strings for comparison
                let a_str = a.to_string();
                let b_str = b.to_string();
                if case_sensitive {
                    a_str.cmp(&b_str)
                } else {
                    a_str.to_lowercase().cmp(&b_str.to_lowercase())
                }
            }
        }
    }
    
    async fn get_or_compile_regex(&self, pattern: &str) -> Result<Regex> {
        {
            let regexes = self.compiled_regexes.read().await;
            if let Some(regex) = regexes.get(pattern) {
                return Ok(regex.clone());
            }
        }
        
        let regex = Regex::new(pattern)
            .map_err(|e| PipelineError::validation(format!("Invalid regex pattern '{}': {}", pattern, e)))?;
        
        {
            let mut regexes = self.compiled_regexes.write().await;
            regexes.insert(pattern.to_string(), regex.clone());
        }
        
        Ok(regex)
    }
    
    async fn validate_destinations(&self, destinations: &[String]) -> Result<Vec<String>> {
        let mut valid_destinations = Vec::new();
        
        for dest_name in destinations {
            if self.config.destinations.contains_key(dest_name) {
                valid_destinations.push(dest_name.clone());
            } else {
                warn!("Invalid destination '{}' in routing rule", dest_name);
            }
        }
        
        Ok(valid_destinations)
    }
    
    async fn get_default_destination(&self) -> Option<String> {
        // Return the first available destination as default
        self.config.destinations.keys().next().cloned()
    }
    
    async fn update_rule_stats(&self, rule_id: &str, destinations: &[String]) {
        let mut stats_guard = self.routing_stats.write().await;
        if let Some(stats) = stats_guard.get_mut(rule_id) {
            stats.matches += 1;
            stats.events_routed += 1;
            stats.last_match = Some(Utc::now());
            
            for dest in destinations {
                *stats.destinations_used.entry(dest.clone()).or_insert(0) += 1;
            }
        }
    }
    
    pub async fn add_rule(&self, rule: RoutingRule) -> Result<()> {
        info!("Adding routing rule: {}", rule.name);
        
        // Validate rule
        self.validate_rule(&rule)?;
        
        let mut rules_guard = self.rules.write().await;
        
        // Check for duplicate IDs
        if rules_guard.iter().any(|r| r.id == rule.id) {
            return Err(PipelineError::config(format!("Rule with ID '{}' already exists", rule.id)));
        }
        
        // Initialize stats for the new rule
        {
            let mut stats_guard = self.routing_stats.write().await;
            stats_guard.insert(rule.id.clone(), RoutingStats {
                rule_id: rule.id.clone(),
                rule_name: rule.name.clone(),
                matches: 0,
                events_routed: 0,
                last_match: None,
                destinations_used: HashMap::new(),
            });
        }
        
        rules_guard.push(rule);
        
        info!("Routing rule added successfully");
        Ok(())
    }
    
    pub async fn update_rule(&self, rule_id: &str, updated_rule: RoutingRule) -> Result<()> {
        info!("Updating routing rule: {}", rule_id);
        
        // Validate rule
        self.validate_rule(&updated_rule)?;
        
        let mut rules_guard = self.rules.write().await;
        
        if let Some(rule) = rules_guard.iter_mut().find(|r| r.id == rule_id) {
            *rule = updated_rule;
            info!("Routing rule updated successfully");
            Ok(())
        } else {
            Err(PipelineError::not_found(format!("Rule with ID '{}' not found", rule_id)))
        }
    }
    
    pub async fn delete_rule(&self, rule_id: &str) -> Result<()> {
        info!("Deleting routing rule: {}", rule_id);
        
        let mut rules_guard = self.rules.write().await;
        
        if let Some(pos) = rules_guard.iter().position(|r| r.id == rule_id) {
            rules_guard.remove(pos);
            
            // Remove stats
            {
                let mut stats_guard = self.routing_stats.write().await;
                stats_guard.remove(rule_id);
            }
            
            info!("Routing rule deleted successfully");
            Ok(())
        } else {
            Err(PipelineError::not_found(format!("Rule with ID '{}' not found", rule_id)))
        }
    }
    
    fn validate_rule(&self, rule: &RoutingRule) -> Result<()> {
        if rule.id.is_empty() {
            return Err(PipelineError::validation("Rule ID cannot be empty"));
        }
        
        if rule.name.is_empty() {
            return Err(PipelineError::validation("Rule name cannot be empty"));
        }
        
        if rule.destinations.is_empty() {
            return Err(PipelineError::validation("Rule must have at least one destination"));
        }
        
        // Validate destinations exist
        for dest in &rule.destinations {
            if !self.config.destinations.contains_key(dest) {
                return Err(PipelineError::validation(format!("Destination '{}' does not exist", dest)));
            }
        }
        
        // Validate regex patterns in conditions
        for condition in &rule.conditions {
            if condition.operator == ConditionOperator::Regex {
                if let Some(pattern) = condition.value.as_str() {
                    Regex::new(pattern)
                        .map_err(|e| PipelineError::validation(format!("Invalid regex pattern '{}': {}", pattern, e)))?;
                }
            }
        }
        
        Ok(())
    }
    
    pub async fn load_rules(&self, rules_path: &str) -> Result<()> {
        info!("Loading routing rules from: {}", rules_path);
        
        // In a real implementation, this would load rules from a file
        // For now, we'll use the default rules
        self.load_default_rules().await?;
        
        Ok(())
    }
    
    pub async fn get_rules(&self) -> Vec<RoutingRule> {
        let rules_guard = self.rules.read().await;
        rules_guard.clone()
    }
    
    pub async fn get_rule(&self, rule_id: &str) -> Option<RoutingRule> {
        let rules_guard = self.rules.read().await;
        rules_guard.iter().find(|r| r.id == rule_id).cloned()
    }
    
    pub async fn get_rule_by_name(&self, rule_name: &str) -> Option<RoutingRule> {
        let rules_guard = self.rules.read().await;
        rules_guard.iter().find(|r| r.name == rule_name).cloned()
    }
    
    pub async fn update_rule_by_name(&self, rule_name: &str, updated_rule: RoutingRule) -> Result<()> {
        info!("Updating routing rule by name: {}", rule_name);
        
        // Validate rule
        self.validate_rule(&updated_rule)?;
        
        let mut rules_guard = self.rules.write().await;
        
        if let Some(rule) = rules_guard.iter_mut().find(|r| r.name == rule_name) {
            *rule = updated_rule;
            info!("Routing rule updated successfully");
            Ok(())
        } else {
            Err(PipelineError::not_found(format!("Rule with name '{}' not found", rule_name)))
        }
    }
    
    pub async fn delete_rule_by_name(&self, rule_name: &str) -> Result<()> {
        info!("Deleting routing rule by name: {}", rule_name);
        
        let mut rules_guard = self.rules.write().await;
        
        if let Some(pos) = rules_guard.iter().position(|r| r.name == rule_name) {
            let rule_id = rules_guard[pos].id.clone();
            rules_guard.remove(pos);
            
            // Remove stats
            {
                let mut stats_guard = self.routing_stats.write().await;
                stats_guard.remove(&rule_id);
            }
            
            info!("Routing rule deleted successfully");
            Ok(())
        } else {
            Err(PipelineError::not_found(format!("Rule with name '{}' not found", rule_name)))
        }
    }
    
    pub async fn get_routing_stats(&self) -> HashMap<String, RoutingStats> {
        let stats_guard = self.routing_stats.read().await;
        stats_guard.clone()
    }
    
    pub async fn get_destination_stats(&self) -> HashMap<String, DestinationStats> {
        let stats_guard = self.destination_stats.read().await;
        stats_guard.clone()
    }
    
    pub async fn update_destination_health(&self, destination: &str, health: DestinationHealth) {
        let mut stats_guard = self.destination_stats.write().await;
        if let Some(stats) = stats_guard.get_mut(destination) {
            stats.health_status = health;
        }
    }
    
    pub async fn record_destination_event(&self, destination: &str, bytes_sent: u64) {
        let mut stats_guard = self.destination_stats.write().await;
        if let Some(stats) = stats_guard.get_mut(destination) {
            stats.events_received += 1;
            stats.bytes_sent += bytes_sent;
            stats.last_event = Some(Utc::now());
        }
    }
    
    pub async fn record_destination_error(&self, destination: &str) {
        let mut stats_guard = self.destination_stats.write().await;
        if let Some(stats) = stats_guard.get_mut(destination) {
            stats.errors += 1;
        }
    }
    
    pub async fn get_health(&self) -> serde_json::Value {
        let routing_stats = self.get_routing_stats().await;
        let destination_stats = self.get_destination_stats().await;
        
        let mut total_matches = 0;
        let mut total_routed = 0;
        let mut active_rules = 0;
        
        for stats in routing_stats.values() {
            total_matches += stats.matches;
            total_routed += stats.events_routed;
            if stats.last_match.is_some() {
                active_rules += 1;
            }
        }
        
        let mut healthy_destinations = 0;
        let mut total_destinations = 0;
        
        for stats in destination_stats.values() {
            total_destinations += 1;
            if matches!(stats.health_status, DestinationHealth::Healthy) {
                healthy_destinations += 1;
            }
        }
        
        let health_status = if healthy_destinations == total_destinations {
            "healthy"
        } else if healthy_destinations > 0 {
            "degraded"
        } else {
            "unhealthy"
        };
        
        serde_json::json!({
            "status": health_status,
            "total_rules": routing_stats.len(),
            "active_rules": active_rules,
            "total_matches": total_matches,
            "total_routed": total_routed,
            "healthy_destinations": healthy_destinations,
            "total_destinations": total_destinations,
            "rules": routing_stats,
            "destinations": destination_stats
        })
    }
    
    pub async fn reload_config(&self, _new_config: &PipelineConfig) -> Result<()> {
        info!("Reloading routing configuration");
        // Implementation would update routing rules and destinations
        Ok(())
    }
    
    pub async fn shutdown(&self) -> Result<()> {
        info!("Shutting down routing manager");
        Ok(())
    }
}

impl PartialEq for ConditionOperator {
    fn eq(&self, other: &Self) -> bool {
        std::mem::discriminant(self) == std::mem::discriminant(other)
    }
}