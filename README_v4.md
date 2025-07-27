# Multi-Layer Schema Validator v4.0

🚀 **Advanced schema validation for modern full-stack applications**

A comprehensive validation tool that ensures consistency across database schemas, backend code, frontend interfaces, GraphQL schemas, and OpenAPI specifications.

## 🌟 Features

### Core Capabilities
- **Multi-Layer Validation**: Database ↔ Backend ↔ Frontend ↔ GraphQL ↔ OpenAPI
- **ClickHouse Support**: Advanced parsing of ClickHouse `CREATE TABLE` statements with nested types
- **Structured Parsing**: AST-based parsing for Rust and TypeScript (no regex for SQL)
- **Environment Support**: Multiple schemas/environments (dev, staging, prod)
- **Cross-Layer Analysis**: Detect mismatches between different application layers
- **Comprehensive Reporting**: JSON and Markdown reports with detailed insights

### Advanced Features
- **Parallel Processing**: Fast validation with multi-threaded scanning
- **Watch Mode**: Automatic re-validation on file changes
- **Coverage Analysis**: Layer coverage metrics and thresholds
- **CI/CD Integration**: `--fail-on-critical` for build pipeline integration
- **Extensible Architecture**: Ready for GraphQL and OpenAPI integration

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Database     │◄──►│     Backend     │◄──►│    Frontend     │
│   (ClickHouse)  │    │     (Rust)      │    │  (TypeScript)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                       ▲                       ▲
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     GraphQL     │    │  Schema Validator │    │     OpenAPI     │
│    (Future)     │    │       v4.0        │    │    (Future)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd sim6

# Build the validator
cargo build --release --bin schema_validator_v4

# Or build with all features
cargo build --release --bin schema_validator_v4 --features full
```

### Basic Usage

```bash
# Validate with single environment
./target/release/schema_validator_v4 \
  --schema database_setup.sql \
  --rust-source src \
  --typescript-source frontend/src \
  --output reports/

# Validate with environment configuration
./target/release/schema_validator_v4 \
  --config environments.json \
  --environment production \
  --fail-on-critical
```

## 📋 Command Line Options

### Core Options
```bash
-c, --config <CONFIG_FILE>           Environment configuration file (JSON)
-e, --environment <ENV_NAME>         Environment to validate [default: default]
-s, --schema <SCHEMA_FILE>           Database schema file (database_setup.sql)
-o, --output <OUTPUT_DIR>            Output directory for reports [default: .]
```

### Source Directories
```bash
-r, --rust-source <RUST_DIR>         Rust source directory (can be repeated)
-t, --typescript-source <TS_DIR>     TypeScript source directory (can be repeated)
-g, --graphql-schema <GRAPHQL_FILE>  GraphQL schema file (can be repeated)
-a, --openapi-spec <OPENAPI_FILE>    OpenAPI specification file (can be repeated)
```

### Validation Options
```bash
-l, --layers <LAYERS>                Layers to validate [default: database,backend]
    --cross-layer-only               Only perform cross-layer validation
    --coverage-threshold <PERCENT>   Minimum coverage percentage [default: 80]
-f, --fail-on-critical              Exit with non-zero code on critical issues
```

### Advanced Options
```bash
-p, --parallel                       Enable parallel processing
-w, --watch                         Watch for file changes and re-validate
    --cache-dir <CACHE_DIR>         Directory for caching parsed results
    --exclude <PATTERNS>            File patterns to exclude (can be repeated)
    --include-tests                 Include test files in validation
    --report-format <FORMAT>        Report format: json, markdown, both [default: both]
-v, --verbose                       Enable verbose output
```

## 🔧 Configuration

### Environment Configuration File

Create an `environments.json` file to define multiple environments:

```json
[
  {
    "name": "development",
    "schema_file": "database_setup.sql",
    "database_name": "dev",
    "rust_source_dirs": ["src", "siem_api/src"],
    "typescript_source_dirs": ["frontend/src"],
    "graphql_schema_files": ["schema/schema.graphql"],
    "openapi_spec_files": ["api/openapi.yaml"]
  },
  {
    "name": "production",
    "schema_file": "database_setup_prod.sql",
    "database_name": "prod",
    "rust_source_dirs": ["src", "siem_api/src"],
    "typescript_source_dirs": ["frontend/src"],
    "graphql_schema_files": ["schema/schema.graphql"],
    "openapi_spec_files": ["api/openapi.yaml"]
  }
]
```

## 🔍 Validation Layers

### 1. Database Layer (ClickHouse)
- Parses `CREATE TABLE` statements with advanced ClickHouse types
- Supports nested types: `Map(String, String)`, `Array(String)`, `LowCardinality`
- Extracts table metadata: engines, partitions, order by clauses
- Identifies views and materialized views

### 2. Backend Layer (Rust)
- AST-based parsing using `syn` crate
- Detects SQL in `sqlx::query!`, `format!`, and string literals
- Extracts table and column references from SQL queries
- Validates against database schema

### 3. Frontend Layer (TypeScript)
- Parses TypeScript interfaces using `swc_ecma_parser`
- Extracts type definitions and property mappings
- Compares with backend data structures
- Validates API response types

### 4. GraphQL Layer (Future)
- Parse GraphQL schema definitions
- Validate against database and backend types
- Ensure resolver consistency

### 5. OpenAPI Layer (Future)
- Parse OpenAPI/Swagger specifications
- Validate API endpoints against backend routes
- Ensure request/response schema consistency

## 📊 Reports

### JSON Report Structure
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "environment": "production",
  "total_files_scanned": {
    "Backend": 45,
    "Frontend": 23,
    "Database": 1
  },
  "summary": {
    "critical_issues": 2,
    "warnings": 15,
    "cross_layer_mismatches": 3,
    "layer_coverage": {
      "Database": 100.0,
      "Backend": 85.5,
      "Frontend": 72.3
    }
  },
  "cross_layer_validation": {
    "database_backend_mismatches": [...],
    "backend_frontend_mismatches": [...]
  }
}
```

### Markdown Report Features
- Executive summary with key metrics
- Layer coverage analysis
- Cross-layer mismatch details
- Critical issues and warnings
- Actionable recommendations

## 🔗 Cross-Layer Validation

### Database ↔ Backend
- Validates SQL queries against database schema
- Detects missing tables and columns
- Identifies type mismatches

### Backend ↔ Frontend
- Compares Rust structs with TypeScript interfaces
- Validates API response types
- Ensures data consistency

### Database ↔ Frontend
- Direct validation of database columns against frontend types
- Identifies missing mappings
- Ensures end-to-end type safety

## 🚦 CI/CD Integration

### GitHub Actions Example
```yaml
name: Schema Validation
on: [push, pull_request]

jobs:
  validate-schema:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Build validator
        run: cargo build --release --bin schema_validator_v4
      - name: Run validation
        run: |
          ./target/release/schema_validator_v4 \
            --config environments.json \
            --environment production \
            --fail-on-critical \
            --coverage-threshold 85
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: validation-reports
          path: schema_validation_report.*
```

### Jenkins Pipeline Example
```groovy
pipeline {
    agent any
    stages {
        stage('Schema Validation') {
            steps {
                sh 'cargo build --release --bin schema_validator_v4'
                sh '''./target/release/schema_validator_v4 \
                      --config environments.json \
                      --environment ${ENVIRONMENT} \
                      --fail-on-critical'''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'schema_validation_report.*'
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: '.',
                        reportFiles: 'schema_validation_report.md',
                        reportName: 'Schema Validation Report'
                    ])
                }
            }
        }
    }
}
```

## 🎯 Use Cases

### Development Workflow
1. **Pre-commit Validation**: Validate changes before committing
2. **Watch Mode**: Continuous validation during development
3. **IDE Integration**: Real-time feedback on schema mismatches

### Production Deployment
1. **Environment Validation**: Ensure schema consistency across environments
2. **Migration Validation**: Validate database migrations
3. **API Compatibility**: Ensure backward compatibility

### Quality Assurance
1. **Coverage Analysis**: Measure validation coverage across layers
2. **Regression Testing**: Detect schema regressions
3. **Documentation**: Generate up-to-date schema documentation

## 🔮 Future Enhancements

### Planned Features
- **GraphQL Integration**: Full GraphQL schema validation
- **OpenAPI Support**: Complete OpenAPI specification validation
- **Database Introspection**: Live database schema comparison
- **Migration Generation**: Auto-generate migration scripts
- **IDE Plugins**: VSCode and IntelliJ extensions
- **Web Dashboard**: Interactive validation dashboard

### Extensibility
- **Plugin System**: Custom validation rules
- **Custom Parsers**: Support for additional languages
- **Webhook Integration**: Real-time notifications
- **Metrics Export**: Prometheus/Grafana integration

## 🤝 Contributing

### Development Setup
```bash
# Clone and setup
git clone <repository-url>
cd sim6
cargo build

# Run tests
cargo test

# Run with all features
cargo run --bin schema_validator_v4 --features full -- --help
```

### Code Structure
```
src/
├── schema_validator_v4.rs    # Core validation logic
├── main_v4.rs               # CLI interface
├── parsers/                 # Language-specific parsers
│   ├── clickhouse.rs        # ClickHouse schema parser
│   ├── rust.rs              # Rust AST parser
│   ├── typescript.rs        # TypeScript parser
│   ├── graphql.rs           # GraphQL parser (future)
│   └── openapi.rs           # OpenAPI parser (future)
└── validators/              # Validation logic
    ├── cross_layer.rs       # Cross-layer validation
    ├── database.rs          # Database validation
    └── consistency.rs       # Consistency checks
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- **Documentation**: See the `/docs` directory for detailed guides
- **Issues**: Report bugs and feature requests on GitHub
- **Discussions**: Join the community discussions
- **Examples**: Check `/examples` for real-world usage patterns

---

**Built with ❤️ for modern full-stack development**