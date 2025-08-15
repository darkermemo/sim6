use crate::v2::health::error_detector::*;
use crate::v2::types::health::*;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Command, Stdio};
use tokio::process::Command as TokioCommand;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoFixExecution {
    pub id: String,
    pub error_id: String,
    pub auto_fix: AutoFix,
    pub status: ExecutionStatus,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub steps: Vec<ExecutionStep>,
    pub result: Option<ExecutionResult>,
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExecutionStatus {
    Pending,
    Running,
    Completed,
    Failed,
    RolledBack,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionStep {
    pub step_number: u32,
    pub action: AutoFixAction,
    pub status: StepStatus,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub output: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StepStatus {
    Pending,
    Running,
    Success,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub success: bool,
    pub message: String,
    pub actions_taken: Vec<String>,
    pub metrics_before: HashMap<String, serde_json::Value>,
    pub metrics_after: Option<HashMap<String, serde_json::Value>>,
}

pub struct AutoFixEngine {
    executions: HashMap<String, AutoFixExecution>,
    config: AutoFixConfig,
}

#[derive(Debug, Clone)]
pub struct AutoFixConfig {
    pub enabled: bool,
    pub dry_run_by_default: bool,
    pub max_concurrent_executions: u32,
    pub safety_checks_enabled: bool,
    pub rollback_enabled: bool,
    pub command_timeout_seconds: u64,
}

impl Default for AutoFixConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            dry_run_by_default: true,
            max_concurrent_executions: 3,
            safety_checks_enabled: true,
            rollback_enabled: true,
            command_timeout_seconds: 300,
        }
    }
}

impl AutoFixEngine {
    pub fn new(config: AutoFixConfig) -> Self {
        Self {
            executions: HashMap::new(),
            config,
        }
    }

    pub async fn execute_auto_fix(
        &mut self,
        error: &DetectedError,
        dry_run: bool,
    ) -> Result<AutoFixExecution, AutoFixError> {
        if !self.config.enabled {
            return Err(AutoFixError::Disabled);
        }

        let auto_fix = error.auto_fix.as_ref()
            .ok_or(AutoFixError::NoAutoFixAvailable)?;

        // Check if we're within rate limits
        if error.auto_fix_attempts >= auto_fix.max_attempts {
            return Err(AutoFixError::MaxAttemptsExceeded);
        }

        // Check cooldown period
        if let Some(last_attempt) = error.last_attempt {
            let cooldown = chrono::Duration::minutes(auto_fix.cooldown_minutes as i64);
            if Utc::now() - last_attempt < cooldown {
                return Err(AutoFixError::CooldownActive);
            }
        }

        // Check concurrent executions
        let active_count = self.executions.values()
            .filter(|e| matches!(e.status, ExecutionStatus::Running | ExecutionStatus::Pending))
            .count() as u32;

        if active_count >= self.config.max_concurrent_executions {
            return Err(AutoFixError::TooManyConcurrentExecutions);
        }

        let execution_id = uuid::Uuid::new_v4().to_string();
        let mut execution = AutoFixExecution {
            id: execution_id.clone(),
            error_id: error.id.clone(),
            auto_fix: auto_fix.clone(),
            status: ExecutionStatus::Pending,
            started_at: Utc::now(),
            completed_at: None,
            steps: auto_fix.actions.iter().enumerate().map(|(i, action)| {
                ExecutionStep {
                    step_number: i as u32 + 1,
                    action: action.clone(),
                    status: StepStatus::Pending,
                    started_at: None,
                    completed_at: None,
                    output: None,
                    error: None,
                }
            }).collect(),
            result: None,
            dry_run,
        };

        // Run safety checks first
        if self.config.safety_checks_enabled {
            for safety_check in &auto_fix.safety_checks {
                if !self.verify_safety_check(safety_check).await? {
                    execution.status = ExecutionStatus::Failed;
                    execution.result = Some(ExecutionResult {
                        success: false,
                        message: format!("Safety check failed: {}", safety_check.name),
                        actions_taken: vec![],
                        metrics_before: HashMap::new(),
                        metrics_after: None,
                    });
                    self.executions.insert(execution_id.clone(), execution.clone());
                    return Ok(execution);
                }
            }
        }

        // Store execution and start processing
        self.executions.insert(execution_id.clone(), execution.clone());

        // Execute in background
        let mut execution = self.run_execution(execution_id.clone(), dry_run).await?;
        
        // Update stored execution
        self.executions.insert(execution_id, execution.clone());

        Ok(execution)
    }

    async fn run_execution(
        &mut self,
        execution_id: String,
        dry_run: bool,
    ) -> Result<AutoFixExecution, AutoFixError> {
        let mut execution = self.executions.get(&execution_id)
            .ok_or(AutoFixError::ExecutionNotFound)?
            .clone();

        execution.status = ExecutionStatus::Running;
        let mut actions_taken = Vec::new();

        for step in &mut execution.steps {
            step.status = StepStatus::Running;
            step.started_at = Some(Utc::now());

            let result = if dry_run {
                self.simulate_action(&step.action).await
            } else {
                self.execute_action(&step.action).await
            };

            match result {
                Ok(output) => {
                    step.status = StepStatus::Success;
                    step.output = Some(output.clone());
                    actions_taken.push(format!("{}: {}", 
                        self.action_description(&step.action), 
                        if dry_run { "simulated" } else { "executed" }
                    ));
                },
                Err(e) => {
                    step.status = StepStatus::Failed;
                    step.error = Some(e.to_string());
                    
                    execution.status = ExecutionStatus::Failed;
                    execution.completed_at = Some(Utc::now());
                    execution.result = Some(ExecutionResult {
                        success: false,
                        message: format!("Step {} failed: {}", step.step_number, e),
                        actions_taken,
                        metrics_before: HashMap::new(),
                        metrics_after: None,
                    });
                    
                    return Ok(execution);
                }
            }

            step.completed_at = Some(Utc::now());
        }

        execution.status = ExecutionStatus::Completed;
        execution.completed_at = Some(Utc::now());
        execution.result = Some(ExecutionResult {
            success: true,
            message: if dry_run {
                "Dry run completed successfully".to_string()
            } else {
                "Auto-fix completed successfully".to_string()
            },
            actions_taken,
            metrics_before: HashMap::new(),
            metrics_after: None,
        });

        Ok(execution)
    }

    async fn execute_action(&self, action: &AutoFixAction) -> Result<String, AutoFixError> {
        match action {
            AutoFixAction::RestartService { service_name } => {
                self.restart_service(service_name).await
            },
            AutoFixAction::ScaleService { service_name, replicas } => {
                self.scale_service(service_name, *replicas).await
            },
            AutoFixAction::CreateKafkaTopic { topic, partitions, replication_factor } => {
                self.create_kafka_topic(topic, *partitions, *replication_factor).await
            },
            AutoFixAction::OptimizeClickhouseTable { table } => {
                self.optimize_clickhouse_table(table).await
            },
            AutoFixAction::ClearRedisCache { pattern } => {
                self.clear_redis_cache(pattern).await
            },
            AutoFixAction::UpdateConfiguration { service, key, value } => {
                self.update_configuration(service, key, value).await
            },
            AutoFixAction::RunCommand { command, args } => {
                self.run_command(command, args).await
            },
        }
    }

    async fn simulate_action(&self, action: &AutoFixAction) -> Result<String, AutoFixError> {
        Ok(format!("DRY RUN: Would execute {}", self.action_description(action)))
    }

    fn action_description(&self, action: &AutoFixAction) -> String {
        match action {
            AutoFixAction::RestartService { service_name } => {
                format!("restart service '{}'", service_name)
            },
            AutoFixAction::ScaleService { service_name, replicas } => {
                format!("scale service '{}' to {} replicas", service_name, replicas)
            },
            AutoFixAction::CreateKafkaTopic { topic, partitions, replication_factor } => {
                format!("create Kafka topic '{}' with {} partitions and RF {}", topic, partitions, replication_factor)
            },
            AutoFixAction::OptimizeClickhouseTable { table } => {
                format!("optimize ClickHouse table '{}'", table)
            },
            AutoFixAction::ClearRedisCache { pattern } => {
                format!("clear Redis cache with pattern '{}'", pattern)
            },
            AutoFixAction::UpdateConfiguration { service, key, value } => {
                format!("update config {}.{} = {}", service, key, value)
            },
            AutoFixAction::RunCommand { command, args } => {
                format!("run command '{}' with args {:?}", command, args)
            },
        }
    }

    async fn restart_service(&self, service_name: &str) -> Result<String, AutoFixError> {
        // For Docker/Kubernetes environments
        if self.is_kubernetes_environment().await {
            self.restart_kubernetes_service(service_name).await
        } else if self.is_docker_environment().await {
            self.restart_docker_service(service_name).await
        } else {
            self.restart_systemd_service(service_name).await
        }
    }

    async fn restart_kubernetes_service(&self, service_name: &str) -> Result<String, AutoFixError> {
        let output = TokioCommand::new("kubectl")
            .args(&["rollout", "restart", "deployment", service_name])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| AutoFixError::CommandFailed(format!("kubectl failed: {}", e)))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(AutoFixError::CommandFailed(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    }

    async fn restart_docker_service(&self, service_name: &str) -> Result<String, AutoFixError> {
        let output = TokioCommand::new("docker")
            .args(&["restart", service_name])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| AutoFixError::CommandFailed(format!("docker failed: {}", e)))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(AutoFixError::CommandFailed(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    }

    async fn restart_systemd_service(&self, service_name: &str) -> Result<String, AutoFixError> {
        let output = TokioCommand::new("systemctl")
            .args(&["restart", service_name])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| AutoFixError::CommandFailed(format!("systemctl failed: {}", e)))?;

        if output.status.success() {
            Ok("Service restarted successfully".to_string())
        } else {
            Err(AutoFixError::CommandFailed(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    }

    async fn scale_service(&self, service_name: &str, replicas: u32) -> Result<String, AutoFixError> {
        if self.is_kubernetes_environment().await {
            let output = TokioCommand::new("kubectl")
                .args(&["scale", "deployment", service_name, "--replicas", &replicas.to_string()])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(|e| AutoFixError::CommandFailed(format!("kubectl scale failed: {}", e)))?;

            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                Err(AutoFixError::CommandFailed(String::from_utf8_lossy(&output.stderr).to_string()))
            }
        } else {
            Err(AutoFixError::UnsupportedAction("Service scaling only supported in Kubernetes".to_string()))
        }
    }

    async fn create_kafka_topic(&self, topic: &str, partitions: u32, replication_factor: u16) -> Result<String, AutoFixError> {
        // Try using kafka-topics.sh
        let output = TokioCommand::new("kafka-topics.sh")
            .args(&[
                "--create",
                "--topic", topic,
                "--partitions", &partitions.to_string(),
                "--replication-factor", &replication_factor.to_string(),
                "--bootstrap-server", "localhost:9092"
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| AutoFixError::CommandFailed(format!("kafka-topics failed: {}", e)))?;

        if output.status.success() {
            Ok(format!("Created topic '{}' with {} partitions", topic, partitions))
        } else {
            Err(AutoFixError::CommandFailed(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    }

    async fn optimize_clickhouse_table(&self, table: &str) -> Result<String, AutoFixError> {
        let query = format!("OPTIMIZE TABLE {} FINAL", table);
        
        let output = TokioCommand::new("clickhouse-client")
            .args(&["--query", &query])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| AutoFixError::CommandFailed(format!("clickhouse-client failed: {}", e)))?;

        if output.status.success() {
            Ok(format!("Optimized table '{}'", table))
        } else {
            Err(AutoFixError::CommandFailed(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    }

    async fn clear_redis_cache(&self, pattern: &str) -> Result<String, AutoFixError> {
        let script = format!("redis-cli --scan --pattern '{}' | xargs redis-cli del", pattern);
        
        let output = TokioCommand::new("sh")
            .args(&["-c", &script])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| AutoFixError::CommandFailed(format!("redis clear failed: {}", e)))?;

        if output.status.success() {
            let stdout_text = String::from_utf8_lossy(&output.stdout);
            let deleted_count = stdout_text.trim();
            Ok(format!("Cleared {} keys matching pattern '{}'", deleted_count, pattern))
        } else {
            Err(AutoFixError::CommandFailed(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    }

    async fn update_configuration(&self, service: &str, key: &str, value: &str) -> Result<String, AutoFixError> {
        // This would integrate with your configuration management system
        // For now, return a placeholder
        Ok(format!("Updated {}.{} = {} (placeholder)", service, key, value))
    }

    async fn run_command(&self, command: &str, args: &[String]) -> Result<String, AutoFixError> {
        let output = TokioCommand::new(command)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| AutoFixError::CommandFailed(format!("command '{}' failed: {}", command, e)))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(AutoFixError::CommandFailed(String::from_utf8_lossy(&output.stderr).to_string()))
        }
    }

    async fn verify_safety_check(&self, safety_check: &SafetyCheck) -> Result<bool, AutoFixError> {
        // Implement safety check logic based on condition string
        match safety_check.condition.as_str() {
            c if c.starts_with("service_exists:") => {
                let service_name = c.strip_prefix("service_exists:").unwrap();
                self.service_exists(service_name).await
            },
            c if c.starts_with("merges_in_progress") => {
                // Parse condition like "merges_in_progress < 5"
                Ok(true) // Placeholder
            },
            _ => {
                if safety_check.required {
                    Err(AutoFixError::SafetyCheckFailed(format!("Unknown safety check: {}", safety_check.condition)))
                } else {
                    Ok(true)
                }
            }
        }
    }

    async fn service_exists(&self, service_name: &str) -> Result<bool, AutoFixError> {
        if self.is_kubernetes_environment().await {
            let output = TokioCommand::new("kubectl")
                .args(&["get", "deployment", service_name])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .output()
                .await
                .map_err(|e| AutoFixError::CommandFailed(format!("kubectl check failed: {}", e)))?;
            
            Ok(output.status.success())
        } else {
            Ok(true) // Assume service exists for now
        }
    }

    async fn is_kubernetes_environment(&self) -> bool {
        TokioCommand::new("kubectl")
            .args(&["version", "--client"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .await
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    async fn is_docker_environment(&self) -> bool {
        TokioCommand::new("docker")
            .args(&["version"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .await
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    pub fn get_execution(&self, execution_id: &str) -> Option<&AutoFixExecution> {
        self.executions.get(execution_id)
    }

    pub fn list_executions(&self) -> Vec<&AutoFixExecution> {
        self.executions.values().collect()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum AutoFixError {
    #[error("Auto-fix is disabled")]
    Disabled,
    
    #[error("No auto-fix available for this error")]
    NoAutoFixAvailable,
    
    #[error("Maximum auto-fix attempts exceeded")]
    MaxAttemptsExceeded,
    
    #[error("Auto-fix is in cooldown period")]
    CooldownActive,
    
    #[error("Too many concurrent auto-fix executions")]
    TooManyConcurrentExecutions,
    
    #[error("Execution not found")]
    ExecutionNotFound,
    
    #[error("Safety check failed: {0}")]
    SafetyCheckFailed(String),
    
    #[error("Command failed: {0}")]
    CommandFailed(String),
    
    #[error("Unsupported action: {0}")]
    UnsupportedAction(String),
}

impl Default for AutoFixEngine {
    fn default() -> Self {
        Self::new(AutoFixConfig::default())
    }
}
