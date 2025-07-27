# SIEM Schema Validator

🛡️ **Automatic schema validation tool to prevent database schema mismatches**

This tool validates that the ClickHouse database schema matches the expected structure used by the Rust API handlers, preventing runtime errors caused by missing or mismatched columns.

## ✅ What It Validates

- **Missing Columns**: Detects when API code queries columns that don't exist in the database
- **Deprecated Columns**: Identifies removed columns that are still being referenced
- **API Response Structure**: Ensures endpoints return expected data formats
- **Schema Consistency**: Validates that database schema matches API expectations

## 🚀 Quick Start

### Prerequisites

1. Ensure the SIEM API server is running on `localhost:8080`
2. Have a valid admin token in `fresh_admin_token.txt`
3. Rust toolchain installed

### Run Validation

```bash
# From the project root directory
cargo run --bin schema_validator
```

### Run Tests

```bash
cargo test
```

## 📋 Example Output

### ✅ Success Case
```
🛡️ SIEM Schema Validator
========================
🔍 Validating API schema against ClickHouse...
✅ Tenants endpoint: OK
✅ Alerts endpoint: OK
✅ Schema validation passed!

🎉 All schema validations passed!
   - No missing columns detected
   - No deprecated columns found
   - API endpoints returning expected data
```

### ❌ Failure Case
```
🛡️ SIEM Schema Validator
========================
🔍 Validating API schema against ClickHouse...

💥 Schema validation failed: Required column 'status' not found in alerts API response
   Please fix the schema mismatch before proceeding.
```

## 🔧 Integration Options

### Option 1: Pre-Deployment Check

Add to your deployment script:

```bash
#!/bin/bash
echo "Running schema validation..."
cargo run --bin schema_validator
if [ $? -ne 0 ]; then
    echo "Schema validation failed. Deployment aborted."
    exit 1
fi
echo "Schema validation passed. Proceeding with deployment..."
```

### Option 2: CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
- name: Validate Database Schema
  run: |
    # Start services
    docker-compose up -d clickhouse
    cargo run --bin siem_api &
    sleep 10
    
    # Run validation
    cargo run --bin schema_validator
```

### Option 3: Development Workflow

Add to your `Makefile`:

```makefile
validate-schema:
	@echo "Validating database schema..."
	@cargo run --bin schema_validator

test: validate-schema
	@cargo test

deploy: validate-schema
	@echo "Schema validation passed. Deploying..."
	@./deploy.sh
```

## 🏗️ Architecture

### Schema Definition

The validator uses a hardcoded schema definition that matches the actual ClickHouse tables:

```rust
// Expected schema for dev.tenants
TableSchema {
    columns: vec![
        ColumnDefinition { name: "tenant_id", column_type: "String", required: true },
        ColumnDefinition { name: "tenant_name", column_type: "String", required: true },
        ColumnDefinition { name: "is_active", column_type: "UInt8", required: true },
        ColumnDefinition { name: "created_at", column_type: "UInt32", required: true },
    ],
}
```

### Validation Process

1. **API Health Check**: Verifies that API endpoints are accessible
2. **Response Structure Validation**: Checks that API responses contain expected columns
3. **Deprecated Column Detection**: Identifies columns that should no longer exist
4. **Required Column Verification**: Ensures all required columns are present

## 🔄 Maintenance

### Adding New Tables

When adding new tables to the database:

1. Update the `get_expected_schema()` function in `schema_validator.rs`
2. Add corresponding API endpoint validation
3. Update tests to cover the new table

### Modifying Existing Tables

When changing table schemas:

1. Update the column definitions in `get_expected_schema()`
2. Ensure API handlers are updated to match
3. Run the validator to confirm compatibility

## 🐛 Common Issues

### "No bin target named schema_validator"

**Solution**: Run from the project root directory where `Cargo.toml` is located.

### "Failed to read admin token file"

**Solution**: Ensure `fresh_admin_token.txt` exists and contains a valid JWT token.

### "API failed with status: 401"

**Solution**: Generate a new admin token or check that the API server is running.

### "API failed with status: 500"

**Solution**: This indicates a schema mismatch. Check the API server logs for specific column errors.

## 📊 Benefits

- **Prevents Production Failures**: Catches schema mismatches before deployment
- **Faster Development**: Immediate feedback on schema changes
- **Documentation**: Serves as living documentation of expected schema
- **CI/CD Integration**: Automated validation in build pipelines
- **Zero Runtime Overhead**: Validation runs separately from application code

## 🔮 Future Enhancements

- **Direct ClickHouse Integration**: Query `DESCRIBE TABLE` directly instead of API responses
- **Schema Migration Validation**: Verify migration scripts against expected changes
- **Performance Impact Analysis**: Measure query performance with schema changes
- **Multi-Environment Support**: Validate against different database environments
- **Custom Validation Rules**: Allow project-specific validation logic

---

**Note**: This validator was created to address the specific issue where API handlers were querying non-existent columns (`status` in tenants, `assignee_id` in alerts), causing 500 Internal Server Errors. It ensures that such mismatches are caught early in the development cycle.