# SIEM Platform Schema Governance Policy

**Version**: 1.0  
**Effective Date**: Immediate  
**Authority**: Development Team Lead  
**Scope**: All contributors, reviewers, and maintainers  

## 🎯 Mission Statement

This document establishes **mandatory schema validation rules** to ensure permanent database consistency across our multi-tenant SIEM platform. All code changes must comply with these rules to prevent production failures, data corruption, and deployment issues.

## 📜 Governance Rules

### Rule 1: Mandatory Schema Validation

**REQUIREMENT**: Every pull request must pass schema validation.

```bash
# MUST pass before any commit
cargo run --bin schema_validator_v2
# Exit code 0 = success, non-zero = failure
```

**Enforcement**:
- ❌ CI builds fail if validation fails
- ❌ PRs cannot be merged with critical schema issues
- ✅ Pre-commit hooks prevent invalid commits

### Rule 2: Schema Change Authority

**WHO CAN MODIFY SCHEMA**:
- Senior developers with database expertise
- Team leads and architects
- Must have peer review from another authorized person

**SCHEMA CHANGE PROCESS**:
1. Update `database_setup.sql` first
2. Update corresponding Rust structs
3. Update TypeScript interfaces
4. Run full validation suite
5. Test end-to-end functionality
6. Document changes in PR

### Rule 3: Prohibited Patterns

**NEVER ALLOWED IN CODE**:

```rust
// ❌ FORBIDDEN: Hardcoded database names
sqlx::query!("SELECT * FROM dev.events")

// ❌ FORBIDDEN: Non-existent columns
sqlx::query!("SELECT fake_column FROM dev.events")

// ❌ FORBIDDEN: Undefined tables
sqlx::query!("SELECT * FROM nonexistent_table")

// ❌ FORBIDDEN: Ambiguous aliases without clear mapping
sqlx::query!("SELECT e.unknown_field FROM dev.events e")
```

**REQUIRED PATTERNS**:

```rust
// ✅ REQUIRED: Environment-based database names
let db = env::var("DATABASE_NAME").unwrap_or("dev".to_string());
sqlx::query!(&format!("SELECT * FROM {}.events", db))

// ✅ REQUIRED: Only existing columns from schema
sqlx::query!("SELECT event_id, tenant_id FROM dev.events")

// ✅ REQUIRED: Only defined tables
sqlx::query!("SELECT * FROM dev.events") // exists in database_setup.sql

// ✅ REQUIRED: Clear, unambiguous field references
sqlx::query!("SELECT events.event_id FROM dev.events")
```

### Rule 4: CI/CD Integration Requirements

**GITHUB ACTIONS MUST**:
- Run schema validation on every PR
- Generate validation reports as artifacts
- Comment on PRs with validation results
- Block merges if critical issues exist

**VALIDATION WORKFLOW**:
```yaml
# .github/workflows/schema-validation.yml
- name: Schema Validation
  run: cargo run --bin schema_validator_v2
- name: Upload Reports
  uses: actions/upload-artifact@v3
  with:
    name: schema-validation-reports
    path: schema_validation_report.*
```

### Rule 5: Code Review Standards

**REVIEWERS MUST VERIFY**:
- [ ] Schema validation passed in CI
- [ ] No hardcoded database names
- [ ] All SQL queries reference existing schema elements
- [ ] Rust structs match database columns exactly
- [ ] TypeScript interfaces match backend JSON responses
- [ ] Validation report linked in PR description (if schema changed)

**REVIEW CHECKLIST**:
```markdown
## Schema Review Checklist
- [ ] CI schema validation passed
- [ ] No `dev.` hardcoded prefixes
- [ ] All columns exist in database_setup.sql
- [ ] Rust ↔ Database ↔ TypeScript consistency
- [ ] End-to-end testing completed
- [ ] Documentation updated if needed
```

### Rule 6: Developer Responsibilities

**BEFORE CODING**:
- Set up pre-commit hook: `./scripts/setup-pre-commit-hook.sh`
- Understand current schema: Review `database_setup.sql`
- Check existing patterns in codebase

**DURING DEVELOPMENT**:
- Run validator frequently: `cargo run --bin schema_validator_v2`
- Fix issues immediately, don't accumulate technical debt
- Test changes against actual database

**BEFORE SUBMITTING PR**:
- Validation must pass with 0 critical issues
- Include validation report summary in PR description
- Test all affected API endpoints
- Verify UI still functions correctly

### Rule 7: Emergency Procedures

**PRODUCTION SCHEMA ISSUES**:
1. **Immediate**: Rollback to last known good state
2. **Assessment**: Run schema validator against production
3. **Fix**: Apply minimal changes to resolve critical issues
4. **Validation**: Re-run full validation suite
5. **Documentation**: Update incident report with lessons learned

**BYPASS PROCEDURES** (Emergency Only):
```bash
# Only for critical production fixes
git commit --no-verify -m "EMERGENCY: bypass validation"
# Must be followed by immediate validation fix
```

## 🔧 Implementation Details

### Validation Severity Levels

| Level | Description | CI Action | Developer Action |
|-------|-------------|-----------|------------------|
| **Critical** | Missing columns/tables, schema mismatches | ❌ Fail build | Must fix before merge |
| **Warning** | Hardcoded names, style issues | ⚠️ Continue with warning | Should fix, not blocking |
| **Info** | Suggestions, optimizations | ✅ Pass | Optional improvements |

### Validation Metrics

**TRACKED METRICS**:
- Total SQL references found
- Critical issues count
- Warning count
- Schema coverage percentage
- Validation execution time

**SUCCESS CRITERIA**:
- Critical issues: **0** (required)
- Warnings: **< 10** (recommended)
- Schema coverage: **> 95%** (target)

### Tool Configuration

**VALIDATOR SETTINGS**:
```rust
// schema_validator_v2.rs configuration
const MAX_CRITICAL_ISSUES: usize = 0;  // Zero tolerance
const MAX_WARNINGS: usize = 100;       // Flexible limit
const SCHEMA_FILE: &str = "database_setup.sql";
const OUTPUT_FORMATS: &[&str] = &["markdown", "json"];
```

## 📊 Monitoring & Reporting

### Daily Monitoring

**AUTOMATED CHECKS**:
- Nightly schema validation runs
- Trend analysis of validation metrics
- Alert on schema drift detection

**WEEKLY REPORTS**:
- Schema consistency health score
- Top validation issues by frequency
- Developer compliance metrics

### Compliance Tracking

**METRICS TO TRACK**:
- % of PRs passing validation on first attempt
- Average time to fix validation issues
- Number of emergency bypasses
- Schema change frequency

## 🎓 Training & Onboarding

### New Developer Checklist

**REQUIRED TRAINING**:
- [ ] Read this governance document
- [ ] Complete schema validation tutorial
- [ ] Set up pre-commit hooks
- [ ] Practice with validation tool
- [ ] Shadow experienced developer on schema change

**CERTIFICATION PROCESS**:
1. Pass schema validation quiz
2. Successfully complete practice schema change
3. Demonstrate proper validation workflow
4. Get sign-off from team lead

## 🚨 Violations & Consequences

### Violation Types

**MINOR VIOLATIONS**:
- Forgetting to run validator before commit
- Submitting PR with warnings
- Missing validation report in PR description

**MAJOR VIOLATIONS**:
- Bypassing validation without emergency justification
- Merging PR with critical schema issues
- Modifying schema without proper review

**CRITICAL VIOLATIONS**:
- Deploying code that breaks production schema
- Ignoring schema validation failures
- Deliberately circumventing governance rules

### Enforcement Actions

**PROGRESSIVE DISCIPLINE**:
1. **First offense**: Coaching and re-training
2. **Second offense**: Formal warning and mandatory review
3. **Third offense**: Temporary loss of merge privileges
4. **Critical violation**: Immediate escalation to management

## 📋 Appendices

### Appendix A: Quick Reference Commands

```bash
# Essential commands for daily use
cargo run --bin schema_validator_v2          # Run validation
./scripts/setup-pre-commit-hook.sh           # Setup automation
cat schema_validation_report.md              # View issues
git commit --no-verify -m "emergency"        # Emergency bypass
```

### Appendix B: Common Issue Resolutions

**"Column 'xyz' does not exist"**:
1. Check `database_setup.sql` for correct column name
2. Verify table name is correct
3. Look for typos in SQL query
4. Ensure column was added to schema

**"Hardcoded database name 'dev.'"**:
1. Replace with environment variable
2. Use configuration-based naming
3. Update all instances consistently

### Appendix C: Schema Change Template

```markdown
## Schema Change Request

**Type**: [Addition/Modification/Deletion]
**Tables Affected**: [list tables]
**Backward Compatible**: [Yes/No]

### Changes
- [ ] Updated database_setup.sql
- [ ] Updated Rust structs
- [ ] Updated TypeScript interfaces
- [ ] Ran schema validation
- [ ] Tested end-to-end

### Validation Results
```
Critical Issues: 0
Warnings: X
Validation Status: PASSED
```

### Impact Assessment
[Describe impact on existing data, APIs, UI]
```

---

**This governance policy is mandatory and non-negotiable. Compliance ensures the stability and reliability of our SIEM platform.** 🛡️

**Questions?** Contact the development team lead or check the validation reports for specific guidance.