//! Comprehensive Schema Validator for SIEM Platform
//!
//! This validator ensures permanent schema consistency across:
//! - ClickHouse database schema (database_setup.sql)
//! - Rust backend SQL queries and structs
//! - React frontend TypeScript interfaces

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnDefinition {
    pub name: String,
    pub column_type: String,
    pub nullable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableSchema {
    pub table_name: String,
    pub columns: HashMap<String, ColumnDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseSchema {
    pub tables: HashMap<String, TableSchema>,
}

#[derive(Debug, Clone)]
pub struct SqlReference {
    pub file_path: String,
    pub line_number: usize,
    pub query: String,
    pub table_name: String,
    pub columns_referenced: Vec<String>,
    pub operation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub error_type: String,
    pub severity: String,
    pub file_path: String,
    pub line_number: usize,
    pub message: String,
    pub suggestion: Option<String>,
}

#[derive(Debug)]
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
            },
            sql_references: Vec::new(),
            validation_errors: Vec::new(),
        }
    }

    /// Load and parse the database schema from database_setup.sql
    pub fn load_database_schema(&mut self, schema_file: &str) -> Result<(), Box<dyn std::error::Error>> {
        println!("📋 Loading database schema from {}", schema_file);
        
        let content = fs::read_to_string(schema_file)?;
        
        // Regex to match CREATE TABLE statements
        let table_regex = Regex::new(
            r"(?s)CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([\w.]+)\s*\(([^;]+)\)"
        )?;
        
        // Regex to match column definitions - improved to handle complex types and defaults
        let column_regex = Regex::new(
            r"(?m)^\s*([\w_]+)\s+([^,\n\)]+)"
        )?;
        
        for table_match in table_regex.captures_iter(&content) {
            let table_name = table_match[1].to_string();
            let columns_section = &table_match[2];
            
            let mut columns = HashMap::new();
            
            for column_match in column_regex.captures_iter(columns_section) {
                let column_name = column_match[1].to_string();
                let full_definition = column_match[2].to_string();
                
                // Extract the actual column type (first word/token)
                let column_type = full_definition
                    .split_whitespace()
                    .next()
                    .unwrap_or(&full_definition)
                    .to_string();
                
                // Check if column is nullable
                let nullable = full_definition.contains("Nullable") || 
                              !full_definition.contains("NOT NULL");
                
                columns.insert(column_name.clone(), ColumnDefinition {
                    name: column_name,
                    column_type,
                    nullable,
                });
            }
            
            self.database_schema.tables.insert(table_name.clone(), TableSchema {
                table_name: table_name.clone(),
                columns,
            });
            
            println!("  ✅ Loaded table: {}", table_name);
        }
        
        println!("📋 Loaded {} tables from database schema", self.database_schema.tables.len());
        Ok(())
    }

    /// Scan Rust files for SQL queries
    pub fn scan_rust_codebase(&mut self, rust_dirs: &[&str]) -> Result<(), Box<dyn std::error::Error>> {
        println!("🔍 Scanning Rust codebase for SQL queries...");
        
        for dir in rust_dirs {
            if Path::new(dir).exists() {
                for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
                    if entry.file_type().is_file() {
                        if let Some(extension) = entry.path().extension() {
                            if extension == "rs" {
                                self.scan_rust_file(entry.path())?;
                            }
                        }
                    }
                }
            } else {
                println!("⚠️  Directory {} does not exist, skipping...", dir);
            }
        }
        
        println!("🔍 Found {} SQL references", self.sql_references.len());
        Ok(())
    }

    /// Scan a single Rust file for SQL queries
    fn scan_rust_file(&mut self, file_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
        let content = fs::read_to_string(file_path)?;
        let file_path_str = file_path.to_string_lossy().to_string();
        let lines: Vec<&str> = content.lines().collect();
        
        for (line_num, line) in lines.iter().enumerate() {
            let mut query_found = false;
            
            // Check if line contains SQL keywords
            if self.is_sql_query(line) {
                // Try to extract the SQL query
                if let Some(query) = self.extract_query_from_line(line) {
                    let (table_name, operation) = self.parse_sql_query(&query);
                    let columns_referenced = self.extract_columns_from_query(&query, &operation);
                    
                    self.sql_references.push(SqlReference {
                        file_path: file_path_str.clone(),
                        line_number: line_num + 1,
                        query: query.clone(),
                        table_name,
                        columns_referenced,
                        operation,
                    });
                    query_found = true;
                }
            }
            
            // Check for format! patterns that might contain SQL
            if !query_found && line.contains("format!") {
                // Try single-line extraction first
                if let Some(query) = self.extract_query_from_line(line) {
                    let (table_name, operation) = self.parse_sql_query(&query);
                    let columns_referenced = self.extract_columns_from_query(&query, &operation);
                    
                    self.sql_references.push(SqlReference {
                        file_path: file_path_str.clone(),
                        line_number: line_num + 1,
                        query: query.clone(),
                        table_name,
                        columns_referenced,
                        operation,
                    });
                } else {
                    // Try multi-line format! patterns
                    if let Some(query) = self.extract_multiline_query(&lines, line_num) {
                        let (table_name, operation) = self.parse_sql_query(&query);
                        let columns_referenced = self.extract_columns_from_query(&query, &operation);
                        
                        self.sql_references.push(SqlReference {
                            file_path: file_path_str.clone(),
                            line_number: line_num + 1,
                            query: query.clone(),
                            table_name,
                            columns_referenced,
                            operation,
                        });
                    }
                }
            }
        }
        
        Ok(())
    }

    /// Extract multi-line SQL queries from format! macros
    fn extract_multiline_query(&self, lines: &[&str], start_line: usize) -> Option<String> {
        if start_line >= lines.len() {
            return None;
        }
        
        let line = lines[start_line];
        
        // Check if this line starts a format! macro
        if line.contains("format!") {
            // Look for the opening quote on this line or subsequent lines
            let mut current_line = start_line;
            let mut query_parts = Vec::new();
            let mut in_string = false;
            let mut found_start = false;
            
            while current_line < lines.len() && current_line < start_line + 10 { // Limit search to 10 lines
                let current = lines[current_line];
                
                if !found_start {
                    // Look for the start of the SQL string
                    if let Some(quote_pos) = current.find('"') {
                        let after_quote = &current[quote_pos + 1..];
                        // Check if this looks like SQL (more permissive check)
                        if after_quote.to_uppercase().contains("SELECT") || 
                           after_quote.to_uppercase().contains("INSERT") ||
                           after_quote.to_uppercase().contains("UPDATE") ||
                           after_quote.to_uppercase().contains("DELETE") ||
                           after_quote.to_uppercase().contains("ALTER") {
                            found_start = true;
                            in_string = true;
                            
                            // Check if the string ends on the same line
                            if let Some(end_quote) = after_quote.find('"') {
                                return Some(after_quote[..end_quote].to_string());
                            } else {
                                query_parts.push(after_quote.to_string());
                            }
                        }
                    }
                } else if in_string {
                    // We're inside a multi-line string
                    if let Some(end_quote) = current.find('"') {
                        // Found the end of the string
                        query_parts.push(current[..end_quote].to_string());
                        let full_query = query_parts.join(" ").trim().to_string();
                        return Some(full_query);
                    } else {
                        // Continue collecting the string
                        query_parts.push(current.trim().to_string());
                    }
                }
                
                current_line += 1;
            }
        }
        
        None
    }

    /// Extract SQL queries from Rust code
    fn extract_sql_queries(&mut self, content: &str, file_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        let lines: Vec<&str> = content.lines().collect();
        
        // Simple patterns to find SQL queries
        let sql_keywords = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"];
        
        // Also look for multiline format! macros
        let format_regex = Regex::new(r#"format!\s*\(\s*"([^"]*(?:SELECT|INSERT|UPDATE|DELETE)[^"]*)""#).unwrap();
        
        for captures in format_regex.captures_iter(content) {
            if let Some(query_match) = captures.get(1) {
                let query = query_match.as_str();
                if self.is_sql_query(query) {
                    let (table_name, operation) = self.parse_sql_query(query);
                    let columns_referenced = self.extract_columns_from_query(query, &operation);
                    
                    // Find line number
                    let line_num = content[..query_match.start()].matches('\n').count() + 1;
                    
                    self.sql_references.push(SqlReference {
                        file_path: file_path.to_string(),
                        line_number: line_num,
                        query: query.to_string(),
                        table_name,
                        columns_referenced,
                        operation,
                    });
                }
            }
        }
        
        for (line_num, line) in lines.iter().enumerate() {
            let line_upper = line.to_uppercase();
            
            // Check if line contains SQL keywords
            for keyword in &sql_keywords {
                if line_upper.contains(keyword) && (line.contains('"') || line.contains("format!")) {
                    // Try to extract the SQL query
                    if let Some(query) = self.extract_query_from_line(line) {
                        let (table_name, operation) = self.parse_sql_query(&query);
                        let columns_referenced = self.extract_columns_from_query(&query, &operation);
                        
                        self.sql_references.push(SqlReference {
                            file_path: file_path.to_string(),
                            line_number: line_num + 1,
                            query: query.clone(),
                            table_name,
                            columns_referenced,
                            operation,
                        });
                    } else if line.contains("format!") {
                        // Try multi-line format! patterns
                        if let Some(query) = self.extract_multiline_query(&lines, line_num) {
                            let (table_name, operation) = self.parse_sql_query(&query);
                            let columns_referenced = self.extract_columns_from_query(&query, &operation);
                            
                            self.sql_references.push(SqlReference {
                                file_path: file_path.to_string(),
                                line_number: line_num + 1,
                                query: query.clone(),
                                table_name,
                                columns_referenced,
                                operation,
                            });
                        }
                    }
                    break;
                }
            }
        }
        
        Ok(())
    }

    /// Extract query string from a line of code
    fn extract_query_from_line(&self, line: &str) -> Option<String> {
        // Handle format!() macro patterns
        if let Some(format_start) = line.find("format!(") {
            if let Some(quote_start) = line[format_start..].find('"') {
                let absolute_quote_start = format_start + quote_start;
                if let Some(quote_end) = line[absolute_quote_start + 1..].find('"') {
                    let absolute_quote_end = absolute_quote_start + 1 + quote_end;
                    let query = &line[absolute_quote_start + 1..absolute_quote_end];
                    if self.is_sql_query(query) {
                        return Some(query.to_string());
                    }
                }
            }
        }
        
        // Handle simple quoted strings
        if let Some(start) = line.find('"') {
            if let Some(end) = line.rfind('"') {
                if start < end {
                    let query = &line[start + 1..end];
                    if self.is_sql_query(query) {
                        return Some(query.to_string());
                    }
                }
            }
        }
        None
    }

    /// Check if a string is a SQL query
    fn is_sql_query(&self, query: &str) -> bool {
        let query_upper = query.to_uppercase();
        let sql_keywords = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"];
        sql_keywords.iter().any(|keyword| query_upper.contains(keyword))
    }

    /// Parse SQL query to extract table name and operation
    fn parse_sql_query(&self, query: &str) -> (String, String) {
        let query_upper = query.to_uppercase();
        
        let operation = if query_upper.contains("INSERT") {
            "INSERT".to_string()
        } else if query_upper.contains("SELECT") {
            "SELECT".to_string()
        } else if query_upper.contains("UPDATE") {
            "UPDATE".to_string()
        } else if query_upper.contains("DELETE") {
            "DELETE".to_string()
        } else {
            "UNKNOWN".to_string()
        };
        
        // Extract table name using improved regex patterns
        let table_patterns = vec![
            // FROM clause with optional whitespace and newlines
            Regex::new(r"(?i)FROM\s+([\w.]+)").unwrap(),
            // INTO clause for INSERT statements
            Regex::new(r"(?i)INTO\s+([\w.]+)").unwrap(),
            // UPDATE clause
            Regex::new(r"(?i)UPDATE\s+([\w.]+)").unwrap(),
            // ALTER TABLE clause
            Regex::new(r"(?i)ALTER\s+TABLE\s+([\w.]+)").unwrap(),
            // More flexible FROM pattern that handles multiline
            Regex::new(r"(?i)FROM\s*\n?\s*([\w.]+)").unwrap(),
            // Handle table names with database prefix (dev.table_name)
            Regex::new(r"(?i)(?:FROM|INTO|UPDATE|ALTER\s+TABLE)\s+([a-zA-Z_][a-zA-Z0-9_.]*)").unwrap(),
        ];
        
        // Clean the query by removing extra whitespace and newlines
        let cleaned_query = query.replace('\n', " ").replace('\t', " ");
        let cleaned_query = Regex::new(r"\s+").unwrap().replace_all(&cleaned_query, " ");
        
        for pattern in table_patterns {
            if let Some(captures) = pattern.captures(&cleaned_query) {
                if let Some(table_match) = captures.get(1) {
                    let table_name = table_match.as_str().to_string();
                    // Skip if it's a SQL keyword or function
                    if !self.is_sql_keyword(&table_name.to_uppercase()) && !table_name.contains('(') {
                        return (table_name, operation);
                    }
                }
            }
        }
        
        ("unknown".to_string(), operation)
    }

    /// Extract columns from SQL query with proper alias handling
    fn extract_columns_from_query(&self, query: &str, operation: &str) -> Vec<String> {
        let mut columns = Vec::new();
        
        match operation {
            "INSERT" => {
                if let Some(captures) = Regex::new(r"(?i)\([\s]*([^)]+)[\s]*\)\s*VALUES").unwrap().captures(query) {
                    if let Some(cols_match) = captures.get(1) {
                        for col in cols_match.as_str().split(',') {
                            let clean_col = self.clean_column_name(col.trim());
                            if !clean_col.is_empty() && !self.is_sql_keyword(&clean_col.to_uppercase()) {
                                columns.push(clean_col);
                            }
                        }
                    }
                }
            }
            "SELECT" => {
                // Extract columns from SELECT clause
                if let Some(captures) = Regex::new(r"(?i)SELECT\s+(.+?)\s+FROM").unwrap().captures(query) {
                    if let Some(cols_match) = captures.get(1) {
                        let cols_str = cols_match.as_str();
                        if cols_str.trim() != "*" {
                            for col in cols_str.split(',') {
                                let clean_col = self.clean_column_name(col.trim());
                                if !clean_col.is_empty() && clean_col != "COUNT(*)" && !clean_col.starts_with("{}") && !self.is_sql_keyword(&clean_col.to_uppercase()) {
                                    columns.push(clean_col);
                                }
                            }
                        }
                    }
                }
                
                // Also extract columns from WHERE clause
                self.extract_where_columns(query, &mut columns);
            }
            "UPDATE" => {
                if let Some(captures) = Regex::new(r"(?i)SET\s+(.+?)\s+WHERE").unwrap().captures(query) {
                    if let Some(sets_match) = captures.get(1) {
                        for set_clause in sets_match.as_str().split(',') {
                            if let Some(eq_pos) = set_clause.find('=') {
                                let clean_col = self.clean_column_name(set_clause[..eq_pos].trim());
                                if !clean_col.is_empty() && !clean_col.starts_with("{}") && !self.is_sql_keyword(&clean_col.to_uppercase()) {
                                    columns.push(clean_col);
                                }
                            }
                        }
                    }
                }
                
                // Also extract columns from WHERE clause
                self.extract_where_columns(query, &mut columns);
            }
            "DELETE" => {
                // Extract columns from WHERE clause
                self.extract_where_columns(query, &mut columns);
            }
            _ => {}
        }
        
        // Remove duplicates
        columns.sort();
        columns.dedup();
        columns
    }
    
    /// Clean column name by removing table aliases and SQL functions
    fn clean_column_name(&self, column: &str) -> String {
        let mut clean = column.trim().to_string();
        
        // Handle DISTINCT keyword
        if clean.to_uppercase().starts_with("DISTINCT ") {
            clean = clean[9..].trim().to_string(); // Remove "DISTINCT "
        }
        
        // Handle ClickHouse functions and SQL functions
        if clean.contains('(') && clean.contains(')') {
            // Check if it's a function call like now(), toUnixTimestamp(), etc.
            if let Some(open_paren) = clean.find('(') {
                let func_name = &clean[..open_paren];
                // Common ClickHouse and SQL functions that don't reference actual columns
                let sql_functions = [
                    "now", "current_timestamp", "current_date", "current_time",
                    "toUnixTimestamp", "toStartOfHour", "toStartOfDay", "toStartOfMonth",
                    "toString", "toDate", "toDateTime", "count", "sum", "avg", "min", "max",
                    "length", "upper", "lower", "substring", "concat", "coalesce"
                ];
                
                if sql_functions.iter().any(|&f| func_name.to_lowercase() == f) {
                    // This is a SQL function, not a column reference
                    return String::new(); // Return empty to indicate no column
                }
                
                // For functions that might contain column references, extract the content
                if let Some(close_paren) = clean.rfind(')') {
                    let inner = &clean[open_paren + 1..close_paren];
                    if !inner.trim().is_empty() && !inner.contains(',') {
                        // Single argument that might be a column
                        return self.clean_column_name(inner);
                    }
                }
            }
        }
        
        // Remove table aliases (e.g., "e.event_id" -> "event_id")
        if let Some(dot_pos) = clean.find('.') {
            clean = clean[dot_pos + 1..].to_string();
        }
        
        // Remove AS aliases (e.g., "event_id AS id" -> "event_id")
        if let Some(as_pos) = clean.to_uppercase().find(" AS ") {
            clean = clean[..as_pos].trim().to_string();
        }
        
        // Skip SQL functions and aggregates
        let upper = clean.to_uppercase();
        if upper.starts_with("COUNT(") || upper.starts_with("SUM(") || 
           upper.starts_with("AVG(") || upper.starts_with("MAX(") || 
           upper.starts_with("MIN(") || upper.starts_with("DISTINCT(") {
            return String::new();
        }
        
        // Remove quotes
        clean = clean.replace('"', "").replace('\'', "");
        
        clean
    }
    
    /// Extract column references from WHERE clauses
    fn extract_where_columns(&self, query: &str, columns: &mut Vec<String>) {
        if let Some(where_start) = query.to_uppercase().find("WHERE") {
            let where_clause = &query[where_start + 5..];
            
            // Simple regex to find column references in WHERE clause
            let column_regex = Regex::new(r"\b([a-zA-Z_][a-zA-Z0-9_.]*)").unwrap();
            
            for cap in column_regex.captures_iter(where_clause) {
                if let Some(col_match) = cap.get(1) {
                    let col_str = col_match.as_str();
                    
                    // Skip SQL keywords and values
                    let upper = col_str.to_uppercase();
                    if !self.is_sql_keyword(&upper) && !col_str.chars().all(|c| c.is_ascii_digit()) {
                        let clean_col = self.clean_column_name(col_str);
                        if !clean_col.is_empty() && !clean_col.starts_with("{}") && !self.is_sql_keyword(&clean_col.to_uppercase()) {
                            columns.push(clean_col);
                        }
                    }
                }
            }
        }
    }
    
    /// Check if a string is a SQL keyword
    fn is_sql_keyword(&self, word: &str) -> bool {
        let keywords = [
            "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN", "IS", "NULL", "TRUE", "FALSE",
            "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET", "ASC", "DESC",
            "INNER", "LEFT", "RIGHT", "FULL", "JOIN", "ON", "UNION", "ALL", "DISTINCT",
            "CASE", "WHEN", "THEN", "ELSE", "END", "IF", "EXISTS", "ANY", "SOME",
            "FORMAT", "JSON", "CSV", "TSV", "XML", "YAML", "PARQUET", "AVRO", "ORC",
            "SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP",
            "COUNT", "SUM", "AVG", "MIN", "MAX", "CAST", "CONVERT", "SUBSTRING", "LENGTH",
            "UPPER", "LOWER", "TRIM", "REPLACE", "CONCAT", "COALESCE", "ISNULL", "NULLIF"
        ];
        keywords.contains(&word)
    }

    /// Validate all schemas and generate errors
    pub fn validate_schemas(&mut self) {
        println!("🔍 Validating schema consistency...");
        
        self.validate_sql_queries();
        self.validate_hardcoded_database_names();
        
        println!("🔍 Validation complete. Found {} issues.", self.validation_errors.len());
    }

    /// Validate SQL queries against database schema
    fn validate_sql_queries(&mut self) {
        for sql_ref in &self.sql_references {
            // Check if table exists
            if !self.database_schema.tables.contains_key(&sql_ref.table_name) {
                self.validation_errors.push(ValidationError {
                    error_type: "MissingTable".to_string(),
                    severity: "Critical".to_string(),
                    file_path: sql_ref.file_path.clone(),
                    line_number: sql_ref.line_number,
                    message: format!("Table '{}' referenced in SQL query does not exist in database schema", sql_ref.table_name),
                    suggestion: Some("Add table definition to database_setup.sql or fix table name".to_string()),
                });
                continue;
            }
            
            let table_schema = &self.database_schema.tables[&sql_ref.table_name];
            
            // Check if all referenced columns exist
            for column in &sql_ref.columns_referenced {
                if !table_schema.columns.contains_key(column) {
                    self.validation_errors.push(ValidationError {
                        error_type: "MissingColumn".to_string(),
                        severity: "Critical".to_string(),
                        file_path: sql_ref.file_path.clone(),
                        line_number: sql_ref.line_number,
                        message: format!("Column '{}' referenced in SQL query does not exist in table '{}'", column, sql_ref.table_name),
                        suggestion: Some(format!("Available columns: {}", 
                                               table_schema.columns.keys().cloned().collect::<Vec<_>>().join(", "))),
                    });
                }
            }
        }
    }

    /// Validate for hardcoded database names
    fn validate_hardcoded_database_names(&mut self) {
        for sql_ref in &self.sql_references {
            if sql_ref.query.contains("dev.") {
                self.validation_errors.push(ValidationError {
                    error_type: "HardcodedDatabaseName".to_string(),
                    severity: "Warning".to_string(),
                    file_path: sql_ref.file_path.clone(),
                    line_number: sql_ref.line_number,
                    message: "SQL query contains hardcoded database name 'dev.'".to_string(),
                    suggestion: Some("Use environment variable or configuration for database name".to_string()),
                });
            }
        }
    }

    /// Generate a markdown report of validation results
    pub fn generate_markdown_report(&self) -> String {
        let mut report = String::new();
        
        report.push_str("# SIEM Schema Validation Report\n\n");
        
        // Summary
        let critical_count = self.validation_errors.iter().filter(|e| e.severity == "Critical").count();
        let warning_count = self.validation_errors.iter().filter(|e| e.severity == "Warning").count();
        
        report.push_str("## Summary\n\n");
        report.push_str(&format!("- **Critical Issues:** {}\n", critical_count));
        report.push_str(&format!("- **Warnings:** {}\n\n", warning_count));
        
        // Schema Statistics
        report.push_str("## Schema Statistics\n\n");
        report.push_str(&format!("- **Database Tables:** {}\n", self.database_schema.tables.len()));
        report.push_str(&format!("- **SQL References:** {}\n\n", self.sql_references.len()));
        
        // Issues by category
        let mut issues_by_type: HashMap<String, Vec<&ValidationError>> = HashMap::new();
        for error in &self.validation_errors {
            issues_by_type.entry(error.error_type.clone()).or_insert_with(Vec::new).push(error);
        }
        
        report.push_str("## Issues by Category\n\n");
        for (error_type, errors) in issues_by_type {
            report.push_str(&format!("### {}\n\n", error_type));
            for error in errors {
                let severity_emoji = match error.severity.as_str() {
                    "Critical" => "🚨",
                    "Warning" => "⚠️",
                    _ => "ℹ️",
                };
                
                report.push_str(&format!(
                    "{} **{}:{}** - {}\n",
                    severity_emoji,
                    error.file_path.split('/').last().unwrap_or(&error.file_path),
                    error.line_number,
                    error.message
                ));
                
                if let Some(suggestion) = &error.suggestion {
                    report.push_str(&format!("   *Suggestion: {}*\n", suggestion));
                }
                report.push_str("\n");
            }
        }
        
        report
    }

    /// Generate JSON report for CI systems
    pub fn generate_json_report(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(&self.validation_errors)
    }
}

/// CLI interface for the schema validator
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    
    let mut validator = SchemaValidator::new();
    
    // Load database schema
    let schema_file = args.get(1).unwrap_or(&"database_setup.sql".to_string()).clone();
    validator.load_database_schema(&schema_file)?;
    
    // Scan Rust codebase
    let rust_dirs = ["siem_api/src", "siem_consumer/src", "siem_rule_engine/src", "siem_parser/src"];
    validator.scan_rust_codebase(&rust_dirs)?;
    
    // Validate schemas
    validator.validate_schemas();
    
    // Generate reports
    let markdown_report = validator.generate_markdown_report();
    fs::write("schema_validation_report.md", markdown_report)?;
    
    let json_report = validator.generate_json_report()?;
    fs::write("schema_validation_report.json", json_report)?;
    
    // Print summary
    let critical_count = validator.validation_errors.iter().filter(|e| e.severity == "Critical").count();
    let warning_count = validator.validation_errors.iter().filter(|e| e.severity == "Warning").count();
    
    println!("\n📊 Schema Validation Summary:");
    println!("================================");
    println!("🚨 Critical Issues: {}", critical_count);
    println!("⚠️  Warnings: {}", warning_count);
    println!("📋 Database Tables: {}", validator.database_schema.tables.len());
    println!("🔍 SQL References: {}", validator.sql_references.len());
    
    println!("\n📄 Reports generated:");
    println!("  - schema_validation_report.md");
    println!("  - schema_validation_report.json");
    
    // Exit with error code if critical issues found
    if critical_count > 0 {
        println!("\n❌ Validation failed due to critical issues!");
        process::exit(1);
    } else if warning_count > 0 {
        println!("\n⚠️  Validation completed with warnings.");
        process::exit(0);
    } else {
        println!("\n✅ All schema validations passed!");
        process::exit(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sql_query_parsing() {
        let validator = SchemaValidator::new();
        
        let (table, op) = validator.parse_sql_query("SELECT * FROM dev.alerts WHERE tenant_id = 'test'");
        assert_eq!(table, "dev.alerts");
        assert_eq!(op, "SELECT");
        
        let (table, op) = validator.parse_sql_query("INSERT INTO dev.tenants (tenant_id, tenant_name) VALUES ('test', 'Test')");
        assert_eq!(table, "dev.tenants");
        assert_eq!(op, "INSERT");
    }

    #[test]
    fn test_is_sql_query() {
        let validator = SchemaValidator::new();
        
        assert!(validator.is_sql_query("SELECT * FROM table"));
        assert!(validator.is_sql_query("INSERT INTO table VALUES"));
        assert!(!validator.is_sql_query("let x = 5;"));
    }
}