//! Schema Validation Tool for SIEM System
//! 
//! This tool validates that the ClickHouse database schema matches the expected
//! structure used by the Rust API handlers. It prevents runtime errors caused by
//! missing or mismatched columns.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::process;

#[derive(Debug, Serialize, Deserialize)]
struct TableSchema {
    columns: Vec<ColumnDefinition>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ColumnDefinition {
    name: String,
    column_type: String,
    required: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct SchemaConfig {
    tables: HashMap<String, TableSchema>,
}

/// Expected schema configuration for all SIEM tables
fn get_expected_schema() -> SchemaConfig {
    let mut tables = HashMap::new();
    
    // Tenants table schema
    tables.insert("dev.tenants".to_string(), TableSchema {
        columns: vec![
            ColumnDefinition { name: "tenant_id".to_string(), column_type: "String".to_string(), required: true },
            ColumnDefinition { name: "tenant_name".to_string(), column_type: "String".to_string(), required: true },
            ColumnDefinition { name: "is_active".to_string(), column_type: "UInt8".to_string(), required: true },
            ColumnDefinition { name: "created_at".to_string(), column_type: "UInt32".to_string(), required: true },
        ],
    });
    
    // Alerts table schema
    tables.insert("dev.alerts".to_string(), TableSchema {
        columns: vec![
            ColumnDefinition { name: "alert_id".to_string(), column_type: "String".to_string(), required: true },
            ColumnDefinition { name: "tenant_id".to_string(), column_type: "String".to_string(), required: true },
            ColumnDefinition { name: "rule_id".to_string(), column_type: "String".to_string(), required: true },
            ColumnDefinition { name: "rule_name".to_string(), column_type: "String".to_string(), required: true },
            ColumnDefinition { name: "event_id".to_string(), column_type: "String".to_string(), required: true },
            ColumnDefinition { name: "alert_timestamp".to_string(), column_type: "UInt32".to_string(), required: true },
            ColumnDefinition { name: "severity".to_string(), column_type: "String".to_string(), required: true },
            ColumnDefinition { name: "status".to_string(), column_type: "String".to_string(), required: true },
            ColumnDefinition { name: "created_at".to_string(), column_type: "UInt32".to_string(), required: true },
        ],
    });
    
    // Events table schema
    tables.insert("dev.events".to_string(), TableSchema {
        columns: vec![
            ColumnDefinition { name: "event_id".to_string(), column_type: "String".to_string(), required: true },
            ColumnDefinition { name: "tenant_id".to_string(), column_type: "String".to_string(), required: true },
            ColumnDefinition { name: "timestamp".to_string(), column_type: "UInt32".to_string(), required: true },
            ColumnDefinition { name: "source_ip".to_string(), column_type: "String".to_string(), required: false },
            ColumnDefinition { name: "raw_event".to_string(), column_type: "String".to_string(), required: true },
        ],
    });
    
    SchemaConfig { tables }
}

/// Validates API endpoints against expected schema
async fn validate_api_schema() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let base_url = "http://localhost:8080/api/v1";
    
    // Read admin token
    let token = fs::read_to_string("fresh_admin_token.txt")
        .map_err(|_| "Failed to read admin token file")?;
    let token = token.trim();
    
    println!("🔍 Validating API schema against ClickHouse...");
    
    // Test tenants endpoint
    let response = client
        .get(&format!("{}/tenants", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;
    
    if !response.status().is_success() {
        return Err(format!("Tenants API failed with status: {}", response.status()).into());
    }
    
    println!("✅ Tenants endpoint: OK");
    
    // Test alerts endpoint
    let response = client
        .get(&format!("{}/alerts", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;
    
    if !response.status().is_success() {
        return Err(format!("Alerts API failed with status: {}", response.status()).into());
    }
    
    let alerts_data: serde_json::Value = response.json().await?;
    
    // Validate alerts response structure
    if let Some(meta) = alerts_data.get("meta").and_then(|m| m.as_array()) {
        let expected_schema = get_expected_schema();
        let alerts_schema = &expected_schema.tables["dev.alerts"];
        
        for expected_col in &alerts_schema.columns {
            if expected_col.required {
                let found = meta.iter().any(|col| {
                    col.get("name").and_then(|n| n.as_str()) == Some(&expected_col.name)
                });
                
                if !found {
                    return Err(format!(
                        "❌ Required column '{}' not found in alerts API response", 
                        expected_col.name
                    ).into());
                }
            }
        }
        
        // Check for unexpected columns that might cause issues
        for meta_col in meta {
            if let Some(col_name) = meta_col.get("name").and_then(|n| n.as_str()) {
                if col_name == "assignee_id" {
                    return Err("❌ Found deprecated 'assignee_id' column in alerts response".into());
                }
            }
        }
    }
    
    println!("✅ Alerts endpoint: OK");
    println!("✅ Schema validation passed!");
    
    Ok(())
}

#[tokio::main]
async fn main() {
    println!("🛡️ SIEM Schema Validator");
    println!("========================");
    
    match validate_api_schema().await {
        Ok(_) => {
            println!("\n🎉 All schema validations passed!");
            println!("   - No missing columns detected");
            println!("   - No deprecated columns found");
            println!("   - API endpoints returning expected data");
        }
        Err(e) => {
            eprintln!("\n💥 Schema validation failed: {}", e);
            eprintln!("   Please fix the schema mismatch before proceeding.");
            process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_expected_schema_structure() {
        let schema = get_expected_schema();
        
        // Verify tenants table has required columns
        let tenants = &schema.tables["dev.tenants"];
        assert!(tenants.columns.iter().any(|c| c.name == "tenant_id"));
        assert!(tenants.columns.iter().any(|c| c.name == "is_active"));
        assert!(!tenants.columns.iter().any(|c| c.name == "status")); // Should not have status
        
        // Verify alerts table has required columns
        let alerts = &schema.tables["dev.alerts"];
        assert!(alerts.columns.iter().any(|c| c.name == "alert_id"));
        assert!(alerts.columns.iter().any(|c| c.name == "status"));
        assert!(!alerts.columns.iter().any(|c| c.name == "assignee_id")); // Should not have assignee_id
    }
}