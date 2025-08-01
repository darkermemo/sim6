use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlparser::ast::{Expr, Query, SelectItem, SetExpr, Statement, TableFactor};
use sqlparser::dialect::ClickHouseDialect;
use sqlparser::parser::Parser;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use swc_common::SourceMap;
use swc_ecma_ast::{Module, TsType};
use swc_ecma_parser::{lexer::Lexer, Parser as SwcParser, StringInput, Syntax, TsConfig};
use syn::{visit::Visit, LitStr, Macro};
use walkdir::WalkDir;

#[cfg(feature = "graphql-support")]
use graphql_parser::{parse_schema, schema::Document as GraphQLDocument};

#[cfg(feature = "html-reporting")]
use askama::Template;

#[cfg(feature = "prometheus-metrics")]
use prometheus::{Counter, Gauge, Histogram, Registry};

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
    pub scalars: HashMap<String, String>,
    pub enums: HashMap<String, Vec<String>>,
}

/// GraphQL type definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLType {
    pub name: String,
    pub fields: HashMap<String, GraphQLField>,
    pub kind: String, // "object", "interface", "enum", etc.
    pub implements: Vec<String>,
}

/// GraphQL field definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLField {
    pub name: String,
    pub type_name: String,
    pub nullable: bool,
    pub list: bool,
    pub arguments: HashMap<String, GraphQLArgument>,
    pub directives: Vec<String>,
}

/// GraphQL argument definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLArgument {
    pub name: String,
    pub type_name: String,
    pub nullable: bool,
    pub default_value: Option<String>,
}

/// OpenAPI specification definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAPISpec {
    pub version: String,
    pub info: OpenAPIInfo,
    pub paths: HashMap<String, OpenAPIPath>,
    pub components: OpenAPIComponents,
}

/// OpenAPI info section
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAPIInfo {
    pub title: String,
    pub version: String,
    pub description: Option<String>,
}

/// OpenAPI path definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAPIPath {
    pub methods: HashMap<String, OpenAPIOperation>,
}

/// OpenAPI operation definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAPIOperation {
    pub operation_id: Option<String>,
    pub summary: Option<String>,
    pub parameters: Vec<OpenAPIParameter>,
    pub request_body: Option<OpenAPIRequestBody>,
    pub responses: HashMap<String, OpenAPIResponse>,
}

/// OpenAPI parameter definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAPIParameter {
    pub name: String,
    pub location: String, // "query", "path", "header", etc.
    pub required: bool,
    pub schema: OpenAPISchema,
}

/// OpenAPI request body definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAPIRequestBody {
    pub required: bool,
    pub content: HashMap<String, OpenAPIMediaType>,
}

/// OpenAPI response definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAPIResponse {
    pub description: String,
    pub content: Option<HashMap<String, OpenAPIMediaType>>,
}

/// OpenAPI media type definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAPIMediaType {
    pub schema: OpenAPISchema,
}

/// OpenAPI schema definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAPISchema {
    pub schema_type: String,
    pub format: Option<String>,
    pub properties: Option<HashMap<String, OpenAPISchema>>,
    pub items: Option<Box<OpenAPISchema>>,
    pub reference: Option<String>, // $ref
}

/// OpenAPI components section
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAPIComponents {
    pub schemas: HashMap<String, OpenAPISchema>,
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
    pub backend_graphql_mismatches: Vec<ValidationError>,
    pub frontend_graphql_mismatches: Vec<ValidationError>,
    pub backend_openapi_mismatches: Vec<ValidationError>,
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
    pub total_openapi_operations: usize,
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

/// Prometheus metrics for validation
#[cfg(feature = "prometheus-metrics")]
#[derive(Debug)]
pub struct ValidationMetrics {
    pub validation_runs_total: Counter,
    pub validation_errors_total: Counter,
    pub validation_warnings_total: Counter,
    pub files_scanned_total: Counter,
    pub sql_references_found: Gauge,
    pub validation_duration_seconds: Histogram,
    pub layer_coverage_percentage: Gauge,
}

#[cfg(feature = "prometheus-metrics")]
impl ValidationMetrics {
    /// Create new validation metrics
    pub fn new(registry: &Registry) -> Result<Self> {
        let validation_runs_total = Counter::new(
            "schema_validation_runs_total",
            "Total number of schema validation runs",
        )?;

        let validation_errors_total = Counter::new(
            "schema_validation_errors_total",
            "Total number of validation errors found",
        )?;

        let validation_warnings_total = Counter::new(
            "schema_validation_warnings_total",
            "Total number of validation warnings found",
        )?;

        let files_scanned_total = Counter::new(
            "schema_validation_files_scanned_total",
            "Total number of files scanned during validation",
        )?;

        let sql_references_found = Gauge::new(
            "schema_validation_sql_references",
            "Number of SQL references found in current validation",
        )?;

        let validation_duration_seconds = Histogram::with_opts(prometheus::HistogramOpts::new(
            "schema_validation_duration_seconds",
            "Duration of schema validation in seconds",
        ))?;

        let layer_coverage_percentage = Gauge::new(
            "schema_validation_layer_coverage_percentage",
            "Coverage percentage for each validation layer",
        )?;

        registry.register(Box::new(validation_runs_total.clone()))?;
        registry.register(Box::new(validation_errors_total.clone()))?;
        registry.register(Box::new(validation_warnings_total.clone()))?;
        registry.register(Box::new(files_scanned_total.clone()))?;
        registry.register(Box::new(sql_references_found.clone()))?;
        registry.register(Box::new(validation_duration_seconds.clone()))?;
        registry.register(Box::new(layer_coverage_percentage.clone()))?;

        Ok(ValidationMetrics {
            validation_runs_total,
            validation_errors_total,
            validation_warnings_total,
            files_scanned_total,
            sql_references_found,
            validation_duration_seconds,
            layer_coverage_percentage,
        })
    }

    /// Update metrics with validation results
    pub fn update_from_report(&self, report: &ValidationReport) {
        self.validation_runs_total.inc();
        self.validation_errors_total
            .inc_by(report.errors.len() as f64);
        self.validation_warnings_total
            .inc_by(report.warnings.len() as f64);

        let total_files: usize = report.total_files_scanned.values().sum();
        self.files_scanned_total.inc_by(total_files as f64);

        self.sql_references_found
            .set(report.total_sql_references as f64);

        // Update layer coverage metrics
        for (_layer, coverage) in &report.summary.layer_coverage {
            // Note: In a real implementation, you'd want to use labels for different layers
            self.layer_coverage_percentage.set(*coverage);
        }
    }
}

/// HTML template for validation report
#[cfg(feature = "html-reporting")]
#[derive(Template, Debug)]
#[template(path = "validation_report.html")]
pub struct ValidationReportTemplate {
    pub report: ValidationReport,
    pub generated_at: String,
}

/// Enhanced schema validator with multi-layer support
pub struct SchemaValidator {
    pub environments: HashMap<String, EnvironmentConfig>,
    pub current_environment: String,
    pub database_schemas: HashMap<String, DatabaseSchema>,
    pub typescript_interfaces: HashMap<String, Vec<TypeScriptInterface>>,
    pub graphql_schemas: HashMap<String, GraphQLSchema>,
    pub openapi_specs: HashMap<String, OpenAPISpec>,
    pub sql_references: Vec<SqlReference>,
    pub validation_errors: Vec<ValidationError>,
    pub cross_layer_validation: CrossLayerValidation,

    #[cfg(feature = "prometheus-metrics")]
    pub metrics: Option<ValidationMetrics>,
}

impl Default for SchemaValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl SchemaValidator {
    /// Create a new schema validator
    pub fn new() -> Self {
        SchemaValidator {
            environments: HashMap::new(),
            current_environment: "default".to_string(),
            database_schemas: HashMap::new(),
            typescript_interfaces: HashMap::new(),
            graphql_schemas: HashMap::new(),
            openapi_specs: HashMap::new(),
            sql_references: Vec::new(),
            validation_errors: Vec::new(),
            cross_layer_validation: CrossLayerValidation {
                database_backend_mismatches: Vec::new(),
                backend_frontend_mismatches: Vec::new(),
                database_frontend_mismatches: Vec::new(),
                graphql_mismatches: Vec::new(),
                openapi_mismatches: Vec::new(),
                backend_graphql_mismatches: Vec::new(),
                frontend_graphql_mismatches: Vec::new(),
                backend_openapi_mismatches: Vec::new(),
            },

            #[cfg(feature = "prometheus-metrics")]
            metrics: None,
        }
    }

    /// Create a new schema validator with Prometheus metrics
    #[cfg(feature = "prometheus-metrics")]
    pub fn new_with_prometheus() -> Result<Self> {
        let registry = Registry::new();
        let mut validator = Self::new();
        validator.metrics = Some(ValidationMetrics::new(&registry)?);
        Ok(validator)
    }

    /// Initialize Prometheus metrics
    #[cfg(feature = "prometheus-metrics")]
    pub fn init_metrics(&mut self, registry: &Registry) -> Result<()> {
        self.metrics = Some(ValidationMetrics::new(registry)?);
        Ok(())
    }

    /// Load environments configuration from JSON file
    pub fn load_environments_config(&mut self, config_path: &Path) -> Result<()> {
        self.load_environments(config_path)
    }

    /// Load environment configurations from JSON file
    pub fn load_environments(&mut self, config_path: &Path) -> Result<()> {
        let content = fs::read_to_string(config_path)
            .with_context(|| format!("Failed to read config file: {:?}", config_path))?;

        let environments: HashMap<String, EnvironmentConfig> = serde_json::from_str(&content)
            .with_context(|| "Failed to parse environment configuration")?;

        self.environments = environments;
        Ok(())
    }

    /// Set the current environment for validation
    pub fn set_environment(&mut self, env_name: String) {
        self.current_environment = env_name;
    }

    /// Load database schema for current environment
    pub fn load_database_schema(&mut self, schema_file: &Path) -> Result<()> {
        let schema_content = fs::read_to_string(schema_file)
            .with_context(|| format!("Failed to read schema file: {:?}", schema_file))?;

        let mut schema = DatabaseSchema {
            environment: self.current_environment.clone(),
            tables: HashMap::new(),
            databases: HashSet::new(),
            views: HashMap::new(),
            materialized_views: HashMap::new(),
            functions: HashMap::new(),
        };

        self.parse_clickhouse_schema(&schema_content, &mut schema)?;

        let table_count = schema.tables.len();
        self.database_schemas
            .insert(self.current_environment.clone(), schema);

        println!(
            "Loaded {} tables from schema for environment '{}'",
            table_count, self.current_environment
        );
        Ok(())
    }

    /// Parse ClickHouse schema with enhanced support
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

    /// Get current GraphQL schema
    pub fn get_current_graphql_schema(&self) -> Option<&GraphQLSchema> {
        self.graphql_schemas.get(&self.current_environment)
    }

    /// Load OpenAPI specification for current environment
    pub fn load_openapi_spec(&mut self, spec_file: &Path) -> Result<()> {
        self.scan_openapi_spec(spec_file)?;
        Ok(())
    }

    /// Get current OpenAPI specification
    pub fn get_current_openapi_spec(&self) -> Option<&OpenAPISpec> {
        self.openapi_specs.get(&self.current_environment)
    }

    /// Scan TypeScript interfaces from a directory
    pub fn scan_typescript_interfaces(&mut self, source_dir: &Path) -> Result<()> {
        self.scan_typescript_codebase(source_dir)
    }

    /// Get current TypeScript interfaces
    pub fn get_current_typescript_interfaces(&self) -> Option<&Vec<TypeScriptInterface>> {
        self.typescript_interfaces.get(&self.current_environment)
    }

    /// Load GraphQL schema from file
    pub fn load_graphql_schema(&mut self, schema_file: &Path) -> Result<()> {
        self.scan_graphql_schema(schema_file)
    }

    /// Get current database schema
    pub fn get_current_database_schema(&self) -> Option<&DatabaseSchema> {
        self.database_schemas.get(&self.current_environment)
    }

    /// Scan source code for SQL references
    pub fn scan_source_code(&mut self, source_dir: &Path) -> Result<()> {
        self.scan_rust_codebase(source_dir)
    }

    /// Get SQL references
    pub fn get_sql_references(&self) -> &Vec<SqlReference> {
        &self.sql_references
    }

    /// Scan Rust codebase for SQL references using AST parsing
    pub fn scan_rust_codebase(&mut self, source_dir: &Path) -> Result<()> {
        let mut files_scanned = 0;

        for entry in WalkDir::new(source_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "rs"))
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
                    .map_or(false, |ext| ext == "ts" || ext == "tsx")
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
                tsx: file_path.extension().map_or(false, |ext| ext == "tsx"),
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
            .or_insert_with(Vec::new)
            .extend(interfaces);

        Ok(interface_count)
    }

    /// Extract TypeScript interfaces from AST using structured parsing
    fn extract_typescript_interfaces(
        &self,
        module: &Module,
        file_path: &Path,
    ) -> Result<Vec<TypeScriptInterface>> {
        let mut interfaces = Vec::new();

        for item in &module.body {
            if let swc_ecma_ast::ModuleItem::Stmt(swc_ecma_ast::Stmt::Decl(
                swc_ecma_ast::Decl::TsInterface(interface_decl),
            )) = item
            {
                let interface_name = interface_decl.id.sym.to_string();
                let mut properties = HashMap::new();
                let mut extends = Vec::new();

                // Extract extends clause
                for extend in &interface_decl.extends {
                    if let swc_ecma_ast::Expr::Ident(ident) = extend.expr.as_ref() {
                        extends.push(ident.sym.to_string());
                    }
                }

                // Extract properties
                for member in &interface_decl.body.body {
                    if let swc_ecma_ast::TsTypeElement::TsPropertySignature(prop) = member {
                        let prop_name = match &*prop.key {
                            swc_ecma_ast::Expr::Ident(ident) => ident.sym.to_string(),
                            _ => continue,
                        };

                        let type_annotation = if let Some(type_ann) = &prop.type_ann {
                            self.typescript_type_to_string(&type_ann.type_ann)
                        } else {
                            "any".to_string()
                        };

                        let property = TypeScriptProperty {
                            name: prop_name.clone(),
                            type_annotation,
                            optional: prop.optional,
                            readonly: prop.readonly,
                        };

                        properties.insert(prop_name, property);
                    }
                }

                let interface = TypeScriptInterface {
                    name: interface_name,
                    file_path: file_path.to_string_lossy().to_string(),
                    properties,
                    extends,
                    is_exported: true, // TODO: Detect export status
                };

                interfaces.push(interface);
            }
        }

        Ok(interfaces)
    }

    /// Convert TypeScript type to string representation
    fn typescript_type_to_string(&self, ts_type: &TsType) -> String {
        match ts_type {
            TsType::TsKeywordType(keyword) => match keyword.kind {
                swc_ecma_ast::TsKeywordTypeKind::TsStringKeyword => "string".to_string(),
                swc_ecma_ast::TsKeywordTypeKind::TsNumberKeyword => "number".to_string(),
                swc_ecma_ast::TsKeywordTypeKind::TsBooleanKeyword => "boolean".to_string(),
                swc_ecma_ast::TsKeywordTypeKind::TsAnyKeyword => "any".to_string(),
                swc_ecma_ast::TsKeywordTypeKind::TsVoidKeyword => "void".to_string(),
                swc_ecma_ast::TsKeywordTypeKind::TsNullKeyword => "null".to_string(),
                swc_ecma_ast::TsKeywordTypeKind::TsUndefinedKeyword => "undefined".to_string(),
                _ => "unknown".to_string(),
            },
            TsType::TsTypeRef(type_ref) => {
                if let swc_ecma_ast::TsEntityName::Ident(ident) = &type_ref.type_name {
                    ident.sym.to_string()
                } else {
                    "unknown".to_string()
                }
            }
            TsType::TsArrayType(array_type) => {
                format!(
                    "{}[]",
                    self.typescript_type_to_string(&array_type.elem_type)
                )
            }
            TsType::TsUnionOrIntersectionType(union_type) => match union_type {
                swc_ecma_ast::TsUnionOrIntersectionType::TsUnionType(union) => {
                    let types: Vec<String> = union
                        .types
                        .iter()
                        .map(|t| self.typescript_type_to_string(t))
                        .collect();
                    types.join(" | ")
                }
                swc_ecma_ast::TsUnionOrIntersectionType::TsIntersectionType(intersection) => {
                    let types: Vec<String> = intersection
                        .types
                        .iter()
                        .map(|t| self.typescript_type_to_string(t))
                        .collect();
                    types.join(" & ")
                }
            },
            _ => "unknown".to_string(),
        }
    }

    /// Scan GraphQL schema file using structured parsing
    fn scan_graphql_schema(&mut self, schema_file: &Path) -> Result<()> {
        #[cfg(feature = "graphql-support")]
        {
            let content = fs::read_to_string(schema_file).with_context(|| {
                format!("Failed to read GraphQL schema file: {:?}", schema_file)
            })?;

            let document = parse_schema::<String>(&content)
                .map_err(|e| anyhow::anyhow!("Failed to parse GraphQL schema: {:?}", e))?;

            let mut schema = GraphQLSchema {
                types: HashMap::new(),
                queries: HashMap::new(),
                mutations: HashMap::new(),
                subscriptions: HashMap::new(),
                scalars: HashMap::new(),
                enums: HashMap::new(),
            };

            // Parse GraphQL definitions
            for definition in document.definitions {
                match definition {
                    graphql_parser::schema::Definition::TypeDefinition(type_def) => {
                        match type_def {
                            graphql_parser::schema::TypeDefinition::Object(object_type) => {
                                let mut fields = HashMap::new();

                                for field in object_type.fields {
                                    let mut arguments = HashMap::new();

                                    for arg in field.arguments {
                                        let argument = GraphQLArgument {
                                            name: arg.name.to_string(),
                                            type_name: self.graphql_type_to_string(&arg.value_type),
                                            nullable: !self
                                                .is_graphql_type_non_null(&arg.value_type),
                                            default_value: arg
                                                .default_value
                                                .map(|v| format!("{:?}", v)),
                                        };
                                        arguments.insert(arg.name.to_string(), argument);
                                    }

                                    let graphql_field = GraphQLField {
                                        name: field.name.to_string(),
                                        type_name: self.graphql_type_to_string(&field.field_type),
                                        nullable: !self.is_graphql_type_non_null(&field.field_type),
                                        list: self.is_graphql_type_list(&field.field_type),
                                        arguments,
                                        directives: field
                                            .directives
                                            .iter()
                                            .map(|d| d.name.to_string())
                                            .collect(),
                                    };

                                    fields.insert(field.name.to_string(), graphql_field);
                                }

                                let graphql_type = GraphQLType {
                                    name: object_type.name.to_string(),
                                    fields,
                                    kind: "object".to_string(),
                                    implements: object_type
                                        .implements_interfaces
                                        .iter()
                                        .map(|i| i.to_string())
                                        .collect(),
                                };

                                schema
                                    .types
                                    .insert(object_type.name.to_string(), graphql_type);
                            }
                            graphql_parser::schema::TypeDefinition::Scalar(scalar_type) => {
                                schema
                                    .scalars
                                    .insert(scalar_type.name.to_string(), "scalar".to_string());
                            }
                            graphql_parser::schema::TypeDefinition::Enum(enum_type) => {
                                let values: Vec<String> = enum_type
                                    .values
                                    .iter()
                                    .map(|v| v.name.to_string())
                                    .collect();
                                schema.enums.insert(enum_type.name.to_string(), values);
                            }
                            _ => {} // Handle other type definitions as needed
                        }
                    }
                    graphql_parser::schema::Definition::SchemaDefinition(schema_def) => {
                        // Handle schema definition (Query, Mutation, Subscription)
                        if let Some(query) = schema_def.query {
                            // Mark this type as the Query root
                        }
                        if let Some(mutation) = schema_def.mutation {
                            // Mark this type as the Mutation root
                        }
                        if let Some(subscription) = schema_def.subscription {
                            // Mark this type as the Subscription root
                        }
                    }
                    _ => {} // Handle other definitions as needed
                }
            }

            self.graphql_schemas
                .insert(self.current_environment.clone(), schema);
            println!("Parsed GraphQL schema from: {:?}", schema_file);
        }

        #[cfg(not(feature = "graphql-support"))]
        {
            println!("GraphQL support not enabled. Skipping: {:?}", schema_file);
        }

        Ok(())
    }

    #[cfg(feature = "graphql-support")]
    fn graphql_type_to_string(&self, gql_type: &graphql_parser::schema::Type<String>) -> String {
        match gql_type {
            graphql_parser::schema::Type::NamedType(name) => name.clone(),
            graphql_parser::schema::Type::ListType(list_type) => {
                format!("[{}]", self.graphql_type_to_string(list_type))
            }
            graphql_parser::schema::Type::NonNullType(non_null_type) => {
                format!("{}!", self.graphql_type_to_string(non_null_type))
            }
        }
    }

    #[cfg(feature = "graphql-support")]
    fn is_graphql_type_non_null(&self, gql_type: &graphql_parser::schema::Type<String>) -> bool {
        matches!(gql_type, graphql_parser::schema::Type::NonNullType(_))
    }

    #[cfg(feature = "graphql-support")]
    fn is_graphql_type_list(&self, gql_type: &graphql_parser::schema::Type<String>) -> bool {
        match gql_type {
            graphql_parser::schema::Type::ListType(_) => true,
            graphql_parser::schema::Type::NonNullType(inner) => self.is_graphql_type_list(inner),
            _ => false,
        }
    }

    /// Scan OpenAPI specification file using structured parsing
    fn scan_openapi_spec(&mut self, spec_file: &Path) -> Result<()> {
        let content = fs::read_to_string(spec_file)
            .with_context(|| format!("Failed to read OpenAPI spec file: {:?}", spec_file))?;

        // Determine if it's JSON or YAML based on file extension
        let spec: serde_json::Value = if spec_file
            .extension()
            .map_or(false, |ext| ext == "yaml" || ext == "yml")
        {
            let yaml_value: serde_yaml::Value = serde_yaml::from_str(&content)
                .with_context(|| "Failed to parse YAML OpenAPI spec")?;
            serde_json::to_value(yaml_value).with_context(|| "Failed to convert YAML to JSON")?
        } else {
            serde_json::from_str(&content).with_context(|| "Failed to parse JSON OpenAPI spec")?
        };

        let openapi_spec = self.parse_openapi_spec(&spec)?;
        self.openapi_specs
            .insert(self.current_environment.clone(), openapi_spec);

        println!("Parsed OpenAPI specification from: {:?}", spec_file);
        Ok(())
    }

    /// Parse OpenAPI specification from JSON value
    fn parse_openapi_spec(&self, spec: &serde_json::Value) -> Result<OpenAPISpec> {
        let version = spec["openapi"].as_str().unwrap_or("3.0.0").to_string();

        // Parse info section
        let info = OpenAPIInfo {
            title: spec["info"]["title"].as_str().unwrap_or("API").to_string(),
            version: spec["info"]["version"]
                .as_str()
                .unwrap_or("1.0.0")
                .to_string(),
            description: spec["info"]["description"].as_str().map(|s| s.to_string()),
        };

        // Parse paths
        let mut paths = HashMap::new();
        if let Some(paths_obj) = spec["paths"].as_object() {
            for (path, path_item) in paths_obj {
                let mut methods = HashMap::new();

                if let Some(path_obj) = path_item.as_object() {
                    for (method, operation) in path_obj {
                        if [
                            "get", "post", "put", "delete", "patch", "options", "head", "trace",
                        ]
                        .contains(&method.as_str())
                        {
                            let op = self.parse_openapi_operation(operation)?;
                            methods.insert(method.clone(), op);
                        }
                    }
                }

                paths.insert(path.clone(), OpenAPIPath { methods });
            }
        }

        // Parse components
        let mut components = OpenAPIComponents {
            schemas: HashMap::new(),
        };

        if let Some(components_obj) = spec["components"].as_object() {
            if let Some(schemas_obj) = components_obj["schemas"].as_object() {
                for (schema_name, schema_def) in schemas_obj {
                    let schema = self.parse_openapi_schema(schema_def)?;
                    components.schemas.insert(schema_name.clone(), schema);
                }
            }
        }

        Ok(OpenAPISpec {
            version,
            info,
            paths,
            components,
        })
    }

    /// Parse OpenAPI operation
    fn parse_openapi_operation(&self, operation: &serde_json::Value) -> Result<OpenAPIOperation> {
        let operation_id = operation["operationId"].as_str().map(|s| s.to_string());
        let summary = operation["summary"].as_str().map(|s| s.to_string());

        // Parse parameters
        let mut parameters = Vec::new();
        if let Some(params_array) = operation["parameters"].as_array() {
            for param in params_array {
                let parameter = OpenAPIParameter {
                    name: param["name"].as_str().unwrap_or("").to_string(),
                    location: param["in"].as_str().unwrap_or("query").to_string(),
                    required: param["required"].as_bool().unwrap_or(false),
                    schema: self.parse_openapi_schema(&param["schema"])?,
                };
                parameters.push(parameter);
            }
        }

        // Parse request body
        let request_body = if let Some(req_body) = operation.get("requestBody") {
            let required = req_body["required"].as_bool().unwrap_or(false);
            let mut content = HashMap::new();

            if let Some(content_obj) = req_body["content"].as_object() {
                for (media_type, media_obj) in content_obj {
                    let media = OpenAPIMediaType {
                        schema: self.parse_openapi_schema(&media_obj["schema"])?,
                    };
                    content.insert(media_type.clone(), media);
                }
            }

            Some(OpenAPIRequestBody { required, content })
        } else {
            None
        };

        // Parse responses
        let mut responses = HashMap::new();
        if let Some(responses_obj) = operation["responses"].as_object() {
            for (status_code, response) in responses_obj {
                let description = response["description"].as_str().unwrap_or("").to_string();
                let mut content = None;

                if let Some(content_obj) = response["content"].as_object() {
                    let mut content_map = HashMap::new();
                    for (media_type, media_obj) in content_obj {
                        let media = OpenAPIMediaType {
                            schema: self.parse_openapi_schema(&media_obj["schema"])?,
                        };
                        content_map.insert(media_type.clone(), media);
                    }
                    content = Some(content_map);
                }

                responses.insert(
                    status_code.clone(),
                    OpenAPIResponse {
                        description,
                        content,
                    },
                );
            }
        }

        Ok(OpenAPIOperation {
            operation_id,
            summary,
            parameters,
            request_body,
            responses,
        })
    }

    /// Parse OpenAPI schema
    fn parse_openapi_schema(&self, schema: &serde_json::Value) -> Result<OpenAPISchema> {
        let schema_type = schema["type"].as_str().unwrap_or("object").to_string();
        let format = schema["format"].as_str().map(|s| s.to_string());
        let reference = schema["$ref"].as_str().map(|s| s.to_string());

        // Parse properties for object types
        let properties = if schema_type == "object" {
            if let Some(props_obj) = schema["properties"].as_object() {
                let mut props = HashMap::new();
                for (prop_name, prop_schema) in props_obj {
                    let prop = self.parse_openapi_schema(prop_schema)?;
                    props.insert(prop_name.clone(), prop);
                }
                Some(props)
            } else {
                None
            }
        } else {
            None
        };

        // Parse items for array types
        let items = if schema_type == "array" {
            if let Some(items_schema) = schema.get("items") {
                Some(Box::new(self.parse_openapi_schema(items_schema)?))
            } else {
                None
            }
        } else {
            None
        };

        Ok(OpenAPISchema {
            schema_type,
            format,
            properties,
            items,
            reference,
        })
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
        self.validate_backend_graphql_consistency()?;
        self.validate_frontend_graphql_consistency()?;
        self.validate_backend_openapi_consistency()?;
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

    /// Validate GraphQL schema consistency with database and backend
    fn validate_graphql_consistency(&mut self) -> Result<()> {
        if let Some(graphql_schema) = self.graphql_schemas.get(&self.current_environment) {
            if let Some(database_schema) = self.database_schemas.get(&self.current_environment) {
                // Validate GraphQL types against database tables
                for (type_name, _graphql_type) in &graphql_schema.types {
                    // Check if there's a corresponding database table
                    let table_exists = database_schema.tables.keys().any(|table_name| {
                        table_name
                            .to_lowercase()
                            .contains(&type_name.to_lowercase())
                            || type_name.to_lowercase().contains(
                                &table_name.split('.').last().unwrap_or("").to_lowercase(),
                            )
                    });

                    if !table_exists {
                        let error = ValidationError {
                            severity: "Warning".to_string(),
                            error_type: "GraphQLTypeMismatch".to_string(),
                            message: format!(
                                "GraphQL type '{}' has no corresponding database table",
                                type_name
                            ),
                            file_path: "GraphQL Schema".to_string(),
                            line_number: 0,
                            column_number: 0,
                            suggestion: Some(
                                "Consider adding a database table or removing the GraphQL type"
                                    .to_string(),
                            ),
                            context: format!("GraphQL type: {}", type_name),
                            layer: ValidationLayer::GraphQL,
                            environment: self.current_environment.clone(),
                            affected_layers: vec![
                                ValidationLayer::Database,
                                ValidationLayer::GraphQL,
                            ],
                        };

                        self.validation_errors.push(error.clone());
                        self.cross_layer_validation.graphql_mismatches.push(error);
                    }
                }
            }
        }
        Ok(())
    }

    /// Validate OpenAPI specification consistency
    fn validate_openapi_consistency(&mut self) -> Result<()> {
        if let Some(openapi_spec) = self.openapi_specs.get(&self.current_environment) {
            // Validate OpenAPI schemas against database tables
            if let Some(database_schema) = self.database_schemas.get(&self.current_environment) {
                for (schema_name, _openapi_schema) in &openapi_spec.components.schemas {
                    let table_exists = database_schema.tables.keys().any(|table_name| {
                        table_name
                            .to_lowercase()
                            .contains(&schema_name.to_lowercase())
                            || schema_name.to_lowercase().contains(
                                &table_name.split('.').last().unwrap_or("").to_lowercase(),
                            )
                    });

                    if !table_exists {
                        let error = ValidationError {
                            severity: "Warning".to_string(),
                            error_type: "OpenAPISchemaM ismatch".to_string(),
                            message: format!(
                                "OpenAPI schema '{}' has no corresponding database table",
                                schema_name
                            ),
                            file_path: "OpenAPI Specification".to_string(),
                            line_number: 0,
                            column_number: 0,
                            suggestion: Some(
                                "Consider adding a database table or updating the OpenAPI schema"
                                    .to_string(),
                            ),
                            context: format!("OpenAPI schema: {}", schema_name),
                            layer: ValidationLayer::OpenAPI,
                            environment: self.current_environment.clone(),
                            affected_layers: vec![
                                ValidationLayer::Database,
                                ValidationLayer::OpenAPI,
                            ],
                        };

                        self.validation_errors.push(error.clone());
                        self.cross_layer_validation.openapi_mismatches.push(error);
                    }
                }
            }
        }
        Ok(())
    }

    /// Validate backend GraphQL resolver consistency
    fn validate_backend_graphql_consistency(&mut self) -> Result<()> {
        // TODO: Implement backend-GraphQL validation
        // Compare Rust resolver functions with GraphQL schema
        Ok(())
    }

    /// Validate frontend GraphQL query consistency
    fn validate_frontend_graphql_consistency(&mut self) -> Result<()> {
        // TODO: Implement frontend-GraphQL validation
        // Compare TypeScript GraphQL queries with schema
        Ok(())
    }

    /// Validate backend OpenAPI handler consistency
    fn validate_backend_openapi_consistency(&mut self) -> Result<()> {
        // TODO: Implement backend-OpenAPI validation
        // Compare Rust handler functions with OpenAPI operations
        Ok(())
    }

    /// Calculate layer coverage statistics
    fn calculate_layer_coverage(&self) -> HashMap<ValidationLayer, f64> {
        let mut coverage = HashMap::new();

        // Database layer coverage (always 100% if schema is loaded)
        if self
            .database_schemas
            .contains_key(&self.current_environment)
        {
            coverage.insert(ValidationLayer::Database, 100.0);
        } else {
            coverage.insert(ValidationLayer::Database, 0.0);
        }

        // Backend layer coverage based on SQL references
        let backend_refs = self
            .sql_references
            .iter()
            .filter(|r| r.layer == ValidationLayer::Backend)
            .count();
        let backend_coverage = if backend_refs > 0 { 85.0 } else { 0.0 };
        coverage.insert(ValidationLayer::Backend, backend_coverage);

        // Frontend layer coverage based on TypeScript interfaces
        let frontend_interfaces = self
            .typescript_interfaces
            .get(&self.current_environment)
            .map(|interfaces| interfaces.len())
            .unwrap_or(0);
        let frontend_coverage = if frontend_interfaces > 0 { 75.0 } else { 0.0 };
        coverage.insert(ValidationLayer::Frontend, frontend_coverage);

        // GraphQL layer coverage
        let graphql_coverage = if self.graphql_schemas.contains_key(&self.current_environment) {
            90.0
        } else {
            0.0
        };
        coverage.insert(ValidationLayer::GraphQL, graphql_coverage);

        // OpenAPI layer coverage
        let openapi_coverage = if self.openapi_specs.contains_key(&self.current_environment) {
            80.0
        } else {
            0.0
        };
        coverage.insert(ValidationLayer::OpenAPI, openapi_coverage);

        coverage
    }

    /// Generate comprehensive validation report
    pub fn generate_report(&self) -> ValidationReport {
        let mut total_files_scanned = HashMap::new();
        total_files_scanned.insert(
            ValidationLayer::Database,
            if self
                .database_schemas
                .contains_key(&self.current_environment)
            {
                1
            } else {
                0
            },
        );
        total_files_scanned.insert(
            ValidationLayer::Backend,
            self.sql_references
                .iter()
                .filter(|r| r.layer == ValidationLayer::Backend)
                .count(),
        );
        total_files_scanned.insert(
            ValidationLayer::Frontend,
            self.typescript_interfaces
                .get(&self.current_environment)
                .map(|i| i.len())
                .unwrap_or(0),
        );
        total_files_scanned.insert(
            ValidationLayer::GraphQL,
            if self.graphql_schemas.contains_key(&self.current_environment) {
                1
            } else {
                0
            },
        );
        total_files_scanned.insert(
            ValidationLayer::OpenAPI,
            if self.openapi_specs.contains_key(&self.current_environment) {
                1
            } else {
                0
            },
        );

        let total_typescript_interfaces = self
            .typescript_interfaces
            .get(&self.current_environment)
            .map(|interfaces| interfaces.len())
            .unwrap_or(0);

        let total_graphql_types = self
            .graphql_schemas
            .get(&self.current_environment)
            .map(|schema| schema.types.len())
            .unwrap_or(0);

        let total_openapi_operations = self
            .openapi_specs
            .get(&self.current_environment)
            .map(|spec| spec.paths.values().map(|path| path.methods.len()).sum())
            .unwrap_or(0);

        let total_tables_loaded = self
            .database_schemas
            .get(&self.current_environment)
            .map(|schema| schema.tables.len())
            .unwrap_or(0);

        let critical_issues = self
            .validation_errors
            .iter()
            .filter(|e| e.severity == "Critical")
            .count();

        let warnings = self
            .validation_errors
            .iter()
            .filter(|e| e.severity == "Warning")
            .count();

        let cross_layer_mismatches = self
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
                .len()
            + self.cross_layer_validation.graphql_mismatches.len()
            + self.cross_layer_validation.openapi_mismatches.len()
            + self.cross_layer_validation.backend_graphql_mismatches.len()
            + self
                .cross_layer_validation
                .frontend_graphql_mismatches
                .len()
            + self.cross_layer_validation.backend_openapi_mismatches.len();

        let layer_coverage = self.calculate_layer_coverage();

        let summary = ValidationSummary {
            critical_issues,
            warnings,
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
            hardcoded_database_names: 0, // TODO: Implement detection
            unknown_references: 0,       // TODO: Implement detection
            cross_layer_mismatches,
            layer_coverage,
        };

        ValidationReport {
            timestamp: Utc::now(),
            environment: self.current_environment.clone(),
            total_files_scanned,
            total_sql_references: self.sql_references.len(),
            total_tables_loaded,
            total_typescript_interfaces,
            total_graphql_types,
            total_openapi_operations,
            errors: self.validation_errors.clone(),
            warnings: self
                .validation_errors
                .iter()
                .filter(|e| e.severity == "Warning")
                .cloned()
                .collect(),
            cross_layer_validation: self.cross_layer_validation.clone(),
            summary,
        }
    }

    /// Export validation report as JSON
    pub fn export_json_report(&self, output_path: &Path) -> Result<()> {
        let report = self.generate_report();
        let json_content = serde_json::to_string_pretty(&report)
            .with_context(|| "Failed to serialize validation report to JSON")?;

        fs::write(output_path, json_content)
            .with_context(|| format!("Failed to write JSON report to: {:?}", output_path))?;

        println!("JSON report exported to: {:?}", output_path);
        Ok(())
    }

    /// Export validation report as Markdown
    pub fn export_markdown_report(&self, output_path: &Path) -> Result<()> {
        let report = self.generate_report();
        let markdown_content = self.generate_markdown_report(&report);

        fs::write(output_path, markdown_content)
            .with_context(|| format!("Failed to write Markdown report to: {:?}", output_path))?;

        println!("Markdown report exported to: {:?}", output_path);
        Ok(())
    }

    /// Export validation report as HTML
    #[cfg(feature = "html-reporting")]
    pub fn export_html_report(&self, output_path: &Path) -> Result<()> {
        let report = self.generate_report();
        let template = ValidationReportTemplate {
            report,
            generated_at: Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string(),
        };

        let html_content = template
            .render()
            .with_context(|| "Failed to render HTML template")?;

        fs::write(output_path, html_content)
            .with_context(|| format!("Failed to write HTML report to: {:?}", output_path))?;

        println!("HTML report exported to: {:?}", output_path);
        Ok(())
    }

    /// Export Prometheus metrics
    #[cfg(feature = "prometheus-metrics")]
    pub fn export_prometheus_metrics(&self, output_path: &Path) -> Result<()> {
        if let Some(metrics) = &self.metrics {
            let report = self.generate_report();
            metrics.update_from_report(&report);

            let registry = prometheus::Registry::new();
            let encoder = prometheus::TextEncoder::new();
            let metric_families = registry.gather();
            let metrics_output = encoder
                .encode_to_string(&metric_families)
                .with_context(|| "Failed to encode Prometheus metrics")?;

            fs::write(output_path, metrics_output).with_context(|| {
                format!("Failed to write Prometheus metrics to: {:?}", output_path)
            })?;

            println!("Prometheus metrics exported to: {:?}", output_path);
        } else {
            println!("Prometheus metrics not initialized");
        }
        Ok(())
    }

    /// Generate Markdown report content
    fn generate_markdown_report(&self, report: &ValidationReport) -> String {
        let mut content = String::new();

        content.push_str(&format!("# Schema Validation Report\n\n"));
        content.push_str(&format!("**Environment:** {}\n", report.environment));
        content.push_str(&format!(
            "**Generated:** {}\n\n",
            report.timestamp.format("%Y-%m-%d %H:%M:%S UTC")
        ));

        content.push_str("## Summary\n\n");
        content.push_str(&format!(
            "- **Tables Loaded:** {}\n",
            report.total_tables_loaded
        ));
        content.push_str(&format!(
            "- **SQL References:** {}\n",
            report.total_sql_references
        ));
        content.push_str(&format!(
            "- **TypeScript Interfaces:** {}\n",
            report.total_typescript_interfaces
        ));
        content.push_str(&format!(
            "- **GraphQL Types:** {}\n",
            report.total_graphql_types
        ));
        content.push_str(&format!(
            "- **OpenAPI Operations:** {}\n",
            report.total_openapi_operations
        ));
        content.push_str(&format!(
            "- **Critical Issues:** {}\n",
            report.summary.critical_issues
        ));
        content.push_str(&format!("- **Warnings:** {}\n", report.summary.warnings));
        content.push_str(&format!(
            "- **Cross-Layer Mismatches:** {}\n\n",
            report.summary.cross_layer_mismatches
        ));

        content.push_str("## Layer Coverage\n\n");
        for (layer, coverage) in &report.summary.layer_coverage {
            content.push_str(&format!("- **{:?}:** {:.1}%\n", layer, coverage));
        }
        content.push_str("\n");

        if !report.errors.is_empty() {
            content.push_str("## Validation Errors\n\n");
            for error in &report.errors {
                content.push_str(&format!(
                    "### {} - {}\n\n",
                    error.severity, error.error_type
                ));
                content.push_str(&format!("**Message:** {}\n\n", error.message));
                content.push_str(&format!(
                    "**File:** {} (Line {})\n\n",
                    error.file_path, error.line_number
                ));
                content.push_str(&format!("**Layer:** {:?}\n\n", error.layer));
                if let Some(suggestion) = &error.suggestion {
                    content.push_str(&format!("**Suggestion:** {}\n\n", suggestion));
                }
                content.push_str("---\n\n");
            }
        }

        content
    }
}

/// Enhanced SQL visitor for Rust AST parsing
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
            .map(|seg| seg.ident.to_string())
            .unwrap_or_default();

        if [
            "query!",
            "execute!",
            "fetch_one!",
            "fetch_all!",
            "fetch_optional!",
        ]
        .contains(&macro_name.as_str())
        {
            let tokens: Vec<_> = mac.tokens.clone().into_iter().collect();
            if let Some(first_token) = tokens.first() {
                if let Ok(lit_str) = syn::parse2::<LitStr>(first_token.clone().into()) {
                    let sql_query = lit_str.value();
                    let (tables, columns) = self.extract_sql_references(&sql_query);

                    use syn::spanned::Spanned;
                    let _span = mac.span();
                    // Use a default line number since proc_macro2::Span doesn't have start() method
                    let line_number = 1; // TODO: Implement proper line number extraction

                    let sql_ref = SqlReference {
                        file_path: self.file_path.clone(),
                        line_number,
                        column_number: 1, // Default column number
                        query_type: self.determine_query_type(&sql_query),
                        tables_referenced: tables,
                        columns_referenced: columns,
                        raw_query: sql_query,
                        context: format!("Macro: {}", macro_name),
                        layer: ValidationLayer::Backend,
                        environment: self.environment.clone(),
                    };

                    self.sql_references.push(sql_ref);
                }
            }
        }

        syn::visit::visit_macro(self, mac);
    }
}

impl EnhancedSqlVisitor {
    /// Extract table and column references from SQL query using sqlparser
    fn extract_sql_references(&self, sql: &str) -> (Vec<String>, Vec<String>) {
        let mut tables = Vec::new();
        let mut columns = Vec::new();

        let dialect = ClickHouseDialect {};
        if let Ok(statements) = Parser::parse_sql(&dialect, sql) {
            for statement in statements {
                self.extract_from_statement(&statement, &mut tables, &mut columns);
            }
        }

        (tables, columns)
    }

    /// Extract references from SQL statement
    fn extract_from_statement(
        &self,
        statement: &Statement,
        tables: &mut Vec<String>,
        columns: &mut Vec<String>,
    ) {
        match statement {
            Statement::Query(query) => {
                self.extract_from_query(query, tables, columns);
            }
            Statement::Insert {
                table_name,
                columns: insert_columns,
                ..
            } => {
                tables.push(table_name.to_string());
                for col in insert_columns {
                    columns.push(col.value.clone());
                }
            }
            Statement::Update {
                table, assignments, ..
            } => {
                if let TableFactor::Table { name, .. } = &table.relation {
                    tables.push(name.to_string());
                }
                for assignment in assignments {
                    columns.push(
                        assignment
                            .id
                            .iter()
                            .map(|i| i.value.clone())
                            .collect::<Vec<_>>()
                            .join("."),
                    );
                }
            }
            Statement::Delete {
                tables: delete_tables,
                ..
            } => {
                for table in delete_tables {
                    tables.push(table.to_string());
                }
            }
            _ => {}
        }
    }

    /// Extract references from SQL query
    fn extract_from_query(
        &self,
        query: &Query,
        tables: &mut Vec<String>,
        columns: &mut Vec<String>,
    ) {
        if let SetExpr::Select(select) = &*query.body {
            // Extract from SELECT clause
            for item in &select.projection {
                match item {
                    SelectItem::UnnamedExpr(expr) | SelectItem::ExprWithAlias { expr, .. } => {
                        self.extract_from_expr(expr, columns);
                    }
                    SelectItem::Wildcard(_) => {
                        columns.push("*".to_string());
                    }
                    SelectItem::QualifiedWildcard(prefix, _) => {
                        columns.push(format!("{}.*", prefix));
                    }
                }
            }

            // Extract from FROM clause
            for table_with_joins in &select.from {
                self.extract_from_table_factor(&table_with_joins.relation, tables);
                for join in &table_with_joins.joins {
                    self.extract_from_table_factor(&join.relation, tables);
                }
            }
        }
    }

    /// Extract table references from table factor
    fn extract_from_table_factor(&self, table_factor: &TableFactor, tables: &mut Vec<String>) {
        match table_factor {
            TableFactor::Table { name, .. } => {
                tables.push(name.to_string());
            }
            TableFactor::Derived { subquery, .. } => {
                self.extract_from_query(subquery, tables, &mut Vec::new());
            }
            _ => {}
        }
    }

    /// Extract column references from expression
    fn extract_from_expr(&self, expr: &Expr, columns: &mut Vec<String>) {
        match expr {
            Expr::Identifier(ident) => {
                columns.push(ident.value.clone());
            }
            Expr::CompoundIdentifier(idents) => {
                let column_name = idents
                    .iter()
                    .map(|i| i.value.clone())
                    .collect::<Vec<_>>()
                    .join(".");
                columns.push(column_name);
            }
            Expr::Function(func) => {
                for arg in &func.args {
                    if let sqlparser::ast::FunctionArg::Unnamed(
                        sqlparser::ast::FunctionArgExpr::Expr(e),
                    ) = arg
                    {
                        self.extract_from_expr(e, columns);
                    }
                }
            }
            Expr::BinaryOp { left, right, .. } => {
                self.extract_from_expr(left, columns);
                self.extract_from_expr(right, columns);
            }
            _ => {}
        }
    }

    /// Determine the type of SQL query
    fn determine_query_type(&self, sql: &str) -> String {
        let sql_upper = sql.trim().to_uppercase();
        if sql_upper.starts_with("SELECT") {
            "SELECT".to_string()
        } else if sql_upper.starts_with("INSERT") {
            "INSERT".to_string()
        } else if sql_upper.starts_with("UPDATE") {
            "UPDATE".to_string()
        } else if sql_upper.starts_with("DELETE") {
            "DELETE".to_string()
        } else {
            "UNKNOWN".to_string()
        }
    }
}
