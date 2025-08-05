//! Schema validation tool for SIEM system
//! Ensures Rust structs match ClickHouse table schemas

use serde_json::Value;
use std::collections::HashMap;
use std::env;

/// Schema validation errors
#[derive(Debug)]
enum SchemaError {
    MissingColumn(String),
    TypeMismatch(String, String, String), // column, expected, actual
    #[allow(dead_code)]
    ExtraColumn(String),
    ConnectionError(String),
    ParseError(String),
}

impl std::fmt::Display for SchemaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SchemaError::MissingColumn(col) => write!(f, "Missing required column: {}", col),
            SchemaError::TypeMismatch(col, expected, actual) => {
                write!(
                    f,
                    "Type mismatch for column '{}': expected {}, got {}",
                    col, expected, actual
                )
            }
            SchemaError::ExtraColumn(col) => write!(f, "Unexpected column in database: {}", col),
            SchemaError::ConnectionError(msg) => write!(f, "Connection error: {}", msg),
            SchemaError::ParseError(msg) => write!(f, "Parse error: {}", msg),
        }
    }
}

impl std::error::Error for SchemaError {}

/// Column definition for schema validation
#[derive(Debug, Clone)]
struct ColumnDef {
    name: String,
    #[allow(dead_code)]
    rust_type: String,
    clickhouse_type: String,
    #[allow(dead_code)]
    nullable: bool,
    required: bool,
}

/// Schema validator for SIEM tables
struct SchemaValidator {
    clickhouse_url: String,
    database_name: String,
}

impl SchemaValidator {
    fn new(clickhouse_url: String) -> Self {
        let database_name = env::var("CLICKHOUSE_DB").unwrap_or_else(|_| "dev".to_string());
        Self {
            clickhouse_url,
            database_name,
        }
    }

    #[allow(dead_code)]
    fn new_with_db(clickhouse_url: String, database_name: String) -> Self {
        Self {
            clickhouse_url,
            database_name,
        }
    }

    /// Validate all SIEM table schemas
    async fn validate_all_schemas(&self) -> Result<(), Vec<SchemaError>> {
        let mut errors = Vec::new();

        // Validate alerts table
        if let Err(mut alert_errors) = self.validate_alerts_schema().await {
            errors.append(&mut alert_errors);
        }

        // Validate alert_notes table
        if let Err(mut note_errors) = self.validate_alert_notes_schema().await {
            errors.append(&mut note_errors);
        }

        // Validate events table (if exists)
        if let Err(mut event_errors) = self.validate_events_schema().await {
            errors.append(&mut event_errors);
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    /// Validate alerts table schema against Rust structs
    async fn validate_alerts_schema(&self) -> Result<(), Vec<SchemaError>> {
        let expected_columns = vec![
            ColumnDef {
                name: "alert_id".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "tenant_id".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "rule_id".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "rule_name".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "event_id".to_string(),
                rust_type: "Option<String>".to_string(),
                clickhouse_type: "Nullable(String)".to_string(),
                nullable: true,
                required: true,
            },
            ColumnDef {
                name: "alert_timestamp".to_string(),
                rust_type: "u32".to_string(),
                clickhouse_type: "UInt32".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "severity".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "status".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "created_at".to_string(),
                rust_type: "u32".to_string(),
                clickhouse_type: "UInt32".to_string(),
                nullable: false,
                required: true,
            },
            // Additional columns that may exist in ClickHouse but not in Rust structs
            ColumnDef {
                name: "timestamp".to_string(),
                rust_type: "DateTime<Utc>".to_string(),
                clickhouse_type: "DateTime".to_string(),
                nullable: false,
                required: false, // Optional in Rust structs
            },
            ColumnDef {
                name: "src_ip".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: false,
            },
            ColumnDef {
                name: "dest_ip".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: false,
            },
            ColumnDef {
                name: "raw".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: false,
            },
        ];

        let table_name = format!("{}.alerts", &self.database_name);
        self.validate_table_schema(&table_name, expected_columns)
            .await
    }

    /// Validate alert_notes table schema
    async fn validate_alert_notes_schema(&self) -> Result<(), Vec<SchemaError>> {
        let expected_columns = vec![
            ColumnDef {
                name: "note_id".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "alert_id".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "tenant_id".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "author".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "content".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "created_at".to_string(),
                rust_type: "u32".to_string(),
                clickhouse_type: "UInt32".to_string(),
                nullable: false,
                required: true,
            },
        ];

        let table_name = format!("{}.alert_notes", &self.database_name);
        self.validate_table_schema(&table_name, expected_columns)
            .await
    }

    /// Validate events table schema (if it exists)
    async fn validate_events_schema(&self) -> Result<(), Vec<SchemaError>> {
        // Check if events table exists first
        let table_name = format!("{}.events", &self.database_name);
        let table_exists = self.check_table_exists(&table_name).await?;
        if !table_exists {
            println!("ℹ️  Events table does not exist, skipping validation");
            return Ok(());
        }

        let expected_columns = vec![
            ColumnDef {
                name: "event_id".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "tenant_id".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "raw_event".to_string(),
                rust_type: "String".to_string(),
                clickhouse_type: "String".to_string(),
                nullable: false,
                required: true,
            },
            ColumnDef {
                name: "source_ip".to_string(),
                rust_type: "Option<String>".to_string(),
                clickhouse_type: "Nullable(String)".to_string(),
                nullable: true,
                required: false,
            },
        ];

        let table_name = format!("{}.events", &self.database_name);
        self.validate_table_schema(&table_name, expected_columns)
            .await
    }

    /// Generic table schema validation
    async fn validate_table_schema(
        &self,
        table_name: &str,
        expected_columns: Vec<ColumnDef>,
    ) -> Result<(), Vec<SchemaError>> {
        let actual_schema = self.get_table_schema(table_name).await?;
        let mut errors = Vec::new();

        // Create lookup map for actual columns
        let actual_columns: HashMap<String, Value> = actual_schema
            .iter()
            .filter_map(|col| {
                let name = col.get("name")?.as_str()?.to_string();
                Some((name, col.clone()))
            })
            .collect();

        // Check for missing required columns
        for expected in &expected_columns {
            if expected.required && !actual_columns.contains_key(&expected.name) {
                errors.push(SchemaError::MissingColumn(expected.name.clone()));
                continue;
            }

            // Check type compatibility if column exists
            if let Some(actual_col) = actual_columns.get(&expected.name) {
                if let Some(actual_type) = actual_col.get("type").and_then(|t| t.as_str()) {
                    if !Self::types_compatible(&expected.clickhouse_type, actual_type) {
                        errors.push(SchemaError::TypeMismatch(
                            expected.name.clone(),
                            expected.clickhouse_type.clone(),
                            actual_type.to_string(),
                        ));
                    }
                }
            }
        }

        // Check for unexpected columns (optional warning)
        let expected_names: std::collections::HashSet<String> = expected_columns
            .iter()
            .map(|col| col.name.clone())
            .collect();

        for actual_name in actual_columns.keys() {
            if !expected_names.contains(actual_name) {
                // This is just a warning, not an error
                println!(
                    "⚠️  Unexpected column '{}' in table {}",
                    actual_name, table_name
                );
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    /// Check if table exists
    async fn check_table_exists(&self, table_name: &str) -> Result<bool, Vec<SchemaError>> {
        let client = reqwest::Client::new();
        let query = format!("EXISTS TABLE {}", table_name);

        let response = client
            .post(&self.clickhouse_url)
            .body(query)
            .send()
            .await
            .map_err(|e| vec![SchemaError::ConnectionError(e.to_string())])?;

        if !response.status().is_success() {
            return Err(vec![SchemaError::ConnectionError(format!(
                "Failed to check table existence: {}",
                response.status()
            ))]);
        }

        let result = response
            .text()
            .await
            .map_err(|e| vec![SchemaError::ParseError(e.to_string())])?;

        Ok(result.trim() == "1")
    }

    /// Get table schema from ClickHouse
    async fn get_table_schema(&self, table_name: &str) -> Result<Vec<Value>, Vec<SchemaError>> {
        let client = reqwest::Client::new();
        let query = format!("DESCRIBE TABLE {} FORMAT JSON", table_name);

        let response = client
            .post(&self.clickhouse_url)
            .body(query)
            .send()
            .await
            .map_err(|e| vec![SchemaError::ConnectionError(e.to_string())])?;

        if !response.status().is_success() {
            return Err(vec![SchemaError::ConnectionError(format!(
                "Failed to describe table {}: {}",
                table_name,
                response.status()
            ))]);
        }

        let schema_response: Value = response
            .json()
            .await
            .map_err(|e| vec![SchemaError::ParseError(e.to_string())])?;

        let data = schema_response
            .get("data")
            .and_then(|d| d.as_array())
            .ok_or_else(|| {
                vec![SchemaError::ParseError(
                    "Invalid schema response format".to_string(),
                )]
            })?;

        Ok(data.clone())
    }

    /// Check if ClickHouse type is compatible with expected type
    fn types_compatible(expected: &str, actual: &str) -> bool {
        // Handle exact matches
        if expected == actual {
            return true;
        }

        // Handle nullable types
        if expected.starts_with("Nullable(") && actual.starts_with("Nullable(") {
            let expected_inner = expected
                .trim_start_matches("Nullable(")
                .trim_end_matches(")");
            let actual_inner = actual.trim_start_matches("Nullable(").trim_end_matches(")");
            return Self::types_compatible(expected_inner, actual_inner);
        }

        // Handle common type aliases
        match (expected, actual) {
            ("String", "String") => true,
            ("UInt32", "UInt32") => true,
            ("DateTime", "DateTime") => true,
            ("DateTime", "DateTime64(3)") => true, // DateTime64 is compatible with DateTime
            _ => false,
        }
    }
}

/// Generate schema migration SQL if needed
struct SchemaMigrator {
    #[allow(dead_code)]
    clickhouse_url: String,
}

impl SchemaMigrator {
    fn new(clickhouse_url: String) -> Self {
        Self { clickhouse_url }
    }

    /// Generate ALTER TABLE statements to fix schema mismatches
    async fn generate_migration_sql(&self, errors: &[SchemaError]) -> Vec<String> {
        let mut migrations = Vec::new();

        for error in errors {
            match error {
                SchemaError::MissingColumn(col) => {
                    // Generate ADD COLUMN statement based on column name
                    let sql = self.generate_add_column_sql(col);
                    if let Some(sql) = sql {
                        migrations.push(sql);
                    }
                }
                SchemaError::TypeMismatch(col, expected, _actual) => {
                    // Generate MODIFY COLUMN statement
                    let sql = format!("ALTER TABLE dev.alerts MODIFY COLUMN {} {}", col, expected);
                    migrations.push(sql);
                }
                _ => {} // Skip other error types
            }
        }

        migrations
    }

    /// Generate ADD COLUMN SQL for missing columns
    fn generate_add_column_sql(&self, column_name: &str) -> Option<String> {
        let (column_type, default_value) = match column_name {
            "event_id" => ("Nullable(String)", "NULL"),
            "alert_timestamp" => ("UInt32", "0"),
            "severity" => ("String", "'medium'"),
            "status" => ("String", "'open'"),
            "rule_name" => ("String", "''"),
            "created_at" => ("UInt32", "0"),
            _ => return None,
        };

        Some(format!(
            "ALTER TABLE dev.alerts ADD COLUMN IF NOT EXISTS {} {} DEFAULT {}",
            column_name, column_type, default_value
        ))
    }
}

/// Main validation function
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🔍 SIEM Schema Validation Tool");
    println!("==============================");

    let clickhouse_url =
        std::env::var("CLICKHOUSE_URL").unwrap_or_else(|_| "http://localhost:8123".to_string());

    let validator = SchemaValidator::new(clickhouse_url.clone());
    let migrator = SchemaMigrator::new(clickhouse_url);

    println!("📊 Validating all table schemas...");

    match validator.validate_all_schemas().await {
        Ok(()) => {
            println!("✅ All schemas are valid!");
            println!("🎉 Schema validation completed successfully");
        }
        Err(errors) => {
            println!("❌ Schema validation failed with {} errors:", errors.len());

            for (i, error) in errors.iter().enumerate() {
                println!("  {}. {}", i + 1, error);
            }

            println!("\n🔧 Generating migration SQL...");
            let migrations = migrator.generate_migration_sql(&errors).await;

            if !migrations.is_empty() {
                println!("\n📝 Suggested migration SQL:");
                println!("=============================");
                for (i, sql) in migrations.iter().enumerate() {
                    println!("-- Migration {}", i + 1);
                    println!("{};\n", sql);
                }

                println!("💡 Run these SQL statements against your ClickHouse instance to fix schema issues.");
            } else {
                println!("⚠️  No automatic migrations available for these errors.");
            }

            std::process::exit(1);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_type_compatibility() {
        let _validator = SchemaValidator::new("http://localhost:8123".to_string());

        assert!(SchemaValidator::types_compatible("String", "String"));
        assert!(SchemaValidator::types_compatible("UInt32", "UInt32"));
        assert!(SchemaValidator::types_compatible("Nullable(String)", "Nullable(String)"));
        assert!(SchemaValidator::types_compatible("DateTime", "DateTime64(3)"));
        assert!(!SchemaValidator::types_compatible("String", "UInt32"));
    }

    #[test]
    fn test_migration_sql_generation() {
        let migrator = SchemaMigrator::new("http://localhost:8123".to_string());

        let sql = migrator.generate_add_column_sql("event_id");
        assert!(sql.is_some());
        assert!(sql.unwrap().contains("Nullable(String)"));

        let sql = migrator.generate_add_column_sql("unknown_column");
        assert!(sql.is_none());
    }
}
