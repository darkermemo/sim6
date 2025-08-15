pub mod error_detector;
pub mod autofix_engine;

use crate::v2::types::health::*;
use error_detector::{ErrorDetector, DetectedError};
use autofix_engine::{AutoFixEngine, AutoFixConfig, AutoFixExecution};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Integrated health management system with error detection and auto-remediation
pub struct HealthManager {
    error_detector: Arc<RwLock<ErrorDetector>>,
    autofix_engine: Arc<RwLock<AutoFixEngine>>,
    config: HealthManagerConfig,
}

#[derive(Debug, Clone)]
pub struct HealthManagerConfig {
    pub error_detection_enabled: bool,
    pub auto_fix_enabled: bool,
    pub auto_fix_dry_run_default: bool,
    pub max_concurrent_fixes: u32,
    pub error_retention_hours: u32,
}

impl Default for HealthManagerConfig {
    fn default() -> Self {
        Self {
            error_detection_enabled: true,
            auto_fix_enabled: true,
            auto_fix_dry_run_default: true,
            max_concurrent_fixes: 3,
            error_retention_hours: 24,
        }
    }
}

impl HealthManager {
    pub fn new(config: HealthManagerConfig) -> Self {
        let autofix_config = AutoFixConfig {
            enabled: config.auto_fix_enabled,
            dry_run_by_default: config.auto_fix_dry_run_default,
            max_concurrent_executions: config.max_concurrent_fixes,
            ..Default::default()
        };

        Self {
            error_detector: Arc::new(RwLock::new(ErrorDetector::new())),
            autofix_engine: Arc::new(RwLock::new(AutoFixEngine::new(autofix_config))),
            config,
        }
    }

    /// Analyze health data and detect new errors
    pub async fn analyze_health(&self, health: &HealthSummary) -> Vec<DetectedError> {
        if !self.config.error_detection_enabled {
            return vec![];
        }

        let mut detector = self.error_detector.write().await;
        detector.detect_errors(health)
    }

    /// Get all currently active errors
    pub async fn get_active_errors(&self) -> Vec<DetectedError> {
        let detector = self.error_detector.read().await;
        detector.get_active_errors()
    }

    /// Execute auto-fix for a specific error
    pub async fn execute_auto_fix(
        &self,
        error_id: &str,
        dry_run: bool,
    ) -> Result<AutoFixExecution, String> {
        let detector = self.error_detector.read().await;
        let active_errors = detector.get_active_errors();
        
        let error = active_errors
            .iter()
            .find(|e| e.id == error_id)
            .ok_or_else(|| "Error not found".to_string())?;

        let mut engine = self.autofix_engine.write().await;
        engine.execute_auto_fix(error, dry_run)
            .await
            .map_err(|e| e.to_string())
    }

    /// Get auto-fix execution status
    pub async fn get_auto_fix_execution(&self, execution_id: &str) -> Option<AutoFixExecution> {
        let engine = self.autofix_engine.read().await;
        engine.get_execution(execution_id).cloned()
    }

    /// List all auto-fix executions
    pub async fn list_auto_fix_executions(&self) -> Vec<AutoFixExecution> {
        let engine = self.autofix_engine.read().await;
        engine.list_executions().into_iter().cloned().collect()
    }

    /// Process health data and automatically trigger fixes if configured
    pub async fn process_health_update(&self, health: &HealthSummary) -> HealthProcessingResult {
        let new_errors = self.analyze_health(health).await;
        let mut auto_fixes_triggered = Vec::new();

        // Optionally trigger auto-fixes for critical errors
        for error in &new_errors {
            if self.should_auto_trigger_fix(error) {
                match self.execute_auto_fix(&error.id, false).await {
                    Ok(execution) => {
                        auto_fixes_triggered.push(execution);
                    }
                    Err(e) => {
                        tracing::warn!("Failed to auto-trigger fix for error {}: {}", error.id, e);
                    }
                }
            }
        }

        HealthProcessingResult {
            new_errors,
            auto_fixes_triggered,
            total_active_errors: self.get_active_errors().await.len() as u32,
        }
    }

    fn should_auto_trigger_fix(&self, error: &DetectedError) -> bool {
        // Only auto-trigger for critical errors with safe auto-fixes
        matches!(error.severity, error_detector::ErrorSeverity::Critical) &&
        error.auto_fix.is_some() &&
        error.auto_fix_attempts == 0 // Only on first detection
    }
}

#[derive(Debug, Clone)]
pub struct HealthProcessingResult {
    pub new_errors: Vec<DetectedError>,
    pub auto_fixes_triggered: Vec<AutoFixExecution>,
    pub total_active_errors: u32,
}

impl Default for HealthManager {
    fn default() -> Self {
        Self::new(HealthManagerConfig::default())
    }
}
