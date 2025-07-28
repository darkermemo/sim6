//! Tenant registry module for managing tenant configurations
//! Handles loading, validation, and management of tenant settings

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::Path,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::config::{RateLimitConfig, TenantConfig, TenantRegistry};

/// Tenant registry manager
pub struct TenantRegistryManager {
    registry: Arc<RwLock<TenantRegistry>>,
    config_path: String,
    auto_reload: bool,
    last_modified: Option<SystemTime>,
}

/// Tenant validation result
#[derive(Debug, Clone)]
pub struct TenantValidationResult {
    pub tenant_id: String,
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// Tenant statistics
#[derive(Debug, Clone, Serialize)]
pub struct TenantStats {
    pub tenant_id: String,
    pub requests_count: u64,
    pub bytes_processed: u64,
    pub errors_count: u64,
    pub last_activity: Option<SystemTime>,
    pub rate_limit_hits: u64,
}

/// Registry statistics
#[derive(Debug, Clone, Serialize)]
pub struct RegistryStats {
    pub total_tenants: usize,
    pub active_tenants: usize,
    pub disabled_tenants: usize,
    pub last_reload: Option<SystemTime>,
    pub tenant_stats: HashMap<String, TenantStats>,
}

impl TenantRegistryManager {
    /// Create a new tenant registry manager
    pub fn new(config_path: String, auto_reload: bool) -> Self {
        Self {
            registry: Arc::new(RwLock::new(TenantRegistry::default_registry())),
            config_path,
            auto_reload,
            last_modified: None,
        }
    }

    /// Get the registry (read-only access)
    pub fn get_registry(&self) -> Arc<RwLock<TenantRegistry>> {
        self.registry.clone()
    }

    /// Load tenant registry from file
    pub async fn load_from_file(&mut self) -> Result<()> {
        let path = Path::new(&self.config_path);
        
        if !path.exists() {
            warn!("Tenant registry file not found: {}", self.config_path);
            return self.create_default_registry().await;
        }

        let metadata = fs::metadata(path)
            .with_context(|| format!("Failed to read metadata for {}", self.config_path))?;
        
        let modified = metadata.modified()
            .with_context(|| "Failed to get file modification time")?;

        // Check if file has been modified since last load
        if let Some(last_mod) = self.last_modified {
            if modified <= last_mod {
                debug!("Tenant registry file unchanged, skipping reload");
                return Ok(());
            }
        }

        let content = fs::read_to_string(path)
            .with_context(|| format!("Failed to read tenant registry file: {}", self.config_path))?;

        let registry: TenantRegistry = if self.config_path.ends_with(".yaml") || self.config_path.ends_with(".yml") {
            serde_yaml::from_str(&content)
                .with_context(|| "Failed to parse YAML tenant registry")?
        } else {
            toml::from_str(&content)
                .with_context(|| "Failed to parse TOML tenant registry")?
        };

        // Validate the loaded registry
        let validation_results = self.validate_registry(&registry).await;
        let errors: Vec<_> = validation_results.iter()
            .filter(|r| !r.is_valid)
            .collect();

        if !errors.is_empty() {
            error!("Tenant registry validation failed with {} errors", errors.len());
            for result in errors {
                error!("Tenant {}: {:?}", result.tenant_id, result.errors);
            }
            return Err(anyhow::anyhow!("Tenant registry validation failed"));
        }

        // Update the registry
        {
            let mut reg = self.registry.write().await;
            *reg = registry;
        }

        self.last_modified = Some(modified);
        
        info!(
            "Successfully loaded tenant registry from {}, {} tenants configured",
            self.config_path,
            self.get_tenant_count().await
        );

        Ok(())
    }

    /// Save tenant registry to file
    pub async fn save_to_file(&self) -> Result<()> {
        let registry = self.registry.read().await;
        
        let content = if self.config_path.ends_with(".yaml") || self.config_path.ends_with(".yml") {
            serde_yaml::to_string(&*registry)
                .with_context(|| "Failed to serialize registry to YAML")?
        } else {
            toml::to_string_pretty(&*registry)
                .with_context(|| "Failed to serialize registry to TOML")?
        };

        fs::write(&self.config_path, content)
            .with_context(|| format!("Failed to write tenant registry to {}", self.config_path))?;

        info!("Tenant registry saved to {}", self.config_path);
        Ok(())
    }

    /// Create a default registry with sample tenants
    async fn create_default_registry(&mut self) -> Result<()> {
        let mut registry = TenantRegistry::default_registry();
        
        // Add a default tenant
        let default_tenant = TenantConfig {
            id: "default".to_string(),
            name: "Default Tenant".to_string(),
            table_name: "logs_default".to_string(),
            enabled: true,
            api_key: Uuid::new_v4().to_string(),
            rate_limit: RateLimitConfig {
                requests_per_second: 1000,
                bytes_per_second: 10 * 1024 * 1024, // 10MB/s
                burst_capacity: 100,
            },
            schema_mappings: HashMap::new(),
        };

        registry.tenants.insert("default".to_string(), default_tenant);
        registry.metadata.version = "1.0.0".to_string();
        registry.metadata.updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string();

        {
            let mut reg = self.registry.write().await;
            *reg = registry;
        }

        // Save the default registry
        self.save_to_file().await?;
        
        info!("Created default tenant registry with 1 tenant");
        Ok(())
    }

    /// Validate the entire registry
    async fn validate_registry(&self, registry: &TenantRegistry) -> Vec<TenantValidationResult> {
        let mut results = Vec::new();
        let mut seen_table_names = HashMap::new();
        let mut seen_api_keys = HashMap::new();

        for (tenant_id, tenant) in &registry.tenants {
            let mut result = TenantValidationResult {
                tenant_id: tenant_id.clone(),
                is_valid: true,
                errors: Vec::new(),
                warnings: Vec::new(),
            };

            // Validate tenant ID matches key
            if tenant.id != *tenant_id {
                result.errors.push(format!(
                    "Tenant ID mismatch: key '{}' vs config '{}'",
                    tenant_id, tenant.id
                ));
                result.is_valid = false;
            }

            // Validate required fields
            if tenant.name.trim().is_empty() {
                result.errors.push("Tenant name cannot be empty".to_string());
                result.is_valid = false;
            }

            if tenant.table_name.trim().is_empty() {
                result.errors.push("Table name cannot be empty".to_string());
                result.is_valid = false;
            }

            if tenant.api_key.trim().is_empty() {
                result.errors.push("API key cannot be empty".to_string());
                result.is_valid = false;
            }

            // Check for duplicate table names
            if let Some(existing_tenant) = seen_table_names.get(&tenant.table_name) {
                result.errors.push(format!(
                    "Duplicate table name '{}' (also used by tenant '{}')",
                    tenant.table_name, existing_tenant
                ));
                result.is_valid = false;
            } else {
                seen_table_names.insert(tenant.table_name.clone(), tenant_id.clone());
            }

            // Check for duplicate API keys
            if let Some(existing_tenant) = seen_api_keys.get(&tenant.api_key) {
                result.errors.push(format!(
                    "Duplicate API key (also used by tenant '{}')",
                    existing_tenant
                ));
                result.is_valid = false;
            } else {
                seen_api_keys.insert(tenant.api_key.clone(), tenant_id.clone());
            }

            // Validate rate limits
            if tenant.rate_limit.requests_per_second == 0 {
                result.warnings.push("Requests per second is 0, tenant will be rate limited immediately".to_string());
            }

            if tenant.rate_limit.bytes_per_second == 0 {
                result.warnings.push("Bytes per second is 0, tenant will be rate limited immediately".to_string());
            }

            if tenant.rate_limit.burst_capacity > tenant.rate_limit.requests_per_second * 10 {
                result.warnings.push("Burst capacity is very high compared to rate limit".to_string());
            }

            // Validate table name format (basic check)
            if !tenant.table_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
                result.errors.push("Table name contains invalid characters (only alphanumeric and underscore allowed)".to_string());
                result.is_valid = false;
            }

            results.push(result);
        }

        results
    }

    /// Add a new tenant
    pub async fn add_tenant(&self, tenant: TenantConfig) -> Result<()> {
        let mut registry = self.registry.write().await;
        
        if registry.tenants.contains_key(&tenant.id) {
            return Err(anyhow::anyhow!("Tenant '{}' already exists", tenant.id));
        }

        registry.tenants.insert(tenant.id.clone(), tenant.clone());
        registry.metadata.updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string();
        
        info!("Added new tenant: {}", tenant.id);
        Ok(())
    }

    /// Update an existing tenant
    pub async fn update_tenant(&self, tenant_id: &str, tenant: TenantConfig) -> Result<()> {
        let mut registry = self.registry.write().await;
        
        if !registry.tenants.contains_key(tenant_id) {
            return Err(anyhow::anyhow!("Tenant '{}' not found", tenant_id));
        }

        registry.tenants.insert(tenant_id.to_string(), tenant);
        registry.metadata.updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string();
        
        info!("Updated tenant: {}", tenant_id);
        Ok(())
    }

    /// Remove a tenant
    pub async fn remove_tenant(&self, tenant_id: &str) -> Result<()> {
        let mut registry = self.registry.write().await;
        
        if registry.tenants.remove(tenant_id).is_none() {
            return Err(anyhow::anyhow!("Tenant '{}' not found", tenant_id));
        }

        registry.metadata.updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string();
        
        info!("Removed tenant: {}", tenant_id);
        Ok(())
    }

    /// Enable/disable a tenant
    pub async fn set_tenant_enabled(&self, tenant_id: &str, enabled: bool) -> Result<()> {
        let mut registry = self.registry.write().await;
        
        match registry.tenants.get_mut(tenant_id) {
            Some(tenant) => {
                tenant.enabled = enabled;
                registry.metadata.updated_at = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
                .to_string();
                info!("Tenant '{}' {}", tenant_id, if enabled { "enabled" } else { "disabled" });
                Ok(())
            }
            None => Err(anyhow::anyhow!("Tenant '{}' not found", tenant_id))
        }
    }

    /// Get tenant count
    pub async fn get_tenant_count(&self) -> usize {
        let registry = self.registry.read().await;
        registry.tenants.len()
    }

    /// Get active tenant count
    pub async fn get_active_tenant_count(&self) -> usize {
        let registry = self.registry.read().await;
        registry.tenants.values().filter(|t| t.enabled).count()
    }

    /// Get registry statistics
    pub async fn get_stats(&self) -> RegistryStats {
        let registry = self.registry.read().await;
        
        let total_tenants = registry.tenants.len();
        let active_tenants = registry.tenants.values().filter(|t| t.enabled).count();
        let disabled_tenants = total_tenants - active_tenants;

        RegistryStats {
            total_tenants,
            active_tenants,
            disabled_tenants,
            last_reload: self.last_modified,
            tenant_stats: HashMap::new(), // TODO: Implement actual tenant statistics
        }
    }

    /// Check if auto-reload is needed and perform it
    pub async fn check_and_reload(&mut self) -> Result<bool> {
        if !self.auto_reload {
            return Ok(false);
        }

        let path = Path::new(&self.config_path);
        if !path.exists() {
            return Ok(false);
        }

        let metadata = fs::metadata(path)
            .with_context(|| format!("Failed to read metadata for {}", self.config_path))?;
        
        let modified = metadata.modified()
            .with_context(|| "Failed to get file modification time")?;

        if let Some(last_mod) = self.last_modified {
            if modified > last_mod {
                info!("Tenant registry file changed, reloading...");
                self.load_from_file().await?;
                return Ok(true);
            }
        }

        Ok(false)
    }

    /// Start auto-reload task
    pub fn start_auto_reload_task(mut self, interval: Duration) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let mut interval_timer = tokio::time::interval(interval);
            
            loop {
                interval_timer.tick().await;
                
                if let Err(e) = self.check_and_reload().await {
                    error!("Failed to reload tenant registry: {}", e);
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use std::io::Write;

    #[tokio::test]
    async fn test_tenant_registry_manager_creation() {
        let manager = TenantRegistryManager::new(
            "test_registry.toml".to_string(),
            false
        );
        
        assert_eq!(manager.config_path, "test_registry.toml");
        assert!(!manager.auto_reload);
        assert!(manager.last_modified.is_none());
    }

    #[tokio::test]
    async fn test_create_default_registry() {
        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path().to_str().unwrap().to_string();
        
        let mut manager = TenantRegistryManager::new(path, false);
        manager.create_default_registry().await.unwrap();
        
        assert_eq!(manager.get_tenant_count().await, 1);
        assert_eq!(manager.get_active_tenant_count().await, 1);
    }

    #[tokio::test]
    async fn test_add_and_remove_tenant() {
        let mut manager = TenantRegistryManager::new(
            "test_registry.toml".to_string(),
            false
        );
        
        let tenant = TenantConfig {
            id: "test_tenant".to_string(),
            name: "Test Tenant".to_string(),
            table_name: "logs_test".to_string(),
            enabled: true,
            api_key: "test_key".to_string(),
            rate_limit: RateLimitConfig {
                requests_per_second: 100,
                bytes_per_second: 1024 * 1024,
                burst_capacity: 10,
            },
            custom_fields: HashMap::new(),
        };

        // Add tenant
        manager.add_tenant(tenant).await.unwrap();
        assert_eq!(manager.get_tenant_count().await, 1);

        // Remove tenant
        manager.remove_tenant("test_tenant").await.unwrap();
        assert_eq!(manager.get_tenant_count().await, 0);
    }

    #[tokio::test]
    async fn test_tenant_validation() {
        let manager = TenantRegistryManager::new(
            "test_registry.toml".to_string(),
            false
        );
        
        let mut registry = TenantRegistry::default();
        
        // Add invalid tenant (empty name)
        let invalid_tenant = TenantConfig {
            id: "invalid".to_string(),
            name: "".to_string(), // Empty name
            table_name: "logs_invalid".to_string(),
            enabled: true,
            api_key: "key".to_string(),
            rate_limit: RateLimitConfig {
                requests_per_second: 100,
                bytes_per_second: 1024,
                burst_capacity: 10,
            },
            custom_fields: HashMap::new(),
        };
        
        registry.tenants.insert("invalid".to_string(), invalid_tenant);
        
        let results = manager.validate_registry(&registry).await;
        assert_eq!(results.len(), 1);
        assert!(!results[0].is_valid);
        assert!(!results[0].errors.is_empty());
    }
}