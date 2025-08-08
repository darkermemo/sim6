# No-Surprises CI Workflow

> **Golden Rule: Never push until `scripts/ci_local.sh` is green! ✅**

This document describes a comprehensive workflow that ensures you catch every audit/CI failure locally before pushing to GitHub, eliminating CI surprises and failed builds.

## Overview

The "no-surprises" workflow consists of:
1. **Mirror the CI toolchain locally** - Same tools, same versions as GitHub Actions
2. **Run identical checks locally** - Catch issues before they hit CI  
3. **Automated enforcement** - Pre-push hooks prevent bad commits
4. **Quick iteration** - Fast feedback loop for fixing issues

## Quick Start

### 1. One-time Setup

```bash
# Install all required tools
./scripts/setup_ci_toolchain.sh

# Set up pre-push hook
./scripts/setup_pre_push_hook.sh
```

### 2. Daily Development Workflow

```bash
# Before each push, run local CI
./scripts/ci_local.sh

# If green, push proceeds automatically
git push origin main
```

That's it! The pre-push hook will automatically run CI checks and block bad pushes.

## Detailed Setup

### Step 1: Install CI Toolchain

The toolchain installer sets up all tools that GitHub Actions uses:

```bash
./scripts/setup_ci_toolchain.sh
```

**What it installs:**

#### Rust & Core Tooling
- `rustup update stable`
- `rustfmt`, `clippy`, `rust-analyzer`
- `cargo-udeps`, `cargo-audit`, `cargo-geiger`

#### Lint & Validation Tools
- `spectral` (OpenAPI linting)
- `yaml-lint` (YAML validation)  
- `swagger-parser` (API validation)
- `vector` (Vector config validation)
- `yamllint` (YAML syntax checking)

#### System Dependencies
- **macOS**: `brew install graphviz mermaid-cli pandoc wkhtmltopdf`
- **Linux**: `apt install build-essential graphviz pandoc wkhtmltopdf`

#### Optional Tools
- `act` (Run GitHub Actions locally)
- `docker` (Container-based testing)

### Step 2: Local CI Script

The `scripts/ci_local.sh` script mirrors every check from GitHub Actions:

```bash
./scripts/ci_local.sh
```

**What it validates:**

#### 1. Rust Code Quality
```bash
cargo fmt --all -- --check        # Code formatting
cargo clippy --workspace --all-targets --all-features -D warnings
cargo test --workspace             # All tests
cargo build --release --workspace  # Release builds
```

#### 2. Security & Dependencies
```bash
cargo udeps --workspace --all-targets  # Unused dependencies
cargo audit --deny warnings            # Security vulnerabilities
cargo geiger -q                        # Unsafe code scan
```

#### 3. Schema Validation
```bash
./target/release/schema_validator_v2   # Database schema consistency
```

#### 4. Configuration Validation
```bash
vector validate --no-environment config/vector.toml
spectral lint openapi.json
yamllint **/*.yml
```

#### 5. Frontend Validation (if applicable)
```bash
cd siem_ui
npm ci
npx tsc --noEmit                  # TypeScript compilation
npx eslint src --max-warnings 0   # Linting
npm test -- --watchAll=false      # Tests
npm run generate-api              # API client generation
```

#### 6. Database & API Checks
```bash
# SQL syntax validation
grep -q "CREATE TABLE" database_setup.sql

# API endpoint tests (if backend running)
node comprehensive_api_test.js
```

### Step 3: Pre-Push Hook

The pre-push hook automatically runs CI before every push:

```bash
./scripts/setup_pre_push_hook.sh
```

**How it works:**
- Installs `.git/hooks/pre-push` 
- Runs `scripts/ci_local.sh` before each push
- Blocks push if any check fails
- Provides clear error messages and fix suggestions

**Emergency bypass** (use sparingly):
```bash
# Method 1: Environment variable
SKIP_CI_HOOK=1 git push origin main

# Method 2: Convenience script
./scripts/emergency_push.sh origin main
```

## Daily Workflow

### Normal Development Flow

```bash
# 1. Make changes
git add .
git commit -m "feat: add new feature"

# 2. Push (pre-push hook runs automatically)
git push origin feature-branch

# ✅ If CI passes: push proceeds
# ❌ If CI fails: push blocked with clear error messages
```

### Manual CI Validation

```bash
# Run CI manually anytime
./scripts/ci_local.sh

# Run specific checks
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features
cargo test --workspace
```

### Troubleshooting Failed Checks

#### Common Failures & Quick Fixes

| **Error Type** | **Log Message** | **Quick Fix** |
|----------------|-----------------|---------------|
| **Formatting** | `cargo fmt -- --check failed` | `cargo fmt --all` |
| **Linting** | `cargo clippy warnings` | `cargo clippy --fix` or manually fix warnings |
| **Tests** | `cargo test failed` | Fix failing tests, run `cargo test` |
| **Unused deps** | `cargo udeps found unused` | Remove unused dependencies from `Cargo.toml` |
| **Security** | `cargo audit - CVE found` | `cargo update -p <package>` or pin version |
| **Schema** | `Schema validation failed` | Check ClickHouse/Rust/TypeScript consistency |
| **OpenAPI** | `spectral lint failed` | Fix OpenAPI schema issues |
| **Vector** | `vector validate failed` | Fix Vector configuration syntax |

#### Detailed Debugging

```bash
# Run individual checks for debugging
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --verbose
./target/release/schema_validator_v2

# Frontend specific
cd siem_ui
npx tsc --noEmit
npx eslint src --ext .ts,.tsx
```

## Advanced Usage

### Running GitHub Actions Locally

Use `act` to run the exact GitHub Actions workflow locally:

```bash
# Install act
brew install act  # macOS
# or download from: https://github.com/nektos/act

# Run specific job
act -j build
act -j test
act -j schema-validation

# Run all workflows
act
```

### Parallel Development

For teams, coordinate CI validation:

```bash
# Check if your changes will conflict
git fetch origin
git merge origin/main  # or rebase
./scripts/ci_local.sh   # Validate merged state
```

### Continuous Validation

Set up file watchers for instant feedback:

```bash
# Install cargo-watch
cargo install cargo-watch

# Watch for changes and run tests
cargo watch -x test

# Watch and run full CI
cargo watch -s './scripts/ci_local.sh'
```

## Performance Optimization

### Caching for Speed

The CI script is optimized for speed:

```bash
# Incremental builds
export CARGO_INCREMENTAL=1

# Parallel compilation  
export CARGO_BUILD_JOBS=8

# Target caching
export CARGO_TARGET_DIR=target
```

### Selective Checks

For rapid iteration, run subset of checks:

```bash
# Just formatting and basic linting
cargo fmt --all -- --check && cargo clippy --workspace

# Quick test subset
cargo test --workspace -- --test-threads=8

# Schema validation only
./target/release/schema_validator_v2
```

## Integrations

### IDE Integration

#### VS Code
```json
// .vscode/tasks.json
{
  "tasks": [
    {
      "label": "Run Local CI",
      "type": "shell", 
      "command": "./scripts/ci_local.sh",
      "group": "build",
      "presentation": { "reveal": "always" }
    }
  ]
}
```

#### IntelliJ/CLion
- Add "External Tool": `./scripts/ci_local.sh`
- Bind to keyboard shortcut (e.g., Ctrl+Shift+C)

### Pre-commit Hooks

For even earlier validation:

```bash
# Install pre-commit
pip install pre-commit

# Add .pre-commit-config.yaml
cat > .pre-commit-config.yaml << EOF
repos:
  - repo: local
    hooks:
      - id: local-ci
        name: Local CI
        entry: ./scripts/ci_local.sh
        language: system
        always_run: true
        pass_filenames: false
EOF

# Install the hook
pre-commit install
```

## Maintenance

### Keeping in Sync with CI

When GitHub Actions workflows change:

1. **Update `scripts/ci_local.sh`** to match new checks
2. **Update tool versions** in `scripts/setup_ci_toolchain.sh`  
3. **Test changes** with `./scripts/ci_local.sh`
4. **Update documentation** if workflow changes

### Regular Updates

```bash
# Monthly: Update all tools
./scripts/setup_ci_toolchain.sh

# Weekly: Update Rust toolchain
rustup update stable

# As needed: Update Node.js packages
npm update -g @stoplight/spectral-cli yaml-lint
```

## Troubleshooting

### Common Issues

#### "Tool not found" errors
```bash
# Re-run toolchain setup
./scripts/setup_ci_toolchain.sh

# Check PATH
echo $PATH
which cargo clippy
```

#### "Permission denied" errors
```bash
# Fix script permissions
chmod +x scripts/*.sh

# Fix hook permissions
chmod +x .git/hooks/pre-push
```

#### CI passes locally but fails on GitHub
```bash
# Check for OS-specific issues
act -j build  # Run exact GitHub Action locally

# Check for uncommitted files
git status
git diff
```

#### Hook not triggering
```bash
# Verify hook exists and is executable
ls -la .git/hooks/pre-push

# Re-install hook
./scripts/setup_pre_push_hook.sh
```

### Getting Help

1. **Check logs**: CI script provides detailed error messages
2. **Run manually**: Execute failing commands individually
3. **Compare with CI**: Check GitHub Actions logs for differences
4. **Emergency bypass**: Use `SKIP_CI_HOOK=1` for urgent pushes

## Best Practices

### Development Habits

1. **Run CI frequently** during development
2. **Fix issues immediately** rather than accumulating them
3. **Use emergency bypass sparingly** and fix issues quickly after
4. **Keep tools updated** to match CI environment

### Team Coordination

1. **Standardize on tool versions** across the team
2. **Share CI script updates** when workflows change  
3. **Document exceptions** when bypass is necessary
4. **Review CI logs** in PR discussions

### Performance Tips

1. **Use incremental builds** with `CARGO_INCREMENTAL=1`
2. **Parallel test execution** with `--test-threads=N`
3. **Cache dependencies** in CI and locally
4. **Run subset checks** during rapid iteration

---

## Summary

The no-surprises CI workflow guarantees that:

✅ **Every push passes CI** - No more red builds
✅ **Fast feedback** - Catch issues in seconds, not minutes  
✅ **Identical environment** - Same tools, same checks as CI
✅ **Automatic enforcement** - Can't push bad code
✅ **Emergency flexibility** - Bypass available when needed

**Result: Zero CI failures, faster development, higher confidence! 🚀**