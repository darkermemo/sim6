//! Log generation module
//! Provides multi-format log templates and multi-tenant simulation

pub mod templates;
pub mod tenant_simulator;

use crate::config::GeneratorConfig;
use rand::Rng;
use serde_json::Value;
use std::sync::Arc;

pub use templates::*;
pub use tenant_simulator::*;

/// Main log generator that coordinates templates and tenant simulation
pub struct LogGenerator {
    config: GeneratorConfig,
    tenant_simulator: Arc<TenantSimulator>,
    template_selector: TemplateSelector,
}

impl LogGenerator {
    /// Create a new log generator with the given configuration
    pub fn new(config: &GeneratorConfig) -> Self {
        let tenant_simulator = Arc::new(TenantSimulator::new(config.tenant_count));
        let template_selector = TemplateSelector::new(&config.template);
        
        Self {
            config: config.clone(),
            tenant_simulator,
            template_selector,
        }
    }
    
    /// Generate a batch of logs for a specific thread
    pub fn generate_batch(&self, thread_id: usize, batch_size: usize) -> Vec<Value> {
        let mut logs = Vec::with_capacity(batch_size);
        let mut rng = rand::thread_rng();
        
        for i in 0..batch_size {
            // Select tenant for this log
            let tenant = self.tenant_simulator.select_tenant(thread_id, i);
            
            // Select template type
            let template_type = self.template_selector.select_template(&mut rng, &tenant);
            
            // Generate log based on template
            let log = self.generate_single_log(template_type, &tenant, thread_id, i);
            logs.push(log);
        }
        
        logs
    }
    
    /// Generate a single log entry
    fn generate_single_log(
        &self,
        template_type: TemplateType,
        tenant: &TenantInfo,
        thread_id: usize,
        index: usize,
    ) -> Value {
        match template_type {
            TemplateType::Fortinet => generate_fortinet_log(tenant, thread_id, index),
            TemplateType::Sophos => generate_sophos_log(tenant, thread_id, index),
            TemplateType::F5 => generate_f5_log(tenant, thread_id, index),
            TemplateType::TrendMicro => generate_trendmicro_log(tenant, thread_id, index),
        }
    }
}

/// Template selector that chooses log formats based on configuration
pub struct TemplateSelector {
    strategy: SelectionStrategy,
}

#[derive(Debug, Clone)]
enum SelectionStrategy {
    Single(TemplateType),
    Mixed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TemplateType {
    Fortinet,
    Sophos,
    F5,
    TrendMicro,
}

impl TemplateSelector {
    /// Create a new template selector
    pub fn new(template_config: &str) -> Self {
        let strategy = match template_config {
            "fortinet" => SelectionStrategy::Single(TemplateType::Fortinet),
            "sophos" => SelectionStrategy::Single(TemplateType::Sophos),
            "f5" => SelectionStrategy::Single(TemplateType::F5),
            "trendmicro" => SelectionStrategy::Single(TemplateType::TrendMicro),
            "mixed" | _ => SelectionStrategy::Mixed,
        };
        
        Self { strategy }
    }
    
    /// Select a template type for the current log
    pub fn select_template<R: Rng>(&self, rng: &mut R, tenant: &TenantInfo) -> TemplateType {
        match &self.strategy {
            SelectionStrategy::Single(template_type) => *template_type,
            SelectionStrategy::Mixed => {
                // Use tenant preferences if available, otherwise random
                if let Some(preferred) = tenant.preferred_log_type {
                    if rng.gen_bool(0.7) { // 70% chance to use preferred type
                        preferred
                    } else {
                        self.random_template(rng)
                    }
                } else {
                    self.random_template(rng)
                }
            }
        }
    }
    
    /// Select a random template type
    fn random_template<R: Rng>(&self, rng: &mut R) -> TemplateType {
        match rng.gen_range(0..4) {
            0 => TemplateType::Fortinet,
            1 => TemplateType::Sophos,
            2 => TemplateType::F5,
            _ => TemplateType::TrendMicro,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::GeneratorConfig;
    
    fn create_test_config() -> GeneratorConfig {
        GeneratorConfig {
            target: 1000,
            threads: 4,
            endpoint: "http://localhost:8081/ingest/raw".to_string(),
            interval: 100,
            template: "mixed".to_string(),
            tenant_count: 5,
            compression: "gzip".to_string(),
            batch_size: 100,
            dry_run: false,
            timeout: 30,
            max_retries: 3,
            verbose: false,
        }
    }
    
    #[test]
    fn test_log_generator_creation() {
        let config = create_test_config();
        let generator = LogGenerator::new(&config);
        
        // Test that generator was created successfully
        assert_eq!(generator.config.tenant_count, 5);
    }
    
    #[test]
    fn test_batch_generation() {
        let config = create_test_config();
        let generator = LogGenerator::new(&config);
        
        let batch = generator.generate_batch(0, 10);
        assert_eq!(batch.len(), 10);
        
        // Verify all logs have required fields
        for log in &batch {
            assert!(log.get("timestamp").is_some());
            assert!(log.get("tenant_id").is_some());
            assert!(log.get("log_type").is_some());
        }
    }
    
    #[test]
    fn test_template_selector() {
        let selector = TemplateSelector::new("fortinet");
        let tenant = TenantInfo {
            id: 1,
            name: "Test Tenant".to_string(),
            preferred_log_type: None,
            ip_range: "10.1.0.0/24".to_string(),
        };
        
        let mut rng = rand::thread_rng();
        let template = selector.select_template(&mut rng, &tenant);
        assert_eq!(template, TemplateType::Fortinet);
    }
    
    #[test]
    fn test_mixed_template_selector() {
        let selector = TemplateSelector::new("mixed");
        let tenant = TenantInfo {
            id: 1,
            name: "Test Tenant".to_string(),
            preferred_log_type: Some(TemplateType::Sophos),
            ip_range: "10.1.0.0/24".to_string(),
        };
        
        let mut rng = rand::thread_rng();
        
        // Test multiple selections to ensure variety
        let mut templates = std::collections::HashSet::new();
        for _ in 0..100 {
            let template = selector.select_template(&mut rng, &tenant);
            templates.insert(template);
        }
        
        // Should have at least the preferred type
        assert!(templates.contains(&TemplateType::Sophos));
    }
}