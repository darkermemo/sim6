//! Schema validation for ClickHouse integration
//!
//! This module provides functionality to validate that Rust structs match
//! the expected ClickHouse table schema, ensuring type safety and preventing
//! runtime errors during data insertion and querying.

use crate::error::{PipelineError, Result};
use crate::models::SiemEvent;
use clickhouse::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{error, info, warn};

/// ClickHouse column information from system.columns
#[derive(Debug, Clone, Serialize, Deserialize, clickhouse::Row)]
struct ColumnInfo {
    name: String,
    r#type: String,
    is_nullable: u8,
}

/// Expected schema for SiemEvent table
const EXPECTED_SCHEMA: &[(&str, &str, bool)] = &[
    ("id", "String", false),
    ("timestamp", "UInt32", false),
    ("event_type", "String", false),
    ("source", "String", false),
    ("severity", "String", false),
    ("message", "String", false),
    ("raw_log", "String", true),
    ("parsed_fields", "String", true), // JSON as string
    ("source_ip", "String", true),
    ("dest_ip", "String", true),
    ("source_port", "Nullable(UInt16)", true),
    ("dest_port", "Nullable(UInt16)", true),
    ("protocol", "String", true),
    ("user_agent", "String", true),
    ("http_method", "String", true),
    ("url", "String", true),
    ("status_code", "Nullable(UInt16)", true),
    ("bytes_in", "Nullable(UInt64)", true),
    ("bytes_out", "Nullable(UInt64)", true),
    ("duration_ms", "Nullable(UInt32)", true),
    ("tenant_id", "String", true),
    ("tags", "Array(String)", true),
    ("correlation_id", "String", true),
    ("rule_id", "String", true),
    ("alert_id", "String", true),
    ("created_at", "UInt32", false),
    ("updated_at", "UInt32", true),
];

/// Validates that the ClickHouse table schema matches the expected SiemEvent schema
///
/// # Arguments
/// * `client` - ClickHouse client
/// * `table_name` - Full table name (e.g., "dev.events")
///
/// # Returns
/// * `Ok(())` if schema matches
/// * `Err(PipelineError)` if schema validation fails
pub async fn ensure_schema_matches(client: &Client, table_name: &str) -> Result<()> {
    info!("Validating schema for table: {}", table_name);
    
    // Parse database and table from full name
    let parts: Vec<&str> = table_name.split('.').collect();
    if parts.len() != 2 {
        return Err(PipelineError::configuration(
            format!("Invalid table name format: {}. Expected 'database.table'", table_name)
        ));
    }
    let (database, table) = (parts[0], parts[1]);
    
    // Query ClickHouse system.columns for table schema
    let query = r#"
        SELECT name, type, is_nullable
        FROM system.columns 
        WHERE database = ? AND table = ?
        ORDER BY name
    "#;
    
    let columns: Vec<ColumnInfo> = client
        .query(query)
        .bind(database)
        .bind(table)
        .fetch_all()
        .await
        .map_err(|e| {
            error!("Failed to query table schema: {}", e);
            PipelineError::database(format!("Schema query failed: {}", e))
        })?;
    
    if columns.is_empty() {
        return Err(PipelineError::configuration(
            format!("Table {} does not exist or has no columns", table_name)
        ));
    }
    
    // Create a map of actual columns for easy lookup
    let actual_columns: HashMap<String, ColumnInfo> = columns
        .into_iter()
        .map(|col| (col.name.clone(), col))
        .collect();
    
    let mut errors = Vec::new();
    
    // Validate each expected column
    for (expected_name, expected_type, expected_nullable) in EXPECTED_SCHEMA {
        match actual_columns.get(*expected_name) {
            Some(actual_col) => {
                // Check type compatibility
                if !is_type_compatible(&actual_col.r#type, expected_type) {
                    errors.push(format!(
                        "Column '{}': type mismatch. Expected '{}', found '{}'",
                        expected_name, expected_type, actual_col.r#type
                    ));
                }
                
                // Check nullability
                let actual_nullable = actual_col.is_nullable == 1;
                if actual_nullable != *expected_nullable {
                    errors.push(format!(
                        "Column '{}': nullability mismatch. Expected nullable={}, found nullable={}",
                        expected_name, expected_nullable, actual_nullable
                    ));
                }
            }
            None => {
                errors.push(format!("Missing required column: '{}'", expected_name));
            }
        }
    }
    
    // Check for unexpected columns (warn only)
    for actual_name in actual_columns.keys() {
        if !EXPECTED_SCHEMA.iter().any(|(name, _, _)| name == actual_name) {
            warn!("Unexpected column found in table: '{}'", actual_name);
        }
    }
    
    if !errors.is_empty() {
        error!("Schema validation failed for table {}: {}", table_name, errors.join("; "));
        return Err(PipelineError::configuration(
            format!("Schema validation failed: {}", errors.join("; "))
        ));
    }
    
    info!("Schema validation passed for table: {}", table_name);
    Ok(())
}

/// Checks if ClickHouse types are compatible
///
/// This handles type aliases and nullable variations
fn is_type_compatible(actual: &str, expected: &str) -> bool {
    // Direct match
    if actual == expected {
        return true;
    }
    
    // Handle nullable types
    if expected.starts_with("Nullable(") {
        let inner_expected = expected
            .strip_prefix("Nullable(")
            .and_then(|s| s.strip_suffix(")"))
            .unwrap_or(expected);
        
        // Check if actual is nullable version
        if actual.starts_with("Nullable(") {
            let inner_actual = actual
                .strip_prefix("Nullable(")
                .and_then(|s| s.strip_suffix(")"))
                .unwrap_or(actual);
            return is_type_compatible(inner_actual, inner_expected);
        }
        
        // Check if actual matches inner type (non-nullable to nullable is ok)
        return is_type_compatible(actual, inner_expected);
    }
    
    // Handle common type aliases
    match (actual, expected) {
        // String types
        ("String", "LowCardinality(String)") | ("LowCardinality(String)", "String") => true,
        
        // Integer types
        ("UInt32", "DateTime") | ("DateTime", "UInt32") => true,
        ("UInt16", "Int16") | ("Int16", "UInt16") => true,
        ("UInt32", "Int32") | ("Int32", "UInt32") => true,
        ("UInt64", "Int64") | ("Int64", "UInt64") => true,
        
        // Array types
        _ if actual.starts_with("Array(") && expected.starts_with("Array(") => {
            let inner_actual = actual
                .strip_prefix("Array(")
                .and_then(|s| s.strip_suffix(")"))
                .unwrap_or("");
            let inner_expected = expected
                .strip_prefix("Array(")
                .and_then(|s| s.strip_suffix(")"))
                .unwrap_or("");
            is_type_compatible(inner_actual, inner_expected)
        }
        
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_type_compatibility() {
        // Direct matches
        assert!(is_type_compatible("String", "String"));
        assert!(is_type_compatible("UInt32", "UInt32"));
        
        // Nullable types
        assert!(is_type_compatible("Nullable(String)", "Nullable(String)"));
        assert!(is_type_compatible("String", "Nullable(String)"));
        assert!(is_type_compatible("Nullable(UInt16)", "Nullable(UInt16)"));
        
        // Type aliases
        assert!(is_type_compatible("String", "LowCardinality(String)"));
        assert!(is_type_compatible("UInt32", "DateTime"));
        assert!(is_type_compatible("DateTime", "UInt32"));
        
        // Array types
        assert!(is_type_compatible("Array(String)", "Array(String)"));
        assert!(is_type_compatible("Array(LowCardinality(String))", "Array(String)"));
        
        // Incompatible types
        assert!(!is_type_compatible("String", "UInt32"));
        assert!(!is_type_compatible("Array(String)", "String"));
    }
    
    #[test]
    fn test_expected_schema_consistency() {
        // Ensure all expected columns have valid names
        for (name, type_name, _) in EXPECTED_SCHEMA {
            assert!(!name.is_empty(), "Column name cannot be empty");
            assert!(!type_name.is_empty(), "Type name cannot be empty");
            assert!(name.chars().all(|c| c.is_alphanumeric() || c == '_'), 
                   "Column name '{}' contains invalid characters", name);
        }
        
        // Ensure no duplicate column names
        let mut names = std::collections::HashSet::new();
        for (name, _, _) in EXPECTED_SCHEMA {
            assert!(names.insert(name), "Duplicate column name: {}", name);
        }
    }
}