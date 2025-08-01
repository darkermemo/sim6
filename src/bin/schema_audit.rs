//! ClickHouse ⇄ Rust Struct Alignment & Auto-Migration Tool
//!
//! This tool automatically detects schema mismatches between ClickHouse database
//! and Rust structs, then generates safe DDL migrations to align them.

use anyhow::{Context, Result};
use clickhouse::Client;
use quote::quote;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;

use syn::{Attribute, Fields, Meta};
use thiserror::Error;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ColumnMeta {
    table: String,
    name: String,
    r#type: String,
    default_kind: String,
    codec: Option<String>,
}

#[derive(Debug, Clone)]
struct RustField {
    name: String,
    rust_type: String,
    serde_name: Option<String>,
    skip: bool,
}

#[derive(Debug, Clone)]
struct SchemaDiff {
    table: String,
    missing_in_db: Vec<RustField>,
    extra_in_db: Vec<ColumnMeta>,
    type_mismatches: Vec<(RustField, ColumnMeta)>,
}

#[derive(Error, Debug)]
pub enum SchemaAuditError {
    #[error("Missing environment variable: {0}")]
    MissingEnvVar(String),
    #[error("ClickHouse connection failed: {0}")]
    ConnectionFailed(String),
    #[error("Schema discovery failed: {0}")]
    SchemaDiscoveryFailed(String),
    #[error("Rust parsing failed: {0}")]
    RustParsingFailed(String),
    #[error("Migration generation failed: {0}")]
    MigrationFailed(String),
}

/// Configuration for ClickHouse connection
#[derive(Debug)]
struct Config {
    database: String,
    host: String,
    port: u16,
    user: String,
    password: String,
    secure: bool,
}

impl Config {
    /// Load configuration from environment variables
    fn from_env() -> Result<Self, SchemaAuditError> {
        let database = env::var("CLICKHOUSE_DB").unwrap_or_else(|_| "siem_prod".to_string());
        let host = env::var("CLICKHOUSE_HOST")
            .map_err(|_| SchemaAuditError::MissingEnvVar("CLICKHOUSE_HOST".to_string()))?;
        let port = env::var("CLICKHOUSE_PORT")
            .map_err(|_| SchemaAuditError::MissingEnvVar("CLICKHOUSE_PORT".to_string()))?
            .parse::<u16>()
            .context("Invalid CLICKHOUSE_PORT")
            .map_err(|e| SchemaAuditError::MissingEnvVar(format!("CLICKHOUSE_PORT: {}", e)))?;
        let user = env::var("CLICKHOUSE_USER").unwrap_or_else(|_| "default".to_string());
        let password = env::var("CLICKHOUSE_PASS").unwrap_or_else(|_| "".to_string());
        let secure = env::var("CLICKHOUSE_SECURE")
            .unwrap_or_else(|_| "false".to_string())
            .parse::<bool>()
            .unwrap_or(false);

        Ok(Config {
            database,
            host,
            port,
            user,
            password,
            secure,
        })
    }

    /// Create ClickHouse client with proper configuration
    fn create_client(&self) -> Result<Client, SchemaAuditError> {
        let protocol = if self.secure { "https" } else { "http" };
        let url = format!("{}://{}:{}", protocol, self.host, self.port);

        let mut client = Client::default()
            .with_url(url)
            .with_user(&self.user)
            .with_password(&self.password)
            .with_database(&self.database)
            .with_compression(clickhouse::Compression::Lz4);

        if self.secure {
            // Enable TLS verification
            client = client.with_option("secure", "1");
        }

        Ok(client)
    }
}

/// Discover database schema from ClickHouse system tables
async fn discover_db_schema(
    client: &Client,
    database: &str,
) -> Result<Vec<ColumnMeta>, SchemaAuditError> {
    let query = format!(
        "SELECT table, name, type, default_kind, '' as codec 
         FROM system.columns 
         WHERE database = '{}' 
         AND (table LIKE 'events_%' OR table = 'alerts')
         ORDER BY table, position",
        database
    );

    let rows = client
        .query(&query)
        .fetch_all::<(String, String, String, String, String)>()
        .await
        .map_err(|e| SchemaAuditError::SchemaDiscoveryFailed(e.to_string()))?;

    let columns = rows
        .into_iter()
        .map(|(table, name, r#type, default_kind, codec)| ColumnMeta {
            table,
            name,
            r#type,
            default_kind,
            codec: if codec.is_empty() { None } else { Some(codec) },
        })
        .collect();

    Ok(columns)
}

/// Parse Rust structs from source files
fn parse_rust_structs() -> Result<HashMap<String, HashMap<String, RustField>>, SchemaAuditError> {
    let mut structs = HashMap::new();

    // Scan src/models/**/*.rs files
    for entry in WalkDir::new("src/models")
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "rs"))
    {
        let content = fs::read_to_string(entry.path()).map_err(|e| {
            SchemaAuditError::RustParsingFailed(format!(
                "Failed to read {}: {}",
                entry.path().display(),
                e
            ))
        })?;

        let syntax_tree = syn::parse_file(&content).map_err(|e| {
            SchemaAuditError::RustParsingFailed(format!(
                "Failed to parse {}: {}",
                entry.path().display(),
                e
            ))
        })?;

        for item in syntax_tree.items {
            if let syn::Item::Struct(item_struct) = item {
                if has_serde_derive(&item_struct.attrs) {
                    let struct_name = item_struct.ident.to_string();
                    let fields = parse_struct_fields(&item_struct.fields)?;
                    structs.insert(struct_name, fields);
                }
            }
        }
    }

    Ok(structs)
}

/// Check if struct has Serialize/Deserialize derive
fn has_serde_derive(attrs: &[Attribute]) -> bool {
    attrs.iter().any(|attr| {
        if attr.path().is_ident("derive") {
            if let Meta::List(meta_list) = &attr.meta {
                return meta_list.tokens.to_string().contains("Serialize")
                    || meta_list.tokens.to_string().contains("Deserialize");
            }
        }
        false
    })
}

/// Parse fields from a struct
fn parse_struct_fields(fields: &Fields) -> Result<HashMap<String, RustField>, SchemaAuditError> {
    let mut field_map = HashMap::new();

    match fields {
        Fields::Named(fields_named) => {
            for field in &fields_named.named {
                if let Some(ident) = &field.ident {
                    let field_name = ident.to_string();
                    let rust_type = quote!(#field.ty).to_string();

                    let (serde_name, skip) = parse_serde_attrs(&field.attrs);

                    let rust_field = RustField {
                        name: field_name.clone(),
                        rust_type,
                        serde_name,
                        skip,
                    };

                    field_map.insert(field_name, rust_field);
                }
            }
        }
        _ => {} // Skip tuple structs and unit structs
    }

    Ok(field_map)
}

/// Parse serde attributes from field
fn parse_serde_attrs(attrs: &[Attribute]) -> (Option<String>, bool) {
    let mut serde_name = None;
    let mut skip = false;

    for attr in attrs {
        if attr.path().is_ident("serde") {
            if let Meta::List(meta_list) = &attr.meta {
                let tokens_str = meta_list.tokens.to_string();

                // Parse rename attribute
                if let Some(start) = tokens_str.find("rename = \"") {
                    let start_quote = start + 10; // Length of "rename = \""
                    if let Some(end_quote) = tokens_str[start_quote..].find('\"') {
                        serde_name =
                            Some(tokens_str[start_quote..start_quote + end_quote].to_string());
                    }
                }

                // Check for skip attribute
                if tokens_str.contains("skip") {
                    skip = true;
                }
            }
        }
    }

    (serde_name, skip)
}

/// Convert ClickHouse type to Rust type for comparison
fn convert_clickhouse_to_rust(ch_type: &str) -> String {
    match ch_type {
        "String" => "String".to_string(),
        "UInt32" => "u32".to_string(),
        "UInt64" => "u64".to_string(),
        "Int32" => "i32".to_string(),
        "Int64" => "i64".to_string(),
        "Float32" => "f32".to_string(),
        "Float64" => "f64".to_string(),
        "UUID" => "Uuid".to_string(),
        "DateTime" => "DateTime<Utc>".to_string(),
        "Date" => "NaiveDate".to_string(),
        t if t.starts_with("Nullable(") => {
            let inner = &t[9..t.len() - 1];
            format!("Option<{}>", convert_clickhouse_to_rust(inner))
        }
        t if t.starts_with("Array(") => {
            let inner = &t[6..t.len() - 1];
            format!("Vec<{}>", convert_clickhouse_to_rust(inner))
        }
        _ => ch_type.to_string(), // Fallback to original type
    }
}

/// Convert Rust type to ClickHouse type for DDL generation
fn convert_rust_to_clickhouse(rust_type: &str) -> String {
    match rust_type {
        "String" => "String".to_string(),
        "u32" => "UInt32".to_string(),
        "u64" => "UInt64".to_string(),
        "i32" => "Int32".to_string(),
        "i64" => "Int64".to_string(),
        "f32" => "Float32".to_string(),
        "f64" => "Float64".to_string(),
        "Uuid" => "UUID".to_string(),
        "DateTime<Utc>" => "DateTime".to_string(),
        "NaiveDate" => "Date".to_string(),
        t if t.starts_with("Option<") => {
            let inner = &t[7..t.len() - 1];
            format!("Nullable({})", convert_rust_to_clickhouse(inner))
        }
        t if t.starts_with("Vec<") => {
            let inner = &t[4..t.len() - 1];
            format!("Array({})", convert_rust_to_clickhouse(inner))
        }
        _ => "String".to_string(), // Default fallback
    }
}

/// Perform schema diff algorithm
fn compute_schema_diff(
    db_columns: &[ColumnMeta],
    rust_structs: &HashMap<String, HashMap<String, RustField>>,
) -> Result<Vec<SchemaDiff>, SchemaAuditError> {
    let mut diffs = Vec::new();

    // Group database columns by table
    let mut db_by_table: HashMap<String, Vec<&ColumnMeta>> = HashMap::new();
    for col in db_columns {
        db_by_table.entry(col.table.clone()).or_default().push(col);
    }

    // Map table names to struct names
    let table_to_struct = |table: &str| -> Option<&str> {
        if table.starts_with("events_") {
            Some("Event")
        } else if table == "alerts" {
            Some("Alert")
        } else {
            None
        }
    };

    // Process each table
    for (table, db_cols) in &db_by_table {
        if let Some(struct_name) = table_to_struct(table) {
            if let Some(rust_fields) = rust_structs.get(struct_name) {
                let mut missing_in_db = Vec::new();
                let mut extra_in_db = Vec::new();
                let mut type_mismatches = Vec::new();

                // Create maps for easier lookup
                let db_col_map: HashMap<String, &ColumnMeta> =
                    db_cols.iter().map(|col| (col.name.clone(), *col)).collect();

                // Check for missing fields in DB
                for (field_name, rust_field) in rust_fields {
                    if rust_field.skip {
                        continue;
                    }

                    let db_field_name = rust_field.serde_name.as_ref().unwrap_or(field_name);

                    if let Some(db_col) = db_col_map.get(db_field_name) {
                        // Check for type mismatches
                        let expected_rust_type = convert_clickhouse_to_rust(&db_col.r#type);
                        if expected_rust_type != rust_field.rust_type {
                            type_mismatches.push((rust_field.clone(), (*db_col).clone()));
                        }
                    } else {
                        missing_in_db.push(rust_field.clone());
                    }
                }

                // Check for extra fields in DB
                for db_col in db_cols {
                    let found_in_rust = rust_fields.values().any(|rf| {
                        let db_field_name = rf.serde_name.as_ref().unwrap_or(&rf.name);
                        db_field_name == &db_col.name
                    });

                    if !found_in_rust {
                        extra_in_db.push((*db_col).clone());
                    }
                }

                if !missing_in_db.is_empty()
                    || !extra_in_db.is_empty()
                    || !type_mismatches.is_empty()
                {
                    diffs.push(SchemaDiff {
                        table: table.clone(),
                        missing_in_db,
                        extra_in_db,
                        type_mismatches,
                    });
                }
            } else {
                return Err(SchemaAuditError::RustParsingFailed(format!(
                    "Missing struct mapping for table: {}",
                    table
                )));
            }
        }
    }

    Ok(diffs)
}

/// Generate DDL statements for schema differences
fn generate_ddl(diffs: &[SchemaDiff]) -> Vec<String> {
    let mut ddl_statements = Vec::new();

    for diff in diffs {
        // Add missing columns
        for field in &diff.missing_in_db {
            let db_field_name = field.serde_name.as_ref().unwrap_or(&field.name);
            let ch_type = convert_rust_to_clickhouse(&field.rust_type);
            let statement = format!(
                "ALTER TABLE {} ADD COLUMN {} {} CODEC(ZSTD(1));",
                diff.table, db_field_name, ch_type
            );
            ddl_statements.push(statement);
        }

        // Modify mismatched columns
        for (rust_field, _db_col) in &diff.type_mismatches {
            let db_field_name = rust_field.serde_name.as_ref().unwrap_or(&rust_field.name);
            let ch_type = convert_rust_to_clickhouse(&rust_field.rust_type);
            let statement = format!(
                "ALTER TABLE {} MODIFY COLUMN {} {};",
                diff.table, db_field_name, ch_type
            );
            ddl_statements.push(statement);
        }
    }

    ddl_statements
}

/// Generate migration file with timestamp
fn write_migration_file(ddl_statements: &[String]) -> Result<String, SchemaAuditError> {
    if ddl_statements.is_empty() {
        return Ok(String::new());
    }

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let filename = format!("migrations/auto_{}.sql", timestamp);

    // Ensure migrations directory exists
    fs::create_dir_all("migrations").map_err(|e| {
        SchemaAuditError::MigrationFailed(format!("Failed to create migrations directory: {}", e))
    })?;

    let content = ddl_statements.join("\n");
    fs::write(&filename, content).map_err(|e| {
        SchemaAuditError::MigrationFailed(format!("Failed to write migration file: {}", e))
    })?;

    Ok(filename)
}

/// Generate schema mismatch report
fn write_schema_report(diffs: &[SchemaDiff]) -> Result<(), SchemaAuditError> {
    let mut report = String::new();
    report.push_str("# Schema Mismatch Report\n\n");
    report.push_str("| Table | Column | Rust Type | DB Type | Action |\n");
    report.push_str("|-------|--------|-----------|---------|--------|\n");

    for diff in diffs {
        for field in &diff.missing_in_db {
            let db_field_name = field.serde_name.as_ref().unwrap_or(&field.name);
            let _ch_type = convert_rust_to_clickhouse(&field.rust_type);
            report.push_str(&format!(
                "| {} | {} | {} | - | ADD COLUMN |\n",
                diff.table, db_field_name, field.rust_type
            ));
        }

        for col in &diff.extra_in_db {
            report.push_str(&format!(
                "| {} | {} | - | {} | EXTRA (no action) |\n",
                diff.table, col.name, col.r#type
            ));
        }

        for (rust_field, db_col) in &diff.type_mismatches {
            let db_field_name = rust_field.serde_name.as_ref().unwrap_or(&rust_field.name);
            report.push_str(&format!(
                "| {} | {} | {} | {} | MODIFY COLUMN |\n",
                diff.table, db_field_name, rust_field.rust_type, db_col.r#type
            ));
        }
    }

    fs::write("schema_mismatch_report.md", report)
        .map_err(|e| SchemaAuditError::MigrationFailed(format!("Failed to write report: {}", e)))?;

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    // Load configuration
    let config = Config::from_env().context("Failed to load configuration from environment")?;

    // Create ClickHouse client
    let client = config
        .create_client()
        .context("Failed to create ClickHouse client")?;

    // Discover database schema
    let db_columns = discover_db_schema(&client, &config.database)
        .await
        .context("Failed to discover database schema")?;

    // Parse Rust structs
    let rust_structs = parse_rust_structs().context("Failed to parse Rust structs")?;

    // Compute schema differences
    let diffs = compute_schema_diff(&db_columns, &rust_structs)
        .context("Failed to compute schema differences")?;

    // Generate DDL and reports
    let ddl_statements = generate_ddl(&diffs);
    let migration_file =
        write_migration_file(&ddl_statements).context("Failed to write migration file")?;

    write_schema_report(&diffs).context("Failed to write schema report")?;

    // CI guard: fail if mismatches exist but no migration was created
    if !diffs.is_empty() && migration_file.is_empty() {
        anyhow::bail!("Schema mismatches detected but no migration file was created");
    }

    if !diffs.is_empty() {
        println!(
            "Schema mismatches detected. Migration file: {}",
            migration_file
        );
        println!("Report written to: schema_mismatch_report.md");
    } else {
        println!("No schema mismatches detected.");
    }

    println!("SCHEMA_AUDIT_COMPLETE");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clickhouse_to_rust_conversion() {
        assert_eq!(convert_clickhouse_to_rust("String"), "String");
        assert_eq!(convert_clickhouse_to_rust("UInt32"), "u32");
        assert_eq!(
            convert_clickhouse_to_rust("Nullable(String)"),
            "Option<String>"
        );
        assert_eq!(convert_clickhouse_to_rust("Array(UInt32)"), "Vec<u32>");
    }

    #[test]
    fn test_rust_to_clickhouse_conversion() {
        assert_eq!(convert_rust_to_clickhouse("String"), "String");
        assert_eq!(convert_rust_to_clickhouse("u32"), "UInt32");
        assert_eq!(
            convert_rust_to_clickhouse("Option<String>"),
            "Nullable(String)"
        );
        assert_eq!(convert_rust_to_clickhouse("Vec<u32>"), "Array(UInt32)");
    }
}
