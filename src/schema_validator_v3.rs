use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlparser::ast::{Expr, Query, SelectItem, SetExpr, Statement, TableFactor};
use sqlparser::dialect::ClickHouseDialect;
use sqlparser::parser::Parser;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use syn::{spanned::Spanned, visit::Visit, LitStr, Macro};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ColumnDefinition {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TableSchema {
    pub name: String,
    pub database: Option<String>,
    pub columns: HashMap<String, ColumnDefinition>,
    pub engine: Option<String>,
    pub order_by: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseSchema {
    pub tables: HashMap<String, TableSchema>,
    pub databases: HashSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SqlReference {
    pub file_path: String,
    pub line_number: usize,
    pub column_number: usize,
    pub query_type: String,
    pub tables_referenced: Vec<String>,
    pub columns_referenced: Vec<String>,
    pub raw_query: String,
    pub context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ValidationError {
    pub severity: String,
    pub error_type: String,
    pub message: String,
    pub file_path: String,
    pub line_number: usize,
    pub column_number: usize,
    pub suggestion: Option<String>,
    pub context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ValidationReport {
    pub timestamp: DateTime<Utc>,
    pub total_files_scanned: usize,
    pub total_sql_references: usize,
    pub total_tables_loaded: usize,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationError>,
    pub summary: ValidationSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ValidationSummary {
    pub critical_issues: usize,
    pub warnings: usize,
    pub missing_tables: usize,
    pub missing_columns: usize,
    pub hardcoded_database_names: usize,
    pub unknown_references: usize,
}

pub struct SchemaValidator {
    pub database_schema: DatabaseSchema,
    pub sql_references: Vec<SqlReference>,
    pub validation_errors: Vec<ValidationError>,
}

impl SchemaValidator {
    pub fn new() -> Self {
        Self {
            database_schema: DatabaseSchema {
                tables: HashMap::new(),
                databases: HashSet::new(),
            },
            sql_references: Vec::new(),
            validation_errors: Vec::new(),
        }
    }

    /// Load and parse database schema from SQL file using regex-based parsing for ClickHouse
    pub fn load_database_schema(&mut self, schema_file: &Path) -> Result<()> {
        let content = fs::read_to_string(schema_file)
            .with_context(|| format!("Failed to read schema file: {:?}", schema_file))?;

        self.parse_clickhouse_schema(&content)?;
        println!(
            "Loaded {} tables from schema",
            self.database_schema.tables.len()
        );
        Ok(())
    }

    /// Parse ClickHouse schema using regex patterns
    fn parse_clickhouse_schema(&mut self, content: &str) -> Result<()> {
        use regex::Regex;

        // Regex to match CREATE TABLE statements
        let table_regex =
            Regex::new(r"(?s)CREATE TABLE IF NOT EXISTS\s+(\w+)\.(\w+)\s*\((.+?)\)\s*ENGINE")
                .with_context(|| "Failed to compile table regex")?;

        // Regex to match column definitions
        let column_regex = Regex::new(r"(\w+)\s+([^,\n]+?)(?:DEFAULT\s+([^,\n]+?))?(?:,|\n|$)")
            .with_context(|| "Failed to compile column regex")?;

        for table_match in table_regex.captures_iter(content) {
            let database_name = table_match.get(1).unwrap().as_str().to_string();
            let table_name = table_match.get(2).unwrap().as_str().to_string();
            let columns_text = table_match.get(3).unwrap().as_str();

            self.database_schema.databases.insert(database_name.clone());

            let mut table_columns = HashMap::new();

            // Parse columns from the table definition
            for line in columns_text.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with("--") {
                    continue;
                }

                // Simple column parsing
                if let Some(column_match) = column_regex.captures(line) {
                    let col_name = column_match.get(1).unwrap().as_str().to_string();
                    let col_type = column_match.get(2).unwrap().as_str().trim().to_string();
                    let default_value = column_match.get(3).map(|m| m.as_str().trim().to_string());

                    let column_def = ColumnDefinition {
                        name: col_name.clone(),
                        data_type: col_type.clone(),
                        nullable: col_type.contains("Nullable"),
                        default_value,
                    };

                    table_columns.insert(col_name, column_def);
                }
            }

            let table_schema = TableSchema {
                name: table_name.clone(),
                database: Some(database_name.clone()),
                columns: table_columns,
                engine: Some("MergeTree".to_string()), // Default for ClickHouse
                order_by: Vec::new(),                  // Simplified for now
            };

            let full_table_name = format!("{}.{}", database_name, table_name);
            self.database_schema
                .tables
                .insert(full_table_name, table_schema);
        }

        Ok(())
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

    /// Scan a single Rust file for SQL references
    fn scan_rust_file(&mut self, file_path: &Path) -> Result<()> {
        let content = fs::read_to_string(file_path)
            .with_context(|| format!("Failed to read file: {:?}", file_path))?;

        let syntax_tree = syn::parse_file(&content)
            .with_context(|| format!("Failed to parse Rust file: {:?}", file_path))?;

        let mut visitor = SqlVisitor {
            file_path: file_path.to_string_lossy().to_string(),
            source_code: &content,
            sql_references: Vec::new(),
        };

        visitor.visit_file(&syntax_tree);
        self.sql_references.extend(visitor.sql_references);

        Ok(())
    }

    /// Validate all SQL references against the database schema
    pub fn validate_schemas(&mut self) -> Result<()> {
        self.validate_sql_queries()?;
        self.validate_hardcoded_database_names();
        Ok(())
    }

    /// Validate SQL queries for missing tables and columns
    fn validate_sql_queries(&mut self) -> Result<()> {
        for sql_ref in &self.sql_references {
            // Parse the SQL query to extract table and column references
            if let Ok(parsed_query) = self.parse_sql_query(&sql_ref.raw_query) {
                // Validate table references
                for table in &parsed_query.tables_referenced {
                    if !self.database_schema.tables.contains_key(table) {
                        // Try without database prefix
                        let table_without_db = table.split('.').last().unwrap_or(table);
                        let table_exists = self.database_schema.tables.keys().any(|t| {
                            t.ends_with(&format!(".{}", table_without_db)) || t == table_without_db
                        });

                        if !table_exists {
                            self.validation_errors.push(ValidationError {
                                severity: "Critical".to_string(),
                                error_type: "MissingTable".to_string(),
                                message: format!("Table '{}' not found in database schema", table),
                                file_path: sql_ref.file_path.clone(),
                                line_number: sql_ref.line_number,
                                column_number: sql_ref.column_number,
                                suggestion: Some(
                                    "Add table to database_setup.sql or fix table name".to_string(),
                                ),
                                context: sql_ref.context.clone(),
                            });
                        }
                    }
                }

                // Validate column references
                for column in &parsed_query.columns_referenced {
                    let mut column_found = false;
                    for table in &parsed_query.tables_referenced {
                        if let Some(table_schema) = self.database_schema.tables.get(table) {
                            if table_schema.columns.contains_key(column) {
                                column_found = true;
                                break;
                            }
                        }
                    }

                    if !column_found && !column.contains('*') && column != "1" {
                        self.validation_errors.push(ValidationError {
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
                        });
                    }
                }
            }
        }
        Ok(())
    }

    /// Validate for hardcoded database names
    fn validate_hardcoded_database_names(&mut self) {
        for sql_ref in &self.sql_references {
            for table in &sql_ref.tables_referenced {
                if table.contains('.') {
                    let parts: Vec<&str> = table.split('.').collect();
                    if parts.len() == 2 {
                        let db_name = parts[0];
                        if self.database_schema.databases.contains(db_name) {
                            self.validation_errors.push(ValidationError {
                                severity: "Warning".to_string(),
                                error_type: "HardcodedDatabaseName".to_string(),
                                message: format!("Hardcoded database name '{}' found", db_name),
                                file_path: sql_ref.file_path.clone(),
                                line_number: sql_ref.line_number,
                                column_number: sql_ref.column_number,
                                suggestion: Some(
                                    "Use environment variables or configuration for database names"
                                        .to_string(),
                                ),
                                context: sql_ref.context.clone(),
                            });
                        }
                    }
                }
            }
        }
    }

    /// Parse SQL query using sqlparser-rs
    fn parse_sql_query(&self, query: &str) -> Result<SqlReference> {
        let dialect = ClickHouseDialect {};
        let statements =
            Parser::parse_sql(&dialect, query).with_context(|| "Failed to parse SQL query")?;

        let mut tables_referenced = Vec::new();
        let mut columns_referenced = Vec::new();
        let mut query_type = "Unknown".to_string();

        for statement in statements {
            match statement {
                Statement::Query(query) => {
                    query_type = "SELECT".to_string();
                    self.extract_from_query(
                        &query,
                        &mut tables_referenced,
                        &mut columns_referenced,
                    );
                }
                Statement::Insert {
                    table_name,
                    columns,
                    ..
                } => {
                    query_type = "INSERT".to_string();
                    tables_referenced.push(table_name.to_string());
                    columns_referenced.extend(columns.iter().map(|c| c.value.clone()));
                }
                Statement::Update {
                    table, assignments, ..
                } => {
                    query_type = "UPDATE".to_string();
                    if let TableFactor::Table { name, .. } = &table.relation {
                        tables_referenced.push(name.to_string());
                    }
                    for assignment in assignments {
                        columns_referenced.extend(assignment.id.iter().map(|id| id.value.clone()));
                    }
                }
                Statement::Delete { tables, .. } => {
                    query_type = "DELETE".to_string();
                    for table in tables {
                        tables_referenced.push(table.to_string());
                    }
                }
                Statement::AlterTable { name, .. } => {
                    query_type = "ALTER".to_string();
                    tables_referenced.push(name.to_string());
                }
                _ => {}
            }
        }

        Ok(SqlReference {
            file_path: String::new(),
            line_number: 0,
            column_number: 0,
            query_type,
            tables_referenced,
            columns_referenced,
            raw_query: query.to_string(),
            context: String::new(),
        })
    }

    /// Extract table and column references from a query
    fn extract_from_query(
        &self,
        query: &Query,
        tables: &mut Vec<String>,
        columns: &mut Vec<String>,
    ) {
        if let SetExpr::Select(select) = &*query.body {
            // Extract table references from FROM clause
            for table_with_joins in &select.from {
                self.extract_table_name(&table_with_joins.relation, tables);
                for join in &table_with_joins.joins {
                    self.extract_table_name(&join.relation, tables);
                }
            }

            // Extract column references from SELECT clause
            for item in &select.projection {
                match item {
                    SelectItem::UnnamedExpr(expr) => {
                        self.extract_column_names(expr, columns);
                    }
                    SelectItem::ExprWithAlias { expr, .. } => {
                        self.extract_column_names(expr, columns);
                    }
                    SelectItem::Wildcard(_) => {
                        columns.push("*".to_string());
                    }
                    _ => {}
                }
            }
        }
    }

    /// Extract table name from table factor
    fn extract_table_name(&self, table_factor: &TableFactor, tables: &mut Vec<String>) {
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

    /// Extract column names from expressions
    fn extract_column_names(&self, expr: &Expr, columns: &mut Vec<String>) {
        match expr {
            Expr::Identifier(ident) => {
                columns.push(ident.value.clone());
            }
            Expr::CompoundIdentifier(idents) => {
                if let Some(last) = idents.last() {
                    columns.push(last.value.clone());
                }
            }
            Expr::Function(func) => {
                for arg in &func.args {
                    if let sqlparser::ast::FunctionArg::Unnamed(
                        sqlparser::ast::FunctionArgExpr::Expr(e),
                    ) = arg
                    {
                        self.extract_column_names(e, columns);
                    }
                }
            }
            _ => {}
        }
    }

    /// Generate validation report
    pub fn generate_report(&self) -> ValidationReport {
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
        };

        ValidationReport {
            timestamp: Utc::now(),
            total_files_scanned: 0, // Will be updated by caller
            total_sql_references: self.sql_references.len(),
            total_tables_loaded: self.database_schema.tables.len(),
            errors: critical_errors,
            warnings,
            summary,
        }
    }

    /// Generate JSON report
    pub fn generate_json_report(&self, output_path: &Path) -> Result<()> {
        let report = self.generate_report();
        let json = serde_json::to_string_pretty(&report)
            .with_context(|| "Failed to serialize report to JSON")?;

        fs::write(output_path, json)
            .with_context(|| format!("Failed to write JSON report to {:?}", output_path))?;

        Ok(())
    }

    /// Generate Markdown report
    pub fn generate_markdown_report(&self, output_path: &Path) -> Result<()> {
        let report = self.generate_report();
        let mut markdown = String::new();

        markdown.push_str(&format!("# Schema Validation Report\n\n"));
        markdown.push_str(&format!(
            "**Generated:** {}\n\n",
            report.timestamp.format("%Y-%m-%d %H:%M:%S UTC")
        ));

        markdown.push_str(&format!("## Summary\n\n"));
        markdown.push_str(&format!(
            "- **Total Tables Loaded:** {}\n",
            report.total_tables_loaded
        ));
        markdown.push_str(&format!(
            "- **Total SQL References:** {}\n",
            report.total_sql_references
        ));
        markdown.push_str(&format!(
            "- **Critical Issues:** {}\n",
            report.summary.critical_issues
        ));
        markdown.push_str(&format!("- **Warnings:** {}\n\n", report.summary.warnings));

        if !report.errors.is_empty() {
            markdown.push_str(&format!(
                "## 🚨 Critical Issues ({})\n\n",
                report.errors.len()
            ));
            for error in &report.errors {
                markdown.push_str(&format!("### {} - {}\n\n", error.error_type, error.message));
                markdown.push_str(&format!("**File:** `{}`\n", error.file_path));
                markdown.push_str(&format!("**Line:** {}\n", error.line_number));
                if let Some(suggestion) = &error.suggestion {
                    markdown.push_str(&format!("**Suggestion:** {}\n", suggestion));
                }
                markdown.push_str(&format!("**Context:** {}\n\n", error.context));
            }
        }

        if !report.warnings.is_empty() {
            markdown.push_str(&format!("## ⚠️ Warnings ({})\n\n", report.warnings.len()));
            for warning in &report.warnings {
                markdown.push_str(&format!(
                    "### {} - {}\n\n",
                    warning.error_type, warning.message
                ));
                markdown.push_str(&format!("**File:** `{}`\n", warning.file_path));
                markdown.push_str(&format!("**Line:** {}\n", warning.line_number));
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

/// AST visitor for extracting SQL queries from Rust code
struct SqlVisitor<'a> {
    file_path: String,
    source_code: &'a str,
    sql_references: Vec<SqlReference>,
}

impl<'a> Visit<'a> for SqlVisitor<'a> {
    fn visit_macro(&mut self, mac: &'a Macro) {
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

    fn visit_lit_str(&mut self, lit_str: &'a LitStr) {
        let value = lit_str.value();
        if self.is_sql_query(&value) {
            let line_number = self.get_line_number_from_span(lit_str.span());
            self.add_sql_reference(value, line_number, "string literal".to_string());
        }

        syn::visit::visit_lit_str(self, lit_str);
    }
}

impl<'a> SqlVisitor<'a> {
    fn extract_sql_from_tokens(&self, tokens: &str) -> Option<String> {
        // Extract SQL from macro tokens (simplified)
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
        // Extract SQL from format! macro tokens
        if let Some(start) = tokens.find('"') {
            if let Some(end) = tokens[start + 1..].find('"') {
                let format_str = &tokens[start + 1..start + 1 + end];
                if self.is_sql_query(format_str) {
                    // Replace format placeholders with dummy values for parsing
                    let cleaned_sql = format_str
                        .replace("{}", "'placeholder'")
                        .replace("{:?}", "'placeholder'")
                        .replace("{", "'placeholder'")
                        .replace("}", "'");
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
        // Parse the query to extract table and column references
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
                // Extract table and column references (simplified)
                // This would need more sophisticated extraction logic
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
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_sql_parsing() {
        let validator = SchemaValidator::new();
        let database_name = std::env::var("CLICKHOUSE_DB").unwrap_or_else(|_| "dev".to_string());
        let query = format!(
            "SELECT id, name FROM {}.users WHERE active = 1",
            database_name
        );
        let result = validator.parse_sql_query(&query);
        assert!(result.is_ok());

        let sql_ref = result.unwrap();
        assert_eq!(sql_ref.query_type, "SELECT");
        let expected_table = format!("{}.users", database_name);
        assert!(sql_ref.tables_referenced.contains(&expected_table));
    }

    #[test]
    fn test_schema_loading() {
        let mut validator = SchemaValidator::new();
        // This would need a test SQL file
        // let result = validator.load_database_schema(&PathBuf::from("test_schema.sql"));
        // assert!(result.is_ok());
    }
}
