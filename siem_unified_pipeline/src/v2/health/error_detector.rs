use crate::v2::types::health::*;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorRule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub severity: ErrorSeverity,
    pub category: ErrorCategory,
    pub condition: ErrorCondition,
    pub playbook: Option<Playbook>,
    pub auto_fix: Option<AutoFix>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorSeverity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorCategory {
    Pipeline,
    Storage,
    Network,
    Performance,
    Security,
    Configuration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorCondition {
    // Kafka conditions
    ConsumerLagExceeds { group: String, threshold: u64 },
    TopicMissing { topic: String },
    BrokerDown { broker: String },
    
    // ClickHouse conditions
    IngestDelayExceeds { threshold_ms: u32 },
    QueryLatencyHigh { threshold_ms: u32 },
    DiskSpaceLow { threshold_pct: f64 },
    TooManyParts { threshold: u32 },
    
    // Redis conditions
    MemoryUsageHigh { threshold_pct: f64 },
    HitRatioLow { threshold_pct: f64 },
    EvictionRateHigh { threshold_per_min: u32 },
    
    // Pipeline conditions
    ParseSuccessRateLow { threshold_pct: f64 },
    DlqRateHigh { threshold_eps: u32 },
    ThroughputDrop { threshold_pct: f64 },
    
    // Service conditions
    ServiceDown { service_type: String, service_name: String },
    HighErrorRate { service_name: String, threshold_pct: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playbook {
    pub title: String,
    pub steps: Vec<PlaybookStep>,
    pub estimated_time_minutes: u32,
    pub risk_level: RiskLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybookStep {
    pub step_number: u32,
    pub title: String,
    pub description: String,
    pub commands: Vec<String>,
    pub expected_outcome: String,
    pub troubleshooting_tips: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoFix {
    pub name: String,
    pub description: String,
    pub actions: Vec<AutoFixAction>,
    pub safety_checks: Vec<SafetyCheck>,
    pub rollback_plan: Option<RollbackPlan>,
    pub max_attempts: u32,
    pub cooldown_minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AutoFixAction {
    RestartService { service_name: String },
    ScaleService { service_name: String, replicas: u32 },
    CreateKafkaTopic { topic: String, partitions: u32, replication_factor: u16 },
    OptimizeClickhouseTable { table: String },
    ClearRedisCache { pattern: String },
    UpdateConfiguration { service: String, key: String, value: String },
    RunCommand { command: String, args: Vec<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyCheck {
    pub name: String,
    pub condition: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackPlan {
    pub description: String,
    pub actions: Vec<AutoFixAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedError {
    pub id: String,
    pub rule_id: String,
    pub timestamp: DateTime<Utc>,
    pub severity: ErrorSeverity,
    pub category: ErrorCategory,
    pub title: String,
    pub description: String,
    pub affected_components: Vec<String>,
    pub metrics: HashMap<String, serde_json::Value>,
    pub playbook: Option<Playbook>,
    pub auto_fix: Option<AutoFix>,
    pub status: ErrorStatus,
    pub auto_fix_attempts: u32,
    pub last_attempt: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorStatus {
    Active,
    Acknowledged,
    InProgress,
    Resolved,
    AutoFixed,
    Failed,
}

pub struct ErrorDetector {
    rules: Vec<ErrorRule>,
    active_errors: HashMap<String, DetectedError>,
}

impl ErrorDetector {
    pub fn new() -> Self {
        Self {
            rules: Self::default_rules(),
            active_errors: HashMap::new(),
        }
    }

    pub fn detect_errors(&mut self, health: &HealthSummary) -> Vec<DetectedError> {
        let mut new_errors = Vec::new();
        
        for rule in &self.rules {
            if !rule.enabled {
                continue;
            }
            
            if let Some(error) = self.evaluate_rule(rule, health) {
                // Check if this error is already active
                let error_key = format!("{}:{}", rule.id, self.get_error_context(&rule.condition, health));
                
                if !self.active_errors.contains_key(&error_key) {
                    self.active_errors.insert(error_key, error.clone());
                    new_errors.push(error);
                }
            }
        }
        
        // Remove resolved errors
        self.cleanup_resolved_errors(health);
        
        new_errors
    }

    fn evaluate_rule(&self, rule: &ErrorRule, health: &HealthSummary) -> Option<DetectedError> {
        let triggered = match &rule.condition {
            ErrorCondition::ConsumerLagExceeds { group, threshold } => {
                health.kafka.consumer_groups
                    .iter()
                    .any(|cg| cg.group == *group && cg.lag > *threshold)
            },
            ErrorCondition::TopicMissing { topic } => {
                !health.kafka.topics.contains_key(topic)
            },
            ErrorCondition::IngestDelayExceeds { threshold_ms } => {
                health.clickhouse.ingest_delay_ms > *threshold_ms
            },
            ErrorCondition::TooManyParts { threshold } => {
                health.clickhouse.parts > *threshold
            },
            ErrorCondition::MemoryUsageHigh { threshold_pct } => {
                let usage_pct = (health.redis.used_memory_mb as f64 / health.redis.maxmemory_mb as f64) * 100.0;
                usage_pct > *threshold_pct
            },
            ErrorCondition::HitRatioLow { threshold_pct } => {
                health.redis.hit_ratio_pct < *threshold_pct
            },
            ErrorCondition::ParseSuccessRateLow { threshold_pct } => {
                health.pipeline.parse_success_pct < *threshold_pct
            },
            ErrorCondition::DlqRateHigh { threshold_eps } => {
                health.pipeline.dlq_eps > *threshold_eps
            },
            ErrorCondition::ServiceDown { service_type, service_name } => {
                match service_type.as_str() {
                    "ingestor" => health.services.ingestors.iter().any(|s| s.name == *service_name && !s.ok),
                    "parser" => health.services.parsers.iter().any(|s| s.name == *service_name && !s.ok),
                    "detector" => health.services.detectors.iter().any(|s| s.name == *service_name && !s.ok),
                    "sink" => health.services.sinks.iter().any(|s| s.name == *service_name && !s.ok),
                    _ => false,
                }
            },
            _ => false, // TODO: Implement remaining conditions
        };

        if triggered {
            Some(DetectedError {
                id: uuid::Uuid::new_v4().to_string(),
                rule_id: rule.id.clone(),
                timestamp: Utc::now(),
                severity: rule.severity.clone(),
                category: rule.category.clone(),
                title: rule.name.clone(),
                description: self.generate_error_description(&rule.condition, health),
                affected_components: self.get_affected_components(&rule.condition),
                metrics: self.extract_relevant_metrics(&rule.condition, health),
                playbook: rule.playbook.clone(),
                auto_fix: rule.auto_fix.clone(),
                status: ErrorStatus::Active,
                auto_fix_attempts: 0,
                last_attempt: None,
            })
        } else {
            None
        }
    }

    fn generate_error_description(&self, condition: &ErrorCondition, health: &HealthSummary) -> String {
        match condition {
            ErrorCondition::ConsumerLagExceeds { group, threshold } => {
                let actual_lag = health.kafka.consumer_groups
                    .iter()
                    .find(|cg| cg.group == *group)
                    .map(|cg| cg.lag)
                    .unwrap_or(0);
                format!("Consumer group '{}' has {} messages of lag (threshold: {})", group, actual_lag, threshold)
            },
            ErrorCondition::IngestDelayExceeds { threshold_ms } => {
                format!("ClickHouse ingest delay is {}ms (threshold: {}ms)", health.clickhouse.ingest_delay_ms, threshold_ms)
            },
            ErrorCondition::MemoryUsageHigh { threshold_pct } => {
                let usage_pct = (health.redis.used_memory_mb as f64 / health.redis.maxmemory_mb as f64) * 100.0;
                format!("Redis memory usage is {:.1}% (threshold: {:.1}%)", usage_pct, threshold_pct)
            },
            ErrorCondition::ParseSuccessRateLow { threshold_pct } => {
                format!("Parse success rate is {:.1}% (threshold: {:.1}%)", health.pipeline.parse_success_pct, threshold_pct)
            },
            _ => "Error condition met".to_string(),
        }
    }

    fn get_affected_components(&self, condition: &ErrorCondition) -> Vec<String> {
        match condition {
            ErrorCondition::ConsumerLagExceeds { group, .. } => vec![format!("kafka-consumer-{}", group)],
            ErrorCondition::TopicMissing { topic } => vec![format!("kafka-topic-{}", topic)],
            ErrorCondition::IngestDelayExceeds { .. } => vec!["clickhouse".to_string()],
            ErrorCondition::MemoryUsageHigh { .. } => vec!["redis".to_string()],
            ErrorCondition::ParseSuccessRateLow { .. } => vec!["parser".to_string()],
            ErrorCondition::ServiceDown { service_name, .. } => vec![service_name.clone()],
            _ => vec![],
        }
    }

    fn extract_relevant_metrics(&self, condition: &ErrorCondition, health: &HealthSummary) -> HashMap<String, serde_json::Value> {
        let mut metrics = HashMap::new();
        
        match condition {
            ErrorCondition::ConsumerLagExceeds { group, .. } => {
                if let Some(cg) = health.kafka.consumer_groups.iter().find(|cg| cg.group == *group) {
                    metrics.insert("lag".to_string(), serde_json::Value::Number(cg.lag.into()));
                    metrics.insert("tps".to_string(), serde_json::Value::Number(cg.tps.into()));
                }
            },
            ErrorCondition::IngestDelayExceeds { .. } => {
                metrics.insert("ingest_delay_ms".to_string(), serde_json::Value::Number(health.clickhouse.ingest_delay_ms.into()));
                metrics.insert("inserts_per_sec".to_string(), serde_json::Value::Number(health.clickhouse.inserts_per_sec.into()));
            },
            ErrorCondition::MemoryUsageHigh { .. } => {
                metrics.insert("used_memory_mb".to_string(), serde_json::Value::Number(health.redis.used_memory_mb.into()));
                metrics.insert("maxmemory_mb".to_string(), serde_json::Value::Number(health.redis.maxmemory_mb.into()));
                metrics.insert("hit_ratio_pct".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(health.redis.hit_ratio_pct).unwrap()));
            },
            _ => {},
        }
        
        metrics
    }

    fn get_error_context(&self, condition: &ErrorCondition, _health: &HealthSummary) -> String {
        match condition {
            ErrorCondition::ConsumerLagExceeds { group, .. } => group.clone(),
            ErrorCondition::TopicMissing { topic } => topic.clone(),
            ErrorCondition::ServiceDown { service_name, .. } => service_name.clone(),
            _ => "general".to_string(),
        }
    }

    fn cleanup_resolved_errors(&mut self, health: &HealthSummary) {
        let mut resolved_keys = Vec::new();
        
        for (key, error) in &self.active_errors {
            if let Some(rule) = self.rules.iter().find(|r| r.id == error.rule_id) {
                if self.evaluate_rule(rule, health).is_none() {
                    resolved_keys.push(key.clone());
                }
            }
        }
        
        for key in resolved_keys {
            self.active_errors.remove(&key);
        }
    }

    pub fn get_active_errors(&self) -> Vec<DetectedError> {
        self.active_errors.values().cloned().collect()
    }

    fn default_rules() -> Vec<ErrorRule> {
        vec![
            ErrorRule {
                id: "kafka-high-lag".to_string(),
                name: "High Consumer Group Lag".to_string(),
                description: "Consumer group is falling behind in processing messages".to_string(),
                severity: ErrorSeverity::High,
                category: ErrorCategory::Pipeline,
                condition: ErrorCondition::ConsumerLagExceeds { 
                    group: "siem-parser".to_string(), 
                    threshold: 10000 
                },
                playbook: Some(Playbook {
                    title: "Resolve High Consumer Lag".to_string(),
                    steps: vec![
                        PlaybookStep {
                            step_number: 1,
                            title: "Check Consumer Status".to_string(),
                            description: "Verify consumer group is running and healthy".to_string(),
                            commands: vec!["kubectl get pods -l app=siem-parser".to_string()],
                            expected_outcome: "All parser pods should be Running".to_string(),
                            troubleshooting_tips: vec!["Check pod logs for errors".to_string()],
                        },
                        PlaybookStep {
                            step_number: 2,
                            title: "Scale Consumers".to_string(),
                            description: "Increase number of parser instances".to_string(),
                            commands: vec!["kubectl scale deployment siem-parser --replicas=3".to_string()],
                            expected_outcome: "Additional parser pods start successfully".to_string(),
                            troubleshooting_tips: vec!["Monitor resource usage".to_string()],
                        },
                    ],
                    estimated_time_minutes: 5,
                    risk_level: RiskLevel::Low,
                }),
                auto_fix: Some(AutoFix {
                    name: "Restart Parser Service".to_string(),
                    description: "Restart the parser service to clear any stuck consumers".to_string(),
                    actions: vec![AutoFixAction::RestartService { 
                        service_name: "siem-parser".to_string() 
                    }],
                    safety_checks: vec![
                        SafetyCheck {
                            name: "Service Health Check".to_string(),
                            condition: "service_exists:siem-parser".to_string(),
                            required: true,
                        }
                    ],
                    rollback_plan: None,
                    max_attempts: 3,
                    cooldown_minutes: 5,
                }),
                enabled: true,
            },
            ErrorRule {
                id: "ch-high-ingest-delay".to_string(),
                name: "High ClickHouse Ingest Delay".to_string(),
                description: "Data is taking too long to appear in ClickHouse".to_string(),
                severity: ErrorSeverity::Medium,
                category: ErrorCategory::Storage,
                condition: ErrorCondition::IngestDelayExceeds { threshold_ms: 30000 },
                playbook: Some(Playbook {
                    title: "Reduce ClickHouse Ingest Delay".to_string(),
                    steps: vec![
                        PlaybookStep {
                            step_number: 1,
                            title: "Check Merge Activity".to_string(),
                            description: "Verify if background merges are causing delays".to_string(),
                            commands: vec!["SELECT * FROM system.merges".to_string()],
                            expected_outcome: "Few or no active merges".to_string(),
                            troubleshooting_tips: vec!["Consider running manual OPTIMIZE if many small parts".to_string()],
                        },
                    ],
                    estimated_time_minutes: 10,
                    risk_level: RiskLevel::Medium,
                }),
                auto_fix: Some(AutoFix {
                    name: "Optimize ClickHouse Tables".to_string(),
                    description: "Run OPTIMIZE TABLE to merge small parts".to_string(),
                    actions: vec![AutoFixAction::OptimizeClickhouseTable { 
                        table: "events".to_string() 
                    }],
                    safety_checks: vec![
                        SafetyCheck {
                            name: "Merge Queue Check".to_string(),
                            condition: "merges_in_progress < 5".to_string(),
                            required: true,
                        }
                    ],
                    rollback_plan: None,
                    max_attempts: 1,
                    cooldown_minutes: 60,
                }),
                enabled: true,
            },
            ErrorRule {
                id: "redis-high-memory".to_string(),
                name: "Redis High Memory Usage".to_string(),
                description: "Redis memory usage is approaching limits".to_string(),
                severity: ErrorSeverity::Medium,
                category: ErrorCategory::Storage,
                condition: ErrorCondition::MemoryUsageHigh { threshold_pct: 85.0 },
                playbook: Some(Playbook {
                    title: "Reduce Redis Memory Usage".to_string(),
                    steps: vec![
                        PlaybookStep {
                            step_number: 1,
                            title: "Analyze Memory Usage".to_string(),
                            description: "Identify which keys are using the most memory".to_string(),
                            commands: vec!["redis-cli --bigkeys".to_string()],
                            expected_outcome: "List of largest keys".to_string(),
                            troubleshooting_tips: vec!["Look for unexpected large keys or TTL issues".to_string()],
                        },
                    ],
                    estimated_time_minutes: 5,
                    risk_level: RiskLevel::Low,
                }),
                auto_fix: Some(AutoFix {
                    name: "Clear Expired Keys".to_string(),
                    description: "Force cleanup of expired cache keys".to_string(),
                    actions: vec![AutoFixAction::ClearRedisCache { 
                        pattern: "cache:*".to_string() 
                    }],
                    safety_checks: vec![],
                    rollback_plan: None,
                    max_attempts: 1,
                    cooldown_minutes: 30,
                }),
                enabled: true,
            },
            ErrorRule {
                id: "low-parse-success".to_string(),
                name: "Low Parse Success Rate".to_string(),
                description: "Too many events are failing to parse correctly".to_string(),
                severity: ErrorSeverity::High,
                category: ErrorCategory::Pipeline,
                condition: ErrorCondition::ParseSuccessRateLow { threshold_pct: 95.0 },
                playbook: Some(Playbook {
                    title: "Improve Parse Success Rate".to_string(),
                    steps: vec![
                        PlaybookStep {
                            step_number: 1,
                            title: "Analyze DLQ Messages".to_string(),
                            description: "Examine failed parsing messages to identify patterns".to_string(),
                            commands: vec!["kafka-console-consumer --topic siem.dlq.raw --from-beginning --max-messages 10".to_string()],
                            expected_outcome: "Sample of failed messages".to_string(),
                            troubleshooting_tips: vec!["Look for new log formats or data sources".to_string()],
                        },
                    ],
                    estimated_time_minutes: 15,
                    risk_level: RiskLevel::Medium,
                }),
                auto_fix: None, // Manual intervention required
                enabled: true,
            },
        ]
    }
}

impl Default for ErrorDetector {
    fn default() -> Self {
        Self::new()
    }
}
