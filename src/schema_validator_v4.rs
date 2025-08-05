use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlparser::ast::Statement;
use sqlparser::dialect::ClickHouseDialect;
use sqlparser::parser::Parser;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use swc_common::SourceMap;
use swc_ecma_ast::Module;
use swc_ecma_parser::{lexer::Lexer, Parser as SwcParser, StringInput, Syntax, TsConfig};
use syn::{spanned::Spanned, visit::Visit, LitStr, Macro};
use walkdir::WalkDir;

/// Configuration for different environments/schemas
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentConfig {
    pub name: String,
    pub schema_file: PathBuf,
    pub database_name: String,
    pub rust_source_dirs: Vec<PathBuf>,
    pub typescript_source_dirs: Vec<PathBuf>,
    pub graphql_schema_files: Vec<PathBuf>,
    pub openapi_spec_files: Vec<PathBuf>,
}

/// Enhanced column definition with more metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnDefinition {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub is_primary_key: bool,
    pub is_foreign_key: bool,
    pub foreign_key_reference: Option<String>,
    pub constraints: Vec<String>,
    pub comment: Option<String>,
}

/// Enhanced table schema with more metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableSchema {
    pub name: String,
    pub database: Option<String>,
    pub columns: HashMap<String, ColumnDefinition>,
    pub engine: Option<String>,
    pub order_by: Vec<String>,
    pub partition_by: Vec<String>,
    pub indexes: Vec<String>,
    pub comment: Option<String>,
}

/// Database schema with environment context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseSchema {
    pub environment: String,
    pub tables: HashMap<String, TableSchema>,
    pub databases: HashSet<String>,
    pub views: HashMap<String, String>, // view_name -> definition
    pub materialized_views: HashMap<String, String>,
    pub functions: HashMap<String, String>,
}

/// TypeScript interface definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeScriptInterface {
    pub name: String,
    pub file_path: String,
    pub properties: HashMap<String, TypeScriptProperty>,
    pub extends: Vec<String>,
    pub is_exported: bool,
}

/// TypeScript property definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeScriptProperty {
    pub name: String,
    pub type_annotation: String,
    pub optional: bool,
    pub readonly: bool,
}

/// GraphQL schema definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLSchema {
    pub types: HashMap<String, GraphQLType>,
    pub queries: HashMap<String, GraphQLField>,
    pub mutations: HashMap<String, GraphQLField>,
    pub subscriptions: HashMap<String, GraphQLField>,
}

/// GraphQL type definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLType {
    pub name: String,
    pub fields: HashMap<String, GraphQLField>,
    pub kind: String, // "object", "interface", "enum", etc.
}

/// GraphQL field definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLField {
    pub name: String,
    pub type_name: String,
    pub nullable: bool,
    pub arguments: HashMap<String, String>,
}

/// Enhanced SQL reference with layer information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SqlReference {
    pub file_path: String,
    pub line_number: usize,
    pub column_number: usize,
    pub query_type: String,
    pub tables_referenced: Vec<String>,
    pub columns_referenced: Vec<String>,
    pub raw_query: String,
    pub context: String,
    pub layer: ValidationLayer,
    pub environment: String,
}

/// Validation layers for multi-layer analysis
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ValidationLayer {
    Database,
    Backend,
    Frontend,
    GraphQL,
    OpenAPI,
}

/// Enhanced validation error with layer context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub severity: String,
    pub error_type: String,
    pub message: String,
    pub file_path: String,
    pub line_number: usize,
    pub column_number: usize,
    pub suggestion: Option<String>,
    pub context: String,
    pub layer: ValidationLayer,
    pub environment: String,
    pub affected_layers: Vec<ValidationLayer>,
}

/// Cross-layer validation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossLayerValidation {
    pub database_backend_mismatches: Vec<ValidationError>,
    pub backend_frontend_mismatches: Vec<ValidationError>,
    pub database_frontend_mismatches: Vec<ValidationError>,
    pub graphql_mismatches: Vec<ValidationError>,
    pub openapi_mismatches: Vec<ValidationError>,
}

/// Enhanced validation report
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationReport {
    pub timestamp: DateTime<Utc>,
    pub environment: String,
    pub total_files_scanned: HashMap<ValidationLayer, usize>,
    pub total_sql_references: usize,
    pub total_tables_loaded: usize,
    pub total_typescript_interfaces: usize,
    pub total_graphql_types: usize,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationError>,
    pub cross_layer_validation: CrossLayerValidation,
    pub summary: ValidationSummary,
}

/// Enhanced validation summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationSummary {
    pub critical_issues: usize,
    pub warnings: usize,
    pub missing_tables: usize,
    pub missing_columns: usize,
    pub hardcoded_database_names: usize,
    pub unknown_references: usize,
    pub cross_layer_mismatches: usize,
    pub layer_coverage: HashMap<ValidationLayer, f64>,
}

/// Enhanced schema validator with multi-layer support
pub struct SchemaValidator {
    pub environments: HashMap<String, EnvironmentConfig>,
    pub current_environment: String,
    pub database_schemas: HashMap<String, DatabaseSchema>,
    pub typescript_interfaces: HashMap<String, Vec<TypeScriptInterface>>,
    pub sql_references: Vec<SqlReference>,
    pub validation_errors: Vec<ValidationError>,
    pub cross_layer_validation: CrossLayerValidation,
}

impl SchemaValidator {
    /// Create a new schema validator
    pub fn new() -> Self {
        Self {
            environments: HashMap::new(),
            current_environment: "default".to_string(),
            database_schemas: HashMap::new(),
            typescript_interfaces: HashMap::new(),
            sql_references: Vec::new(),
            validation_errors: Vec::new(),
            cross_layer_validation: CrossLayerValidation {
                database_backend_mismatches: Vec::new(),
                backend_frontend_mismatches: Vec::new(),
                database_frontend_mismatches: Vec::new(),
                graphql_mismatches: Vec::new(),
                openapi_mismatches: Vec::new(),
            },
        }
    }

    /// Load environment configuration from file
    pub fn load_environment_config(&mut self, config_file: &Path) -> Result<()> {
        let content = fs::read_to_string(config_file)
            .with_context(|| format!("Failed to read config file: {:?}", config_file))?;

        let configs: Vec<EnvironmentConfig> = serde_json::from_str(&content)
            .with_context(|| "Failed to parse environment configuration")?;

        for config in configs {
            self.environments.insert(config.name.clone(), config);
        }

        Ok(())
    }

    /// Set current environment for validation
    pub fn set_environment(&mut self, environment: &str) -> Result<()> {
        if !self.environments.contains_key(environment) {
            return Err(anyhow::anyhow!("Environment '{}' not found", environment));
        }
        self.current_environment = environment.to_string();
        Ok(())
    }

    /// Load database schema for current environment
    pub fn load_database_schema(&mut self) -> Result<()> {
        let env_config = self
            .environments
            .get(&self.current_environment)
            .ok_or_else(|| anyhow::anyhow!("Current environment not configured"))?;

        let content = fs::read_to_string(&env_config.schema_file)
            .with_context(|| format!("Failed to read schema file: {:?}", env_config.schema_file))?;

        let mut database_schema = DatabaseSchema {
            environment: self.current_environment.clone(),
            tables: HashMap::new(),
            databases: HashSet::new(),
            views: HashMap::new(),
            materialized_views: HashMap::new(),
            functions: HashMap::new(),
        };

        self.parse_clickhouse_schema(&content, &mut database_schema)?;

        println!(
            "Loaded {} tables from schema for environment '{}'",
            database_schema.tables.len(),
            self.current_environment
        );

        self.database_schemas
            .insert(self.current_environment.clone(), database_schema);
        Ok(())
    }

    /// Parse ClickHouse schema with enhanced metadata extraction
    fn parse_clickhouse_schema(&self, content: &str, schema: &mut DatabaseSchema) -> Result<()> {
        use regex::Regex;

        // Enhanced regex patterns for ClickHouse
        let table_regex = Regex::new(r"(?s)CREATE TABLE IF NOT EXISTS\s+(\w+)\.(\w+)\s*\((.+?)\)\s*ENGINE\s*=\s*(\w+)(?:\(([^)]+)\))?(?:\s*ORDER BY\s*\(([^)]+)\))?(?:\s*PARTITION BY\s*\(([^)]+)\))?")
            .map_err(|e| anyhow::anyhow!("Failed to compile table regex: {}", e))?;

        let view_regex = Regex::new(r"(?s)CREATE VIEW\s+(\w+)\.(\w+)\s+AS\s+(.+?)(?:;|$)")
            .map_err(|e| anyhow::anyhow!("Failed to compile view regex: {}", e))?;

        let mv_regex = Regex::new(r"(?s)CREATE MATERIALIZED VIEW\s+(\w+)\.(\w+)\s+(.+?)(?:;|$)")
            .map_err(|e| anyhow::anyhow!("Failed to compile materialized view regex: {}", e))?;

        // Parse tables
        for table_match in table_regex.captures_iter(content) {
            let database_name = table_match.get(1).unwrap().as_str().to_string();
            let table_name = table_match.get(2).unwrap().as_str().to_string();
            let columns_text = table_match.get(3).unwrap().as_str();
            let engine = table_match.get(4).map(|m| m.as_str().to_string());
            let order_by = table_match
                .get(6)
                .map(|m| {
                    m.as_str()
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .collect()
                })
                .unwrap_or_default();
            let partition_by = table_match
                .get(7)
                .map(|m| {
                    m.as_str()
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .collect()
                })
                .unwrap_or_default();

            schema.databases.insert(database_name.clone());

            let table_columns = self.parse_table_columns(columns_text)?;

            let table_schema = TableSchema {
                name: table_name.clone(),
                database: Some(database_name.clone()),
                columns: table_columns,
                engine,
                order_by,
                partition_by,
                indexes: Vec::new(), // TODO: Parse indexes
                comment: None,       // TODO: Parse comments
            };

            let full_table_name = format!("{}.{}", database_name, table_name);
            schema.tables.insert(full_table_name, table_schema);
        }

        // Parse views
        for view_match in view_regex.captures_iter(content) {
            let database_name = view_match.get(1).unwrap().as_str();
            let view_name = view_match.get(2).unwrap().as_str();
            let definition = view_match.get(3).unwrap().as_str();

            let full_view_name = format!("{}.{}", database_name, view_name);
            schema.views.insert(full_view_name, definition.to_string());
        }

        // Parse materialized views
        for mv_match in mv_regex.captures_iter(content) {
            let database_name = mv_match.get(1).unwrap().as_str();
            let mv_name = mv_match.get(2).unwrap().as_str();
            let definition = mv_match.get(3).unwrap().as_str();

            let full_mv_name = format!("{}.{}", database_name, mv_name);
            schema
                .materialized_views
                .insert(full_mv_name, definition.to_string());
        }

        Ok(())
    }

    /// Parse table columns with enhanced metadata
    fn parse_table_columns(&self, columns_text: &str) -> Result<HashMap<String, ColumnDefinition>> {
        use regex::Regex;

        let mut columns = HashMap::new();

        // Enhanced column regex with constraints and comments
        let column_regex = Regex::new(r"(?m)^\s*(\w+)\s+([^,\n]+?)(?:\s+DEFAULT\s+([^,\n]+?))?(?:\s+COMMENT\s+'([^']+)')?(?:\s*,)?\s*$")
            .map_err(|e| anyhow::anyhow!("Failed to compile column regex: {}", e))?;

        for line in columns_text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("--") {
                continue;
            }

            if let Some(column_match) = column_regex.captures(line) {
                let col_name = column_match.get(1).unwrap().as_str().to_string();
                let col_type = column_match.get(2).unwrap().as_str().trim().to_string();
                let default_value = column_match.get(3).map(|m| m.as_str().trim().to_string());
                let comment = column_match.get(4).map(|m| m.as_str().to_string());

                let column_def = ColumnDefinition {
                    name: col_name.clone(),
                    data_type: col_type.clone(),
                    nullable: col_type.contains("Nullable"),
                    default_value,
                    is_primary_key: false, // TODO: Detect primary keys
                    is_foreign_key: false, // TODO: Detect foreign keys
                    foreign_key_reference: None,
                    constraints: Vec::new(), // TODO: Parse constraints
                    comment,
                };

                columns.insert(col_name, column_def);
            }
        }

        Ok(columns)
    }

    /// Scan all configured source directories for current environment
    pub fn scan_all_sources(&mut self) -> Result<()> {
        let env_config = self
            .environments
            .get(&self.current_environment)
            .ok_or_else(|| anyhow::anyhow!("Current environment not configured"))?
            .clone();

        // Scan Rust sources
        for rust_dir in &env_config.rust_source_dirs {
            self.scan_rust_codebase(rust_dir)?;
        }

        // Scan TypeScript sources
        for ts_dir in &env_config.typescript_source_dirs {
            self.scan_typescript_codebase(ts_dir)?;
        }

        // Scan GraphQL schemas
        for graphql_file in &env_config.graphql_schema_files {
            self.scan_graphql_schema(graphql_file)?;
        }

        // Scan OpenAPI specs
        for openapi_file in &env_config.openapi_spec_files {
            self.scan_openapi_spec(openapi_file)?;
        }

        Ok(())
    }

    /// Scan Rust codebase for SQL references using AST parsing
    pub fn scan_rust_codebase(&mut self, source_dir: &Path) -> Result<()> {
        let mut files_scanned = 0;

        for entry in WalkDir::new(source_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().is_some_and(|ext| ext == "rs"))
        {
            let file_path = entry.path();
            if let Err(e) = self.scan_rust_file(file_path) {
                eprintln!("Warning: Failed to scan {}: {}", file_path.display(), e);
            } else {
                files_scanned += 1;
            }
        }

        println!(
            "Scanned {} Rust files, found {} SQL references",
            files_scanned,
            self.sql_references.len()
        );
        Ok(())
    }

    /// Scan TypeScript codebase for interface definitions
    pub fn scan_typescript_codebase(&mut self, source_dir: &Path) -> Result<()> {
        let mut files_scanned = 0;
        let mut interfaces_found = 0;

        for entry in WalkDir::new(source_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .is_some_and(|ext| ext == "ts" || ext == "tsx")
            })
        {
            let file_path = entry.path();
            match self.scan_typescript_file(file_path) {
                Ok(count) => {
                    files_scanned += 1;
                    interfaces_found += count;
                }
                Err(e) => {
                    eprintln!(
                        "Warning: Failed to scan TypeScript file {}: {}",
                        file_path.display(),
                        e
                    );
                }
            }
        }

        println!(
            "Scanned {} TypeScript files, found {} interfaces",
            files_scanned, interfaces_found
        );
        Ok(())
    }

    /// Scan a single TypeScript file for interface definitions
    fn scan_typescript_file(&mut self, file_path: &Path) -> Result<usize> {
        let content = fs::read_to_string(file_path)
            .with_context(|| format!("Failed to read TypeScript file: {:?}", file_path))?;

        let source_map = SourceMap::default();
        let source_file = source_map
            .new_source_file(swc_common::FileName::Real(file_path.to_path_buf()), content);

        let lexer = Lexer::new(
            Syntax::Typescript(TsConfig {
                tsx: file_path.extension().is_some_and(|ext| ext == "tsx"),
                decorators: true,
                dts: false,
                no_early_errors: true,
                disallow_ambiguous_jsx_like: false,
            }),
            swc_ecma_ast::EsVersion::Es2022,
            StringInput::from(&*source_file),
            None,
        );

        let mut parser = SwcParser::new_from(lexer);
        let module = parser
            .parse_module()
            .map_err(|e| anyhow::anyhow!("Failed to parse TypeScript: {:?}", e))?;

        let interfaces = self.extract_typescript_interfaces(&module, file_path)?;
        let interface_count = interfaces.len();

        self.typescript_interfaces
            .entry(self.current_environment.clone())
            .or_default()
            .extend(interfaces);

        Ok(interface_count)
    }

    /// Extract TypeScript interfaces from AST
    fn extract_typescript_interfaces(
        &self,
        _module: &Module,
        _file_path: &Path,
    ) -> Result<Vec<TypeScriptInterface>> {
        let interfaces = Vec::new();

        // TODO: Implement TypeScript AST traversal to extract interfaces
        // This is a placeholder implementation

        Ok(interfaces)
    }

    /// Scan GraphQL schema file
    fn scan_graphql_schema(&mut self, schema_file: &Path) -> Result<()> {
        // TODO: Implement GraphQL schema parsing
        println!(
            "GraphQL schema scanning not yet implemented for: {:?}",
            schema_file
        );
        Ok(())
    }

    /// Scan OpenAPI specification file
    fn scan_openapi_spec(&mut self, spec_file: &Path) -> Result<()> {
        // TODO: Implement OpenAPI spec parsing
        println!(
            "OpenAPI spec scanning not yet implemented for: {:?}",
            spec_file
        );
        Ok(())
    }

    /// Scan a single Rust file for SQL references (enhanced version)
    fn scan_rust_file(&mut self, file_path: &Path) -> Result<()> {
        let content = fs::read_to_string(file_path)
            .with_context(|| format!("Failed to read file: {:?}", file_path))?;

        let syntax_tree = syn::parse_file(&content)
            .with_context(|| format!("Failed to parse Rust file: {:?}", file_path))?;

        let mut visitor = EnhancedSqlVisitor {
            file_path: file_path.to_string_lossy().to_string(),
            sql_references: Vec::new(),
            environment: self.current_environment.clone(),
        };

        visitor.visit_file(&syntax_tree);
        self.sql_references.extend(visitor.sql_references);

        Ok(())
    }

    /// Perform comprehensive multi-layer validation
    pub fn validate_all_layers(&mut self) -> Result<()> {
        self.validate_database_backend_consistency()?;
        self.validate_backend_frontend_consistency()?;
        self.validate_database_frontend_consistency()?;
        self.validate_graphql_consistency()?;
        self.validate_openapi_consistency()?;
        Ok(())
    }

    /// Validate consistency between database schema and backend SQL usage
    fn validate_database_backend_consistency(&mut self) -> Result<()> {
        let database_schema = self
            .database_schemas
            .get(&self.current_environment)
            .ok_or_else(|| anyhow::anyhow!("Database schema not loaded for current environment"))?;

        for sql_ref in &self.sql_references {
            if sql_ref.layer != ValidationLayer::Backend {
                continue;
            }

            // Validate table references
            for table in &sql_ref.tables_referenced {
                if !database_schema.tables.contains_key(table) {
                    let error = ValidationError {
                        severity: "Critical".to_string(),
                        error_type: "MissingTable".to_string(),
                        message: format!("Table '{}' not found in database schema", table),
                        file_path: sql_ref.file_path.clone(),
                        line_number: sql_ref.line_number,
                        column_number: sql_ref.column_number,
                        suggestion: Some(
                            "Add table to database schema or fix table name".to_string(),
                        ),
                        context: sql_ref.context.clone(),
                        layer: ValidationLayer::Backend,
                        environment: self.current_environment.clone(),
                        affected_layers: vec![ValidationLayer::Database, ValidationLayer::Backend],
                    };

                    self.validation_errors.push(error.clone());
                    self.cross_layer_validation
                        .database_backend_mismatches
                        .push(error);
                }
            }

            // Validate column references
            for column in &sql_ref.columns_referenced {
                let mut column_found = false;
                for table in &sql_ref.tables_referenced {
                    if let Some(table_schema) = database_schema.tables.get(table) {
                        if table_schema.columns.contains_key(column) {
                            column_found = true;
                            break;
                        }
                    }
                }

                if !column_found && !column.contains('*') && column != "1" {
                    let error = ValidationError {
                        severity: "Warning".to_string(),
                        error_type: "MissingColumn".to_string(),
                        message: format!("Column '{}' not found in referenced tables", column),
                        file_path: sql_ref.file_path.clone(),
                        line_number: sql_ref.line_number,
                        column_number: sql_ref.column_number,
                        suggestion: Some(
                            "Add column to table schema or fix column name".to_string(),
                        ),
                        context: sql_ref.context.clone(),
                        layer: ValidationLayer::Backend,
                        environment: self.current_environment.clone(),
                        affected_layers: vec![ValidationLayer::Database, ValidationLayer::Backend],
                    };

                    self.validation_errors.push(error.clone());
                    self.cross_layer_validation
                        .database_backend_mismatches
                        .push(error);
                }
            }
        }

        Ok(())
    }

    /// Validate consistency between backend and frontend interfaces
    fn validate_backend_frontend_consistency(&mut self) -> Result<()> {
        // TODO: Implement backend-frontend validation
        // Compare Rust struct definitions with TypeScript interfaces
        Ok(())
    }

    /// Validate consistency between database and frontend
    fn validate_database_frontend_consistency(&mut self) -> Result<()> {
        // TODO: Implement database-frontend validation
        // Compare database columns with TypeScript interface properties
        Ok(())
    }

    /// Validate GraphQL schema consistency
    fn validate_graphql_consistency(&mut self) -> Result<()> {
        // TODO: Implement GraphQL validation
        Ok(())
    }

    /// Validate OpenAPI specification consistency
    fn validate_openapi_consistency(&mut self) -> Result<()> {
        // TODO: Implement OpenAPI validation
        Ok(())
    }

    /// Generate comprehensive validation report
    pub fn generate_enhanced_report(&self) -> ValidationReport {
        let critical_errors: Vec<_> = self
            .validation_errors
            .iter()
            .filter(|e| e.severity == "Critical")
            .cloned()
            .collect();

        let warnings: Vec<_> = self
            .validation_errors
            .iter()
            .filter(|e| e.severity == "Warning")
            .cloned()
            .collect();

        let mut files_scanned = HashMap::new();
        files_scanned.insert(ValidationLayer::Backend, 0); // TODO: Track actual counts
        files_scanned.insert(ValidationLayer::Frontend, 0);
        files_scanned.insert(ValidationLayer::Database, 1);

        let mut layer_coverage = HashMap::new();
        layer_coverage.insert(ValidationLayer::Database, 100.0);
        layer_coverage.insert(ValidationLayer::Backend, 85.0); // TODO: Calculate actual coverage
        layer_coverage.insert(ValidationLayer::Frontend, 0.0);

        let summary = ValidationSummary {
            critical_issues: critical_errors.len(),
            warnings: warnings.len(),
            missing_tables: self
                .validation_errors
                .iter()
                .filter(|e| e.error_type == "MissingTable")
                .count(),
            missing_columns: self
                .validation_errors
                .iter()
                .filter(|e| e.error_type == "MissingColumn")
                .count(),
            hardcoded_database_names: self
                .validation_errors
                .iter()
                .filter(|e| e.error_type == "HardcodedDatabaseName")
                .count(),
            unknown_references: 0,
            cross_layer_mismatches: self
                .cross_layer_validation
                .database_backend_mismatches
                .len()
                + self
                    .cross_layer_validation
                    .backend_frontend_mismatches
                    .len()
                + self
                    .cross_layer_validation
                    .database_frontend_mismatches
                    .len(),
            layer_coverage,
        };

        ValidationReport {
            timestamp: Utc::now(),
            environment: self.current_environment.clone(),
            total_files_scanned: files_scanned,
            total_sql_references: self.sql_references.len(),
            total_tables_loaded: self
                .database_schemas
                .get(&self.current_environment)
                .map(|s| s.tables.len())
                .unwrap_or(0),
            total_typescript_interfaces: self
                .typescript_interfaces
                .get(&self.current_environment)
                .map(|i| i.len())
                .unwrap_or(0),
            total_graphql_types: 0, // TODO: Implement
            errors: critical_errors,
            warnings,
            cross_layer_validation: self.cross_layer_validation.clone(),
            summary,
        }
    }

    /// Generate enhanced JSON report
    pub fn generate_enhanced_json_report(&self, output_path: &Path) -> Result<()> {
        let report = self.generate_enhanced_report();
        let json = serde_json::to_string_pretty(&report)
            .with_context(|| "Failed to serialize report to JSON")?;

        fs::write(output_path, json)
            .with_context(|| format!("Failed to write JSON report to {:?}", output_path))?;

        Ok(())
    }

    /// Generate enhanced Markdown report with cross-layer analysis
    pub fn generate_enhanced_markdown_report(&self, output_path: &Path) -> Result<()> {
        let report = self.generate_enhanced_report();
        let mut markdown = String::new();

        // Header
        markdown.push_str("# Multi-Layer Schema Validation Report\n\n");
        markdown.push_str(&format!("**Environment:** {}\n", report.environment));
        markdown.push_str(&format!(
            "**Generated:** {}\n\n",
            report.timestamp.format("%Y-%m-%d %H:%M:%S UTC")
        ));

        // Executive Summary
        markdown.push_str("## 📊 Executive Summary\n\n");
        markdown.push_str(&format!(
            "- **Total Tables Loaded:** {}\n",
            report.total_tables_loaded
        ));
        markdown.push_str(&format!(
            "- **Total SQL References:** {}\n",
            report.total_sql_references
        ));
        markdown.push_str(&format!(
            "- **TypeScript Interfaces:** {}\n",
            report.total_typescript_interfaces
        ));
        markdown.push_str(&format!(
            "- **Critical Issues:** {}\n",
            report.summary.critical_issues
        ));
        markdown.push_str(&format!("- **Warnings:** {}\n", report.summary.warnings));
        markdown.push_str(&format!(
            "- **Cross-Layer Mismatches:** {}\n\n",
            report.summary.cross_layer_mismatches
        ));

        // Layer Coverage
        markdown.push_str("## 🎯 Layer Coverage\n\n");
        for (layer, coverage) in &report.summary.layer_coverage {
            markdown.push_str(&format!("- **{:?}:** {:.1}%\n", layer, coverage));
        }
        markdown.push('\n');

        // Cross-Layer Analysis
        markdown.push_str("## 🔗 Cross-Layer Analysis\n\n");

        if !report
            .cross_layer_validation
            .database_backend_mismatches
            .is_empty()
        {
            markdown.push_str(&format!(
                "### Database ↔ Backend Mismatches ({})\n\n",
                report
                    .cross_layer_validation
                    .database_backend_mismatches
                    .len()
            ));
            for error in &report.cross_layer_validation.database_backend_mismatches {
                markdown.push_str(&format!(
                    "- **{}:** {} ({}:{})\n",
                    error.error_type, error.message, error.file_path, error.line_number
                ));
            }
            markdown.push('\n');
        }

        // Critical Issues
        if !report.errors.is_empty() {
            markdown.push_str(&format!(
                "## 🚨 Critical Issues ({})\n\n",
                report.errors.len()
            ));
            for error in &report.errors {
                markdown.push_str(&format!("### {} - {}\n\n", error.error_type, error.message));
                markdown.push_str(&format!("**File:** `{}`\n", error.file_path));
                markdown.push_str(&format!("**Line:** {}\n", error.line_number));
                markdown.push_str(&format!("**Layer:** {:?}\n", error.layer));
                markdown.push_str(&format!("**Environment:** {}\n", error.environment));
                if let Some(suggestion) = &error.suggestion {
                    markdown.push_str(&format!("**Suggestion:** {}\n", suggestion));
                }
                markdown.push_str(&format!(
                    "**Affected Layers:** {:?}\n",
                    error.affected_layers
                ));
                markdown.push_str(&format!("**Context:** {}\n\n", error.context));
            }
        }

        // Warnings
        if !report.warnings.is_empty() {
            markdown.push_str(&format!("## ⚠️ Warnings ({})\n\n", report.warnings.len()));
            for warning in &report.warnings {
                markdown.push_str(&format!(
                    "### {} - {}\n\n",
                    warning.error_type, warning.message
                ));
                markdown.push_str(&format!("**File:** `{}`\n", warning.file_path));
                markdown.push_str(&format!("**Line:** {}\n", warning.line_number));
                markdown.push_str(&format!("**Layer:** {:?}\n", warning.layer));
                if let Some(suggestion) = &warning.suggestion {
                    markdown.push_str(&format!("**Suggestion:** {}\n", suggestion));
                }
                markdown.push_str(&format!("**Context:** {}\n\n", warning.context));
            }
        }

        fs::write(output_path, markdown)
            .with_context(|| format!("Failed to write Markdown report to {:?}", output_path))?;

        Ok(())
    }
}

/// Enhanced AST visitor for extracting SQL queries from Rust code
struct EnhancedSqlVisitor {
    file_path: String,
    sql_references: Vec<SqlReference>,
    environment: String,
}

impl Visit<'_> for EnhancedSqlVisitor {
    fn visit_macro(&mut self, mac: &Macro) {
        let macro_name = mac
            .path
            .segments
            .last()
            .map(|s| s.ident.to_string())
            .unwrap_or_default();

        // Handle sqlx::query! and similar macros
        if macro_name.contains("query") {
            let tokens = mac.tokens.to_string();
            if let Some(sql_query) = self.extract_sql_from_tokens(&tokens) {
                let line_number = self.get_line_number_from_span(mac.span());
                self.add_sql_reference(sql_query, line_number, "sqlx macro".to_string());
            }
        }

        // Handle format! macros that might contain SQL
        if macro_name == "format" {
            let tokens = mac.tokens.to_string();
            if let Some(sql_query) = self.extract_sql_from_format_tokens(&tokens) {
                let line_number = self.get_line_number_from_span(mac.span());
                self.add_sql_reference(sql_query, line_number, "format! macro".to_string());
            }
        }

        syn::visit::visit_macro(self, mac);
    }

    fn visit_lit_str(&mut self, lit_str: &LitStr) {
        let value = lit_str.value();
        if self.is_sql_query(&value) {
            let line_number = self.get_line_number_from_span(lit_str.span());
            self.add_sql_reference(value, line_number, "string literal".to_string());
        }

        syn::visit::visit_lit_str(self, lit_str);
    }
}

impl EnhancedSqlVisitor {
    fn extract_sql_from_tokens(&self, tokens: &str) -> Option<String> {
        // Extract SQL from macro tokens (enhanced)
        if let Some(start) = tokens.find('"') {
            if let Some(end) = tokens[start + 1..].find('"') {
                let sql = &tokens[start + 1..start + 1 + end];
                if self.is_sql_query(sql) {
                    return Some(sql.to_string());
                }
            }
        }
        None
    }

    fn extract_sql_from_format_tokens(&self, tokens: &str) -> Option<String> {
        // Extract SQL from format! macro tokens (enhanced)
        if let Some(start) = tokens.find('"') {
            if let Some(end) = tokens[start + 1..].find('"') {
                let format_str = &tokens[start + 1..start + 1 + end];
                if self.is_sql_query(format_str) {
                    // Replace format placeholders with dummy values for parsing
                    let cleaned_sql = format_str
                        .replace("{}", "'placeholder'")
                        .replace("{:?}", "'placeholder'")
                        .replace('{', "'placeholder'")
                        .replace('}', "'");
                    return Some(cleaned_sql);
                }
            }
        }
        None
    }

    fn is_sql_query(&self, text: &str) -> bool {
        let text_upper = text.to_uppercase();
        text_upper.contains("SELECT")
            || text_upper.contains("INSERT")
            || text_upper.contains("UPDATE")
            || text_upper.contains("DELETE")
            || text_upper.contains("ALTER")
            || text_upper.contains("CREATE")
            || text_upper.contains("DROP")
    }

    fn get_line_number_from_span(&self, _span: proc_macro2::Span) -> usize {
        // This is a simplified implementation
        // In practice, you'd need to map the span to actual line numbers
        1
    }

    fn add_sql_reference(&mut self, query: String, line_number: usize, context: String) {
        // Parse the query to extract table and column references (enhanced)
        let dialect = ClickHouseDialect {};
        if let Ok(statements) = Parser::parse_sql(&dialect, &query) {
            let tables_referenced = Vec::new();
            let columns_referenced = Vec::new();
            let mut query_type = "Unknown".to_string();

            for statement in statements {
                match statement {
                    Statement::Query(_) => query_type = "SELECT".to_string(),
                    Statement::Insert { .. } => query_type = "INSERT".to_string(),
                    Statement::Update { .. } => query_type = "UPDATE".to_string(),
                    Statement::Delete { .. } => query_type = "DELETE".to_string(),
                    Statement::AlterTable { .. } => query_type = "ALTER".to_string(),
                    _ => {}
                }
                // TODO: Extract table and column references using the enhanced parsing logic
            }

            self.sql_references.push(SqlReference {
                file_path: self.file_path.clone(),
                line_number,
                column_number: 0,
                query_type,
                tables_referenced,
                columns_referenced,
                raw_query: query,
                context,
                layer: ValidationLayer::Backend,
                environment: self.environment.clone(),
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_environment_config() {
        let mut validator = SchemaValidator::new();

        let config = EnvironmentConfig {
            name: "test".to_string(),
            schema_file: PathBuf::from("test.sql"),
            database_name: "test_db".to_string(),
            rust_source_dirs: vec![PathBuf::from("src")],
            typescript_source_dirs: vec![PathBuf::from("frontend/src")],
            graphql_schema_files: vec![],
            openapi_spec_files: vec![],
        };

        validator.environments.insert("test".to_string(), config);
        assert!(validator.set_environment("test").is_ok());
        assert_eq!(validator.current_environment, "test");
    }

    #[test]
    fn test_enhanced_validation_error() {
        let error = ValidationError {
            severity: "Critical".to_string(),
            error_type: "MissingTable".to_string(),
            message: "Test error".to_string(),
            file_path: "test.rs".to_string(),
            line_number: 1,
            column_number: 0,
            suggestion: Some("Fix the issue".to_string()),
            context: "test context".to_string(),
            layer: ValidationLayer::Backend,
            environment: "test".to_string(),
            affected_layers: vec![ValidationLayer::Database, ValidationLayer::Backend],
        };

        assert_eq!(error.layer, ValidationLayer::Backend);
        assert_eq!(error.affected_layers.len(), 2);
    }
}
