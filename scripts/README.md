# Scripts Directory - No-Surprises CI Workflow

This directory contains scripts for the "no-surprises" CI workflow that ensures you catch every CI failure locally before pushing.

## Quick Start

```bash
# 1. One-time setup
./scripts/setup_ci_toolchain.sh  # Install all required tools
./scripts/setup_pre_push_hook.sh  # Set up automatic validation

# 2. Daily usage
./scripts/ci_local.sh             # Run CI manually
git push origin main              # Automatic CI validation before push
```

## Scripts Overview

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `ci_local.sh` | **Main CI script** - mirrors GitHub Actions | Before every push, during development |
| `setup_ci_toolchain.sh` | **One-time setup** - installs all required tools | Initial setup, tool updates |
| `setup_pre_push_hook.sh` | **Hook installer** - sets up automatic validation | Initial setup, hook updates |
| `emergency_push.sh` | **Bypass script** - emergency push without CI | Urgent pushes only |

## Scripts Details

### `ci_local.sh` - Local CI Validation
**Main script that mirrors all GitHub Actions checks**

```bash
./scripts/ci_local.sh
```

**What it does:**
- ✅ Rust formatting (`cargo fmt --check`)
- ✅ Rust linting (`cargo clippy`)  
- ✅ Build verification (`cargo build`)
- ✅ Test execution (`cargo test`)
- ✅ Security audit (`cargo audit`)
- ✅ Unused dependency check (`cargo udeps`)
- ✅ Schema validation (custom validator)
- ✅ OpenAPI validation (`spectral lint`)
- ✅ Vector config validation
- ✅ Frontend validation (TypeScript, ESLint, tests)
- ✅ Database schema checks
- ✅ YAML validation

**Exit codes:**
- `0` - All checks passed ✅
- `1` - One or more checks failed ❌

---

### `setup_ci_toolchain.sh` - Toolchain Installation
**One-time setup script that installs all required tools**

```bash
./scripts/setup_ci_toolchain.sh
```

**What it installs:**

#### Rust Tools
- `rustfmt`, `clippy`, `rust-analyzer`
- `cargo-udeps`, `cargo-audit`, `cargo-geiger`
- `cargo-mod`, `cargo-deps`, `cargo-watch`

#### System Tools (OS-specific)
- **macOS**: `brew install graphviz pandoc wkhtmltopdf yamllint vector act`
- **Linux**: `apt install build-essential graphviz pandoc wkhtmltopdf yamllint`

#### Node.js Tools
- `@stoplight/spectral-cli` (OpenAPI linting)
- `@apidevtools/swagger-parser` (API validation)
- `yaml-lint` (YAML validation)
- `@mermaid-js/mermaid-cli` (Diagram generation)

---

### `setup_pre_push_hook.sh` - Git Hook Installation  
**Sets up automatic CI validation before every push**

```bash
./scripts/setup_pre_push_hook.sh
```

**What it does:**
- Installs `.git/hooks/pre-push` hook
- Backs up existing hook if present
- Creates `emergency_push.sh` bypass script
- Tests hook installation

**How the hook works:**
1. Runs `scripts/ci_local.sh` before every `git push`
2. If CI passes → push proceeds
3. If CI fails → push blocked with error details

**Bypass options:**
```bash
# Environment variable bypass
SKIP_CI_HOOK=1 git push origin main

# Convenience script bypass  
./scripts/emergency_push.sh origin main
```

---

### `emergency_push.sh` - Emergency Bypass
**Emergency push script that bypasses CI validation**

```bash
./scripts/emergency_push.sh origin main
```

**When to use:**
- 🚨 Production outages requiring immediate fixes
- 🚨 Time-critical deployments
- 🚨 CI infrastructure issues

**⚠️ Warning:** Use sparingly! Fix CI issues ASAP after emergency push.

## Workflow Examples

### Normal Development Flow
```bash
# Make changes
git add .
git commit -m "feat: add new feature"

# Push (pre-push hook runs automatically)
git push origin feature-branch
# → runs scripts/ci_local.sh automatically
# → if ✅ green: push proceeds  
# → if ❌ red: push blocked
```

### Manual CI Validation
```bash
# Run full CI manually
./scripts/ci_local.sh

# Run specific checks
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features
cargo test --workspace
```

### Emergency Situations
```bash
# Production is down, need to push fix immediately
./scripts/emergency_push.sh origin main

# Alternative syntax
SKIP_CI_HOOK=1 git push origin main

# After emergency: fix CI issues
./scripts/ci_local.sh  # See what's broken
# Fix issues...
git commit -m "fix: resolve CI issues"
git push origin main   # Normal validation resumes
```

## Troubleshooting

### Common Issues & Solutions

#### "Command not found" errors
```bash
# Re-run toolchain setup
./scripts/setup_ci_toolchain.sh

# Check specific tool
which cargo-clippy
which spectral
```

#### CI passes locally but fails on GitHub
```bash
# Run exact GitHub Action locally
act -j build

# Check for uncommitted changes
git status
git diff
```

#### Pre-push hook not working
```bash
# Check hook exists and is executable
ls -la .git/hooks/pre-push

# Re-install hook
./scripts/setup_pre_push_hook.sh
```

#### Permission denied
```bash
# Fix script permissions
chmod +x scripts/*.sh

# Fix hook permissions  
chmod +x .git/hooks/pre-push
```

### Debug Commands

```bash
# Verbose CI run
bash -x scripts/ci_local.sh

# Test individual components
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
./target/release/schema_validator_v2
```

## Integration with Development Tools

### VS Code Integration
Add to `.vscode/tasks.json`:
```json
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

### Keyboard Shortcuts
```bash
# Add to your shell profile (.bashrc, .zshrc)
alias ci='./scripts/ci_local.sh'
alias ciq='./scripts/ci_local.sh --quiet'  # If implemented
```

## Maintenance

### Keeping Scripts Updated

When GitHub Actions workflows change:
1. Update `ci_local.sh` to match new checks
2. Update tool versions in `setup_ci_toolchain.sh`
3. Test with `./scripts/ci_local.sh` 
4. Update documentation

### Regular Updates
```bash
# Monthly: Update all tools
./scripts/setup_ci_toolchain.sh

# Weekly: Update Rust
rustup update stable

# As needed: Update Node packages
npm update -g @stoplight/spectral-cli
```

## Performance Tips

### Speed Optimization
```bash
# Parallel builds
export CARGO_BUILD_JOBS=8

# Incremental compilation  
export CARGO_INCREMENTAL=1

# Target directory caching
export CARGO_TARGET_DIR=target
```

### Selective Validation
```bash
# Quick formatting + linting only
cargo fmt --all -- --check && cargo clippy --workspace

# Tests only
cargo test --workspace

# Schema validation only
./target/release/schema_validator_v2
```

---

## Summary

**Golden Rule: Never push until `scripts/ci_local.sh` is green! ✅**

These scripts ensure:
- 🚫 **Zero CI failures** on GitHub Actions
- ⚡ **Fast feedback** during development  
- 🔒 **Automatic enforcement** via pre-push hooks
- 🆘 **Emergency flexibility** when needed

**Result: Confident pushes, faster development, happier teams! 🚀**