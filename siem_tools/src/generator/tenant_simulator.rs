//! Multi-tenant simulation module
//! Manages tenant information and simulates realistic multi-tenant log patterns

use crate::generator::TemplateType;
use rand::Rng;
use std::collections::HashMap;

/// Information about a simulated tenant organization
#[derive(Debug, Clone)]
pub struct TenantInfo {
    pub id: usize,
    pub name: String,
    pub preferred_log_type: Option<TemplateType>,
    pub ip_range: String,
}

/// Manages multiple tenants and their characteristics
pub struct TenantSimulator {
    tenants: Vec<TenantInfo>,
    tenant_weights: HashMap<usize, f64>,
}

impl TenantSimulator {
    /// Create a new tenant simulator with the specified number of tenants
    pub fn new(tenant_count: usize) -> Self {
        let tenants = Self::generate_tenants(tenant_count);
        let tenant_weights = Self::generate_weights(&tenants);
        
        Self {
            tenants,
            tenant_weights,
        }
    }
    
    /// Select a tenant for the current log based on thread and index
    pub fn select_tenant(&self, thread_id: usize, index: usize) -> &TenantInfo {
        // Use a combination of thread_id and index to distribute tenants
        // This ensures good distribution while maintaining some locality
        let tenant_index = (thread_id * 7 + index * 3) % self.tenants.len();
        &self.tenants[tenant_index]
    }
    
    /// Select a tenant using weighted random selection
    pub fn select_tenant_weighted<R: Rng>(&self, rng: &mut R) -> &TenantInfo {
        let total_weight: f64 = self.tenant_weights.values().sum();
        let mut random_value = rng.gen::<f64>() * total_weight;
        
        for tenant in &self.tenants {
            let weight = self.tenant_weights.get(&tenant.id).unwrap_or(&1.0);
            if random_value <= *weight {
                return tenant;
            }
            random_value -= weight;
        }
        
        // Fallback to first tenant
        &self.tenants[0]
    }
    
    /// Get all tenants
    pub fn get_tenants(&self) -> &[TenantInfo] {
        &self.tenants
    }
    
    /// Get tenant by ID
    pub fn get_tenant(&self, id: usize) -> Option<&TenantInfo> {
        self.tenants.iter().find(|t| t.id == id)
    }
    
    /// Get tenant count
    pub fn tenant_count(&self) -> usize {
        self.tenants.len()
    }
    
    /// Generate realistic tenant information
    fn generate_tenants(count: usize) -> Vec<TenantInfo> {
        let mut tenants = Vec::with_capacity(count);
        
        // Predefined company names for realism
        let company_names = [
            "Acme Corp", "Global Tech", "Secure Systems", "DataFlow Inc", "CyberGuard",
            "TechNova", "SecureNet", "InfoSafe", "DigitalShield", "CloudSecure",
            "NetProtect", "SafeData", "CyberDefense", "SecureTech", "GuardianSoft",
            "ProtectCorp", "SafeGuard", "CyberSafe", "SecureFlow", "DataGuard",
            "TechShield", "CyberFlow", "SecureData", "InfoGuard", "DigitalSafe",
            "NetSecure", "CyberTech", "SafeFlow", "GuardTech", "SecureInfo"
        ];
        
        for i in 0..count {
            let tenant_id = i + 1;
            
            // Select company name (cycle through if we have more tenants than names)
            let company_name = company_names[i % company_names.len()].to_string();
            
            // Assign preferred log types based on tenant characteristics
            let preferred_log_type = match i % 5 {
                0 => Some(TemplateType::Fortinet),  // 20% prefer Fortinet
                1 => Some(TemplateType::Sophos),    // 20% prefer Sophos
                2 => Some(TemplateType::F5),        // 20% prefer F5
                3 => Some(TemplateType::TrendMicro), // 20% prefer Trend Micro
                _ => None,                          // 20% have no preference (mixed)
            };
            
            // Generate IP range for tenant
            let ip_range = format!("10.{}.0.0/16", tenant_id);
            
            tenants.push(TenantInfo {
                id: tenant_id,
                name: company_name,
                preferred_log_type,
                ip_range,
            });
        }
        
        tenants
    }
    
    /// Generate weights for tenant selection (some tenants generate more logs)
    fn generate_weights(tenants: &[TenantInfo]) -> HashMap<usize, f64> {
        let mut weights = HashMap::new();
        let mut rng = rand::thread_rng();
        
        for tenant in tenants {
            // Generate weights following a realistic distribution
            // Most tenants have normal activity, some have high activity, few have low activity
            let weight = match rng.gen_range(0..10) {
                0..=1 => rng.gen_range(0.1..0.5),   // 20% low activity
                2..=7 => rng.gen_range(0.8..1.2),   // 60% normal activity
                _ => rng.gen_range(1.5..3.0),       // 20% high activity
            };
            
            weights.insert(tenant.id, weight);
        }
        
        weights
    }
    
    /// Get statistics about tenant distribution
    pub fn get_tenant_stats(&self) -> TenantStats {
        let total_weight: f64 = self.tenant_weights.values().sum();
        let avg_weight = total_weight / self.tenants.len() as f64;
        
        let mut high_activity_count = 0;
        let mut normal_activity_count = 0;
        let mut low_activity_count = 0;
        
        for weight in self.tenant_weights.values() {
            if *weight > 1.5 {
                high_activity_count += 1;
            } else if *weight < 0.5 {
                low_activity_count += 1;
            } else {
                normal_activity_count += 1;
            }
        }
        
        // Count preferred log types
        let mut fortinet_count = 0;
        let mut sophos_count = 0;
        let mut f5_count = 0;
        let mut trendmicro_count = 0;
        let mut mixed_count = 0;
        
        for tenant in &self.tenants {
            match tenant.preferred_log_type {
                Some(TemplateType::Fortinet) => fortinet_count += 1,
                Some(TemplateType::Sophos) => sophos_count += 1,
                Some(TemplateType::F5) => f5_count += 1,
                Some(TemplateType::TrendMicro) => trendmicro_count += 1,
                None => mixed_count += 1,
            }
        }
        
        TenantStats {
            total_tenants: self.tenants.len(),
            avg_weight,
            high_activity_count,
            normal_activity_count,
            low_activity_count,
            fortinet_count,
            sophos_count,
            f5_count,
            trendmicro_count,
            mixed_count,
        }
    }
    
    /// Print tenant information for debugging
    pub fn print_tenant_info(&self) {
        println!("\n🏢 TENANT CONFIGURATION:");
        println!("   Total Tenants: {}", self.tenants.len());
        
        for tenant in &self.tenants {
            let weight = self.tenant_weights.get(&tenant.id).unwrap_or(&1.0);
            let activity_level = if *weight > 1.5 {
                "High"
            } else if *weight < 0.5 {
                "Low"
            } else {
                "Normal"
            };
            
            let preferred_type = match tenant.preferred_log_type {
                Some(TemplateType::Fortinet) => "Fortinet",
                Some(TemplateType::Sophos) => "Sophos",
                Some(TemplateType::F5) => "F5",
                Some(TemplateType::TrendMicro) => "TrendMicro",
                None => "Mixed",
            };
            
            println!(
                "   Tenant {}: {} (Activity: {}, Weight: {:.2}, Preferred: {}, IP: {})",
                tenant.id, tenant.name, activity_level, weight, preferred_type, tenant.ip_range
            );
        }
        
        let stats = self.get_tenant_stats();
        println!("\n📊 TENANT STATISTICS:");
        println!("   High Activity: {} tenants", stats.high_activity_count);
        println!("   Normal Activity: {} tenants", stats.normal_activity_count);
        println!("   Low Activity: {} tenants", stats.low_activity_count);
        println!("   Average Weight: {:.2}", stats.avg_weight);
        println!("\n🔧 LOG TYPE PREFERENCES:");
        println!("   Fortinet: {} tenants", stats.fortinet_count);
        println!("   Sophos: {} tenants", stats.sophos_count);
        println!("   F5: {} tenants", stats.f5_count);
        println!("   Trend Micro: {} tenants", stats.trendmicro_count);
        println!("   Mixed: {} tenants", stats.mixed_count);
    }
}

/// Statistics about tenant configuration
#[derive(Debug, Clone)]
pub struct TenantStats {
    pub total_tenants: usize,
    pub avg_weight: f64,
    pub high_activity_count: usize,
    pub normal_activity_count: usize,
    pub low_activity_count: usize,
    pub fortinet_count: usize,
    pub sophos_count: usize,
    pub f5_count: usize,
    pub trendmicro_count: usize,
    pub mixed_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_tenant_simulator_creation() {
        let simulator = TenantSimulator::new(5);
        
        assert_eq!(simulator.tenant_count(), 5);
        assert_eq!(simulator.tenants.len(), 5);
        assert_eq!(simulator.tenant_weights.len(), 5);
    }
    
    #[test]
    fn test_tenant_selection() {
        let simulator = TenantSimulator::new(10);
        
        // Test deterministic selection
        let tenant1 = simulator.select_tenant(0, 0);
        let tenant2 = simulator.select_tenant(0, 0);
        assert_eq!(tenant1.id, tenant2.id); // Should be deterministic
        
        // Test different selections
        let tenant3 = simulator.select_tenant(1, 0);
        // May or may not be different, but shouldn't panic
        assert!(tenant3.id >= 1);
    }
    
    #[test]
    fn test_tenant_weighted_selection() {
        let simulator = TenantSimulator::new(5);
        let mut rng = rand::thread_rng();
        
        // Test multiple selections
        for _ in 0..10 {
            let tenant = simulator.select_tenant_weighted(&mut rng);
            assert!(tenant.id >= 1 && tenant.id <= 5);
        }
    }
    
    #[test]
    fn test_tenant_info_generation() {
        let simulator = TenantSimulator::new(3);
        let tenants = simulator.get_tenants();
        
        assert_eq!(tenants.len(), 3);
        
        for (i, tenant) in tenants.iter().enumerate() {
            assert_eq!(tenant.id, i + 1);
            assert!(!tenant.name.is_empty());
            assert!(tenant.ip_range.starts_with("10."));
            assert!(tenant.ip_range.ends_with(".0.0/16"));
        }
    }
    
    #[test]
    fn test_tenant_by_id() {
        let simulator = TenantSimulator::new(5);
        
        let tenant = simulator.get_tenant(3);
        assert!(tenant.is_some());
        assert_eq!(tenant.unwrap().id, 3);
        
        let missing_tenant = simulator.get_tenant(10);
        assert!(missing_tenant.is_none());
    }
    
    #[test]
    fn test_tenant_stats() {
        let simulator = TenantSimulator::new(10);
        let stats = simulator.get_tenant_stats();
        
        assert_eq!(stats.total_tenants, 10);
        assert!(stats.avg_weight > 0.0);
        assert_eq!(
            stats.high_activity_count + stats.normal_activity_count + stats.low_activity_count,
            10
        );
        assert_eq!(
            stats.fortinet_count + stats.sophos_count + stats.f5_count + stats.trendmicro_count + stats.mixed_count,
            10
        );
    }
    
    #[test]
    fn test_tenant_distribution() {
        let simulator = TenantSimulator::new(20);
        
        // Test that tenant selection distributes across all tenants
        let mut tenant_counts = std::collections::HashMap::new();
        
        for thread_id in 0..4 {
            for index in 0..100 {
                let tenant = simulator.select_tenant(thread_id, index);
                *tenant_counts.entry(tenant.id).or_insert(0) += 1;
            }
        }
        
        // Should have selected from multiple tenants
        assert!(tenant_counts.len() > 1);
        
        // Each tenant should have been selected at least once
        for count in tenant_counts.values() {
            assert!(*count > 0);
        }
    }
}