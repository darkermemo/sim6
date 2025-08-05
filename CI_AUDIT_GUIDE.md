# CI Audit Guide

## Overview

The `scripts/deep_audit.sh` script has been enhanced to fail CI/CD pipelines when critical red flags are detected. This ensures code quality and security standards are maintained before merging to main branches.

## Critical Red Flags (CI Failures)

The script will **exit with code 1** and fail CI when any of these critical issues are found:

### 1. Clippy Warnings (`CLIPPY_WARNINGS`)
- **What**: Rust linting issues detected by `cargo clippy`
- **Why Critical**: Code quality and potential bugs
- **Fix**: Run `cargo clippy --fix` or address warnings manually

### 2. Test Failures (`TEST_FAILURES`)
- **What**: Unit or integration tests failing
- **Why Critical**: Broken functionality
- **Fix**: Debug and fix failing tests with `cargo test`

### 3. Security Vulnerabilities (`SECURITY_VULNERABILITIES`)
- **What**: Known CVEs in dependencies detected by `cargo audit`
- **Why Critical**: Security risks
- **Fix**: Update vulnerable dependencies or apply patches

### 4. Unsafe Code in Security Areas (`UNSAFE_CODE_SECURITY`)
- **What**: Unsafe Rust code in authentication, crypto, or security modules
- **Why Critical**: High security risk
- **Fix**: Review and eliminate unsafe code in critical areas

## Non-Critical Warnings

These issues generate warnings but don't fail CI:
- Unused dependencies
- Unsafe code in non-security areas
- Missing optional tools (Vector, ClickHouse, etc.)
- Frontend linting issues
- Missing documentation

## Usage

### Local Development
```bash
# Run full audit
./scripts/deep_audit.sh

# Check exit code
echo "Exit code: $?"
```

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Run Security Audit
  run: |
    ./scripts/deep_audit.sh
  # Will fail the job if critical issues found

# GitLab CI example
audit:
  script:
    - ./scripts/deep_audit.sh
  # Will fail the pipeline if critical issues found
```

### Checking Results

#### Success (Exit Code 0)
```
✅ All critical checks passed - ready for CI/CD
```

#### Failure (Exit Code 1)
```
❌ CLIPPY_WARNINGS: Clippy found linting issues that must be fixed
❌ TEST_FAILURES: Unit/integration tests are failing
❌ SECURITY_VULNERABILITIES: Known security vulnerabilities found in dependencies

Fix these critical issues before merging to main branch.
```

## Audit Artifacts

All audit results are stored in `target/audit/`:

- `ci_failures.txt` - Summary of critical failures
- `ci_status.txt` - Overall status (PASSED/FAILED)
- `clippy.txt` - Detailed clippy output
- `test.txt` - Test results
- `audit.txt` - Security vulnerability details
- `unsafe.txt` - Unsafe code analysis
- `summary.txt` - Complete audit summary

## Best Practices

### Before Committing
1. Run `./scripts/deep_audit.sh` locally
2. Fix any critical issues
3. Verify exit code is 0
4. Commit and push

### Fixing Common Issues

#### Clippy Warnings
```bash
# Auto-fix simple issues
cargo clippy --fix

# Manual review for complex issues
cargo clippy --workspace -- -D warnings
```

#### Test Failures
```bash
# Run specific test
cargo test test_name

# Run with output
cargo test -- --nocapture

# Run single-threaded
cargo test -- --test-threads=1
```

#### Security Vulnerabilities
```bash
# Check details
cargo audit

# Update dependencies
cargo update

# Check specific advisory
cargo audit --db /path/to/advisory-db
```

## Customization

To modify what constitutes a critical failure, edit the `track_critical_failure` calls in `scripts/deep_audit.sh`.

## Integration with Pre-commit Hooks

```bash
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: siem-audit
        name: SIEM Security Audit
        entry: ./scripts/deep_audit.sh
        language: system
        pass_filenames: false
        always_run: true
```

This ensures critical issues are caught before code reaches CI/CD pipelines.