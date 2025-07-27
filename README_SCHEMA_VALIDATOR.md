# SIEM Schema Validator

A comprehensive schema validation tool that ensures permanent consistency across the entire SIEM platform stack:

- **ClickHouse Database Schema** (`database_setup.sql`)
- **Rust Backend** (SQL queries, structs, API responses)
- **React Frontend** (TypeScript interfaces, API types)

## 🎯 Purpose

This validator prevents schema drift and ensures that:
1. All SQL queries reference existing tables and columns
2. Rust structs match database schema definitions
3. TypeScript interfaces align with backend API responses
4. No hardcoded database names are used
5. Missing tables are detected before deployment

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
cargo build --release

# Run the validator
cargo run --bin schema_validator_v2

# Or run with specific schema file
cargo run --bin schema_validator_v2 -- database_setup.sql
```

### Basic Usage

```bash
# Validate entire codebase
./target/release/schema_validator_v2

# Generate reports
ls -la schema_validation_report.*
# schema_validation_report.md   # Human-readable report
# schema_validation_report.json # CI/CD integration
```

## 📋 Features

### Core Validation

- ✅ **Database Schema Parsing** - Extracts table/column definitions from `database_setup.sql`
- ✅ **SQL Query Analysis** - Scans all Rust files for SQL queries and validates column references
- ✅ **Struct Validation** - Ensures Rust structs match database schema
- ✅ **TypeScript Interface Checking** - Validates frontend types against backend structs
- ✅ **Missing Table Detection** - Identifies referenced but undefined tables
- ✅ **Hardcoded Database Name Detection** - Flags usage of `dev.` prefixes

### Advanced Features

- 🔍 **Column Type Mapping** - Maps ClickHouse types to Rust types
- 📊 **Comprehensive Reporting** - Markdown and JSON output formats
- 🚨 **Severity Levels** - Critical, Warning, and Info classifications
- 🎯 **Line-by-Line Reporting** - Exact file and line number references
- 💡 **Actionable Suggestions** - Specific fix recommendations

### CI/CD Integration

- ✅ **Exit Codes** - Non-zero exit on critical issues
- ✅ **JSON Reports** - Machine-readable output for automation
- ✅ **GitHub Actions Ready** - Easy integration with workflows

## 📁 Project Structure

```
siem_schema_validator/
├── schema_validator_v2.rs      # Main validator implementation
├── Cargo.toml                  # Dependencies and build config
├── README_SCHEMA_VALIDATOR.md  # This documentation
└── reports/
    ├── schema_validation_report.md   # Generated markdown report
    └── schema_validation_report.json # Generated JSON report
```

## 🔧 Configuration

### Scanned Directories

The validator automatically scans these directories:

**Rust Backend:**
- `siem_api/src/`
- `siem_consumer/src/`
- `siem_rule_engine/src/`
- `siem_parser/src/`

**TypeScript Frontend:**
- `siem_ui/src/`

### Supported File Types

- **Rust:** `.rs` files
- **TypeScript:** `.ts`, `.tsx` files
- **SQL Schema:** `database_setup.sql`

## 📊 Validation Categories

### Critical Issues (Exit Code 1)

- **MissingTable** - SQL queries reference non-existent tables
- **MissingColumn** - SQL queries reference non-existent columns
- **MissingTableDefinition** - Tables used in code but not defined in schema

### Warnings (Exit Code 0)

- **MissingStructField** - Rust structs missing required database fields
- **ExtraStructField** - Rust structs with fields not in database
- **TypeScriptFieldMismatch** - Frontend interfaces with non-existent backend fields
- **HardcodedDatabaseName** - Usage of hardcoded `dev.` prefixes

### Info (Exit Code 0)

- **DeprecatedField** - Usage of deprecated fields
- **TypeMismatch** - Column type inconsistencies

## 🔍 Example Output

### Console Output
```
📋 Loading database schema from database_setup.sql
  ✅ Loaded table: dev.events
  ✅ Loaded table: dev.alerts
  ✅ Loaded table: dev.tenants
📋 Loaded 15 tables from database schema

🔍 Scanning Rust codebase for SQL queries and structs...
🔍 Found 42 SQL references and 28 Rust structs

🔍 Scanning TypeScript codebase for interfaces...
🔍 Found 35 TypeScript interfaces

🔍 Validating schema consistency...
🔍 Validation complete. Found 6 issues.

📊 Schema Validation Summary:
================================
🚨 Critical Issues: 2
⚠️  Warnings: 4
📋 Database Tables: 15
🔍 SQL References: 42
🦀 Rust Structs: 28
📝 TypeScript Interfaces: 35

📄 Reports generated:
  - schema_validation_report.md
  - schema_validation_report.json

❌ Validation failed due to critical issues!
```

### Markdown Report Sample
```markdown
# SIEM Schema Validation Report

**Generated:** 2024-01-15 14:30:25 UTC

## Summary

- **Critical Issues:** 2
- **Warnings:** 4
- **Info:** 0

## Issues by Category

### MissingColumn

🚨 **tenant_handlers.rs:45** - Column 'status' referenced in SQL query does not exist in table 'dev.tenants'
   *Suggestion: Add column to table schema or use correct column name. Available columns: tenant_id, tenant_name, is_active, created_at*

### TypeScriptFieldMismatch

⚠️ **api.ts:123** - TypeScript interface 'AlertDetail' has field 'assignee_id' that doesn't exist in Rust struct 'Alert'
   *Suggestion: Remove field from TypeScript interface or add to Rust struct*
```

## 🔄 CI/CD Integration

### GitHub Actions

```yaml
name: Schema Validation

on:
  pull_request:
    branches: [ main, develop ]
  push:
    branches: [ main ]

jobs:
  schema-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          
      - name: Build Schema Validator
        run: cargo build --release --bin schema_validator_v2
        
      - name: Run Schema Validation
        run: ./target/release/schema_validator_v2
        
      - name: Upload Validation Reports
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: schema-validation-reports
          path: |
            schema_validation_report.md
            schema_validation_report.json
            
      - name: Comment PR with Results
        if: github.event_name == 'pull_request' && failure()
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('schema_validation_report.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Schema Validation Failed\n\n${report}`
            });
```

### Pre-commit Hook

```bash
#!/bin/sh
# .git/hooks/pre-commit

echo "Running schema validation..."
if ! cargo run --bin schema_validator_v2 --quiet; then
    echo "❌ Schema validation failed! Please fix the issues before committing."
    echo "📄 Check schema_validation_report.md for details."
    exit 1
fi

echo "✅ Schema validation passed!"
```

## 🛠️ Development

### Running Tests

```bash
# Run unit tests
cargo test

# Run with coverage
cargo test --all-features
```

### Adding New Validations

1. **Add validation method** to `SchemaValidator` impl
2. **Call from `validate_schemas()`** method
3. **Add test cases** in the `tests` module
4. **Update documentation** with new validation type

### Extending Support

- **New file types:** Add to `scan_*_codebase` methods
- **New SQL patterns:** Update regex patterns in `extract_sql_queries`
- **New struct patterns:** Update regex in `extract_struct_definitions`
- **New validation rules:** Add to respective validation methods

## 🐛 Troubleshooting

### Common Issues

**"No tables found in schema"**
- Ensure `database_setup.sql` exists and contains `CREATE TABLE` statements
- Check file permissions and path

**"Regex compilation failed"**
- Update to latest `regex` crate version
- Check for invalid regex patterns in code

**"Permission denied"**
- Ensure read permissions on all scanned directories
- Check file system permissions

### Debug Mode

```bash
# Enable debug logging
RUST_LOG=debug cargo run --bin schema_validator_v2

# Verbose output
cargo run --bin schema_validator_v2 -- --verbose
```

## 📈 Roadmap

### Planned Features

- [ ] **Auto-generation** of Rust structs from schema
- [ ] **Auto-generation** of TypeScript interfaces from Rust structs
- [ ] **Schema migration validation** between versions
- [ ] **Performance optimization** for large codebases
- [ ] **Custom validation rules** via configuration file
- [ ] **Integration** with popular IDEs (VS Code extension)
- [ ] **Real-time validation** during development
- [ ] **Schema versioning** and compatibility checks

### Bonus Features (Implemented)

- ✅ **Frontend type mismatch detection**
- ✅ **Deprecated field usage highlighting**
- ✅ **Comprehensive reporting with suggestions**
- ✅ **CI/CD integration support**
- ✅ **Multiple output formats**

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Add tests** for new functionality
4. **Run** the validator on itself: `cargo run --bin schema_validator_v2`
5. **Submit** a pull request

## 📄 License

This project is part of the SIEM platform and follows the same licensing terms.

---

**Built with ❤️ for the SIEM Team**

*Ensuring schema consistency across the entire stack, one validation at a time.*