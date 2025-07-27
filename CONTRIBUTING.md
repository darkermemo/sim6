# Contributing to SIEM Platform

## 🔒 Schema Validation Requirements

**CRITICAL**: All contributions must pass schema validation before submission. This ensures database consistency across our multi-tenant SIEM platform.

### 📋 Pre-Submission Checklist

Before submitting any pull request, you **MUST**:

1. **Run Schema Validator Locally**:
   ```bash
   cargo run --bin schema_validator_v2
   ```
   - ✅ Must show "Validation passed" or 0 critical issues
   - ❌ Any critical issues will fail CI builds

2. **Check for Common Issues**:
   - No references to non-existent columns in `database_setup.sql`
   - No hardcoded `dev.` database names (use environment variables)
   - All SQL queries match actual database schema
   - Table aliases are unambiguous

### 🚫 Prohibited Patterns

**Never do these in your code:**

```rust
// ❌ BAD: Hardcoded database name
sqlx::query!("SELECT * FROM dev.events WHERE id = ?", id)

// ❌ BAD: Non-existent column
sqlx::query!("SELECT event_uuid FROM dev.events") // 'event_uuid' doesn't exist

// ❌ BAD: Ambiguous table alias
sqlx::query!("SELECT e.unknown_field FROM dev.events e")
```

**Always do this instead:**

```rust
// ✅ GOOD: Use environment variable for database
let db_name = std::env::var("DATABASE_NAME").unwrap_or("dev".to_string());
sqlx::query!(&format!("SELECT * FROM {}.events WHERE event_id = ?", db_name), id)

// ✅ GOOD: Use actual column names from schema
sqlx::query!("SELECT event_id FROM dev.events") // 'event_id' exists in schema

// ✅ GOOD: Clear, unambiguous field references
sqlx::query!("SELECT events.event_id FROM dev.events")
```

### 🔧 Setting Up Pre-Commit Hook

**Automatic validation before every commit:**

1. Create the hook:
   ```bash
   cat > .git/hooks/pre-commit << 'EOF'
   #!/bin/bash
   echo "🔍 Running schema validation..."
   cargo run --bin schema_validator_v2
   if [ $? -ne 0 ]; then
       echo "❌ Schema validation failed! Fix issues before committing."
       echo "📄 Check schema_validation_report.md for details"
       exit 1
   fi
   echo "✅ Schema validation passed!"
   EOF
   
   chmod +x .git/hooks/pre-commit
   ```

2. Test the hook:
   ```bash
   git add .
   git commit -m "test commit" # Should run validator automatically
   ```

### 📊 Understanding Validation Reports

**When validation fails, check these files:**

- `schema_validation_report.md` - Human-readable issues
- `schema_validation_report.json` - Machine-readable for CI

**Common issue types:**

| Issue Type | Severity | Description | Fix |
|------------|----------|-------------|-----|
| `MissingColumn` | Critical | SQL references non-existent column | Use correct column name from `database_setup.sql` |
| `MissingTable` | Critical | SQL references undefined table | Add table to `database_setup.sql` or fix table name |
| `HardcodedDatabaseName` | Warning | Uses hardcoded `dev.` prefix | Use environment variable or config |

### 🔄 Schema Change Workflow

**When adding new database features:**

1. **Update Schema First**:
   ```sql
   -- Add to database_setup.sql
   CREATE TABLE dev.new_feature (
       id UUID PRIMARY KEY,
       name String,
       created_at DateTime
   ) ENGINE = MergeTree() ORDER BY id;
   ```

2. **Create Matching Rust Structs**:
   ```rust
   #[derive(Serialize, Deserialize)]
   pub struct NewFeature {
       pub id: String,           // Matches 'id' column
       pub name: String,         // Matches 'name' column  
       pub created_at: String,   // Matches 'created_at' column
   }
   ```

3. **Update TypeScript Interfaces**:
   ```typescript
   interface NewFeature {
     id: string;         // Matches backend JSON
     name: string;       // Matches backend JSON
     created_at: string; // Matches backend JSON
   }
   ```

4. **Validate Everything**:
   ```bash
   cargo run --bin schema_validator_v2
   ```

### 🤖 CI/CD Integration

**GitHub Actions automatically:**

- Runs schema validation on every PR
- Fails builds if critical issues found
- Generates validation reports as artifacts
- Comments on PRs with validation results

**PR Requirements:**

- ✅ Schema validation must pass
- ✅ Include validation report summary in PR description
- ✅ Reviewer must verify schema changes are valid
- ✅ Link to `schema_validation_report.md` if schema modified

### 🎯 Code Review Guidelines

**For Reviewers:**

1. **Check PR Comments**: Look for automated schema validation results
2. **Verify Schema Changes**: If `database_setup.sql` modified, ensure validator updated
3. **Validate Consistency**: Rust structs ↔ Database columns ↔ TypeScript interfaces
4. **Test Locally**: Run `cargo run --bin schema_validator_v2` on PR branch

**For Contributors:**

1. **Run Validator First**: Before pushing any changes
2. **Fix All Critical Issues**: Warnings are acceptable, critical issues are not
3. **Update Documentation**: If adding new tables/columns
4. **Test End-to-End**: Ensure UI ↔ API ↔ Database consistency

### 🚀 Advanced: Auto-Generation

**For large schema changes, consider auto-generating code:**

```bash
# Future enhancement: Generate from schema definition
cargo run --bin schema_generator --output-rust --output-typescript
```

### 🆘 Troubleshooting

**Common validation failures:**

1. **"Column 'xyz' does not exist"**:
   - Check `database_setup.sql` for correct column name
   - Verify table name is correct
   - Ensure no typos in SQL queries

2. **"Hardcoded database name 'dev.'"**:
   - Replace with environment variable
   - Use configuration-based database naming

3. **"Table 'unknown' referenced"**:
   - Add missing table definition to `database_setup.sql`
   - Fix table name in SQL query
   - Check for typos in table references

### 📞 Getting Help

- **Schema Issues**: Check `schema_validation_report.md`
- **CI Failures**: Review GitHub Actions logs
- **Questions**: Ask in team chat with validation report attached

---

**Remember**: Schema consistency prevents production bugs, data corruption, and deployment failures. The validator is your friend! 🛡️