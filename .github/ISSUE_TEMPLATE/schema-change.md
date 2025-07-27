---
name: Schema Change Request
about: Request changes to database schema, tables, or columns
title: '[SCHEMA] '
labels: ['schema-change', 'database', 'needs-validation']
assignees: ''
---

## 🔒 Schema Change Request

**⚠️ IMPORTANT**: All schema changes must pass validation before implementation.

### Change Type
- [ ] New table creation
- [ ] New column addition
- [ ] Column modification
- [ ] Table modification
- [ ] Column/table deletion
- [ ] Index changes
- [ ] Constraint changes

### Affected Components
- [ ] Database schema (`database_setup.sql`)
- [ ] Rust API structs (`siem_api/src/`)
- [ ] TypeScript interfaces (`siem_ui/src/types/`)
- [ ] SQL queries in handlers
- [ ] Consumer processing logic
- [ ] UI components

### Proposed Changes

#### Database Schema Changes
```sql
-- Paste your proposed SQL changes here
-- Example:
-- ALTER TABLE dev.events ADD COLUMN new_field String;
```

#### Rust Struct Changes
```rust
// Paste your proposed Rust struct changes here
// Example:
// pub struct Event {
//     pub new_field: String,
// }
```

#### TypeScript Interface Changes
```typescript
// Paste your proposed TypeScript interface changes here
// Example:
// interface Event {
//   newField: string;
// }
```

### Business Justification

**Why is this change needed?**
<!-- Describe the business requirement or technical need -->

**What problem does it solve?**
<!-- Explain the current limitation or issue -->

**Alternative solutions considered?**
<!-- List other approaches you considered and why they were rejected -->

### Impact Assessment

#### Backward Compatibility
- [ ] ✅ Fully backward compatible
- [ ] ⚠️ Requires migration script
- [ ] ❌ Breaking change (requires coordination)

#### Data Migration Required
- [ ] No migration needed
- [ ] Simple column addition (default values)
- [ ] Complex data transformation required
- [ ] Data backfill needed

#### Performance Impact
- [ ] No performance impact expected
- [ ] Minor performance impact
- [ ] Significant performance impact (requires optimization)
- [ ] Requires performance testing

#### API Changes
- [ ] No API changes
- [ ] New endpoints only
- [ ] Modified existing endpoints
- [ ] Breaking API changes

#### UI Changes
- [ ] No UI changes
- [ ] New UI components
- [ ] Modified existing components
- [ ] Breaking UI changes

### Validation Checklist

**Before Implementation**:
- [ ] Schema change documented in this issue
- [ ] Impact assessment completed
- [ ] Team review and approval obtained
- [ ] Migration strategy defined (if needed)

**During Implementation**:
- [ ] Updated `database_setup.sql`
- [ ] Updated Rust structs to match schema
- [ ] Updated TypeScript interfaces to match backend
- [ ] Updated SQL queries in affected handlers
- [ ] Ran `cargo run --bin schema_validator_v2`
- [ ] Validation passed with 0 critical issues
- [ ] End-to-end testing completed

**After Implementation**:
- [ ] PR includes validation report summary
- [ ] CI schema validation passes
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Deployment plan confirmed

### Testing Strategy

**Unit Tests**:
- [ ] Database schema tests
- [ ] API endpoint tests
- [ ] Data serialization tests

**Integration Tests**:
- [ ] End-to-end API tests
- [ ] UI integration tests
- [ ] Database migration tests

**Manual Testing**:
- [ ] UI functionality verification
- [ ] API response validation
- [ ] Performance impact assessment

### Rollback Plan

**If issues arise after deployment**:
1. **Immediate action**: <!-- Describe immediate rollback steps -->
2. **Data recovery**: <!-- Describe how to recover data if needed -->
3. **Communication**: <!-- Who to notify and how -->

### Schema Validation Results

```bash
# Run this command and paste results here
$ cargo run --bin schema_validator_v2

# Expected output:
# ✅ Validation passed
# 🚨 Critical Issues: 0
# ⚠️  Warnings: X
# 📋 Database Tables: XX
# 🔍 SQL References: XXX
```

**Validation Report**: 
<!-- Link to schema_validation_report.md or paste summary -->

### Dependencies

**Blocked by**:
<!-- List any issues or PRs that must be completed first -->

**Blocks**:
<!-- List any issues or PRs that depend on this change -->

**Related issues**:
<!-- Link to related schema changes or feature requests -->

### Timeline

**Proposed schedule**:
- [ ] Schema design review: [Date]
- [ ] Implementation start: [Date]
- [ ] Validation completion: [Date]
- [ ] Code review: [Date]
- [ ] Deployment: [Date]

### Additional Notes

<!-- Any additional context, concerns, or considerations -->

---

### For Reviewers

**Review Checklist**:
- [ ] Business justification is clear and valid
- [ ] Impact assessment is thorough
- [ ] Schema changes follow naming conventions
- [ ] Backward compatibility considered
- [ ] Migration strategy is sound
- [ ] Testing strategy is comprehensive
- [ ] Rollback plan is feasible

**Schema Review**:
- [ ] Column names follow existing patterns
- [ ] Data types are appropriate
- [ ] Indexes are properly planned
- [ ] Constraints are necessary and sufficient
- [ ] No redundant or unnecessary changes

**Code Review Requirements**:
- [ ] Schema validation must pass
- [ ] All affected components updated
- [ ] Tests cover new functionality
- [ ] Documentation is updated
- [ ] Performance impact is acceptable

---

**⚠️ REMINDER**: This change will be automatically validated by our schema validation system. Ensure all validation requirements are met before requesting review.